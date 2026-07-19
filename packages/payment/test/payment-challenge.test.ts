import { decodePaymentRequiredHeader } from "@x402/core/http";
import { describe, expect, test, vi } from "vitest";

import { PaymentChallengeIssuer } from "../src/payment-challenge";

test("builds an official v2 challenge requiring payment-identifier", async () => {
  const buildPaymentRequirementsFromOptions = vi.fn(async () => [
    {
      scheme: "exact",
      network: "eip155:84532",
      asset: `0x${"a".repeat(40)}`,
      amount: "10000",
      payTo: `0x${"b".repeat(40)}`,
      maxTimeoutSeconds: 300,
      extra: {},
    },
  ]);
  const createPaymentRequiredResponse = vi.fn(
    async (accepts, resource, _error, extensions) => ({
      x402Version: 2,
      accepts,
      resource,
      extensions,
    }),
  );
  const issuer = new PaymentChallengeIssuer(
    { buildPaymentRequirementsFromOptions, createPaymentRequiredResponse },
    "https://runtime.test/v1/invocations",
  );

  const encoded = await issuer.issue({
    network: "eip155:84532",
    amount: "10000",
    asset: `0x${"a".repeat(40)}`,
    payee: `0x${"b".repeat(40)}`,
  });
  const challenge = decodePaymentRequiredHeader(encoded);

  expect(challenge.x402Version).toBe(2);
  expect(challenge.extensions?.["payment-identifier"]).toMatchObject({
    info: { required: true },
  });
  expect(buildPaymentRequirementsFromOptions).toHaveBeenCalledWith(
    [
      {
        scheme: "exact",
        network: "eip155:84532",
        payTo: `0x${"b".repeat(40)}`,
        price: { amount: "10000", asset: `0x${"a".repeat(40)}` },
      },
    ],
    {},
  );
});
