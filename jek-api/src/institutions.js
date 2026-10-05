// University licences: JEKray2D Pro for everyone at an institution, paid by
// the institution on an invoice.
//
// An institution is a workspace of kind 'institution' owned by the 'system'
// user; its subscription is the licence. A person is covered while the
// licence counts and either
//   - their verified email is at one of its domains (or a subdomain of one),
//     checked afresh each time, or
//   - they signed in with Microsoft from one of its Entra tenants, or
//   - one of its administrators invited their verified email address, or
//   - their public ORCID record shows a current affiliation with one of its
//     organisations (by ROR, Ringgold or GRID id), checked when they ask and
//     good for a year.
// All but ORCID are checked afresh each time.
// Covered, their personal workspace counts as on a plan. Each month they use
// the app is noted, for the institution's usage report.
//
// A licence is for a tier: at most so many people (subscriptions.seats; 0
// for no limit) using it in any 12 months. There is never a charge for more:
// once the tier is full, someone new is not let in until a place frees, which
// happens when a person has not used it for 12 months. People already using
// it are never cut off.
//
// Institutions are set up by JEK Systems through /ops, with a bearer token
// (OPS_TOKEN, a secret), from scripts/institutions.mjs; never from a browser.

import { orcidOrgs } from './academic.js';
import { mirror, stripe } from './billing.js';
import { planActive } from './users.js';
import { ApiError, newId, now } from './util.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;
export const PRODUCT = 'jekray2d_university';
export const monthOf = (t = now()) => new Date(t).toISOString().slice(0, 7);

// 'a.physics.kcl.ac.uk' -> ['a.physics.kcl.ac.uk', 'physics.kcl.ac.uk', 'kcl.ac.uk', 'ac.uk']
function domainsOf(email) {
  const d = String(email || '').toLowerCase().split('@')[1] || '';
  const parts = d.split('.').filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}

const SUB_COLS = 's.plan, s.status, s.period_end, s.past_due_since, s.stripe_customer, s.seats';

// The first month of the 12 that a tier counts: this one and the 11 before.
export function windowStart(t = now()) {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1)).toISOString().slice(0, 7);
}

// People who used an institution's licence in the last 12 months.
export async function usersInWindow(env, ws, t = now()) {
  // someone the institution had removed holds no place
  const r = await env.DB.prepare(
    `SELECT COUNT(DISTINCT m.user_id) AS n FROM licence_months m
       LEFT JOIN licences l ON l.workspace_id = m.workspace_id AND l.user_id = m.user_id
      WHERE m.workspace_id = ? AND m.month >= ? AND l.removed_at IS NULL`,
  )
    .bind(ws, windowStart(t))
    .first();
  return r.n;
}

// Whether this person may use this licence: always, if they already used it in
// the last 12 months; otherwise only while the tier has room.
async function hasPlace(env, r, user, t) {
  if (!r.seats || r.seats <= 0) return true;
  const mine = await env.DB.prepare('SELECT 1 AS y FROM licence_months WHERE workspace_id = ? AND user_id = ? AND month >= ?')
    .bind(r.workspace_id, user.id, windowStart(t))
    .first();
  if (mine) return true;
  return (await usersInWindow(env, r.workspace_id, t)) < r.seats;
}

// The licence covering this person now: { workspace_id, name, via, detail }; or
// { full: name } when their institution's tier has no room for them; or null.
export async function licenceFor(env, user, t = now()) {
  const found = [];
  const live = async (via, sql, args) => {
    const { results } = await env.DB.prepare(
      `SELECT w.id AS workspace_id, w.name, x.detail, ${SUB_COLS}, l.removed_at
         FROM (${sql}) x JOIN workspaces w ON w.id = x.workspace_id AND w.kind = 'institution'
         JOIN subscriptions s ON s.workspace_id = w.id
         LEFT JOIN licences l ON l.workspace_id = w.id AND l.user_id = ?`,
    )
      .bind(...args, user.id)
      .all();
    for (const r of results) if (!r.removed_at) found.push({ ...r, via });
  };
  // their university's Microsoft tenant
  await live('microsoft',
    `SELECT t.workspace_id, 'Microsoft account' AS detail FROM identities i
       JOIN institution_tenants t ON t.tenant = substr(i.subject, 1, instr(i.subject, ':') - 1)
      WHERE i.user_id = ? AND i.provider = 'microsoft'`, [user.id]);
  const ds = domainsOf(user.email);
  if (ds.length) {
    const { results } = await env.DB.prepare(
      `SELECT w.id AS workspace_id, w.name, d.domain AS detail, ${SUB_COLS}, l.removed_at
         FROM institution_domains d JOIN workspaces w ON w.id = d.workspace_id AND w.kind = 'institution'
         JOIN subscriptions s ON s.workspace_id = w.id
         LEFT JOIN licences l ON l.workspace_id = w.id AND l.user_id = ?
        WHERE d.verified_at IS NOT NULL AND d.domain IN (${ds.map(() => '?').join(', ')})`,
    )
      .bind(user.id, ...ds)
      .all();
    for (const r of results) if (!r.removed_at) found.push({ ...r, via: 'email' });
  }
  // invited by the university's administrators
  if (user.email) {
    await live('invite', "SELECT workspace_id, 'invited' AS detail FROM institution_invites WHERE email = ?", [String(user.email).toLowerCase()]);
  }
  // a current affiliation found on ORCID, for a year
  const { results: kept } = await env.DB.prepare(
    `SELECT w.id AS workspace_id, w.name, l.via, l.detail, ${SUB_COLS}
       FROM licences l JOIN workspaces w ON w.id = l.workspace_id AND w.kind = 'institution'
       JOIN subscriptions s ON s.workspace_id = w.id
      WHERE l.user_id = ? AND l.removed_at IS NULL AND l.via = 'orcid' AND l.until > ?`,
  )
    .bind(user.id, t)
    .all();
  found.push(...kept);
  let full = null;
  for (const r of found) {
    if (!planActive(r, t)) continue;
    if (await hasPlace(env, r, user, t)) return { workspace_id: r.workspace_id, name: r.name, via: r.via, detail: r.detail };
    full = full || r.name;
  }
  return full ? { full } : null;
}

// The licence, noted as used this month (and, for an email match, as joined).
export async function useLicence(env, user, t = now()) {
  const lic = await licenceFor(env, user, t);
  if (!lic || lic.full) return lic;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT OR IGNORE INTO licences (workspace_id, user_id, via, detail, joined_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(lic.workspace_id, user.id, lic.via, lic.detail, t),
    env.DB.prepare('INSERT OR IGNORE INTO licence_months (workspace_id, user_id, month) VALUES (?, ?, ?)').bind(
      lic.workspace_id, user.id, monthOf(t),
    ),
  ]);
  return lic;
}

export const fullError = (name) => new ApiError(403, 'licence_full',
  `${name}'s JEKray2D Pro licence has no free places just now. Ask whoever looks after it at ${name} to move to a larger tier.`);

// POST /v1/me/institution — look for a licence through the person's ORCID
// record (an email match needs no asking).
export async function checkInstitution(env, user) {
  const direct = await useLicence(env, user);
  if (direct && !direct.full) return { licence: direct };
  if (direct) throw fullError(direct.full);
  const id = await env.DB.prepare("SELECT subject FROM identities WHERE user_id = ? AND provider = 'orcid'").bind(user.id).first();
  if (id) {
    let orgs;
    try {
      orgs = await orcidOrgs(env, id.subject);
    } catch (err) {
      console.error('ORCID check failed:', err.message);
      throw new ApiError(502, 'orcid', 'Could not reach ORCID just now. Please try again.');
    }
    for (const o of orgs) {
      if (!o.id) continue;
      const inst = await env.DB.prepare(
        `SELECT w.id, w.name, ${SUB_COLS} FROM institution_orgs i JOIN workspaces w ON w.id = i.workspace_id
           JOIN subscriptions s ON s.workspace_id = w.id WHERE i.scheme = ? AND i.value = ?`,
      )
        .bind(o.id.scheme, o.id.value)
        .first();
      if (!inst || !planActive(inst)) continue;
      const t = now();
      const r = await env.DB.prepare(
        `INSERT INTO licences (workspace_id, user_id, via, detail, joined_at, until) VALUES (?, ?, 'orcid', ?, ?, ?)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET via = 'orcid', detail = excluded.detail, until = excluded.until
         WHERE licences.removed_at IS NULL`,
      )
        .bind(inst.id, user.id, o.name.slice(0, 200), t, t + YEAR)
        .run();
      if (!r.meta.changes) continue; // taken off by the institution
      const lic = await useLicence(env, user);
      if (lic && lic.full) throw fullError(lic.full);
      if (lic) return { licence: lic };
    }
  }
  throw new ApiError(404, 'no_licence',
    'We found no university licence for you. Sign in with your university Google account, or link an ORCID iD that shows your current university.');
}

// ---------- operations: JEK Systems only ----------

const hexEq = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

// The ops token, or 404: without one set, these routes do not exist.
export function requireOps(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.OPS_TOKEN || env.OPS_TOKEN.length < 32 || !hexEq(token, env.OPS_TOKEN)) {
    throw new ApiError(404, 'not_found', 'No such endpoint.');
  }
}

const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
function cleanDomains(list) {
  return [...new Set((list || []).map((d) => String(d).trim().toLowerCase().replace(/^@/, '')))].map((d) => {
    if (!DOMAIN.test(d)) throw new ApiError(400, 'bad_domain', `Not a domain: ${d}`);
    if (d.split('.').length < 2 || /^(ac|edu|co|gov)\.[a-z]{2}$/.test(d)) throw new ApiError(400, 'bad_domain', `Too broad: ${d}`);
    return d;
  });
}
function cleanOrgs(list) {
  return (list || []).map((o) => {
    const scheme = String(o.scheme || '').toUpperCase();
    let value = String(o.value || '').trim();
    if (scheme === 'ROR') value = value.replace(/^https?:\/\/ror\.org\//i, '').toLowerCase();
    if (!['ROR', 'RINGGOLD', 'GRID'].includes(scheme) || !/^[A-Za-z0-9.-]{3,40}$/.test(value)) {
      throw new ApiError(400, 'bad_org', `Not an organisation id: ${scheme} ${value}`);
    }
    return { scheme, value };
  });
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function cleanTenants(list) {
  return [...new Set((list || []).map((x) => String(x).trim().toLowerCase()))].map((x) => {
    if (!GUID.test(x) || x === '9188040d-6c67-4c5b-b112-36a304b66dad') throw new ApiError(400, 'bad_tenant', `Not a Microsoft tenant id: ${x}`);
    return x;
  });
}

async function institution(env, id) {
  const w = await env.DB.prepare("SELECT id, name, created_at FROM workspaces WHERE id = ? AND kind = 'institution'").bind(id).first();
  if (!w) throw new ApiError(404, 'not_found', 'No such institution.');
  return w;
}

// Everything about one institution, as the ops script shows it.
async function describe(env, id, t = now()) {
  const w = await institution(env, id);
  const [d, o, s, n, months, ten, adm, inv] = await env.DB.batch([
    env.DB.prepare('SELECT domain FROM institution_domains WHERE workspace_id = ? ORDER BY domain').bind(id),
    env.DB.prepare('SELECT scheme, value FROM institution_orgs WHERE workspace_id = ? ORDER BY scheme, value').bind(id),
    env.DB.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM licences WHERE workspace_id = ? AND removed_at IS NULL').bind(id),
    env.DB.prepare(
      'SELECT month, COUNT(*) AS users FROM licence_months WHERE workspace_id = ? GROUP BY month ORDER BY month DESC LIMIT 24',
    ).bind(id),
    env.DB.prepare('SELECT tenant FROM institution_tenants WHERE workspace_id = ? ORDER BY tenant').bind(id),
    env.DB.prepare(
      "SELECT u.name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.role = 'admin' ORDER BY u.name",
    ).bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM institution_invites WHERE workspace_id = ?').bind(id),
  ]);
  const sub = s.results[0] || null;
  return {
    id: w.id,
    name: w.name,
    created_at: w.created_at,
    domains: d.results.map((r) => r.domain),
    orgs: o.results,
    tenants: ten.results.map((r) => r.tenant),
    admins: adm.results,
    invited: inv.results[0].n,
    licence: sub && {
      billing: sub.stripe_customer === 'manual' ? 'manual' : 'invoice',
      status: sub.status,
      active: planActive(sub, t),
      period_end: sub.period_end,
      max_users: sub.seats || null,
      stripe_customer: sub.stripe_customer === 'manual' ? null : sub.stripe_customer,
      stripe_subscription: sub.stripe_subscription,
    },
    people: n.results[0].n,
    users_12_months: await usersInWindow(env, id, t),
    active_users: months.results, // newest first: { month: '2026-10', users }
  };
}

async function setLists(env, id, body) {
  const t = now();
  const st = [];
  for (const d of cleanDomains(body.add_domains || body.domains)) {
    const taken = await env.DB.prepare('SELECT workspace_id FROM institution_domains WHERE domain = ?').bind(d).first();
    if (taken && taken.workspace_id !== id) throw new ApiError(409, 'domain_taken', `${d} belongs to another institution.`);
    st.push(env.DB.prepare('INSERT OR IGNORE INTO institution_domains (workspace_id, domain, verified_at) VALUES (?, ?, ?)').bind(id, d, t));
  }
  for (const d of cleanDomains(body.remove_domains)) {
    st.push(env.DB.prepare('DELETE FROM institution_domains WHERE workspace_id = ? AND domain = ?').bind(id, d));
  }
  for (const o of cleanOrgs(body.add_orgs || body.orgs)) {
    const taken = await env.DB.prepare('SELECT workspace_id FROM institution_orgs WHERE scheme = ? AND value = ?').bind(o.scheme, o.value).first();
    if (taken && taken.workspace_id !== id) throw new ApiError(409, 'org_taken', `${o.scheme} ${o.value} belongs to another institution.`);
    st.push(env.DB.prepare('INSERT OR IGNORE INTO institution_orgs (workspace_id, scheme, value) VALUES (?, ?, ?)').bind(id, o.scheme, o.value));
  }
  for (const o of cleanOrgs(body.remove_orgs)) {
    st.push(env.DB.prepare('DELETE FROM institution_orgs WHERE workspace_id = ? AND scheme = ? AND value = ?').bind(id, o.scheme, o.value));
  }
  for (const x of cleanTenants(body.add_tenants || body.tenants)) {
    const taken = await env.DB.prepare('SELECT workspace_id FROM institution_tenants WHERE tenant = ?').bind(x).first();
    if (taken && taken.workspace_id !== id) throw new ApiError(409, 'tenant_taken', `Tenant ${x} belongs to another institution.`);
    st.push(env.DB.prepare('INSERT OR IGNORE INTO institution_tenants (workspace_id, tenant) VALUES (?, ?)').bind(id, x));
  }
  for (const x of cleanTenants(body.remove_tenants)) {
    st.push(env.DB.prepare('DELETE FROM institution_tenants WHERE workspace_id = ? AND tenant = ?').bind(id, x));
  }
  if (st.length) await env.DB.batch(st);
}

// A tier: a whole number of people, or 'unlimited' (stored as 0).
function maxUsers(v) {
  if (v === 'unlimited' || v === 0) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new ApiError(400, 'bad_request', "max_users is the tier's number of people, or 'unlimited'.");
  return n;
}

const readBody = (req) => req.json().catch(() => {
  throw new ApiError(400, 'bad_request', 'The request body is not valid JSON.');
});
const cleanName = (v) => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
  if (!s) throw new ApiError(400, 'bad_request', 'A name is needed.');
  return s;
};

// GET /ops/institutions
export async function opsList(req, env) {
  requireOps(req, env);
  const { results } = await env.DB.prepare("SELECT id FROM workspaces WHERE kind = 'institution' ORDER BY name").all();
  return { institutions: await Promise.all(results.map((r) => describe(env, r.id))) };
}

// GET /ops/institutions/:id
export async function opsGet(req, env, id) {
  requireOps(req, env);
  return describe(env, id);
}

// POST /ops/institutions  {name, domains: [...], orgs: [{scheme, value}]}
export async function opsCreate(req, env) {
  requireOps(req, env);
  const body = await readBody(req);
  const name = cleanName(body.name);
  // checked before anything is written
  cleanDomains(body.domains);
  cleanOrgs(body.orgs);
  cleanTenants(body.tenants);
  const id = newId();
  await env.DB.prepare("INSERT INTO workspaces (id, kind, name, owner_id, created_at) VALUES (?, 'institution', ?, 'system', ?)")
    .bind(id, name, now())
    .run();
  try {
    await setLists(env, id, body);
  } catch (err) {
    await env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id).run();
    throw err;
  }
  return describe(env, id);
}

// PATCH /ops/institutions/:id  {name?, add_domains?, remove_domains?, add_orgs?, remove_orgs?}
export async function opsPatch(req, env, id) {
  requireOps(req, env);
  await institution(env, id);
  const body = await readBody(req);
  if (body.name !== undefined) await env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = ?').bind(cleanName(body.name), id).run();
  await setLists(env, id, body);
  return describe(env, id);
}

// POST /ops/institutions/:id/manual  {until: ms or 'YYYY-MM-DD', max_users} — a
// licence not invoiced through Stripe (paid some other way), until a date;
// until in the past ends it.
export async function opsManual(req, env, id) {
  requireOps(req, env);
  await institution(env, id);
  const body = await readBody(req);
  const until = typeof body.until === 'number' ? body.until : Date.parse(body.until);
  if (!Number.isFinite(until)) throw new ApiError(400, 'bad_request', 'until must be a date.');
  const seats = maxUsers(body.max_users);
  const cur = await env.DB.prepare('SELECT stripe_customer, status FROM subscriptions WHERE workspace_id = ?').bind(id).first();
  if (cur && cur.stripe_customer !== 'manual' && cur.status !== 'canceled') {
    throw new ApiError(409, 'invoiced', 'This institution has an invoiced licence; change it in Stripe.');
  }
  await env.DB.prepare(
    `INSERT INTO subscriptions (workspace_id, stripe_customer, stripe_subscription, plan, seats, status, period_end, updated_at)
     VALUES (?, 'manual', NULL, 'institution', ?, 'active', ?, ?)
     ON CONFLICT (workspace_id) DO UPDATE SET stripe_customer = 'manual', stripe_subscription = NULL, plan = 'institution',
       seats = excluded.seats, status = 'active', period_end = excluded.period_end, past_due_since = NULL, cancel_at = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(id, seats, until, now())
    .run();
  return describe(env, id);
}

// POST /ops/institutions/:id/invoice
//   {amount: pence a year, email: accounts payable, contact?: name, po?: purchase order,
//    days_until_due?: 30, description?: what the invoice says}
// A yearly subscription that Stripe invoices by email (paid by bank transfer
// or card, as the Stripe account allows); the webhook keeps its state here.
export async function opsInvoice(req, env, id) {
  requireOps(req, env);
  const w = await institution(env, id);
  const body = await readBody(req);
  const amount = Math.round(Number(body.amount));
  if (!Number.isInteger(amount) || amount < 100 || amount > 10_000_000) throw new ApiError(400, 'bad_request', 'amount is the yearly price in pence.');
  const email = String(body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'bad_request', 'email is where Stripe sends the invoice.');
  const days = body.days_until_due === undefined ? 30 : Math.round(Number(body.days_until_due));
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new ApiError(400, 'bad_request', 'days_until_due is 1 to 120.');
  const seats = maxUsers(body.max_users);
  const cur = await env.DB.prepare('SELECT stripe_customer, stripe_subscription, status FROM subscriptions WHERE workspace_id = ?').bind(id).first();
  if (cur && cur.stripe_customer !== 'manual' && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(cur.status)) {
    throw new ApiError(409, 'invoiced', 'This institution already has an invoiced licence; change it in Stripe.');
  }
  const product = await stripe(env, 'GET', `/products/${PRODUCT}`, null, { allow404: true });
  if (!product) {
    await stripe(env, 'POST', '/products', { id: PRODUCT, name: 'JEKray2D Pro university licence' });
  }
  const po = typeof body.po === 'string' && body.po.trim() ? body.po.trim().slice(0, 30) : null;
  const customer = await stripe(env, 'POST', '/customers', {
    name: w.name,
    email,
    description: body.contact ? `Contact: ${String(body.contact).slice(0, 200)}` : undefined,
    preferred_locales: ['en-GB'],
    metadata: { workspace_id: id },
    invoice_settings: po ? { custom_fields: [{ name: 'PO number', value: po }] } : undefined,
  });
  const s = await stripe(env, 'POST', '/subscriptions', {
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: days,
    description: (typeof body.description === 'string' && body.description.trim()) ||
      `JEKray2D Pro for everyone at ${w.name}, for one year`,
    items: [{ price_data: { currency: 'gbp', product: PRODUCT, unit_amount: amount, recurring: { interval: 'year' } } }],
    metadata: { workspace_id: id, plan: 'institution', max_users: String(seats) },
  });
  await mirror(env, s);
  return describe(env, id);
}

// POST /ops/institutions/:id/remove  {email} — at the institution's request,
// someone no longer covered; their place frees at once.
export async function opsRemove(req, env, id) {
  requireOps(req, env);
  await institution(env, id);
  const email = String((await readBody(req)).email || '').trim().toLowerCase();
  if (!email.includes('@')) throw new ApiError(400, 'bad_request', 'email is the address of the person to remove.');
  const n = await removeByEmail(env, id, email);
  if (!n) throw new ApiError(404, 'not_found', `No account has the email ${email}.`);
  return { removed: n, ...(await describe(env, id)) };
}

// Takes everyone with this verified email off an institution's licence (and
// any invitation of it); the number of accounts.
async function removeByEmail(env, id, email) {
  const { results } = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL').bind(email).all();
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM institution_invites WHERE workspace_id = ? AND email = ?').bind(id, email),
    ...results.map((u) => env.DB.prepare(
      `INSERT INTO licences (workspace_id, user_id, via, detail, joined_at, removed_at) VALUES (?, ?, 'invite', 'removed', ?, ?)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET removed_at = excluded.removed_at`,
    ).bind(id, u.id, t, t)),
  ]);
  return results.length;
}

// POST /ops/institutions/:id/admins  {email, remove?} — someone (with an
// account) who looks after the licence at the institution.
export async function opsAdmin(req, env, id) {
  requireOps(req, env);
  await institution(env, id);
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const u = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND deleted_at IS NULL ORDER BY created_at LIMIT 1').bind(email).first();
  if (!u) throw new ApiError(404, 'not_found', `No account has the email ${email}. They sign in to JEKray2D once first.`);
  if (body.remove) await env.DB.prepare("DELETE FROM members WHERE workspace_id = ? AND user_id = ? AND role = 'admin'").bind(id, u.id).run();
  else {
    await env.DB.prepare("INSERT OR IGNORE INTO members (workspace_id, user_id, role, seat, created_at) VALUES (?, ?, 'admin', 0, ?)")
      .bind(id, u.id, now())
      .run();
  }
  return describe(env, id);
}

// ---------- the institution's own administrators ----------
//
// They see the licence, its tier and monthly counts, and who it is set up to
// cover; they can invite people without a qualifying address, and take
// people off by email. They never see who uses it: removing someone says
// the same whether or not that person has an account.

async function adminOf(env, user, id) {
  const m = await env.DB.prepare(
    `SELECT w.id, w.name FROM members m JOIN workspaces w ON w.id = m.workspace_id AND w.kind = 'institution'
      WHERE m.workspace_id = ? AND m.user_id = ? AND m.role IN ('owner', 'admin')`,
  )
    .bind(id, user.id)
    .first();
  if (!m) throw new ApiError(404, 'not_found', 'No such institution.');
  return m;
}

const EMAIL = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/;
const emailOf = (body) => {
  const e = String((body && body.email) || '').trim().toLowerCase();
  if (!EMAIL.test(e)) throw new ApiError(400, 'bad_request', 'Give an email address.');
  return e;
};

// GET /v1/institutions/:id
export async function adminGet(env, user, id, t = now()) {
  await adminOf(env, user, id);
  const d = await describe(env, id, t);
  const { results: invites } = await env.DB.prepare(
    'SELECT email, created_at FROM institution_invites WHERE workspace_id = ? ORDER BY email',
  )
    .bind(id)
    .all();
  const l = d.licence;
  return {
    id: d.id,
    name: d.name,
    licence: l && { active: l.active, status: l.status, until: l.period_end, max_users: l.max_users, invoiced: l.billing === 'invoice' },
    users_12_months: d.users_12_months,
    months: d.active_users.slice(0, 12),
    domains: d.domains,
    orgs: d.orgs,
    tenants: d.tenants,
    invites,
  };
}

// POST /v1/institutions/:id/invites  {email}
export async function adminInvite(req, env, user, id) {
  await adminOf(env, user, id);
  const email = emailOf(await readBody(req));
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM institution_invites WHERE workspace_id = ?').bind(id).first();
  if (n.n >= 1000) throw new ApiError(409, 'too_many', 'This licence has 1,000 invitations; remove some first.');
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO institution_invites (workspace_id, email, invited_by, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, email, user.id, now()),
    // inviting someone undoes their removal
    env.DB.prepare(
      'UPDATE licences SET removed_at = NULL WHERE workspace_id = ? AND user_id IN (SELECT id FROM users WHERE lower(email) = ?)',
    ).bind(id, email),
  ]);
  return adminGet(env, user, id);
}

// DELETE /v1/institutions/:id/invites/:email
export async function adminUninvite(env, user, id, email) {
  await adminOf(env, user, id);
  await env.DB.prepare('DELETE FROM institution_invites WHERE workspace_id = ? AND email = ?').bind(id, String(email).toLowerCase()).run();
  return adminGet(env, user, id);
}

// POST /v1/institutions/:id/remove  {email} — the same answer whether or not
// the address has an account.
export async function adminRemove(req, env, user, id) {
  await adminOf(env, user, id);
  await removeByEmail(env, id, emailOf(await readBody(req)));
  return { ok: true };
}

// POST /v1/institutions/:id/restore  {email}
export async function adminRestore(req, env, user, id) {
  await adminOf(env, user, id);
  const email = emailOf(await readBody(req));
  await env.DB.prepare(
    'UPDATE licences SET removed_at = NULL WHERE workspace_id = ? AND user_id IN (SELECT id FROM users WHERE lower(email) = ?)',
  )
    .bind(id, email)
    .run();
  return { ok: true };
}

// POST /ops/institutions/:id/tier  {max_users} — a different tier, as agreed
// (kept on the Stripe subscription for an invoiced licence).
export async function opsTier(req, env, id) {
  requireOps(req, env);
  await institution(env, id);
  const seats = maxUsers((await readBody(req)).max_users);
  const cur = await env.DB.prepare('SELECT stripe_customer, stripe_subscription FROM subscriptions WHERE workspace_id = ?').bind(id).first();
  if (!cur) throw new ApiError(404, 'no_licence', 'This institution has no licence yet.');
  if (cur.stripe_customer === 'manual') {
    await env.DB.prepare('UPDATE subscriptions SET seats = ?, updated_at = ? WHERE workspace_id = ?').bind(seats, now(), id).run();
  } else {
    const s = await stripe(env, 'POST', `/subscriptions/${cur.stripe_subscription}`, { metadata: { max_users: String(seats) } });
    await mirror(env, s);
  }
  return describe(env, id);
}
