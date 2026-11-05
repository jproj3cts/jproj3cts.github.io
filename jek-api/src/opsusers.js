// The people with accounts, for JEK Systems (GET /ops/users, behind the OPS_TOKEN): who they are, how
// they sign in, their plan, and what their account holds and when it was last used. Account records
// only: the anonymous usage counts (src/usage.js) are never joined to anyone, and no bench's contents
// are read, only how many there are, their size and when they were saved.

import { requireOps } from './institutions.js';
import { SESSION_MS } from './sessions.js';
import { planActive } from './users.js';
import { now } from './util.js';

const DAY = 86400000;
const MAX_USERS = 5000;
const PLAN_ORDER = ['institution', 'team', 'individual', 'academic'];

export async function opsUsers(req, env) {
  requireOps(req, env);
  const t = now();
  const month = new Date(t).toISOString().slice(0, 7);
  // each piece on its own: one the database cannot answer (a table a migration has not made yet) is left out
  // and named in `problems`, and the rest still comes back
  const problems = [];
  const all = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then((r) => r.results, (err) => {
    problems.push({ query: sql.replace(/\s+/g, ' ').slice(0, 90), error: String(err && err.message || err).slice(0, 200) });
    return [];
  });
  const [users, ids, sess, subs, lic, benches, saves, parts, links, ex, tast] = await Promise.all([
    all(`SELECT id, name, email, created_at, academic_until, academic_via FROM users
          WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${MAX_USERS}`),
    all('SELECT user_id, provider FROM identities ORDER BY provider'),
    all('SELECT user_id, MAX(created_at) AS signed_in, MAX(expires_at) AS expires, SUM(expires_at > ?) AS live FROM sessions GROUP BY user_id', t),
    all(`SELECT m.user_id, m.role, w.kind, s.plan, s.status, s.period_end, s.past_due_since, s.stripe_customer, s.interval
           FROM members m JOIN workspaces w ON w.id = m.workspace_id JOIN subscriptions s ON s.workspace_id = w.id`),
    all('SELECT DISTINCT user_id FROM licences WHERE removed_at IS NULL AND (until IS NULL OR until > ?)', t),
    all('SELECT created_by AS user_id, COUNT(*) AS n, SUM(size_bytes) AS bytes FROM benches WHERE deleted_at IS NULL GROUP BY created_by'),
    all('SELECT updated_by AS user_id, MAX(updated_at) AS at FROM benches GROUP BY updated_by'),
    all('SELECT created_by AS user_id, COUNT(*) AS n FROM parts GROUP BY created_by'),
    all('SELECT user_id, COUNT(*) AS n, SUM(opens) AS opens FROM share_links GROUP BY user_id'),
    all('SELECT user_id, COUNT(*) AS n, MAX(solved_at) AS at FROM exercises_solved GROUP BY user_id'),
    all('SELECT user_id, SUM(n) AS n FROM taster_uses WHERE month = ? GROUP BY user_id', month),
  ]);
  const by = (rows) => new Map(rows.map((r) => [r.user_id, r]));
  const S = by(sess), Bn = by(benches), Sv = by(saves), Pt = by(parts), Ln = by(links), Ex = by(ex), Ts = by(tast);
  const L = new Set(lic.map((r) => r.user_id));
  const providers = new Map(), plans = new Map();
  for (const r of ids) providers.set(r.user_id, [...new Set([...(providers.get(r.user_id) || []), r.provider])]);
  for (const r of subs) if (planActive(r, t)) plans.set(r.user_id, [...(plans.get(r.user_id) || []), r]);

  const out = users.map((u) => {
    const s = S.get(u.id), active = plans.get(u.id) || [];
    // the plan that gives them the most, by what pays for it
    const best = active.sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan))[0];
    const plan = best ? (best.plan === 'team' && best.role !== 'owner' ? 'team member' : best.plan)
      : L.has(u.id) ? 'university licence' : u.academic_until > t ? 'academic (unpaid)' : 'free';
    // a session's expiry moves on with use (a day at a time), so it says when it was last used, to the day
    const seen = s && s.expires ? Math.min(t, s.expires - SESSION_MS) : null;
    const last = Math.max(seen || 0, Sv.get(u.id)?.at || 0, Ex.get(u.id)?.at || 0) || null;
    return {
      id: u.id, name: u.name, email: u.email, joined: u.created_at,
      signs_in_with: providers.get(u.id) || [],
      plan, billing: best ? (best.stripe_customer === 'manual' ? 'manual' : best.interval || 'stripe') : null,
      academic: u.academic_until > t ? u.academic_via : null,
      last_signed_in: s ? s.signed_in : null, last_active: last, live_sessions: s ? s.live : 0,
      benches: Bn.get(u.id)?.n || 0, bench_bytes: Bn.get(u.id)?.bytes || 0, last_saved: Sv.get(u.id)?.at || null,
      parts: Pt.get(u.id)?.n || 0, share_links: Ln.get(u.id)?.n || 0, link_opens: Ln.get(u.id)?.opens || 0,
      exercises: Ex.get(u.id)?.n || 0, tasters_this_month: Ts.get(u.id)?.n || 0,
    };
  });

  const count = (f) => out.filter(f).length;
  const tally = (key) => out.reduce((m, u) => { for (const k of [].concat(key(u))) m[k] = (m[k] || 0) + 1; return m; }, {});
  // sign-ups and active people, week by week (weeks start on Monday, UTC), the last 26
  const monday = (ms) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };
  const weeks = [];
  for (let w = monday(t) - 25 * 7 * DAY; w <= t; w += 7 * DAY) {
    weeks.push({ week: new Date(w).toISOString().slice(0, 10), joined: count((u) => u.joined >= w && u.joined < w + 7 * DAY),
      total: count((u) => u.joined < w + 7 * DAY), active: count((u) => u.last_active >= w && u.last_active < w + 7 * DAY) });
  }
  return {
    at: t,
    truncated: users.length >= MAX_USERS,
    problems,
    summary: {
      people: out.length,
      joined_7d: count((u) => u.joined > t - 7 * DAY), joined_30d: count((u) => u.joined > t - 30 * DAY),
      active_7d: count((u) => u.last_active > t - 7 * DAY), active_30d: count((u) => u.last_active > t - 30 * DAY),
      paying: count((u) => !['free', 'academic (unpaid)', 'university licence'].includes(u.plan)),
      with_benches: count((u) => u.benches > 0),
      plans: tally((u) => u.plan),
      sign_in: tally((u) => u.signs_in_with.length ? u.signs_in_with : ['none']),
    },
    weeks,
    users: out,
  };
}
