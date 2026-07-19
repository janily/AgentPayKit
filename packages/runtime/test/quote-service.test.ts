import { describe, expect, test, vi } from "vitest";

import { QuoteService } from "../src/quote-service";

const releaseId = `rel_${"a".repeat(64)}`;
const invocationId = "inv_01J00000000000000000000000";
const inputDigest = `sha256:${"b".repeat(64)}`;

describe("QuoteService", () => {
  test("returns a five-minute signed quote and payment challenge", async () => {
    const persist = vi.fn();
    const service = new QuoteService({
      releases: {
        get: vi.fn(async () => ({
          id: releaseId,
          environment: "testnet",
          network: "eip155:84532",
          amount: "10000",
          asset: `0x${"c".repeat(40)}`,
          payee: `0x${"d".repeat(40)}`,
        })),
      },
      quotes: { create: persist },
      challenge: { issue: vi.fn(async () => "official-payment-required") },
      signer: {
        sign: vi.fn(async () => ({
          algorithm: "Ed25519",
          keyId: "runtime",
          value: "sig",
        })),
      },
      quoteId: () => "qte_01J00000000000000000000000",
      now: () => new Date("2026-07-19T00:00:00.000Z"),
    });

    const result = await service.create({
      invocationId,
      releaseId,
      inputDigest,
      environment: "testnet",
    });

    expect(result.paymentRequired).toBe("official-payment-required");
    expect(result.quote.expiresAt).toBe("2026-07-19T00:05:00.000Z");
    expect(result.quote.paymentIdentifier).toBe(invocationId);
    expect(result.signature).toMatchObject({ keyId: "runtime" });
    expect(persist).toHaveBeenCalledOnce();
  });

  test("rejects unknown request fields", async () => {
    const service = new QuoteService({} as never);
    await expect(
      service.create({
        invocationId,
        releaseId,
        inputDigest,
        environment: "testnet",
        rawInput: "no",
      }),
    ).rejects.toThrow(/unknown field: rawInput/);
  });
});
