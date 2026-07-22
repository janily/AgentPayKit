const USDC_SCALE = 1_000_000n;
const USDC_PRICE = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;

export function usdcToAtomic(value: string): bigint {
  const match = USDC_PRICE.exec(value);

  if (match === null) {
    throw new Error("INVALID_USDC_PRICE");
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  const atomic = whole * USDC_SCALE + fraction;

  if (atomic === 0n) {
    throw new Error("INVALID_USDC_PRICE");
  }

  return atomic;
}

export function atomicToUsdc(value: bigint): string {
  if (value <= 0n) {
    throw new Error("INVALID_USDC_ATOMIC");
  }

  const whole = value / USDC_SCALE;
  const fraction = (value % USDC_SCALE)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");

  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}
