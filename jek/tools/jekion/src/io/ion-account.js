import { EMBED } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { track } from '../../../jekray/src/io/usage.js';
import { account, accountShown, accountsOn, authOutcome, showSubscribe, signInRow, wireAccount } from '../../../jekray/src/io/account.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { ION_STORE_KEY } from '../core/units.js';
import { serialize } from '../state/elements.js';
import { toast } from '../ui/actions.js';

/* ==========================================================================
   JEKion's part in the account. The account itself is JEKray's, shared as it is (jekray/src/io/account.js: the same
   API and the same cookie, so signing in here signs in to every app; sign-in, the plans, billing, teams): here are
   its hooks for JEKion (the bench kept before the page leaves, the menu in the bar, what the cloud does once the
   account is known), JEKrayPro's reasons for ui/pro.js (shared), and the sign-in an export or a Pro feature asks for.
   ========================================================================== */
export const proActive = () => !!(account && (account.workspaces || []).some(w => w.active && w.kind !== 'institution'));
/* why JEKrayPro's work is not open now ('' when it is): the words ui/pro.js reads */
export const proWhy = () => (!account ? 'Sign in, top right, to use JEKrayPro features' : proActive() ? '' : 'Needs JEKrayPro: subscribe from the account menu, or join a team with a plan');
function ionPrompt(id) {
  let dlg = document.getElementById(id);
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id, 'aria-labelledby': id + 'Title' }); document.body.append(dlg); }
  return dlg;
}
/* an export asked for signed out, a Pro feature, or the cloud: what it needs and the ways in */
export function showSignIn(kind, what) {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  track('prompt', (kind === 'export' ? 'export' : kind === 'cloud' ? 'cloud' : 'pro') + '.shown');
  const dlg = ionPrompt('ionSignIn'), close = () => dlg.close();
  const pro = kind === 'pro' && account;
  dlg.replaceChildren(h('h2', { id: 'ionSignInTitle' }, kind === 'export' ? 'Exporting needs a free account' : kind === 'cloud' ? 'The cloud needs an account' : pro ? 'JEKrayPro is needed' : 'Sign in first'),
    h('p', null, kind === 'export' ? 'Sign in to ' + what + '. Saving the bench as a .jekion file needs no account.' : kind === 'cloud' ? 'Sign in to ' + what + '. A free account opens your cloud benches; saving there needs JEKrayPro. The .jekion file on your computer needs no account.' : pro ? 'To ' + what + ', JEKrayPro is needed, or a place in a team with a plan.' : 'To ' + what + ', JEKrayPro is needed: sign in first (a free account), then choose a plan.'),
    h('p', null, h('b', null, 'One account for every JEK app.'), ' Your bench stays here while you sign in.'),
    pro ? null : h('div', { class: 'rt-actions rt-signrow' }, ...signInRow(kind, close)),
    h('div', { class: 'rt-actions' }, pro ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('prompt', kind + '.pro'); close(); showSubscribe(); } }, 'See the plans') : null,
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', kind + '.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
/* JEKion's hooks for the account, and the account wired and looked up */
export function wireIonAccount() {
  Object.assign(hooks, {
    appName: 'JEKion',
    exportSignIn: what => showSignIn('export', what),
    proWhy: () => (accountsOn() ? proWhy() : ''),
    proFix: what => showSignIn('pro', what),
    usageTier: () => (!account ? 'anon' : proActive() ? 'pro' : 'free'),
    tasterLeft: () => null, tasterUse: () => false,
    // the bench kept in this browser before the page leaves to sign in or pay
    keepWork: () => { if (!EMBED) try { localStorage.setItem(ION_STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ } },
    // the menu in the bar, its icons drawn (JEKion's set); the More menu's line names it
    accountMenu: rows => { const menu = document.getElementById('acctMenu'); if (!menu) return; menu.replaceChildren(...rows); hooks.ionMenuIcons(menu); },
    // signed out, the way to the plans (JEKion has no Get Pro in its bar)
    accountMenuExtra: signedIn => (signedIn ? [] : [h('button', { type: 'button', role: 'menuitem', 'data-icon': 'star', onclick: () => showSubscribe() }, 'JEKrayPro: plans and prices\u2026')]),
    openAccountMenu: () => { const btn = document.getElementById('btnAcct'), m = document.getElementById('acctMenu'); if (btn && m && m.hidden) btn.click(); },
    accountChanged: () => {
      const mi = document.getElementById('moreAcct'); if (mi) mi.querySelector('.lbl').textContent = account ? 'Your account…' : 'Sign in…';
      hooks.needsShown(); if (hooks.ionAccountChanged) hooks.ionAccountChanged();
    },
  });
  wireAccount();
  // the account's own hooks (the API, the tier) are set by wireAccount: JEKion's tier stands
  hooks.usageTier = () => (!account ? 'anon' : proActive() ? 'pro' : 'free');
  if (!accountsOn()) { const a = document.getElementById('acct'); if (a) a.hidden = true; return; }
  authOutcome();
  accountShown();
}
