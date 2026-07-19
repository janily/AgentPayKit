import { ClientContractError } from "./release-verifier";

export function parseAtomicAmount(value: string, field = "amount"): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new ClientContractError(`INVALID_${field.toUpperCase()}`);
  }
  return BigInt(value);
}

export class BudgetExceededError extends ClientContractError {
  constructor(public readonly reason: "SINGLE_LIMIT" | "DAILY_LIMIT") {
    super("BUDGET_EXCEEDED");
    this.name = "BudgetExceededError";
  }
}

export class BudgetPolicy {
  readonly singleLimit: bigint;
  readonly dailyLimit: bigint;

  constructor(input: { singleLimit: string; dailyLimit: string }) {
    this.singleLimit = parseAtomicAmount(input.singleLimit, "single_limit");
    this.dailyLimit = parseAtomicAmount(input.dailyLimit, "daily_limit");
    if (this.singleLimit > this.dailyLimit) {
      throw new ClientContractError("INVALID_BUDGET_POLICY");
    }
  }

  assertReservation(amount: bigint, alreadyCommitted: bigint): void {
    if (amount > this.singleLimit) {
      throw new BudgetExceededError("SINGLE_LIMIT");
    }
    if (alreadyCommitted + amount > this.dailyLimit) {
      throw new BudgetExceededError("DAILY_LIMIT");
    }
  }
}
