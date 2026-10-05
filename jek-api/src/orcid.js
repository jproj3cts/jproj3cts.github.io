// ORCID, switched off. Its Public API terms do not allow use in connection
// with a revenue-generating service, which JEKrayPro is. The code stays, and
// ORCID_ON = "1" brings it all back (sign-in, linking, the academic and
// university checks), say with a member API agreement.
//
// Meanwhile people who already sign in with ORCID may go on doing so until
// ORCID_LEGACY_UNTIL, to link Google or Microsoft; no new account is made with
// it and none is linked to it. After that date the daily cron removes what
// came from ORCID: the identities, academic status confirmed through it, and
// university licences found through it.

import { now } from './util.js';

export const orcidOn = (env) => env.ORCID_ON === '1';
export const orcidLegacyUntil = (env) => Date.parse(env.ORCID_LEGACY_UNTIL || '') || 0;
// Existing ORCID accounts may still sign in.
export const orcidLegacy = (env, t = now()) => !orcidOn(env) && t < orcidLegacyUntil(env);

// After the cut-off, with ORCID still off: what came from it goes.
export async function purgeOrcid(env, t = now()) {
  if (orcidOn(env) || !orcidLegacyUntil(env) || t < orcidLegacyUntil(env)) return false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM identities WHERE provider = 'orcid'"),
    env.DB.prepare("UPDATE users SET academic_until = NULL, academic_via = NULL WHERE academic_via LIKE 'ORCID:%'"),
    env.DB.prepare("DELETE FROM licences WHERE via = 'orcid'"),
  ]);
  return true;
}
