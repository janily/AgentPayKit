import { BudgetExceededError, parseAtomicAmount } from "./budget-policy";
import {
  BudgetStore,
  type ReservationRecord,
  type ReservationState,
} from "./budget-store";
import { ClientContractError } from "./release-verifier";

const heldStates = new Set<ReservationState>([
  "reserved",
  "authorized",
  "unknown",
]);

function budgetDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class ReservationService {
  constructor(private readonly store: BudgetStore) {}

  async reserve(input: {
    invocationId: string;
    amount: string;
    now: Date;
  }): Promise<ReservationRecord> {
    const amount = parseAtomicAmount(input.amount);
    return this.store.transaction(() => {
      const existing = this.store.get(input.invocationId);
      if (existing) {
        if (existing.amount !== amount.toString()) {
          throw new ClientContractError("RESERVATION_BINDING_CONFLICT");
        }
        return existing;
      }
      const day = budgetDay(input.now);
      const committed = this.store
        .forDay(day)
        .filter((reservation) => reservation.state !== "released")
        .reduce(
          (total, reservation) => total + parseAtomicAmount(reservation.amount),
          0n,
        );
      this.store.policy().assertReservation(amount, committed);
      const now = input.now.toISOString();
      const reservation: ReservationRecord = {
        invocationId: input.invocationId,
        amount: amount.toString(),
        budgetDay: day,
        state: "reserved",
        createdAt: now,
        updatedAt: now,
      };
      this.store.insert(reservation);
      return reservation;
    });
  }

  async authorize(invocationId: string): Promise<void> {
    this.transition(invocationId, ["reserved", "authorized"], "authorized");
  }

  async markUnknown(invocationId: string): Promise<void> {
    this.transition(
      invocationId,
      ["reserved", "authorized", "unknown"],
      "unknown",
    );
  }

  async release(invocationId: string): Promise<void> {
    this.transition(
      invocationId,
      ["reserved", "authorized", "unknown", "released"],
      "released",
    );
  }

  async settle(invocationId: string, receiptDigest: string): Promise<void> {
    if (!/^sha256:[0-9a-f]{64}$/.test(receiptDigest)) {
      throw new ClientContractError("INVALID_RECEIPT_DIGEST");
    }
    this.store.transaction(() => {
      const reservation = this.required(invocationId);
      if (reservation.state === "settled") {
        if (reservation.receiptDigest !== receiptDigest) {
          throw new ClientContractError("RECEIPT_BINDING_CONFLICT");
        }
        return;
      }
      if (reservation.state === "released") {
        throw new ClientContractError("INVALID_RESERVATION_STATE");
      }
      this.store.update({
        invocationId,
        state: "settled",
        receiptDigest,
        now: new Date().toISOString(),
      });
    });
  }

  summary(now: Date): {
    limit: string;
    spent: string;
    held: string;
    available: string;
  } {
    const reservations = this.store.forDay(budgetDay(now));
    const spent = reservations
      .filter(({ state }) => state === "settled")
      .reduce((total, row) => total + parseAtomicAmount(row.amount), 0n);
    const held = reservations
      .filter(({ state }) => heldStates.has(state))
      .reduce((total, row) => total + parseAtomicAmount(row.amount), 0n);
    const limit = this.store.policy().dailyLimit;
    const available = limit - spent - held;
    if (available < 0n) throw new BudgetExceededError("DAILY_LIMIT");
    return {
      limit: limit.toString(),
      spent: spent.toString(),
      held: held.toString(),
      available: available.toString(),
    };
  }

  private required(invocationId: string): ReservationRecord {
    const reservation = this.store.get(invocationId);
    if (!reservation) throw new ClientContractError("RESERVATION_NOT_FOUND");
    return reservation;
  }

  private transition(
    invocationId: string,
    allowed: ReservationState[],
    state: ReservationState,
  ): void {
    this.store.transaction(() => {
      const reservation = this.required(invocationId);
      if (!allowed.includes(reservation.state)) {
        throw new ClientContractError("INVALID_RESERVATION_STATE");
      }
      if (reservation.state !== state) {
        this.store.update({
          invocationId,
          state,
          now: new Date().toISOString(),
        });
      }
    });
  }
}
