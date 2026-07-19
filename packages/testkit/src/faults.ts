export type FacilitatorFault =
  "verify-reject" | "settle-timeout" | "settle-revert";

export type WalletFault =
  "wallet-refusal" | "wrong-chain" | "insufficient-funds";

export type StoreFault = "d1-failure" | "r2-failure";

export class FixedClock {
  private timestamp: number;

  constructor(iso: string) {
    this.timestamp = new Date(iso).getTime();
    if (!Number.isFinite(this.timestamp)) throw new TypeError("INVALID_TIME");
  }

  now(): Date {
    return new Date(this.timestamp);
  }

  advance(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new TypeError("INVALID_TIME_ADVANCE");
    }
    this.timestamp += milliseconds;
  }
}

export class DeterministicIds {
  constructor(private sequence = 0) {}

  nonce(): bigint {
    const current = BigInt(this.sequence);
    this.sequence += 1;
    return current;
  }

  invocationId(): `inv_${string}` {
    const value = this.sequence.toString().padStart(26, "0");
    this.sequence += 1;
    return `inv_${value}`;
  }
}
