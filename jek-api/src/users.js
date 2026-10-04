// Users and their personal workspace, created together.

import { newId, now } from './util.js';

// With `identity` ({ provider, subject }), the sign-in is attached in the
// same batch, so a person is never left without a way in.
export async function createUser(env, { name, email = null, identity = null }) {
  const t = now();
  const user = { id: newId(), name, email, created_at: t };
  const ws = newId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)').bind(
      user.id, name, email, t,
    ),
    env.DB.prepare(
      "INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'personal', ?, ?, ?)",
    ).bind(ws, name, user.id, t),
    env.DB.prepare(
      "INSERT INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'owner', 1, ?)",
    ).bind(ws, user.id, t),
    ...(identity
      ? [
          env.DB.prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').bind(
            identity.provider, identity.subject, user.id, t,
          ),
        ]
      : []),
  ]);
  return { user, workspaceId: ws };
}

// A subscription counts while Stripe says active or trialing, and through
// 7 days' grace after a failed payment.
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function planActive(sub, t = now()) {
  if (!sub) return false;
  if (sub.status === 'active' || sub.status === 'trialing') return true;
  if (sub.status === 'past_due' && sub.period_end && t < sub.period_end + GRACE_MS) return true;
  return false;
}

export async function me(env, user) {
  const [ids, ws] = await env.DB.batch([
    env.DB.prepare('SELECT provider, subject FROM identities WHERE user_id = ? ORDER BY provider').bind(
      user.id,
    ),
    env.DB.prepare(
      `SELECT w.id, w.kind, w.name, m.role, s.plan, s.status, s.seats, s.period_end
         FROM members m JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN subscriptions s ON s.workspace_id = w.id
        WHERE m.user_id = ?
        ORDER BY w.kind = 'personal' DESC, w.name`,
    ).bind(user.id),
  ]);
  const t = now();
  return {
    user,
    identities: ids.results,
    workspaces: ws.results.map((w) => ({
      id: w.id,
      kind: w.kind,
      name: w.name,
      role: w.role,
      plan: w.plan ? { plan: w.plan, status: w.status, seats: w.seats, period_end: w.period_end } : null,
      active: planActive(w.plan && w, t),
    })),
  };
}
