import { refIndex } from './glass.js';
import { clamp } from './constants.js';
import { ffTurn } from './freeform.js';
import { normOrder, normPh } from './diffractive.js';
import { grH } from './gradient.js';
import { applyGrin, grinSlab } from './grin.js';
import { deg, normCoat, num, project } from '../state/project.js';

/* ---------- Assemblies: lenses and stops on one axis, designed together ----------
   An assembly is a group of ordinary parts on the bench (lenses, stops, windows) with a record of
   its own: a name, the conditions it is designed for, and which way the light goes through it. Its
   parts stay parts: the bench traces them as it always has, so making an assembly, or splitting
   one, changes nothing the light does. What the record adds is the view a lens designer works in:
   the parts as one sequence of surfaces along the axis (its prescription), read from them and
   written back to them.

   The record: { id: the group's id (its parts carry it as "group"), name, bench, ref: the id of the
   part whose facing sets the axis, rev: true when the light runs against that part's facing,
   cond: its design conditions }. Its parts are found by their group, so a record whose group has
   lost them all is dropped. */
export const ASM_FIELDS_MAX = 12, ASM_WAVES_MAX = 12;
export const asmKind = e => e.type === 'lens' ? 'lens' : e.type === 'mask' && e.grin ? 'grin' : e.type === 'stop' ? 'stop' : e.type === 'prism' && e.shape === 'window' ? 'window' : e.type === 'mirror' ? 'mirror' : null;

/* design conditions: the aperture (an entrance pupil diameter, mm, or an F-number), the fields
   (angles of the incoming light, degrees, each with a weight) and the wavelengths (nm, each with a
   weight, one of them primary) */
/* the conditions a design is for: its object (at infinity, or at a distance d before the first
   surface), its aperture (the entrance pupil's diameter, the working F-number in image space, or for a
   finite object the NA in object space), its fields (angles in degrees from infinity; object heights in
   mm for a finite object, kept in "deg" all the same) and its wavelengths */
export function normCond(c) {
  c = c && typeof c === 'object' ? c : {};
  const ob = c.object && typeof c.object === 'object' && c.object.kind === 'finite' ? { kind: 'finite', d: clamp(num(c.object.d, 100), 1e-3, 1e7) } : null;
  const ap = c.aperture && typeof c.aperture === 'object' ? c.aperture : {};
  const kind = ap.kind === 'fno' ? 'fno' : ap.kind === 'na' && ob ? 'na' : 'epd';
  const fields = (Array.isArray(c.fields) && c.fields.length ? c.fields : [{ deg: 0, w: 1 }]).slice(0, ASM_FIELDS_MAX)
    .map(f => ({ deg: ob ? clamp(num(f && f.deg, 0), -1e5, 1e5) : clamp(num(f && f.deg, 0), -89, 89), w: clamp(num(f && f.w, 1), 0, 1e3) }));
  const waves = (Array.isArray(c.waves) && c.waves.length ? c.waves : [{ nm: 587.56, w: 1 }]).slice(0, ASM_WAVES_MAX)
    .map(v => ({ nm: clamp(num(v && v.nm, 587.56), 100, 3e8), w: clamp(num(v && v.w, 1), 0, 1e3) }));
  return {
    ...(ob ? { object: ob } : {}),
    aperture: { kind, v: kind === 'fno' ? clamp(num(ap.v, 4), 0.2, 1e3) : kind === 'na' ? clamp(num(ap.v, 0.1), 1e-4, 0.99) : clamp(num(ap.v, 10), 1e-3, 1e5) },
    fields, waves, primary: Math.round(clamp(num(c.primary, 0), 0, waves.length - 1)),
  };
}
const cfmt = v => String(+(+v).toPrecision(5));
/* the conditions in a line: "an object 200 mm before it, NA 0.1, fields to 5 mm, 587.56 nm" */
export function condSummary(c) {
  const fin = c.object && c.object.kind === 'finite', fmax = Math.max(...c.fields.map(f => Math.abs(f.deg)));
  const ap = c.aperture.kind === 'fno' ? 'f/' + cfmt(c.aperture.v) : c.aperture.kind === 'na' ? 'NA ' + cfmt(c.aperture.v) + ' at the object' : cfmt(c.aperture.v) + ' mm entrance pupil';
  return (fin ? 'an object ' + cfmt(c.object.d) + ' mm before it, ' : 'light from infinity, ') + ap + ', fields to ' + cfmt(fmax) + (fin ? ' mm' : '°') + ', ' + c.waves.map(v => cfmt(v.nm)).join(', ') + ' nm';
}
/* ---------- An RF system's conditions (the RF designer's: ui/rf-workspace.js) ----------
   An assembly of RF parts is designed as a quasi-optical system: a feed horn's beam through its lenses and
   mirrors to what it is for. Its conditions: the design frequency and the band (GHz); the feed horn (its kind,
   aperture radius a and slant length L, mm) and the distance d from its aperture to the first vertex; and the
   goal after the last vertex: the beam collimated, focused to a waist of radius w at distance d, or taken in
   by a receiving horn whose aperture is at distance d. feed.id and goal.rx.id name the horns on the bench the
   conditions were taken from, which follow them. */
export const RF_HORN_KINDS = ['corrugated', 'smooth', 'diagonal', 'gauss'];
export const RF_GOALS = ['collimate', 'focus', 'couple'];
const horn = (h, a, L) => ({ kind: RF_HORN_KINDS.includes(h && h.kind) ? h.kind : 'corrugated', a: clamp(num(h && h.a, a), 0.05, 2000), L: clamp(num(h && h.L, L), 0.5, 1e5), ...(h && typeof h.id === 'string' ? { id: h.id } : {}) });
export function normRfCond(r) {
  r = r && typeof r === 'object' ? r : {};
  const ghz = clamp(num(r.ghz, 24), 1, 3000);
  let lo = clamp(num(r.lo, ghz * 0.9), 1, 3000), hi = clamp(num(r.hi, ghz * 1.1), 1, 3000);
  if (lo > hi) [lo, hi] = [hi, lo];
  lo = Math.min(lo, ghz); hi = Math.max(hi, ghz);
  const f = r.feed && typeof r.feed === 'object' ? r.feed : {}, g = r.goal && typeof r.goal === 'object' ? r.goal : {};
  const kind = RF_GOALS.includes(g.kind) ? g.kind : 'collimate';
  const goal = { kind, d: clamp(num(g.d, 300), 0, 1e6) };
  if (kind === 'focus') goal.w = clamp(num(g.w, 10), 0.01, 1e4);
  if (kind === 'couple') goal.rx = horn(g.rx, 15, 80);
  // the feed across the axis (mm, in the bench plane): aimed at the first vertex, unless pointed at a set angle (ang, degrees)
  const feed = Object.assign(horn(f, 15, 80), { d: clamp(num(f.d, 150), 0, 1e6), off: clamp(num(f.off, 0), -1e4, 1e4) });
  if (f.aim === false) { feed.aim = false; feed.ang = clamp(num(f.ang, 0), -89, 89); }
  return { ghz, lo, hi, feed, goal };
}
/* an RF design's configurations: the system in several states (a second band, a switched feed, another goal), each with its own
   conditions and its own values of the Element data keys listed (c:i, k:i, t:i, o:i, p:i); the active one's are the bench's. None
   with fewer than two. */
export const RF_MC_MAX = 8;
const RF_MC_KEY = k => typeof k === 'string' && /^[cktop]:\d+$/.test(k);
export function normRfMc(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.configs) || m.configs.length < 2) return null;
  const keys = Array.isArray(m.keys) ? [...new Set(m.keys.filter(RF_MC_KEY))].slice(0, 100) : [];
  const configs = m.configs.slice(0, RF_MC_MAX).map((c, i) => {
    c = c && typeof c === 'object' ? c : {};
    const v = {}, src = c.v && typeof c.v === 'object' ? c.v : {};
    for (const k of keys) if (k in src && isFinite(+src[k]) && src[k] !== null && src[k] !== '') v[k] = clamp(+src[k], -1e9, 1e9);
    return { name: String(c.name || 'Configuration ' + (i + 1)).slice(0, 40), w: clamp(num(c.w, 1), 0, 1e3), rf: normRfCond(c.rf), v };
  });
  return { keys, configs, active: Math.round(clamp(num(m.active, 0), 0, configs.length - 1)) };
}
export function normAssemblies(list, els) {
  const groups = new Set(els.filter(e => e.group).map(e => e.group)), out = [], seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a.id !== 'string' || !groups.has(a.id) || seen.has(a.id)) continue;
    seen.add(a.id);
    const ref = els.find(e => e.id === a.ref && e.group === a.id) || els.find(e => e.group === a.id && asmKind(e) === 'lens') || els.find(e => e.group === a.id);
    out.push({ id: a.id, name: String(a.name || 'Assembly').slice(0, 80), bench: ref.bench, ref: ref.id, rev: a.rev === true, ...(a.lock === true ? { lock: true } : {}), ...(isFinite(a.z) && a.z !== null ? { z: +a.z } : {}), cond: normCond(a.cond), ...(a.design ? { design: normDesign(a.design) } : {}), ...(a.kind === 'rf' ? { kind: 'rf', rf: normRfCond(a.rf), ...(a.rfTol && typeof a.rfTol === 'object' ? { rfTol: JSON.parse(JSON.stringify(a.rfTol)) } : {}), ...(a.rfOpt && typeof a.rfOpt === 'object' ? { rfOpt: JSON.parse(JSON.stringify(a.rfOpt)) } : {}), ...(normRfMc(a.rfMc) ? { rfMc: normRfMc(a.rfMc) } : {}) } : a.kind === 'optical' ? { kind: 'optical' } : {}) });
  }
  return out;
}

/* ---------- The design: what a lens designer sets around the prescription ----------
   (engines/lens-design.js works with it.) Kept on the record as "design": the image distance,
   the values an optimiser may change, solves and pickups, each value named by a key:
   "R:<part id>.<surface>", "k:...", "t:..." (the gap after that surface) or "t:image". */
/* a key: R (radius), k (conic), t (gap after), g (glass after), a4 … a16 (an even aspheric coefficient,
   A4 r⁴ …), or on a part's first surface T (its tilt, degrees) and D (its decentre, mm) in the plane of the fields,
   U and X the same out of it; f20 … f06 a freeform's term c_mn x^m y^n (core/freeform.js); p2 … p8 a diffractive
   face's phase term on ρ² … ρ⁸ (core/diffractive.js); n2 … n6 a graded glass's term on r² … r⁶, the glass after
   that surface (core/gradient.js) */
export const DESIGN_KEY = /^([RtkgTDUX]|a(?:4|6|8|10|12|14|16)|f(?:20|02|21|03|40|22|04|41|23|05|60|42|24|06)|p[2468]|n[246]):(.{1,120}\.\d+(?:~\d+)?)$/;
export const ASPH_ORDERS = [4, 6, 8, 10, 12, 14, 16];
const okKey = k => typeof k === 'string' && (k === 't:image' || DESIGN_KEY.test(k));
export const SOLVE_KINDS = {
  focus: { on: k => k === 't:image', label: 'Paraxial focus' },
  fno: { on: k => k[0] === 'R', label: 'F-number', v: 4 },
  edge: { on: k => k[0] === 't' && k !== 't:image', label: 'Edge thickness', v: 1 },
};
export function normDesign(d) {
  const fresh = !d || typeof d !== 'object';
  d = fresh ? {} : d;
  const vars = Array.isArray(d.vars) ? [...new Set(d.vars.filter(okKey))].slice(0, 500) : [];
  const solves = {}, pickups = {};
  const sv = d.solves && typeof d.solves === 'object' ? d.solves : fresh ? { 't:image': { kind: 'focus' } } : {};
  for (const k of Object.keys(sv).slice(0, 500)) {
    const s = sv[k], K = s && SOLVE_KINDS[s.kind];
    if (!okKey(k) || !K || !K.on(k)) continue;
    if (s.kind === 'focus') { solves[k] = { kind: 'focus' }; continue; }
    let v = clamp(num(s.v, K.v), -1e3, 1e3);
    if (s.kind === 'fno' && Math.abs(v) < 0.2) v = v < 0 ? -0.2 : 0.2;
    if (s.kind === 'edge') v = Math.max(0, v);
    solves[k] = { kind: s.kind, v };
  }
  const pk = d.pickups && typeof d.pickups === 'object' ? d.pickups : {};
  for (const k of Object.keys(pk).slice(0, 500)) {
    const p = pk[k];
    if (!okKey(k) || !p || !okKey(p.from) || p.from === k || p.from[0] !== k[0] || solves[k]) continue;
    pickups[k] = { from: p.from, scale: clamp(num(p.scale, 1), -1e3, 1e3), off: clamp(num(p.off, 0), -1e5, 1e5) };
  }
  const mc = normMc(d.mc);
  const found = normFound(d.found), lims = normLims(d.lims);
  return { image: clamp(num(d.image, 50), -1e5, 1e5), vars, solves, pickups, merit: normMerit(d.merit), tol: normTol(d.tol), ...(mc ? { mc } : {}), ...(found.length ? { found } : {}), ...(lims ? { lims } : {}) };
}
/* limits on values marked V: by key (and /nd or /vd for a model glass's), a least and a greatest, either or both */
export function normLims(L) {
  if (!L || typeof L !== 'object') return null;
  const out = {};
  for (const id of Object.keys(L).slice(0, 500)) {
    const m = L[id], [k, part] = id.split('/');
    if (!okKey(k) || (part !== undefined && part !== 'nd' && part !== 'vd') || !m || typeof m !== 'object') continue;
    const lo = m.lo === null || m.lo === undefined || m.lo === '' || !isFinite(+m.lo) ? null : clamp(+m.lo, -1e6, 1e6), hi = m.hi === null || m.hi === undefined || m.hi === '' || !isFinite(+m.hi) ? null : clamp(+m.hi, -1e6, 1e6);
    if (lo === null && hi === null) continue;
    out[id] = lo !== null && hi !== null && lo > hi ? { lo: hi, hi: lo } : Object.assign({}, lo !== null ? { lo } : {}, hi !== null ? { hi } : {});
  }
  return Object.keys(out).length ? out : null;
}
/* designs kept from a global search (or by hand): each its variables (key, which part of a model glass, which
   configuration) and their values, its merit when found, and when; ten at most, best first */
export function normFound(L) {
  if (!Array.isArray(L)) return [];
  const out = [];
  for (const f of L.slice(0, 10)) {
    if (!f || typeof f !== 'object' || !Array.isArray(f.vars) || !Array.isArray(f.x) || f.vars.length !== f.x.length || f.x.length > 500) continue;
    const vars = f.vars.map(v => v && okKey(v.k) ? { k: v.k, part: v.part === 'nd' || v.part === 'vd' ? v.part : null, cfg: Number.isInteger(v.cfg) && v.cfg >= 0 && v.cfg < 16 ? v.cfg : null } : null);
    if (vars.some(v => !v) || !f.x.every(v => isFinite(+v) && v !== null)) continue;
    out.push({ vars, x: f.x.map(v => clamp(+v, -1e9, 1e9)), merit: Math.max(0, num(f.merit, 0)), t: Math.max(0, Math.round(num(f.t, 0))), ...(f.by === 'hand' ? { by: 'hand' } : {}) });
  }
  return out.sort((a, b) => a.merit - b.merit);
}
/* configurations: the same design in several states (a zoom's positions, a lens refocused for nearer
   objects), each its own values for the keys listed (radii, conics, aspheric terms, gaps, the image
   distance, tilts, decentres) and for a finite object its own distance; a weight in the merit
   function; a name. One is active: its values are the ones on the bench. None with fewer than two. */
export const MC_MAX = 16;
const MC_KEY = k => okKey(k) && k[0] !== 'g';
export function normMc(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.configs) || m.configs.length < 2) return null;
  const keys = Array.isArray(m.keys) ? [...new Set(m.keys.filter(MC_KEY))].slice(0, 100) : [];
  const configs = m.configs.slice(0, MC_MAX).map((c, i) => {
    c = c && typeof c === 'object' ? c : {};
    const v = {}, src = c.v && typeof c.v === 'object' ? c.v : {};
    for (const k of keys) if (k in src) { const x = src[k]; if (x === null && k[0] === 'R') v[k] = null; else if (isFinite(+x) && x !== null && x !== '') v[k] = clamp(+x, -1e9, 1e9); }
    return { name: String(c.name || 'Configuration ' + (i + 1)).slice(0, 40), w: clamp(num(c.w, 1), 0, 1e3), v, ...(c.obj !== undefined && isFinite(+c.obj) && +c.obj > 0 ? { obj: clamp(+c.obj, 1e-3, 1e7) } : {}) };
  });
  return { keys, configs, active: Math.round(clamp(num(m.active, 0), 0, configs.length - 1)) };
}
/* the merit function: the image term (what is measured, over how many pupil rings and arms), the
   boundaries every design keeps to, and the operands added to it, each with a target and a weight */
/* tolerances: for each kind, whether it is applied and how large (radius in fringes at 632.8 nm over
   the clear aperture, thickness and gaps in mm, element decentre in mm, element tilt in arcminutes,
   index as a change in n, Abbe number in per cent); the image refocused or not; Monte Carlo's
   statistics, trials and seed */
export const TOL_KINDS = { rad: 3, thk: 0.05, dec: 0.025, tilt: 1, ind: 0.001, abbe: 0.5, irr: 1, wedge: 1, sdec: 0.01 };
const TOL_OFF = { irr: true, wedge: true, sdec: true };              // kinds off until turned on
export function normTol(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const [k, v] of Object.entries(TOL_KINDS)) { const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { on: x.on === undefined ? !TOL_OFF[k] : x.on !== false, v: clamp(num(x.v, v), 0, 1e3) }; }
  out.comp = o.comp !== false;
  out.dist = o.dist === 'normal' ? 'normal' : 'uniform';
  // what a lens tilts about: its mechanical reference (its first vertex, its centre along the axis, or its last vertex)
  out.pivot = o.pivot === 'centre' || o.pivot === 'last' ? o.pivot : 'first';
  out.trials = Math.round(clamp(num(o.trials, 200), 10, 5000));
  out.seed = Math.round(clamp(num(o.seed, 1), 1, 1e9));
  // the worsening inverse sensitivity allows: a share of the nominal criterion (%), or an amount of it (mm, or waves)
  const iv = o.inv && typeof o.inv === 'object' ? o.inv : {};
  out.inv = iv.by === 'abs' ? { by: 'abs', v: clamp(num(iv.v, 0.001), 1e-9, 1e3) } : { by: 'pct', v: clamp(num(iv.v, 10), 0.01, 1e4) };
  // compensators beyond the focus: an air gap (i, the gap's index), a lens's decentre or tilt (i, the part's index; axis x or y), each within ± range
  const cs = Array.isArray(o.comps) ? o.comps : [], comps = [];
  for (const c of cs.slice(0, 20)) {
    if (!c || !['gap', 'dec', 'tilt'].includes(c.kind) || !Number.isInteger(c.i) || c.i < 0 || c.i > 500) continue;
    if (c.kind !== 'gap' && c.axis !== 'x' && c.axis !== 'y') continue;
    const m = { kind: c.kind, i: c.i, ...(c.kind !== 'gap' ? { axis: c.axis } : {}), range: clamp(num(c.range, c.kind === 'tilt' ? 10 : 0.5), 1e-6, 1e4) };
    if (!comps.some(q => q.kind === m.kind && q.i === m.i && q.axis === m.axis)) comps.push(m);
  }
  if (comps.length) out.comps = comps;
  // the yield's specification: the criterion at most crit (mm, or waves), and merit operands (by index) within lo to hi
  const yv = o.yield && typeof o.yield === 'object' ? o.yield : {}, specs = [];
  for (const sp of Array.isArray(yv.specs) ? yv.specs.slice(0, 40) : []) {
    if (!sp || !Number.isInteger(sp.j) || sp.j < 0 || sp.j > 200) continue;
    const lo = sp.lo === null || sp.lo === undefined || sp.lo === '' || !isFinite(+sp.lo) ? null : +sp.lo, hi = sp.hi === null || sp.hi === undefined || sp.hi === '' || !isFinite(+sp.hi) ? null : +sp.hi;
    if (lo === null && hi === null) continue;
    if (!specs.some(q => q.j === sp.j)) specs.push(lo !== null && hi !== null && lo > hi ? { j: sp.j, lo: hi, hi: lo } : { j: sp.j, lo, hi });
  }
  const yc = yv.crit === null || yv.crit === undefined || yv.crit === '' || !isFinite(+yv.crit) || +yv.crit <= 0 ? null : +yv.crit;
  if (yc !== null || specs.length) out.yield = { crit: yc, specs };
  return out;
}
export const MERIT_OPS = ['EFL', 'FNO', 'TTL', 'DIST', 'SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT', 'BFL', 'IMD', 'MAG', 'NA', 'XPD', 'IMH', 'CRA', 'RAYY', 'MTFT', 'MTFS', 'MTFA'];
/* the terms that are measured at one of the design's fields (f, its index), at a point of the pupil (p, -1 to 1),
   and at a spatial frequency (v, cycles/mm) */
export const MERIT_AT_FIELD = ['IMH', 'CRA', 'RAYY', 'MTFT', 'MTFS', 'MTFA'], MERIT_AT_PUPIL = ['RAYY'], MERIT_AT_FREQ = ['MTFT', 'MTFS', 'MTFA'];
export function normMerit(m) {
  m = m && typeof m === 'object' ? m : {};
  const b = m.bounds && typeof m.bounds === 'object' ? m.bounds : {};
  return {
    crit: ['spot', 'chief', 'wfe'].includes(m.crit) ? m.crit : 'spot',
    rings: Math.round(clamp(num(m.rings, 3), 1, 4)), arms: [4, 6, 8, 12].includes(+m.arms) ? +m.arms : 6,
    bounds: { glassMin: clamp(num(b.glassMin, 1), 0, 1e3), glassMax: clamp(num(b.glassMax, 0), 0, 1e4), edgeMin: clamp(num(b.edgeMin, 0.5), 0, 1e3), airMin: clamp(num(b.airMin, 0.1), 0, 1e3),
      aspMax: clamp(num(b.aspMax, 0.5), 0, 1e3), slopeMax: clamp(num(b.slopeMax, 0), 0, 89) },
    ops: (Array.isArray(m.ops) ? m.ops : []).filter(o => o && MERIT_OPS.includes(o.op)).slice(0, 50)
      .map(o => ({ op: o.op, target: clamp(num(o.target, 0), -1e6, 1e6), weight: clamp(num(o.weight, 1), 0, 1e6),
        ...(MERIT_AT_FIELD.includes(o.op) ? { f: Math.round(clamp(num(o.f, ASM_FIELDS_MAX - 1), 0, ASM_FIELDS_MAX - 1)) } : {}),
        ...(MERIT_AT_PUPIL.includes(o.op) ? { p: clamp(num(o.p, 1), -1, 1) } : {}),
        ...(MERIT_AT_FREQ.includes(o.op) ? { v: clamp(num(o.v, 50), 0, 1e5) } : {}),
        // in one configuration only (its index), or in every one (none)
        ...(o.c !== undefined && o.c !== null && isFinite(+o.c) && +o.c >= 0 ? { c: Math.round(clamp(+o.c, 0, MC_MAX - 1)) } : {}) })),
  };
}
/* a design's keys with part ids changed (an assembly pasted as a copy) */
export function remapDesign(d, map) {
  const k2 = k => { const m = DESIGN_KEY.exec(k); if (!m) return k; const j = m[2].lastIndexOf('.'), id = m[2].slice(0, j); return map.has(id) ? m[1] + ':' + map.get(id) + m[2].slice(j) : k; };
  const o = {};
  if (!d || typeof d !== 'object') return d;
  o.image = d.image;
  o.vars = (d.vars || []).map(k2);
  o.solves = Object.fromEntries(Object.entries(d.solves || {}).map(([k, v]) => [k2(k), v]));
  o.pickups = Object.fromEntries(Object.entries(d.pickups || {}).map(([k, v]) => [k2(k), Object.assign({}, v, { from: k2(v.from) })]));
  if (d.merit) o.merit = d.merit;
  if (d.tol) o.tol = d.tol;
  if (d.mc && Array.isArray(d.mc.configs)) o.mc = { keys: (d.mc.keys || []).map(k2), active: d.mc.active,
    configs: d.mc.configs.map(c => Object.assign({}, c, { v: Object.fromEntries(Object.entries(c.v || {}).map(([k, v]) => [k2(k), v])) })) };
  return o;
}

export const assemblies = () => (project.assemblies || []).filter(a => project.elements.some(e => e.group === a.id));
export const asmOf = el => (el && el.group ? (project.assemblies || []).find(a => a.id === el.group) || null : null);
export const asmMembers = asm => project.elements.filter(e => e.group === asm.id);
/* the assembly a selection is, whole: every one of its parts and nothing else */
export function asmOfSelection(list) {
  if (!list.length) return null;
  const a = asmOf(list[0]);
  if (!a) return null;
  const m = asmMembers(a);
  return m.length === list.length && list.every(e => e.group === a.id) ? a : null;
}

/* ---------- Can these parts be one assembly? ----------
   Lenses (round about their axes, not cylinders), round stops, windows and mirrors (flat or curved,
   whole or an offset section of a parent), at one height and upright, along one axis that a mirror folds. The
   axis is walked from the part whose facing sets it, forward along the light and back against it:
   each part next along the axis is the nearest ahead within its own half-width of it; at a mirror
   the axis turns as the light does. A part may sit off the axis (decentred) by less than its
   half-width and turn from it (tilted) by up to 30°; a mirror may turn it any way that sends the light
   on. The light runs along the axis away from a source on it; with none, the way most lenses face. */
const ang = a => ((a % 360) + 360) % 360;
const sameAng = (a, b, tol) => { const d = ang(a - b); return Math.min(d, 360 - d) <= tol; };
const TILT_MAX = 30;
const halfW = e => e.type === 'lens' ? e.diameter / 2 : e.type === 'mask' ? e.length / 2 : e.type === 'stop' ? (e.outer || e.aperture) / 2 : e.type === 'mirror' ? e.length / 2 : e.size / 2;
const v2 = deg2 => [Math.cos(deg2 * deg), Math.sin(deg2 * deg)];
const lperp = d => [-d[1], d[0]];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const refl2 = (d, n) => { const k = 2 * dot2(d, n); return [d[0] - k * n[0], d[1] - k * n[1]]; };
/* the angle from d to a, signed (anticlockwise positive), degrees */
const angFrom = (d, a) => Math.atan2(d[0] * a[1] - d[1] * a[0], dot2(d, a)) / deg;
/* the part's axis as the light meets it: a lens either way round, a mirror's surface normal through it */
const partAxis = e => v2(e.angle);
/* walk from point q along d through the parts not yet used: each the nearest ahead within its half-width of the line */
function walkAxis(q, d, pool) {
  const out = [];
  for (let guard = 0; guard < 400 && pool.size; guard++) {
    let best = null, bt = Infinity;
    for (const e of pool) {
      const r = [e.x - q[0], e.y - q[1]], t = dot2(r, d), off = Math.abs(dot2(r, lperp(d)));
      if (t > -1e-6 && off <= Math.max(1e-3, halfW(e)) + 1e-9 && t < bt) { bt = t; best = e; }
    }
    if (!best) break;
    pool.delete(best);
    out.push({ e: best, q, d });
    if (asmKind(best) === 'mirror') {
      // the axis turns where it meets the mirror's plane
      const n = v2(best.angle), den = dot2(d, n), t = Math.abs(den) > 1e-12 ? dot2([best.x - q[0], best.y - q[1]], n) / den : bt;
      q = [q[0] + d[0] * t, q[1] + d[1] * t]; d = refl2(d, n);
    } else {
      // a lens whose mirrored faces send the light back: the axis turns at the face it leaves by
      const LF = lensFoldOf(best, dot2(partAxis(best), d) < 0);
      if (LF && LF.folds) { const t = bt - LF.T / 2 + LF.exitAlong; q = [q[0] + d[0] * t, q[1] + d[1] * t]; d = [-d[0], -d[1]]; }
    }
  }
  return out;
}
const lensFolds = (e, d) => { const LF = e.type === 'lens' ? lensFoldOf(e, dot2(partAxis(e), d) < 0) : null; return !!(LF && LF.folds); };
export function asmCheck(els, opts) {
  opts = opts || {};
  const name = e => e.name || e.type;
  if (els.length < (opts.min || 1)) return { ok: false, why: 'Select a part to design: a lens, a mirror or a window, with any others on its axis.' };
  const bad = els.find(e => !asmKind(e));
  if (bad) return { ok: false, why: name(bad) + ' can’t be in an assembly: only lenses, mirrors, stops and windows on one axis can (leave out sources, screens and the rest).' };
  if (els.some(e => e.bench !== els[0].bench)) return { ok: false, why: 'The parts are on different tabs.' };
  const lenses = els.filter(e => asmKind(e) !== 'stop');
  if (!lenses.length) return { ok: false, why: 'An assembly needs at least one lens, mirror or window.' };
  // a cylindrical lens: its power in the bench's plane or out of it, as its shape says (not rolled about its axis)
  const cyl = els.find(e => e.type === 'lens' && e.cyl && e.roll);
  if (cyl) return { ok: false, why: name(cyl) + ' is a cylindrical lens rolled about its axis: in an assembly a cylinder’s power is in the bench’s plane or out of it, as its Shape sets.' };
  const stopOdd = els.find(e => e.type === 'stop' && (e.shape !== 'round' || e.offset));
  if (stopOdd) return { ok: false, why: name(stopOdd) + ' is not a round iris on the axis: an assembly’s stop is round.' };
  const seg = els.find(e => e.type === 'mirror' && e.film);
  if (seg) return { ok: false, why: name(seg) + ' is a film beam splitter: an assembly’s mirrors reflect all they get.' };
  // out of the plane: a lens or a window may be tipped (within the same limit as a tilt across) and any part
  // raised or lowered from the others by less than its own half-width; a mirror folds in the bench's plane only
  const zOf = e => e.z === undefined ? 75 : e.z, halfOf = e => e.type === 'lens' ? e.diameter / 2 : e.type === 'mask' ? e.length / 2 : e.type === 'mirror' ? e.length / 2 : e.type === 'stop' ? Math.max(e.aperture / 2, 1) : (e.size || 10) / 2;
  for (const e of els) {
    if (e.tip && asmKind(e) !== 'lens' && asmKind(e) !== 'window') return { ok: false, why: name(e) + ' is tipped out of the plane: in an assembly only a lens or a window may be.' };
    if (e.tip && Math.abs(e.tip) > TILT_MAX + 1e-9) return { ok: false, why: name(e) + ' is tipped ' + (+Math.abs(e.tip).toPrecision(3)) + '° out of the plane: an assembly’s parts face along its axis, within ' + TILT_MAX + '°.' };
  }
  const zMid = zOf(els.find(e => asmKind(e) !== 'stop') || els[0]);
  for (const e of els) if (Math.abs(zOf(e) - zMid) >= halfOf(e)) return { ok: false, why: name(e) + ' is at another height from ' + name(els[0]) + ', by more than its own half-width.' };
  const refl = lenses.filter(e => asmKind(e) !== 'mirror');
  const ref = opts.ref ? els.find(e => e.id === opts.ref) || refl[0] || lenses[0] : refl[0] || lenses[0];
  // which way the light runs along the reference's axis: away from a source on it, else the way most lenses face
  const a0 = ref.angle, d0 = asmKind(ref) === 'mirror' ? v2(a0 + 180) : v2(a0);
  let rev = opts.rev;
  if (rev === undefined) {
    const srcs = (opts.sources || []).filter(s => s.bench === ref.bench && Math.abs(dot2([s.x - ref.x, s.y - ref.y], lperp(d0))) < halfW(ref))
      .sort((p, q) => Math.hypot(p.x - ref.x, p.y - ref.y) - Math.hypot(q.x - ref.x, q.y - ref.y));
    if (srcs.length) rev = dot2([srcs[0].x - ref.x, srcs[0].y - ref.y], d0) > 0;
    else { const turned = refl.filter(e => !sameAng(e.angle, a0, 1e-6)).length; rev = 2 * turned > refl.length; }
  }
  const D = rev ? [-d0[0], -d0[1]] : d0;
  // the chain: back against the light from the reference, then on from it
  const pool = new Set(els.filter(e => e !== ref));
  const back = walkAxis([ref.x, ref.y], [-D[0], -D[1]], pool).reverse().map(c => ({ e: c.e, d: [-c.d[0], -c.d[1]] }));
  const fwd = walkAxis([ref.x, ref.y], D, pool);
  if (pool.size) { const e = [...pool][0]; return { ok: false, why: name(e) + ' is off the axis of the assembly (more than its half-width from it, or behind a mirror the light leaves). Line it up first.' }; }
  // the light's direction at each part: for those met going back, the direction the light runs there
  const chain = [...back.map(c => ({ e: c.e, d: c.d })), { e: ref, d: D }, ...fwd.map(c => ({ e: c.e, d: c.d }))];
  for (let i = 0; i < chain.length; i++) {
    const { e } = chain[i], d = chain[i].d, k = asmKind(e);
    if (k === 'mirror') {
      // the light must meet its reflecting face
      if (dot2(v2(e.angle), d) >= -1e-9) return { ok: false, why: name(e) + ' faces away from the light along the axis: it must face the light it reflects.' };
      continue;
    }
    const a = partAxis(e), t = Math.abs(angFrom(d, a)), tilt = Math.min(t, 180 - t);
    if (tilt > TILT_MAX + 1e-9) return { ok: false, why: name(e) + ' faces another way from the axis (by ' + (+tilt.toPrecision(3)) + '°): an assembly’s parts face along its axis, within ' + TILT_MAX + '°.' };
  }
  // (parts may overlap along the axis: a negative gap in the design puts one behind the one before)
  const folded = chain.some(c => asmKind(c.e) === 'mirror' || lensFolds(c.e, c.d));
  return { ok: true, ref: ref.id, rev, order: chain.map(c => c.e.id), dirs: chain.map(c => c.d), folded };
}

/* ---------- The prescription: the parts as one sequence of surfaces ----------
   Along the light, from the first surface's vertex: each surface's shape (R, conic k, a2, the even
   terms A, the odd terms), its clear radius, the gap to the next along the axis and the material in
   that gap (air between parts), the stop as a flat surface in air, a mirror as a reflecting surface.
   Each surface remembers which part, and which of its surfaces, it came from, so changes can be
   written back. A lens turned against the light is read face for face the other way round, each sag
   of the other sign. A part off the axis or turned from it carries its decentre and tilt (dec, tilt)
   on its surfaces, about its first vertex; a mirror its tilt to the axis, which folds it. The bench
   plane is the plane of the fields (the engine's y-z plane); after each mirror the image of the
   bench is reflected, so the sense of y (and of a tilt) turns over. A mirror's radius is read in the
   prescription's convention (positive: centre beyond it, away from the light), the other sign to the
   bench's. */
/* the assembly's axis height above the bench: its own, or its reference part's (a part off it is decentred out of the plane) */
export function asmAxisZ(asm, els) {
  if (asm && isFinite(asm.z)) return asm.z;
  els = els || (asm ? asmMembers(asm) : []);
  const ref = asm && els.find(e => e.id === asm.ref) || els[0];
  return ref && ref.z !== undefined ? ref.z : 75;
}
/* out of the plane: the engine's x is up (the bench's z), and a part tipped up turns its own axis up */
const OUT_Z = 1, OUT_TIP = 1;
// a freeform's terms in the prescription: y across as the engine has it, for a lens and for a mirror (as its part has it, times these)
const FF_SY_LENS = 1, FF_SY_MIRROR = -1;
// (a diffractive face's phase is the same read either way: it bends light toward its axis whichever way it comes)
/* ---------- The light's path through a lens with stacked or mirror-coated surfaces ----------
   A face is the stack of the surfaces sharing a vertex (a gap of 0 between them); each member applies between its
   hole and its clear radius. A marginal ray is followed paraxially from stack to stack: at each it meets the member
   whose annulus holds its height (none: through every hole it goes on to the next stack; beyond every edge it is
   lost), reflects at a mirror coating or refracts, and goes on. Several heights are tried and the path with most
   meetings is the design's (a solid telescope's: in round the spot, off the annulus, off the spot, out through the
   centre). Each meeting is a row of the prescription, with the member's clear radius and its hole as a central
   obscuration, so the rays the real surface would not take are vignetted; a surface met again is linked to its
   first row (link: the row it copies, flipped when met from the other side), and a gap crossed again to the row
   first crossing it (glink). An odd number of reflections sends the light back the way it came, and the lens folds
   the axis as a mirror does. */
export const PATH_VISITS_MAX = 10;
export function lensPath(S2, G2, N2, h0) {
  const n = S2.length, zs = [0]; for (const g of G2) zs.push(zs[zs.length - 1] + g);
  const stacks = []; S2.forEach((s, i) => { if (!i || G2[i - 1] !== 0) stacks.push({ z: zs[i], m: [i] }); else stacks[stacks.length - 1].m.push(i); });
  const lastOf = st => st.m[st.m.length - 1], nBefore = k => (k === 0 ? 1 : N2[lastOf(stacks[k - 1])]), nAfter = k => (k === stacks.length - 1 ? 1 : N2[lastOf(stacks[k])]);
  const semiMax = Math.max(...stacks[0].m.map(i => S2[i].semi));
  const tryH = h => {
    const out = []; let k = 0, dir = 1, y = h, u = 0, nn = 1;
    for (let guard = 0; guard < PATH_VISITS_MAX && k >= 0 && k < stacks.length; guard++) {
      const st = stacks[k], r = Math.abs(y);
      const j = st.m.filter(i => r >= (S2[i].hole || 0) - 1e-9 && r <= S2[i].semi + 1e-9).sort((a, b) => (S2[a].semi - (S2[a].hole || 0)) - (S2[b].semi - (S2[b].hole || 0)))[0];   // the narrowest member holding the height
      if (j === undefined) { if (!st.m.every(i => r < (S2[i].hole || 0))) break; }     // beyond every member: lost; through every hole: on
      else {
        const s = S2[j], c = s.c * dir;                                                   // the curvature as the light meets it
        if (s.mirror) { out.push({ j, dir, role: 'mirror' }); u += 2 * c * y; dir = -dir; }
        else { const n2 = dir > 0 ? nAfter(k) : nBefore(k); out.push({ j, dir, role: 'refract' }); u = (nn * u - (n2 - nn) * c * y) / n2; nn = n2; }
      }
      const k2 = k + dir; if (k2 < 0 || k2 >= stacks.length) break;
      y += u * Math.abs(stacks[k2].z - st.z); k = k2;
    }
    return out;
  };
  // heights across the first face, and across the design's own aperture where that is smaller (so what the design's rays
  // do weighs double): the design's path is the one most of them take, among those that go into the glass (a path that only reflects off the front never entered); then the
  // one with most meetings; between paths as good, the one nearest the axis (a face whose centre is stacked: the design
  // follows the centre, as a paraxial design does)
  const FR = [0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.08], hs = FR.map(f => semiMax * f); if (h0 > 0 && h0 < semiMax) hs.push(...FR.map(f => h0 * f));
  // and just inside each edge of the first face's members, where a narrow way in (an annulus round a small secondary) is found
  for (const i of stacks[0].m) { if (S2[i].hole > 0) hs.push(S2[i].hole * 1.02); if (S2[i].semi < semiMax) hs.push(S2[i].semi * 0.98); }
  const votes = new Map();
  for (const h of hs) { const p = tryH(h), key = p.map(x => x.j + (x.role === 'mirror' ? 'm' : 'r') + (x.dir > 0 ? '' : '-')).join(','); const v = votes.get(key) || { p, n: 0, h }; v.n++; v.h = Math.min(v.h, h); votes.set(key, v); }
  const entered = p => p.length > 0 && p[0].role === 'refract', mirrors = p => new Set(p.filter(x => x.role === 'mirror').map(x => x.j)).size;
  // among the paths that go into the glass, the one that uses most of the lens's mirror-coated surfaces (what they are there
  // for: a secondary too small for the rays' edge is still the design's), the shortest of those (no bouncing between them), then the one most heights take, then the nearest the axis
  const best = [...votes.values()].sort((a, b) => (entered(b.p) - entered(a.p)) || (mirrors(b.p) - mirrors(a.p)) || (a.p.length - b.p.length) || (b.n - a.n) || (a.h - b.h))[0];
  const visits = best ? best.p : [];
  const folds = visits.filter(x => x.role === 'mirror').length % 2 === 1;
  let inside = 0; for (let q = 1; q < visits.length; q++) inside += Math.abs(zs[visits[q].j] - zs[visits[q - 1].j]);
  return { visits, folds, inside, exit: visits.length ? visits[visits.length - 1].j : 0, zs, stacks, plain: visits.length === n && visits.every((x, q) => x.j === q && x.role === 'refract') };
}
/* does the light's way through this lens need following (a mirror coating, or surfaces stacked)? */
export const lensPathed = e => e.type === 'lens' && (e.surfaces.some(s => s.coat && s.coat.mode === 'mirror') || e.gaps.some(g => g === 0));
/* a bench lens as the light meets it (flip: against its own facing): whether it folds the axis, and where the light leaves it */
export function lensFoldOf(e, flip) {
  if (!lensPathed(e)) return null;
  let S2 = e.surfaces.map(s => ({ semi: s.semi || e.diameter / 2, hole: s.hole || 0, mirror: !!(s.coat && s.coat.mode === 'mirror'), c: s.R ? 1 / s.R : 0 })), G2 = e.gaps.slice(), N2 = e.materials.map(m => refIndex(m, 587.56));
  if (flip) { S2 = S2.slice().reverse().map(s => Object.assign({}, s, { c: -s.c })); G2 = G2.slice().reverse(); N2 = N2.slice().reverse(); }
  const V = lensPath(S2, G2, N2, 0);
  return { folds: V.folds, exitAlong: V.zs[V.exit], inside: V.inside, T: V.zs[V.zs.length - 1] };
}
const flipSurf = s => ({ R: s.R === null ? null : -s.R, k: s.k, a2: -s.a2, A: s.A.map(v => -v), odd: s.odd ? s.odd.map(v => -v) : null, F: ffTurn(s.F, -1, -1), ...(s.cyl ? { cyl: s.cyl } : {}), ...(s.ph ? { ph: s.ph.slice(), dm: s.dm } : {}) });
export function asmPrescription(asm, els) {
  els = els || asmMembers(asm);
  const C = asmCheck(els, { ref: asm.ref, rev: asm.rev, min: 1 });
  const byId = new Map(els.map(e => [e.id, e]));
  const order = C.ok ? C.order.map(id => byId.get(id)) : els;
  const ref = els.find(e => e.id === asm.ref) || els[0];
  // the first straight run's axis: through the first part, the light's way there
  const first = order[0];
  let d = firstDir(order, ref, asm);
  // the axis: a point on it and its direction, walked part by part; along: the unfolded distance from the start
  let q = [first.x, first.y], hand = 1, along = 0;
  const surfaces = [], gaps = [], materials = [], parts = [];
  let lastAx = null;                 // the unfolded distance of the axis point of the last surface so far
  const zA = asmAxisZ(asm, els);
  order.forEach((e, idx) => {
    const kind = asmKind(e), r = [e.x - q[0], e.y - q[1]], t = dot2(r, d), off = hand * dot2(r, lperp(d));
    let S2, G2, M2, flip = false, tilt = 0, T = 0, secN = null, lensFold = null, pathed = false;
    if (kind === 'stop') { S2 = [{ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.aperture / 2, stop: true, from: { id: e.id, i: 0 } }]; G2 = []; M2 = []; }
    else if (kind === 'mirror') {
      // its normal through it (away from the light): the axis of its own frame, about which the axis folds. An offset
      // reflector folds the axis about its normal at the section's centre (the way a feed at the focus is sent out along the
      // facing); its face is the parent's, the parent's axis turned from that normal (dtilt) and its vertex off the axis (dec,
      // below), so the rays meet the section as it is cut
      const sec = e.offset && e.R ? mirrorSection(e, d, hand) : null;
      const thr = sec ? sec.n : v2(e.angle + 180);
      if (sec) secN = sec.n;
      tilt = hand * angFrom(d, thr);
      S2 = [{ R: e.R === null ? null : -e.R, k: e.k || 0, a2: 0, A: (e.A || []).map(v => -v), odd: null, F: ffTurn(e.F, FF_SY_MIRROR, -1), semi: e.length / 2, mirror: true, from: { id: e.id, i: 0 },
        ...(sec ? { sec: sec.sec, dtilt: [wrap180(hand * angFrom(d, v2(e.angle + 180)) - tilt) * deg, 0] } : {}) }]; G2 = []; M2 = [];
    } else {
      const a = partAxis(e);
      flip = dot2(a, d) < 0;
      const ax = flip ? [-a[0], -a[1]] : a;
      tilt = hand * angFrom(d, ax);
      if (kind === 'lens') {
        // a cylinder: its power across (y, in the bench's plane) or up (x, out of it)
        const cl = e.cyl ? (e.cyl === 'plane' ? 'y' : 'x') : null;
        S2 = e.surfaces.map((s, i) => ({ R: s.R, k: s.k, a2: s.a2, A: s.A.slice(), odd: s.odd ? s.odd.slice() : null, F: ffTurn(s.F, FF_SY_LENS, 1), ...(cl ? { cyl: cl } : {}),
          // a diffractive lens's faces carry their phase (all four terms, so each can be set), in its order
          ...(e.diffractive ? { ph: [0, 1, 2, 3].map(j => (s.ph && s.ph[j]) || 0), dm: normOrder(e.diffOrder) } : {}), semi: s.semi || e.diameter / 2, from: { id: e.id, i },
          // where the surface is and what it does: its hole, its coating (a mirror coating reflects)
          hole: s.hole || 0, coat: s.coat ? Object.assign({}, s.coat) : undefined, mcoat: !!(s.coat && s.coat.mode === 'mirror') }));
        G2 = e.gaps.slice();
        // a graded lens's glass keeps its terms, and the step its rays take in it (as the bench's do); another's is plain
        M2 = e.materials.map(m => { const c = Object.assign({}, m); if (e.graded) { if (m.grad) c.grad = m.grad.slice(); c.gh = grH(e.diameter); } else delete c.grad; return c; });
      } else if (kind === 'grin') {
        // a graded-index RF disc: a slab graded as its design's path (core/grin.js grinSlab); its focal length on its first face
        const G = grinSlab(e.grin, e.length);
        S2 = [0, 1].map(i => ({ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.length / 2, from: { id: e.id, i }, ...(i ? {} : { grin: { f: e.grin.f } }) }));
        G2 = [G ? G.T : 1]; M2 = [G ? { glass: e.grin.mat, dn: G.dn, grad: G.grad.slice(), gh: grH(e.length) } : { glass: e.grin.mat }];
      } else {
        S2 = [0, 1].map(i => ({ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.size / 2, from: { id: e.id, i } }));
        G2 = [e.thickness]; M2 = [Object.assign({}, e.material)];
      }
      if (flip) { S2 = S2.reverse().map(s => Object.assign(flipSurf(s), { semi: s.semi, from: s.from, hole: s.hole, coat: s.coat, mcoat: s.mcoat })); G2.reverse(); M2.reverse(); }
      T = G2.reduce((u, v) => u + v, 0);
      // a lens with a mirror coating or stacked surfaces: its surfaces as the light meets them, each meeting an entry (lensPath)
      if (kind === 'lens' && (S2.some(s => s.mcoat) || G2.some(g => g === 0))) {
        pathed = true;
        const nm = asm.cond && asm.cond.waves && asm.cond.waves[asm.cond.primary] ? asm.cond.waves[asm.cond.primary].nm : 587.56, ap = asm.cond && asm.cond.aperture;
        const V = lensPath(S2.map(s => ({ semi: s.semi, hole: s.hole, mirror: s.mcoat, c: s.R ? 1 / s.R : 0 })), G2, M2.map(m => refIndex(m, nm)), ap && ap.kind === 'epd' ? ap.v / 2 : 0);
        const S3 = [], G3 = [], M3 = [], owner = new Array(S2.length).fill(-1), met = new Array(S2.length).fill(0), gapOwner = new Array(G2.length).fill(-1);
        V.visits.forEach((x, q) => {
          const base = S2[x.j], flipped = x.dir < 0, v = met[x.j]++;
          const s = Object.assign(flipped ? flipSurf(base) : Object.assign({}, base), { semi: base.semi, hole: base.hole, coat: base.coat, mcoat: base.mcoat, from: { id: base.from.id, i: base.from.i, v }, cum: x.j, fflip: flip !== flipped, vflip: flipped });
          if (!s.A) s.A = []; if (s.odd === undefined) s.odd = null;
          if (base.hole > 0) s.obs = base.hole;
          if (x.role === 'mirror') s.mirror = true;
          if (owner[x.j] < 0) { owner[x.j] = S3.length; s.faceOwn = true; } else s.link = { i: owner[x.j], flip: flipped !== S3[owner[x.j]].vflip };
          if (q) {
            // the glass crossed from the last meeting to this: the gaps between the two stacks (one of them, the rest 0)
            const a = Math.min(V.visits[q - 1].j, x.j), b = Math.max(V.visits[q - 1].j, x.j);
            let d = 0, gi = -1; for (let g = a; g < b; g++) { d += G2[g]; if (gi < 0 && G2[g] !== 0) gi = g; }
            G3.push(d); M3.push(Object.assign({}, M2[gi >= 0 ? gi : a]));
            if (gi >= 0) { if (gapOwner[gi] < 0) { gapOwner[gi] = S3.length - 1; S3[S3.length - 1].gidx = flip ? G2.length - 1 - gi : gi; } else S3[S3.length - 1].glink = gapOwner[gi]; }
          }
          S3.push(s);
        });
        S2 = S3; G2 = G3; M2 = M3; lensFold = V.folds ? { exitAlong: V.zs[V.exit], inside: V.inside } : null;
      }
    }
    // out of the plane: tipped (a lens or a window; its own axis up, so the light's way up unless it faces back) and raised from the axis
    const tb = (kind === 'lens' || kind === 'window') && e.tip ? OUT_TIP * (flip ? -1 : 1) * e.tip * deg : 0;
    const xc = OUT_Z * ((e.z === undefined ? 75 : e.z) - zA);
    const tr = tilt * deg, ct = Math.cos(tr), st = Math.sin(tr), cb = Math.cos(tb), sb = Math.sin(tb);
    // its own axis in the engine's frame, and its first vertex: the centre less half its thickness along it
    const g = [sb, st * cb, ct * cb];
    const tv = t - (T / 2) * g[2], ov = off - (T / 2) * g[1], ox = xc - (T / 2) * g[0];
    if (idx) { gaps.push(along + tv - lastAx); materials.push({ glass: 'AIR' }); }     // negative where a part sits behind the one before
    let cum = 0;
    const faceZ = [0]; if (pathed) for (const g of (flip ? e.gaps.slice().reverse() : e.gaps)) faceZ.push(faceZ[faceZ.length - 1] + g);
    S2.forEach((s, k) => {
      if (s.cum !== undefined) { cum = faceZ[s.cum]; delete s.cum; }
      else if (k) cum += G2[k - 1];
      const big = Math.abs(tr) > 1e-12 || Math.abs(tb) > 1e-12 || Math.abs(ov + cum * g[1]) > 1e-9 || Math.abs(ox + cum * g[0]) > 1e-9 || s.sec;
      if (big) { s.tilt = [tr, tb]; s.dec = [ox + cum * g[0], ov + cum * g[1], cum * (g[2] - 1)]; }
      // a mirror keeps its fold apart from a tilt added to it (an error in tolerancing); a section's vertex and power from its offset
      if (s.mirror) s.fold = tr;
      if (s.sec) { s.sec.c = s.dec.slice(); mirrorSecApply(s); }
      surfaces.push(s);
    });
    gaps.push(...G2); materials.push(...M2);
    lastAx = along + tv + T;
    parts.push({ id: e.id, kind, flip, n: S2.length, ...(e.asphere ? { asph: true } : {}), ...(e.diffractive ? { diff: true } : {}), ...(e.graded ? { grin: true } : {}) });
    if (lensFold) {
      // an odd number of reflections inside: the light leaves back the way it came, from the face it exits by, and the axis folds there
      q = [q[0] + d[0] * (tv + lensFold.exitAlong), q[1] + d[1] * (tv + lensFold.exitAlong)];
      along += tv + lensFold.inside; lastAx = along;
      d = [-d[0], -d[1]]; hand = -hand;
    }
    if (kind === 'mirror') {
      // the axis turns where it meets the mirror's plane (a section's tangent plane at its centre); on from there
      const n = secN || v2(e.angle), den = dot2(d, n), tt = Math.abs(den) > 1e-12 ? dot2(r, n) / den : t;
      q = [q[0] + d[0] * tt, q[1] + d[1] * tt]; along += tt;
      lastAx = along;
      d = refl2(d, n); hand = -hand;
    }
  });
  const stopIndex = surfaces.findIndex(s => s.stop);
  // the first vertex, in the world, and the first run's axis: where the prescription sits on the bench
  const D1 = firstDir(order, ref, asm), firstT = G0sum(order[0]);
  const tl = surfaces[0].tilt ? surfaces[0].tilt[0] : 0, tb0 = surfaces[0].tilt ? surfaces[0].tilt[1] : 0, ax0 = rot2(D1, tl / deg), off0 = surfaces[0].sec ? surfaces[0].sec.c[1] : surfaces[0].dec ? surfaces[0].dec[1] : 0;
  // the axis point at the first vertex: the first part's centre, back half its thickness along its own axis (as it shows on the bench), less its decentre
  const h0 = firstT / 2 * Math.cos(tb0), fv = [first.x - ax0[0] * h0, first.y - ax0[1] * h0], origin = [fv[0] - lperp(D1)[0] * off0, fv[1] - lperp(D1)[1] * off0];
  return { surfaces, gaps, materials, stopIndex, origin, dir: D1, parts, folded: parts.some(p => p.kind === 'mirror') || surfaces.some(s => s.mirror), axisZ: zA };
}
const G0sum = e => asmKind(e) === 'lens' ? e.gaps.reduce((u, v) => u + v, 0) : asmKind(e) === 'window' ? e.thickness : asmKind(e) === 'grin' ? grinT(e) : 0;
/* a graded-index RF disc's whole thickness (1 mm where it cannot be made, so it still has a place) */
const grinT = e => { const G = grinSlab(e.grin, e.length); return G ? G.T : 1; };
/* an offset reflector's parent focus, in the mirror's own frame (x along its facing, y across): f along the parent axis from
   the parent vertex, which lies offset across and the parent's sag at the offset behind the section's centre */
export function mirrorFocus(e) {
  if (!e.R) return null;
  const f = Math.abs(e.R) / 2, h = e.offset || 0, c = 1 / e.R, k = e.k || 0, q = 1 - (1 + k) * c * c * h * h, sag0 = q > 0 ? c * h * h / (1 + Math.sqrt(q)) : 0;
  return { f, h, sag0, x: f - sag0, y: -h };
}
const wrap180 = a => ((a + 180) % 360 + 360) % 360 - 180;
/* an offset reflector's parent focus to the section's centre: the way a feed at the focus looks, on the bench (null for a flat or whole mirror) */
export function mirrorFeedDir(e) {
  const F = mirrorFocus(e); if (!F || !F.h) return null;
  const a = v2(e.angle), ym = lperp(a), fx = a[0] * F.x + ym[0] * F.y, fy = a[1] * F.x + ym[1] * F.y, L = Math.hypot(fx, fy);
  return L > 1e-12 ? [-fx / L, -fy / L] : null;
}
/* an offset reflector met by the axis along d (the bench's sense of across hand): the normal at the section's centre, about which the
   axis folds (the bisector of the feed's way in from the focus and the facing, the way out), and what the prescription's surface
   keeps to set itself from a new offset or radius (mirrorSecApply): the facing and the mirror's across axis in the engine's frame */
function mirrorSection(e, d, hand) {
  const F = mirrorFocus(e), a = v2(e.angle), ym = lperp(a);
  const din = mirrorFeedDir(e) || [-a[0], -a[1]], nn = [din[0] - a[0], din[1] - a[1]], L = Math.hypot(nn[0], nn[1]);
  const n = L > 1e-12 ? [nn[0] / L, nn[1] / L] : [-a[0], -a[1]];
  const eng = v => [hand * dot2(v, lperp(d)), dot2(v, d)];
  return { n, sec: { h: F.h, a: eng(a), yv: eng(ym), c: [0, 0, 0] } };
}
/* a section's surface set from its offset (sec.h) and its radius and conic: its parent's vertex off the axis (dec, from the section
   centre's own decentre sec.c, back the parent's sag at the offset along the facing and the offset across) and its first-order power
   about the beam's centre, 1/(2L) for the distance L from the focus to the section's centre (a paraboloid's f/cos²(β/2)), so the
   Gaussian beam is bent as the section bends it rather than as the parent's vertex would */
export function mirrorSecApply(s) {
  const q = s.sec; if (!q) return s;
  const Rb = s.R === null || s.R === undefined || !isFinite(s.R) || !s.R ? 0 : -s.R;
  const h = q.h || 0, k = s.k || 0, c = Rb ? 1 / Rb : 0, qq = 1 - (1 + k) * c * c * h * h, sag0 = c && qq > 0 ? c * h * h / (1 + Math.sqrt(qq)) : 0;
  const f = Rb ? Math.abs(Rb) / 2 : Infinity, L = isFinite(f) ? Math.hypot(f - sag0, h) : Infinity;
  s.dec = [q.c[0] || 0, (q.c[1] || 0) - q.a[0] * sag0 - q.yv[0] * h, (q.c[2] || 0) - q.a[1] * sag0 - q.yv[1] * h];
  s.pc = Rb && isFinite(L) && L > 0 ? -Math.sign(Rb) / (2 * L) : 0;
  return s;
}
function firstDir(order, ref, asm) {
  const a0 = ref.angle, D0 = asmKind(ref) === 'mirror' ? (mirrorFeedDir(ref) || v2(a0 + 180)) : v2(a0);
  let dd = asm.rev ? [-D0[0], -D0[1]] : D0;
  for (let i = order.indexOf(ref) - 1; i >= 0; i--) if (asmKind(order[i]) === 'mirror') dd = refl2(dd, v2(order[i].angle));
  return dd;
}

/* the axis at unfolded distance s from the first vertex: its point and direction on the bench, and the
   sense of the bench's y there (1, or -1 after an odd number of mirrors) */
export function asmAxisAt(P, s) {
  let q = P.origin.slice(), d = P.dir.slice(), hand = 1, z = 0;
  const zs = [0]; for (const g of P.gaps) zs.push(zs[zs.length - 1] + g);
  for (let i = 0; i < P.surfaces.length; i++) {
    if (!P.surfaces[i].mirror || zs[i] >= s) continue;
    const step = zs[i] - z; q = [q[0] + d[0] * step, q[1] + d[1] * step]; z = zs[i];
    const t = (P.surfaces[i].tilt || [0])[0], th = hand * t / deg;
    const thr = rot2(d, th), n = [-thr[0], -thr[1]];
    d = refl2(d, n); hand = -hand;
  }
  return { p: [q[0] + d[0] * (s - z), q[1] + d[1] * (s - z)], d, hand };
}
const rot2 = (d, a) => { const c = Math.cos(a * deg), s2 = Math.sin(a * deg); return [d[0] * c - d[1] * s2, d[0] * s2 + d[1] * c]; };

/* Writes a prescription back to the parts: each surface's shape to the surface it came from, each
   part's own thicknesses and glass, and each part's place and facing from the axis walked again with
   the gaps (the first vertex stays where it is), its decentre and its tilt. The prescription keeps the
   parts in the same order; a lens's surfaces may be more or fewer than it had (a surface inserted or
   taken out in the design). */
export function asmApply(asm, P, els) {
  els = els || asmMembers(asm);
  const byId = new Map(els.map(e => [e.id, e]));
  const zs = [0]; for (const g of P.gaps) zs.push(zs[zs.length - 1] + g);
  const zA = isFinite(P.axisZ) ? P.axisZ : asmAxisZ(asm, els);
  // the axis's height kept on the assembly, so a part moved up or down off it (by the design) stays decentred from it
  if (asm && !isFinite(asm.z)) asm.z = zA;
  let k = 0;
  P.parts.forEach(p => {
    const e = byId.get(p.id), S = P.surfaces.slice(k, k + p.n), G = P.gaps.slice(k, k + p.n - 1), M = P.materials.slice(k, k + p.n - 1);
    const s0 = S[0], A = asmAxisAt(P, zs[k] - 1e-12), d = A.d, hand = A.hand;
    const tilt = s0.tilt ? s0.tilt[0] / deg : 0, dec = s0.dec ? s0.dec[1] : 0, tb = s0.tilt ? s0.tilt[1] || 0 : 0, decx = s0.dec ? s0.dec[0] || 0 : 0;
    // the first vertex on the bench: the axis point, then across by the decentre (in the bench's sense of y)
    const at = asmAxisAt(P, zs[k]), dz0 = s0.dec ? s0.dec[2] || 0 : 0;     // (along: a section's parent vertex before or past its centre)
    const base = [at.p[0] + hand * lperp(d)[0] * dec + d[0] * dz0, at.p[1] + hand * lperp(d)[1] * dec + d[1] * dz0];
    // the part's thickness: its gaps (a lens with a mirrored face lists each gap once per crossing; its own are the first crossings')
    const ax = rot2(d, hand * tilt), T = S.some(s => s.gidx !== undefined) ? S.reduce((u, s, q) => u + (s.gidx !== undefined && q < G.length ? G[q] : 0), 0) : G.reduce((u, v) => u + v, 0), cb = Math.cos(tb);
    // centre: the first vertex on along the part's own axis by half its thickness (its part in the plane, and up)
    const nx = base[0] + ax[0] * T / 2 * cb, ny = base[1] + ax[1] * T / 2 * cb;
    if (Math.hypot(nx - e.x, ny - e.y) > 1e-9) { e.x = nx; e.y = ny; }
    const nz = zA + OUT_Z * (decx + T / 2 * Math.sin(tb));
    if (Math.abs(nz - (e.z === undefined ? 75 : e.z)) > 1e-9) e.z = nz;
    if (p.kind === 'lens' || p.kind === 'window') {
      const tip = OUT_TIP * (p.flip ? -1 : 1) * tb / deg;
      if (Math.abs(tip) < 1e-9) delete e.tip; else e.tip = tip;
    }
    if (p.kind === 'stop') e.aperture = 2 * S[0].semi;
    else if (p.kind === 'mirror') {
      e.R = S[0].R === null || S[0].R === 0 || !isFinite(S[0].R) ? null : -S[0].R; e.k = S[0].k;
      const mA = (S[0].A || []).map(v => -v); while (mA.length && !mA[mA.length - 1]) mA.pop();
      if (mA.length) e.A = mA; else delete e.A;
      const mF = ffTurn(S[0].F, FF_SY_MIRROR, -1); if (mF && Object.keys(mF).length) e.F = mF; else delete e.F;
      // its facing: the face's own axis back (a section's turned from the fold by its dtilt)
      const fa = S[0].dtilt && S[0].dtilt[0] ? rot2(d, hand * (tilt + S[0].dtilt[0] / deg)) : ax;
      const want = ang(Math.atan2(-fa[1], -fa[0]) / deg);
      if (!sameAng(e.angle, want, 1e-9)) e.angle = want;
      // a section: its offset, and its centre from the parent's vertex (where the surface's decentre put it)
      if (S[0].sec) {
        const h = S[0].sec.h || 0;
        if (Math.abs(h) > 1e-9) e.offset = h; else delete e.offset;
        const F = mirrorFocus(e), a = [-fa[0], -fa[1]], ym = lperp(a), sg = F ? F.sag0 : 0;
        const cx = base[0] + a[0] * sg + ym[0] * h, cy = base[1] + a[1] * sg + ym[1] * h;
        if (Math.hypot(cx - e.x, cy - e.y) > 1e-9) { e.x = cx; e.y = cy; }
      }
    } else {
      const want = ang(Math.atan2(p.flip ? -ax[1] : ax[1], p.flip ? -ax[0] : ax[0]) / deg);
      if (!sameAng(e.angle, want, 1e-9)) e.angle = want;
      if (p.kind === 'lens' && S.some(s => s.faceOwn)) {
        // a lens the light was followed through: each surface from the row first meeting it, each gap from the row first
        // crossing it (its surfaces and gaps keep their number; a stack's gaps of 0 stay 0)
        S.forEach((s, q) => {
          const t = e.surfaces[s.from.i]; if (!t) return;
          const u = s.fflip ? flipSurf(s) : s;
          if (s.faceOwn) {
            t.R = u.R === 0 || !isFinite(u.R) ? null : u.R; t.k = u.k; t.a2 = u.a2 || 0; t.A = (u.A || []).slice(); if (u.odd) t.odd = u.odd.slice(); else delete t.odd;
            const tF = ffTurn(u.F, FF_SY_LENS, 1); if (tF && Object.keys(tF).length) t.F = tF; else delete t.F;
            const tP = normPh(u.ph); if (tP) t.ph = tP; else delete t.ph;
            if (Math.abs(s.semi - e.diameter / 2) >= 1e-9) t.semi = s.semi; else if (t.semi && Math.abs(t.semi - e.diameter / 2) >= 1e-9) t.semi = null;
            if (s.obs > 0 || t.hole) t.hole = s.obs > 0 ? s.obs : 0;
            if (s.coat) t.coat = normCoat(s.coat);
          }
          if (s.gidx !== undefined && q < G.length) { e.gaps[s.gidx] = G[q]; const c = Object.assign({}, M[q]); delete c.gh; if (c.grad) c.grad = c.grad.slice(); e.materials[s.gidx] = c; }
        });
      } else if (p.kind === 'lens') {
        // each surface from its row
        const own = S, ownG = own.map((s, q) => q).slice(0, -1).map(q => [G[q], M[q]]);
        const ss = p.flip ? own.slice().reverse().map(s => Object.assign(flipSurf(s), { semi: s.semi, hole: s.hole, coat: s.coat })) : own.map(s => Object.assign({}, s));
        const GG = (p.flip ? ownG.slice().reverse() : ownG).map(x => x[0]), MM = (p.flip ? ownG.slice().reverse() : ownG).map(x => x[1]);
        // a surface added in the prescription is a new, bare one on the part; one taken out goes from it
        e.surfaces = ss.map((s, i) => {
          const t = e.surfaces[i] || { R: null, k: 0, a2: 0, A: [], semi: null, hole: 0, coat: normCoat({}) };
          t.R = s.R === 0 || !isFinite(s.R) ? null : s.R; t.k = s.k; t.a2 = s.a2; t.A = s.A.slice(); if (s.odd) t.odd = s.odd.slice(); else delete t.odd;
          const tF = ffTurn(s.F, FF_SY_LENS, 1); if (tF && Object.keys(tF).length) t.F = tF; else delete t.F;
          const tP = normPh(s.ph); if (tP) t.ph = tP; else delete t.ph;
          // a clear radius that is the lens's own stays unset; its hole and coating as the design has them
          if (Math.abs(s.semi - e.diameter / 2) >= 1e-9) t.semi = s.semi;
          else if (t.semi && Math.abs(t.semi - e.diameter / 2) >= 1e-9) t.semi = null;
          if (s.hole > 0 || t.hole) t.hole = s.hole > 0 ? s.hole : 0;
          if (s.coat) t.coat = normCoat(s.coat);
          return t;
        });
        e.gaps = GG.slice();
        e.materials = MM.map(m => { const c = Object.assign({}, m); delete c.gh; if (c.grad) c.grad = c.grad.slice(); return c; });
      } else if (p.kind === 'window') { e.thickness = G[0]; e.material = Object.assign({}, M[0]); }
      // a graded-index disc: its design's focal length, as the prescription has it (its thickness and grading follow from it)
      else if (p.kind === 'grin' && S[0].grin && isFinite(S[0].grin.f) && S[0].grin.f > 0 && Math.abs(S[0].grin.f - e.grin.f) > 1e-9) { e.grin = Object.assign({}, e.grin, { f: S[0].grin.f }); applyGrin(e); }
    }
    k += p.n;
  });
}

/* first-order figures of the prescription at one wavelength: its focal length and back focal distance */
export function asmParaxial(P, nm, paraxial) {
  return paraxial({ surfaces: P.surfaces, gaps: P.gaps, materials: P.materials }, nm);
}
