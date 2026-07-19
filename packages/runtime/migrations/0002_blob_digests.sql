ALTER TABLE invocations ADD COLUMN input_blob_digest TEXT NOT NULL DEFAULT '';
ALTER TABLE invocations ADD COLUMN payment_blob_digest TEXT NOT NULL DEFAULT '';
