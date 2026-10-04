# jek-api

Accounts, workspaces and cloud benches for JEKray2D, as a Cloudflare Worker
at `api.jeksys.net`. The design is in the "JEKray2D accounts, cloud benches
and subscriptions" doc; this folder follows its build order.

It is separate from the URPG fulfilment Worker in `../worker`: its own
Worker, D1 database, R2 bucket, KV namespace and (later) Stripe account.
Nothing here reads or changes URPG's resources.

## Status

Step 1 of the build order: the skeleton.

- `migrations/0001_init.sql`: every table in the design's data model,
  including the ones for later phases (institution domains, jobs, audit).
- Sessions: hashed tokens in D1, a host-only HttpOnly cookie, 30 days,
  renewed on use.
- CORS and the Origin check for writes.
- `GET /v1/health`, `GET /v1/me`, `POST /auth/signout`.

Next: Google and ORCID sign-in.

## Working on it

```sh
npm install
npm test                  # runs every test in the Workers runtime against a local D1
npm run migrate:local     # apply migrations to the local dev database
npm run dev               # http://localhost:8787
```

For local work against the app, create `.dev.vars` (git-ignored) with:

```
APP_ORIGINS="http://localhost:8765"
```

## First deploy (when sign-in is ready)

```sh
npx wrangler d1 create jek                  # put the database_id in wrangler.toml
npx wrangler kv namespace create jek-auth   # put the id in wrangler.toml
npx wrangler r2 bucket create jek-benches
npm run migrate:remote
npm run deploy
```

Secrets are added with `npx wrangler secret put NAME` and never committed.
