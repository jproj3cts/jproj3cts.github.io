// Quote requests from the site's quote cart, emailed to sales through Resend.
//
// No sign-in: anyone on jeksys.net may ask for a quote. What keeps it from
// being a way to send email to strangers:
//   - the full request (names, message, design links) goes only to sales;
//   - the customer's copy is a short receipt that repeats none of their text,
//     only part numbers, quantities and a reference;
//   - at most PER_ADDRESS requests a day to one address, DAILY in all, and the
//     per-address rate limit (RL_SLOW) on top;
//   - links are kept only when they point at the site itself.
// Nothing is stored but the address and time of each request, in email_sends,
// which the daily cron clears after 24 hours.

import { mailOn, sendEmail } from './mail.js';
import { allowedOrigins } from './http.js';
import { ApiError, hex } from './util.js';

const DAY = 24 * 60 * 60 * 1000;
const PER_ADDRESS = 5;
const DAILY = 200;
const TAG = 'quote';                                    // email_sends.user_id for quote requests

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;
const PART = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const text = (v, max) => (typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '');
const line = (v, max) => text(v, max).replace(/\s+/g, ' ');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (cur, v) => (cur || '') + v.toFixed(2);

function bad(code, message) {
  return new ApiError(400, code, message);
}

// The request, checked and trimmed to what we will send on.
export function readQuote(body, env) {
  if (!body || typeof body !== 'object') throw bad('bad_request', 'Send the quote request as JSON.');
  const name = line(body.name, 100);
  const email = line(body.email, 254).toLowerCase();
  if (!name) throw bad('no_name', 'Please give your name.');
  if (!EMAIL.test(email)) throw bad('bad_email', 'Please give an email address we can reply to.');
  const sites = allowedOrigins(env).map((o) => o + '/');
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw bad('no_items', 'The quote cart is empty.');
  if (items.length > 50) throw bad('too_many_items', 'Please send at most 50 items in one request.');
  const out = items.map((it, i) => {
    const part = line(it && it.part, 40);
    if (!PART.test(part)) throw bad('bad_item', `Item ${i + 1} has no valid part number.`);
    const qty = Math.round(Number(it.qty));
    if (!(qty >= 1 && qty <= 100000)) throw bad('bad_item', `Item ${i + 1} needs a quantity from 1 to 100,000.`);
    const price = typeof it.price === 'number' && isFinite(it.price) && it.price >= 0 ? it.price : null;
    const url = typeof it.url === 'string' && it.url.length <= 8000 && sites.some((s) => it.url.startsWith(s)) ? it.url : '';
    return {
      part, qty, price, url,
      name: line(it.name, 200) || part,
      currency: line(it.currency, 3),
      note: line(it.note, 20),
      spec: Array.isArray(it.spec) ? it.spec.slice(0, 20).map((s) => line(s, 200)).filter(Boolean) : [],
    };
  });
  return {
    name, email, items: out,
    organisation: line(body.organisation, 150),
    phone: line(body.phone, 40),
    message: text(body.message, 4000),
    trap: !!line(body.website, 200),                    // a field people never see: only robots fill it
  };
}

function totals(items) {
  const by = new Map();
  for (const it of items) if (it.price !== null) by.set(it.currency, (by.get(it.currency) || 0) + it.price * it.qty);
  return [...by].map(([c, v]) => money(c, v));
}

// The email to sales: everything the customer sent.
function salesEmail(q, ref) {
  const T = [`Quote request ${ref}`, '', `From: ${q.name}${q.organisation ? ', ' + q.organisation : ''}`, `Email: ${q.email}`];
  if (q.phone) T.push(`Phone: ${q.phone}`);
  T.push('');
  q.items.forEach((it, i) => {
    T.push(`${i + 1}. ${it.part} - ${it.name}`, `   Quantity: ${it.qty}`);
    for (const s of it.spec) T.push('   ' + s);
    if (it.spec.length && it.url) T.push('   Design: ' + it.url);
    else if (it.url) T.push('   Page: ' + it.url);
    T.push('   Unit price: ' + (it.price === null ? 'on application' : money(it.currency, it.price) + (it.note ? ' ' + it.note : '')), '');
  });
  const tot = totals(q.items);
  if (tot.length) T.push('Listed prices total: ' + tot.join(' + '), '');
  if (q.message) T.push('Message:', q.message, '');
  T.push('Reply to this email to answer the customer.');
  const H = [`<h2 style="font-family:sans-serif">Quote request ${esc(ref)}</h2>`,
    `<p style="font-family:sans-serif">From <b>${esc(q.name)}</b>${q.organisation ? ', ' + esc(q.organisation) : ''}<br>` +
    `<a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${q.phone ? '<br>' + esc(q.phone) : ''}</p>`,
    '<table style="font-family:sans-serif;border-collapse:collapse" cellpadding="6">',
    '<tr style="text-align:left;border-bottom:1px solid #999"><th>Part</th><th>Item</th><th>Qty</th><th>Unit price</th></tr>'];
  for (const it of q.items) {
    let item = esc(it.name);
    if (it.spec.length) item += '<br><small>' + it.spec.map(esc).join('<br>') + '</small>';
    if (it.url) item += `<br><small><a href="${esc(it.url)}">${it.spec.length ? 'Open the design in JEKray' : 'Product page'}</a></small>`;
    H.push(`<tr style="vertical-align:top;border-bottom:1px solid #ddd"><td><b>${esc(it.part)}</b></td><td>${item}</td><td>${it.qty}</td>` +
      `<td>${it.price === null ? 'on application' : esc(money(it.currency, it.price) + (it.note ? ' ' + it.note : ''))}</td></tr>`);
  }
  H.push('</table>');
  if (tot.length) H.push(`<p style="font-family:sans-serif">Listed prices total: ${esc(tot.join(' + '))}</p>`);
  if (q.message) H.push(`<p style="font-family:sans-serif"><b>Message</b><br>${esc(q.message).replace(/\n/g, '<br>')}</p>`);
  H.push('<p style="font-family:sans-serif;color:#666">Reply to this email to answer the customer.</p>');
  const who = q.organisation ? `${q.name}, ${q.organisation}` : q.name;
  return { subject: `Quote request ${ref}: ${q.items.length === 1 ? q.items[0].part : q.items.length + ' items'} from ${who}`.slice(0, 200), text: T.join('\n'), html: H.join('\n') };
}

// The customer's receipt: none of their own words, only what we checked.
function receipt(q, ref) {
  const rows = q.items.map((it) => `${it.part} x ${it.qty}`);
  const T = ['Thank you. We have your quote request and will reply from sales@jeksys.net, usually within two working days.', '',
    `Your reference: ${ref}`, '', ...rows, '',
    'If you did not ask for a quote from JEK Systems, you can ignore this email: nothing else will be sent.', '', 'JEK Systems, https://jeksys.net'];
  const H = `<p style="font-family:sans-serif">Thank you. We have your quote request and will reply from sales@jeksys.net, usually within two working days.</p>` +
    `<p style="font-family:sans-serif">Your reference: <b>${esc(ref)}</b></p><p style="font-family:sans-serif">${rows.map(esc).join('<br>')}</p>` +
    `<p style="font-family:sans-serif;color:#666">If you did not ask for a quote from JEK Systems, you can ignore this email: nothing else will be sent.</p>`;
  return { subject: `Your quote request ${ref}`, text: T.join('\n'), html: H };
}

export async function requestQuote(req, env) {
  let body;
  try { body = await req.json(); } catch { throw bad('bad_request', 'Send the quote request as JSON.'); }
  const q = readQuote(body, env);
  const d = new Date();
  const ref = `Q-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}-${hex(crypto.getRandomValues(new Uint8Array(2))).toUpperCase()}`;
  if (q.trap) return { sent: true, reference: ref };   // a robot: say yes, send nothing
  if (!mailOn(env)) throw new ApiError(503, 'email_off', 'Quote requests cannot be sent from here just now.');
  const t = Date.now();
  const [mine, all] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE email = ? AND user_id = ? AND at > ?').bind(q.email, TAG, t - DAY),
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE user_id = ? AND at > ?').bind(TAG, t - DAY),
  ]);
  if (mine.results[0].n >= PER_ADDRESS) throw new ApiError(429, 'too_many_quotes', 'We have several requests from this address today already. Please email sales@jeksys.net directly.');
  if (all.results[0].n >= DAILY) throw new ApiError(503, 'quotes_busy', 'We cannot take more requests through the site today. Please email sales@jeksys.net directly.');
  const sales = env.SALES_EMAIL || 'sales@jeksys.net';
  await sendEmail(env, { to: sales, from: env.QUOTE_FROM || env.MAIL_FROM, replyTo: q.email, ...salesEmail(q, ref) });
  await env.DB.prepare('INSERT INTO email_sends (email, user_id, at) VALUES (?, ?, ?)').bind(q.email, TAG, t).run();
  // the receipt is a courtesy: sales already has the request, so a failure here is not the customer's problem
  let copied = true;
  try { await sendEmail(env, { to: q.email, from: env.QUOTE_FROM || env.MAIL_FROM, replyTo: sales, ...receipt(q, ref) }); }
  catch (err) { copied = false; console.error('quote receipt', err.message); }
  return { sent: true, reference: ref, copied };
}
