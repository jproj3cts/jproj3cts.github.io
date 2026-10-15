import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
afterEach(() => vi.restoreAllMocks());

// Resend, as the API sees it: every email it is asked to send
function resend(fail = () => false) {
  const sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('unexpected fetch ' + url);
    const mail = JSON.parse(init.body);
    if (fail(mail)) return new Response('{"message":"nope"}', { status: 500 });
    sent.push(mail);
    return new Response('{"id":"x"}', { status: 200 });
  });
  return sent;
}
let n = 0;
const ask = (body, opts = {}) =>
  call('/v1/quotes', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, ...opts });
const lens = {
  part: 'RFL-JOVKXJ', name: 'Graded-index RF lens, PLA, 120 mm across', price: null, qty: 2,
  spec: ['Design frequency: 24 GHz', 'Diameter: 120 mm'], url: 'https://jeksys.net/jek/tools/jekray.html#p=zABC',
};
const rack = { part: 'JEK-CF40-SR16', name: 'CF40 rack', price: 45, currency: '£', note: '+ VAT', qty: 3, url: 'https://jeksys.net/jek/products/lab-accessories/cf40-sample-transport-rack/' };
const quote = (extra = {}) => ({ name: 'Ada Lovelace', email: `ada${++n}@example.org`, organisation: 'Analytical Engines Ltd', items: [lens, rack], ...extra });

describe('quote requests from the quote cart', () => {
  it('emails sales everything, with the customer as reply-to, and the customer a receipt that repeats none of their words', async () => {
    const sent = resend();
    const q = quote({ message: 'Need these by March.\nThanks', phone: '+44 1234 567890' });
    const r = await json(await ask(q));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, copied: true });
    expect(r.body.reference).toMatch(/^Q-\d{6}-[0-9A-F]{4}$/);
    expect(sent).toHaveLength(2);
    const [toSales, toCustomer] = sent;
    expect(toSales).toMatchObject({ from: 'JEK Systems <quotes@jeksys.net>', to: ['sales@jeksys.net'], reply_to: q.email });
    expect(toSales.subject).toContain(r.body.reference);
    expect(toSales.subject).toContain('Ada Lovelace, Analytical Engines Ltd');
    for (const s of ['RFL-JOVKXJ', 'Quantity: 2', 'Design frequency: 24 GHz', 'Design: https://jeksys.net/jek/tools/jekray.html#p=zABC',
      'JEK-CF40-SR16', 'Unit price: £45.00 + VAT', 'Unit price: on application', 'Listed prices total: £135.00', 'Need these by March.', '+44 1234 567890']) {
      expect(toSales.text).toContain(s);
    }
    expect(toSales.html).toContain('Open the design in JEKray');
    expect(toCustomer).toMatchObject({ to: [q.email], reply_to: 'sales@jeksys.net' });
    expect(toCustomer.text).toContain(r.body.reference);
    expect(toCustomer.text).toContain('RFL-JOVKXJ x 2');
    for (const s of ['Ada', 'Analytical', 'March', 'Graded-index', 'jekray.html']) expect(toCustomer.text + toCustomer.html).not.toContain(s);
    // only the address and the time are kept
    const rows = await env.DB.prepare("SELECT * FROM email_sends WHERE user_id = 'quote' AND email = ?").bind(q.email).all();
    expect(rows.results).toHaveLength(1);
  });

  it('escapes what the customer typed in the HTML email, and keeps only links to the site', async () => {
    const sent = resend();
    const r = await ask(quote({ name: '<script>x</script>', message: '<img src=x onerror=alert(1)>',
      items: [{ ...lens, name: '<b>bold</b>', url: 'https://evil.example/phish' }, { ...rack, url: 'javascript:alert(1)' }] }));
    expect(r.status).toBe(200);
    const html = sent[0].html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(sent[0].text + html).not.toContain('evil.example');
    expect(sent[0].text + html).not.toContain('javascript:');
  });

  it('refuses a request without a name, a usable address or items, and sends nothing', async () => {
    const sent = resend();
    expect((await json(await ask(quote({ name: '  ' })))).body.error.code).toBe('no_name');
    expect((await json(await ask(quote({ email: 'not an address' })))).body.error.code).toBe('bad_email');
    expect((await json(await ask(quote({ email: 'a@b.c>, victim@x.com' })))).body.error.code).toBe('bad_email');
    expect((await json(await ask(quote({ items: [] })))).body.error.code).toBe('no_items');
    expect((await json(await ask(quote({ items: [{ ...lens, part: 'RFL ;<x>' }] })))).body.error.code).toBe('bad_item');
    expect((await json(await ask(quote({ items: [{ ...lens, qty: 0 }] })))).body.error.code).toBe('bad_item');
    expect((await json(await ask(quote({ items: Array(51).fill(rack) })))).body.error.code).toBe('too_many_items');
    expect((await call('/v1/quotes', { method: 'POST', body: '{not json' })).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('answers a robot that fills the hidden field as if sent, and sends nothing', async () => {
    const sent = resend();
    const r = await json(await ask(quote({ website: 'http://spam.example' })));
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('takes requests only from the site', async () => {
    const sent = resend();
    expect((await ask(quote(), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await ask(quote(), { origin: null })).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('takes at most 5 requests a day for one address', async () => {
    const sent = resend();
    const email = `limit${++n}@example.org`;
    for (let i = 0; i < 5; i++) expect((await ask(quote({ email }))).status).toBe(200);
    const r = await json(await ask(quote({ email: email.toUpperCase() })));
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('too_many_quotes');
    expect(sent).toHaveLength(10);
  });

  it('fails plainly when sales cannot be emailed, so the cart can fall back to the email draft', async () => {
    resend(() => true);
    const r = await json(await ask(quote()));
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('email_failed');
  });

  it('still succeeds when only the receipt fails: sales has the request', async () => {
    const sent = resend((mail) => mail.to[0] !== 'sales@jeksys.net');
    const r = await json(await ask(quote()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, copied: false });
    expect(sent).toHaveLength(1);
  });

  it('says email is off when there is no Resend key', async () => {
    const was = env.RESEND_API_KEY;
    env.RESEND_API_KEY = '';
    try {
      const r = await json(await ask(quote()));
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('email_off');
    } finally { env.RESEND_API_KEY = was; }
  });
});
