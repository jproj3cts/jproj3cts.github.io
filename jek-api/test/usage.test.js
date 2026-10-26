import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, signedIn } from './helpers.js';
import { MAX_ERRORS, purgeUsage } from '../src/usage.js';
import { html, isoWeek, people, prompts, promptAnswers, text } from '../scripts/usage.mjs';

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

  it('counts people without an id: each browser\'s first visit of the day, week and month, and new ones', async () => {
    const before = people(await report());
    expect((await post({ tier: 'anon', ev: [['visitor', 'new'], ['visitor', 'day'], ['visitor', 'week'], ['visitor', 'month']] })).status).toBe(200);
    expect((await post({ tier: 'free', ev: [['visitor', 'day']] })).status).toBe(200);
    const r = await report(), p = people(r), today = new Date().toISOString().slice(0, 10);
    expect(r.visitors.length).toBeGreaterThan(0);
    expect(p.days[today] - (before.days[today] || 0)).toBe(2);
    expect(p.newcomers - before.newcomers).toBe(1);
    expect(r.peopleEver - (before.total || 0)).toBe(1);
    expect(p.total).toBe(r.peopleEver);
    expect(p.weeks.find((x) => x.k === isoWeek(today)).n).toBeGreaterThan(0);
    expect(isoWeek('2026-10-26')).toBe('2026-W44');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
  });

  it('report a funnel for each sign-in prompt: shown, each answer, sign-in clicks and the click-through', async () => {
    const ev = [['prompt', 'save.shown', 10], ['prompt', 'save.google', 2], ['prompt', 'save.email'], ['prompt', 'save.no', 6],
      ['prompt', 'return.shown', 4], ['prompt', 'return.file', 3], ['prompt', 'shared.copy', 2], ['prompt', 'shared.shown'], ['prompt', 'shared.microsoft'],
      ['prompt', 'menu.shown', 5], ['prompt', 'zz.shown'], ['part', 'lens']];
    // as the API reports them (other tests' counts of the day are there too, so the figures are taken from a report of these alone)
    const shownBefore = (prompts(await report()).find((x) => x.where === 'save') || { shown: 0 }).shown;
    expect((await post({ tier: 'anon', ev })).status).toBe(200);
    expect((await post({ tier: 'free', ev: [['prompt', 'shared.shown'], ['prompt', 'shared.pro']] })).status).toBe(200);
    expect(prompts(await report()).find((x) => x.where === 'save').shown).toBe(shownBefore + 10);
    const r = { from: '2026-10-01', to: '2026-10-01', days: 1, daily: [], errors: [],
      events: [...ev.map(([event, prop, n = 1]) => ({ event, prop, tier: 'anon', n })), { event: 'prompt', prop: 'shared.shown', tier: 'free', n: 1 }, { event: 'prompt', prop: 'shared.pro', tier: 'free', n: 1 }] };
    const p = prompts(r), by = Object.fromEntries(p.map((x) => [x.where, x]));
    // the app's order first, then any other where
    expect(p.map((x) => x.where)).toEqual(['save', 'return', 'shared', 'menu', 'zz']);
    expect(by.save).toEqual({ where: 'save', shown: 10, signins: 3, answers: { google: 2, email: 1, no: 6 }, rate: 0.3 });
    expect(by.return).toMatchObject({ shown: 4, signins: 0, answers: { file: 3 }, rate: 0 });
    // both tiers counted; a bar's click is an answer, not a showing
    expect(by.shared).toMatchObject({ shown: 2, signins: 1, answers: { copy: 2, microsoft: 1, pro: 1 }, rate: 0.5 });
    expect(by.menu).toMatchObject({ shown: 5, signins: 0, rate: 0 });
    expect(promptAnswers(p).slice(0, 3)).toEqual(['google', 'microsoft', 'email']);
    expect(promptAnswers(p)).toEqual(expect.arrayContaining(['no', 'file', 'copy', 'pro']));
    // the page has the table, beside the others
    const page = html(r);
    expect(page).toContain('Sign-in prompts <span>');
    expect(page).toMatch(/<td title="After a file save">save<\/td><td>10<\/td>/);
    expect(page).toContain('<td>3</td><td>30%</td></tr>');
    // and so does the terminal's
    const lines = [], log = console.log;
    console.log = (...a) => lines.push(a.join(' '));
    try { text(r); } finally { console.log = log; }
    const out = lines.join('\n');
    expect(out).toContain('Sign-in prompts (shown, each answer, sign-in clicks and their share of shown)');
    expect(out).toMatch(/\n\s+save\s+10\s+2\s+0\s+1\s+6\s.*\s3\s+30%\n/);
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
