import { project } from '../state/project.js';
import { lightOf } from '../state/elements.js';
import { lastTrace } from '../engines/trace.js';
import { diffractionLater } from '../engines/pd-cavity.js';
import { PHOS_N, phosphorFromMap, phosphorFromRays, phosphorLook, phosphorStep } from '../engines/phosphor.js';
import { requestRender } from './render.js';

/* ==========================================================================
   Phosphor screens on the page: each one's glow, kept here (not in the bench) and moved on in real
   time, a frame at a time, while it is still fading. The glow is lit by the light on the screen
   now: the rays of the latest trace, or the diffracted field's map when the bench shows the field.
   The 2D bench draws it along the face (ui/parts/screen.js), the 3D view paints it on the face's
   picture, kept here too so a frame only repaints it. The arithmetic: engines/phosphor.js.
   ========================================================================== */
const PH = new Map();             // id -> { B: the glow, S: the light now, src: what S was made from, t: when last moved on, tex: { cv, tex } in 3D }
let raf = 0;

const phosphors = () => (project ? project.elements.filter(e => e.type === 'screen' && e.phosphor && e.bench === project.tab) : []);
function stateOf(el) {
  let s = PH.get(el.id);
  if (!s) { s = { B: new Float32Array(PHOS_N * PHOS_N), S: null, src: null, t: performance.now(), tex: null }; PH.set(el.id, s); }
  return s;
}
/* the light on the screen now, worked out again only when the trace or the field changes */
// the field's map, or else this screen's rays in the latest trace (a new list each trace)
const NO_HITS = [];
const srcOf = el => { const D = lightOf().field ? diffractionLater(el).D : null; return (D && D.map) || (lastTrace && lastTrace.screens && lastTrace.screens[el.id]) || NO_HITS; };
const fresh = (el, s) => s.src === srcOf(el) && s.L === el.length / 2 && s.glow === el.glow;
function excite(el, s) {
  if (fresh(el, s)) return;
  const L = el.length / 2, src = srcOf(el);
  s.src = src; s.L = L; s.glow = el.glow;
  s.S = Array.isArray(src) ? phosphorFromRays(src, L) : phosphorFromMap(src, L);
}
function phosTick(now) {
  raf = 0;
  let moving = false;
  const live = new Set();
  for (const el of phosphors()) {
    live.add(el.id);
    const s = stateOf(el);
    excite(el, s);
    const dt = Math.min(1, (now - s.t) / 1000);
    s.t = now;
    if (phosphorStep(s.B, s.S, dt, el.decay)) moving = true;
    paint(el, s);
  }
  for (const id of PH.keys()) if (!live.has(id) && !(project && project.elements.some(e => e.id === id && e.phosphor))) PH.delete(id);
  requestRender();
  if (moving) raf = requestAnimationFrame(phosTick);
}
/* a change on the bench (a trace, a field, a new setting): the glow moves on from the next frame */
export function phosphorKick() {
  if (raf) return;
  const els = phosphors();
  if (!els.some(el => { const s = PH.get(el.id); return !s || !fresh(el, s); })) return;
  const now = performance.now();
  // a screen not moved on for a while starts from now, its glow faded by the time gone
  raf = requestAnimationFrame(phosTick);
  for (const el of phosphors()) { const s = PH.get(el.id); if (s && now - s.t > 1000) { phosphorStep(s.B, null, (now - s.t) / 1000, el.decay); s.t = now; } }
}
/* the glow along the face for the 2D bench: each column across the face, its brightest cell, 0..1 (null: none yet) */
export function phosphorColumns(el) {
  const s = PH.get(el.id);
  if (!s) return null;
  const n = PHOS_N, out = new Float32Array(n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const b = s.B[j * n + i]; if (b > out[i]) out[i] = b; }
  return out;
}
/* the glow's picture for the 3D face: a canvas, n by n, kept for this screen and repainted each frame */
export function phosphorCanvas(el) {
  const s = stateOf(el);
  if (!s.cv) { s.cv = document.createElement('canvas'); s.cv.width = s.cv.height = PHOS_N; }
  s.texs = s.texs || new Set();
  paint(el, s);
  return s;
}
/* a 3D picture of this screen's glow, to be told when to upload a new frame */
export function phosphorTexture(el, tex) { const s = phosphorCanvas(el); s.texs.add(tex); }
export function phosphorForget(tex) { for (const s of PH.values()) if (s.texs) s.texs.delete(tex); }
const phosRgb = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
const FACE = [26, 31, 28];         // the unlit phosphor, a dark grey-green
function paint(el, s) {
  if (!s.cv) return;
  const n = PHOS_N, g = phosRgb(el.glow || '#4dff7a'), cx = s.cv.getContext('2d'), img = s.img || (s.img = cx.createImageData(n, n));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = phosphorLook(s.B[j * n + i]), o = ((n - 1 - j) * n + i) * 4;
    for (let c = 0; c < 3; c++) img.data[o + c] = Math.round(FACE[c] + (g[c] - FACE[c]) * v);
    img.data[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  if (s.texs) for (const t of s.texs) t.needsUpdate = true;
}
/* for the tests and scripts: a screen's glow now, its peak and how much of the face is lit */
export function phosphorRead(el) {
  const s = PH.get(el.id);
  if (!s) return null;
  let pk = 0, lit = 0, su = 0, sw = 0;
  const n = PHOS_N, cell = el.length / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const b = s.B[j * n + i]; if (b > pk) pk = b; if (b > 0.05) { lit++; su += b * (-el.length / 2 + (i + 0.5) * cell); sw += b; } }
  return { peak: pk, lit: lit / (n * n), centre: sw ? su / sw : null };
}
