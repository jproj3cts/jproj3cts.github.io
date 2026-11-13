import { BEAM_Z, FORMAT, VERSION, ZOOM_MAX, clamp } from '../core/constants.js';
import { assemblies, normAssemblies } from '../core/assembly.js';
import { liveMates, normMates } from '../core/mates.js';
import { hooks } from '../core/hooks.js';
import { normModRef } from '../core/modulators.js';
import { partHex } from '../core/part-colours.js';
import { applyRf, normRf } from '../core/rf.js';
import { applyPulse, isLaserLike, syncLine } from '../core/pulses.js';
import { RF } from '../parts/rf.js';
import { PARTS, PART_BY_KEY, TYPE_LABEL } from '../parts/registry.js';
import { normCoat, normMat, num, project, selectedId, setProject, uid } from './project.js';
import { ensureBenches } from './tabs.js';
import { loadGen, setLoadGen, sourceLines, tippable } from '../engines/trace.js';
import { SWEEP_STEPS_MAX, getPath } from './params.js';
import { applyFibre } from '../engines/fibre-face.js';
import { CONNS, FC, fcPortsOf, pkey, portsOf } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { modsCarried, normCarried } from '../engines/mods.js';
import { normF } from '../core/freeform.js';
import { normPh } from '../core/diffractive.js';

/* (Before the surface model had holes and stacks, a face carried a "mirror" zone; parts/lens.js converts one on load.)
   A lens face's centre and its mirroring. The face is split at radius r into its centre and its rim. Mirrored:
   "all" (the whole face), "in" (the centre, a spot: a solid telescope's secondary), "out" (the rim, an annulus:
   its primary, the centre a clear hole) or "none". Light meeting a mirrored part reflects wholly, staying in the
   glass it came from; the rest refracts as the coating says. The centre may have a shape of its own (R, k: a
   surface over the face's vertex, flat for R null, with a step where it meets the rim), as a flat ground into a
   lens's middle; without R it follows the face. Nothing is kept for an unmirrored face whose centre is the face's. */
export function normMirror(m) {
  if (!m || typeof m !== 'object') return undefined;
  const zone = m.zone === 'in' || m.zone === 'out' || m.zone === 'none' ? m.zone : 'all';
  if (zone === 'all') return { zone };
  const out = { zone, r: Math.max(0.01, num(m.r, 5)) };
  if (m.R !== undefined || m.k !== undefined) { out.R = (m.R === null || m.R === undefined || m.R === '' || !isFinite(m.R) || +m.R === 0) ? null : +m.R; out.k = num(m.k, 0); }
  return zone === 'none' && out.R === undefined ? undefined : out;
}
/* the face's mirroring proper: its zone object, or null for a face that only has a shaped centre */
export const mirrorZ = m => m && m.zone !== 'none' ? m : null;
/* the centre's own shape: { r, c, k }, or null where it follows the face */
export const mirrorShape = m => m && m.zone !== 'all' && m.R !== undefined ? { r: m.r, c: m.R ? 1 / m.R : 0, k: m.k || 0, R: m.R } : null;
/* is radius r on the face inside its mirrored part? */
export const mirrorAt = (m, r) => !!m && m.zone !== 'none' && (m.zone === 'all' || (m.zone === 'in' ? r <= m.r : r >= m.r));
export function normSurface(s) {
  s = s || {};
  const R = (s.R === null || s.R === undefined || s.R === '' || !isFinite(s.R) || s.R === 0) ? null : +s.R;
  return {
    R, k: num(s.k, 0), a2: num(s.a2, 0),
    A: Array.isArray(s.A) ? s.A.map(Number).filter(isFinite) : [],
    odd: Array.isArray(s.odd) && s.odd.some(v => +v) ? s.odd.map(Number).filter(isFinite) : undefined,
    F: normF(s.F),                     // freeform terms (an asphere's): core/freeform.js
    ph: normPh(s.ph),                  // diffractive phase terms (a diffractive lens's): core/diffractive.js
    semi: (isFinite(s.semi) && s.semi > 0) ? +s.semi : null,
    hole: isFinite(s.hole) && s.hole > 0 ? +s.hole : 0,     // a hole about the axis, this radius: no surface there, so the light meets the next surface of the stack, or goes on
    coat: normCoat(s.coat),
    // a Fresnel face: the curved face cut into rings this wide (mm), each with the face's slope, brought back to its base
    ...(isFinite(s.fresnel) && +s.fresnel > 0 ? { fresnel: Math.min(100, Math.max(0.05, +s.fresnel)) } : {}),
  };
}
export function normElement(e) {
  if (e && (e.type === 'lamp' || e.type === 'lamp2d')) e = Object.assign({}, e, { type: 'source', lamp: true, lampFlat: e.type === 'lamp2d' || e.lampFlat === true });     // a Lamp (or Circular lamp) written as its own type
  const o = normElementBase(e);
  if (!o) return null;
  ELEC.normExtra(e, o);                                                                      // ELEC hook: an optical part's electrical settings
  if (o.mmw) applyRf(o);                                  // a horn sets its own beam
  if (o.type === 'source' && o.fibre) applyFibre(o);     // a fibre launch sets its own beam
  if ((o.type === 'source' || (o.type === 'fcomp' && o.kind === 'laser')) && o.tau > 0) applyPulse(o);
  if (isLaserLike(o)) syncLine(o);
  o.sweeps = {};
  if (e.sweeps && typeof e.sweeps === 'object') {
    for (const [k, v] of Object.entries(e.sweeps)) {
      const cur = getPath(o, k);
      if (cur === undefined || (cur !== null && typeof cur !== 'number')) continue;
      if (!v || !isFinite(v.min) || !isFinite(v.max)) continue;
      const freq = isFinite(v.freq) && v.freq > 0 ? +v.freq : 1 / Math.max(0.1, num(v.period, 4));
      o.sweeps[k] = { min: +v.min, max: +v.max, freq: clamp(freq, 0.001, 50), phase: num(v.phase, 0),
        wave: ['sine', 'triangle', 'ramp'].includes(v.wave) ? v.wave : 'sine' };
      if (v.field === true) o.sweeps[k].field = true;
      // steps a cycle: the positions it plays through (and renders, with the field); none, smooth
      if (isFinite(v.steps) && v.steps >= 2) o.sweeps[k].steps = Math.round(clamp(+v.steps, 2, SWEEP_STEPS_MAX));
    }
  }
  return o;
}
export function normElementBase(e) {
  if (e && (e.type === 'lamp' || e.type === 'lamp2d')) e = Object.assign({}, e, { type: 'source', lamp: true, lampFlat: e.type === 'lamp2d' || e.lampFlat === true });     // a Lamp (or Circular lamp) written as its own type     // a Lamp written as its own type
  const base = {
    id: typeof e.id === 'string' ? e.id : uid(),
    type: e.type,
    name: String(e.name || TYPE_LABEL[e.type] || 'Element'),
    x: num(e.x, 0), y: num(e.y, 0), angle: num(e.angle, 0),
    bench: typeof e.bench === 'string' ? e.bench : null,     // the tab it is on (ensureBenches fills it in)
  };
  if (e.locked === true) base.locked = true;                  // held in place: not moved by dragging or the arrow keys
  if (e.hide3d === true) base.hide3d = true;                  // not drawn in the 3D view (the light still meets it)
  // its own colours on the bench and in exported pictures (core/part-colours.js): kept only when set, so a part without them is drawn as ever
  if (e.type !== 'draw') { const lc = partHex(e.lineColour), fc = partHex(e.fillColour); if (lc) base.lineColour = lc; if (fc) base.fillColour = fc; }
  // its height above the breadboard (mm), kept only when not the beam height (see zOf)
  if (isFinite(e.z) && e.z !== null && +e.z !== 75) base.z = clamp(+e.z, 0, 2000);
  // a free-space part tipped up (+) or down out of the bench plane, degrees (see setTip)
  if (isFinite(e.tip) && e.tip !== null && +e.tip !== 0 && tippable(base)) base.tip = clamp(+(+e.tip).toFixed(6), -90, 90);
  // and rolled about its own axis (the way it faces, or its optical axis), degrees (see setRoll)
  if (isFinite(e.roll) && e.roll !== null && +e.roll !== 0 && tippable(base)) base.roll = clamp(+(+e.roll).toFixed(6), -180, 180);
  if (typeof e.group === 'string' && e.group) base.group = e.group.slice(0, 40);     // one of a group, picked and moved together
  // the part its group turns about: spin (degrees, sweepable) turns the rest of the group about its x, y; spun is the spin
  // they are placed at now (applySpins brings them round to spin)
  if (base.group && e.pivot === true) { base.pivot = true; base.spin = num(e.spin, 0); base.spun = num(e.spun, base.spin); }
  // what its import had to assume (a coating from the part number, a fold it could not follow): shown in red until dismissed
  if (Array.isArray(e.assumed) && e.assumed.length) base.assumed = e.assumed.filter(x => typeof x === 'string' && x).slice(0, 12).map(x => x.slice(0, 400));
  if (e.mmw && typeof e.mmw === 'object') base.mmw = normRf(e.mmw, e.type);              // an RF part: the RF palette's, a horn's settings
  if (e.mod && typeof e.mod === 'object') { const m = normModRef(e.mod, e.type); if (m) base.mod = m; }   // a mod's part: which mod, its settings
  // its name moved off its usual place (mm from the part) or made bigger or smaller
  if (e.label && isFinite(e.label.dx) && isFinite(e.label.dy)) base.label = { dx: +e.label.dx, dy: +e.label.dy, s: clamp(num(e.label.s, 1), 0.4, 8) };
  const P = PARTS[e.type];
  return P ? P.norm(e, base) : null;
}

/* a new part from a picker key, at x, y: the part's own make, normalised */
export function makeElement(kind, x, y) {
  if (kind.startsWith('rf:')) { const spec = RF.make(x, y, kind.slice(3)); return spec ? normElement(spec) : null; }
  if (kind.startsWith('pic:')) return PIC.make(kind.slice(4), x, y);                         // PIC hook
  if (kind.startsWith('elec:')) return ELEC.make(kind.slice(5), x, y);                       // ELEC hook (and the chopper, a free-space part made there)
  const P = PART_BY_KEY[kind];
  return P ? normElement(P.make(x, y, kind)) : undefined;
}

export function demoProject() {
  const p = { name: 'Untitled bench', view: { cx: 5, cy: 8, scale: 6 }, snap: 1, maxBounces: 200, minPower: 0.1, ghosts: false, library: [], elements: [] };
  setProject(p);
  p.elements.push(
    normElement({ type: 'source', name: 'HeNe 633 nm', x: -60, y: 0, angle: 0, wavelength: 632.8, width: 10, divergence: 0, rays: 15, pattern: 'hex', gauss: true, w0: 5, z0: 0 }),
    normElement({ type: 'lens', name: 'f = 50 mm biconvex', x: 0, y: 0, angle: 0, diameter: 25.4,
      surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] }),
    normElement({ type: 'mirror', name: 'Fold mirror', x: 25, y: 0, angle: 135, length: 25.4 }),
    normElement({ type: 'screen', name: 'Screen', x: 25, y: 26.2, angle: -90, length: 12 }),
  );
  return ensureBenches(p);
}

/* How the bench shows its light, for every source alike: rays or not, and Gaussian beams as
   their envelope, as their diffracted field, or not at all, with the field's intensity scale.
   (Older benches set this source by source: a bench with any source showing its field shows
   every beam's field.) */
/* how many decades a log scale of the field spans: 0 for linear, 3 (30 dB) or 6 (60 dB) */
export const fieldDec = sc => sc === 'log60' ? 6 : sc === 'log' ? 3 : 0;
/* what the bench's Light sends from its sources: the ray fans (Show the rays) and the Gaussian beams (their envelope or
   their field shown); a source has no ticks of its own */
export const beamOn = src => !!src && !!src.gauss && (lightOf().envelope !== false || !!lightOf().field);
// (a source with no beam, its field from even illumination, carries its light in its rays alone: they are traced, if hidden)
export const raysOn = src => !!src && src.traceRays !== false && (lightOf().rays !== false || !beamOn(src));
export function normLight(L, els) {
  L = L && typeof L === 'object' ? L : null;
  const any = k => (els || []).some(e => e && (e.beamView === k || e.emitView === k));
  // a bench saved with one choice for its beams (envelope, field or none) takes the same picture
  const was = L && ['envelope', 'field', 'none'].includes(L.beams) ? L.beams : null;
  return {
    rays: L ? L.rays !== false : true,
    envelope: L && typeof L.envelope === 'boolean' ? L.envelope : was ? was !== 'none' : true,
    field: L && typeof L.field === 'boolean' ? L.field : was ? was === 'field' : any('field'),
    scale: L && (L.scale === 'log' || L.scale === 'log60' || L.scale === 'lin') ? L.scale : (els || []).some(e => e && e.beamView === 'field' && e.beamScale === 'log') ? 'log' : 'lin',
    // light drawn by the power it carries against the bench's brightest source (rays and envelopes, 2D and 3D): on
    // unless the bench turns it off, so every bench, old or new, has it (ui/render.js powerFade)
    byPower: L ? L.byPower !== false : true,
    // while sweeps play, fading trails of the frames before: kept only when on
    ...(L && L.trail === true ? { trail: true } : {}),
    // the rays drawn wider than 1.2 px on the screen (up to 4), and with a soft glow round them: kept only when set
    ...(L && isFinite(L.rayWidth) && +L.rayWidth > 1.2 ? { rayWidth: Math.min(4, +L.rayWidth) } : {}),
    ...(L && L.glow === true ? { glow: true } : {}),
  };
}
/* A group's spin (a lighthouse's lamp ring, a polygon scanner): each group's pivot part with its spin changed turns the
   rest of the group about its own x, y by the change, their angles too, and the fibres between them; spun then
   says where they are. Done before each trace (engines/trace.js traceScene), so a sweep of spin plays it. */
export function applySpins() {
  for (const p of project.elements) {
    if (!p.pivot || !p.group) continue;
    const d = (p.spin || 0) - (p.spun || 0);
    if (!d) continue;
    const r = d * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), rot = (x, y) => [p.x + (x - p.x) * c - (y - p.y) * s, p.y + (x - p.x) * s + (y - p.y) * c];
    const mates = project.elements.filter(e => e !== p && e.group === p.group && e.bench === p.bench), ids = new Set([p.id, ...mates.map(e => e.id)]);
    for (const e of mates) { [e.x, e.y] = rot(e.x, e.y); e.angle = +((((e.angle + d) % 360) + 540) % 360 - 180).toFixed(9); }
    for (const F of project.fibres || []) if (ids.has(F.a[0]) && ids.has(F.b[0])) for (const n of F.path || []) {
      [n.x, n.y] = rot(n.x, n.y);
      for (const k of ['h1', 'h2']) if (Array.isArray(n[k])) n[k] = [n[k][0] * c - n[k][1] * s, n[k][0] * s + n[k][1] * c];
    }
    p.spun = p.spin || 0;
  }
}
/* A Lamp's rays (any but a flat point, which keeps the plain fan of rays 360/N apart: engines/trace.js). Its rays in
   all (rays) are spread evenly over the band of directions it shines in: rings of latitude at k/rings of elev above and
   below the bench plane (one ring, the plane, without elev), each ring given rays in proportion to its share of the
   sphere (its cosine), every other ring turned half a step, so the directions pack as a honeycomb, not a grid. A lamp
   with a size sends each from its face as seen from that direction, in 3D: a point across the outline it shows that
   way (from an even two-dimensional sequence, so neighbouring rays start far apart), then out along the ray to where it
   leaves the lamp. Uniform across the face seen from any direction is how a glowing surface looks (Lambertian), so its
   size shows: the rays a lens collects leave from all over it. A sphere is lampD across; a cylinder lampD across and
   lampL long, its axis along the lamp's direction tipped up by lampTip (90: standing up; 0: lying along its direction).
   [x, y, z, azimuth (rad, on the bench), elevation (rad)], on the bench, z above the breadboard. */
export const lampAxis = el => { const a = (el.angle || 0) * Math.PI / 180, t = (isFinite(el.lampTip) ? el.lampTip : 90) * Math.PI / 180; return [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)]; };
const lampDot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
/* where a line from q (relative to the lamp's centre) along d leaves the lamp (the far end of its stretch inside), or null */
function lampExit(el, q, d) {
  const r = el.lampD / 2;
  if (el.lampShape !== 'cylinder') {
    const b = lampDot(q, d), c = lampDot(q, q) - r * r, disc = b * b - c;
    return disc < 0 ? null : -b + Math.sqrt(disc);
  }
  const A = lampAxis(el), h = el.lampL / 2, qA = lampDot(q, A), dA = lampDot(d, A);
  const qp = [q[0] - qA * A[0], q[1] - qA * A[1], q[2] - qA * A[2]], dp = [d[0] - dA * A[0], d[1] - dA * A[1], d[2] - dA * A[2]];
  let lo = -Infinity, hi = Infinity;
  const a2 = lampDot(dp, dp), b2 = lampDot(qp, dp), c2 = lampDot(qp, qp) - r * r;
  if (a2 < 1e-12) { if (c2 > 0) return null; }
  else { const disc = b2 * b2 - a2 * c2; if (disc < 0) return null; const sq = Math.sqrt(disc); lo = (-b2 - sq) / a2; hi = (-b2 + sq) / a2; }
  if (Math.abs(dA) < 1e-12) { if (Math.abs(qA) > h) return null; }
  else { const t1 = (-h - qA) / dA, t2 = (h - qA) / dA; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); }
  return lo <= hi ? hi : null;
}
export function lampRaysOf(el) {
  const N = Math.max(1, Math.round(el.rays || 1)), a0 = (el.angle || 0) * Math.PI / 180, z0 = isFinite(el.z) && el.z !== null ? +el.z : BEAM_Z;
  // rings each way: as set, or (0) as many as space the rays about as far apart up as round: the band's area 4π sin(elev)
  const eR = (el.elev || 0) * Math.PI / 180, R = el.elev > 0 ? (el.rings > 0 ? el.rings : Math.max(1, Math.round(eR / Math.sqrt(4 * Math.PI * Math.sin(eR) / N)))) : 0, lev = [];
  for (let k = -R; k <= R; k++) lev.push([k, R ? k / R * el.elev * Math.PI / 180 : 0]);
  const cs = lev.map(([, e]) => Math.cos(e)), sc = cs.reduce((x, y) => x + y, 0);
  const n = cs.map(c => Math.max(1, Math.round(N * c / sc)));
  n[R] += N - n.reduce((x, y) => x + y, 0);                       // the plane's ring makes up the total
  if (n[R] < 1) n[R] = 1;
  const dirs = [];
  lev.forEach(([k, e], q) => { const m = n[q], off = Math.abs(k) % 2 ? 0.5 : 0; for (let i = 0; i < m; i++) dirs.push([a0 + 2 * Math.PI * (i + off) / m, e]); });
  const r = (el.lampD || 0) / 2, out = [];
  if (!(r > 0)) { for (const [az, e] of dirs) out.push([el.x, el.y, z0, az, e]); return out; }
  const cyl = el.lampShape === 'cylinder', A = cyl ? lampAxis(el) : null, h = cyl ? el.lampL / 2 : 0;
  let seq = 0;
  dirs.forEach(([az, e]) => {
    const ce = Math.cos(e), d = [Math.cos(az) * ce, Math.sin(az) * ce, Math.sin(e)];
    // across the face it shows this way: u level and across the ray, v up it, both square to it
    const u = [-Math.sin(az), Math.cos(az), 0], v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    let hu = r, hv = r;
    if (cyl) { const au = lampDot(A, u), av = lampDot(A, v); hu = Math.abs(au) * h + r * Math.sqrt(Math.max(0, 1 - au * au)); hv = Math.abs(av) * h + r * Math.sqrt(Math.max(0, 1 - av * av)); }
    // the next points of the sequence (R2, the plastic number's) inside the outline: the first that meets the lamp
    let P = null;
    for (let tries = 0; tries < 64 && !P; tries++, seq++) {
      const a = (0.5 + seq * 0.7548776662466927) % 1, b = (0.5 + seq * 0.5698402909980532) % 1;
      let s, t;
      if (!cyl) { const rr = r * Math.sqrt(a), th = 2 * Math.PI * b; s = rr * Math.cos(th); t = rr * Math.sin(th); }
      else { s = (2 * a - 1) * hu; t = (2 * b - 1) * hv; }
      const q = [s * u[0] + t * v[0], s * u[1] + t * v[1], s * u[2] + t * v[2]], tx = lampExit(el, q, d);
      if (tx !== null) P = [q[0] + tx * d[0], q[1] + tx * d[1], q[2] + tx * d[2]];
    }
    if (!P) P = [0, 0, 0];
    out.push([el.x + P[0] + d[0] * 1e-7, el.y + P[1] + d[1] * 1e-7, z0 + P[2] + d[2] * 1e-7, az, e]);
  });
  return out;
}
/* whether a source sends its rays as a Lamp's (lampRaysOf), not as a fan */
export const lampEmits = el => !!(el && el.lamp && !el.lampFlat);
/* a Lamp's outline seen from above, in its own frame (x along its direction): a circle (a sphere, or a cylinder standing
   up), else a cylinder's footprint as it tips, its length L cos(tip) + D sin(tip); which light coming back is taken by */
export function lampFootprint(el) {
  const r = el.lampD / 2;
  if (el.lampShape !== 'cylinder') return { round: true, a: r, b: r };
  const t = (isFinite(el.lampTip) ? el.lampTip : 90) * Math.PI / 180, a = Math.abs(Math.cos(t)) * el.lampL / 2 + Math.abs(Math.sin(t)) * r;
  return a <= r + 1e-9 ? { round: true, a: r, b: r } : { round: false, a, b: r };
}
export function lampBody(el) {
  const F = lampFootprint(el);
  if (!F.round) return [[F.a, -F.b], [F.a, F.b], [-F.a, F.b], [-F.a, -F.b]];
  const out = [];
  for (let i = 0; i < 32; i++) { const t = 2 * Math.PI * i / 32; out.push([F.a * Math.cos(t), F.a * Math.sin(t)]); }
  return out;
}
export const lightOf = () => (project && project.light) || (project && (project.light = normLight(null, project.elements))) || { rays: true, envelope: true, field: false, scale: 'lin', byPower: true };
export function serialize() {
  return {
    format: FORMAT, version: VERSION,
    name: project.name,
    saved: new Date().toISOString(),
    view: project.view, snap: project.snap, maxBounces: project.maxBounces, minPower: project.minPower, ghosts: project.ghosts, light: lightOf(),
    library: project.library || [],
    cavityLock: project.cavityLock || {},
    benches: project.benches, tab: project.tab,
    elements: project.elements,
    fibres: project.fibres || [],
    ...(assemblies().length ? { assemblies: assemblies() } : {}),
    ...(liveMates().length ? { mates: liveMates() } : {}),
    measures: project.measures || [],
    notes: project.notes || '',
    ...(project.labelMm > 0 ? { labelMm: project.labelMm } : {}),
    ...(project.labelFixed ? { labelFixed: true, labelPx: project.labelPx || 12 } : {}),
    ...(project.elements.some(e => e.mod) ? { mods: modsCarried() } : {}),
    ...(project.style && (project.style.bg || project.style.holes === false) ? { style: project.style } : {}),
  };
}

/* Rulers and angles left on the bench: points, and for those on a beam its direction there */
export function normMeasures(list, benches) {
  const ids = new Set(benches.map(b => b.id)), out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || (m.type !== 'ruler' && m.type !== 'angle') || !ids.has(m.bench) || !Array.isArray(m.pts) || m.pts.length !== (m.type === 'ruler' ? 2 : 3)) continue;
    const pts = m.pts.map(q => {
      if (!q || !isFinite(q.x) || !isFinite(q.y)) return null;
      const o = { x: +q.x, y: +q.y };
      if (isFinite(q.dx) && isFinite(q.dy) && q.beam !== undefined) Object.assign(o, { beam: 0, dx: +q.dx, dy: +q.dy });
      return o;
    });
    if (pts.every(Boolean)) out.push({ type: m.type, bench: m.bench, pts });
  }
  return out;
}
/* Fibres: port to port, each port taking one; length in m, loss in dB/km */
export function normFibres(list, els) {
  const byId = new Map(els.map(e => [e.id, e])), used = new Set(), out = [];
  const nPorts = e => (e.type === 'fcomp' ? (FC[e.kind] ? fcPortsOf(e).length : 0) : e.type === 'fibre' ? 1 : e.type === 'pic' ? PIC.ports(e).length : e.type === 'elec' ? (ELEC.KINDS[e.kind] ? ELEC.ports(e).length : 0) : 0) + (e.type !== 'elec' ? ELEC.extra(e).length : 0);
  // ELEC hook: an electrical port's direction, for wires
  const dir = x => { const e = byId.get(x[0]), P = !e ? null : e.type === 'elec' ? (ELEC.KINDS[e.kind] ? ELEC.ports(e)[x[1]] : null) : portsOf(e)[x[1]]; return P && P.elec || null; };
  const end = x => Array.isArray(x) && byId.has(String(x[0])) && (x[1] | 0) >= 0 && (x[1] | 0) < nPorts(byId.get(String(x[0]))) ? [String(x[0]), x[1] | 0] : null;
  for (const F of Array.isArray(list) ? list : []) {
    let a = F && end(F.a), b = F && end(F.b);
    // a wire: from an output to an input, one wire to an input, any number from an output
    if (a && b && (dir(a) || dir(b))) {
      if (!dir(a) || !dir(b) || (dir(a) === dir(b) && dir(a) !== 'io')) continue;
      if (dir(a) === 'in' || dir(b) === 'out') [a, b] = [b, a];
      if (used.has(pkey(...b))) continue;
      used.add(pkey(...b));
      const pt = v => Array.isArray(v) && v.length === 2 && v.every(isFinite) ? [+v[0], +v[1]] : [0, 0];
      const path = Array.isArray(F.path) ? F.path.filter(n => n && isFinite(n.x) && isFinite(n.y)).map(n => ({ x: +n.x, y: +n.y, h1: pt(n.h1), h2: pt(n.h2) })) : [];
      out.push(Object.assign({ id: typeof F.id === 'string' ? F.id : uid(), a, b, wire: true, path }, F.route === 'square' ? { route: 'square' } : {}, partHex(F.lineColour) ? { lineColour: partHex(F.lineColour) } : {}));   // its own colour, when given one
      continue;
    }
    if (!a || !b || used.has(pkey(...a)) || used.has(pkey(...b)) || pkey(...a) === pkey(...b)) continue;
    used.add(pkey(...a)); used.add(pkey(...b));
    const pt = v => Array.isArray(v) && v.length === 2 && v.every(isFinite) ? [+v[0], +v[1]] : [0, 0];
    const path = Array.isArray(F.path) ? F.path.filter(n => n && isFinite(n.x) && isFinite(n.y)).map(n => ({ x: +n.x, y: +n.y, h1: pt(n.h1), h2: pt(n.h2) })) : [];
    out.push({ id: typeof F.id === 'string' ? F.id : uid(), a, b, len: Math.max(0, num(F.len, 1)), loss: Math.max(0, num(F.loss, 0.2)),
      disp: F.disp !== null && F.disp !== undefined && isFinite(F.disp) ? +F.disp : null,
      gamma: F.gamma !== null && F.gamma !== undefined && isFinite(F.gamma) && +F.gamma >= 0 ? +F.gamma : null,    // 1/(W km); null: from n2 and the mode area
      // what it does to polarisation: kept (an ideal fibre held still), random (standard fibre as
      // laid: a fixed but unknown birefringence, drifting with wavelength), pm (polarisation
      // maintaining, key at an angle to s, with its beat length and extinction ratio), or mm
      // (multimode: scrambled)
      ftype: ['smf', 'random', 'pm', 'mm'].includes(F.ftype) ? F.ftype : 'smf',
      // its ends: spliced (no reflection), or connectors: PC, APC, or a flat cleave
      conn: CONNS[F.conn] ? F.conn : 'splice',
      key: num(F.key, 0), beat: Math.max(0.1, num(F.beat, 4)), per: clamp(num(F.per, 25), 0, 60), seed: Math.round(num(F.seed, 1)),
      path, ta: isFinite(F.ta) && F.ta !== null ? Math.max(0, +F.ta) : null, tb: isFinite(F.tb) && F.tb !== null ? Math.max(0, +F.tb) : null,
      // its own colour on the bench and in exports, when given one
      ...(partHex(F.lineColour) ? { lineColour: partHex(F.lineColour) } : {}),
      // wound round a radius (mm), turns times: its bend loss (core/bend.js)
      ...(isFinite(F.bendR) && F.bendR > 0 ? { bendR: clamp(+F.bendR, 1, 1000), turns: isFinite(F.turns) && F.turns > 0 ? clamp(+F.turns, 0.01, 1e5) : 1 } : {}),
      wg: F.wg ? PIC.normWg(F.wg) : undefined,                                               // PIC hook: a waveguide on a chip
      route: F.route === 'square' ? 'square' : undefined });                                  // laid square (render.js squarePts)
  }
  return out;
}

export let VSRC = new Map();                  // the sources fibre tips make, by id (see tipSources)
export function setVSRC(v) { return (VSRC = v); }
export const FIBRE_COLOUR = '#e86fa6';        // fibres and fibre ports, rose: yellow is the electronics'
export const getEl = id => project.elements.find(e => e.id === id) || VSRC.get(id);
/* every source: those on the benches, and those fibre tips make */
export const allSources = () => project.elements.filter(e => e.type === 'source').concat([...VSRC.values()]);
export const selected = () => selectedId ? getEl(selectedId) : null;

/* The source wavelengths on the bench, for readouts that depend on wavelength */
export function benchNms() {
  const v = [...new Set(project.elements.filter(e => e.type === 'source').flatMap(e => sourceLines(e)).map(x => +x.toFixed(2)))];
  return v.length ? v : [633];
}

export function lensKind(el) {
  if (el.graded) return 'GRIN lens';
  if (el.diffractive) return el.asphere ? 'Diffractive asphere' : 'Diffractive lens';
  if (el.asphere) return 'Asphere';
  return 'Lens';
}

/* the parts the 3D view can show: a bench with others on it cannot go to 3D */
export const FREE_3D = new Set(['source', 'detector', 'spectrometer', 'screen', 'fibre', 'mirror', 'lens', 'cube', 'waveplate', 'polariser', 'crystal', 'faraday', 'isolator',
  'stop', 'mask', 'filter', 'grating', 'prism', 'gain', 'cell', 'nlc', 'particle', 'aom', 'eom', 'chopper', 'link', 'stl', 'draw']);

/* fibre components, circuit parts and chips: in the 3D view on the table, the fibres, wires and waveguides between
   them laid as tubes (ui/view3d.js); the light of free space does not meet them */
export const NET_3D = new Set(['fcomp', 'elec', 'pic']);

export function loadProject(data) {
  hooks.view3dReset();        // another project: back to 2D, its views forgotten
  setLoadGen(loadGen + 1);
  if (!data || typeof data !== 'object') throw new Error('The file is not a ray tracer project.');
  if (data.format !== FORMAT) throw new Error('This file is not a .jekray project.');
  if (data.version > VERSION) throw new Error('This project was saved by a newer version of the ray tracer.');
  if (!Array.isArray(data.elements)) throw new Error('The project has no element list.');
  const p = {
    name: String(data.name || 'Untitled bench'),
    view: {
      cx: num(data.view && data.view.cx, 0), cy: num(data.view && data.view.cy, 0),
      scale: Math.min(ZOOM_MAX, Math.max(0.05, num(data.view && data.view.scale, 4))),
    },
    snap: num(data.snap, 1),
    maxBounces: Math.round(Math.min(100000, Math.max(1, num(data.maxBounces, 200)))),
    ghosts: data.ghosts === true,
    light: normLight(data.light, data.elements),
    minPower: Math.min(50, Math.max(1e-6, num(data.minPower, 0.1))),
    library: (Array.isArray(data.library) ? data.library : []).map(normMat).filter(m => m.table),
    cavityLock: data.cavityLock && typeof data.cavityLock === 'object' ? Object.fromEntries(Object.entries(data.cavityLock).filter(([, v]) => v === 'lock' || v === 'built')) : {},
    elements: [],
    mods: normCarried(data.mods),                  // the code of the mods its parts use: kept, never run from here
  };
  setProject(p);
  for (const e of data.elements) { const n = normElement(e); if (n) p.elements.push(n); }
  if (Array.isArray(data.benches) && data.benches.length) {
    const vw = v => ({ cx: num(v && v.cx, 0), cy: num(v && v.cy, 0), scale: Math.min(ZOOM_MAX, Math.max(0.05, num(v && v.scale, 4))) });
    p.benches = data.benches.filter(b => b && typeof b.id === 'string').map((b, i) => ({ id: b.id, name: String(b.name || 'Bench ' + (i + 1)).slice(0, 40), view: vw(b.view) }));
    p.tab = data.tab;
  } else p.benches = [{ id: 'b1', name: 'Bench 1', view: p.view }];
  ensureBenches(p);
  p.fibres = normFibres(data.fibres, p.elements);
  p.assemblies = normAssemblies(data.assemblies, p.elements);
  p.mates = normMates(data.mates, p.elements);                 // faces of parts held together (core/mates.js)
  p.measures = normMeasures(data.measures, p.benches);
  p.notes = typeof data.notes === 'string' ? data.notes.slice(0, 20000) : '';
  if (isFinite(data.labelMm) && data.labelMm > 0) p.labelMm = clamp(+data.labelMm, 1e-6, 1e4);     // parts' names, mm high
  if (data.labelFixed === true) { p.labelFixed = true; p.labelPx = isFinite(data.labelPx) ? clamp(Math.round(+data.labelPx), 6, 40) : 12; }   // or px on the screen
  // the bench's colour and its holes (View › Bench colour)
  const st = data.style && typeof data.style === 'object' ? data.style : {};
  p.style = {};
  if (typeof st.bg === 'string' && /^#[0-9a-f]{6}$/i.test(st.bg)) p.style.bg = st.bg.toLowerCase();
  if (st.holes === false) p.style.holes = false;
  hooks.benchStyleShown();      // after the page is set up, on first load
  return p;
}

/* a photodetector as the literature draws it: a semicircle, its flat side the active face towards the light */
export const detR = el => Math.max(el.length / 2 + 1.5, 4);

/* a source's body, in mm on the bench (so it zooms with everything else): its length, and its
   half-height, a little more than its beam's */
export const srcBody = el => ({ L: 20, hw: Math.max(el.width / 2, 2) + 1.5 });
