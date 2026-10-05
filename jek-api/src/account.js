// Deleting an account, as the privacy policy promises: at once, and for good.
//
// What goes: every workspace the person owns alone (their personal one, and
// any team with no one else in it) with its benches, history, folders and
// subscription; their memberships, sign-ins and sessions; their name, email
// and academic status. Any Stripe subscription on those workspaces is
// cancelled first, so no one is charged for an account that is gone; Stripe
// keeps its invoices, which tax law requires.
//
// What stays: benches they saved in someone else's workspace belong to that
// workspace. Those rows point at their user row, so the row itself stays,
// emptied of everything personal ("Deleted user"), and can never sign in.

import { stripe } from './billing.js';
import { ApiError, now } from './util.js';

export const CONFIRM = 'delete my account';

// Subscriptions Stripe would still charge (or is trying to).
const LIVE = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];

// DELETE /v1/me  {confirm: 'delete my account'}
export async function deleteAccount(req, env, user) {
  const body = await req.json().catch(() => ({}));
  if (String(body.confirm || '').trim().toLowerCase() !== CONFIRM) {
    throw new ApiError(400, 'confirm', `To delete your account, send {"confirm": "${CONFIRM}"}.`);
  }
  const { results: owned } = await env.DB.prepare(
    `SELECT w.id, w.kind, w.name,
            (SELECT COUNT(*) FROM members o WHERE o.workspace_id = w.id AND o.user_id != ?) AS others,
            s.stripe_customer, s.stripe_subscription, s.status
       FROM workspaces w LEFT JOIN subscriptions s ON s.workspace_id = w.id
      WHERE w.owner_id = ?`,
  )
    .bind(user.id, user.id)
    .all();
  // A team with other people in it needs a new owner first; deleting it would take their benches.
  const shared = owned.filter((w) => w.kind !== 'personal' && w.others > 0);
  if (shared.length) {
    throw new ApiError(409, 'owns_team', `First make someone else the owner of ${shared.map((w) => `“${w.name}”`).join(', ')}.`);
  }
  // Stop the billing before anything else: if Stripe cannot be reached, nothing is deleted.
  for (const w of owned) {
    if (w.stripe_subscription && w.stripe_customer !== 'manual' && LIVE.includes(w.status)) {
      await stripe(env, 'DELETE', `/subscriptions/${w.stripe_subscription}`);
    }
  }
  const ids = owned.map((w) => w.id);
  // History in R2 first: the rows that name the objects go with the workspaces.
  for (const ws of ids) {
    const { results: vs } = await env.DB.prepare(
      'SELECT v.r2_key FROM bench_versions v JOIN benches b ON b.id = v.bench_id WHERE b.workspace_id = ?',
    )
      .bind(ws)
      .all();
    for (let i = 0; i < vs.length; i += 1000) await env.BENCHES.delete(vs.slice(i, i + 1000).map((v) => v.r2_key));
  }
  const del = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    // benches, versions, folders, members, invitations, the subscription and activity go with each workspace
    ...ids.flatMap((ws) => [
      del('DELETE FROM benches WHERE workspace_id = ?', ws),
      del('DELETE FROM folders WHERE workspace_id = ?', ws),
      del('DELETE FROM workspaces WHERE id = ?', ws),
    ]),
    del('DELETE FROM members WHERE user_id = ?', user.id),
    del('DELETE FROM invitations WHERE invited_by = ?', user.id),
    del('DELETE FROM identities WHERE user_id = ?', user.id),
    del('DELETE FROM sessions WHERE user_id = ?', user.id),
    del(
      "UPDATE users SET name = 'Deleted user', email = NULL, academic_until = NULL, academic_via = NULL, deleted_at = ? WHERE id = ?",
      now(), user.id,
    ),
  ]);
  return { ok: true, workspaces: ids.length };
}
