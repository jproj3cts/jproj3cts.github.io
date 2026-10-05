#!/usr/bin/env node
// University licences, from your own computer: JEK Systems' side of /ops.
//
//   export JEK_OPS_TOKEN=...            (the same value as the OPS_TOKEN secret)
//   node scripts/institutions.mjs list
//   node scripts/institutions.mjs create "King's College London" --domain kcl.ac.uk --ror 0220mzb33
//   node scripts/institutions.mjs pilot <id> --until 2027-01-31
//   node scripts/institutions.mjs invoice <id> --amount 3500 --email accounts@kcl.ac.uk --po PO123 [--contact "Dr A"] [--days 30]
//   node scripts/institutions.mjs show <id>
//   node scripts/institutions.mjs add <id> --domain kcl-staff.ac.uk --ror ...   /   remove <id> --domain ...
//   node scripts/institutions.mjs rename <id> "New name"
//
// --amount is in pounds a year. JEK_API overrides https://api.jeksys.net
// (http://localhost:8787 for wrangler dev).

import { parseArgs } from 'node:util';

const API = process.env.JEK_API || 'https://api.jeksys.net';
const TOKEN = process.env.JEK_OPS_TOKEN;

const { positionals: [cmd, ...args], values: o } = parseArgs({
  allowPositionals: true,
  options: {
    domain: { type: 'string', multiple: true }, ror: { type: 'string', multiple: true }, ringgold: { type: 'string', multiple: true },
    until: { type: 'string' }, amount: { type: 'string' }, email: { type: 'string' }, po: { type: 'string' },
    contact: { type: 'string' }, days: { type: 'string' }, description: { type: 'string' }, json: { type: 'boolean' },
  },
});

const orgs = () => [...(o.ror || []).map((value) => ({ scheme: 'ROR', value })), ...(o.ringgold || []).map((value) => ({ scheme: 'RINGGOLD', value }))];
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '-');

async function api(path, method = 'GET', body) {
  if (!TOKEN) throw new Error('Set JEK_OPS_TOKEN first (the value you gave `npx wrangler secret put OPS_TOKEN`).');
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out.error && out.error.message) || `HTTP ${res.status}`);
  return out;
}

function show(i) {
  if (o.json) return console.log(JSON.stringify(i, null, 2));
  const l = i.licence;
  console.log(`${i.name}\n  id        ${i.id}`);
  console.log(`  domains   ${i.domains.join(', ') || '-'}`);
  console.log(`  ORCID     ${i.orgs.map((x) => `${x.scheme} ${x.value}`).join(', ') || '-'}`);
  console.log(`  licence   ${l ? `${l.billing}, ${l.status}${l.active ? '' : ' (not counting)'}, to ${day(l.period_end)}${l.stripe_subscription ? `, Stripe ${l.stripe_subscription}` : ''}` : 'none yet'}`);
  console.log(`  people    ${i.people}`);
  console.log(`  active    ${i.active_users.length ? i.active_users.map((m) => `${m.month}: ${m.users}`).join('  ') : '-'}`);
}

const need = (v, what) => {
  if (!v) throw new Error(`Missing ${what}. See the top of this file for usage.`);
  return v;
};

try {
  if (cmd === 'list') {
    const { institutions } = await api('/ops/institutions');
    if (!institutions.length) console.log('No institutions yet.');
    institutions.forEach((i, k) => { if (k) console.log(); show(i); });
  } else if (cmd === 'show') {
    show(await api(`/ops/institutions/${need(args[0], 'the institution id')}`));
  } else if (cmd === 'create') {
    show(await api('/ops/institutions', 'POST', { name: need(args[0], 'the name'), domains: o.domain || [], orgs: orgs() }));
  } else if (cmd === 'add' || cmd === 'remove') {
    const key = cmd === 'add' ? 'add' : 'remove';
    show(await api(`/ops/institutions/${need(args[0], 'the institution id')}`, 'PATCH', { [`${key}_domains`]: o.domain || [], [`${key}_orgs`]: orgs() }));
  } else if (cmd === 'rename') {
    show(await api(`/ops/institutions/${need(args[0], 'the institution id')}`, 'PATCH', { name: need(args[1], 'the new name') }));
  } else if (cmd === 'pilot') {
    show(await api(`/ops/institutions/${need(args[0], 'the institution id')}/pilot`, 'POST', { until: need(o.until, '--until YYYY-MM-DD') }));
  } else if (cmd === 'invoice') {
    const pounds = Number(need(o.amount, '--amount (pounds a year)'));
    show(await api(`/ops/institutions/${need(args[0], 'the institution id')}/invoice`, 'POST', {
      amount: Math.round(pounds * 100), email: need(o.email, '--email (where the invoice goes)'), po: o.po, contact: o.contact,
      days_until_due: o.days ? Number(o.days) : undefined, description: o.description,
    }));
  } else {
    console.log('Commands: list, show, create, add, remove, rename, pilot, invoice. See the top of scripts/institutions.mjs.');
    process.exitCode = cmd ? 1 : 0;
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
}
