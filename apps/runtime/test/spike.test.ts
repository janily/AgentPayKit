import { describe, expect, test, vi } from "vitest";

import { createRuntimeApp } from "../src/spike";

const verifiedPayment = {
  paymentPayload: { x402Version: 2, payload: {} },
  paymentRequirements: { scheme: "exact", network: "eip155:84532" },
};

describe("M2-only x402 Workers spike", () => {
  test("exposes a health endpoint", async () => {
    const app = createRuntimeApp({
      payment: { verify: vi.fn(), settle: vi.fn(), reconcile: vi.fn() },
      paymentRequired: "encoded-requirements",
    });

    const response = await app.request("http://worker.test/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  test("returns an official v2 payment challenge when no signature is present", async () => {
    const payment = { verify: vi.fn(), settle: vi.fn(), reconcile: vi.fn() };
    const app = createRuntimeApp({
      payment,
      paymentRequired: "encoded-requirements",
    });

    const response = await app.request("http://worker.test/spike/paid-ping", {
      method: "POST",
    });

    expect(response.status).toBe(402);
    expect(response.headers.get("PAYMENT-REQUIRED")).toBe(
      "encoded-requirements",
    );
    expect(payment.verify).not.toHaveBeenCalled();
    expect(payment.settle).not.toHaveBeenCalled();
  });

  test("runs verify, handler and settle in order for a signed request", async () => {
    const order: string[] = [];
    const payment = {
      verify: vi.fn(async () => {
        order.push("verify");
        return verifiedPayment;
      }),
      settle: vi.fn(async () => {
        order.push("settle");
        return {
          success: true,
          transaction: "0xabc",
          network: "eip155:84532",
          headers: { "PAYMENT-RESPONSE": "encoded-settlement" },
        };
      }),
      reconcile: vi.fn(),
    };
    const app = createRuntimeApp({
      payment,
      paymentRequired: "encoded-requirements",
      onHandler: () => order.push("handler"),
    });

    const response = await app.request("http://worker.test/spike/paid-ping", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": "encoded-payment" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("PAYMENT-RESPONSE")).toBe("encoded-settlement");
    await expect(response.json()).resolves.toEqual({
      pong: true,
      spike: "M2-only",
    });
    expect(order).toEqual(["verify", "handler", "settle"]);
  });
});
