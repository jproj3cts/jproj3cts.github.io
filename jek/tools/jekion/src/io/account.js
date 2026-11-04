import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { goal, setUsageOff, track, usageBrowserSaysNo, usageFlush, usageOff } from '../../../jekray/src/io/usage.js';
import { ION_STORE_KEY } from '../core/units.js';
import { serialize } from '../state/elements.js';
import { h } from '../ui/panel.js';
import { toast } from '../ui/actions.js';

/* ==========================================================================
   The account: JEKion shares JEKray's accounts and JEKrayPro (the same API, the same cookie on its host), so
   signing in here signs in there. What is here is the account menu, the sign-in prompts an export or a Pro feature
   opens, and the hooks ui/pro.js (shared) reads: whether accounts are on, who is signed in, whether the API has
   answered, and why JEKrayPro's work is not open. Subscribing is done from JEKray's account menu.
   ========================================================================== */
export const ION_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://api.jeksys.net';
export let account;                                   // undefined: not asked yet; null: signed out; else /v1/me
export let accountKnown = false;
export const accountsOn = () => !TEST_MODE && !EMBED;
export async function api(path, opts = {}) {
  const res = await fetch(ION_API + path, Object.assign({ credentials: 'include', headers: { Accept: 'application/json' } }, opts));
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) { const e = new Error((body && body.error && body.error.message) || 'The service is unavailable.'); e.status = res.status; throw e; }
  return body;
}
const AUTH_OUTCOMES = { signed_in: ['Signed in'], linked: ['Sign-in linked to your account'], cancelled: ['Sign-in cancelled'], expired: ['That sign-in took too long or was opened in another browser. Please try again.', true],
  failed: ['Sign-in did not work. Please try again.', true], taken: ['That sign-in already belongs to another JEKray account.', true], signed_out: ['Please sign in first.', true], unavailable: ['That way of signing in is not available yet. Please use another.', true] };
export function signIn(provider) {
  track('signin', provider); goal('signin'); usageFlush();
  const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekauth');
  if (!EMBED) try { localStorage.setItem(ION_STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ }
  location.href = ION_API + '/auth/' + provider + '/start?' + new URLSearchParams({ return: ret.toString() });
}
const initials = name => (name || '?').split(/\s+/).filter(w => /^\p{L}/u.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || (name || '?')[0];
export const proActive = () => !!(account && (account.workspaces || []).some(w => w.active && w.kind !== 'institution'));
/* why JEKrayPro's work is not open now ('' when it is): the words ui/pro.js reads */
export const proWhy = () => (!account ? 'Sign in, top right, to use JEKrayPro features' : proActive() ? '' : 'Needs JEKrayPro: subscribe from the account menu in JEKray, or join a team with a plan');
export async function loadAccount() {
  try { account = await api('/v1/me'); accountKnown = true; }
  catch (err) { account = null; if (err.status === 401) accountKnown = true; }
  fillAccount();
  hooks.needsShown();
}
async function signOut() {
  try { await api('/auth/signout', { method: 'POST' }); } catch (err) { /* the cookie may be gone already */ }
  account = null; fillAccount(); hooks.needsShown(); toast('Signed out');
}
export function fillAccount() {
  const btn = document.getElementById('btnAcct'), menu = document.getElementById('acctMenu');
  if (!btn || !menu) return;
  const item = (icon, label, fn) => h('button', { type: 'button', role: 'menuitem', 'data-icon': icon, onclick: fn }, label);
  const legal = h('span', { class: 'rt-menunote' }, h('a', { href: '/jek/privacy.html', target: '_blank' }, 'Privacy'), ' · ', h('a', { href: '/jek/terms.html', target: '_blank' }, 'Terms'));
  const dnt = usageBrowserSaysNo(), usage = h('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(!dnt && !usageOff()), 'data-icon': 'check', disabled: dnt ? '' : null,
    title: dnt ? 'Your browser asks sites not to track it, so none are sent' : 'Counts of what is used in JEKion, with nothing that says who: see the privacy policy',
    onclick: () => { const off = !usageOff(); setUsageOff(off); fillAccount(); toast(off ? 'Usage counts off in this browser' : 'Usage counts on. Thank you!'); } }, 'Share anonymous usage counts');
  if (!account) {
    btn.classList.remove('in'); btn.textContent = 'Sign in'; btn.removeAttribute('title');
    const via = (p, fn) => () => { track('prompt', 'menu.' + p); fn(); };
    menu.replaceChildren(h('span', { class: 'rt-menunote' }, h('b', null, 'Create a free account or sign in.'), ' The same account as JEKray’s: a free one lets you export images and data; JEKrayPro adds scripts and the richer exports.'),
      item('signin', 'Continue with Google', via('google', () => signIn('google'))), item('signin', 'Continue with Microsoft (university or work)', via('microsoft', () => signIn('microsoft'))),
      h('div', { class: 'sep' }), h('span', { class: 'rt-menunote' }, 'To sign in with email, or to subscribe to JEKrayPro, use the account menu in ', h('a', { href: '/jek/tools/jekray.html#pro', target: '_blank' }, 'JEKray'), '.'), h('div', { class: 'sep' }), usage, legal);
  } else {
    const u = account.user;
    btn.classList.add('in'); btn.title = u.name;
    if (u.avatar) btn.replaceChildren(h('img', { src: ION_API + u.avatar, alt: '' })); else btn.textContent = initials(u.name);
    menu.replaceChildren(h('div', { class: 'rt-accthead' }, h('span', { class: 'rt-avatar', 'aria-hidden': 'true' }, initials(u.name)), h('b', null, u.name), u.email ? h('span', null, u.email) : null),
      h('span', { class: 'rt-menunote' }, proActive() ? 'JEKrayPro: scripts and every export are open.' : 'A free account: images and data export. JEKrayPro (scripts, the richer exports) is subscribed to from JEKray’s account menu.'),
      h('div', { class: 'sep' }), h('a', { role: 'menuitem', href: '/jek/tools/jekray.html#pro', target: '_blank', 'data-icon': 'star' }, proActive() ? 'Manage JEKrayPro in JEKray' : 'JEKrayPro, in JEKray'),
      item('signout', 'Sign out', signOut), h('div', { class: 'sep' }), usage, legal);
  }
  const mi = document.getElementById('moreAcct'); if (mi) mi.querySelector('.lbl').textContent = account ? 'Your account…' : 'Sign in…';
  hooks.ionMenuIcons(menu);
}
function promptDialog(id) {
  let dlg = document.getElementById(id);
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id, 'aria-labelledby': id + 'Title' }); document.body.append(dlg); }
  return dlg;
}
/* an export asked for signed out, or a Pro feature: what it needs and the ways in */
export function showSignIn(kind, what) {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  track('prompt', (kind === 'export' ? 'export' : 'pro') + '.shown');
  const dlg = promptDialog('ionSignIn'), close = () => dlg.close();
  const go = (p, fn) => () => { track('prompt', kind + '.' + p); close(); fn(); };
  const pro = kind === 'pro' && account;
  dlg.replaceChildren(h('h2', { id: 'ionSignInTitle' }, kind === 'export' ? 'Exporting needs a free account' : pro ? 'JEKrayPro is needed' : 'Sign in first'),
    h('p', null, kind === 'export' ? 'Sign in to ' + what + '. Saving the bench as a .jekion file needs no account.' : pro ? 'To ' + what + ', JEKrayPro is needed: subscribe from the account menu in JEKray, or join a team with a plan. The same account serves both tools.' : 'To ' + what + ', JEKrayPro is needed: sign in first (a free account), then choose a plan in JEKray.'),
    h('p', null, h('b', null, 'The same account as JEKray’s.'), ' Your bench stays here while you sign in.'),
    pro ? null : h('div', { class: 'rt-actions rt-signrow' }, h('button', { class: 'rt-btn primary', type: 'button', onclick: go('google', () => signIn('google')) }, 'Continue with Google'), h('button', { class: 'rt-btn', type: 'button', onclick: go('microsoft', () => signIn('microsoft')) }, 'Microsoft')),
    h('div', { class: 'rt-actions' }, pro ? h('a', { class: 'rt-btn primary', href: '/jek/tools/jekray.html#pro', target: '_blank' }, 'See JEKrayPro') : null, h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', kind + '.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
export function wireAccount() {
  hooks.account = () => ({ on: accountsOn(), signedIn: !!account, known: accountKnown });
  hooks.exportSignIn = what => showSignIn('export', what);
  hooks.proWhy = () => (accountsOn() ? proWhy() : '');
  hooks.proFix = what => showSignIn('pro', what);
  hooks.apiBase = () => ION_API;
  hooks.usageTier = () => (!account ? 'anon' : proActive() ? 'pro' : 'free');
  hooks.tasterLeft = () => null; hooks.tasterUse = () => false;
  document.getElementById('acct').hidden = !accountsOn();
  if (!accountsOn()) return;
  // back from the sign-in page
  const m = /[?&]jekauth=([a-z_]+)/.exec(location.search);
  if (m) { const o = AUTH_OUTCOMES[m[1]]; if (o) setTimeout(() => toast(o[0], o[1]), 300); const u = new URL(location.href); u.searchParams.delete('jekauth'); window.history.replaceState(null, '', u.pathname + u.search + u.hash); }
  fillAccount();
  loadAccount();
}
