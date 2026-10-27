// Tasters: so that someone on a free account can try JEKrayPro's work before paying for it, a few uses a month
// of each part of it that runs in their own browser (and so costs nothing to give): the designers' optimiser,
// tolerancing, scripts, design reports, drawings, design exports and the data export's Pro formats. The app
// asks how many are left (GET /v1/tasters) and spends one as the work starts (POST /v1/tasters/:feature). A
// JEKrayPro plan needs none: the app does not ask. The count resets each calendar month (UTC).

import { ApiError } from './util.js';

export const TASTERS = { optimise: 5, tolerance: 3, script: 10, report: 3, drawing: 3, design: 3, data: 5 };
const KEEP_MONTHS = 13;
export const thisMonth = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);

// GET /v1/tasters: { month, limits, left }
export async function tasters(env, user) {
  const month = thisMonth();
  const rows = (await env.DB.prepare('SELECT feature, n FROM taster_uses WHERE user_id = ? AND month = ?').bind(user.id, month).all()).results;
  const used = Object.fromEntries(rows.map((r) => [r.feature, r.n]));
  return { month, limits: TASTERS, left: Object.fromEntries(Object.entries(TASTERS).map(([k, lim]) => [k, Math.max(0, lim - (used[k] || 0))])) };
}

// POST /v1/tasters/:feature: one use, while the month has any left; { feature, left }
export async function useTaster(env, user, feature) {
  const lim = TASTERS[feature];
  if (!lim) throw new ApiError(404, 'no_taster', 'There is no such taster.');
  const month = thisMonth();
  // counted up only while under the limit: two uses at once cannot both take the last one
  await env.DB.prepare('INSERT OR IGNORE INTO taster_uses (user_id, feature, month, n) VALUES (?, ?, ?, 0)').bind(user.id, feature, month).run();
  const r = await env.DB.prepare('UPDATE taster_uses SET n = n + 1 WHERE user_id = ? AND feature = ? AND month = ? AND n < ?').bind(user.id, feature, month, lim).run();
  if (!r.meta.changes) throw new ApiError(409, 'taster_used', 'This month’s free uses of this are spent. JEKrayPro has them without a limit.');
  const row = await env.DB.prepare('SELECT n FROM taster_uses WHERE user_id = ? AND feature = ? AND month = ?').bind(user.id, feature, month).first();
  return { feature, left: Math.max(0, lim - row.n) };
}

// daily: months older than a year go
export async function purgeTasters(env) {
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() - KEEP_MONTHS);
  await env.DB.prepare('DELETE FROM taster_uses WHERE month < ?').bind(thisMonth(d.getTime())).run();
}
