/**
 * JEK Systems — digital goods fulfilment worker.
 *
 * Listens for Stripe checkout webhooks, looks each purchased price ID up in
 * the catalogue, pulls the matching file out of R2 and emails it to the
 * customer as an attachment.
 *
 * Flow:
 *   Stripe  ->  POST /stripe-webhook  ->  verify signature
 *                                     ->  check idempotency (KV)
 *                                     ->  fetch line items from Stripe API
 *                                     ->  map price IDs -> files (catalogue.js)
 *                                     ->  read files from R2
 *                                     ->  send one email with attachments
 *                                     ->  mark event handled (KV)
 */

import { constructEvent, fetchLineItems } from './stripe.js';
import { lookup } from './catalogue.js';
import { sendEmail, deliveryEmailHtml, escapeHtml } from './email.js';

// Resend's attachment ceiling is well above this; the limit that actually
// bites is recipient mail servers, which commonly reject over ~25 MB once
// base64 encoding has inflated the payload by a third.
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;

// Events that mean "money has arrived, deliver the goods".
const FULFIL_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname !== '/stripe-webhook') {
      return new Response('not found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    // Read the body as raw text. Signature verification is over the exact
    // bytes Stripe sent, so this must happen before any JSON parsing.
    const rawBody = await request.text();
    const signature = request.headers.get('Stripe-Signature');

    let event;
    try {
      event = await constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      // 400 tells Stripe not to bother retrying — a bad signature won't get
      // better on a second attempt.
      console.error('signature verification failed:', err.message);
      return new Response(`signature verification failed: ${err.message}`, { status: 400 });
    }

    if (!FULFIL_EVENTS.has(event.type)) {
      // Acknowledge everything else so Stripe stops sending it.
      return new Response('ignored', { status: 200 });
    }

    const session = event.data.object;

    // With delayed payment methods a session can complete before the money
    // clears. Wait for the async_payment_succeeded event in that case.
    if (session.payment_status !== 'paid') {
      console.log(`session ${session.id} not paid yet (${session.payment_status}), skipping`);
      return new Response('awaiting payment', { status: 200 });
    }

    try {
      const already = await env.FULFILMENT.get(`event:${event.id}`);
      if (already) {
        console.log(`event ${event.id} already handled, skipping`);
        return new Response('already handled', { status: 200 });
      }

      await fulfil(session, env);

      // Only marked once delivery actually succeeded. If anything above
      // threw, the key is absent and Stripe's retry gets another go.
      await env.FULFILMENT.put(`event:${event.id}`, new Date().toISOString(), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 days covers Stripe's retry window
      });

      return new Response('fulfilled', { status: 200 });
    } catch (err) {
      console.error(`fulfilment failed for session ${session.id}:`, err.stack || err.message);

      // Try to warn a human, but never let the alert itself fail the
      // request — Stripe's retry is the real safety net.
      ctx.waitUntil(
        alert(env, `Fulfilment failed for session ${session.id}`, err).catch(() => {}),
      );

      // 500 makes Stripe retry with backoff.
      return new Response('fulfilment failed', { status: 500 });
    }
  },
};

async function fulfil(session, env) {
  const email = session.customer_details?.email;
  if (!email) {
    throw new Error(`session ${session.id} has no customer email`);
  }

  const lineItems = await fetchLineItems(session.id, env.STRIPE_SECRET_KEY);

  // Resolve each purchased price to a deliverable. Anything not in the
  // catalogue is skipped — that's how physical products will pass through
  // untouched once you add them.
  const wanted = [];
  const unknown = [];

  for (const item of lineItems) {
    const priceId = item.price?.id;
    if (!priceId) continue;

    const product = lookup(priceId);
    if (product) {
      // A quantity of 3 still means one copy of the file.
      wanted.push(product);
    } else {
      unknown.push({ priceId, description: item.description });
    }
  }

  if (unknown.length > 0) {
    // Not fatal — but it usually means a price ID was never added to the
    // catalogue, and a customer is waiting on a file that isn't coming.
    console.warn(`session ${session.id} had unmapped prices:`, JSON.stringify(unknown));
    await alert(
      env,
      `Unmapped price ID in session ${session.id}`,
      new Error(
        `These prices are not in catalogue.js, so nothing was sent for them:\n` +
          unknown.map((u) => `  ${u.priceId} — ${u.description}`).join('\n') +
          `\n\nCustomer: ${email}`,
      ),
    );
  }

  if (wanted.length === 0) {
    console.log(`session ${session.id} contained no digital goods, nothing to send`);
    return;
  }

  // Pull the files out of R2.
  const attachments = [];
  let totalBytes = 0;

  for (const product of wanted) {
    const object = await env.PRODUCTS.get(product.r2Key);
    if (!object) {
      throw new Error(`R2 object missing: ${product.r2Key} (for "${product.name}")`);
    }

    const buffer = await object.arrayBuffer();
    totalBytes += buffer.byteLength;

    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error(
        `attachments exceed ${MAX_TOTAL_ATTACHMENT_BYTES} bytes for session ${session.id}`,
      );
    }

    attachments.push({
      filename: product.filename,
      content: toBase64(buffer),
    });
  }

  await sendEmail(env, {
    to: email,
    subject:
      wanted.length === 1
        ? `Your copy of ${wanted[0].name}`
        : `Your order from JEK Systems`,
    html: deliveryEmailHtml({ items: wanted, supportEmail: env.SUPPORT_EMAIL }),
    attachments,
  });

  console.log(
    `delivered ${wanted.map((w) => w.name).join(', ')} to ${email} (session ${session.id})`,
  );
}

/** Email yourself when something needs a human. */
async function alert(env, subject, err) {
  if (!env.ALERT_EMAIL) return;
  await sendEmail(env, {
    to: env.ALERT_EMAIL,
    subject: `[fulfilment] ${subject}`,
    html: `<pre style="font-family:monospace;white-space:pre-wrap;">${escapeHtml(
      err.stack || err.message,
    )}</pre>`,
  });
}

/**
 * ArrayBuffer -> base64.
 *
 * Chunked because String.fromCharCode(...bytes) on a multi-megabyte array
 * blows the call stack.
 */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
