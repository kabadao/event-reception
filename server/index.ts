import {
  type CartItems,
  type ItemKey,
  activeTransactionsForDate,
  cartAmount,
  createTransaction,
  findByClientRequestId,
  todayJst,
  transactionsForDate,
  updateTransaction,
  voidTransaction
} from "./db";
import { config, isProduction } from "./config";

const AUTH_VALUE = await sha256(config.receptionPin);

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

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}

function isAuthenticated(req: Request): boolean {
  return readCookie(req, config.authCookieName) === AUTH_VALUE;
}

function withCookie(data: unknown): Response {
  const response = json(data);
  const secure = isProduction ? "; Secure" : "";
  response.headers.set(
    "Set-Cookie",
    `${config.authCookieName}=${AUTH_VALUE}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.authCookieMaxAgeSeconds}${secure}`
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
  for (const key of ["adult", "child", "lottery", "free"] as ItemKey[]) {
    const count = Number(source[key]);
    if (!Number.isInteger(count) || count < 0 || count > 999) return null;
    result[key] = count;
  }
  return result;
}

function buildSummary(date: string) {
  const rows = activeTransactionsForDate(date);
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
    history: transactionsForDate(date, 20)
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvForDate(date: string): Response {
  const rows = transactionsForDate(date, 10000);
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

async function api(req: Request, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return json({ ok: true });

  if (url.pathname === "/api/login" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { pin?: string } | null;
    if (!body?.pin || await sha256(body.pin) !== AUTH_VALUE) {
      return error("PINが正しくありません。", 401);
    }
    return withCookie({ ok: true });
  }

  if (!isAuthenticated(req)) return error("認証が必要です。", 401);

  if (url.pathname === "/api/summary" && req.method === "GET") {
    return json(buildSummary(parseDate(url)));
  }

  if (url.pathname === "/api/transactions" && req.method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    return json({ transactions: transactionsForDate(parseDate(url), limit) });
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

    const existing = findByClientRequestId(body.clientRequestId);
    if (existing) return json({ transaction: existing, duplicate: true });

    const transaction = createTransaction({
      clientRequestId: body.clientRequestId,
      terminalId: body.terminalId.trim().slice(0, 40) || "受付",
      items
    });
    return json({ transaction, duplicate: false }, 201);
  }

  const voidMatch = url.pathname.match(/^\/api\/transactions\/([^/]+)\/void$/);
  if (voidMatch && req.method === "POST") {
    if (!voidTransaction(voidMatch[1])) return error("取消対象が見つかりません。", 404);
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
    const transaction = updateTransaction(updateMatch[1], items);
    if (!transaction) return error("編集対象が見つからないか、取消済みです。", 404);
    return json({ transaction });
  }

  if (url.pathname === "/api/export.csv" && req.method === "GET") {
    return csvForDate(parseDate(url));
  }

  return error("APIが見つかりません。", 404);
}

async function staticFile(url: URL): Promise<Response> {
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(`dist${path}`);
  if (await file.exists()) return new Response(file);
  const fallback = Bun.file("dist/index.html");
  if (await fallback.exists()) return new Response(fallback, { headers: { "Content-Type": "text/html" } });
  return error("dist が見つかりません。先に bun run build を実行してください。", 404);
}

Bun.serve({
  port: config.port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api(req, url);
    return staticFile(url);
  }
});

console.log(`Reception server listening on http://localhost:${config.port}`);
