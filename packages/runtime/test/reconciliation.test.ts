import { describe, expect, test, vi } from "vitest";

import { ReconciliationService } from "../src/reconciliation";

const invocationId = "inv_01J00000000000000000000000";
const record = {
  id: invocationId,
  quoteId: "qte_01J00000000000000000000000",
  releaseId: `rel_${"a".repeat(64)}`,
  inputDigest: `sha256:${"b".repeat(64)}`,
  requestFingerprint: `sha256:${"c".repeat(64)}`,
  status: "SETTLEMENT_UNKNOWN" as const,
  chargeState: "SETTLEMENT_UNKNOWN" as const,
  version: 5,
  inputBlobKey: "input",
  inputBlobDigest: `sha256:${"d".repeat(64)}`,
  paymentBlobKey: "payment",
  paymentBlobDigest: `sha256:${"e".repeat(64)}`,
  candidateResultBlobKey: "candidate",
  resultDigest: `sha256:${"9".repeat(64)}`,
  traceId: "trc_01J00000000000000000000000",
  executionStartedAt: "2026-07-19T00:02:00.000Z",
  executedAt: "2026-07-19T00:02:20.000Z",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:02:30.000Z",
};

function fixture(outcome: Record<string, unknown>, status = record.status) {
  const transitions: Array<Record<string, unknown>> = [];
  const createReceipt = vi.fn();
  const service = new ReconciliationService({
    repository: {
      getInvocation: vi.fn(async () => ({ ...record, status })),
      transition: vi.fn(async (input) => {
        transitions.push(input);
        return true;
      }),
      createReceipt,
    },
    vault: {
      getJson: vi.fn(async () => ({
        schemaVersion: "1",
        paymentPayload: { payload: { authorization: {} } },
        paymentRequirements: {},
      })),
    },
    payment: { reconcile: vi.fn(async () => outcome) },
    receipts: {
      create: vi.fn(async () => ({
        blobKey: "receipt",
        digest: `sha256:${"8".repeat(64)}`,
        transactionHash: `0x${"f".repeat(64)}`,
      })),
    },
    now: () => new Date("2026-07-19T00:04:00.000Z"),
  });
  return { service, transitions, createReceipt };
}

describe("ReconciliationService", () => {
  test("keeps the result unavailable while settlement remains unknown", async () => {
    const built = fixture({ state: "SETTLEMENT_UNKNOWN" }, "SETTLING");
    await expect(built.service.reconcile(invocationId)).resolves.toBe(
      "SETTLEMENT_UNKNOWN",
    );
    expect(built.transitions.at(-1)).toMatchObject({
      from: "SETTLING",
      to: "SETTLEMENT_UNKNOWN",
      chargeState: "SETTLEMENT_UNKNOWN",
    });
    expect(built.createReceipt).not.toHaveBeenCalled();
  });

  test("finalizes expired authorization as FAILED_NOT_CHARGED", async () => {
    const built = fixture({
      state: "NOT_CHARGED",
      errorCode: "AUTHORIZATION_EXPIRED",
    });
    await expect(built.service.reconcile(invocationId)).resolves.toBe(
      "NOT_CHARGED",
    );
    expect(built.transitions.at(-1)).toMatchObject({
      from: "SETTLEMENT_UNKNOWN",
      to: "FAILED_NOT_CHARGED",
      chargeState: "NOT_CHARGED",
      errorCode: "AUTHORIZATION_EXPIRED",
    });
  });

  test("creates receipt before making a recovered result available", async () => {
    const built = fixture({
      state: "CHARGED",
      transactionHash: `0x${"f".repeat(64)}`,
      payer: `0x${"1".repeat(40)}`,
      payee: `0x${"2".repeat(40)}`,
      network: "eip155:84532",
      asset: `0x${"3".repeat(40)}`,
      amount: "10000",
      confirmedAt: "2026-07-19T00:03:00.000Z",
    });
    await expect(built.service.reconcile(invocationId)).resolves.toBe(
      "CHARGED",
    );
    expect(built.createReceipt).toHaveBeenCalledOnce();
    expect(built.transitions.at(-1)).toMatchObject({
      from: "SETTLEMENT_UNKNOWN",
      to: "RESULT_AVAILABLE",
      chargeState: "CHARGED",
      resultBlobKey: "candidate",
    });
  });
});
