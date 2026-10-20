import { applyRf, rfBeam } from '../core/rf.js';
import { project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { lastTrace, setLastTraceKey, traceScene } from './trace.js';
import { faceArrivals, rfCoupling } from './fibre-face.js';

/* ---------- A receiving horn against frequency, and its link budget ----------
   The sweep: every feed horn on the bench taken through a band about its frequency (each in
   proportion to its own, when there are several), the bench traced again at each step, and what
   the receiver takes in read there: S21, the power into its mode over the power the horns are set to
   (their dBm: a horn's beam carries only its modes' share g of it, a loss S21 counts).
   Everything on the way is at its value for that frequency: a dielectric's index and loss, a
   mesh's transmission, a grid's leak, a film's interference, the horns' own beams. Kept for the
   bench as it stands. */
const cache = { key: '', out: null };
export const rfSources = () => project.elements.filter(e => e.type === 'source' && e.mmw && !e.mmw.part);
// what the feed horns are set to, mW: before the share their modes carry (the beam's power is this times g)
const rfSetMw = srcs => srcs.reduce((a, s) => a + Math.pow(10, s.mmw.dbm / 10), 0);
export function rfSweep(rx) {
  const srcs = rfSources();
  if (!srcs.length || !rx.mmw || rx.mmw.part) return null;
  const key = JSON.stringify(project.elements) + '|' + rx.id;
  if (cache.key === key) return cache.out;
  const f0 = srcs[0].mmw.ghz, span = rx.mmw.span / 100, N = rx.mmw.points, saved = srcs.map(s => s.mmw.ghz);
  const ghz = [], s21 = [], eff = [];
  const t0 = performance.now();
  for (let k = 0; k < N; k++) {
    const f = f0 * (1 - span / 2 + span * k / (N - 1));
    srcs.forEach((s, i) => { s.mmw.ghz = saved[i] * f / f0; applyRf(s); });
    setLastTraceKey(null); traceScene();
    const C = rfCoupling(rx), Pin = rfSetMw(srcs);
    ghz.push(f); s21.push(C && C.mw > 0 && Pin > 0 ? 10 * Math.log10(C.mw / Pin) : -200); eff.push(C ? C.eff : 0);
  }
  srcs.forEach((s, i) => { s.mmw.ghz = saved[i]; applyRf(s); });
  setLastTraceKey(null); traceScene();
  cache.key = key; cache.out = { ghz, s21, eff, f0, ms: performance.now() - t0 };
  return cache.out;
}
/* The link budget: down the strongest beam arriving at the receiver, from its horn, each part
   met and what the power did there (dB, reflections and transmissions, a dielectric's loss),
   then the coupling into the receiver's mode and the whole. It starts from the power the horn is
   set to, and its first step is the horn's mode share g: what its modes carry into the beam */
export function linkBudget(rx) {
  const arr = faceArrivals(rx), B = lastTrace.beams || [];
  if (!arr.length) return null;
  const P = a => a.J.reduce((s, v) => s + v * v, 0);
  const A = arr.reduce((m, a) => (P(a) > P(m) ? a : m), arr[0]);
  const chain = [];
  for (let j = B.indexOf(A.b); j >= 0; j = B[j].parent) chain.push(j);
  chain.reverse();
  const src = getEl(B[chain[0]].src), rows = [], dB = r => (r > 0 ? 10 * Math.log10(r) : -Infinity);
  rows.push({ what: src ? src.name : 'Source', note: 'launched', db: 0, w: B[chain[0]].w });
  if (src && src.mmw) rows.push({ what: src.name, note: 'horn mode', db: dB(rfBeam(src.mmw, src.mmw.ghz).g), w: B[chain[0]].w });
  for (let c = 1; c < chain.length; c++) {
    const b = B[chain[c]], p = B[chain[c - 1]], ev = b.ev, el = ev && getEl(ev.el);
    const r = p.w > 0 ? b.w / p.w : 0, mode = ev ? (ev.mode === 'R' ? 'reflected' : ev.mode === 'T' ? 'through' : 'passed') : '';
    if (el) rows.push({ what: el.name, note: mode, db: dB(r), w: b.w });
  }
  // the last beam's own path: a dielectric's absorption is in its power at the end (see beams' w)
  const C = rfCoupling(rx);
  if (C) rows.push({ what: rx.name, note: 'into its mode', db: dB(C.eff), w: null });
  const Pin = rfSetMw(rfSources());
  return { rows, total: C && Pin > 0 ? dB(C.mw / Pin) : -Infinity, mw: C ? C.mw : 0, inMw: Pin };
}
