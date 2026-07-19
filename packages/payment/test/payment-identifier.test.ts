import { encodePaymentSignatureHeader } from "@x402/core/http";
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions,
  declarePaymentIdentifierExtension,
} from "@x402/extensions/payment-identifier";
import { describe, expect, test } from "vitest";

import { readOfficialPaymentIdentifier } from "../src/payment-identifier";

test("reads and validates the official payment-identifier extension", () => {
  const extensions = {
    [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
  };
  appendPaymentIdentifierToExtensions(
    extensions,
    "inv_01J00000000000000000000000",
  );
  const header = encodePaymentSignatureHeader({
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: "eip155:84532",
      asset: `0x${"a".repeat(40)}`,
      amount: "10000",
      payTo: `0x${"b".repeat(40)}`,
      maxTimeoutSeconds: 300,
      extra: {},
    },
    payload: {},
    extensions,
  });

  expect(readOfficialPaymentIdentifier(header)).toBe(
    "inv_01J00000000000000000000000",
  );
});

describe("invalid identifier headers", () => {
  test.each(["not-base64", "e30"])("returns null for %s", (header) => {
    expect(readOfficialPaymentIdentifier(header)).toBeNull();
  });
});
