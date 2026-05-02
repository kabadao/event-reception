# Kabutomushi Reception

Bun + Vite + React frontend with a Cloudflare Workers API and D1 database for multi-device reception.

## Local Setup

```bash
mise exec -- bun install
mise exec -- bun run build
cp .dev.vars.example .dev.vars
mise exec -- bun run d1:migrate:local
mise exec -- bun run dev:worker
```

Open the local Wrangler URL and log in with the PIN you set in `.dev.vars`.

## Cloudflare Setup

Create the D1 database:

```bash
mise exec -- bunx wrangler d1 create kabutomushi-reception
```

Copy the generated `database_id` into `wrangler.toml`, then initialize the schema:

```bash
mise exec -- bun run d1:migrate:remote
```

Set the shared reception PIN as a Cloudflare secret:

```bash
mise exec -- bunx wrangler secret put RECEPTION_PIN
```

Deploy:

```bash
mise exec -- bun run deploy
```

## Environment Variables

- `RECEPTION_PIN` - required shared login PIN. Use a Wrangler secret in production.
- `AUTH_COOKIE_NAME` - auth cookie name, defaults to `reception_auth`.
- `AUTH_COOKIE_MAX_AGE_SECONDS` - login duration, defaults to `604800`.

## Notes

Cloudflare Workers serves the built Vite assets from `dist/` and handles `/api/*` routes in `worker/index.ts`. D1 stores transactions; totals are recalculated from non-voided transaction rows.
