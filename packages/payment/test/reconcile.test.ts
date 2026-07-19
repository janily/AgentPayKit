import { describe, expect, test, vi } from "vitest";

import { PaymentReconciler } from "../src/reconcile";

const transaction = `0x${"f".repeat(64)}`;
const snapshot = {
  paymentPayload: {
    x402Version: 2,
    payload: {
      authorization: {
        from: `0x${"1".repeat(40)}`,
        nonce: `0x${"4".repeat(64)}`,
        validBefore: "2000",
      },
    },
  },
  paymentRequirements: {
    scheme: "exact",
    network: "eip155:84532",
    payTo: `0x${"2".repeat(40)}`,
    asset: `0x${"3".repeat(40)}`,
    amount: "10000",
  },
};

function fixture(
  options: {
    receipt?: "confirmed" | "reverted" | "not_found";
    authorizationUsed?: boolean;
    nowSeconds?: number;
  } = {},
) {
  const order: string[] = [];
  const receipt = vi.fn(async () => {
    order.push("receipt");
    return {
      state: options.receipt ?? "not_found",
      ...(options.receipt === "confirmed"
        ? { confirmedAt: "2026-07-19T00:03:00.000Z" }
        : {}),
    } as const;
  });
  const authorizationUsed = vi.fn(async () => {
    order.push("authorization");
    return options.authorizationUsed
      ? {
          used: true as const,
          transactionHash: transaction,
          confirmedAt: "2026-07-19T00:03:00.000Z",
        }
      : { used: false as const };
  });
  const settle = vi.fn(async (input) => {
    order.push("settle");
    expect(input).toBe(snapshot);
    return {
      success: true,
      transaction,
      payer: `0x${"1".repeat(40)}`,
      network: "eip155:84532",
    };
  });
  const reconciler = new PaymentReconciler({
    chain: { receipt, authorizationUsed },
    settler: { settle },
    nowSeconds: () => options.nowSeconds ?? 1_000,
  });
  return { reconciler, order, receipt, authorizationUsed, settle };
}

describe("PaymentReconciler", () => {
  test("checks a known transaction receipt first and never retries settlement", async () => {
    const built = fixture({ receipt: "confirmed" });
    await expect(
      built.reconciler.reconcile({ snapshot, transactionHash: transaction }),
    ).resolves.toMatchObject({
      state: "CHARGED",
      transactionHash: transaction,
    });
    expect(built.order).toEqual(["receipt"]);
  });

  test("does not inspect authorization or retry while a known receipt is pending", async () => {
    const built = fixture({ receipt: "not_found" });
    await expect(
      built.reconciler.reconcile({ snapshot, transactionHash: transaction }),
    ).resolves.toEqual({ state: "SETTLEMENT_UNKNOWN" });
    expect(built.order).toEqual(["receipt"]);
  });

  test("finds AuthorizationUsed before considering a retry when no hash exists", async () => {
    const built = fixture({ authorizationUsed: true });
    await expect(
      built.reconciler.reconcile({ snapshot }),
    ).resolves.toMatchObject({
      state: "CHARGED",
      transactionHash: transaction,
    });
    expect(built.order).toEqual(["authorization"]);
    expect(built.settle).not.toHaveBeenCalled();
  });

  test("retries the exact verified payload while authorization remains valid", async () => {
    const built = fixture({
      authorizationUsed: false,
      nowSeconds: 1_000,
      receipt: "confirmed",
    });
    await expect(
      built.reconciler.reconcile({ snapshot }),
    ).resolves.toMatchObject({
      state: "CHARGED",
    });
    expect(built.order).toEqual(["authorization", "settle", "receipt"]);
  });

  test("returns final NOT_CHARGED after authorization expiry without retrying", async () => {
    const built = fixture({ authorizationUsed: false, nowSeconds: 2_000 });
    await expect(built.reconciler.reconcile({ snapshot })).resolves.toEqual({
      state: "NOT_CHARGED",
      errorCode: "AUTHORIZATION_EXPIRED",
    });
    expect(built.order).toEqual(["authorization"]);
    expect(built.settle).not.toHaveBeenCalled();
  });
});
