ALTER TABLE releases ADD COLUMN maximum_execution_ms INTEGER NOT NULL DEFAULT 300000 CHECK (maximum_execution_ms > 0 AND maximum_execution_ms <= 900000);
