import type { InvocationRecord, TransitionInvocation } from "./repository";
import type {
  SettlementOutcome,
  VerifiedPaymentSnapshot,
} from "./settlement-service";
import type { SuccessPolicyDecision } from "./success-policy";

export interface InvocationJob {
  invocationId: string;
  expectedVersion: number;
}

interface ReleaseExecutionRecord {
  id: string;
  maximumExecutionMs: number;
}

interface ReceiptInput {
  invocationId: string;
  releaseId: string;
  inputDigest: string;
  payer: `0x${string}`;
  payee: `0x${string}`;
  network: "eip155:84532" | "eip155:8453";
  asset: `0x${string}`;
  amount: string;
  transactionHash: `0x${string}`;
  executionStartedAt: string;
  executedAt: string;
  settledAt: string;
  resultDigest: `sha256:${string}`;
}

function paymentSnapshot(value: unknown): VerifiedPaymentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("INVALID_PAYMENT_SNAPSHOT");
  }
  const snapshot = value as Partial<VerifiedPaymentSnapshot>;
  if (
    snapshot.schemaVersion !== "1" ||
    typeof snapshot.paymentPayload !== "object" ||
    snapshot.paymentPayload === null ||
    typeof snapshot.paymentRequirements !== "object" ||
    snapshot.paymentRequirements === null
  ) {
    throw new Error("INVALID_PAYMENT_SNAPSHOT");
  }
  return snapshot as VerifiedPaymentSnapshot;
}

export class InvocationQueueConsumer {
  constructor(
    private readonly ports: {
      repository: {
        getInvocation(id: string): Promise<InvocationRecord | undefined>;
        transition(input: TransitionInvocation): Promise<boolean>;
        createReceipt(input: {
          invocationId: string;
          receiptBlobKey: string;
          receiptDigest: string;
          transactionHash: string;
          now: string;
        }): Promise<void>;
      };
      releases: {
        get(id: string): Promise<ReleaseExecutionRecord | undefined>;
      };
      vault: {
        getJson(key: string): Promise<unknown>;
        putJson(
          key: string,
          value: unknown,
        ): Promise<{ key: string; digest: string }>;
        delete(key: string): Promise<unknown>;
      };
      handler: {
        run(
          input: {
            invocationId: string;
            input: unknown;
            release: ReleaseExecutionRecord;
          },
          maximumExecutionMs: number,
        ): Promise<unknown>;
      };
      policy: {
        evaluate(candidate: unknown): Promise<SuccessPolicyDecision>;
      };
      settlement: {
        settle(snapshot: VerifiedPaymentSnapshot): Promise<SettlementOutcome>;
      };
      receipts: {
        create(input: ReceiptInput): Promise<{
          blobKey: string;
          digest: string;
          transactionHash: string;
        }>;
      };
      reconciliation: { reconcile(invocationId: string): Promise<unknown> };
      now(): Date;
    },
  ) {}

  async process(
    job: InvocationJob,
  ): Promise<"processed" | "duplicate" | "reconcile"> {
    const invocation = await this.ports.repository.getInvocation(
      job.invocationId,
    );
    if (!invocation) return "duplicate";
    if (
      invocation.status === "SETTLING" ||
      invocation.status === "SETTLEMENT_UNKNOWN"
    ) {
      await this.ports.reconciliation.reconcile(job.invocationId);
      return "reconcile";
    }
    if (
      invocation.status !== "QUEUED" ||
      invocation.version !== job.expectedVersion
    ) {
      return "duplicate";
    }

    const executionStartedAt = this.ports.now().toISOString();
    const claimed = await this.ports.repository.transition({
      id: invocation.id,
      from: "QUEUED",
      to: "EXECUTING",
      expectedVersion: invocation.version,
      now: executionStartedAt,
    });
    if (!claimed) return "duplicate";
    let version = invocation.version + 1;
    const release = await this.ports.releases.get(invocation.releaseId);
    if (!release) {
      await this.ports.repository.transition({
        id: invocation.id,
        from: "EXECUTING",
        to: "EXECUTION_FAILED",
        expectedVersion: version,
        now: this.ports.now().toISOString(),
        errorCode: "RELEASE_NOT_FOUND",
      });
      return "processed";
    }

    const rawInput = await this.ports.vault.getJson(invocation.inputBlobKey);
    let candidate: unknown;
    try {
      candidate = await this.ports.handler.run(
        { invocationId: invocation.id, input: rawInput, release },
        release.maximumExecutionMs,
      );
    } catch {
      await this.ports.vault.delete(invocation.inputBlobKey);
      await this.ports.repository.transition({
        id: invocation.id,
        from: "EXECUTING",
        to: "EXECUTION_FAILED",
        expectedVersion: version,
        now: this.ports.now().toISOString(),
        errorCode: "HANDLER_FAILED",
      });
      return "processed";
    }
    const executedAt = this.ports.now().toISOString();
    await this.ports.vault.delete(invocation.inputBlobKey);

    let policy: SuccessPolicyDecision;
    try {
      policy = await this.ports.policy.evaluate(candidate);
    } catch {
      policy = { accepted: false, errorCode: "POLICY_EVALUATION_FAILED" };
    }
    if (!policy.accepted) {
      await this.ports.repository.transition({
        id: invocation.id,
        from: "EXECUTING",
        to: "POLICY_REJECTED",
        expectedVersion: version,
        now: this.ports.now().toISOString(),
        errorCode: policy.errorCode,
      });
      return "processed";
    }

    const candidateBlob = await this.ports.vault.putJson(
      `${invocation.id}/result/candidate`,
      candidate,
    );
    const ready = await this.ports.repository.transition({
      id: invocation.id,
      from: "EXECUTING",
      to: "READY_TO_SETTLE",
      expectedVersion: version,
      now: this.ports.now().toISOString(),
      candidateResultBlobKey: candidateBlob.key,
      resultDigest: candidateBlob.digest,
    });
    if (!ready) return "duplicate";
    version += 1;
    const settling = await this.ports.repository.transition({
      id: invocation.id,
      from: "READY_TO_SETTLE",
      to: "SETTLING",
      expectedVersion: version,
      now: this.ports.now().toISOString(),
    });
    if (!settling) return "duplicate";
    version += 1;

    const snapshot = paymentSnapshot(
      await this.ports.vault.getJson(invocation.paymentBlobKey),
    );
    const settlement = await this.ports.settlement.settle(snapshot);
    if (settlement.state !== "CHARGED") {
      await this.ports.repository.transition({
        id: invocation.id,
        from: "SETTLING",
        to: "SETTLEMENT_UNKNOWN",
        expectedVersion: version,
        now: this.ports.now().toISOString(),
        chargeState:
          settlement.state === "SETTLEMENT_UNKNOWN"
            ? "SETTLEMENT_UNKNOWN"
            : "NOT_CHARGED",
        ...(settlement.state === "NOT_CHARGED"
          ? { errorCode: settlement.errorCode }
          : {}),
      });
      return "processed";
    }

    const receipt = await this.ports.receipts.create({
      invocationId: invocation.id,
      releaseId: invocation.releaseId,
      inputDigest: invocation.inputDigest,
      payer: settlement.payer,
      payee: settlement.payee,
      network: settlement.network,
      asset: settlement.asset,
      amount: settlement.amount,
      transactionHash: settlement.transactionHash,
      executionStartedAt,
      executedAt,
      settledAt: settlement.confirmedAt,
      resultDigest: candidateBlob.digest as `sha256:${string}`,
    });
    await this.ports.repository.createReceipt({
      invocationId: invocation.id,
      receiptBlobKey: receipt.blobKey,
      receiptDigest: receipt.digest,
      transactionHash: receipt.transactionHash,
      now: settlement.confirmedAt,
    });
    await this.ports.repository.transition({
      id: invocation.id,
      from: "SETTLING",
      to: "RESULT_AVAILABLE",
      expectedVersion: version,
      now: settlement.confirmedAt,
      chargeState: "CHARGED",
      resultBlobKey: candidateBlob.key,
      resultDigest: candidateBlob.digest,
      transactionHash: settlement.transactionHash,
    });
    return "processed";
  }
}
