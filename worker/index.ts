import {
  activeTransactionsForDate,
  createTransaction,
  findByClientRequestId,
  todayJst,
  transactionsForDate,
  updateTransaction,
  voidTransaction
} from "./db";
import { type CartItems, type Env, type ItemKey, ITEM_KEYS, cartAmount } from "./types";

type ApiError = {
  error: string;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message } satisfies ApiError, status);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function cookieName(env: Env): string {
  return env.AUTH_COOKIE_NAME?.trim() || "reception_auth";
}

function cookieMaxAge(env: Env): number {
  const raw = env.AUTH_COOKIE_MAX_AGE_SECONDS?.trim();
  if (!raw) return 604800;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 604800;
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}

async function isAuthenticated(req: Request, env: Env): Promise<boolean> {
  if (!env.RECEPTION_PIN) return false;
  return readCookie(req, cookieName(env)) === await sha256(env.RECEPTION_PIN);
}

async function withCookie(data: unknown, env: Env): Promise<Response> {
  const response = json(data);
  response.headers.set(
    "Set-Cookie",
    `${cookieName(env)}=${await sha256(env.RECEPTION_PIN)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${cookieMaxAge(env)}; Secure`
  );
  return response;
}

function parseDate(url: URL): string {
  return url.searchParams.get("date") || todayJst();
}

function assertItems(value: unknown): CartItems | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const result = {} as CartItems;
  for (const key of ITEM_KEYS as readonly ItemKey[]) {
    const count = Number(source[key]);
    if (!Number.isInteger(count) || count < 0 || count > 999) return null;
    result[key] = count;
  }
  return result;
}

async function buildSummary(env: Env, date: string) {
  const rows = await activeTransactionsForDate(env.DB, date);
  const totals: CartItems = { adult: 0, child: 0, lottery: 0, free: 0 };
  const hourly: Record<string, number> = {};

  for (const row of rows) {
    totals.adult += row.adult;
    totals.child += row.child;
    totals.lottery += row.lottery;
    totals.free += row.free;
    hourly[row.createdHour] = (hourly[row.createdHour] || 0) + row.adult + row.child + row.free;
  }

  return {
    date,
    totals,
    groups: rows.length,
    people: totals.adult + totals.child + totals.free,
    totalRevenue: cartAmount(totals),
    hourly,
    history: await transactionsForDate(env.DB, date, 20)
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function csvForDate(env: Env, date: string): Promise<Response> {
  const rows = await transactionsForDate(env.DB, date, 10000);
  const header = [
    "id",
    "createdAt",
    "businessDate",
    "terminalId",
    "adult",
    "child",
    "lottery",
    "free",
    "amount",
    "voided",
    "voidedAt",
    "editedAt"
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.createdAt,
      row.businessDate,
      row.terminalId,
      row.adult,
      row.child,
      row.lottery,
      row.free,
      row.amount,
      row.voided,
      row.voidedAt ?? "",
      row.editedAt ?? ""
    ].map(csvEscape).join(",")
  );
  return new Response([header.join(","), ...body].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${date}.csv"`
    }
  });
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return json({ ok: true });

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { pin?: string } | null;
    if (!env.RECEPTION_PIN || !body?.pin || await sha256(body.pin) !== await sha256(env.RECEPTION_PIN)) {
      return error("PINが正しくありません。", 401);
    }
    return withCookie({ ok: true }, env);
  }

  if (!await isAuthenticated(req, env)) return error("認証が必要です。", 401);

  if (url.pathname === "/api/summary" && req.method === "GET") {
    return json(await buildSummary(env, parseDate(url)));
  }

  if (url.pathname === "/api/transactions" && req.method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    return json({ transactions: await transactionsForDate(env.DB, parseDate(url), limit) });
  }

  if (url.pathname === "/api/transactions" && req.method === "POST") {
    const body = await req.json().catch(() => null) as {
      clientRequestId?: string;
      terminalId?: string;
      items?: unknown;
    } | null;
    if (!body?.clientRequestId || !body.terminalId) return error("会計データが不足しています。");
    const items = assertItems(body.items);
    if (!items) return error("商品数量が不正です。");
    if (Object.values(items).every((count) => count === 0)) return error("空の会計は登録できません。");

    const existing = await findByClientRequestId(env.DB, body.clientRequestId);
    if (existing) return json({ transaction: existing, duplicate: true });

    const transaction = await createTransaction(env.DB, {
      clientRequestId: body.clientRequestId,
      terminalId: body.terminalId.trim().slice(0, 40) || "受付",
      items
    });
    return json({ transaction, duplicate: false }, 201);
  }

  const voidMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)\/void$/);
  if (voidMatch && req.method === "POST") {
    if (!await voidTransaction(env.DB, voidMatch[1])) return error("取消対象が見つかりません。", 404);
    return json({ ok: true });
  }

  const updateMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
  if (updateMatch && req.method === "PUT") {
    const body = await req.json().catch(() => null) as { items?: unknown } | null;
    const items = assertItems(body?.items);
    if (!items) return error("商品数量が不正です。");
    if (Object.values(items).every((count) => count === 0)) {
      return error("空の会計には編集できません。取消を使ってください。");
    }
    const transaction = await updateTransaction(env.DB, updateMatch[1], items);
    if (!transaction) return error("編集対象が見つからないか、取消済みです。", 404);
    return json({ transaction });
  }

  if (url.pathname === "/api/export.csv" && req.method === "GET") {
    return csvForDate(env, parseDate(url));
  }

  return error("APIが見つかりません。", 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api(req, env, url);
    return env.ASSETS.fetch(req);
  }
};
