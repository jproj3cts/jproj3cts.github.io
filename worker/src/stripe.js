/**
 * Minimal Stripe helpers for Cloudflare Workers.
 *
 * The official Stripe SDK works on Workers but pulls in a lot for what we
 * need here, which is two things: verify a webhook signature, and fetch the
 * line items for a Checkout Session. Both are short enough to do directly
 * against the REST API with Web Crypto.
 */

const encoder = new TextEncoder();

/**
 * Verify the Stripe-Signature header.
 *
 * The signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256'd with the
 * webhook signing secret (whsec_...). The raw body matters: parse the JSON
 * only after this passes, never before, or a re-serialised body will fail
 * to match.
 *
 * Returns the parsed event on success, throws on failure.
 */
export async function constructEvent(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader) {
    throw new Error('missing Stripe-Signature header');
  }

  // Header looks like: t=1614556800,v1=abc...,v1=def...,v0=ghi...
  let timestamp = null;
  const signatures = [];
  for (const part of signatureHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('malformed Stripe-Signature header');
  }

  // Replay window. Stripe signs the timestamp, so an attacker can't move it
  // without invalidating the signature — but a captured request could
  // otherwise be replayed indefinitely.
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > toleranceSeconds) {
    throw new Error(`timestamp outside tolerance (age ${age}s)`);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const expected = hex(mac);

  // Stripe may send several v1 signatures during a secret rotation; any
  // match is valid.
  const ok = signatures.some((candidate) => timingSafeEqual(candidate, expected));
  if (!ok) {
    throw new Error('signature mismatch');
  }

  return JSON.parse(rawBody);
}

/**
 * checkout.session.completed does NOT include line items — the session
 * object carries totals and customer details only. Fetch them separately.
 */
export async function fetchLineItems(sessionId, secretKey) {
  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe line_items ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

function hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string compare. Both inputs here are hex digests of fixed
 * length, so comparing lengths first leaks nothing useful.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
