import {
  parseReceiptEnvelope,
  parseSignedReceipt,
  parseStatusEnvelope,
} from "@agentpaykit/protocol";
import { describe, expect, it } from "vitest";

import {
  DeterministicIds,
  FakeChain,
  FakeFacilitator,
  FakeQueue,
  FakeStore,
  FakeWallet,
  FIXTURE_PAYMENT_HEADER,
  FIXTURE_PAYMENT_PAYLOAD,
  FIXTURE_QUOTE,
  FIXTURE_RECEIPT,
  FIXTURE_RELEASE,
  FIXTURE_STATUS,
  FixedClock,
} from "../src/index";

describe("deterministic fixtures", () => {
  it("pins release, quote, payload, status, receipt, and signatures", () => {
    expect(FIXTURE_RELEASE.payload.releaseId).toMatch(/^rel_[0-9a-f]{64}$/);
    expect(FIXTURE_QUOTE.payload.releaseId).toBe(
      FIXTURE_RELEASE.payload.releaseId,
    );
    expect(FIXTURE_PAYMENT_PAYLOAD.testCredential).toBe(true);
    expect(FIXTURE_PAYMENT_HEADER).toMatch(/^test-only:/);
    expect(parseStatusEnvelope(FIXTURE_STATUS.payload)).toEqual(
      FIXTURE_STATUS.payload,
    );
    expect(parseReceiptEnvelope(FIXTURE_RECEIPT.payload)).toEqual(
      FIXTURE_RECEIPT.payload,
    );
    expect(parseSignedReceipt(FIXTURE_RECEIPT)).toEqual(FIXTURE_RECEIPT);
    expect(FIXTURE_QUOTE.signature.value).toHaveLength(86);
  });

  it("injects time, nonce, and invocation ids without randomness", () => {
    const clock = new FixedClock("2026-01-02T03:04:05.000Z");
    const ids = new DeterministicIds(41);
    expect(clock.now().toISOString()).toBe("2026-01-02T03:04:05.000Z");
    clock.advance(2_000);
    expect(clock.now().toISOString()).toBe("2026-01-02T03:04:07.000Z");
    expect(ids.nonce()).toBe(41n);
    expect(ids.invocationId()).toBe("inv_00000000000000000000000042");
  });
});

describe("payment and chain faults", () => {
  it.each(["verify-reject", "settle-timeout", "settle-revert"] as const)(
    "injects %s",
    async (fault) => {
      const facilitator = new FakeFacilitator({ fault });
      if (fault === "verify-reject") {
        await expect(
          facilitator.verify({
            paymentHeader: FIXTURE_PAYMENT_HEADER,
            method: "POST",
            url: "https://runtime.test/invocations",
          }),
        ).rejects.toThrow("VERIFY_REJECTED");
      } else {
        const verified = await facilitator.verify({
          paymentHeader: FIXTURE_PAYMENT_HEADER,
          method: "POST",
          url: "https://runtime.test/invocations",
        });
        await expect(facilitator.settle(verified)).rejects.toThrow(
          fault === "settle-timeout" ? "SETTLE_TIMEOUT" : "SETTLE_REVERTED",
        );
      }
    },
  );

  it("settles once and finds or misses AuthorizationUsed", async () => {
    const facilitator = new FakeFacilitator();
    const verified = await facilitator.verify({
      paymentHeader: FIXTURE_PAYMENT_HEADER,
      method: "POST",
      url: "https://runtime.test/invocations",
    });
    await expect(facilitator.settle(verified)).resolves.toMatchObject({
      success: true,
    });
    expect(facilitator.settleCount).toBe(1);

    const chain = new FakeChain();
    chain.recordAuthorizationUsed("inv_00000000000000000000000001");
    expect(chain.hasAuthorizationUsed("inv_00000000000000000000000001")).toBe(
      true,
    );
    expect(chain.hasAuthorizationUsed("inv_00000000000000000000000002")).toBe(
      false,
    );
  });
});

describe("queue, storage, and wallet faults", () => {
  it("deduplicates queue delivery and injects D1/R2 failures", async () => {
    const queue = new FakeQueue();
    expect(queue.send({ invocationId: "inv_1" })).toBe("enqueued");
    expect(queue.send({ invocationId: "inv_1" })).toBe("duplicate");

    await expect(new FakeStore("d1-failure").put("key", {})).rejects.toThrow(
      "D1_FAILURE",
    );
    await expect(new FakeStore("r2-failure").get("key")).rejects.toThrow(
      "R2_FAILURE",
    );
  });

  it.each([
    ["wallet-refusal", "WALLET_REFUSED"],
    ["wrong-chain", "WRONG_CHAIN"],
    ["insufficient-funds", "INSUFFICIENT_FUNDS"],
  ] as const)("injects %s", async (fault, message) => {
    await expect(new FakeWallet({ fault }).sign(FIXTURE_QUOTE)).rejects.toThrow(
      message,
    );
  });
});
