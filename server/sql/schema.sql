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
