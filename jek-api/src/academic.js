// The academic price: for current students and staff of a university or
// similar. A person qualifies through an email address at an academic domain:
// the one they signed in with (verified by Google or Microsoft), or one they
// prove they read by typing in a code sent to it. (Also, while ORCID is on, a
// current education or employment record on their public ORCID profile.)
// Verification lasts a year.

import { readJson } from './benches.js';
import { sendEmail } from './mail.js';
import { orcidOn } from './orcid.js';
import { ApiError, now, sha256 } from './util.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// .ac.uk, .edu, .edu.au, .ac.jp and the like, plus well-known universities
// whose domains follow no such pattern.
const ACADEMIC_SUFFIX = /\.(ac|edu)(\.[a-z]{2})?$/i;
const ACADEMIC_DOMAINS = [
  'ethz.ch', 'epfl.ch', 'uzh.ch', 'unibas.ch', 'unige.ch', 'tudelft.nl', 'uva.nl', 'tue.nl', 'utwente.nl', 'rug.nl', 'uu.nl', 'leidenuniv.nl',
  'kth.se', 'chalmers.se', 'lu.se', 'uu.se', 'su.se', 'dtu.dk', 'ku.dk', 'au.dk', 'ntnu.no', 'uio.no', 'aalto.fi', 'helsinki.fi',
  'tum.de', 'lmu.de', 'kit.edu', 'rwth-aachen.de', 'fu-berlin.de', 'hu-berlin.de', 'tu-berlin.de', 'mpg.de', 'fraunhofer.de',
  'polytechnique.edu', 'sorbonne-universite.fr', 'universite-paris-saclay.fr', 'ens.fr', 'cnrs.fr', 'polimi.it', 'unimi.it', 'sns.it',
  'uam.es', 'ucm.es', 'upm.es', 'uc3m.es', 'ulisboa.pt', 'up.pt', 'kuleuven.be', 'ugent.be', 'tcd.ie', 'ucd.ie', 'utoronto.ca',
  'ubc.ca', 'mcgill.ca', 'uwaterloo.ca', 'cern.ch', 'weizmann.ac.il', 'nus.edu.sg', 'ntu.edu.sg',
];
const UNI_WORDS = /universit|college|institut|polytechnic|hochschule|école|ecole|universidad|universidade|università|school of|academy|faculty|research cent|laborator/i;

export function academicEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  if (!domain) return null;
  if (ACADEMIC_SUFFIX.test(domain)) return domain;
  if (ACADEMIC_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return domain;
  if (/(^|\.)uni-[a-z-]+\.de$/.test(domain)) return domain;
  return null;
}

// A read-public token for ORCID's public API, from the same client, kept in KV.
async function orcidToken(env) {
  const cached = await env.AUTH.get('orcid:read-public');
  if (cached) return cached;
  const res = await fetch('https://orcid.org/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: env.ORCID_CLIENT_ID, client_secret: env.ORCID_CLIENT_SECRET, grant_type: 'client_credentials', scope: '/read-public' }),
  });
  if (!res.ok) throw new Error(`orcid token ${res.status}`);
  const tok = await res.json();
  await env.AUTH.put('orcid:read-public', tok.access_token, { expirationTtl: 30 * 24 * 3600 });
  return tok.access_token;
}

// The name of a current education or employment at an academic place, or null.
export function currentAcademic(affiliations, t = now()) {
  for (const group of affiliations['affiliation-group'] || []) {
    for (const wrap of group.summaries || []) {
      const s = wrap['employment-summary'] || wrap['education-summary'];
      if (!s) continue;
      const end = s['end-date'];
      const ended = end && end.year && Date.UTC(Number(end.year.value), end.month ? Number(end.month.value) : 12, 1) < t;
      const org = (s.organization && s.organization.name) || '';
      if (!ended && UNI_WORDS.test(org)) return org;
    }
  }
  return null;
}

// Every current education or employment: its organisation's name and the ids
// ORCID gives it (ROR as the bare id, Ringgold, GRID).
export function currentOrgs(affiliations, t = now()) {
  const out = [];
  for (const group of affiliations['affiliation-group'] || []) {
    for (const wrap of group.summaries || []) {
      const s = wrap['employment-summary'] || wrap['education-summary'];
      if (!s || !s.organization) continue;
      const end = s['end-date'];
      if (end && end.year && Date.UTC(Number(end.year.value), end.month ? Number(end.month.value) : 12, 1) < t) continue;
      const d = s.organization['disambiguated-organization'];
      const scheme = d && String(d['disambiguation-source'] || '').toUpperCase();
      let value = d && String(d['disambiguated-organization-identifier'] || '').trim();
      if (scheme === 'ROR') value = value.replace(/^https?:\/\/ror\.org\//i, '').toLowerCase();
      out.push({ name: s.organization.name || '', id: value && ['ROR', 'RINGGOLD', 'GRID'].includes(scheme) ? { scheme, value } : null });
    }
  }
  return out;
}

// The current affiliations on a public ORCID record.
export async function orcidOrgs(env, orcid) {
  const token = await orcidToken(env);
  const out = [];
  for (const kind of ['employments', 'educations']) {
    const res = await fetch(`https://pub.orcid.org/v3.0/${orcid}/${kind}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (res.ok) out.push(...currentOrgs(await res.json()));
  }
  return out;
}

async function orcidAcademic(env, orcid) {
  const token = await orcidToken(env);
  for (const kind of ['employments', 'educations']) {
    const res = await fetch(`https://pub.orcid.org/v3.0/${orcid}/${kind}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const org = currentAcademic(await res.json());
    if (org) return org;
  }
  return null;
}

// POST /v1/me/academic
export async function verify(env, user) {
  const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(user.id).first();
  let via = null;
  const domain = academicEmail(u && u.email);
  if (domain) via = `email: ${domain}`;
  if (!via && orcidOn(env)) {
    const id = await env.DB.prepare("SELECT subject FROM identities WHERE user_id = ? AND provider = 'orcid'").bind(user.id).first();
    if (id) {
      try {
        const org = await orcidAcademic(env, id.subject);
        if (org) via = `ORCID: ${org}`.slice(0, 200);
      } catch (err) {
        console.error('ORCID check failed:', err.message);
        throw new ApiError(502, 'orcid', 'Could not reach ORCID just now. Please try again.');
      }
    }
  }
  if (!via) {
    throw new ApiError(403, 'not_academic',
      orcidOn(env)
        ? 'We could not confirm a university address or a current university affiliation on your ORCID record. Sign in with your university Google account, link your ORCID iD, or email support@jeksys.net.'
        : 'We could not confirm a university address from your sign-in. Check your university email address below instead, or email support@jeksys.net and we will check by hand.');
  }
  const until = now() + YEAR;
  await env.DB.prepare('UPDATE users SET academic_until = ?, academic_via = ? WHERE id = ?').bind(until, via, user.id).run();
  return { until, via };
}

// ---------- a university address, proved by a code sent to it ----------

const CODE_MS = 15 * 60 * 1000;    // a code lasts 15 minutes
const MAX_TRIES = 5;               // wrong codes before it is cancelled
const PER_ADDRESS = 3;             // codes to one address in a day
const PER_PERSON = 6;              // codes one person may ask for in a day
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/;

const codeHash = (user, email, code) => sha256(`${user.id}:${email}:${code}`);

// Another account holding this address now (one address, one account).
async function heldElsewhere(env, user, email, t = now()) {
  return env.DB.prepare('SELECT 1 AS y FROM users WHERE academic_email = ? AND id != ? AND academic_until > ? AND deleted_at IS NULL')
    .bind(email, user.id, t)
    .first();
}

function codeEmail(code, domain) {
  const text = `Your JEKray2D code is ${code}\n\nType it into JEKray2D to confirm you use this ${domain} address, for the academic price and any licence your university has. It lasts 15 minutes.\n\nIf you did not ask for it, ignore this email: nothing changes.\n\nJEK Systems · support@jeksys.net`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111;">
<div style="max-width:520px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e3e3e3;border-radius:2px;">
<div style="height:4px;background:linear-gradient(90deg,#ffb347 0 20%,#f47742 20% 40%,#db3550 40% 60%,#73b9ca 60% 80%,#0092b2 80% 100%);margin-bottom:22px;"></div>
<p style="margin:0 0 10px;font-size:15px;">Your JEKray2D code is</p>
<p style="margin:0 0 18px;font:700 32px/1.2 'Courier New',monospace;letter-spacing:6px;">${code}</p>
<p style="margin:0 0 12px;line-height:1.6;">Type it into JEKray2D to confirm you use this ${domain} address, for the academic price and any licence your university has. It lasts 15 minutes.</p>
<p style="margin:0 0 12px;line-height:1.6;color:#555;">If you did not ask for it, ignore this email: nothing changes.</p>
<p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #e3e3e3;font-size:13px;color:#666;">JEK Systems &middot; <a href="mailto:support@jeksys.net" style="color:#0092b2;">support@jeksys.net</a></p>
</div></body></html>`;
  return { text, html };
}

// POST /v1/me/academic/email  {email} — sends a code to a university address
export async function sendCode(req, env, user) {
  const body = await readJson(req);
  const email = String((body && body.email) || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new ApiError(400, 'bad_email', 'That does not look like an email address.');
  const domain = academicEmail(email);
  if (!domain) {
    throw new ApiError(400, 'not_academic_domain',
      'That address is not at a university we recognise. If it should be, email support@jeksys.net from it and we will add your university.');
  }
  const t = now();
  if (await heldElsewhere(env, user, email, t)) {
    throw new ApiError(409, 'email_in_use', 'That address is already confirmed on another JEKrayPro account. If it is yours, email support@jeksys.net.');
  }
  const [byAddress, byPerson] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE email = ? AND at > ?').bind(email, t - DAY).first(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE user_id = ? AND at > ?').bind(user.id, t - DAY).first(),
  ]);
  if (byAddress.n >= PER_ADDRESS || byPerson.n >= PER_PERSON) {
    throw new ApiError(429, 'too_many_codes', 'That is as many codes as we send in a day. Please try again tomorrow, or email support@jeksys.net.');
  }
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const mail = codeEmail(code, domain);
  await sendEmail(env, { to: email, subject: `Your JEKray2D code: ${code}`, ...mail });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO email_codes (user_id, email, code_hash, expires_at, tries) VALUES (?, ?, ?, ?, 0)
       ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0`,
    ).bind(user.id, email, await codeHash(user, email, code), t + CODE_MS),
    env.DB.prepare('INSERT INTO email_sends (email, user_id, at) VALUES (?, ?, ?)').bind(email, user.id, t),
  ]);
  return { sent: true, email, expires_at: t + CODE_MS };
}

// POST /v1/me/academic/code  {code} — the code typed in: the academic price for a year
export async function checkCode(req, env, user) {
  const body = await readJson(req);
  const code = String((body && body.code) || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'bad_code', 'The code is the 6 digits in the email.');
  const row = await env.DB.prepare('SELECT email, code_hash, expires_at, tries FROM email_codes WHERE user_id = ?').bind(user.id).first();
  if (!row) throw new ApiError(404, 'no_code', 'Ask for a code first.');
  const t = now();
  const drop = () => env.DB.prepare('DELETE FROM email_codes WHERE user_id = ?').bind(user.id).run();
  if (row.expires_at <= t) {
    await drop();
    throw new ApiError(410, 'code_expired', 'That code has run out. Ask for a new one.');
  }
  if ((await codeHash(user, row.email, code)) !== row.code_hash) {
    const tries = row.tries + 1;
    if (tries >= MAX_TRIES) {
      await drop();
      throw new ApiError(429, 'too_many_tries', 'Too many wrong codes. Ask for a new one.');
    }
    await env.DB.prepare('UPDATE email_codes SET tries = ? WHERE user_id = ?').bind(tries, user.id).run();
    throw new ApiError(400, 'wrong_code', `That is not the code. ${MAX_TRIES - tries} ${MAX_TRIES - tries === 1 ? 'try' : 'tries'} left.`, { left: MAX_TRIES - tries });
  }
  if (await heldElsewhere(env, user, row.email, t)) {
    await drop();
    throw new ApiError(409, 'email_in_use', 'That address is already confirmed on another JEKrayPro account. If it is yours, email support@jeksys.net.');
  }
  const until = t + YEAR;
  const via = `email: ${academicEmail(row.email)}`;
  await env.DB.batch([
    // an older, lapsed holder of the address lets it go
    env.DB.prepare('UPDATE users SET academic_email = NULL WHERE academic_email = ? AND id != ?').bind(row.email, user.id),
    env.DB.prepare('UPDATE users SET academic_until = ?, academic_via = ?, academic_email = ? WHERE id = ?').bind(until, via, row.email, user.id),
    env.DB.prepare('DELETE FROM email_codes WHERE user_id = ?').bind(user.id),
  ]);
  return { until, via, email: row.email };
}
