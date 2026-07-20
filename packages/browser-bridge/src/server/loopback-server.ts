import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";

import { bridgeContentSecurityPolicy } from "./csp";
import {
  BridgeSessionError,
  SessionStore,
  type BridgeDisplayRequest,
} from "./session-store";

function htmlJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.byteLength;
    if (size > 16_384) throw new BridgeSessionError("REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BridgeSessionError("INVALID_REQUEST_BODY");
  }
  return parsed as Record<string, unknown>;
}

function end(response: ServerResponse, status: number): void {
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.end();
}

export class LoopbackBridgeServer {
  readonly store: SessionStore;
  readonly port: number;
  readonly origin: string;
  private readonly expiryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private constructor(
    private readonly server: ReturnType<typeof createServer>,
    port: number,
    store: SessionStore,
    private readonly staticRoot: URL | undefined,
    private readonly staticAssets: Readonly<
      Record<string, string | Uint8Array>
    >,
  ) {
    this.port = port;
    this.origin = `http://127.0.0.1:${port}`;
    this.store = store;
  }

  static async start(
    options: {
      store?: SessionStore;
      staticRoot?: URL;
      staticAssets?: Readonly<Record<string, string | Uint8Array>>;
      platform?: NodeJS.Platform;
    } = {},
  ): Promise<LoopbackBridgeServer> {
    if ((options.platform ?? process.platform) !== "darwin") {
      throw new BridgeSessionError("UNSUPPORTED_PLATFORM");
    }
    const store = options.store ?? new SessionStore();
    let bridge: LoopbackBridgeServer | undefined;
    const server = createServer((request, response) => {
      void bridge?.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("LOOPBACK_BIND_FAILED");
    }
    bridge = new LoopbackBridgeServer(
      server,
      address.port,
      store,
      options.staticRoot ??
        (options.staticAssets
          ? undefined
          : new URL("../../dist/", import.meta.url)),
      options.staticAssets ?? {},
    );
    return bridge;
  }

  createSession(display: BridgeDisplayRequest): {
    id: string;
    token: string;
    url: string;
    completion: ReturnType<SessionStore["create"]>["completion"];
  } {
    const session = this.store.create(display);
    const timer = setTimeout(() => {
      this.expiryTimers.delete(session.id);
      this.store.close(session.id);
    }, this.store.ttlMs + 1);
    timer.unref();
    this.expiryTimers.set(session.id, timer);
    void session.completion.then(() => {
      const pending = this.expiryTimers.get(session.id);
      if (pending) clearTimeout(pending);
      this.expiryTimers.delete(session.id);
    });
    return {
      ...session,
      url: `${this.origin}/sessions/${session.id}`,
    };
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const expectedHost = `127.0.0.1:${this.port}`;
      const url = new URL(request.url ?? "/", this.origin);
      if (
        request.socket.remoteAddress !== "127.0.0.1" ||
        request.headers.host !== expectedHost ||
        [...url.searchParams.keys()].some((key) =>
          /token|secret|key/i.test(key),
        )
      ) {
        return end(response, 403);
      }

      const page = url.pathname.match(/^\/sessions\/([A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && page) {
        const session = this.store.view(page[1]!);
        const nonce = crypto.randomUUID().replace(/-/g, "");
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.setHeader("referrer-policy", "no-referrer");
        response.setHeader(
          "content-security-policy",
          bridgeContentSecurityPolicy(nonce),
        );
        response.end(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgentPayKit approval</title><link rel="stylesheet" href="/assets/bridge.css"></head><body><div id="root"></div><script nonce="${nonce}">window.__AGENTPAY_BRIDGE__=${htmlJson({ id: session.id, token: session.token, request: session.display })}</script><script type="module" src="/assets/bridge.js"></script></body></html>`,
        );
        return;
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/assets/bridge.js" ||
          url.pathname === "/assets/bridge.css")
      ) {
        const filename = url.pathname.endsWith(".js")
          ? "assets/bridge.js"
          : "assets/bridge.css";
        const content =
          this.staticAssets[filename] ??
          (this.staticRoot
            ? await readFile(new URL(filename, this.staticRoot))
            : undefined);
        if (content === undefined) throw new Error("BRIDGE_ASSET_MISSING");
        response.statusCode = 200;
        response.setHeader(
          "content-type",
          filename.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "text/css; charset=utf-8",
        );
        response.setHeader("cache-control", "no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.end(content);
        return;
      }

      const action = url.pathname.match(
        /^\/api\/sessions\/([A-Za-z0-9_-]+)\/(approve|reject|close)$/,
      );
      if (request.method !== "POST" || !action) return end(response, 404);
      if (
        request.headers.origin !== this.origin ||
        !String(request.headers["content-type"] ?? "").startsWith(
          "application/json",
        )
      ) {
        return end(response, 403);
      }
      const body = await readJson(request);
      if (typeof body.token !== "string") return end(response, 403);
      if (
        action[2] === "approve" &&
        typeof body.paymentSignature !== "string"
      ) {
        return end(response, 400);
      }
      this.store.consume(
        action[1]!,
        body.token,
        action[2] === "approve" ? "approved" : "rejected",
        typeof body.paymentSignature === "string"
          ? body.paymentSignature
          : undefined,
      );
      end(response, 204);
    } catch (error) {
      end(response, error instanceof BridgeSessionError ? 409 : 400);
    }
  }

  async close(): Promise<void> {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.store.destroyAll();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
