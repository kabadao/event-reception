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

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  RECEPTION_PIN: string;
  AUTH_COOKIE_NAME?: string;
  AUTH_COOKIE_MAX_AGE_SECONDS?: string;
};

export const ITEM_KEYS = ["adult", "child", "lottery", "free"] as const;

export const PRICES: CartItems = {
  adult: 800,
  child: 600,
  lottery: 500,
  free: 0
};

export function cartAmount(items: CartItems): number {
  return ITEM_KEYS.reduce((sum, key) => sum + PRICES[key] * items[key], 0);
}
