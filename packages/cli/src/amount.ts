const USDC_SCALE = 1_000_000n;
const USDC_AMOUNT = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;
export const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_USDC_WHOLE_DIGITS = (MAX_UINT256 / USDC_SCALE).toString().length;

export function parseMaxPrice(value: string): bigint {
  const match = USDC_AMOUNT.exec(value);

  if (match === null || match[1]!.length > MAX_USDC_WHOLE_DIGITS) {
    throw new Error("INVALID_MAX_PRICE");
  }

  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  const atomic = whole * USDC_SCALE + fraction;

  if (atomic === 0n || atomic > MAX_UINT256) {
    throw new Error("INVALID_MAX_PRICE");
  }

  return atomic;
}
