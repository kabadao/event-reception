import type { CartItems } from "./prices";

export type Transaction = CartItems & {
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

export type Summary = {
  date: string;
  totals: CartItems;
  groups: number;
  people: number;
  totalRevenue: number;
  hourly: Record<string, number>;
  history: Transaction[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload
      ? String(payload.error)
      : "通信に失敗しました。";
    throw new Error(message);
  }

  return payload as T;
}

export function login(pin: string): Promise<{ ok: true }> {
  return request("/api/login", {
    method: "POST",
    body: JSON.stringify({ pin })
  });
}

export function fetchSummary(date: string): Promise<Summary> {
  return request(`/api/summary?date=${encodeURIComponent(date)}`);
}

export function createTransaction(input: {
  clientRequestId: string;
  terminalId: string;
  items: CartItems;
}): Promise<{ transaction: Transaction; duplicate: boolean }> {
  return request("/api/transactions", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function voidTransaction(id: string): Promise<{ ok: true }> {
  return request(`/api/transactions/${encodeURIComponent(id)}/void`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function updateTransaction(
  id: string,
  items: CartItems
): Promise<{ transaction: Transaction }> {
  return request(`/api/transactions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ items })
  });
}

export function exportCsvUrl(date: string): string {
  return `/api/export.csv?date=${encodeURIComponent(date)}`;
}
