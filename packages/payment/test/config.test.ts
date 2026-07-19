import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { parsePaymentConfig } from "../src/config";

describe("payment configuration", () => {
  test.each(["eip155:84532", "eip155:8453"] as const)(
    "accepts %s",
    (network) => {
      expect(
        parsePaymentConfig({
          network,
          amount: "10000",
          asset: "0x1111111111111111111111111111111111111111",
          payee: "0x2222222222222222222222222222222222222222",
          facilitatorUrl: "https://facilitator.example",
        }).network,
      ).toBe(network);
    },
  );

  test("rejects unsupported networks, numeric amounts and malformed addresses", () => {
    expect(() =>
      parsePaymentConfig({
        network: "eip155:1",
        amount: 10_000,
        asset: "USDC",
        payee: "0x123",
        facilitatorUrl: "https://facilitator.example",
      }),
    ).toThrow();
  });

  test("pins every official x402 package to 2.19.0", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(import.meta.dirname, "../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const officialPackages = [
      "@x402/core",
      "@x402/evm",
      "@x402/hono",
      "@x402/fetch",
      "@x402/extensions",
    ];

    expect(
      officialPackages.map((name) => manifest.dependencies?.[name]),
    ).toEqual(officialPackages.map(() => "2.19.0"));
  });
});
