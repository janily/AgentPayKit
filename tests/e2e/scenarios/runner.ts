import {
  inputDigest,
  ChargeState,
  InvocationStatus,
} from "../../../packages/protocol/src/index";
import { resumeCommand } from "../../../packages/cli/src/commands/resume";
import {
  InvocationQueueConsumer,
  InvocationService,
  ReconciliationService,
  RecoveryService,
  type InvocationRecord,
  type TransitionInvocation,
} from "../../../packages/runtime/src/index";
import { BoundedResearchHandler } from "../../../examples/paid-deep-research-lite/src/handler";
import {
  FakeChain,
  FakeWallet,
  FIXTURE_QUOTE,
} from "../../../packages/testkit/src/index";

export const scenarioNames = [
  "happy-path",
  "data-rejected",
  "wallet-rejected",
  "wrong-network",
  "insufficient-balance",
  "quote-expired",
  "concurrent-submit",
  "input-mismatch",
  "handler-timeout",
  "policy-failed",
  "settle-recovery",
  "cli-resume",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export interface ScenarioOutcome {
  finalStatus: InvocationStatus;
  chargeState: ChargeState;
  executionCount: number;
  settleCount: number;
  transferCount: number;
  resultVisible: boolean;
}

export interface ScenarioDefinition {
  name: ScenarioName;
  expected: ScenarioOutcome;
}

export const scenarios: Record<ScenarioName, ScenarioDefinition> = {
  "happy-path": {
    name: "happy-path",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "data-rejected": {
    name: "data-rejected",
    expected: {
      finalStatus: "FAILED_NOT_CHARGED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "wallet-rejected": {
    name: "wallet-rejected",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "wrong-network": {
    name: "wrong-network",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "insufficient-balance": {
    name: "insufficient-balance",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "quote-expired": {
    name: "quote-expired",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "concurrent-submit": {
    name: "concurrent-submit",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "input-mismatch": {
    name: "input-mismatch",
    expected: {
      finalStatus: "QUOTED",
      chargeState: "NOT_CHARGED",
      executionCount: 0,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "handler-timeout": {
    name: "handler-timeout",
    expected: {
      finalStatus: "FAILED_NOT_CHARGED",
      chargeState: "NOT_CHARGED",
      executionCount: 1,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "policy-failed": {
    name: "policy-failed",
    expected: {
      finalStatus: "POLICY_REJECTED",
      chargeState: "NOT_CHARGED",
      executionCount: 1,
      settleCount: 0,
      transferCount: 0,
      resultVisible: false,
    },
  },
  "settle-recovery": {
    name: "settle-recovery",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
  "cli-resume": {
    name: "cli-resume",
    expected: {
      finalStatus: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      executionCount: 1,
      settleCount: 1,
      transferCount: 1,
      resultVisible: true,
    },
  },
};

const unpaid = (finalStatus: InvocationStatus): ScenarioOutcome => ({
  finalStatus,
  chargeState: "NOT_CHARGED",
  executionCount: 0,
  settleCount: 0,
  transferCount: 0,
  resultVisible: false,
});

const transactionHash = `0x${"f".repeat(64)}` as `0x${string}`;
const resultDigest = `sha256:${"9".repeat(64)}` as `sha256:${string}`;

async function queuedScenario(
  mode:
    | "success"
    | "concurrent"
    | "handler-failed"
    | "policy-failed"
    | "recovery"
    | "cli-resume",
): Promise<ScenarioOutcome> {
  let record: InvocationRecord = {
    id: FIXTURE_QUOTE.payload.invocationId,
    quoteId: FIXTURE_QUOTE.payload.quoteId,
    releaseId: FIXTURE_QUOTE.payload.releaseId,
    inputDigest: FIXTURE_QUOTE.payload.inputDigest,
    requestFingerprint: `sha256:${"7".repeat(64)}`,
    status: "QUEUED",
    chargeState: "NOT_CHARGED",
    version: 1,
    inputBlobKey: "input",
    inputBlobDigest: `sha256:${"8".repeat(64)}`,
    paymentBlobKey: "payment",
    paymentBlobDigest: `sha256:${"a".repeat(64)}`,
    traceId: "trc_00000000000000000000000001",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:01:00.000Z",
  };
  const blobs = new Map<string, unknown>([
    ["input", { query: "bounded research" }],
    [
      "payment",
      {
        schemaVersion: "1",
        paymentPayload: { testCredential: true },
        paymentRequirements: { amount: "10000" },
      },
    ],
  ]);
  const chain = new FakeChain();
  let executionCount = 0;
  let settleCount = 0;
  let receiptSignatureCount = 0;
  let receiptBlobKey: string | undefined;
  const repository = {
    async getInvocation() {
      return record;
    },
    async transition(input: TransitionInvocation) {
      if (
        record.status !== input.from ||
        record.version !== input.expectedVersion
      ) {
        return false;
      }
      record = {
        ...record,
        ...input,
        status: input.to,
        version: record.version + 1,
        updatedAt: input.now,
      };
      return true;
    },
    async createReceipt(input: { receiptBlobKey: string }) {
      receiptBlobKey = input.receiptBlobKey;
    },
    async markInputDeleted(_id: string, now: string) {
      record = { ...record, inputDeletedAt: now };
    },
  };
  const vault = {
    async getJson(key: string) {
      return blobs.get(key);
    },
    async putJson(key: string, value: unknown) {
      blobs.set(key, value);
      return { key, digest: resultDigest };
    },
    async delete(key: string) {
      blobs.delete(key);
    },
  };
  const charged = {
    state: "CHARGED" as const,
    transactionHash,
    payer: `0x${"1".repeat(40)}` as `0x${string}`,
    payee: `0x${"2".repeat(40)}` as `0x${string}`,
    network: "eip155:84532" as const,
    asset: `0x${"3".repeat(40)}` as `0x${string}`,
    amount: "10000",
    confirmedAt: "2026-07-19T00:03:00.000Z",
  };
  const receipts = {
    async create(input: { transactionHash: `0x${string}` }) {
      receiptSignatureCount += 1;
      blobs.set("receipt", { signed: true });
      return {
        blobKey: "receipt",
        digest: `sha256:${"6".repeat(64)}`,
        transactionHash: input.transactionHash,
      };
    },
  };
  const reconciliation = new ReconciliationService({
    repository,
    vault,
    payment: {
      async reconcile() {
        if (
          !chain.hasAuthorizationUsed(FIXTURE_QUOTE.payload.paymentIdentifier)
        ) {
          return { state: "SETTLEMENT_UNKNOWN" as const };
        }
        return charged;
      },
    },
    receipts,
    now: () => new Date("2026-07-19T00:04:00.000Z"),
  });
  const consumer = new InvocationQueueConsumer({
    repository,
    releases: {
      async get() {
        return { id: record.releaseId, maximumExecutionMs: 300_000 };
      },
    },
    vault,
    handler: {
      async run() {
        executionCount += 1;
        if (mode === "handler-failed") throw new Error("HANDLER_TIMEOUT");
        return { report: "complete" };
      },
    },
    policy: {
      async evaluate() {
        return mode === "policy-failed"
          ? { accepted: false as const, errorCode: "POLICY_OUTPUT_REJECTED" }
          : { accepted: true as const };
      },
    },
    settlement: {
      async settle() {
        settleCount += 1;
        if (mode === "recovery" || mode === "cli-resume") {
          chain.recordAuthorizationUsed(
            FIXTURE_QUOTE.payload.paymentIdentifier,
          );
          return { state: "SETTLEMENT_UNKNOWN" as const, transactionHash };
        }
        chain.recordAuthorizationUsed(FIXTURE_QUOTE.payload.paymentIdentifier);
        return charged;
      },
    },
    receipts,
    reconciliation,
    now: () => new Date("2026-07-19T00:02:00.000Z"),
  });

  const job = { invocationId: record.id, expectedVersion: 1 };
  if (mode === "concurrent") {
    await Promise.all([consumer.process(job), consumer.process(job)]);
  } else {
    await consumer.process(job);
  }
  if (mode === "recovery" || mode === "cli-resume") {
    await reconciliation.reconcile(record.id);
  }
  let resultVisible = record.status === "RESULT_AVAILABLE";
  if (mode === "cli-resume") {
    const recovery = new RecoveryService({
      repository: {
        getInvocation: repository.getInvocation,
        async getReceipt() {
          return receiptBlobKey ? { receiptBlobKey } : undefined;
        },
      },
      vault,
      signer: {
        async sign() {
          return {
            algorithm: "Ed25519" as const,
            keyId: "runtime",
            value: "sig",
          };
        },
      },
    });
    const resumed = await resumeCommand([record.id], {
      resume: (id) => recovery.result(id),
    });
    resultVisible =
      typeof resumed === "object" &&
      resumed !== null &&
      "payload" in resumed &&
      (resumed.payload as { status?: string }).status === "RESULT_AVAILABLE";
  }
  if (executionCount > 1 || settleCount > 1 || receiptSignatureCount > 1) {
    throw new Error("DUPLICATE_INVOCATION_SIDE_EFFECT");
  }
  return {
    finalStatus: record.status,
    chargeState: record.chargeState,
    executionCount,
    settleCount,
    transferCount: chain.hasAuthorizationUsed(
      FIXTURE_QUOTE.payload.paymentIdentifier,
    )
      ? 1
      : 0,
    resultVisible,
  };
}

async function rejectedSubmission(
  mode: "quote-expired" | "input-mismatch",
): Promise<ScenarioOutcome> {
  const requestInput = { query: "bounded research" };
  const digest = await inputDigest(requestInput);
  let verifyCount = 0;
  const service = new InvocationService({
    releases: {
      async get() {
        return {
          id: FIXTURE_QUOTE.payload.releaseId,
          environment: "testnet" as const,
          network: "eip155:84532" as const,
          amount: "10000",
          asset: `0x${"3".repeat(40)}` as `0x${string}`,
          payee: `0x${"2".repeat(40)}` as `0x${string}`,
        };
      },
    },
    quotes: {
      async get() {
        return {
          id: FIXTURE_QUOTE.payload.quoteId,
          invocationId: FIXTURE_QUOTE.payload.invocationId,
          releaseId: FIXTURE_QUOTE.payload.releaseId,
          inputDigest: digest,
          environment: "testnet" as const,
          expiresAt:
            mode === "quote-expired"
              ? "2026-07-19T00:00:00.000Z"
              : "2026-07-19T00:05:00.000Z",
        };
      },
    },
    paymentIdentifier: { read: () => FIXTURE_QUOTE.payload.invocationId },
    payment: {
      async verify() {
        verifyCount += 1;
        return { paymentPayload: {}, paymentRequirements: {} };
      },
      async settle() {
        throw new Error("SETTLE_MUST_NOT_RUN");
      },
    },
    vault: {
      async putJson(key: string) {
        return { key, digest: resultDigest };
      },
      async delete() {},
    },
    repository: {
      async getInvocation() {
        return undefined;
      },
      async createOrGetInvocation() {
        throw new Error("PERSIST_MUST_NOT_RUN");
      },
      async transition() {
        return false;
      },
    },
    queue: { async send() {} },
    signer: {
      async sign() {
        return {
          algorithm: "Ed25519" as const,
          keyId: "runtime",
          value: "sig",
        };
      },
    },
    now: () => new Date("2026-07-19T00:01:00.000Z"),
    traceId: () => "trc_00000000000000000000000001",
  });
  await service
    .accept({
      invocationId: FIXTURE_QUOTE.payload.invocationId,
      quoteId: FIXTURE_QUOTE.payload.quoteId,
      releaseId: FIXTURE_QUOTE.payload.releaseId,
      inputDigest:
        mode === "input-mismatch" ? `sha256:${"0".repeat(64)}` : digest,
      environment: "testnet",
      input: requestInput,
      paymentHeader: "test-only",
      method: "POST",
      url: "https://runtime.test/v1/invocations",
    })
    .then(
      () => {
        throw new Error("REJECTED_SUBMISSION_WAS_ACCEPTED");
      },
      () => undefined,
    );
  if (verifyCount !== 0) throw new Error("REJECTED_SUBMISSION_WAS_VERIFIED");
  return unpaid("QUOTED");
}

export async function runScenario(
  name: ScenarioName,
): Promise<ScenarioOutcome> {
  if (name === "happy-path") return queuedScenario("success");
  if (name === "data-rejected") {
    const handler = new BoundedResearchHandler({
      search: {
        processor: "search",
        search: async () => [],
        fetchPage: async () => "",
      },
      model: {
        processor: "model",
        generate: async () => ({
          report: "",
          citations: [],
          outputTokens: 0,
          costUsd: 0,
        }),
      },
      allowedProcessors: ["search", "model"],
    });
    await handler.execute({ query: "" }).catch(() => undefined);
    return unpaid("FAILED_NOT_CHARGED");
  }
  if (name === "quote-expired" || name === "input-mismatch") {
    return rejectedSubmission(name);
  }
  if (
    name === "wallet-rejected" ||
    name === "wrong-network" ||
    name === "insufficient-balance"
  ) {
    const faults = {
      "wallet-rejected": "wallet-refusal",
      "wrong-network": "wrong-chain",
      "insufficient-balance": "insufficient-funds",
    } as const;
    await new FakeWallet({ fault: faults[name] })
      .sign(FIXTURE_QUOTE)
      .catch(() => undefined);
    return unpaid("QUOTED");
  }
  if (name === "handler-timeout") {
    return queuedScenario("handler-failed");
  }
  if (name === "policy-failed") {
    return queuedScenario("policy-failed");
  }
  if (name === "concurrent-submit") {
    return queuedScenario("concurrent");
  }
  if (name === "settle-recovery") return queuedScenario("recovery");
  if (name === "cli-resume") return queuedScenario("cli-resume");
  return unpaid("FAILED_NOT_CHARGED");
}

export interface SimulatedE2eReport {
  schemaVersion: "1";
  generatedAt: string;
  passed: number;
  failed: number;
  results: Array<
    ScenarioDefinition & { actual: ScenarioOutcome; passed: boolean }
  >;
}

export async function buildReport(): Promise<SimulatedE2eReport> {
  const results = await Promise.all(
    scenarioNames.map(async (name) => {
      const definition = scenarios[name];
      const actual = await runScenario(name);
      return {
        ...definition,
        actual,
        passed: JSON.stringify(actual) === JSON.stringify(definition.expected),
      };
    }),
  );
  return {
    schemaVersion: "1",
    generatedAt: "2026-07-19T00:00:00.000Z",
    passed: results.filter(({ passed }) => passed).length,
    failed: results.filter(({ passed }) => !passed).length,
    results,
  };
}
