import {
  createOfficialPaymentAdapter,
  createOfficialPaymentChallengeIssuer,
  parsePaymentConfig,
  readOfficialPaymentIdentifier,
} from "@agentpaykit/payment";
import { signCanonical } from "@agentpaykit/protocol";
import {
  D1InvocationRepository,
  EncryptedBlobVault,
  InvocationService,
  QuoteService,
  type D1DatabasePort,
} from "@agentpaykit/runtime-core";
import { Hono } from "hono";

import { createInvocationRoutes } from "./routes/invocations";

interface R2ObjectPort {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2BucketPort {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<R2ObjectPort | null>;
  delete(key: string): Promise<unknown>;
}

interface QueuePort {
  send(value: unknown): Promise<unknown>;
}

interface RuntimeEnvironment {
  DB?: D1DatabasePort;
  BLOBS?: R2BucketPort;
  INVOCATION_QUEUE?: QueuePort;
  FACILITATOR_URL?: string;
  BLOB_ENCRYPTION_KEY_B64?: string;
  RUNTIME_SIGNING_SEED_B64?: string;
  RUNTIME_SIGNING_KEY_ID?: string;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomId(prefix: "qte_" | "trc_"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  return `${prefix}${Array.from(bytes, (byte) => CROCKFORD[byte % CROCKFORD.length]).join("")}`;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) =>
    character.charCodeAt(0),
  );
}

function isConfigured(
  environment: RuntimeEnvironment,
): environment is Required<RuntimeEnvironment> {
  return Boolean(
    environment.DB &&
    environment.BLOBS &&
    environment.INVOCATION_QUEUE &&
    environment.FACILITATOR_URL &&
    environment.BLOB_ENCRYPTION_KEY_B64 &&
    environment.RUNTIME_SIGNING_SEED_B64 &&
    environment.RUNTIME_SIGNING_KEY_ID,
  );
}

async function configuredApp(
  environment: Required<RuntimeEnvironment>,
  origin: string,
): Promise<Hono> {
  const repository = new D1InvocationRepository(environment.DB);
  const challenge = await createOfficialPaymentChallengeIssuer({
    facilitatorUrl: environment.FACILITATOR_URL,
    resourceUrl: new URL("/v1/invocations", origin).toString(),
  });
  const encryptionKey = decodeBase64(environment.BLOB_ENCRYPTION_KEY_B64);
  const signingSeed = decodeBase64(environment.RUNTIME_SIGNING_SEED_B64);
  const vault = new EncryptedBlobVault({
    bucket: {
      put: (key, value) => environment.BLOBS.put(key, value),
      async get(key) {
        const object = await environment.BLOBS.get(key);
        return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
      },
      delete: (key) => environment.BLOBS.delete(key),
    },
    keyring: {
      current: async () => ({ version: "v1", key: encryptionKey }),
      byVersion: async (version) => {
        if (version !== "v1") throw new Error("unknown blob key version");
        return encryptionKey;
      },
    },
  });
  const releases = {
    async get(id: string, target: "testnet" | "mainnet") {
      const release = await repository.getRelease(id);
      return release?.environment === target ? release : undefined;
    },
  };
  const quoteService = new QuoteService({
    releases,
    quotes: {
      create: (quote) =>
        repository.createQuote({
          id: quote.quoteId,
          invocationId: quote.invocationId,
          releaseId: quote.releaseId,
          inputDigest: quote.inputDigest,
          environment: quote.environment,
          expiresAt: quote.expiresAt,
          now: quote.issuedAt,
        }),
    },
    challenge,
    signer: {
      sign: (payload) =>
        signCanonical("runtime-quote-v1", payload, {
          keyId: environment.RUNTIME_SIGNING_KEY_ID,
          privateKeySeed: signingSeed,
        }),
    },
    quoteId: () => randomId("qte_"),
    now: () => new Date(),
  });
  const invocationService = new InvocationService({
    releases,
    quotes: { get: (id) => repository.getQuote(id) },
    paymentIdentifier: { read: readOfficialPaymentIdentifier },
    payment: {
      async verify(input, release) {
        const adapter = await createOfficialPaymentAdapter({
          config: parsePaymentConfig({
            network: release.network,
            amount: release.amount,
            asset: release.asset,
            payee: release.payee,
            facilitatorUrl: environment.FACILITATOR_URL,
          }),
          method: "POST",
          path: "/v1/invocations",
        });
        return adapter.verify(input);
      },
    },
    vault,
    repository,
    queue: environment.INVOCATION_QUEUE,
    signer: {
      sign: (payload) =>
        signCanonical("runtime-status-v1", payload, {
          keyId: environment.RUNTIME_SIGNING_KEY_ID,
          privateKeySeed: signingSeed,
        }),
    },
    now: () => new Date(),
    traceId: () => randomId("trc_"),
  });
  return createInvocationRoutes({
    quote: quoteService,
    invocation: invocationService,
    traceId: () => randomId("trc_"),
  });
}

function unavailableApp(): Hono {
  const app = new Hono();
  app.get("/health", (context) => context.json({ status: "ok" }));
  app.all("/v1/*", (context) =>
    context.json({ error: "runtime_not_configured" }, 503),
  );
  return app;
}

const appCache = new WeakMap<object, Promise<Hono>>();

export default {
  async fetch(
    request: Request,
    environment: RuntimeEnvironment,
  ): Promise<Response> {
    if (!isConfigured(environment)) {
      return unavailableApp().fetch(request, environment);
    }
    let app = appCache.get(environment);
    if (!app) {
      app = configuredApp(environment, new URL(request.url).origin);
      appCache.set(environment, app);
    }
    return (await app).fetch(request, environment);
  },
};

export { createInvocationRoutes } from "./routes/invocations";
