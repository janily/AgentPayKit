import { Buffer } from "node:buffer";

import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectPaymentRequirement } from "../src/challenge";
import { USDC_ASSETS } from "../src/networks";

const ENDPOINT = "https://skill.example/api/invoke";
const PAYEE = getAddress("0x1111111111111111111111111111111111111111");
const MAX_UINT256 = (1n << 256n) - 1n;
const createWallet = vi.fn((_selected?: unknown) => ({ connected: true }));

interface RequirementFixture {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

interface PaymentRequiredFixture {
  x402Version: number;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: unknown[];
}

function requirement(
  overrides: Partial<RequirementFixture> = {},
): RequirementFixture {
  return {
    scheme: "exact",
    network: "eip155:84532",
    asset: USDC_ASSETS["eip155:84532"],
    amount: "50000",
    payTo: PAYEE,
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
    ...overrides,
  };
}

function paymentRequired(
  overrides: Partial<PaymentRequiredFixture> = {},
): PaymentRequiredFixture {
  return {
    x402Version: 2,
    resource: {
      url: ENDPOINT,
      description: "Runs a paid skill.",
      mimeType: "application/json",
    },
    accepts: [requirement()],
    ...overrides,
  };
}

function header(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function selectThenCreateWallet(challenge: unknown, maxPrice = 50_000n) {
  const selected = selectPaymentRequirement({
    header: header(challenge),
    endpoint: ENDPOINT,
    maxPrice,
  });
  createWallet();
  return selected;
}

describe("selectPaymentRequirement", () => {
  beforeEach(() => {
    createWallet.mockClear();
  });

  it("returns the unique supported requirement and decoded challenge", () => {
    const challenge = paymentRequired();

    expect(selectThenCreateWallet(challenge)).toEqual({
      network: "eip155:84532",
      asset: USDC_ASSETS["eip155:84532"],
      amount: 50_000n,
      payTo: PAYEE,
      resourceUrl: ENDPOINT,
      paymentRequired: challenge,
    });
    expect(createWallet).toHaveBeenCalledTimes(1);
  });

  it("compares canonical URL href values exactly", () => {
    const endpoint = "https://skill.example:443/api/../api/invoke";
    const challenge = paymentRequired({
      resource: {
        url: ENDPOINT,
        description: "Runs a paid skill.",
        mimeType: "application/json",
      },
    });

    expect(
      selectPaymentRequirement({
        header: header(challenge),
        endpoint,
        maxPrice: 50_000n,
      }).resourceUrl,
    ).toBe(new URL(ENDPOINT).href);
  });

  it("matches EVM asset and payee addresses with viem semantics", () => {
    const challenge = paymentRequired({
      accepts: [
        requirement({
          asset: USDC_ASSETS["eip155:84532"].toLowerCase(),
          payTo: PAYEE.toLowerCase(),
        }),
      ],
    });

    const selected = selectThenCreateWallet(challenge);

    expect(selected.asset).toBe(USDC_ASSETS["eip155:84532"].toLowerCase());
    expect(selected.payTo).toBe(PAYEE.toLowerCase());
  });

  it("ignores unsupported alternatives when exactly one candidate is acceptable", () => {
    const supported = requirement();
    const challenge = paymentRequired({
      accepts: [
        requirement({ scheme: "upto" }),
        supported,
        requirement({ network: "eip155:1" }),
        requirement({
          asset: "0x2222222222222222222222222222222222222222",
        }),
      ],
    });

    expect(selectThenCreateWallet(challenge).amount).toBe(50_000n);
    expect(createWallet).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["an array", []],
    ["a non-string core field", { ...requirement(), scheme: 42 }],
    ["an invalid asset address", { ...requirement(), asset: "not-an-address" }],
    ["a malformed supported-network amount", requirement({ amount: "1.5" })],
    [
      "a malformed supported-network payee",
      requirement({ payTo: "not-an-address" }),
    ],
  ])(
    "rejects a valid candidate plus %s before wallet creation",
    (_name, malformed) => {
      expect(() =>
        selectThenCreateWallet(
          paymentRequired({ accepts: [requirement(), malformed] }),
        ),
      ).toThrow("INVALID_PAYMENT_REQUIRED");
      expect(createWallet).not.toHaveBeenCalled();
    },
  );

  it("gives global malformed-entry precedence over an over-limit candidate", () => {
    expect(() =>
      selectThenCreateWallet(
        paymentRequired({
          accepts: [requirement({ amount: "50001" }), null],
        }),
      ),
    ).toThrow("INVALID_PAYMENT_REQUIRED");
    expect(createWallet).not.toHaveBeenCalled();
  });

  it("accepts the largest uint256 atomic amount", () => {
    const selected = selectThenCreateWallet(
      paymentRequired({
        accepts: [requirement({ amount: MAX_UINT256.toString() })],
      }),
      MAX_UINT256,
    );

    expect(selected.amount).toBe(MAX_UINT256);
  });

  it("rejects an atomic amount above uint256 before wallet creation", () => {
    expect(() =>
      selectThenCreateWallet(
        paymentRequired({
          accepts: [requirement({ amount: (MAX_UINT256 + 1n).toString() })],
        }),
        MAX_UINT256,
      ),
    ).toThrow("INVALID_PAYMENT_REQUIRED");
    expect(createWallet).not.toHaveBeenCalled();
  });

  it("rejects a huge atomic string without passing it to BigInt", () => {
    const bigInt = vi.spyOn(globalThis, "BigInt");
    try {
      expect(() =>
        selectThenCreateWallet(
          paymentRequired({
            accepts: [requirement({ amount: "9".repeat(100_000) })],
          }),
          MAX_UINT256,
        ),
      ).toThrow("INVALID_PAYMENT_REQUIRED");
      expect(bigInt).not.toHaveBeenCalled();
      expect(createWallet).not.toHaveBeenCalled();
    } finally {
      bigInt.mockRestore();
    }
  });

  it.each([0n, -1n, MAX_UINT256 + 1n])(
    "rejects invalid maxPrice %s with an allowed challenge error",
    (maxPrice) => {
      expect(() => selectThenCreateWallet(paymentRequired(), maxPrice)).toThrow(
        "INVALID_PAYMENT_REQUIRED",
      );
      expect(createWallet).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["malformed header", () => "not-base64-json", "INVALID_PAYMENT_REQUIRED"],
    [
      "x402 version other than 2",
      () => header(paymentRequired({ x402Version: 1 })),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "resource URL mismatch",
      () =>
        header(
          paymentRequired({
            resource: {
              url: "https://skill.example/api/other",
              description: "Runs a paid skill.",
              mimeType: "application/json",
            },
          }),
        ),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "malformed resource URL",
      () =>
        header(
          paymentRequired({
            resource: {
              url: "not-a-url",
              description: "Runs a paid skill.",
              mimeType: "application/json",
            },
          }),
        ),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "non-exact scheme",
      () =>
        header(paymentRequired({ accepts: [requirement({ scheme: "upto" })] })),
      "UNSUPPORTED_PAYMENT_REQUIREMENT",
    ],
    [
      "unsupported network",
      () =>
        header(
          paymentRequired({
            accepts: [requirement({ network: "eip155:1" })],
          }),
        ),
      "UNSUPPORTED_PAYMENT_REQUIREMENT",
    ],
    [
      "wrong USDC contract",
      () =>
        header(
          paymentRequired({
            accepts: [
              requirement({
                asset: "0x2222222222222222222222222222222222222222",
              }),
            ],
          }),
        ),
      "UNSUPPORTED_PAYMENT_REQUIREMENT",
    ],
    [
      "zero amount",
      () =>
        header(paymentRequired({ accepts: [requirement({ amount: "0" })] })),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "non-integer amount",
      () =>
        header(paymentRequired({ accepts: [requirement({ amount: "1.5" })] })),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "zero payee",
      () =>
        header(
          paymentRequired({
            accepts: [
              requirement({
                payTo: "0x0000000000000000000000000000000000000000",
              }),
            ],
          }),
        ),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "invalid payee",
      () =>
        header(
          paymentRequired({
            accepts: [requirement({ payTo: "not-an-address" })],
          }),
        ),
      "INVALID_PAYMENT_REQUIRED",
    ],
    [
      "amount above maximum",
      () =>
        header(
          paymentRequired({ accepts: [requirement({ amount: "50001" })] }),
        ),
      "PRICE_EXCEEDS_MAXIMUM",
    ],
    [
      "no acceptable candidate",
      () => header(paymentRequired({ accepts: [] })),
      "UNSUPPORTED_PAYMENT_REQUIREMENT",
    ],
    [
      "more than one acceptable candidate",
      () =>
        header(paymentRequired({ accepts: [requirement(), requirement()] })),
      "INVALID_PAYMENT_REQUIRED",
    ],
  ])("rejects %s before wallet creation", (_name, makeHeader, error) => {
    expect(() => {
      const selected = selectPaymentRequirement({
        header: makeHeader(),
        endpoint: ENDPOINT,
        maxPrice: 50_000n,
      });
      createWallet(selected);
    }).toThrow(error);
    expect(createWallet).not.toHaveBeenCalled();
  });
});
