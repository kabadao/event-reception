export const ITEM_KEYS = ["adult", "child", "lottery", "free"] as const;

export type ItemKey = (typeof ITEM_KEYS)[number];

export type CartItems = Record<ItemKey, number>;

export const PRICES: CartItems = {
  adult: 800,
  child: 600,
  lottery: 500,
  free: 0
};

export const NAMES: Record<ItemKey, string> = {
  adult: "大人",
  child: "子供",
  lottery: "くじ",
  free: "2歳以下"
};

export const EMPTY_CART: CartItems = {
  adult: 0,
  child: 0,
  lottery: 0,
  free: 0
};

export function cartTotal(items: CartItems): number {
  return ITEM_KEYS.reduce((sum, key) => sum + PRICES[key] * items[key], 0);
}

export function cartDescription(items: CartItems): string {
  return ITEM_KEYS.filter((key) => items[key] > 0)
    .map((key) => `${NAMES[key]}×${items[key]}`)
    .join(" ");
}

export function yen(value: number): string {
  return `¥${value.toLocaleString()}`;
}
