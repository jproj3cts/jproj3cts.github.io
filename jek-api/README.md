# jek-api

Accounts, workspaces and cloud benches for JEKray2D, as a Cloudflare Worker
at `api.jeksys.net`. The design is in the "JEKray2D accounts, cloud benches
and subscriptions" doc; this folder follows its build order.

It is separate from the URPG fulfilment Worker in `../worker`: its own
Worker, D1 database, R2 bucket, KV namespace and (later) Stripe account.
Nothing here reads or changes URPG's resources.

## Status

Steps 1, 2, 4, 5 and 6 of the build order (benches and billing before teams), and university licences.

- `migrations/0001_init.sql`: every table in the design's data model,
  including the ones for later phases (institution domains, jobs, audit).
- Sign-in with Google (with PKCE) or ORCID: `/auth/{google,orcid}/start` and
  `/callback`. State is kept in KV for 10 minutes and tied to the browser by
  a cookie. A second provider is only ever linked by a signed-in person.
- Sessions: hashed tokens in D1, a host-only HttpOnly cookie, 30 days,
  renewed on use; listed and ended from `/v1/me/sessions`.
- Cloud benches: create, read, save with If-Match (409 with the newer
  version on a clash), rename, move, delete to the bin and back; history in
  R2 (on create, on Save, every 10 minutes of editing, before a restore;
  the last 50 kept, then one a day for 90 days); folders; `GET /v1/me/export`
  as a zip. Saving needs an active plan; reading and export never do.
- Stripe: Checkout for the individual and academic plans, the customer
  portal, switching monthly/yearly, and the webhook at `/stripe/webhook`
  that mirrors each subscription (7 days' grace after a failed payment).
  Prices are found by lookup key: `pro_monthly`, `pro_yearly`,
  `academic_monthly`, `academic_yearly`. The academic price needs a
  university email or a current university role on ORCID (`/v1/me/academic`).
- Deleting an account (`DELETE /v1/me` with `{"confirm": "delete my account"}`):
  any live Stripe subscription is cancelled first (nothing is deleted if
  Stripe cannot be reached), then every workspace the person owns alone goes
  with its benches, R2 history and folders, and their memberships, sign-ins
  and sessions. A team with other members needs a new owner first. The user
  row stays, emptied to "Deleted user", for benches they saved in others'
  workspaces.
- Thumbnails: `PUT /v1/benches/:b/thumb` with a WebP, PNG or JPEG of at
  most 128 KB (checked by its first bytes, not its Content-Type), kept in R2
  under a fresh name each time; the bench's `thumb` is its URL, served with
  a year's private caching, nosniff and a sandboxing CSP. They go with the
  bench when the bin is emptied, and with the account.
- University licences (`src/institutions.js`, migration 0003): an
  institution is a workspace of kind `institution` owned by the `system`
  user; its subscription is the licence, invoiced by Stripe
  (`collection_method: send_invoice`, yearly, 60 days' grace when late) or a
  pilot set by hand with an end date. Anyone whose verified email is at one
  of its domains, or (on `POST /v1/me/institution`) whose ORCID record shows
  a current affiliation with one of its ROR/Ringgold/GRID ids, gets Pro on
  their personal workspace; each month they use it is counted. Set up with
  `scripts/institutions.mjs` through `/ops`, which needs the `OPS_TOKEN`
  secret and does not exist without it.
- A daily cron (03:17 UTC) empties the bin of benches deleted 30 days ago.
- CORS and the Origin check for writes.
- `GET /v1/health`, `GET /v1/me`, `DELETE /v1/me/identities/:provider`,
  `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`, `POST /auth/signout`.

In the app, the Sign in button appears with the experimental feature
"JEKray2D Pro accounts" switched on; signed in, the File menu gains My
benches and Save to cloud.

Next: workspaces, members, invitations, roles and team billing.

## Giving an account a plan by hand

Until Stripe is connected, a plan can be granted directly (for yourself or
a beta tester). Find the person's personal workspace, then add the plan:

```sh
npx wrangler d1 execute jek --remote --command "SELECT w.id, u.name, u.email FROM workspaces w JOIN users u ON u.id = w.owner_id WHERE w.kind = 'personal'"
npx wrangler d1 execute jek --remote --command "INSERT INTO subscriptions (workspace_id, stripe_customer, plan, seats, status, updated_at) VALUES ('<workspace id>', 'manual', 'individual', 1, 'active', 0)"
```

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
APP_URL="http://localhost:8765/jek/tools/jekray2d.html"
API_URL="http://localhost:8787"
GOOGLE_CLIENT_SECRET="…"
ORCID_CLIENT_SECRET="…"
```

Sign-in locally needs `http://localhost:8787/auth/google/callback` among the
Google client's redirect addresses (it is). The tests set their own values and
never read `.dev.vars`.

## First deploy (when sign-in is ready)

```sh
npx wrangler d1 create jek                  # put the database_id in wrangler.toml
npx wrangler kv namespace create jek-auth   # put the id in wrangler.toml
npx wrangler r2 bucket create jek-benches
npm run migrate:remote
npm run deploy
```

Secrets are added with `npx wrangler secret put NAME` and never committed:
`GOOGLE_CLIENT_SECRET`, `ORCID_CLIENT_SECRET`, `STRIPE_SECRET_KEY` (a
restricted key: write on Checkout Sessions, Customers, Customer portal and
Subscriptions; read on Prices, Products and Invoices) and
`STRIPE_WEBHOOK_SECRET`.
