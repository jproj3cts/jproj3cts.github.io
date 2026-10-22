#!/usr/bin/env node
// Signed part packs, from your own computer: JEK Systems' side of /ops/packs.
//
//   export JEK_OPS_TOKEN=...            (the same value as the OPS_TOKEN secret)
//   node scripts/packs.mjs list [--id acme.optics | --hash <sha-256> | --user <id or email> | --org <team id>]
//   node scripts/packs.mjs revoke --hash <sha-256> --reason "Malware"            (one pack, as it is)
//   node scripts/packs.mjs revoke --id acme.optics --reason "Trademark"          (every version; no more signing of it)
//   node scripts/packs.mjs revoke --user someone@example.com --reason "Spam"     (all of an account's; it signs no more)
//   node scripts/packs.mjs unrevoke --hash ... | --id ... | --user ... | --org ...
//   node scripts/packs.mjs reserve --user <id or email> | --org <team id> [--off]   (may sign ids under jek., jekray., jeksys.)
//   node scripts/packs.mjs org <team id> --domain acme.com [--force] | --remove   (the team signs as itself; --remove frees the domain)
//   node scripts/packs.mjs release acme.optics                                   (an id's claim dropped: a dispute settled)
//   node scripts/packs.mjs sign <in.jekpack> [<out.jekpack>]                     (signed as JEK Systems: our own packs)
//   node scripts/packs.mjs sign-bench <bench.jekray> <signed.jekpack>            (a bench carries that signed module)
//
// org: an override. Teams verify their domain themselves with a DNS record (the
// team's settings in the app; POST /v1/teams/:id/domain). Set here, the team
// owner's email (verified by their sign-in provider) must be at the domain;
// --force when you have checked it some other way (a letter, a call).
// --remove takes a team's domain off, whichever way it was verified: so a
// disputed domain is freed for the team that should have it.
// A reason is shown to everyone who has the pack. JEK_API overrides https://api.jeksys.net.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const API = process.env.JEK_API || 'https://api.jeksys.net';
const TOKEN = process.env.JEK_OPS_TOKEN;
const { positionals: [cmd, ...args], values: o } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' }, hash: { type: 'string' }, user: { type: 'string' }, org: { type: 'string' }, reason: { type: 'string' },
    domain: { type: 'string' }, force: { type: 'boolean' }, remove: { type: 'boolean' }, off: { type: 'boolean' }, json: { type: 'boolean' },
  },
});

async function api(path, method = 'GET', body) {
  if (!TOKEN) throw new Error('Set JEK_OPS_TOKEN first (the value you gave `npx wrangler secret put OPS_TOKEN`).');
  const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out.error && out.error.message) || `HTTP ${res.status}`);
  return out;
}
const need = (v, what) => { if (!v) throw new Error(`Missing ${what}. See the top of this file for usage.`); return v; };
const day = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '-');
const which = () => (o.hash ? { hash: o.hash } : o.id ? { id: o.id } : o.user ? { user: o.user } : o.org ? { org: o.org } : need(null, '--hash, --id, --user or --org'));

try {
  if (cmd === 'list') {
    const q = new URLSearchParams(Object.entries({ id: o.id, hash: o.hash, user: o.user, org: o.org }).filter(([, v]) => v));
    const r = await api('/ops/packs?' + q);
    if (o.json) console.log(JSON.stringify(r, null, 2));
    else {
      for (const s of r.signatures) {
        console.log(`${s.id} ${s.pack_version || ''} (${s.kind})  ${s.hash}\n  signed ${day(s.signed_at)} by ${s.signer_kind} ${s.signer_name || '(deleted)'} [${s.signer_id}]${s.domain ? ' ' + s.domain : ''}` +
          `${s.revoked_at ? `\n  REVOKED ${day(s.revoked_at)}: ${s.reason}` : ''}${s.blocked_at ? '\n  (its id is taken down)' : ''}`);
      }
      if (!r.signatures.length) console.log('No signatures.');
      if (r.flags.length) console.log('\nFlags:\n' + r.flags.map((f) => `  ${f.flag}  ${f.owner_kind} ${f.owner_id}${f.reason ? ': ' + f.reason : ''}`).join('\n'));
      if (r.orgs.length) console.log('\nVerified teams:\n' + r.orgs.map((g) => `  ${g.name} [${g.workspace_id}]  ${g.domain}  (${g.method === 'dns' ? 'DNS record, last found ' + day(g.checked_at) : 'set by hand'})`).join('\n'));
    }
  } else if (cmd === 'revoke') {
    const r = await api('/ops/packs/revoke', 'POST', { ...which(), reason: need(o.reason, '--reason (shown to whoever has the pack)') });
    console.log(`Revoked ${r.signatures} signature(s).`);
  } else if (cmd === 'unrevoke') {
    const r = await api('/ops/packs/unrevoke', 'POST', which());
    console.log(`Restored ${r.signatures} signature(s).`);
  } else if (cmd === 'reserve') {
    const r = await api('/ops/packs/reserve', 'POST', { ...(o.user ? { user: o.user } : { org: need(o.org, '--user or --org') }), on: !o.off });
    console.log(`${r.kind} ${r.id} ${r.jek ? 'may' : 'may no longer'} sign ids under jek., jekray. and jeksys.`);
  } else if (cmd === 'org') {
    const r = await api('/ops/packs/org', 'POST', { org: need(args[0], 'the team id'), domain: o.remove ? null : need(o.domain, '--domain or --remove'), force: !!o.force });
    console.log(r.domain ? `${r.name} signs as itself, with ${r.domain}.` : 'The team no longer signs as itself.');
  } else if (cmd === 'release') {
    const r = await api('/ops/packs/release', 'POST', { id: need(args[0], 'the pack id') });
    console.log(r.released ? `${args[0]} is free to claim.` : `${args[0]} was not claimed.`);
  } else if (cmd === 'sign') {
    const file = need(args[0], 'the .jekpack file'), pack = JSON.parse(readFileSync(file, 'utf8'));
    delete pack.sig;
    pack.author = 'JEK Systems';
    const r = await api('/ops/packs/sign', 'POST', { pack });
    writeFileSync(args[1] || file, JSON.stringify({ ...pack, sig: r.sig }, null, 1) + '\n');
    console.log(`Signed ${pack.id} (${r.hash}) into ${args[1] || file}.`);
  } else if (cmd === 'sign-bench') {
    // a bench's carried module replaced by the signed one, so opening the bench offers it verified
    const bfile = need(args[0], 'the .jekray bench'), signed = JSON.parse(readFileSync(need(args[1], 'the signed .jekpack'), 'utf8'));
    if (!signed.sig || !signed.code) throw new Error('That is not a signed module.');
    const b = JSON.parse(readFileSync(bfile, 'utf8'));
    let n = 0;
    b.mods = (b.mods || []).map((m) => (m.id === signed.id ? (n++, { id: signed.id, name: signed.name, author: signed.author, packVersion: signed.packVersion, licence: signed.licence, description: signed.description, code: signed.code, signed }) : m));
    if (!n) throw new Error(`The bench carries no module ${signed.id}.`);
    writeFileSync(bfile, JSON.stringify(b, null, 1) + '\n');
    console.log(`The bench now carries the signed ${signed.id}.`);
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
