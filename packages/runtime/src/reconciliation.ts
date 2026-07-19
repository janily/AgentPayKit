import type { InvocationRecord, TransitionInvocation } from "./repository";
import type { VerifiedPaymentSnapshot } from "./settlement-service";

type ReconciliationOutcome =
  | { state: "SETTLEMENT_UNKNOWN" }
  | { state: "NOT_CHARGED"; errorCode: string }
  | {
      state: "CHARGED";
      transactionHash: `0x${string}`;
      payer: `0x${string}`;
      payee: `0x${string}`;
      network: "eip155:84532" | "eip155:8453";
      asset: `0x${string}`;
      amount: string;
      confirmedAt: string;
    };

export class ReconciliationService {
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
      vault: { getJson(key: string): Promise<unknown> };
      payment: {
        reconcile(input: {
          snapshot: VerifiedPaymentSnapshot;
          transactionHash?: string;
        }): Promise<ReconciliationOutcome>;
      };
      receipts: {
        create(input: {
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
        }): Promise<{
          blobKey: string;
          digest: string;
          transactionHash: string;
        }>;
      };
      now(): Date;
    },
  ) {}

  async reconcile(
    invocationId: string,
  ): Promise<"CHARGED" | "NOT_CHARGED" | "SETTLEMENT_UNKNOWN"> {
    const invocation = await this.ports.repository.getInvocation(invocationId);
    if (
      !invocation ||
      (invocation.status !== "SETTLING" &&
        invocation.status !== "SETTLEMENT_UNKNOWN")
    ) {
      return "SETTLEMENT_UNKNOWN";
    }
    const snapshot = (await this.ports.vault.getJson(
      invocation.paymentBlobKey,
    )) as VerifiedPaymentSnapshot;
    const outcome = await this.ports.payment.reconcile({
      snapshot,
      ...(invocation.transactionHash
        ? { transactionHash: invocation.transactionHash }
        : {}),
    });
    if (outcome.state === "SETTLEMENT_UNKNOWN") {
      if (invocation.status === "SETTLING") {
        await this.ports.repository.transition({
          id: invocation.id,
          from: "SETTLING",
          to: "SETTLEMENT_UNKNOWN",
          expectedVersion: invocation.version,
          now: this.ports.now().toISOString(),
          chargeState: "SETTLEMENT_UNKNOWN",
        });
      }
      return "SETTLEMENT_UNKNOWN";
    }
    if (outcome.state === "NOT_CHARGED") {
      await this.ports.repository.transition({
        id: invocation.id,
        from: invocation.status,
        to: "FAILED_NOT_CHARGED",
        expectedVersion: invocation.version,
        now: this.ports.now().toISOString(),
        chargeState: "NOT_CHARGED",
        errorCode: outcome.errorCode,
      });
      return "NOT_CHARGED";
    }
    if (!invocation.candidateResultBlobKey || !invocation.resultDigest) {
      return "SETTLEMENT_UNKNOWN";
    }
    const receipt = await this.ports.receipts.create({
      invocationId: invocation.id,
      releaseId: invocation.releaseId,
      inputDigest: invocation.inputDigest,
      payer: outcome.payer,
      payee: outcome.payee,
      network: outcome.network,
      asset: outcome.asset,
      amount: outcome.amount,
      transactionHash: outcome.transactionHash,
      executionStartedAt: invocation.executionStartedAt ?? invocation.createdAt,
      executedAt: invocation.executedAt ?? invocation.updatedAt,
      settledAt: outcome.confirmedAt,
      resultDigest: invocation.resultDigest as `sha256:${string}`,
    });
    await this.ports.repository.createReceipt({
      invocationId: invocation.id,
      receiptBlobKey: receipt.blobKey,
      receiptDigest: receipt.digest,
      transactionHash: receipt.transactionHash,
      now: outcome.confirmedAt,
    });
    await this.ports.repository.transition({
      id: invocation.id,
      from: invocation.status,
      to: "RESULT_AVAILABLE",
      expectedVersion: invocation.version,
      now: outcome.confirmedAt,
      chargeState: "CHARGED",
      resultBlobKey: invocation.candidateResultBlobKey,
      resultDigest: invocation.resultDigest,
      transactionHash: outcome.transactionHash,
      settledAt: outcome.confirmedAt,
      resultExpiresAt: new Date(
        new Date(outcome.confirmedAt).getTime() + 24 * 60 * 60_000,
      ).toISOString(),
    });
    return "CHARGED";
  }
}
