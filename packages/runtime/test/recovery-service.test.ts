import { describe, expect, test, vi } from "vitest";

import { RecoveryService } from "../src/recovery-service";

const invocationId = "inv_01J00000000000000000000000";

function fixture(
  status: "SETTLEMENT_UNKNOWN" | "RESULT_AVAILABLE" | "RESULT_EXPIRED",
) {
  const invocation = {
    id: invocationId,
    status,
    chargeState:
      status === "SETTLEMENT_UNKNOWN" ? "SETTLEMENT_UNKNOWN" : "CHARGED",
    version: 6,
    traceId: "trc_01J00000000000000000000000",
    updatedAt: "2026-07-19T00:03:00.000Z",
    resultBlobKey: "result",
    resultDigest: `sha256:${"9".repeat(64)}`,
  } as const;
  const getJson = vi.fn(async (key: string) =>
    key === "result"
      ? { answer: "paid result" }
      : {
          payload: {
            schemaVersion: "1",
            invocationId,
            releaseId: `rel_${"a".repeat(64)}`,
            inputDigest: `sha256:${"b".repeat(64)}`,
            payer: `0x${"c".repeat(40)}`,
            payee: `0x${"d".repeat(40)}`,
            network: "eip155:84532",
            asset: `0x${"e".repeat(40)}`,
            amount: "10000",
            transactionHash: `0x${"f".repeat(64)}`,
            executionStartedAt: "2026-07-19T00:00:01.000Z",
            executedAt: "2026-07-19T00:00:02.000Z",
            settledAt: "2026-07-19T00:00:03.000Z",
            resultDigest: `sha256:${"9".repeat(64)}`,
          },
          signature: {
            algorithm: "Ed25519",
            keyId: "runtime",
            value:
              "ErhqhgkFO7YARTK-G4Cc2qNmiKQkPL-4IlFlKQ2LNocZEy07QleUYM0dVVB2hyIZF2kvYbmc1IsXLqJ6VWJhCg",
          },
        },
  );
  const service = new RecoveryService({
    repository: {
      getInvocation: vi.fn(async () => invocation),
      getReceipt: vi.fn(async () => ({ receiptBlobKey: "receipt" })),
    },
    vault: { getJson },
    signer: {
      sign: vi.fn(async () => ({
        algorithm: "Ed25519",
        keyId: "runtime",
        value: "sig",
      })),
    },
  });
  return { service, getJson };
}

describe("RecoveryService", () => {
  test("returns a signed status without result data", async () => {
    const built = fixture("SETTLEMENT_UNKNOWN");
    await expect(built.service.status(invocationId)).resolves.toMatchObject({
      payload: {
        invocationId,
        status: "SETTLEMENT_UNKNOWN",
        chargeState: "SETTLEMENT_UNKNOWN",
      },
      signature: { keyId: "runtime" },
    });
    expect(built.getJson).not.toHaveBeenCalled();
  });

  test("never reads a candidate result before settlement confirmation", async () => {
    const built = fixture("SETTLEMENT_UNKNOWN");
    await expect(built.service.result(invocationId)).rejects.toMatchObject({
      code: "RESULT_NOT_AVAILABLE",
      status: 425,
      chargeState: "SETTLEMENT_UNKNOWN",
    });
    expect(built.getJson).not.toHaveBeenCalled();
  });

  test("returns a signed result only in RESULT_AVAILABLE", async () => {
    const built = fixture("RESULT_AVAILABLE");
    await expect(built.service.result(invocationId)).resolves.toMatchObject({
      payload: {
        invocationId,
        status: "RESULT_AVAILABLE",
        result: { answer: "paid result" },
      },
      signature: { keyId: "runtime" },
    });
  });

  test("keeps Receipt available after the 24-hour result expiry", async () => {
    const built = fixture("RESULT_EXPIRED");
    await expect(built.service.result(invocationId)).rejects.toMatchObject({
      code: "RESULT_EXPIRED",
      status: 410,
      chargeState: "CHARGED",
    });
    await expect(built.service.receipt(invocationId)).resolves.toMatchObject({
      payload: { invocationId },
      signature: { keyId: "runtime" },
    });
  });

  test("rejects a stored Receipt with unknown fields", async () => {
    const built = fixture("RESULT_EXPIRED");
    built.getJson.mockResolvedValueOnce({
      payload: { invocationId, rawInput: "must-not-pass" },
      signature: {},
    });

    await expect(built.service.receipt(invocationId)).rejects.toMatchObject({
      code: "INVALID_RECEIPT",
      status: 500,
      chargeState: "CHARGED",
    });
  });
});
