import { hooks } from '../core/hooks.js';

/* ==========================================================================
   What is JEKrayPro's, and what a free account does
   JEKrayPro is what lives on JEK's servers: benches saved to the cloud with their history, forks, My parts, teams.
   Everything done in the browser is a free account's (freeWork): the designers' optimiser (and the global search and
   glass substitution), tolerancing, design reports, drawings and exporting a design, scripts, every data format,
   JEKfilm's file, optimiser, tolerancing and specification. Each still goes through designPro(what) / proMark, which
   ask for the account alone when the work is free. Share links are kept on the server but a free account has a few
   (jek-api FREE_LINKS): signed out they ask for an account; signed in the API says when they are used up (JEKray
   counts them on the badge, io/tasters.js). The tests, and a build without accounts, are not gated.
   ========================================================================== */
const FREE_WORK = /optimise|search for designs|substitute glasses|tolerance a|design report|drawings|export a design|run scripts|export (data as|several kinds|everything)|save a coating file|coating specification|make the part/;
export const freeWork = what => FREE_WORK.test(String(what || ''));
const shareWork = what => /share a link|QR code/.test(String(what || ''));
/* why the work named is not open now, from the account's own reason (cloud.js proWhy: not signed in, or no plan): '' when it is */
export function designWhyOf(why, what) {
  if (!why) return '';
  return /^Sign in/.test(why) ? 'Sign in with JEKrayPro, top right, to ' + what : 'JEKrayPro is needed to ' + what + ': subscribe from the account menu, or join a team with a plan';
}
export function designWhy(what) {
  const a = hooks.account();
  if (!a.on) return '';
  if (freeWork(what) || (shareWork(what) && !a.signedIn)) return acctWhy(what);
  if (!hooks.proWhy) return '';
  const why = designWhyOf(hooks.proWhy(), what);
  // a free account's share links, where the app keeps no count of them: the API says when they are used up
  return why && shareWork(what) && a.signedIn && hooks.tasterLeft(what) === null ? '' : why;
}
/* before the work is done: true when it may be; otherwise it says why and offers the way (sign in, or subscribe) */
export function designPro(what) {
  if (freeWork(what) || (shareWork(what) && !hooks.account().signedIn)) return accountGate(what);
  const why = designWhy(what);
  if (!why) return true;
  // a free account's share links, while it has any left (io/tasters.js)
  if (!/^Sign in/.test(why) && hooks.tasterUse(what)) return true;
  // signed out, the sign-in card says what is needed (cloud.js proFix); signed in, why, and the plans (or the card for share links all in use)
  if (!/^Sign in/.test(why) && !(hooks.tasterLeft(what) === 0)) hooks.toast(why, true);
  if (hooks.proFix) hooks.proFix(what);
  return false;
}

/* ==========================================================================
   Exports as an account's
   Exporting images and data (the layout, the 3D view, plots, a screen's numbers, an element's .zmx, CAD files)
   needs an account, a free one being enough. Saving the bench as a .jekray file needs none. Only someone signed
   out for sure is asked: while the account is not known yet, or the API is out of reach, exports stay open (an
   outage is not the person's fault). The tests, and a build without accounts, are not gated. The account comes
   through hooks (io/account.js installs them), so what exports does not load the account's modules.
   ========================================================================== */
/* why the export named is not open now: on (accounts here), signedIn, known (the API has said): '' when it is */
export function acctWhyOf(on, signedIn, known, what) {
  return on && !signedIn && known ? 'Needs a free account: sign in, top right, to ' + what : '';
}
export const acctWhy = what => { const a = hooks.account(); return acctWhyOf(a.on, a.signedIn, a.known, what); };
/* before the export is done: true when it may be; otherwise the sign-in prompt, saying why */
export function accountGate(what) {
  if (!acctWhy(what)) return true;
  hooks.exportSignIn(what);
  return false;
}

/* ---- the badges: Pro, or Free account, on what needs it, shown only while it is needed ----
   el.dataset.need is 'pro' or 'account', el.dataset.what the work; needsShown() redoes them all as the account changes */
function needShow(el) {
  // (work marked Pro that a free account does, and a share link asked for signed out, carry the Free account badge)
  const what = el.dataset.what, pro = el.dataset.need === 'pro' && !freeWork(what) && !(shareWork(what) && !hooks.account().signedIn), why = el.dataset.need === 'pro' ? designWhy(what) : acctWhy(what);
  el.classList.toggle('rt-proneed', pro && !!why); el.classList.toggle('rt-acctneed', !pro && !!why);
  // a free account's share links left, on the badge ("3 free"; none left: Pro again)
  const left = pro && why && !/^Sign in/.test(why) ? hooks.tasterLeft(el.dataset.what) : null;
  if (left > 0) el.dataset.free = String(left); else delete el.dataset.free;
  // the reason in the title: the control's own, or, for a group with one badge, each button's in it
  for (const b of el.matches('button, [role="menuitem"]') ? [el] : [el, ...el.querySelectorAll('button')]) {
    if (b.dataset.needTitle === undefined) b.dataset.needTitle = b.title || '';
    b.title = why ? why + (b.dataset.needTitle ? '. ' + b.dataset.needTitle : '') : b.dataset.needTitle;
  }
}
export function needMark(el, need, what) {
  if (!el) return el;
  el.dataset.need = need; el.dataset.what = what;
  needShow(el);
  return el;
}
export function needsShown() { for (const el of document.querySelectorAll('[data-need]')) needShow(el); keepSign(); if (keepSkipped && keepHere()) { keepSkipped = false; if (hooks.keepNow) hooks.keepNow(); } }

/* ---- Nothing is kept without an account ----
   Signed out, an app is there to try: the bench is not autosaved in the browser, no earlier versions or recent files
   are kept, and leaving the page loses what was changed (with no question asked on the way out: most signed-out
   visits only look). keepHere() says whether this browser may keep work: yes
   with no accounts here, signed in, or when the API has not answered after the page's first seconds (as the exports'
   gate lets through); no for someone signed out for sure, and for those first seconds while the account is looked
   up (hooks.keepNow, the app's own autosave, is called once it is known to be allowed). Each app's autosave asks it
   and calls workChanged(); the bench handed over to a sign-in (hooks.keepWork) is still
   written, so it is there on the way back. The sign, beside the bar's Save, says the state and opens the sign-in. */
export function keepHere() {
  const a = hooks.account();
  if (!a.on || a.signedIn) return true;
  return a.known ? false : performance.now() >= 8000;
}
let tryChanged = false, keepSkipped = false;
/* an autosave that was not made (signed out): the sign is redone. It says Not saved where the app's own mark of
   unsaved changes is showing (the dot on Save, #saveDot), or, in an app without one, once an autosave was skipped */
export function workChanged() {
  if (keepHere()) return;
  keepSkipped = true; tryChanged = true;
  keepSign();
}
export function keepSign() {
  const a = hooks.account(), save = document.getElementById('btnSave'), out = a.on && a.known && !a.signedIn && save && save.dataset.need;
  let el = document.getElementById('keepSign');
  if (!out) { if (el) el.remove(); tryChanged = false; return; }
  if (!el) {
    el = document.createElement('button');
    el.type = 'button'; el.id = 'keepSign'; el.className = 'rt-btn rt-keepsign';
    el.addEventListener('click', () => hooks.exportSignIn('keep your work'));
    save.before(el);
  }
  const dot = document.getElementById('saveDot'), changed = dot ? !dot.hidden : tryChanged;
  el.classList.toggle('changed', changed);
  el.title = 'You are signed out, so nothing here is kept: closing or reloading the page loses your changes. A free account keeps your work in this browser and saves it as a file.';
  el.replaceChildren(Object.assign(document.createElement('b'), { textContent: changed ? 'Not saved' : 'Not kept' }), Object.assign(document.createElement('span'), { textContent: ': free account keeps your work' }));
}
/* a button for JEKrayPro's work, marked Pro (and saying why in its title) while it is not open */
export const proMark = (btn, what) => needMark(btn, 'pro', what);
/* a button that exports, marked Free account while signed out */
export const acctMark = (btn, what) => needMark(btn, 'account', what);
