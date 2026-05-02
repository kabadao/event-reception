import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config";

export type ItemKey = "adult" | "child" | "lottery" | "free";

export type CartItems = Record<ItemKey, number>;

export type TransactionRow = CartItems & {
  id: string;
  clientRequestId: string;
  terminalId: string;
  createdAt: string;
  businessDate: string;
  createdHour: number;
  amount: number;
  voided: 0 | 1;
  voidedAt: string | null;
  editedAt: string | null;
};

export const PRICES: CartItems = {
  adult: 800,
  child: 600,
  lottery: 500,
  free: 0
};

export function cartAmount(items: CartItems): number {
  return Object.entries(items).reduce(
    (sum, [key, count]) => sum + PRICES[key as ItemKey] * count,
    0
  );
}

function jstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    businessDate: `${value("year")}-${value("month")}-${value("day")}`,
    createdHour: Number(value("hour"))
  };
}

const databasePath = config.databasePath;
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

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
    voided_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_business_date
    ON transactions (business_date, created_at);
`);

const columns = db.query("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
if (!columns.some((column) => column.name === "edited_at")) {
  db.exec("ALTER TABLE transactions ADD COLUMN edited_at TEXT");
}

export function todayJst(): string {
  return jstParts().businessDate;
}

export function createTransaction(input: {
  clientRequestId: string;
  terminalId: string;
  items: CartItems;
}): TransactionRow {
  const now = new Date();
  const { businessDate, createdHour } = jstParts(now);
  const amount = cartAmount(input.items);

  const row = {
    id: crypto.randomUUID(),
    clientRequestId: input.clientRequestId,
    terminalId: input.terminalId,
    createdAt: now.toISOString(),
    businessDate,
    createdHour,
    amount,
    voided: 0 as const,
    voidedAt: null,
    editedAt: null,
    ...input.items
  };

  db.query(`
    INSERT INTO transactions (
      id, client_request_id, terminal_id, created_at, business_date, created_hour,
      adult, child, lottery, free, amount, voided, voided_at, edited_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    row.id,
    row.clientRequestId,
    row.terminalId,
    row.createdAt,
    row.businessDate,
    row.createdHour,
    row.adult,
    row.child,
    row.lottery,
    row.free,
    row.amount,
    row.voided,
    row.voidedAt,
    row.editedAt
  );

  return row;
}

export function findByClientRequestId(clientRequestId: string): TransactionRow | null {
  return mapRow(
    db.query("SELECT * FROM transactions WHERE client_request_id = ?").get(clientRequestId)
  );
}

export function voidTransaction(id: string): boolean {
  const result = db.query(`
    UPDATE transactions
    SET voided = 1, voided_at = ?
    WHERE id = ? AND voided = 0
  `).run(new Date().toISOString(), id);
  return result.changes > 0;
}

export function updateTransaction(id: string, items: CartItems): TransactionRow | null {
  const amount = cartAmount(items);
  const editedAt = new Date().toISOString();
  const result = db.query(`
    UPDATE transactions
    SET adult = ?, child = ?, lottery = ?, free = ?, amount = ?, edited_at = ?
    WHERE id = ? AND voided = 0
  `).run(items.adult, items.child, items.lottery, items.free, amount, editedAt, id);
  if (result.changes === 0) return null;
  return findById(id);
}

export function findById(id: string): TransactionRow | null {
  return mapRow(db.query("SELECT * FROM transactions WHERE id = ?").get(id));
}

export function transactionsForDate(date: string, limit = 50): TransactionRow[] {
  return db.query(`
    SELECT * FROM transactions
    WHERE business_date = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(date, limit).map(mapRow).filter(Boolean) as TransactionRow[];
}

export function activeTransactionsForDate(date: string): TransactionRow[] {
  return db.query(`
    SELECT * FROM transactions
    WHERE business_date = ? AND voided = 0
    ORDER BY created_at DESC
  `).all(date).map(mapRow).filter(Boolean) as TransactionRow[];
}

function mapRow(row: unknown): TransactionRow | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return {
    id: String(record.id),
    clientRequestId: String(record.client_request_id),
    terminalId: String(record.terminal_id),
    createdAt: String(record.created_at),
    businessDate: String(record.business_date),
    createdHour: Number(record.created_hour),
    adult: Number(record.adult),
    child: Number(record.child),
    lottery: Number(record.lottery),
    free: Number(record.free),
    amount: Number(record.amount),
    voided: Number(record.voided) as 0 | 1,
    voidedAt: record.voided_at ? String(record.voided_at) : null,
    editedAt: record.edited_at ? String(record.edited_at) : null
  };
}
