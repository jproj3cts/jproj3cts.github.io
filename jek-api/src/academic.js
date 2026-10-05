// The academic price: for current students and staff of a university or
// similar. A person qualifies through a verified email address at an
// academic domain (from Google), or a current education or employment record
// on their public ORCID profile. Verification lasts a year.

import { ApiError, now } from './util.js';

const YEAR = 365 * 24 * 60 * 60 * 1000;

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
  if (!via) {
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
      'We could not confirm a university address or a current university affiliation on your ORCID record. Sign in with your university Google account, link your ORCID iD, or email support@jeksys.net.');
  }
  const until = now() + YEAR;
  await env.DB.prepare('UPDATE users SET academic_until = ?, academic_via = ? WHERE id = ?').bind(until, via, user.id).run();
  return { until, via };
}
