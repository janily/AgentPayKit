import { request } from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import { LoopbackBridgeServer } from "./loopback-server";

const display = {
  invocationId: "inv_01J00000000000000000000000",
  inputDigest: `sha256:${"a".repeat(64)}`,
  amount: "10000",
  payee: `0x${"b".repeat(40)}`,
  network: "eip155:84532",
  releaseId: `rel_${"c".repeat(64)}`,
  dataDisclosure: "Input is sent only to the selected skill runtime.",
  paymentRequired: "official-challenge",
} as const;

function post(input: {
  port: number;
  path: string;
  host?: string;
  origin?: string;
  body: unknown;
}): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(input.body);
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: input.port,
        path: input.path,
        method: "POST",
        headers: {
          host: input.host ?? `127.0.0.1:${input.port}`,
          origin: input.origin ?? `http://127.0.0.1:${input.port}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
          }),
        );
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

describe("LoopbackBridgeServer security", () => {
  let server: LoopbackBridgeServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  test("accepts the token only in a same-origin POST body and rejects replay", async () => {
    server = await LoopbackBridgeServer.start({ platform: "darwin" });
    const session = server.createSession(display);

    await expect(
      post({
        port: server.port,
        path: `/api/sessions/${session.id}/approve`,
        body: { token: session.token, paymentSignature: "official-payload" },
      }),
    ).resolves.toMatchObject({ status: 204 });
    await expect(session.completion).resolves.toEqual({
      state: "approved",
      paymentSignature: "official-payload",
    });
    await expect(
      post({
        port: server.port,
        path: `/api/sessions/${session.id}/approve`,
        body: { token: session.token, paymentSignature: "official-payload" },
      }),
    ).resolves.toMatchObject({ status: 409 });
  });

  test("resolves a pending approval as rejected when the server closes", async () => {
    server = await LoopbackBridgeServer.start({ platform: "darwin" });
    const session = server.createSession(display);

    await server.close();
    server = undefined;

    await expect(session.completion).resolves.toEqual({
      state: "rejected",
      reason: "closed",
    });
  });

  test("rejects non-loopback Host, wrong Origin, CSRF, and URL tokens", async () => {
    server = await LoopbackBridgeServer.start({ platform: "darwin" });
    const session = server.createSession(display);
    const path = `/api/sessions/${session.id}/approve`;

    for (const attempt of [
      { host: `localhost:${server.port}`, body: { token: session.token } },
      { origin: "https://attacker.test", body: { token: session.token } },
      { body: {} },
      {
        path: `${path}?token=${session.token}`,
        body: { token: session.token },
      },
    ]) {
      const response = await post({
        port: server.port,
        path: attempt.path ?? path,
        host: attempt.host,
        origin: attempt.origin,
        body: attempt.body,
      });
      expect(response.status).toBe(403);
    }
  });

  test("serves strict local-only CSP without exposing raw input", async () => {
    server = await LoopbackBridgeServer.start({ platform: "darwin" });
    const session = server.createSession(display);
    const response = await fetch(
      `http://127.0.0.1:${server.port}/sessions/${session.id}`,
    );
    const html = await response.text();

    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(html).toContain(display.inputDigest);
    expect(html).toContain(display.releaseId);
    expect(html).not.toContain("rawInput");
    expect(html).not.toContain("private research prompt");
  });

  test("refuses to start outside macOS", async () => {
    await expect(
      LoopbackBridgeServer.start({ platform: "linux" }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_PLATFORM" });
  });
});
