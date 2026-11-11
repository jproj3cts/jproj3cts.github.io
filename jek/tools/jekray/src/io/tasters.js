import { hooks } from '../core/hooks.js';
import { h } from '../ui/dom.js';
import { needsShown } from '../ui/pro.js';
import { account, accountsOn, api, showSubscribe } from './account.js';
import { track } from './usage.js';
import { tasterOf } from '../core/tasters.js';

/* ---------- A free account's share links ----------
   A free account keeps a few share links at once (jek-api src/links.js FREE_LINKS; JEKrayPro any number). How many
   it has left is read when the account is (cloud.js cloudGates), from GET /v1/tasters, and shown on the Share
   badges ("3 free"); with none left a card says so and what JEKrayPro adds. Counted as 'taster' share.out and
   share.plans. (The name is from when a free account also had a month's free uses of the designers' work, which is
   a free account's outright now.) */
let tasterState = null;                     // { month, limits, left } for the account signed in without a plan; null otherwise
let tasterFor = null;                       // whose it is
/* the balance, for someone signed in without a plan (noPlan); dropped otherwise */
export async function loadTasters(noPlan) {
  if (!accountsOn() || !account || !noPlan) { tasterState = null; tasterFor = null; return; }
  if (tasterFor === account.user.id && tasterState) return;
  tasterFor = account.user.id;
  try { tasterState = await api('/v1/tasters'); } catch (err) { tasterState = null; tasterFor = null; return; }
  needsShown();
}
/* how many share links a free account has left: a number, or null (not share links, or none to count) */
export function tasterLeft(what) {
  const f = tasterOf(what);
  return f && tasterState && tasterState.left[f] !== undefined ? tasterState.left[f] : null;
}
/* may a share link be made on the free account: true while it has one left (the link itself is the count, read
   again once it is made: tasterRefresh) */
export function tasterUse(what) { return tasterLeft(what) > 0; }
/* a free account's share links all in use: what to do, and what JEKrayPro costs (the founding price, and the
   student one); false when the work named is not share links (the plans are offered as before) */
export function tasterOut(what) {
  const f = tasterOf(what);
  if (!f || !tasterState) return false;
  track('taster', f + '.out');
  const lim = tasterState.limits[f];
  let dlg = document.getElementById('tasterOut');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'tasterOut', 'aria-labelledby': 'tasterOutTitle' }); document.body.append(dlg); }
  const close = () => dlg.close();
  // the prices as they are now (the API's from Stripe): the student and staff one first
  const price = h('p', null, h('b', null, 'Students and university staff: '), 'JEKrayPro is half price with your university email.');
  api('/v1/billing/prices').then(P => {
    const m = (q) => P && P[q] ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: (P[q].currency || 'gbp').toUpperCase() }).format(P[q].amount / 100).replace(/\.00$/, '') : '';
    if (m('academic_monthly')) price.replaceChildren(h('b', null, 'Students and university staff: '), 'JEKrayPro is ' + m('academic_monthly') + ' a month' + (m('academic_yearly') ? ' or ' + m('academic_yearly') + ' a year' : '') + ' with your university email' + (m('pro_monthly') ? ' (' + m('pro_monthly') + ' a month otherwise)' : '') + '.');
  }).catch(() => { /* the line as it is */ });
  dlg.replaceChildren(h('h2', { id: 'tasterOutTitle' }, 'Your free share links are all in use'),
    h('p', null, 'A free account keeps ' + lim + ' share links at once: delete an old one in My benches, under My links, to make another. JEKrayPro has them without a limit, with saving to the cloud.'),
    price,
    h('p', null, h('b', null, 'Founding members: '), 'subscribe during the open beta and keep that price for as long as you stay subscribed.'),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn', type: 'button', onclick: close }, 'Not now'),
      h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('taster', f + '.plans'); close(); showSubscribe(); } }, 'See JEKrayPro')));
  dlg.showModal();
  return true;
}

/* the balance read again (after a share link is made or deleted: links are counted from the links themselves) */
export async function tasterRefresh() {
  if (!tasterState || !account) return;
  try { tasterState = await api('/v1/tasters'); } catch (err) { return; }
  needsShown();
}
/* the page's wiring for this module: done once, from boot.js */
export function wireTasters() {
  Object.assign(hooks, { tasterLeft, tasterUse, tasterOut, tasterRefresh });
}
