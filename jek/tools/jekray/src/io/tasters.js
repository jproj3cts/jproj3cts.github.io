import { hooks } from '../core/hooks.js';
import { h } from '../ui/panel.js';
import { toast } from '../ui/actions.js';
import { needsShown } from '../ui/pro.js';
import { account, accountsOn, api, showSubscribe } from './account.js';
import { track } from './usage.js';
import { TASTER_NAMES, tasterOf } from '../core/tasters.js';

/* ---------- Tasters ----------
   So that someone on a free account can try JEKrayPro's work before paying, a few uses a month of each part of it
   that runs in their own browser (jek-api src/tasters.js keeps the count): the designers' optimiser, tolerancing,
   scripts, design reports, drawings, design exports and the data export's Pro formats. The balance is read when the
   account is (cloud.js cloudGates), shown on the Pro badges ("4 free"), and spent as the work starts (ui/pro.js
   designPro, ui/scripts.js); once spent, a card says what is used and what JEKrayPro costs. Counted as 'taster'
   <feature>.used and <feature>.out. */
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
/* how many free uses of the work named are left this month: a number, or null (no taster for it, or none to count) */
export function tasterLeft(what) {
  const f = tasterOf(what);
  return f && tasterState && tasterState.left[f] !== undefined ? tasterState.left[f] : null;
}
/* one free use of the work named, if there is one left: true when it may go ahead */
export function tasterUse(what) {
  const f = tasterOf(what), left = tasterLeft(what);
  if (!(left > 0)) return false;
  tasterState.left[f] = left - 1;
  track('taster', f + '.used');
  api('/v1/tasters/' + f, { method: 'POST' }).then(r => { if (tasterState && r && typeof r.left === 'number') tasterState.left[f] = r.left; needsShown(); })
    .catch(err => { if (tasterState && err && err.code === 'taster_used') { tasterState.left[f] = 0; needsShown(); } });
  needsShown();
  const n = tasterState.left[f], lim = tasterState.limits[f];
  toast('Free with your account: ' + n + ' of ' + lim + ' ' + TASTER_NAMES[f] + ' left this month');
  return true;
}
/* the month's free uses spent: what was used, and what JEKrayPro costs (the founding price, and the student one);
   false when the work named has no taster (the plans are offered as before) */
export function tasterOut(what) {
  const f = tasterOf(what);
  if (!f || !tasterState) return false;
  track('taster', f + '.out');
  const lim = tasterState.limits[f];
  let dlg = document.getElementById('tasterOut');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'tasterOut', 'aria-labelledby': 'tasterOutTitle' }); document.body.append(dlg); }
  const close = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'tasterOutTitle' }, 'This month’s free ' + TASTER_NAMES[f] + ' are used'),
    h('p', null, 'Your free account has ' + lim + ' ' + TASTER_NAMES[f] + ' a month, and they are back on the 1st. JEKrayPro has them without a limit, with the rest of the design work and saving to the cloud.'),
    h('p', null, h('b', null, 'Students and university staff: '), 'JEKrayPro is half price with your university email. ', h('b', null, 'Founding members: '),
      'subscribe during the open beta and keep that price for as long as you stay subscribed.'),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn', type: 'button', onclick: close }, 'Not now'),
      h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('taster', f + '.plans'); close(); showSubscribe(); } }, 'See JEKrayPro')));
  dlg.showModal();
  return true;
}

/* the page's wiring for this module: done once, from boot.js */
export function wireTasters() {
  Object.assign(hooks, { tasterLeft, tasterUse, tasterOut });
}
