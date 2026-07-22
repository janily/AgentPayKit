import { describe, expect, it, vi } from "vitest";

import { parseMaxPrice } from "../src/amount";

const MAX_UINT256 = (1n << 256n) - 1n;

function atomicToUsdc(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

describe("parseMaxPrice", () => {
  it.each([
    ["0.000001", 1n],
    ["0.01", 10_000n],
    ["1", 1_000_000n],
    ["12.3456", 12_345_600n],
    ["999999999999999999.999999", 999_999_999_999_999_999_999_999n],
  ])("parses %s USDC using exact atomic bigint arithmetic", (value, atomic) => {
    expect(parseMaxPrice(value)).toBe(atomic);
  });

  it.each([
    "",
    "0",
    "0.000000",
    "0.0000001",
    "01",
    ".1",
    "1.",
    "-1",
    "+1",
    "1e6",
    "NaN",
    " 1",
    "1 ",
  ])("rejects invalid max price %j", (value) => {
    expect(() => parseMaxPrice(value)).toThrow("INVALID_MAX_PRICE");
  });

  it("accepts the largest uint256 atomic maximum", () => {
    expect(parseMaxPrice(atomicToUsdc(MAX_UINT256))).toBe(MAX_UINT256);
  });

  it("rejects a decimal whose atomic value exceeds uint256", () => {
    expect(() => parseMaxPrice(atomicToUsdc(MAX_UINT256 + 1n))).toThrow(
      "INVALID_MAX_PRICE",
    );
  });

  it("rejects an oversized lexical amount before calling BigInt", () => {
    const bigInt = vi.spyOn(globalThis, "BigInt");
    try {
      expect(() => parseMaxPrice("9".repeat(100_000))).toThrow(
        "INVALID_MAX_PRICE",
      );
      expect(bigInt).not.toHaveBeenCalled();
    } finally {
      bigInt.mockRestore();
    }
  });
});
