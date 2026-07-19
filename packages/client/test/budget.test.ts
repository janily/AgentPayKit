import { describe, expect, test } from "vitest";

import {
  BudgetExceededError,
  BudgetStore,
  ReservationService,
} from "../src/index";

const day = new Date("2026-07-19T12:00:00.000Z");

function fixture(singleLimit = "25", dailyLimit = "50") {
  const store = new BudgetStore(":memory:");
  store.configure({ singleLimit, dailyLimit });
  return { store, reservations: new ReservationService(store) };
}

describe("transactional local budgets", () => {
  test("enforces the per-invocation limit before creating a reservation", async () => {
    const built = fixture("10", "100");

    await expect(
      built.reservations.reserve({
        invocationId: "inv_too_large",
        amount: "11",
        now: day,
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(built.reservations.summary(day)).toEqual({
      limit: "100",
      spent: "0",
      held: "0",
      available: "100",
    });
    built.store.close();
  });

  test("never overspends under 100 concurrent reservations", async () => {
    const built = fixture("1", "50");
    const outcomes = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        built.reservations.reserve({
          invocationId: `inv_${index.toString().padStart(3, "0")}`,
          amount: "1",
          now: day,
        }),
      ),
    );

    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(50);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      50,
    );
    expect(built.reservations.summary(day)).toEqual({
      limit: "50",
      spent: "0",
      held: "50",
      available: "0",
    });
    built.store.close();
  });

  test("releases reservations and accounts settled receipts exactly once", async () => {
    const built = fixture();
    await built.reservations.reserve({
      invocationId: "inv_released",
      amount: "10",
      now: day,
    });
    await built.reservations.release("inv_released");
    await built.reservations.reserve({
      invocationId: "inv_settled",
      amount: "20",
      now: day,
    });
    await built.reservations.authorize("inv_settled");
    await built.reservations.settle("inv_settled", `sha256:${"a".repeat(64)}`);
    await built.reservations.settle("inv_settled", `sha256:${"a".repeat(64)}`);

    expect(built.reservations.summary(day)).toEqual({
      limit: "50",
      spent: "20",
      held: "0",
      available: "30",
    });
    built.store.close();
  });

  test("keeps unknown settlements reserved until reconciliation", async () => {
    const built = fixture();
    await built.reservations.reserve({
      invocationId: "inv_unknown",
      amount: "15",
      now: day,
    });
    await built.reservations.authorize("inv_unknown");
    await built.reservations.markUnknown("inv_unknown");

    expect(built.reservations.summary(day)).toEqual({
      limit: "50",
      spent: "0",
      held: "15",
      available: "35",
    });
    await built.reservations.release("inv_unknown");
    expect(built.reservations.summary(day).held).toBe("0");
    built.store.close();
  });

  test("does not book one receipt digest for two invocations", async () => {
    const built = fixture();
    const receiptDigest = `sha256:${"f".repeat(64)}`;
    for (const invocationId of ["inv_first", "inv_second"]) {
      await built.reservations.reserve({
        invocationId,
        amount: "10",
        now: day,
      });
      await built.reservations.authorize(invocationId);
    }
    await built.reservations.settle("inv_first", receiptDigest);

    await expect(
      built.reservations.settle("inv_second", receiptDigest),
    ).rejects.toThrow();
    expect(built.reservations.summary(day)).toEqual({
      limit: "50",
      spent: "10",
      held: "10",
      available: "30",
    });
    built.store.close();
  });

  test("schema contains no raw input, payment payload, or wallet secret fields", () => {
    const built = fixture();
    const schema = built.store.schema().toLowerCase();
    expect(schema).not.toMatch(
      /raw_input|payment_payload|private_key|mnemonic|seed/,
    );
    built.store.close();
  });
});
