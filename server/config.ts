function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} を環境変数に設定してください。`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} には正の整数を設定してください。`);
  }
  return value;
}

export const config = {
  port: optionalInt("PORT", 3000),
  receptionPin: requiredEnv("RECEPTION_PIN"),
  databasePath: process.env.DATABASE_PATH?.trim() || "data/reception.sqlite",
  nodeEnv: process.env.NODE_ENV?.trim() || "development",
  authCookieName: process.env.AUTH_COOKIE_NAME?.trim() || "reception_auth",
  authCookieMaxAgeSeconds: optionalInt("AUTH_COOKIE_MAX_AGE_SECONDS", 604800)
};

export const isProduction = config.nodeEnv === "production";
