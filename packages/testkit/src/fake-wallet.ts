import type { WalletFault } from "./faults";

const errors: Record<WalletFault, string> = {
  "wallet-refusal": "WALLET_REFUSED",
  "wrong-chain": "WRONG_CHAIN",
  "insufficient-funds": "INSUFFICIENT_FUNDS",
};

export class FakeWallet {
  signCount = 0;

  constructor(private readonly options: { fault?: WalletFault } = {}) {}

  async sign(_request: unknown): Promise<string> {
    if (this.options.fault) throw new Error(errors[this.options.fault]);
    this.signCount += 1;
    return `test-only-signature:${this.signCount}`;
  }
}
