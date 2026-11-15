-- Penny database schema. Safe to run more than once (IF NOT EXISTS).

-- One row per uploaded receipt photo
CREATE TABLE IF NOT EXISTS receipts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw         JSONB NOT NULL
);

-- One row per purchase (per category, for receipts)
CREATE TABLE IF NOT EXISTS transactions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY,
  spent_at   TIMESTAMPTZ NOT NULL,
  merchant   TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN (
               'Groceries','Dining','Transport','Shopping','Health',
               'Bills & Utilities','Entertainment','Subscriptions',
               'Travel','Education','Other')),
  amount     NUMERIC(10,2) NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('receipt','csv','seed')),
  receipt_id BIGINT REFERENCES receipts(id) ON DELETE CASCADE,
  PRIMARY KEY (id, spent_at)
);

-- Turn transactions into a TimescaleDB hypertable, organized by time
SELECT create_hypertable('transactions', by_range('spent_at'), if_not_exists => TRUE);

-- Update (Nov 14): bank statement imports.
-- Allow 'statement' as a source (replace the old rule for databases created before this).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('receipt','csv','seed','statement'));

-- One row per imported statement; its transactions point back to it with import_id.
-- (Kept separate from receipts so a statement's 40 rows don't count as one "visit".)
CREATE TABLE IF NOT EXISTS imports (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bank         TEXT,
  period_start DATE,
  period_end   DATE
);
ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS raw JSONB;   -- what Gemini read + what the user kept
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id BIGINT REFERENCES imports(id) ON DELETE CASCADE;
