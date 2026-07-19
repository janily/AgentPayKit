import {
  createOfficialPaymentAdapter,
  createOfficialPaymentChallengeIssuer,
  PaymentReconciler,
  parsePaymentConfig,
  readOfficialPaymentIdentifier,
  type SettlePaymentInput,
} from "@agentpaykit/payment";
import { signCanonical } from "@agentpaykit/protocol";
import {
  D1InvocationRepository,
  EncryptedBlobVault,
  InvocationService,
  InvocationQueueConsumer,
  QuoteService,
  ReconciliationService,
  ReceiptService,
  RecoveryService,
  RuntimeCleanupService,
  SettlementService,
  SuccessPolicy,
  TimedHandlerRunner,
  type D1DatabasePort,
} from "@agentpaykit/runtime-core";
import { Hono } from "hono";

import { createInvocationRoutes } from "./routes/invocations";
import { processInvocationBatch } from "./queue";
import { BaseChainReader } from "./chain";
import { createRecoveryRoutes } from "./routes/recovery";

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

interface ServiceBindingPort {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

interface QueueMessagePort {
  body: unknown;
  ack(): void;
  retry(): void;
}

interface QueueBatchPort {
  messages: QueueMessagePort[];
}

interface RuntimeEnvironment {
  DB?: D1DatabasePort;
  BLOBS?: R2BucketPort;
  INVOCATION_QUEUE?: QueuePort;
  FACILITATOR_URL?: string;
  BLOB_ENCRYPTION_KEY_B64?: string;
  RUNTIME_SIGNING_SEED_B64?: string;
  RUNTIME_SIGNING_KEY_ID?: string;
  RUNTIME_PUBLIC_URL?: string;
  BASE_SEPOLIA_RPC_URL?: string;
  BASE_MAINNET_RPC_URL?: string;
  SKILL_HANDLER?: ServiceBindingPort;
  SUCCESS_POLICY?: ServiceBindingPort;
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
    environment.RUNTIME_SIGNING_KEY_ID &&
    environment.RUNTIME_PUBLIC_URL &&
    environment.BASE_SEPOLIA_RPC_URL &&
    environment.BASE_MAINNET_RPC_URL &&
    environment.SKILL_HANDLER &&
    environment.SUCCESS_POLICY,
  );
}

interface RuntimeServices {
  app: Hono;
  consumer: InvocationQueueConsumer;
  cleanup: RuntimeCleanupService;
}

async function configuredRuntime(
  environment: Required<RuntimeEnvironment>,
): Promise<RuntimeServices> {
  const repository = new D1InvocationRepository(environment.DB);
  const challenge = await createOfficialPaymentChallengeIssuer({
    facilitatorUrl: environment.FACILITATOR_URL,
    resourceUrl: new URL(
      "/v1/invocations",
      environment.RUNTIME_PUBLIC_URL,
    ).toString(),
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
    async get(id: string, target?: "testnet" | "mainnet") {
      const release = await repository.getRelease(id);
      return !target || release?.environment === target ? release : undefined;
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
  const handler = new TimedHandlerRunner<{
    id: string;
    maximumExecutionMs: number;
  }>(async ({ input, invocationId, release }, signal) => {
    const response = await environment.SKILL_HANDLER.fetch(
      "https://skill-handler.internal/invoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invocationId, releaseId: release.id, input }),
        signal,
      },
    );
    if (!response.ok) throw new Error("HANDLER_FAILED");
    return response.json();
  });
  const policy = new SuccessPolicy(
    (candidate) => candidate !== undefined,
    async (candidate) => {
      const response = await environment.SUCCESS_POLICY.fetch(
        "https://success-policy.internal/evaluate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidate }),
        },
      );
      if (!response.ok) {
        return { accepted: false, errorCode: "POLICY_EVALUATION_FAILED" };
      }
      const decision = (await response.json()) as {
        accepted?: unknown;
        errorCode?: unknown;
      };
      return decision.accepted === true
        ? { accepted: true }
        : {
            accepted: false,
            errorCode:
              typeof decision.errorCode === "string"
                ? decision.errorCode
                : "POLICY_OUTPUT_REJECTED",
          };
    },
  );
  const chain = new BaseChainReader({
    sepoliaRpcUrl: environment.BASE_SEPOLIA_RPC_URL,
    mainnetRpcUrl: environment.BASE_MAINNET_RPC_URL,
  });
  const settlementAdapter = async (snapshot: SettlePaymentInput) => {
    const requirements = snapshot.paymentRequirements;
    const adapter = await createOfficialPaymentAdapter({
      config: parsePaymentConfig({
        network: requirements.network,
        amount: requirements.amount,
        asset: requirements.asset,
        payee: requirements.payTo,
        facilitatorUrl: environment.FACILITATOR_URL,
      }),
      method: "POST",
      path: "/v1/invocations",
    });
    return adapter;
  };
  const settlement = new SettlementService({
    settler: {
      async settle(snapshot) {
        const adapter = await settlementAdapter(snapshot);
        return adapter.settle(snapshot);
      },
    },
    chain,
  });
  const receipts = new ReceiptService({
    vault,
    signer: {
      sign: (payload) =>
        signCanonical("runtime-receipt-v1", payload, {
          keyId: environment.RUNTIME_SIGNING_KEY_ID,
          privateKeySeed: signingSeed,
        }),
    },
  });
  const paymentReconciler = new PaymentReconciler({
    chain,
    settler: {
      async settle(snapshot) {
        const adapter = await settlementAdapter(snapshot);
        return adapter.settle(snapshot);
      },
    },
    nowSeconds: () => Math.floor(Date.now() / 1_000),
  });
  const reconciliation = new ReconciliationService({
    repository,
    vault,
    payment: paymentReconciler,
    receipts,
    now: () => new Date(),
  });
  const recovery = new RecoveryService({
    repository,
    vault,
    signer: {
      sign: (payload) =>
        signCanonical(
          typeof payload === "object" && payload !== null && "result" in payload
            ? "runtime-result-v1"
            : "runtime-status-v1",
          payload,
          {
            keyId: environment.RUNTIME_SIGNING_KEY_ID,
            privateKeySeed: signingSeed,
          },
        ),
    },
  });
  const consumer = new InvocationQueueConsumer({
    repository,
    releases,
    vault,
    handler,
    policy,
    settlement,
    receipts,
    reconciliation,
    now: () => new Date(),
  });
  const cleanup = new RuntimeCleanupService({
    repository,
    vault,
    now: () => new Date(),
  });
  const app = createInvocationRoutes({
    quote: quoteService,
    invocation: invocationService,
    traceId: () => randomId("trc_"),
  });
  app.route(
    "/",
    createRecoveryRoutes({
      recovery,
      traceId: () => randomId("trc_"),
    }),
  );
  return {
    app,
    consumer,
    cleanup,
  };
}

function unavailableApp(): Hono {
  const app = new Hono();
  app.get("/health", (context) => context.json({ status: "ok" }));
  app.all("/v1/*", (context) =>
    context.json({ error: "runtime_not_configured" }, 503),
  );
  return app;
}

const runtimeCache = new WeakMap<object, Promise<RuntimeServices>>();

export default {
  async fetch(
    request: Request,
    environment: RuntimeEnvironment,
  ): Promise<Response> {
    if (!isConfigured(environment)) {
      return unavailableApp().fetch(request, environment);
    }
    let runtime = runtimeCache.get(environment);
    if (!runtime) {
      runtime = configuredRuntime(environment);
      runtimeCache.set(environment, runtime);
    }
    return (await runtime).app.fetch(request, environment);
  },
  async queue(
    batch: QueueBatchPort,
    environment: RuntimeEnvironment,
  ): Promise<void> {
    if (!isConfigured(environment)) {
      for (const message of batch.messages) message.retry();
      return;
    }
    let runtime = runtimeCache.get(environment);
    if (!runtime) {
      runtime = configuredRuntime(environment);
      runtimeCache.set(environment, runtime);
    }
    await processInvocationBatch(batch, (await runtime).consumer);
  },
  async scheduled(
    _controller: unknown,
    environment: RuntimeEnvironment,
  ): Promise<void> {
    if (!isConfigured(environment)) return;
    let runtime = runtimeCache.get(environment);
    if (!runtime) {
      runtime = configuredRuntime(environment);
      runtimeCache.set(environment, runtime);
    }
    await (await runtime).cleanup.run();
  },
};

export { createInvocationRoutes } from "./routes/invocations";
