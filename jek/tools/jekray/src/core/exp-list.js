import { TEST_MODE } from './constants.js';

/* ==========================================================================
   The experimental features, as every app reads them
   New features start here, off until someone switches them on, then move to beta (a Beta badge on their examples),
   then into the tool proper. Apps not yet validated are here too (app: true): JEKsuite shows them only to someone who has
   switched them on, and the site not at all until they are ready. The switch and each feature's tick are kept in this
   browser (one store for every app on the site) and set in one place, JEKsuite's account menu; each app follows
   them, as they change, from the store (ui/experimental.js in JEKray, the storage event).
   ========================================================================== */
export const EXPERIMENTAL = [
  { key: 'jekrf', app: true, name: 'JEKrf', what: 'RF and millimetre-wave quasi-optics: feed horns, RF lenses and mirrors on a bench of their own (.jekrf), and the RF designer, whose designs (.rfd) the benches use. Not yet fully validated, so treat its numbers as a guide. Shown in JEKsuite while this is ticked.' },
  { key: 'jekion', app: true, name: 'JEKion', what: 'charged-particle optics: electrodes, ion traps, lenses and time of flight, solved and flown live. Not yet fully validated, so treat its numbers as a guide. Shown in JEKsuite while this is ticked.' },
  // { key: 'example', name: 'Short name', what: 'One line on what it does and how far to trust it.' },
  { key: 'tryme', name: 'Try me QR code', what: 'while flying through the bench (the bird on the 3D view\u2019s bar), a white box in the bottom right corner with a QR code that opens a copy of the bench on a phone, \u201cTry me!\u201d above it: for a stand or a lecture. The bench travels in the link itself, so a big one can be too much for a QR code.' },
  { key: 'mods', name: 'Modules (parts with code)', what: 'part packs that carry code, run in a sandbox: new plates, polarisation plates, fibre components, electronics blocks and readouts written by anyone, installed from a file or a link (File \u203a Part packs and modules\u2026) after a prompt saying what each adds. Their code cannot reach your account, your files or the internet.' },
  { key: 'raylook', name: 'How the rays look', what: 'a window of settings for how rays are drawn in 2D, for figures and recordings: fading trails as the light changes, a glow round each ray, and the rays\u2019 width (the button under Light in the Bench panel, and View \u203a How the rays look\u2026). Kept with the bench; a bench that has them set is drawn with them whether this is on or not.' },
  { key: 'pic', name: 'Photonic circuits', what: 'a set of parts of its own (Add part, and the rail), in green: grating couplers, directional couplers, MMIs, rings, phase shifters and on-chip photodiodes, joined by waveguides, TE near 1550 nm, with a spectrum view. Checked against closed forms and SAX on the validation page.' },
];
export const EXP_KEY = 'jek-raytracer-experimental', EXP_PICKS = 'jek-raytracer-experimental-picks';
/* the switch and the ticks as this browser keeps them: { on, picks } (a private window, or a test page: off) */
export function expRead() {
  try {
    if (TEST_MODE) return { on: false, picks: {} };
    const v = JSON.parse(localStorage.getItem(EXP_PICKS) || '{}');
    return { on: localStorage.getItem(EXP_KEY) === '1', picks: v && typeof v === 'object' ? v : {} };
  } catch (err) { return { on: false, picks: {} }; }
}
export function expWrite(on, picks) {
  if (TEST_MODE) return;
  try { localStorage.setItem(EXP_KEY, on ? '1' : '0'); localStorage.setItem(EXP_PICKS, JSON.stringify(picks || {})); } catch (err) { /* not kept: fine */ }
}
/* a feature is on when the switch is and its own tick is (ticked unless unticked) */
export const expHas = (S, key) => !!S && S.on && (S.picks || {})[key] !== false && EXPERIMENTAL.some(f => f.key === key);
