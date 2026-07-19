ALTER TABLE invocations ADD COLUMN execution_started_at TEXT;
ALTER TABLE invocations ADD COLUMN executed_at TEXT;
ALTER TABLE invocations ADD COLUMN settled_at TEXT;
ALTER TABLE invocations ADD COLUMN result_expires_at TEXT;
ALTER TABLE invocations ADD COLUMN input_deleted_at TEXT;
ALTER TABLE invocations ADD COLUMN metadata_expires_at TEXT;
