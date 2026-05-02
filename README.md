# Kabutomushi Reception

Bun + Vite + React based reception register for multiple staff devices.

## Setup

```bash
cp .env.example .env
mise exec -- bun install
mise exec -- bun run build
mise exec -- bun run server
```

Set `RECEPTION_PIN` in `.env` before starting the server. Bun loads `.env` automatically.

## Environment Variables

- `RECEPTION_PIN` - required shared login PIN.
- `PORT` - server port, defaults to `3000`.
- `DATABASE_PATH` - SQLite file path, defaults to `data/reception.sqlite`.
- `NODE_ENV` - use `production` for HTTPS deployments.
- `AUTH_COOKIE_NAME` - auth cookie name, defaults to `reception_auth`.
- `AUTH_COOKIE_MAX_AGE_SECONDS` - login duration, defaults to `604800`.
