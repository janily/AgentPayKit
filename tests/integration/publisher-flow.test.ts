import { decodePaymentRequiredHeader } from "@x402/core/http";
import { describe, expect, it } from "vitest";

import { createPaidServerFixture } from "./fixtures/paid-server";

describe("local paid Skill publisher flow", () => {
  it("returns an official v2 challenge without executing or contacting the facilitator", async () => {
    const fixture = createPaidServerFixture();

    const response = await fixture.unsignedRequest();

    expect(response.status).toBe(402);
    const header = response.headers.get("payment-required");
    expect(header).not.toBeNull();
    expect(decodePaymentRequiredHeader(header!)).toMatchObject({
      x402Version: 2,
      accepts: [{ scheme: "exact", amount: "50000" }],
    });
    expect(fixture.counters).toEqual({
      unsignedRequests: 1,
      signedRequests: 0,
      handlerExecutions: 0,
      verifyCalls: 0,
      settleCalls: 0,
      signatureRequests: 0,
    });
  });

  it.each([
    ["0.001", "1000"],
    ["0.05", "50000"],
    ["0.2", "200000"],
  ])(
    "round-trips the %s USDC quote as %s atomic units",
    async (price, atomic) => {
      const fixture = createPaidServerFixture({ price });

      const response = await fixture.unsignedRequest();
      const challenge = decodePaymentRequiredHeader(
        response.headers.get("payment-required")!,
      );

      expect(challenge.accepts).toHaveLength(1);
      expect(challenge.accepts[0]?.amount).toBe(atomic);
    },
  );
});
