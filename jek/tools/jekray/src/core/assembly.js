import { clamp } from './constants.js';
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
export const asmKind = e => e.type === 'lens' ? 'lens' : e.type === 'stop' ? 'stop' : e.type === 'prism' && e.shape === 'window' ? 'window' : e.type === 'mirror' ? 'mirror' : null;

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
    .map(v => ({ nm: clamp(num(v && v.nm, 587.56), 100, 1e7), w: clamp(num(v && v.w, 1), 0, 1e3) }));
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
export function normAssemblies(list, els) {
  const groups = new Set(els.filter(e => e.group).map(e => e.group)), out = [], seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a.id !== 'string' || !groups.has(a.id) || seen.has(a.id)) continue;
    seen.add(a.id);
    const ref = els.find(e => e.id === a.ref && e.group === a.id) || els.find(e => e.group === a.id && asmKind(e) === 'lens') || els.find(e => e.group === a.id);
    out.push({ id: a.id, name: String(a.name || 'Assembly').slice(0, 80), bench: ref.bench, ref: ref.id, rev: a.rev === true, cond: normCond(a.cond), ...(a.design ? { design: normDesign(a.design) } : {}) });
  }
  return out;
}

/* ---------- The design: what a lens designer sets around the prescription ----------
   (engines/lens-design.js works with it.) Kept on the record as "design": the image distance,
   the values an optimiser may change, solves and pickups, each value named by a key:
   "R:<part id>.<surface>", "k:...", "t:..." (the gap after that surface) or "t:image". */
/* a key: R (radius), k (conic), t (gap after), g (glass after), a4 … a16 (an even aspheric coefficient,
   A4 r⁴ …), or on a part's first surface T (its tilt, degrees) and D (its decentre, mm) */
export const DESIGN_KEY = /^([RtkgTD]|a(?:4|6|8|10|12|14|16)):(.{1,120}\.\d+)$/;
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
  return { image: clamp(num(d.image, 50), -1e5, 1e5), vars, solves, pickups, merit: normMerit(d.merit), tol: normTol(d.tol) };
}
/* the merit function: the image term (what is measured, over how many pupil rings and arms), the
   boundaries every design keeps to, and the operands added to it, each with a target and a weight */
/* tolerances: for each kind, whether it is applied and how large (radius in fringes at 632.8 nm over
   the clear aperture, thickness and gaps in mm, element decentre in mm, element tilt in arcminutes,
   index as a change in n, Abbe number in per cent); the image refocused or not; Monte Carlo's
   statistics, trials and seed */
export const TOL_KINDS = { rad: 3, thk: 0.05, dec: 0.025, tilt: 1, ind: 0.001, abbe: 0.5, irr: 1 };
const TOL_OFF = { irr: true };              // kinds off until turned on
export function normTol(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const [k, v] of Object.entries(TOL_KINDS)) { const x = o[k] && typeof o[k] === 'object' ? o[k] : {}; out[k] = { on: x.on === undefined ? !TOL_OFF[k] : x.on !== false, v: clamp(num(x.v, v), 0, 1e3) }; }
  out.comp = o.comp !== false;
  out.dist = o.dist === 'normal' ? 'normal' : 'uniform';
  out.trials = Math.round(clamp(num(o.trials, 200), 10, 5000));
  out.seed = Math.round(clamp(num(o.seed, 1), 1, 1e9));
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
        ...(MERIT_AT_FREQ.includes(o.op) ? { v: clamp(num(o.v, 50), 0, 1e5) } : {}) })),
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
   whole: not off-axis segments), at one height and upright, along one axis that a mirror folds. The
   axis is walked from the part whose facing sets it, forward along the light and back against it:
   each part next along the axis is the nearest ahead within its own half-width of it; at a mirror
   the axis turns as the light does. A part may sit off the axis (decentred) by less than its
   half-width and turn from it (tilted) by up to 30°; a mirror may turn it any way that sends the light
   on. The light runs along the axis away from a source on it; with none, the way most lenses face. */
const ang = a => ((a % 360) + 360) % 360;
const sameAng = (a, b, tol) => { const d = ang(a - b); return Math.min(d, 360 - d) <= tol; };
const TILT_MAX = 30;
const halfW = e => e.type === 'lens' ? e.diameter / 2 : e.type === 'stop' ? (e.outer || e.aperture) / 2 : e.type === 'mirror' ? e.length / 2 : e.size / 2;
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
    }
  }
  return out;
}
export function asmCheck(els, opts) {
  opts = opts || {};
  const name = e => e.name || e.type;
  if (els.length < (opts.min || 2)) return { ok: false, why: 'Select at least two parts: lenses, mirrors and stops on one axis.' };
  const bad = els.find(e => !asmKind(e));
  if (bad) return { ok: false, why: name(bad) + ' can’t be in an assembly: only lenses, mirrors, stops and windows on one axis can (leave out sources, screens and the rest).' };
  if (els.some(e => e.bench !== els[0].bench)) return { ok: false, why: 'The parts are on different tabs.' };
  const lenses = els.filter(e => asmKind(e) !== 'stop');
  if (!lenses.length) return { ok: false, why: 'An assembly needs at least one lens, mirror or window.' };
  const cyl = els.find(e => e.type === 'lens' && e.cyl);
  if (cyl) return { ok: false, why: name(cyl) + ' is cylindrical: an assembly’s parts are round about the axis.' };
  const stopOdd = els.find(e => e.type === 'stop' && (e.shape !== 'round' || e.offset));
  if (stopOdd) return { ok: false, why: name(stopOdd) + ' is not a round iris on the axis: an assembly’s stop is round.' };
  const seg = els.find(e => e.type === 'mirror' && (e.offset || e.film));
  if (seg) return { ok: false, why: name(seg) + (seg.film ? ' is a film beam splitter' : ' is an off-axis segment') + ': an assembly’s mirrors are whole mirrors.' };
  for (const e of els) {
    if (Math.abs((e.z === undefined ? 75 : e.z) - (els[0].z === undefined ? 75 : els[0].z)) > 1e-3) return { ok: false, why: name(e) + ' is at another height from ' + name(els[0]) + '.' };
    if (e.tip) return { ok: false, why: name(e) + ' is tipped out of the plane.' };
  }
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
  // none overlapping along the axis, within each straight run
  for (let i = 1; i < chain.length; i++) {
    const p = chain[i - 1], c = chain[i];
    if (asmKind(p.e) === 'mirror' || asmKind(c.e) === 'mirror') continue;
    const span = x => { const t = dot2([x.e.x - ref.x, x.e.y - ref.y], x.d), T = asmKind(x.e) === 'lens' ? x.e.gaps.reduce((u, v) => u + v, 0) : asmKind(x.e) === 'window' ? x.e.thickness : 0; return [t - T / 2, t + T / 2]; };
    if (span(c)[0] < span(p)[1] - 1e-6) return { ok: false, why: name(c.e) + ' overlaps ' + name(p.e) + '.' };
  }
  const folded = chain.some(c => asmKind(c.e) === 'mirror');
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
const flipSurf = s => ({ R: s.R === null ? null : -s.R, k: s.k, a2: -s.a2, A: s.A.map(v => -v), odd: s.odd ? s.odd.map(v => -v) : null });
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
  order.forEach((e, idx) => {
    const kind = asmKind(e), r = [e.x - q[0], e.y - q[1]], t = dot2(r, d), off = hand * dot2(r, lperp(d));
    let S2, G2, M2, flip = false, tilt = 0, T = 0;
    if (kind === 'stop') { S2 = [{ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.aperture / 2, stop: true, from: { id: e.id, i: 0 } }]; G2 = []; M2 = []; }
    else if (kind === 'mirror') {
      // its normal through it (away from the light): the axis of its own frame
      const thr = v2(e.angle + 180);
      tilt = hand * angFrom(d, thr);
      S2 = [{ R: e.R === null ? null : -e.R, k: e.k || 0, a2: 0, A: [], odd: null, semi: e.length / 2, mirror: true, from: { id: e.id, i: 0 } }]; G2 = []; M2 = [];
    } else {
      const a = partAxis(e);
      flip = dot2(a, d) < 0;
      const ax = flip ? [-a[0], -a[1]] : a;
      tilt = hand * angFrom(d, ax);
      if (kind === 'lens') {
        S2 = e.surfaces.map((s, i) => ({ R: s.R, k: s.k, a2: s.a2, A: s.A.slice(), odd: s.odd ? s.odd.slice() : null, semi: s.semi || e.diameter / 2, from: { id: e.id, i } }));
        G2 = e.gaps.slice(); M2 = e.materials.map(m => Object.assign({}, m));
      } else {
        S2 = [0, 1].map(i => ({ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.size / 2, from: { id: e.id, i } }));
        G2 = [e.thickness]; M2 = [Object.assign({}, e.material)];
      }
      if (flip) { S2 = S2.reverse().map(s => Object.assign(flipSurf(s), { semi: s.semi, from: s.from })); G2.reverse(); M2.reverse(); }
      T = G2.reduce((u, v) => u + v, 0);
    }
    const tr = tilt * deg, ct = Math.cos(tr), st = Math.sin(tr);
    // its first vertex: the centre less half its thickness along its own axis
    const tv = t - (T / 2) * ct, ov = off - (T / 2) * st;
    if (idx) { gaps.push(Math.max(0, along + tv - lastAx)); materials.push({ glass: 'AIR' }); }
    let cum = 0;
    S2.forEach((s, k) => {
      if (k) cum += G2[k - 1];
      const big = Math.abs(tr) > 1e-12 || Math.abs(ov + cum * st) > 1e-9 || kind === 'mirror' && Math.abs(tr) > 1e-12;
      if (big) { s.tilt = [tr, 0]; s.dec = [0, ov + cum * st, cum * (ct - 1)]; }
      surfaces.push(s);
    });
    gaps.push(...G2); materials.push(...M2);
    lastAx = along + tv + T;
    parts.push({ id: e.id, kind, flip, n: S2.length });
    if (kind === 'mirror') {
      // the axis turns where it meets the mirror's plane; on from there
      const n = v2(e.angle), den = dot2(d, n), tt = Math.abs(den) > 1e-12 ? dot2(r, n) / den : t;
      q = [q[0] + d[0] * tt, q[1] + d[1] * tt]; along += tt;
      lastAx = along;
      d = refl2(d, n); hand = -hand;
    }
  });
  const stopIndex = surfaces.findIndex(s => s.stop);
  // the first vertex, in the world, and the first run's axis: where the prescription sits on the bench
  const D1 = firstDir(order, ref, asm), firstT = G0sum(order[0]);
  const tl = surfaces[0].tilt ? surfaces[0].tilt[0] : 0, ax0 = rot2(D1, tl / deg), off0 = surfaces[0].dec ? surfaces[0].dec[1] : 0;
  // the axis point at the first vertex: the first part's centre, back half its thickness along its own axis, less its decentre
  const fv = [first.x - ax0[0] * firstT / 2, first.y - ax0[1] * firstT / 2], origin = [fv[0] - lperp(D1)[0] * off0, fv[1] - lperp(D1)[1] * off0];
  return { surfaces, gaps, materials, stopIndex, origin, dir: D1, parts, folded: parts.some(p => p.kind === 'mirror') };
}
const G0sum = e => asmKind(e) === 'lens' ? e.gaps.reduce((u, v) => u + v, 0) : asmKind(e) === 'window' ? e.thickness : 0;
function firstDir(order, ref, asm) {
  const a0 = ref.angle, D0 = asmKind(ref) === 'mirror' ? v2(a0 + 180) : v2(a0);
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
  let k = 0;
  P.parts.forEach(p => {
    const e = byId.get(p.id), S = P.surfaces.slice(k, k + p.n), G = P.gaps.slice(k, k + p.n - 1), M = P.materials.slice(k, k + p.n - 1);
    const s0 = S[0], A = asmAxisAt(P, zs[k] - 1e-12), d = A.d, hand = A.hand;
    const tilt = s0.tilt ? s0.tilt[0] / deg : 0, dec = s0.dec ? s0.dec[1] : 0;
    // the first vertex on the bench: the axis point, then across by the decentre (in the bench's sense of y)
    const at = asmAxisAt(P, zs[k]), base = [at.p[0] + hand * lperp(d)[0] * dec, at.p[1] + hand * lperp(d)[1] * dec];
    const ax = rot2(d, hand * tilt), T = G.reduce((u, v) => u + v, 0);
    // centre: the first vertex on along the part's own axis by half its thickness
    const nx = base[0] + ax[0] * T / 2, ny = base[1] + ax[1] * T / 2;
    if (Math.hypot(nx - e.x, ny - e.y) > 1e-9) { e.x = nx; e.y = ny; }
    if (p.kind === 'stop') e.aperture = 2 * S[0].semi;
    else if (p.kind === 'mirror') {
      e.R = S[0].R === null ? null : -S[0].R; e.k = S[0].k;
      const want = ang(Math.atan2(-ax[1], -ax[0]) / deg);
      if (!sameAng(e.angle, want, 1e-9)) e.angle = want;
    } else {
      const want = ang(Math.atan2(p.flip ? -ax[1] : ax[1], p.flip ? -ax[0] : ax[0]) / deg);
      if (!sameAng(e.angle, want, 1e-9)) e.angle = want;
      if (p.kind === 'lens') {
        const ss = p.flip ? S.slice().reverse().map(s => Object.assign(flipSurf(s), { semi: s.semi })) : S;
        // a surface added in the prescription is a new, bare one on the part; one taken out goes from it
        e.surfaces = ss.map((s, i) => {
          const t = e.surfaces[i] || { R: null, k: 0, a2: 0, A: [], semi: null, coat: normCoat({}) };
          t.R = s.R; t.k = s.k; t.a2 = s.a2; t.A = s.A.slice(); if (s.odd) t.odd = s.odd.slice(); else delete t.odd;
          // a clear radius that is the lens's own stays unset
          if (Math.abs(s.semi - e.diameter / 2) >= 1e-9) t.semi = s.semi;
          else if (t.semi && Math.abs(t.semi - e.diameter / 2) >= 1e-9) t.semi = null;
          return t;
        });
        e.gaps = (p.flip ? G.slice().reverse() : G).slice();
        e.materials = (p.flip ? M.slice().reverse() : M).map(m => Object.assign({}, m));
      } else if (p.kind === 'window') { e.thickness = G[0]; e.material = Object.assign({}, M[0]); }
    }
    k += p.n;
  });
}

/* first-order figures of the prescription at one wavelength: its focal length and back focal distance */
export function asmParaxial(P, nm, paraxial) {
  return paraxial({ surfaces: P.surfaces, gaps: P.gaps, materials: P.materials }, nm);
}
