CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,
  terminal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  created_hour INTEGER NOT NULL,
  adult INTEGER NOT NULL CHECK (adult >= 0),
  child INTEGER NOT NULL CHECK (child >= 0),
  lottery INTEGER NOT NULL CHECK (lottery >= 0),
  free INTEGER NOT NULL CHECK (free >= 0),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  voided INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
  voided_at TEXT,
  edited_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_business_date
  ON transactions (business_date, created_at);
