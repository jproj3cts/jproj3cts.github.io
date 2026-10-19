import { hooks } from '../core/hooks.js';
import { accountsOn } from '../io/account.js';
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
export const designWhy = what => (!accountsOn() || !hooks.proWhy ? '' : designWhyOf(hooks.proWhy(), what));
/* before the work is done: true when it may be; otherwise it says why and offers the way (sign in, or subscribe) */
export function designPro(what) {
  const why = designWhy(what);
  if (!why) return true;
  toast(why, true);
  if (hooks.proFix) hooks.proFix();
  return false;
}
/* a button for such work, marked Pro (and saying why in its title) while it is not open */
export function proMark(btn, what) {
  const why = designWhy(what);
  if (!btn || !why) return btn;
  btn.classList.add('rt-proneed');
  btn.title = why + (btn.title ? '. ' + btn.title : '');
  return btn;
}
