import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { SettleResponse } from "@x402/core/types";
import { describe, expect, test, vi } from "vitest";

import { callPaidSkill, type CallDependencies } from "../src/call";
import { USDC_ASSETS } from "../src/networks";

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

function fixture(responses: Array<Response | Error | Promise<Response>>) {
  const session = {
    provider: { request: vi.fn() },
    selectedAccount: payTo as `0x${string}`,
    chainId: "0x14a34" as `0x${string}`,
    disconnect: vi.fn(async () => undefined),
  };
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return await next!;
  });
  const dependencies: CallDependencies = {
    fetch,
    connectWallet: vi.fn(async () => session),
    createSignature: vi.fn(async () => "payment-signature"),
    onPaymentSummary: vi.fn(),
    onWalletUri: vi.fn(),
  };
  return { dependencies, fetch, session };
}

describe("callPaidSkill HTTP state table", () => {
  test("returns a free bounded JSON result after one unsigned request", async () => {
    const built = fixture([response(200, { answer: 42 })]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).resolves.toEqual({ result: { answer: 42 }, payment: null });
    expect(built.fetch).toHaveBeenCalledOnce();
    expect(built.dependencies.connectWallet).not.toHaveBeenCalled();
    expect(
      new Headers(built.fetch.mock.calls[0]![1]?.headers).has(
        "PAYMENT-SIGNATURE",
      ),
    ).toBe(false);
  });

  test("rejects malformed or non-JSON free responses without wallet access", async () => {
    for (const invalid of [
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response("{}", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ]) {
      const built = fixture([invalid]);
      await expect(
        callPaidSkill(
          { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({
        code: "ENDPOINT_REQUEST_FAILED",
        paymentState: "not-charged",
      });
      expect(built.dependencies.connectWallet).not.toHaveBeenCalled();
    }
  });

  test.each([300, 400, 500])(
    "maps first non-402 status %s safely",
    async (status) => {
      const built = fixture([response(status, { secret: "malicious" })]);
      await expect(
        callPaidSkill(
          { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({
        code: "ENDPOINT_REQUEST_FAILED",
        paymentState: "not-charged",
      });
      expect(built.dependencies.connectWallet).not.toHaveBeenCalled();
    },
  );

  test("validates challenge before wallet access", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": "malformed" }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PAYMENT_REQUIRED",
      paymentState: "not-charged",
    });
    expect(built.dependencies.connectWallet).not.toHaveBeenCalled();
  });

  test("rejects an over-limit challenge before wallet access", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 49_999n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PRICE_EXCEEDS_MAXIMUM",
      paymentState: "not-charged",
    });
    expect(built.dependencies.connectWallet).not.toHaveBeenCalled();
  });

  test("wallet rejection sends no signed request and preserves the session", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
    ]);
    built.dependencies.createSignature = vi.fn(async () => {
      throw new Error("PAYMENT_REJECTED");
    });
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_REJECTED",
      paymentState: "not-charged",
    });
    expect(built.fetch).toHaveBeenCalledOnce();
    expect(built.session.disconnect).not.toHaveBeenCalled();
  });

  test.each([200, 402, 500])(
    "maps official settlement failure on signed %s without reading or retrying",
    async (status) => {
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
        response(
          status,
          { error: "no" },
          { "PAYMENT-RESPONSE": failedReceipt() },
        ),
      ]);
      await expect(
        callPaidSkill(
          { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({
        code: "SETTLEMENT_FAILED",
        paymentState: "not-charged",
      });
      expect(built.fetch).toHaveBeenCalledTimes(2);
      expect(built.dependencies.createSignature).toHaveBeenCalledOnce();
    },
  );

  test.each([
    { payer: "0x2222222222222222222222222222222222222222" },
    { amount: "1" },
    { transaction: 1 },
  ])("fails closed on malformed settlement failure %#", async (mismatch) => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(402, {}, { "PAYMENT-RESPONSE": failedReceipt(mismatch) }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({ paymentState: "unknown" });
  });

  test.each([
    { errorReason: [] },
    { errorMessage: { private: true } },
    { extensions: "bad" },
    { extra: [] },
  ])(
    "rejects malformed known optional fields in success receipts %#",
    async (malformed) => {
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
        response(200, {}, { "PAYMENT-RESPONSE": receipt(malformed) }),
      ]);
      await expect(
        callPaidSkill(
          { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({
        code: "PAYMENT_STATE_UNKNOWN",
        paymentState: "unknown",
      });
    },
  );

  test.each([
    { errorReason: [] },
    { errorMessage: { private: true } },
    { extensions: "bad" },
    { extra: [] },
  ])(
    "rejects malformed known optional fields in failure receipts %#",
    async (malformed) => {
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
        response(402, {}, { "PAYMENT-RESPONSE": failedReceipt(malformed) }),
      ]);
      await expect(
        callPaidSkill(
          { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({ paymentState: "unknown" });
    },
  );

  test("maps signed network loss to unknown and never retries", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      new TypeError("secret network message"),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
    expect(built.fetch).toHaveBeenCalledTimes(2);
  });

  test("rejects signed success without a valid matching receipt", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, { answer: 42 }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
  });

  test("returns paid success with a minimal bound receipt", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, { answer: 42 }, { "PAYMENT-RESPONSE": receipt() }),
    ]);
    await expect(
      callPaidSkill(
        {
          endpoint,
          input: { value: 1 },
          maxPrice: 50_000n,
          timeoutSeconds: 10,
        },
        built.dependencies,
      ),
    ).resolves.toEqual({
      result: { answer: 42 },
      payment: {
        amount: "0.05",
        currency: "USDC",
        network: "eip155:84532",
        payTo,
        transactionHash: transaction,
      },
    });
    expect(built.fetch).toHaveBeenCalledTimes(2);
    expect(built.dependencies.createSignature).toHaveBeenCalledOnce();
    expect(built.session.disconnect).not.toHaveBeenCalled();
  });

  test("fails closed on a mismatched receipt", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, {}, { "PAYMENT-RESPONSE": receipt({ amount: "1" }) }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
  });

  test.each([
    { payer: "0x2222222222222222222222222222222222222222" },
    { network: "eip155:8453" },
    { transaction: `0x${"0".repeat(64)}` },
  ])("fails closed on receipt binding mismatch %#", async (mismatch) => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, {}, { "PAYMENT-RESPONSE": receipt(mismatch) }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_STATE_UNKNOWN",
      paymentState: "unknown",
    });
  });

  test("caps the official receipt header before decoding", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, {}, { "PAYMENT-RESPONSE": "A".repeat(16 * 1024 + 1) }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_STATE_UNKNOWN" });
  });

  test("keeps the signed timeout active until the response stream finishes", async () => {
    vi.useFakeTimers();
    try {
      const neverEnding = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{"));
        },
      });
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
        new Response(neverEnding, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "PAYMENT-RESPONSE": receipt(),
          },
        }),
      ]);
      const pending = callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 1 },
        built.dependencies,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        code: "PAYMENT_STATE_UNKNOWN",
        paymentState: "unknown",
      });
      await vi.advanceTimersByTimeAsync(1_001);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  test("never revokes a reusable session across consecutive calls", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, { answer: 42 }, { "PAYMENT-RESPONSE": receipt() }),
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      response(200, { answer: 43 }, { "PAYMENT-RESPONSE": receipt() }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).resolves.toMatchObject({ result: { answer: 42 } });
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).resolves.toMatchObject({ result: { answer: 43 } });
    expect(built.session.disconnect).not.toHaveBeenCalled();
  });

  test("wallet deadline covers an unanswered signature and sends no paid request", async () => {
    vi.useFakeTimers();
    try {
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      ]);
      built.dependencies.createSignature = vi.fn(() => new Promise(() => {}));
      const pending = callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        code: "WALLET_CONFIRMATION_TIMEOUT",
        paymentState: "not-charged",
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
      await rejected;
      expect(built.fetch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a signature that arrives after wallet timeout cannot send a paid request", async () => {
    vi.useFakeTimers();
    try {
      let resolveSignature!: (value: string) => void;
      const built = fixture([
        response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      ]);
      built.dependencies.createSignature = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSignature = resolve;
          }),
      );
      const pending = callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      );
      const rejected = expect(pending).rejects.toMatchObject({
        code: "WALLET_CONFIRMATION_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
      await rejected;
      resolveSignature("late-signature");
      await Promise.resolve();
      expect(built.fetch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects endpoint policy and oversized input before fetch or wallet", async () => {
    for (const badEndpoint of [
      "http://example.com/x",
      "https://user:pass@example.com/x",
      "https://example.com/x#fragment",
    ]) {
      const built = fixture([]);
      await expect(
        callPaidSkill(
          { endpoint: badEndpoint, input: {}, maxPrice: 1n, timeoutSeconds: 1 },
          built.dependencies,
        ),
      ).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
      expect(built.fetch).not.toHaveBeenCalled();
    }
    const built = fixture([]);
    await expect(
      callPaidSkill(
        {
          endpoint,
          input: { value: "x".repeat(33 * 1024) },
          maxPrice: 1n,
          timeoutSeconds: 1,
        },
        built.dependencies,
      ),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    expect(built.fetch).not.toHaveBeenCalled();
  });

  test("does not follow redirects", async () => {
    const built = fixture([
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example" },
      }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 1n, timeoutSeconds: 1 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({ code: "ENDPOINT_REQUEST_FAILED" });
    expect(built.fetch.mock.calls[0]![1]?.redirect).toBe("manual");
  });

  test("caps chunked signed bodies and uses a valid receipt to mark charged", async () => {
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 17; i += 1)
          controller.enqueue(new Uint8Array(64 * 1024));
        controller.close();
      },
    });
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      new Response(stream, {
        status: 200,
        headers: { "PAYMENT-RESPONSE": receipt() },
      }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "RESULT_TOO_LARGE",
      paymentState: "charged",
    });
  });

  test("an oversized response with an explicit failure receipt remains not charged", async () => {
    const built = fixture([
      response(402, {}, { "PAYMENT-REQUIRED": challenge }),
      new Response(new Uint8Array(1024 * 1024 + 1), {
        status: 402,
        headers: { "PAYMENT-RESPONSE": failedReceipt() },
      }),
    ]);
    await expect(
      callPaidSkill(
        { endpoint, input: {}, maxPrice: 50_000n, timeoutSeconds: 10 },
        built.dependencies,
      ),
    ).rejects.toMatchObject({
      code: "SETTLEMENT_FAILED",
      paymentState: "not-charged",
    });
  });
});
