import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, signedIn } from './helpers.js';
import { MAX_ERRORS, purgeUsage } from '../src/usage.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const post = (body, opts = {}) => call('/v1/events', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'text/plain' }, ...opts });
const report = async (days = 30) => (await call(`/ops/usage?days=${days}`, { origin: null, headers: { Authorization: `Bearer ${OPS}` } })).json();
const count = (r, event, prop, tier) => r.events.filter((e) => e.event === event && e.prop === prop && (!tier || e.tier === tier)).reduce((a, e) => a + e.n, 0);

describe('usage counts', () => {
  it('counts events by day, token and tier, signed in or not, and keeps nothing of who sent them', async () => {
    expect((await post({ tier: 'anon', ev: [['open', 'fresh'], ['part', 'lens', 3]] })).status).toBe(200);
    expect((await post({ tier: 'anon', ev: [['part', 'lens', 2]] })).status).toBe(200);
    const s = await signedIn('Ada');
    // a cookie, if one came, is not read: the count is the tier the app says
    expect((await post({ tier: 'pro', ev: [['part', 'lens']] }, { token: s.token })).status).toBe(200);
    const r = await report();
    expect(count(r, 'part', 'lens', 'anon')).toBe(5);
    expect(count(r, 'part', 'lens', 'pro')).toBe(1);
    expect(count(r, 'open', 'fresh')).toBe(1);
    expect(r.daily.filter((d) => d.event === 'part').reduce((a, d) => a + d.n, 0)).toBe(6);
    // the table has no column that could say who
    const cols = (await env.DB.prepare('PRAGMA table_info(usage_daily)').all()).results.map((c) => c.name);
    expect(cols.sort()).toEqual(['day', 'event', 'n', 'prop', 'tier']);
  });

  it('counts where visits came from and what they led to, by a post\'s tag', async () => {
    expect((await post({ tier: 'anon', ev: [['from', 'ig-spectrometer'], ['from', 'ig-spectrometer.again'], ['goal', 'ig-spectrometer.save'], ['prompt', 'save.shown'], ['remind', '']] })).status).toBe(200);
    const r = await report();
    expect(count(r, 'from', 'ig-spectrometer')).toBe(1);
    expect(count(r, 'goal', 'ig-spectrometer.save')).toBe(1);
    expect(count(r, 'prompt', 'save.shown')).toBe(1);
  });

  it('takes only known events, plain short tokens and known tiers', async () => {
    for (const bad of [
      { tier: 'anon', ev: [['keylogger', '']] },
      { tier: 'anon', ev: [['part', 'my secret bench name']] },
      { tier: 'anon', ev: [['part', 'x'.repeat(41)]] },
      { tier: 'admin', ev: [['open', '']] },
      { ev: [['open', '']] },
      { tier: 'anon', ev: Array(201).fill(['open', '']) },
      'not json',
    ]) expect((await post(bad)).status).toBe(400);
    expect((await post('x'.repeat(17 * 1024))).status).toBe(413);
    // a count is capped
    await post({ tier: 'free', ev: [['quote', 'capped', 1e9]] });
    expect(count(await report(), 'quote', 'capped')).toBe(1000);
  });

  it('come only from the app’s own pages', async () => {
    expect((await post({ tier: 'anon', ev: [['open', '']] }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ tier: 'anon', ev: [['open', '']] }, { origin: null })).status).toBe(403);
  });

  it('records errors, trimmed and capped a day', async () => {
    await post({ tier: 'anon', err: [['TypeError: x is undefined\nat line', 'jekray.html:123<script>'], ['TypeError: x is undefined\nat line', 'jekray.html:123<script>']] });
    const e = (await report()).errors.find((x) => x.src === 'jekray.html:123script');
    expect(e).toMatchObject({ msg: 'TypeError: x is undefined at line', n: 2 });
    expect((await post({ tier: 'anon', err: [['x'.repeat(500), 'a.js:1']] })).status).toBe(200);
    expect((await report()).errors.find((x) => x.src === 'a.js:1').msg).toHaveLength(160);
    for (let i = 0; i < MAX_ERRORS / 20 + 2; i++) await post({ tier: 'anon', err: Array.from({ length: 20 }, (_, j) => [`E${i}-${j}`, 'f.js:1']) });
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_errors').first()).n;
    expect(n).toBe(MAX_ERRORS);
  });

  it('are hidden from all but the operations token, and are held back per address', async () => {
    expect((await call('/ops/usage', { origin: null })).status).toBe(404);
    expect((await call('/ops/usage', { origin: null, headers: { Authorization: 'Bearer nope' } })).status).toBe(404);
    const h = { 'CF-Connecting-IP': '192.0.2.77' };
    let last;
    for (let i = 0; i < 121; i++) last = await post({ tier: 'anon', ev: [['open', '']] }, { headers: { ...h, 'Content-Type': 'text/plain' } });
    expect(last.status).toBe(429);
  });

  it('go after 25 months, and errors after 90 days', async () => {
    const old = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO usage_daily VALUES (?, 'open', '', 'anon', 1)").bind(old(800)),
      env.DB.prepare("INSERT INTO usage_daily VALUES (?, 'open', 'kept', 'anon', 1)").bind(old(700)),
      env.DB.prepare("INSERT INTO usage_errors VALUES (?, 'old', 'x', 1)").bind(old(100)),
    ]);
    await purgeUsage(env);
    const r = await report(760);
    expect(r.daily.filter((d) => d.day === old(800))).toHaveLength(0);
    expect(count(r, 'open', 'kept')).toBe(1);
    expect(r.errors.some((e) => e.msg === 'old')).toBe(false);
  });
});
