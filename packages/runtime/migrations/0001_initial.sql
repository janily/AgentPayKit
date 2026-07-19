CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  package_digest TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('eip155:84532', 'eip155:8453')),
  created_at TEXT NOT NULL
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL UNIQUE,
  release_id TEXT NOT NULL REFERENCES releases(id),
  input_digest TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('testnet', 'mainnet')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE invocations (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  release_id TEXT NOT NULL REFERENCES releases(id),
  input_digest TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'QUOTED', 'PAYMENT_VERIFIED', 'QUEUED', 'EXECUTING', 'FAILED_NOT_CHARGED',
    'POLICY_REJECTED', 'READY_TO_SETTLE', 'SETTLING', 'SETTLEMENT_UNKNOWN',
    'RESULT_AVAILABLE', 'RESULT_EXPIRED'
  )),
  charge_state TEXT NOT NULL CHECK (charge_state IN ('NOT_CHARGED', 'CHARGED', 'SETTLEMENT_UNKNOWN')),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  input_blob_key TEXT NOT NULL,
  payment_blob_key TEXT NOT NULL,
  candidate_result_blob_key TEXT,
  result_blob_key TEXT,
  result_digest TEXT,
  transaction_hash TEXT,
  error_code TEXT,
  trace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX invocations_status_updated_idx ON invocations(status, updated_at);

CREATE TABLE receipts (
  invocation_id TEXT PRIMARY KEY REFERENCES invocations(id),
  receipt_blob_key TEXT NOT NULL,
  receipt_digest TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
