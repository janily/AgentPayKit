import { afterEach, describe, expect, test, vi } from "vitest";

import { TimedHandlerRunner } from "../src/handler-runner";
import { ReceiptService } from "../src/receipt-service";
import { SettlementService } from "../src/settlement-service";
import { SuccessPolicy } from "../src/success-policy";

afterEach(() => {
  vi.useRealTimers();
});

describe("TimedHandlerRunner", () => {
  test("aborts execution at the Release hard timeout", async () => {
    vi.useFakeTimers();
    const handler = vi.fn(
      async (_input: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const runner = new TimedHandlerRunner(handler);
    const execution = runner.run(
      { invocationId: "invocation", input: {}, release: {} },
      100,
    );
    const rejected = expect(execution).rejects.toThrow("HANDLER_TIMEOUT");

    await vi.advanceTimersByTimeAsync(100);
    await rejected;
  });
});

describe("SuccessPolicy", () => {
  test("rejects output schema before evaluating custom policy", async () => {
    const evaluate = vi.fn(() => ({ accepted: true as const }));
    const policy = new SuccessPolicy(
      (value) =>
        typeof value === "object" && value !== null && "answer" in value,
      evaluate,
    );
    await expect(policy.evaluate({ partial: true })).resolves.toEqual({
      accepted: false,
      errorCode: "OUTPUT_SCHEMA_INVALID",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe("SettlementService", () => {
  const snapshot = {
    schemaVersion: "1" as const,
    paymentPayload: {},
    paymentRequirements: {
      network: "eip155:84532",
      payTo: `0x${"2".repeat(40)}`,
      asset: `0x${"3".repeat(40)}`,
      amount: "10000",
    },
  };

  test("returns CHARGED only after a chain confirmation", async () => {
    const service = new SettlementService({
      settler: {
        settle: vi.fn(async () => ({
          success: true,
          transaction: `0x${"f".repeat(64)}`,
          payer: `0x${"1".repeat(40)}`,
        })),
      },
      chain: {
        confirm: vi.fn(async () => ({
          confirmed: true,
          confirmedAt: "2026-07-19T00:03:00.000Z",
        })),
      },
    });
    await expect(service.settle(snapshot)).resolves.toMatchObject({
      state: "CHARGED",
      amount: "10000",
      network: "eip155:84532",
    });
  });

  test("maps a facilitator timeout to SETTLEMENT_UNKNOWN", async () => {
    const service = new SettlementService({
      settler: {
        settle: vi.fn(async () => Promise.reject(new Error("timeout"))),
      },
      chain: { confirm: vi.fn() },
    });
    await expect(service.settle(snapshot)).resolves.toEqual({
      state: "SETTLEMENT_UNKNOWN",
    });
  });
});

describe("ReceiptService", () => {
  test("binds payment, execution and result evidence before signing", async () => {
    const putJson = vi.fn(async (key: string) => ({
      key,
      digest: `sha256:${"8".repeat(64)}`,
    }));
    const sign = vi.fn(async () => ({
      algorithm: "Ed25519" as const,
      keyId: "runtime",
      value: "sig",
    }));
    const service = new ReceiptService({
      vault: { putJson },
      signer: { sign },
    });
    const input = {
      invocationId: "inv_01J00000000000000000000000",
      releaseId: `rel_${"a".repeat(64)}`,
      inputDigest: `sha256:${"b".repeat(64)}`,
      payer: `0x${"1".repeat(40)}` as const,
      payee: `0x${"2".repeat(40)}` as const,
      network: "eip155:84532" as const,
      asset: `0x${"3".repeat(40)}` as const,
      amount: "10000",
      transactionHash: `0x${"f".repeat(64)}` as const,
      executionStartedAt: "2026-07-19T00:02:00.000Z",
      executedAt: "2026-07-19T00:02:20.000Z",
      settledAt: "2026-07-19T00:03:00.000Z",
      resultDigest: `sha256:${"9".repeat(64)}` as const,
    };

    await service.create(input);

    expect(sign).toHaveBeenCalledWith(expect.objectContaining(input));
    expect(putJson).toHaveBeenCalledWith(
      `${input.invocationId}/receipt`,
      expect.objectContaining({
        payload: expect.objectContaining({
          amount: "10000",
          resultDigest: input.resultDigest,
        }),
        signature: expect.objectContaining({ keyId: "runtime" }),
      }),
    );
  });
});
