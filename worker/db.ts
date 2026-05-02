import { type CartItems, type TransactionRow, cartAmount } from "./types";

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

export function todayJst(): string {
  return jstParts().businessDate;
}

export async function createTransaction(
  db: D1Database,
  input: { clientRequestId: string; terminalId: string; items: CartItems }
): Promise<TransactionRow> {
  const now = new Date();
  const { businessDate, createdHour } = jstParts(now);
  const row: TransactionRow = {
    id: crypto.randomUUID(),
    clientRequestId: input.clientRequestId,
    terminalId: input.terminalId,
    createdAt: now.toISOString(),
    businessDate,
    createdHour,
    amount: cartAmount(input.items),
    voided: 0,
    voidedAt: null,
    editedAt: null,
    ...input.items
  };

  await db.prepare(`
    INSERT INTO transactions (
      id, client_request_id, terminal_id, created_at, business_date, created_hour,
      adult, child, lottery, free, amount, voided, voided_at, edited_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
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
  ).run();

  return row;
}

export async function findByClientRequestId(
  db: D1Database,
  clientRequestId: string
): Promise<TransactionRow | null> {
  const row = await db.prepare(
    "SELECT * FROM transactions WHERE client_request_id = ?"
  ).bind(clientRequestId).first();
  return mapRow(row);
}

export async function findById(db: D1Database, id: string): Promise<TransactionRow | null> {
  const row = await db.prepare("SELECT * FROM transactions WHERE id = ?").bind(id).first();
  return mapRow(row);
}

export async function voidTransaction(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE transactions
    SET voided = 1, voided_at = ?
    WHERE id = ? AND voided = 0
  `).bind(new Date().toISOString(), id).run();
  return result.meta.changes > 0;
}

export async function updateTransaction(
  db: D1Database,
  id: string,
  items: CartItems
): Promise<TransactionRow | null> {
  const editedAt = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE transactions
    SET adult = ?, child = ?, lottery = ?, free = ?, amount = ?, edited_at = ?
    WHERE id = ? AND voided = 0
  `).bind(
    items.adult,
    items.child,
    items.lottery,
    items.free,
    cartAmount(items),
    editedAt,
    id
  ).run();
  if (result.meta.changes === 0) return null;
  return findById(db, id);
}

export async function transactionsForDate(
  db: D1Database,
  date: string,
  limit = 50
): Promise<TransactionRow[]> {
  const result = await db.prepare(`
    SELECT * FROM transactions
    WHERE business_date = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(date, limit).all();
  return result.results.map(mapRow).filter(Boolean) as TransactionRow[];
}

export async function activeTransactionsForDate(
  db: D1Database,
  date: string
): Promise<TransactionRow[]> {
  const result = await db.prepare(`
    SELECT * FROM transactions
    WHERE business_date = ? AND voided = 0
    ORDER BY created_at DESC
  `).bind(date).all();
  return result.results.map(mapRow).filter(Boolean) as TransactionRow[];
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
