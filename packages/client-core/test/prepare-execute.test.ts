import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import { describe, expect, test, vi } from "vitest";

import {
  executePreparedCall,
  preparePaidCall,
  USDC_ASSETS,
  type PreparedPaidCall,
} from "../src";

const endpoint = "https://skill.example/api/invoke";
const payTo = "0x1111111111111111111111111111111111111111";
const transaction = `0x${"a".repeat(64)}`;
const challenge = encodePaymentRequiredHeader({
  x402Version: 2,
  resource: {
    url: endpoint,
    description: "test",
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      asset: USDC_ASSETS["eip155:84532"],
      amount: "50000",
      payTo,
      maxTimeoutSeconds: 60,
      extra: {},
    },
  ],
  extensions: {},
});

function receipt(overrides: Record<string, unknown> = {}) {
  return encodePaymentResponseHeader({
    success: true,
    transaction,
    network: "eip155:84532",
    amount: "50000",
    payer: payTo,
    ...overrides,
  } as never);
}

const officialSettlementFailure: SettleResponse = {
  success: false,
  errorReason: "settlement_failed",
  errorMessage: "private facilitator detail",
  transaction: "",
  network: "eip155:84532",
  payer: payTo,
  amount: "50000",
};

function failedReceipt(overrides: Record<string, unknown> = {}) {
  return encodePaymentResponseHeader({
    ...officialSettlementFailure,
    ...overrides,
  } as SettleResponse);
}

function response(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fetchFixture(responses: Array<Response | Error | Promise<Response>>) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return await next!;
  });
}

async function preparedCall(): Promise<{
  fetch: ReturnType<typeof fetchFixture>;
  prepared: PreparedPaidCall;
}> {
  const fetch = fetchFixture([
    response(402, {}, { "PAYMENT-REQUIRED": challenge }),
    response(200, { ok: true }, { "PAYMENT-RESPONSE": receipt() }),
  ]);
  const prepared = await preparePaidCall(
    { endpoint, input: { repo: "agentpaykit" }, maxPrice: 50_000n },
    { fetch },
  );
  expect(prepared.kind).toBe("payment-required");
  return { fetch, prepared: prepared.preparedCall };
}

describe("preparePaidCall", () => {
  test("returns a free bounded JSON result after one unsigned request", async () => {
    const fetch = fetchFixture([response(200, { answer: 42 })]);
    await expect(
      preparePaidCall({ endpoint, input: {}, maxPrice: 50_000n }, { fetch }),
    ).resolves.toEqual({
      kind: "free",
      result: { result: { answer: 42 }, payment: null },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      new Headers(fetch.mock.calls[0]![1]?.headers).has("PAYMENT-SIGNATURE"),
    ).toBe(false);
  });

  test("validates challenge before a wallet surface can sign", async () => {
    const fetch = fetchFixture([
      response(402, {}, { "PAYMENT-REQUIRED": "malformed" }),
    ]);
    await expect(
      preparePaidCall({ endpoint, input: {}, maxPrice: 50_000n }, { fetch }),
    ).rejects.toMatchObject({
      code: "INVALID_PAYMENT_REQUIRED",
      paymentState: "not-charged",
    });
  });

  test("rejects an over-limit challenge", async () => {
    const fetch = fetchFixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
    ]);
    await expect(
      preparePaidCall({ endpoint, input: {}, maxPrice: 49_999n }, { fetch }),
    ).rejects.toMatchObject({
      code: "PRICE_EXCEEDS_MAXIMUM",
      paymentState: "not-charged",
    });
  });
});

describe("executePreparedCall", () => {
  test("sends exactly one signed request and returns a verified receipt", async () => {
    const built = await preparedCall();
    await expect(
      executePreparedCall(
        {
          preparedCall: built.prepared,
          signature: "payment-signature",
          payer: payTo as `0x${string}`,
          timeoutMs: 1_000,
        },
        { fetch: built.fetch },
      ),
    ).resolves.toEqual({
      result: { ok: true },
      payment: {
        amount: "0.05",
        currency: "USDC",
        network: "eip155:84532",
        payTo,
        transactionHash: transaction,
      },
    });
    expect(built.fetch).toHaveBeenCalledTimes(2);
    expect(
      new Headers(built.fetch.mock.calls[1]![1]?.headers).get(
        "PAYMENT-SIGNATURE",
      ),
    ).toBe("payment-signature");
  });

  test("maps official settlement failure without exposing facilitator details", async () => {
    const fetch = fetchFixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(
        200,
        { error: "private" },
        { "PAYMENT-RESPONSE": failedReceipt() },
      ),
    ]);
    const prepared = await preparePaidCall(
      { endpoint, input: {}, maxPrice: 50_000n },
      { fetch },
    );
    expect(prepared.kind).toBe("payment-required");
    await expect(
      executePreparedCall(
        {
          preparedCall: prepared.preparedCall,
          signature: "payment-signature",
          payer: payTo as `0x${string}`,
          timeoutMs: 1_000,
        },
        { fetch },
      ),
    ).rejects.toMatchObject({
      code: "SETTLEMENT_FAILED",
      paymentState: "not-charged",
      message: "SETTLEMENT_FAILED",
    });
  });

  test("maps response loss after signed send to unknown and does not retry", async () => {
    const fetch = fetchFixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      new Error("socket closed"),
    ]);
    const prepared = await preparePaidCall(
      { endpoint, input: {}, maxPrice: 50_000n },
      { fetch },
    );
    expect(prepared.kind).toBe("payment-required");
    await expect(
      executePreparedCall(
        {
          preparedCall: prepared.preparedCall,
          signature: "payment-signature",
          payer: payTo as `0x${string}`,
          timeoutMs: 1_000,
        },
        { fetch },
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
