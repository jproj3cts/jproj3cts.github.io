import { hooks } from '../core/hooks.js';
import { toast } from './actions.js';

/* ==========================================================================
   The designers' work as JEKrayPro's
   Anyone may open the Optical and RF designers, build and edit a design and look at it from every side. Doing the
   work with it is JEKrayPro's: the optimiser (and the global search and glass substitution), tolerancing, design
   reports, drawings and exporting a design. The RF designer's way from a specification to a lens that can be made
   and quoted stays open to all, as does the coating designer. The tests, and a build without accounts, are not gated.
   ========================================================================== */
/* why the work named is not open now, from the account's own reason (cloud.js proWhy: not signed in, or no plan): '' when it is */
export function designWhyOf(why, what) {
  if (!why) return '';
  return /^Sign in/.test(why) ? 'Sign in with JEKrayPro, top right, to ' + what : 'JEKrayPro is needed to ' + what + ': subscribe from the account menu, or join a team with a plan';
}
export const designWhy = what => (!hooks.account().on || !hooks.proWhy ? '' : designWhyOf(hooks.proWhy(), what));
/* before the work is done: true when it may be; otherwise it says why and offers the way (sign in, or subscribe) */
export function designPro(what) {
  const why = designWhy(what);
  if (!why) return true;
  // signed out, the sign-in card says what is needed (cloud.js proFix); signed in, why, and the plans
  if (!/^Sign in/.test(why)) toast(why, true);
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
  const pro = el.dataset.need === 'pro', why = pro ? designWhy(el.dataset.what) : acctWhy(el.dataset.what);
  el.classList.toggle(pro ? 'rt-proneed' : 'rt-acctneed', !!why);
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
export function needsShown() { for (const el of document.querySelectorAll('[data-need]')) needShow(el); }
/* a button for JEKrayPro's work, marked Pro (and saying why in its title) while it is not open */
export const proMark = (btn, what) => needMark(btn, 'pro', what);
/* a button that exports, marked Free account while signed out */
export const acctMark = (btn, what) => needMark(btn, 'account', what);
