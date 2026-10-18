# JEK Systems — fulfilment worker

Cloudflare Worker that listens for Stripe checkout webhooks and emails the
purchased file to the customer as an attachment.

Adding a product later is one entry in `src/catalogue.js` plus an upload to
R2. Nothing else changes.

---

> **New to any of this?** Follow [SETUP.md](SETUP.md) instead — it's the
> same process written out step by step, with nothing assumed. This file is
> the condensed reference for when you already know the shape of it.

## What you need first

- A Cloudflare account (the same one holding the `jeksys.net` zone).
- `wrangler` — `npm install` in this directory, then prefix commands with `npx`.
- A [Resend](https://resend.com) account with `jeksys.net` verified. Resend
  gives you DKIM/SPF records to add in Cloudflare DNS. **Do this first** —
  unverified domains can't send, and DNS propagation is the slowest step here.
- R2 requires a payment method on the Cloudflare account, even on the free
  tier.

## Setup

```sh
npm install
npx wrangler login

# 1. Storage for the deliverables (keep the bucket private)
npx wrangler r2 bucket create jek-products
npx wrangler r2 object put jek-products/urpg/terror-of-echo-station-v1.pdf \
  --file /path/to/module.pdf --remote

# 2. Idempotency store — paste the printed id into wrangler.toml
npx wrangler kv namespace create FULFILMENT

# 3. Credentials (never in the repo)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY

# 4. Ship it
npx wrangler deploy
```

Then in Stripe: add a webhook endpoint at
`https://<your-worker>.workers.dev/stripe-webhook` for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`,
put its signing secret in `wrangler secret put STRIPE_WEBHOOK_SECRET`, and
redeploy.

Finally, copy the **price** ID (`price_...`, not `prod_...`) into
`src/catalogue.js`, deploy, and point a Payment Link's post-payment redirect
at `https://jeksys.net/uRPG/thanks.html`.

## Testing

Use Stripe **test mode** throughout: test keys, a test-mode webhook endpoint
with its own signing secret, and a test Payment Link.

Drive it end to end with card `4242 4242 4242 4242`, any future expiry, any
CVC. Watch the worker as it happens:

```sh
wrangler tail
```

To replay events without paying, the Stripe CLI can forward to the deployed
worker:

```sh
stripe listen --forward-to https://<your-worker>.workers.dev/stripe-webhook
stripe trigger checkout.session.completed
```

Note that `stripe listen` issues its **own** signing secret, different from
the dashboard endpoint's. Set that one while you're using the CLI.

Worth testing deliberately: buy twice with the same email (should get two
emails), and check the Stripe dashboard's webhook log shows 200s.

---

## How it behaves when things go wrong

| Situation | What happens |
|---|---|
| Bad/missing signature | 400, no retry. Stripe surfaces it in the webhook log. |
| Stripe retries an event already delivered | KV lookup short-circuits it. No duplicate email. |
| R2 object missing, or Resend down | 500, Stripe retries with backoff for ~3 days. You get an alert email. |
| Price ID not in the catalogue | Alert email to you. The rest of the order still ships. |
| Delayed payment method (not yet paid) | Skipped; delivery happens on `async_payment_succeeded`. |

The idempotency key is only written **after** the email succeeds, so a
failure part-way through is retried rather than silently swallowed.

Alerts go to `ALERT_EMAIL` in `wrangler.toml`.

---

## Notes for later

- **Physical products.** Any price ID absent from the catalogue is skipped
  rather than treated as an error, so physical line items pass through
  untouched. When you get there, that's the hook to add shipping logic.
- **Attachment size.** Capped at 15 MB total in `src/index.js`. Recipient
  mail servers, not Resend, are the binding constraint — base64 inflates
  the payload by about a third, and many servers reject over ~25 MB.
  Past that, switch to signed R2 links.
- **Swapping email provider.** Only `src/email.js` touches Resend.
