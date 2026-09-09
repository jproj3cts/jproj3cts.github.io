# Setting up the fulfilment worker — full walkthrough

This assumes you've never used Cloudflare Workers, R2, or a webhook before.
Every command is written out. Where a dashboard is involved, menu labels
sometimes shift between redesigns — the *thing* you're looking for is
described, so you can find it even if the wording has moved on.

Budget about 90 minutes, most of it waiting for DNS.

---

## What you're actually building

Right now: someone clicks Buy, pays Stripe, and nothing happens.

What we're adding is a small program ("worker") that Cloudflare runs for you.
Stripe pokes it every time someone pays. It looks up what they bought, fetches
the file, and emails it to them.

```
   Customer clicks Buy (digital)
              |
              v
   Stripe Checkout  --- customer pays --->  Stripe
              |                               |
              |                               |  "someone paid!"
     redirected to                            v
     thanks.html                    Your worker on Cloudflare
                                              |
                                    1. is this really Stripe?
                                    2. what did they buy?
                                    3. fetch PDF from storage (R2)
                                    4. email it via Resend
```

Four accounts/services are involved:

| Thing | What it does | Cost |
|---|---|---|
| **GitHub Pages** | serves your website (already working) | free |
| **Cloudflare Workers** | runs the fulfilment code | free at your volume |
| **Cloudflare R2** | stores the PDFs customers buy | free tier, **card required** |
| **Resend** | actually sends the emails | free tier |
| **Stripe** | takes the money | per-transaction fee |

The PDF lives in R2 and **never** in your GitHub repo — anything in the repo
is a free public download.

---

## Part 1 — Install the tools

You need Node.js. Check whether you already have it. Open Terminal (macOS:
Cmd+Space, type "Terminal"; Windows: Start menu, "PowerShell") and run:

```sh
node --version
```

If you get a version number of 18 or higher, you're set. If it says "command
not found", install the LTS version from <https://nodejs.org> and reopen the
terminal.

Now navigate to the worker folder. `cd` means "change directory". Replace the
path with wherever your repo actually lives:

```sh
cd ~/path/to/jproj3cts.github.io/worker
```

**Tip:** in most terminals you can type `cd ` (with the space) and then drag
the folder from your file manager onto the terminal window — it fills in the
path for you.

Check you're in the right place:

```sh
ls
```

You should see `README.md`, `package.json`, `src`, `wrangler.toml`. If you
don't, you're in the wrong folder.

Install the tooling:

```sh
npm install
```

This creates a `node_modules` folder. It's gitignored, so it won't end up in
your repo.

Every command from here starts with `npx wrangler`. The `npx` part means "run
the local copy" — no global install needed. Run all of them from this
`worker` folder.

Log in to Cloudflare:

```sh
npx wrangler login
```

A browser window opens asking you to authorise Wrangler. Approve it, come
back to the terminal.

---

## Part 2 — Resend (do this first; DNS is slow)

### 2.1 Sign up

Go to <https://resend.com> and create an account.

### 2.2 Add your domain

In the Resend dashboard, find **Domains** and add `jeksys.net`.

Resend will show you a set of DNS records to create — typically a few TXT
records (DKIM, SPF) and possibly a CNAME or MX for reply handling. Leave that
page open.

### 2.3 Add the records in Cloudflare

In a new tab, go to <https://dash.cloudflare.com>, click the `jeksys.net`
zone, then **DNS** → **Records**.

For each record Resend listed, click **Add record** and copy across:

- **Type** — TXT, CNAME, whatever Resend says
- **Name** — exactly as given. If Resend shows something like
  `resend._domainkey.jeksys.net`, Cloudflare may want just
  `resend._domainkey`; it appends the domain itself. Cloudflare shows you the
  full resulting name as you type, so check it matches.
- **Content / Value** — paste exactly, no added spaces or quotes
- **Proxy status** — for any CNAME, set this to **DNS only** (grey cloud, not
  orange). Proxying breaks mail records.

Save each one.

### 2.4 Verify

Back in Resend, click **Verify**. It may take anywhere from a minute to a few
hours. You can carry on with the rest of this guide meanwhile — just don't
attempt a real test purchase until it's green.

### 2.5 API key

In Resend, go to **API Keys** → **Create API Key**. Give it send permission.

**Copy it now and paste it somewhere temporary.** Resend shows it once. If
you lose it, delete it and make another — no harm done.

> **Testing before your domain verifies:** Resend provides a test sender
> address you can use immediately, but it will generally only deliver to the
> email address you signed up with. Fine for proving the plumbing works,
> useless for real customers. If you use it, put that address in
> `FROM_EMAIL` in `wrangler.toml` temporarily and remember to change it back.

---

## Part 3 — R2 storage for the PDFs

### 3.1 Enable R2

In the Cloudflare dashboard, find **R2** in the left sidebar.

**Heads up:** the first time, Cloudflare asks for a payment method even
though you'll be on the free tier. This catches people out. The free
allowance is 10 GB of storage and a million writes a month; your entire
catalogue will use a rounding error of that. You won't be charged unless you
blow past it, but the card is required to switch the service on. If you're
not willing to put a card down, tell me and we'll rework this to serve files
from somewhere else.

### 3.2 Create the bucket

Back in the terminal:

```sh
npx wrangler r2 bucket create jek-products
```

**Leave this bucket private.** Don't enable public access or attach an
r2.dev domain. `catalogue.js` is public and lists your object keys, so a
public bucket would turn those into free download links. Private is the
default — just don't change it.

### 3.3 Upload the module

```sh
npx wrangler r2 object put jek-products/urpg/terror-of-echo-station-v1.pdf \
  --file "/path/to/your/TerrorOfEchoStation.pdf" --remote
```

Replace the path after `--file` with the real one (drag-and-drop trick works
here too). The `--remote` flag matters: without it, newer Wrangler versions
may write to a local simulated bucket instead of the real one.

The `-v1` in the name is deliberate. When you revise the module, upload
`-v2` rather than overwriting, so anyone who bought v1 can still be sent
exactly what they paid for.

Check it landed:

```sh
npx wrangler r2 object get jek-products/urpg/terror-of-echo-station-v1.pdf \
  --file /tmp/check.pdf --remote
```

Open `/tmp/check.pdf`. If it's your module, storage is done.

---

## Part 4 — KV namespace (duplicate protection)

Stripe retries webhooks when it doesn't get a clean response. Without a
memory of what's already been handled, a retry means the customer gets the
same email twice. KV is that memory.

```sh
npx wrangler kv namespace create FULFILMENT
```

It prints something like:

```
[[kv_namespaces]]
binding = "FULFILMENT"
id = "a1b2c3d4e5f6789..."
```

Open `wrangler.toml` in a text editor and replace
`REPLACE_WITH_KV_NAMESPACE_ID` with that `id` value. Keep the quotes. Save.

---

## Part 5 — Secrets

Three credentials. These go into Cloudflare, encrypted — **never** into any
file in the repo.

### 5.1 Stripe secret key

In Stripe, top right, make sure the **Test mode** toggle is ON. We do
everything in test mode first.

Go to **Developers** → **API keys**. Copy the **Secret key** (starts
`sk_test_`). You'll need to click to reveal it.

```sh
npx wrangler secret put STRIPE_SECRET_KEY
```

It prompts for the value. Paste, press Enter. Nothing appears as you paste —
that's normal, it's hidden.

### 5.2 Resend key

```sh
npx wrangler secret put RESEND_API_KEY
```

Paste the `re_...` key from Part 2.5.

### 5.3 Webhook secret

Skip for now — it doesn't exist until Part 7.

---

## Part 6 — First deploy

```sh
npx wrangler deploy
```

You'll get output ending in a URL like:

```
https://jek-fulfilment.<your-subdomain>.workers.dev
```

**Copy that URL.** Test it:

```sh
curl https://jek-fulfilment.<your-subdomain>.workers.dev/health
```

It should print `ok`. If it does, your worker is live on the internet.

---

## Part 7 — Wire up Stripe

### 7.1 Register the webhook

Still in **test mode**, go to **Developers** → **Webhooks** → **Add
endpoint**.

- **Endpoint URL:** your worker URL with `/stripe-webhook` on the end, e.g.
  `https://jek-fulfilment.xxx.workers.dev/stripe-webhook`
- **Events to send:** click "Select events" and tick exactly two —
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Save. Stripe shows a **Signing secret** (starts `whsec_`); click to reveal.

```sh
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Paste it. Then redeploy so the worker picks it up:

```sh
npx wrangler deploy
```

> This secret is how the worker knows a request is genuinely from Stripe and
> not someone who found the URL. It's the single most important value here.

### 7.2 Get the price ID

In Stripe, **Products** → your Terror of Echo Station product. In the
Pricing section, find the price and copy its ID. It starts `price_`.

**Not** the product ID (`prod_`). If you paste a `prod_` ID, nothing will
ever be delivered and the failure is silent apart from an alert email.

### 7.3 Catalogue

Open `worker/src/catalogue.js`. Replace
`price_REPLACE_WITH_ECHO_STATION_PRICE_ID` with your real price ID. Save.

Note test mode and live mode have *different* price IDs for the same
product. You'll swap this when going live.

```sh
npx wrangler deploy
```

### 7.4 Payment Link

**Payment links** → **New**. Select your product.

Under **After payment**, choose "Don't show confirmation page" and set the
redirect to:

```
https://jeksys.net/uRPG/thanks.html
```

Create the link, copy the `https://buy.stripe.com/...` URL.

### 7.5 Put it on the site

Open `uRPG/TerrorofEchoStationProductPage.html`, find:

```html
href="https://buy.stripe.com/REPLACE_WITH_YOUR_PAYMENT_LINK"
```

Replace with your link. Commit and push. GitHub Pages updates in a minute or
two.

---

## Part 8 — Test the whole thing

Open a second terminal window, `cd` to the worker folder, and run:

```sh
npx wrangler tail
```

This streams the worker's logs live. Leave it running.

In a browser, go to your product page and click **Buy (digital)**. At
checkout use:

- **Card:** `4242 4242 4242 4242`
- **Expiry:** any future date
- **CVC:** any 3 digits
- **Email:** your own real address

Complete the purchase.

**What should happen, in order:**

1. You land on `thanks.html`
2. The `wrangler tail` window logs something like
   `delivered Terror of Echo Station to you@example.com`
3. The email arrives within a minute, PDF attached

### Also worth testing

- **Buy twice.** You should get two emails — a repeat purchase is legitimate.
- **Check Stripe's webhook log** (Developers → Webhooks → your endpoint).
  Every attempt should show `200`.

---

## Part 9 — Going live

Test and live mode are almost entirely separate worlds. Three things must be
redone:

1. **Live secret key.** Stripe → toggle Test mode OFF → Developers → API
   keys → copy `sk_live_...` →
   `npx wrangler secret put STRIPE_SECRET_KEY`
2. **Live webhook endpoint.** Create it again in live mode, same URL, same
   two events. It has a **different** signing secret →
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET`
3. **Live price ID.** Different from the test one. Update `catalogue.js`.

Then `npx wrangler deploy`, create a live Payment Link, update the button.

Do one real purchase with your own card. Refund it afterwards from the Stripe
dashboard. This is the only way to be certain, and it costs you a few pence
in fees.

> **The classic mistake:** updating the API key but not the webhook secret.
> Everything looks configured, and every webhook fails signature verification
> with a 400. If live purchases silently deliver nothing, check this first.

---

## Adding a product later

Once set up, each new digital product is:

1. Create product + price in Stripe (live mode), copy the `price_` ID
2. `npx wrangler r2 object put jek-products/urpg/whatever-v1.pdf --file ... --remote`
3. Add an entry to `src/catalogue.js`
4. `npx wrangler deploy`
5. Create a Payment Link, add the product page to the site

No changes to the worker code itself.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Stripe webhook log shows **400** | Wrong `STRIPE_WEBHOOK_SECRET` — test vs live mismatch, or not redeployed after setting it |
| Webhook shows **500** | Real failure. Check `wrangler tail` and your alert email. Usually the R2 key in `catalogue.js` not matching what was uploaded |
| Webhook **200** but no email | Price ID missing from catalogue, or a `prod_` used instead of `price_`. You'd have an alert email |
| Email in spam | Resend domain not fully verified, or `FROM_EMAIL` isn't on the verified domain |
| `wrangler: command not found` | You're outside the `worker` folder, or `npm install` wasn't run. Use `npx wrangler` |
| R2 upload "succeeds" but object missing | Missing `--remote` — it went to a local simulation |
| Customer says nothing arrived | Stripe dashboard → find payment → check webhook attempts. You can re-send the event from Stripe to trigger delivery again |

### Manually re-sending a delivery

In Stripe → Developers → Webhooks → your endpoint → find the event → **Resend**.

The worker's duplicate protection will block it if that event already
succeeded. To genuinely force a resend, remove the record first:

```sh
npx wrangler kv key delete --binding FULFILMENT "event:evt_XXXXXXXX"
```

using the event ID from the Stripe dashboard, then resend.

---

## Where things live, for future reference

| What | Where |
|---|---|
| Which file each product delivers | `worker/src/catalogue.js` |
| Email wording and design | `worker/src/email.js` |
| Attachment size cap, retry logic | `worker/src/index.js` |
| From/support/alert addresses | `worker/wrangler.toml` |
| The actual PDFs | Cloudflare R2, bucket `jek-products` |
| Stripe & Resend credentials | Cloudflare secrets (`npx wrangler secret list`) |
