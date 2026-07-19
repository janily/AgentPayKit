import { describe, expect, test, vi } from "vitest";

import { X402PaymentAdapter } from "../src/x402-payment-adapter";

describe("X402PaymentAdapter", () => {
  test("verify delegates only to processHTTPRequest", async () => {
    const processHTTPRequest = vi.fn().mockResolvedValue({
      type: "payment-verified",
      paymentPayload: { x402Version: 2 },
      paymentRequirements: { scheme: "exact" },
    });
    const processSettlement = vi.fn();
    const adapter = new X402PaymentAdapter({
      processHTTPRequest,
      processSettlement,
    });

    const result = await adapter.verify({
      paymentHeader: "encoded-payment",
      method: "POST",
      url: "https://runtime.example/v1/invocations",
    });

    expect(result.paymentPayload).toEqual({ x402Version: 2 });
    expect(processHTTPRequest).toHaveBeenCalledOnce();
    expect(processSettlement).not.toHaveBeenCalled();
  });

  test("settle delegates only to processSettlement", async () => {
    const processHTTPRequest = vi.fn();
    const processSettlement = vi.fn().mockResolvedValue({
      success: true,
      transaction: "0xabc",
      network: "eip155:84532",
    });
    const adapter = new X402PaymentAdapter({
      processHTTPRequest,
      processSettlement,
    });

    const result = await adapter.settle({
      paymentPayload: { x402Version: 2 },
      paymentRequirements: { scheme: "exact" },
    });

    expect(result.success).toBe(true);
    expect(processSettlement).toHaveBeenCalledOnce();
    expect(processHTTPRequest).not.toHaveBeenCalled();
  });
});
