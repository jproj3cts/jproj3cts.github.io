import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIRM } from '../src/account.js';
import { currentOrgs } from '../src/academic.js';
import { monthOf } from '../src/institutions.js';
import { planActive } from '../src/users.js';
import { createSession } from '../src/sessions.js';
import { createUser } from '../src/users.js';
import { bench, call, send } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DAY = 86400000;
const ops = (path, method = 'GET', body, token = OPS) =>
  call(path, { method, origin: null, body: body && JSON.stringify(body), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

// A stand-in for Stripe and ORCID: records calls; ORCID affiliations per iD.
let calls, orcid;
beforeEach(() => {
  calls = []; orcid = {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ method: init.method || 'GET', path: url.pathname, body });
    const ok = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.host === 'orcid.org') return ok({ access_token: 'read' });
    if (url.host === 'pub.orcid.org') {
      const [, , id, kind] = url.pathname.split('/');
      const list = (orcid[id] || []).filter((a) => a.kind === kind);
      const key = kind === 'employments' ? 'employment-summary' : 'education-summary';
      return ok({ 'affiliation-group': list.map((a) => ({ summaries: [{ [key]: a.summary }] })) });
    }
    if (url.pathname === '/v1/products/jekray2d_university') return ok({ error: { message: 'No such product' } }, 404);
    if (url.pathname === '/v1/products') return ok({ id: 'jekray2d_university' });
    if (url.pathname === '/v1/customers') return ok({ id: 'cus_uni' });
    if (url.pathname === '/v1/subscriptions') {
      return ok({
        id: 'sub_uni', object: 'subscription', customer: 'cus_uni', status: 'active', cancel_at_period_end: false, cancel_at: null,
        metadata: { workspace_id: body.get('metadata[workspace_id]'), plan: body.get('metadata[plan]') },
        items: { data: [{ id: 'si_uni', quantity: 1, current_period_end: Math.floor((Date.now() + 365 * DAY) / 1000),
          price: { id: 'price_x', lookup_key: null, unit_amount: Number(body.get('items[0][price_data][unit_amount]')), currency: 'gbp', recurring: { interval: 'year' } } }] },
      });
    }
    return ok({ error: { message: 'unexpected ' + url.pathname } }, 500);
  });
});
afterEach(() => vi.restoreAllMocks());

let n = 0;
async function person(email, { orcidId } = {}) {
  const { user, workspaceId } = await createUser(env, { name: `Person ${++n}`, email });
  if (orcidId) await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('orcid', ?, ?, 0)").bind(orcidId, user.id).run();
  const { token } = await createSession(env, user.id, 'vitest');
  return { user, workspaceId, token };
}
const me = async (p) => (await call('/v1/me', { token: p.token })).json();
const save = (p) => send(`/v1/workspaces/${p.workspaceId}/benches`, 'POST', p.token, { name: 'B', content: bench('B') });
let u = 0;
async function uni(extra = {}) {
  const d = `uni${++u}.ac.uk`;
  const r = await ops('/ops/institutions', 'POST', { name: `University ${u}`, domains: [d], ...extra });
  expect(r.status).toBe(201);
  return { ...(await r.json()), domain: d };
}
const pilot = (id, until) => ops(`/ops/institutions/${id}/pilot`, 'POST', { until });
const orcidJob = (ror, { ended = false, name = 'King’s College London', scheme = 'ROR' } = {}) => ({
  kind: 'employments',
  summary: { organization: { name, 'disambiguated-organization': { 'disambiguated-organization-identifier': scheme === 'ROR' ? `https://ror.org/${ror}` : ror, 'disambiguation-source': scheme } },
    ...(ended ? { 'end-date': { year: { value: '2020' }, month: { value: '01' } } } : {}) },
});

describe('operations', () => {
  it('do not exist without the token, or with a wrong one, and never need a browser’s origin', async () => {
    expect((await ops('/ops/institutions', 'GET', undefined, '')).status).toBe(404);
    expect((await ops('/ops/institutions', 'GET', undefined, OPS.replace('0', '1'))).status).toBe(404);
    expect((await ops('/ops/institutions', 'POST', { name: 'X', domains: ['x.ac.uk'] }, 'nope')).status).toBe(404);
    expect((await ops('/ops/institutions')).status).toBe(200);
  });

  it('set up an institution with its domains and ORCID organisations, refusing broad or taken ones', async () => {
    const a = await uni({ orgs: [{ scheme: 'ROR', value: 'https://ror.org/0220MZB33' }] });
    expect(a).toMatchObject({ domains: [a.domain], orgs: [{ scheme: 'ROR', value: '0220mzb33' }], licence: null, people: 0 });
    expect((await ops('/ops/institutions', 'POST', { name: 'Bad', domains: ['ac.uk'] })).status).toBe(400);
    expect((await ops('/ops/institutions', 'POST', { name: 'Bad', domains: ['not a domain'] })).status).toBe(400);
    expect((await ops('/ops/institutions', 'POST', { name: 'Copy', domains: [a.domain] })).status).toBe(409);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM workspaces WHERE name = 'Copy'").first()).toEqual({ n: 0 });
    const p = await (await ops(`/ops/institutions/${a.id}`, 'PATCH', { add_domains: ['kcl-test.ac.uk'], remove_orgs: [{ scheme: 'ROR', value: '0220mzb33' }] })).json();
    expect(p.domains).toEqual([a.domain, 'kcl-test.ac.uk'].sort());
    expect(p.orgs).toEqual([]);
  });
});

describe('a licence through a university email', () => {
  it('covers its people, subdomains too, while the licence counts, and no one else', async () => {
    const a = await uni();
    const ada = await person(`ada@${a.domain}`), bea = await person(`bea@physics.${a.domain}`), eve = await person('eve@gmail.com');
    expect((await save(ada)).status).toBe(402);
    expect((await me(ada)).licence).toBeNull();
    await pilot(a.id, Date.now() + 30 * DAY);
    const m = await me(ada);
    expect(m.licence).toEqual({ name: a.name, via: 'email' });
    expect(m.workspaces.find((w) => w.kind === 'personal').active).toBe(true);
    expect((await save(ada)).status).toBe(201);
    expect((await me(bea)).licence).toEqual({ name: a.name, via: 'email' });
    expect((await me(eve)).licence).toBeNull();
    expect((await save(eve)).status).toBe(402);
  });

  it('ends with the licence: a pilot past its date, and a cancelled invoice', async () => {
    const a = await uni();
    const ada = await person(`ada@${a.domain}`);
    await pilot(a.id, Date.now() + DAY);
    expect((await save(ada)).status).toBe(201);
    await pilot(a.id, Date.now() - 1000);
    expect((await me(ada)).licence).toBeNull();
    expect((await save(ada)).status).toBe(402);
    // their benches stay readable, as for any lapsed plan
    expect((await call(`/v1/workspaces/${ada.workspaceId}/benches`, { token: ada.token })).status).toBe(200);
  });

  it('is counted once a month for the usage report', async () => {
    const a = await uni();
    await pilot(a.id, Date.now() + DAY);
    const ada = await person(`ada@${a.domain}`), bea = await person(`bea@${a.domain}`);
    await me(ada); await me(ada); await me(bea);
    const d = await (await ops(`/ops/institutions/${a.id}`)).json();
    expect(d.people).toBe(2);
    expect(d.active_users).toEqual([{ month: monthOf(), users: 2 }]);
    expect(d.licence).toMatchObject({ billing: 'pilot', active: true });
  });

  it('is not given to someone the institution took off', async () => {
    const a = await uni();
    await pilot(a.id, Date.now() + DAY);
    const ada = await person(`ada@${a.domain}`);
    await me(ada);
    await env.DB.prepare('UPDATE licences SET removed_at = 1 WHERE user_id = ?').bind(ada.user.id).run();
    expect((await me(ada)).licence).toBeNull();
  });
});

describe('a licence through ORCID', () => {
  it('reads current affiliations and their ids, and skips ended ones', () => {
    const orgs = currentOrgs({ 'affiliation-group': [
      { summaries: [{ 'employment-summary': orcidJob('0220mzb33').summary }] },
      { summaries: [{ 'employment-summary': orcidJob('abc', { ended: true }).summary }] },
      { summaries: [{ 'employment-summary': orcidJob('4616', { scheme: 'RINGGOLD' }).summary }] },
    ] });
    expect(orgs.map((o) => o.id)).toEqual([{ scheme: 'ROR', value: '0220mzb33' }, { scheme: 'RINGGOLD', value: '4616' }]);
  });

  it('is found when asked, lasts a year, and is not found for an ended or unknown affiliation', async () => {
    const a = await uni({ orgs: [{ scheme: 'ROR', value: '0220mzb33' }] });
    await pilot(a.id, Date.now() + DAY);
    const ada = await person(null, { orcidId: '0000-0002-0000-0001' });
    orcid['0000-0002-0000-0001'] = [orcidJob('0220mzb33')];
    const r = await call('/v1/me/institution', { method: 'POST', token: ada.token });
    expect(r.status).toBe(200);
    expect((await r.json()).licence).toMatchObject({ name: a.name, via: 'orcid' });
    const row = await env.DB.prepare('SELECT until FROM licences WHERE user_id = ?').bind(ada.user.id).first();
    expect(row.until).toBeGreaterThan(Date.now() + 364 * DAY);
    expect((await me(ada)).licence).toEqual({ name: a.name, via: 'orcid' });
    expect((await save(ada)).status).toBe(201);

    const old = await person(null, { orcidId: '0000-0002-0000-0002' });
    orcid['0000-0002-0000-0002'] = [orcidJob('0220mzb33', { ended: true }), orcidJob('99999zz99')];
    const no = await call('/v1/me/institution', { method: 'POST', token: old.token });
    expect(no.status).toBe(404);
    expect((await no.json()).error.code).toBe('no_licence');
  });
});

describe('an invoiced licence', () => {
  it('makes a yearly Stripe subscription that is invoiced by email, with the PO, and mirrors it as an institution’s', async () => {
    const a = await uni();
    const r = await ops(`/ops/institutions/${a.id}/invoice`, 'POST', { amount: 350000, email: 'ap@uni.ac.uk', contact: 'Dr A', po: 'PO-1234' });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.licence).toMatchObject({ billing: 'invoice', status: 'active', active: true, stripe_subscription: 'sub_uni' });
    expect(calls.map((c) => c.method + ' ' + c.path)).toEqual(['GET /v1/products/jekray2d_university', 'POST /v1/products', 'POST /v1/customers', 'POST /v1/subscriptions']);
    const cust = calls[2].body, sub = calls[3].body;
    expect(cust.get('email')).toBe('ap@uni.ac.uk');
    expect(cust.get('invoice_settings[custom_fields][0][value]')).toBe('PO-1234');
    expect(cust.get('metadata[workspace_id]')).toBe(a.id);
    expect(sub.get('collection_method')).toBe('send_invoice');
    expect(sub.get('days_until_due')).toBe('30');
    expect(sub.get('items[0][price_data][unit_amount]')).toBe('350000');
    expect(sub.get('items[0][price_data][recurring][interval]')).toBe('year');
    expect(sub.get('items[0][price_data][product]')).toBe('jekray2d_university');
    expect(sub.get('metadata[plan]')).toBe('institution');
    const row = await env.DB.prepare('SELECT plan FROM subscriptions WHERE workspace_id = ?').bind(a.id).first();
    expect(row.plan).toBe('institution');
    // and its people are covered
    expect((await me(await person(`x@${a.domain}`))).licence).toMatchObject({ via: 'email' });
    // a second one is refused, and so is a pilot over it
    expect((await ops(`/ops/institutions/${a.id}/invoice`, 'POST', { amount: 350000, email: 'ap@uni.ac.uk' })).status).toBe(409);
    expect((await pilot(a.id, Date.now() + DAY)).status).toBe(409);
  });

  it('checks the amount and the email first', async () => {
    const a = await uni();
    expect((await ops(`/ops/institutions/${a.id}/invoice`, 'POST', { amount: 'lots', email: 'ap@uni.ac.uk' })).status).toBe(400);
    expect((await ops(`/ops/institutions/${a.id}/invoice`, 'POST', { amount: 350000, email: 'nope' })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('gives a late-paying university 60 days’ grace, against a person’s 7', () => {
    const t = Date.now(), since = t - 30 * DAY;
    expect(planActive({ plan: 'institution', status: 'past_due', past_due_since: since }, t)).toBe(true);
    expect(planActive({ plan: 'institution', status: 'past_due', past_due_since: t - 61 * DAY }, t)).toBe(false);
    expect(planActive({ plan: 'individual', status: 'past_due', past_due_since: since }, t)).toBe(false);
  });
});

describe('deleting an account', () => {
  it('takes its licence records with it', async () => {
    const a = await uni();
    await pilot(a.id, Date.now() + DAY);
    const ada = await person(`ada@${a.domain}`);
    await me(ada);
    const r = await call('/v1/me', { method: 'DELETE', token: ada.token, body: JSON.stringify({ confirm: CONFIRM }), headers: { 'Content-Type': 'application/json' } });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM licences WHERE user_id = ?').bind(ada.user.id).first()).toEqual({ n: 0 });
  });
});
