// Exercises: which of JEKray's exercises (and the challenges from our reels) a person has solved, so a free
// account keeps its progress in any browser. GET /v1/exercises lists them; POST /v1/exercises/:id records one
// solved, keeping the first time and the fewest changes. The app keeps the same list in the browser for someone
// signed out, and sends it once they sign in.

import { ApiError } from './util.js';

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX = 200;                              // exercises kept for one person (there are far fewer)

// GET /v1/exercises: { solved: [{ id, at, changes }] }
export async function exercises(env, user) {
  const rows = (await env.DB.prepare('SELECT ex_id, solved_at, changes FROM exercises_solved WHERE user_id = ? ORDER BY solved_at').bind(user.id).all()).results;
  return { solved: rows.map((r) => ({ id: r.ex_id, at: r.solved_at, changes: r.changes })) };
}

// POST /v1/exercises/:id { changes, at? }: solved; the first time kept, the fewest changes kept
export async function solveExercise(req, env, user, id) {
  if (!ID.test(id || '')) throw new ApiError(400, 'bad_exercise', 'That is not an exercise.');
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const changes = Number.isInteger(body.changes) && body.changes >= 0 ? Math.min(body.changes, 100000) : 0;
  const now = Date.now(), at = Number.isInteger(body.at) && body.at > 0 && body.at <= now ? body.at : now;
  const have = await env.DB.prepare('SELECT COUNT(*) AS n FROM exercises_solved WHERE user_id = ?').bind(user.id).first();
  const known = await env.DB.prepare('SELECT 1 FROM exercises_solved WHERE user_id = ? AND ex_id = ?').bind(user.id, id).first();
  if (!known && have.n >= MAX) throw new ApiError(409, 'too_many', 'That is more exercises than there are.');
  await env.DB.prepare(`INSERT INTO exercises_solved (user_id, ex_id, solved_at, changes) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, ex_id) DO UPDATE SET solved_at = MIN(solved_at, excluded.solved_at), changes = MIN(changes, excluded.changes)`).bind(user.id, id, at, changes).run();
  return exercises(env, user);
}
