// Usage counts: how the app is used, so JEK Systems can see what to improve
// (see migration 0014). The app sends a batch of counts now and then, signed
// in or not; nothing in it says who, and nothing here records who sent it
// (no cookie is read, no address kept). The app sends nothing when the person
// has turned it off, when their browser asks sites not to track it (Do Not
// Track, Global Privacy Control), from an embed, or in test mode.
//
// What is kept is a count a day for each event, its token and the plan tier.
// Events are a fixed list; tokens are short and plain, so no free text gets
// in. A day holds at most MAX_ROWS rows and MAX_ERRORS distinct errors, so a
// flood cannot fill the database.

import { requireOps } from './institutions.js';
import { ApiError } from './util.js';

export const EVENTS = new Set([
  'open', 'leave', 'screen', 'browser',                 // a visit: how it began, how long, on what
  'from', 'goal', 'prompt', 'remind',                   // where a visit came from (a post's tag), what it led to, sign-in prompts, links emailed
  'visitor', 'taster',                                  // a browser's first visit of the day, week or month, or ever (no id: see the app's usageVisitor); a free account's free uses of Pro work
  'part', 'example', 'import', 'export', 'save', 'share', 'view', 'beam', 'sweep', 'field',
  'designer', 'optimise', 'analysis', 'tolerance', 'report', 'search',
  'tour', 'help', 'news', 'signin', 'subscribe', 'quote', 'mod', 'experimental', 'cloud',
]);
const TIERS = new Set(['anon', 'free', 'pro']);
const TOKEN = /^[a-z0-9][a-z0-9_.+-]{0,39}$/i;
export const MAX_BATCH = 16 * 1024;
export const MAX_ROWS = 20000, MAX_ERRORS = 500;
const KEEP_DAYS = 760, KEEP_ERROR_DAYS = 90;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const bad = () => new ApiError(400, 'bad_events', 'Not a batch of usage counts.');

// POST /v1/events  {tier, ev: [[event, prop, count]], err: [[message, source]]}
export async function record(req, env) {
  const text = await req.text();
  if (text.length > MAX_BATCH) throw new ApiError(413, 'too_large', 'That request is too large.');
  let body;
  try { body = JSON.parse(text); } catch { throw bad(); }
  if (!body || typeof body !== 'object' || !TIERS.has(body.tier)) throw bad();
  const ev = Array.isArray(body.ev) ? body.ev : [], err = Array.isArray(body.err) ? body.err : [];
  if (ev.length > 200 || err.length > 20) throw bad();
  const day = today(), tier = body.tier, stmts = [];
  for (const e of ev) {
    if (!Array.isArray(e)) throw bad();
    const [event, prop = '', count = 1] = e;
    if (!EVENTS.has(event) || typeof prop !== 'string' || (prop && !TOKEN.test(prop))) throw bad();
    const n = Number.isInteger(count) && count > 0 ? Math.min(count, 1000) : 1;
    // a row there already counts on; a new one only while the day has room
    stmts.push(env.DB.prepare('UPDATE usage_daily SET n = n + ? WHERE day = ? AND event = ? AND prop = ? AND tier = ?').bind(n, day, event, prop, tier));
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO usage_daily (day, event, prop, tier, n) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM usage_daily WHERE day = ?) < ?')
      .bind(day, event, prop, tier, n, day, MAX_ROWS));
  }
  for (const e of err) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || typeof e[1] !== 'string') throw bad();
    const msg = e[0].replace(/[\u0000-\u001f]/g, ' ').slice(0, 160) || '(no message)', src = e[1].replace(/[^\w.:/-]/g, '').slice(0, 80);
    stmts.push(env.DB.prepare('UPDATE usage_errors SET n = n + 1 WHERE day = ? AND msg = ? AND src = ?').bind(day, msg, src));
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO usage_errors (day, msg, src, n) SELECT ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM usage_errors WHERE day = ?) < ?')
      .bind(day, msg, src, day, MAX_ERRORS));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { ok: true };
}

// GET /ops/usage?days=30: the counts over the last `days` days, today included
export async function report(req, env) {
  requireOps(req, env);
  const days = Math.max(1, Math.min(KEEP_DAYS, Number(new URL(req.url).searchParams.get('days')) || 30));
  const from = daysAgo(days - 1), to = today();
  const q = (sql) => env.DB.prepare(sql).bind(from, to).all().then((r) => r.results);
  const [daily, events, errors, visitors, ever] = await Promise.all([
    q('SELECT day, event, tier, SUM(n) AS n FROM usage_daily WHERE day BETWEEN ? AND ? GROUP BY day, event, tier ORDER BY day'),
    q('SELECT event, prop, tier, SUM(n) AS n FROM usage_daily WHERE day BETWEEN ? AND ? GROUP BY event, prop, tier ORDER BY event, n DESC'),
    q('SELECT msg, src, SUM(n) AS n, MIN(day) AS first, MAX(day) AS last FROM usage_errors WHERE day BETWEEN ? AND ? GROUP BY msg, src ORDER BY n DESC LIMIT 100'),
    // people: each day's first-of-the-day, -week and -month visits by browsers, and those never seen before
    q("SELECT day, prop, tier, SUM(n) AS n FROM usage_daily WHERE day BETWEEN ? AND ? AND event = 'visitor' GROUP BY day, prop, tier ORDER BY day"),
    // people in all: every browser counts 'new' once, on its first visit ever (as far back as the counts are kept)
    env.DB.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM usage_daily WHERE event = 'visitor' AND prop = 'new'").first(),
  ]);
  return { from, to, days, daily, events, errors, visitors, peopleEver: ever ? ever.n : 0 };
}

// daily: counts older than 25 months, and errors older than 90 days, go
export async function purgeUsage(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM usage_daily WHERE day < ?').bind(daysAgo(KEEP_DAYS)),
    env.DB.prepare('DELETE FROM usage_errors WHERE day < ?').bind(daysAgo(KEEP_ERROR_DAYS)),
  ]);
}
