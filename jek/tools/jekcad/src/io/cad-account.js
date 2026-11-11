import { EMBED } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { track } from '../../../jekray/src/io/usage.js';
import { account, accountShown, accountsOn, authOutcome, showSubscribe, signInRow, wireAccount } from '../../../jekray/src/io/account.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { CAD_STORE_KEY } from '../core/doc.js';
import { cadIcons, fileText, toast } from '../ui/app.js';

/* ==========================================================================
   JEKcad's part in the account. The account itself is JEKray's, shared as it is (jekray/src/io/account.js: the same
   API and the same cookie, so signing in here signs in to every app; sign-in, the plans, billing, teams): here are
   its hooks for JEKcad (the bench kept before the page leaves, the menu in the bar, what the cloud does once the
   account is known), JEKrayPro's reasons for ui/pro.js (shared), and the sign-in an export or a Pro feature asks for.
   ========================================================================== */
export const cadProActive = () => !!(account && (account.workspaces || []).some(w => w.active && w.kind !== 'institution'));
/* why JEKrayPro's work is not open now ('' when it is): the words ui/pro.js reads */
export const cadProWhy = () => (!account ? 'Sign in, top right, to use JEKrayPro features' : cadProActive() ? '' : 'Needs JEKrayPro: subscribe from the account menu, or join a team with a plan');
function cadPrompt(id) {
  let dlg = document.getElementById(id);
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id, 'aria-labelledby': id + 'Title' }); document.body.append(dlg); }
  return dlg;
}
/* an export asked for signed out, a Pro feature, or the cloud: what it needs and the ways in */
export function cadSignIn(kind, what) {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  track('prompt', (kind === 'export' || kind === 'edit' ? 'export' : kind === 'cloud' ? 'cloud' : 'pro') + '.shown');
  const dlg = cadPrompt('cadSignIn'), close = () => dlg.close(), where = kind === 'edit' ? 'export' : kind;      // (counted with the export prompt)
  const pro = kind === 'pro' && account;
  dlg.replaceChildren(h('h2', { id: 'cadSignInTitle' }, kind === 'edit' ? 'Changing a Part Studio needs a free account' : kind === 'export' ? 'Exporting needs a free account' : kind === 'cloud' ? 'The cloud needs an account' : pro ? 'JEKrayPro is needed' : 'Sign in first'),
    h('p', null, kind === 'edit' ? 'Sign in to sketch, add features and change dimensions. Looking at a Part Studio, opening a .jekcad file or a shared link, and measuring need no account.' : kind === 'export' ? 'Sign in to ' + what + '. Saving the Part Studio as a .jekcad file needs no account.' : kind === 'cloud' ? 'Sign in to ' + what + '. A free account opens your cloud documents; saving there needs JEKrayPro. The .jekcad file on your computer needs no account.' : pro ? 'To ' + what + ', JEKrayPro is needed, or a place in a team with a plan.' : 'To ' + what + ', JEKrayPro is needed: sign in first (a free account), then choose a plan.'),
    h('p', null, h('b', null, 'One account for every JEK app.'), ' Your Part Studio stays here while you sign in.'),
    pro ? null : h('div', { class: 'rt-actions rt-signrow' }, ...signInRow(where, close)),
    h('div', { class: 'rt-actions' }, pro ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('prompt', kind + '.pro'); close(); showSubscribe(); } }, 'See the plans') : null,
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', where + '.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
/* JEKcad's hooks for the account, and the account wired and looked up */
export function wireCadAccount() {
  Object.assign(hooks, {
    appName: 'JEKcad',
    exportSignIn: what => cadSignIn('export', what),
    cadEditSignIn: () => cadSignIn('edit', 'change a Part Studio'),
    proWhy: () => (accountsOn() ? cadProWhy() : ''),
    proFix: what => cadSignIn('pro', what),
    usageTier: () => (!account ? 'anon' : cadProActive() ? 'pro' : 'free'),
    tasterLeft: () => null, tasterUse: () => false,
    // the bench kept in this browser before the page leaves to sign in or pay
    keepWork: () => { if (!EMBED) try { localStorage.setItem(CAD_STORE_KEY, fileText()); } catch (err) { /* the last autosave stands */ } },
    // the menu in the bar, its icons drawn (JEKcad's set); the More menu's line names it
    accountMenu: rows => { const menu = document.getElementById('acctMenu'); if (!menu) return; menu.replaceChildren(...rows); cadIcons(menu); },
    // signed out, the way to the plans (JEKcad has no Get Pro in its bar)
    accountMenuExtra: signedIn => (signedIn ? [] : [h('button', { type: 'button', role: 'menuitem', 'data-icon': 'star', onclick: () => showSubscribe() }, 'JEKrayPro: plans and prices\u2026')]),
    openAccountMenu: () => { const btn = document.getElementById('btnAcct'), m = document.getElementById('acctMenu'); if (btn && m && m.hidden) btn.click(); },
    accountChanged: () => {
      const mi = document.getElementById('moreAcct'); if (mi) mi.querySelector('.lbl').textContent = account ? 'Your account…' : 'Sign in…';
      needsShown(); if (hooks.cadAccountChanged) hooks.cadAccountChanged();
    },
  });
  wireAccount();
  // the account's own hooks (the API, the tier) are set by wireAccount: JEKcad's tier stands
  hooks.usageTier = () => (!account ? 'anon' : cadProActive() ? 'pro' : 'free');
  if (!accountsOn()) { const a = document.getElementById('acct'); if (a) a.hidden = true; return; }
  authOutcome();
  accountShown();
}
