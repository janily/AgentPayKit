import { describe, expect, test, vi } from "vitest";

import { InvocationQueueConsumer } from "../src/queue-consumer";

const invocationId = "inv_01J00000000000000000000000";
const baseRecord = {
  id: invocationId,
  quoteId: "qte_01J00000000000000000000000",
  releaseId: `rel_${"a".repeat(64)}`,
  inputDigest: `sha256:${"b".repeat(64)}`,
  requestFingerprint: `sha256:${"c".repeat(64)}`,
  status: "QUEUED" as const,
  chargeState: "NOT_CHARGED" as const,
  version: 1,
  inputBlobKey: `${invocationId}/trace/input`,
  inputBlobDigest: `sha256:${"d".repeat(64)}`,
  paymentBlobKey: `${invocationId}/trace/payment`,
  paymentBlobDigest: `sha256:${"e".repeat(64)}`,
  traceId: "trc_01J00000000000000000000000",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:01:00.000Z",
};

function fixture(
  options: {
    status?: typeof baseRecord.status | "SETTLING" | "RESULT_AVAILABLE";
    handlerError?: Error;
    policyAccepted?: boolean;
    settlementState?: "CHARGED" | "SETTLEMENT_UNKNOWN";
  } = {},
) {
  const order: string[] = [];
  let record = {
    ...baseRecord,
    status: options.status ?? baseRecord.status,
  } as Record<string, unknown>;
  const transitions: Array<{ from: string; to: string }> = [];
  const repository = {
    getInvocation: vi.fn(async () => record),
    transition: vi.fn(async (input: Record<string, unknown>) => {
      if (
        record.status !== input.from ||
        record.version !== input.expectedVersion
      )
        return false;
      transitions.push({ from: String(input.from), to: String(input.to) });
      record = {
        ...record,
        ...input,
        status: input.to,
        version: Number(record.version) + 1,
        updatedAt: input.now,
      };
      return true;
    }),
    createReceipt: vi.fn(async () => {
      order.push("receipt");
    }),
  };
  const settle = vi.fn(async () => {
    order.push("settle");
    if (options.settlementState === "SETTLEMENT_UNKNOWN") {
      return { state: "SETTLEMENT_UNKNOWN" as const };
    }
    order.push("confirm");
    return {
      state: "CHARGED" as const,
      transactionHash: `0x${"f".repeat(64)}`,
      payer: `0x${"1".repeat(40)}`,
      payee: `0x${"2".repeat(40)}`,
      network: "eip155:84532",
      asset: `0x${"3".repeat(40)}`,
      amount: "10000",
      confirmedAt: "2026-07-19T00:02:30.000Z",
    };
  });
  const reconcile = vi.fn(async () => {
    order.push("reconcile");
  });
  const consumer = new InvocationQueueConsumer({
    repository,
    releases: {
      get: vi.fn(async () => ({
        id: baseRecord.releaseId,
        maximumExecutionMs: 300_000,
      })),
    },
    vault: {
      getJson: vi.fn(async (key: string) =>
        key.endsWith("/input")
          ? { query: "research" }
          : {
              schemaVersion: "1",
              paymentPayload: { x402Version: 2 },
              paymentRequirements: { scheme: "exact" },
            },
      ),
      putJson: vi.fn(async () => {
        order.push("encrypt-result");
        return {
          key: `${invocationId}/result/candidate`,
          digest: `sha256:${"9".repeat(64)}`,
        };
      }),
      delete: vi.fn(async () => undefined),
    },
    handler: {
      run: vi.fn(async () => {
        order.push("handler");
        if (options.handlerError) throw options.handlerError;
        return { answer: "complete" };
      }),
    },
    policy: {
      evaluate: vi.fn(async () => {
        order.push("policy");
        return options.policyAccepted === false
          ? { accepted: false as const, errorCode: "POLICY_OUTPUT_REJECTED" }
          : { accepted: true as const };
      }),
    },
    settlement: { settle },
    receipts: {
      create: vi.fn(async (input) => {
        order.push("sign-receipt");
        return {
          blobKey: `${invocationId}/receipt`,
          digest: `sha256:${"8".repeat(64)}`,
          transactionHash: input.transactionHash,
        };
      }),
    },
    reconciliation: { reconcile },
    now: () => new Date("2026-07-19T00:02:00.000Z"),
  });
  return { consumer, order, transitions, settle, reconcile, repository };
}

describe("InvocationQueueConsumer", () => {
  test("does not settle when the Handler fails", async () => {
    const built = fixture({ handlerError: new Error("provider timeout") });
    await expect(
      built.consumer.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("processed");
    expect(built.settle).not.toHaveBeenCalled();
    expect(built.transitions.at(-1)).toEqual({
      from: "EXECUTING",
      to: "EXECUTION_FAILED",
    });
  });

  test("does not settle when Success Policy rejects the candidate", async () => {
    const built = fixture({ policyAccepted: false });
    await built.consumer.process({ invocationId, expectedVersion: 1 });
    expect(built.settle).not.toHaveBeenCalled();
    expect(built.order).toEqual(["handler", "policy"]);
    expect(built.transitions.at(-1)).toEqual({
      from: "EXECUTING",
      to: "POLICY_REJECTED",
    });
  });

  test("settles only after policy and exposes the result only after confirmation and receipt", async () => {
    const built = fixture();
    await built.consumer.process({ invocationId, expectedVersion: 1 });

    expect(built.order).toEqual([
      "handler",
      "policy",
      "encrypt-result",
      "settle",
      "confirm",
      "sign-receipt",
      "receipt",
    ]);
    expect(built.transitions.map(({ to }) => to)).toEqual([
      "EXECUTING",
      "READY_TO_SETTLE",
      "SETTLING",
      "RESULT_AVAILABLE",
    ]);
  });

  test("does not execute or settle a completed duplicate job", async () => {
    const built = fixture({ status: "RESULT_AVAILABLE" });
    await expect(
      built.consumer.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("duplicate");
    expect(built.order).toEqual([]);
  });

  test("routes SETTLING redelivery to reconciliation without another settle", async () => {
    const built = fixture({ status: "SETTLING" });
    await expect(
      built.consumer.process({ invocationId, expectedVersion: 1 }),
    ).resolves.toBe("reconcile");
    expect(built.reconcile).toHaveBeenCalledWith(invocationId);
    expect(built.settle).not.toHaveBeenCalled();
  });

  test("keeps candidate result unavailable when settlement is unknown", async () => {
    const built = fixture({ settlementState: "SETTLEMENT_UNKNOWN" });
    await built.consumer.process({ invocationId, expectedVersion: 1 });
    expect(built.transitions.at(-1)).toEqual({
      from: "SETTLING",
      to: "SETTLEMENT_UNKNOWN",
    });
    expect(built.repository.createReceipt).not.toHaveBeenCalled();
  });
});
