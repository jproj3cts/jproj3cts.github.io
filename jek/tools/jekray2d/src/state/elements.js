import { FORMAT, VERSION, ZOOM_MAX, clamp } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { normModRef } from '../core/modulators.js';
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

export function normSurface(s) {
  s = s || {};
  const R = (s.R === null || s.R === undefined || s.R === '' || !isFinite(s.R) || s.R === 0) ? null : +s.R;
  return {
    R, k: num(s.k, 0), a2: num(s.a2, 0),
    A: Array.isArray(s.A) ? s.A.map(Number).filter(isFinite) : [],
    odd: Array.isArray(s.odd) && s.odd.some(v => +v) ? s.odd.map(Number).filter(isFinite) : undefined,
    semi: (isFinite(s.semi) && s.semi > 0) ? +s.semi : null,
    coat: normCoat(s.coat),
  };
}
export function normElement(e) {
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
  const base = {
    id: typeof e.id === 'string' ? e.id : uid(),
    type: e.type,
    name: String(e.name || TYPE_LABEL[e.type] || 'Element'),
    x: num(e.x, 0), y: num(e.y, 0), angle: num(e.angle, 0),
    bench: typeof e.bench === 'string' ? e.bench : null,     // the tab it is on (ensureBenches fills it in)
  };
  if (e.locked === true) base.locked = true;                  // held in place: not moved by dragging or the arrow keys
  if (e.hide3d === true) base.hide3d = true;                  // not drawn in the 3D view (the light still meets it)
  // its height above the breadboard (mm), kept only when not the beam height (see zOf)
  if (isFinite(e.z) && e.z !== null && +e.z !== 75) base.z = clamp(+e.z, 0, 2000);
  // a free-space part tipped up (+) or down out of the bench plane, degrees (see setTip)
  if (isFinite(e.tip) && e.tip !== null && +e.tip !== 0 && tippable(base)) base.tip = clamp(+(+e.tip).toFixed(6), -90, 90);
  // and rolled about its own axis (the way it faces, or its optical axis), degrees (see setRoll)
  if (isFinite(e.roll) && e.roll !== null && +e.roll !== 0 && tippable(base)) base.roll = clamp(+(+e.roll).toFixed(6), -180, 180);
  if (typeof e.group === 'string' && e.group) base.group = e.group.slice(0, 40);     // one of a group, picked and moved together
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
    normElement({ type: 'source', name: 'HeNe 633 nm', x: -60, y: 0, angle: 0, wavelength: 632.8, width: 10, divergence: 0, rays: 15 }),
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
  };
}
export const lightOf = () => (project && project.light) || (project && (project.light = normLight(null, project.elements))) || { rays: true, envelope: true, field: false, scale: 'lin' };
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
    measures: project.measures || [],
    notes: project.notes || '',
    ...(project.labelMm > 0 ? { labelMm: project.labelMm } : {}),
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
      out.push({ id: typeof F.id === 'string' ? F.id : uid(), a, b, wire: true, path });
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
      wg: F.wg ? PIC.normWg(F.wg) : undefined });                                            // PIC hook: a waveguide on a chip
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
  if (el.surfaces.some(s => s.k !== 0 || s.a2 !== 0 || s.A.some(a => a !== 0))) return 'Aspheric lens';
  return 'Lens';
}

/* the parts the 3D view can show: a bench with others on it cannot go to 3D */
export const FREE_3D = new Set(['source', 'detector', 'screen', 'fibre', 'mirror', 'lens', 'cube', 'waveplate', 'polariser', 'crystal', 'faraday', 'isolator',
  'stop', 'mask', 'filter', 'grating', 'prism', 'gain', 'cell', 'nlc', 'aom', 'eom', 'chopper', 'link', 'stl', 'draw']);

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
  p.measures = normMeasures(data.measures, p.benches);
  p.notes = typeof data.notes === 'string' ? data.notes.slice(0, 20000) : '';
  if (isFinite(data.labelMm) && data.labelMm > 0) p.labelMm = clamp(+data.labelMm, 1e-6, 1e4);     // parts' names, mm high
  // the bench's colour and its holes (View › Bench colour)
  const st = data.style && typeof data.style === 'object' ? data.style : {};
  p.style = {};
  if (typeof st.bg === 'string' && /^#[0-9a-f]{6}$/i.test(st.bg)) p.style.bg = st.bg.toLowerCase();
  if (st.holes === false) p.style.holes = false;
  hooks.benchStyleShown();      // after the page is set up, on first load
  return p;
}
