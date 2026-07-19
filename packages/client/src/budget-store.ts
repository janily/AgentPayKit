import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

import { BudgetPolicy } from "./budget-policy";
import { LOCAL_BUDGET_SCHEMA } from "./local-schema";

const { DatabaseSync: NodeDatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

export type ReservationState =
  "reserved" | "authorized" | "settled" | "released" | "unknown";

export interface ReservationRecord {
  invocationId: string;
  amount: string;
  budgetDay: string;
  state: ReservationState;
  receiptDigest?: string;
  createdAt: string;
  updatedAt: string;
}

interface ReservationRow {
  invocation_id: string;
  amount: string;
  budget_day: string;
  state: ReservationState;
  receipt_digest: string | null;
  created_at: string;
  updated_at: string;
}

function record(row: ReservationRow): ReservationRecord {
  return {
    invocationId: row.invocation_id,
    amount: row.amount,
    budgetDay: row.budget_day,
    state: row.state,
    ...(row.receipt_digest ? { receiptDigest: row.receipt_digest } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BudgetStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new NodeDatabaseSync(path);
    this.database.exec(LOCAL_BUDGET_SCHEMA);
  }

  configure(input: { singleLimit: string; dailyLimit: string }): void {
    const policy = new BudgetPolicy(input);
    this.database
      .prepare(
        `INSERT INTO budget_policy (id, single_limit, daily_limit, updated_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           single_limit = excluded.single_limit,
           daily_limit = excluded.daily_limit,
           updated_at = excluded.updated_at`,
      )
      .run(
        policy.singleLimit.toString(),
        policy.dailyLimit.toString(),
        new Date().toISOString(),
      );
  }

  policy(): BudgetPolicy {
    const row = this.database
      .prepare(
        "SELECT single_limit, daily_limit FROM budget_policy WHERE id = 1",
      )
      .get() as { single_limit: string; daily_limit: string } | undefined;
    if (!row) throw new Error("BUDGET_POLICY_NOT_CONFIGURED");
    return new BudgetPolicy({
      singleLimit: row.single_limit,
      dailyLimit: row.daily_limit,
    });
  }

  transaction<Value>(operation: () => Value): Value {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  get(invocationId: string): ReservationRecord | undefined {
    const row = this.database
      .prepare("SELECT * FROM budget_reservations WHERE invocation_id = ?")
      .get(invocationId) as ReservationRow | undefined;
    return row ? record(row) : undefined;
  }

  forDay(day: string): ReservationRecord[] {
    return (
      this.database
        .prepare("SELECT * FROM budget_reservations WHERE budget_day = ?")
        .all(day) as unknown as ReservationRow[]
    ).map(record);
  }

  insert(input: ReservationRecord): void {
    this.database
      .prepare(
        `INSERT INTO budget_reservations
          (invocation_id, amount, budget_day, state, receipt_digest, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.invocationId,
        input.amount,
        input.budgetDay,
        input.state,
        input.receiptDigest ?? null,
        input.createdAt,
        input.updatedAt,
      );
  }

  update(input: {
    invocationId: string;
    state: ReservationState;
    receiptDigest?: string;
    now: string;
  }): void {
    this.database
      .prepare(
        `UPDATE budget_reservations
         SET state = ?, receipt_digest = COALESCE(?, receipt_digest), updated_at = ?
         WHERE invocation_id = ?`,
      )
      .run(
        input.state,
        input.receiptDigest ?? null,
        input.now,
        input.invocationId,
      );
  }

  schema(): string {
    const rows = this.database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
      )
      .all() as unknown as Array<{ sql: string }>;
    return rows.map(({ sql }) => sql).join("\n");
  }

  close(): void {
    this.database.close();
  }
}
