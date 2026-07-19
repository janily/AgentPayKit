export const LOCAL_BUDGET_SCHEMA = `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS budget_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  single_limit TEXT NOT NULL,
  daily_limit TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_reservations (
  invocation_id TEXT PRIMARY KEY,
  amount TEXT NOT NULL,
  budget_day TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('reserved', 'authorized', 'settled', 'released', 'unknown')
  ),
  receipt_digest TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS budget_reservations_day_state_idx
  ON budget_reservations (budget_day, state);
`;
