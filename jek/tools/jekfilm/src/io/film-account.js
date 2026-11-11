import { hooks } from '../../../jekray/src/core/hooks.js';
import { track } from '../../../jekray/src/io/usage.js';
import { account, accountShown, accountsOn, authOutcome, showSubscribe, signInRow, wireAccount } from '../../../jekray/src/io/account.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { closeBarMenu, filmIcons, toast } from '../ui/bar.js';
import { filmKeepNow } from './files.js';

/* ==========================================================================
   JEKfilm's part in the account. The account is JEKray's, shared as it is (jekray/src/io/account.js: one sign-in for
   every app, the plans, billing, teams); here are its hooks for JEKfilm, JEKrayPro's reason for ui/pro.js (saving and
   optimising are Pro's), and the card a Pro feature or an export asks for when it is not open.
   ========================================================================== */
export const filmProActive = () => !!(account && (account.workspaces || []).some(w => w.active && w.kind !== 'institution'));
export const filmProWhy = () => (!account ? 'Sign in, top right, to use JEKrayPro features' : filmProActive() ? '' : 'Needs JEKrayPro: subscribe from the account menu, or join a team with a plan');
/* an export asked for signed out, or a Pro feature: what it needs and the ways in */
export function filmSignIn(kind, what) {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  track('prompt', (kind === 'export' ? 'export' : 'pro') + '.shown');
  let dlg = document.getElementById('filmSignIn');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmSignIn', 'aria-labelledby': 'filmSignInTitle' }); document.body.append(dlg); }
  const close = () => dlg.close(), pro = kind === 'pro' && account;
  dlg.replaceChildren(h('h2', { id: 'filmSignInTitle' }, kind === 'export' ? (/^keep/.test(what) ? 'Keeping your work needs a free account' : 'Exporting needs a free account') : pro ? 'JEKrayPro is needed' : 'Sign in first'),
    h('p', null, kind === 'export' ? 'Sign in to ' + what + '.' + (/^keep/.test(what) ? ' Signed out, nothing is kept when you leave this page; the coating comes with you when you sign in.' : '') : pro ? 'To ' + what + ', JEKrayPro is needed, or a place in a team with a plan.' : 'To ' + what + ', JEKrayPro is needed: sign in first (a free account), then choose a plan.'),
    h('p', null, h('b', null, 'One account for every JEK app.'), ' Your coating stays in this browser while you sign in.'),
    pro ? null : h('div', { class: 'rt-actions rt-signrow' }, ...signInRow(kind, close)),
    h('div', { class: 'rt-actions' }, pro ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('prompt', kind + '.pro'); close(); showSubscribe(); } }, 'See the plans') : null,
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', kind + '.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
export function wireFilmAccount() {
  Object.assign(hooks, {
    appName: 'JEKfilm', toast,
    exportSignIn: what => filmSignIn('export', what),
    proWhy: () => (accountsOn() ? filmProWhy() : ''),
    proFix: what => filmSignIn('pro', what),
    tasterLeft: () => null, tasterUse: () => false,
    keepWork: () => filmKeepNow(true),
    keepNow: () => filmKeepNow(),
    accountMenu: rows => { const menu = document.getElementById('acctMenu'); if (!menu) return; menu.replaceChildren(...rows); filmIcons(menu); },
    accountMenuExtra: signedIn => (signedIn ? [] : [h('button', { type: 'button', role: 'menuitem', 'data-icon': 'star', onclick: () => showSubscribe() }, 'JEKrayPro: plans and prices…')]),
    accountMenuDone: closeBarMenu,
    openAccountMenu: () => { const btn = document.getElementById('btnAcct'), m = document.getElementById('acctMenu'); if (btn && m && m.hidden) btn.click(); },
    accountChanged: () => { needsShown(); hooks.filmCloudShown(); },
  });
  wireAccount();
  hooks.usageTier = () => (!account ? 'anon' : filmProActive() ? 'pro' : 'free');
  if (!accountsOn()) { const a = document.getElementById('acct'); if (a) a.hidden = true; return; }
  authOutcome();
  accountShown();
}
