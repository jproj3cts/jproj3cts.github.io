/* ---------- Sign-up prompts: whether one may show ----------
   One cap for them all (io/account.js): once the share dialog, the note after a file save or the return-visit card
   has shown, none of them shows again for a week. */
export const NUDGE_DAYS = 7;
export const nudgeCapOk = (last, now) => !(now - (Number(last) || 0) < NUDGE_DAYS * 864e5);
// a link that opens something of its own: a shared bench, an example, a tour, the gallery, the JEKrayPro box,
// My benches, a pack, an invitation, or a sign-in or payment coming back
const OWN_LINK = /[#?&](p=|s=|demo=|tour=|examples|pro\b|benches|pack=|jekinvite=|jekauth=|jekbilling=)/;
/* The return-visit card: the bench was restored from this browser on a later visit (not a reload in the same
   session), the person is known to be signed out, the bench has parts, nothing else is up (the welcome note, a
   tour, another prompt), the visit did not come by a link of its own, and the cap allows.
   s: { on, restored, again, signedOut, parts, busy, arrived, last, now } */
export function returnDue(s) {
  return !!(s.on && s.restored && !s.again && s.signedOut && s.parts > 0 && !s.busy && !OWN_LINK.test(s.arrived || '') && nudgeCapOk(s.last, s.now));
}
