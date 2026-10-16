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
export const asmKind = e => e.type === 'lens' ? 'lens' : e.type === 'stop' ? 'stop' : e.type === 'prism' && e.shape === 'window' ? 'window' : null;

/* design conditions: the aperture (an entrance pupil diameter, mm, or an F-number), the fields
   (angles of the incoming light, degrees, each with a weight) and the wavelengths (nm, each with a
   weight, one of them primary) */
export function normCond(c) {
  c = c && typeof c === 'object' ? c : {};
  const ap = c.aperture && typeof c.aperture === 'object' ? c.aperture : {};
  const kind = ap.kind === 'fno' ? 'fno' : 'epd';
  const fields = (Array.isArray(c.fields) && c.fields.length ? c.fields : [{ deg: 0, w: 1 }]).slice(0, ASM_FIELDS_MAX)
    .map(f => ({ deg: clamp(num(f && f.deg, 0), -89, 89), w: clamp(num(f && f.w, 1), 0, 1e3) }));
  const waves = (Array.isArray(c.waves) && c.waves.length ? c.waves : [{ nm: 587.56, w: 1 }]).slice(0, ASM_WAVES_MAX)
    .map(v => ({ nm: clamp(num(v && v.nm, 587.56), 100, 1e7), w: clamp(num(v && v.w, 1), 0, 1e3) }));
  return {
    aperture: { kind, v: kind === 'fno' ? clamp(num(ap.v, 4), 0.2, 1e3) : clamp(num(ap.v, 10), 1e-3, 1e5) },
    fields, waves, primary: Math.round(clamp(num(c.primary, 0), 0, waves.length - 1)),
  };
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
export const DESIGN_KEY = /^([Rtkg]):(.{1,120}\.\d+)$/;
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
  return { image: clamp(num(d.image, 50), -1e5, 1e5), vars, solves, pickups, merit: normMerit(d.merit) };
}
/* the merit function: the image term (what is measured, over how many pupil rings and arms), the
   boundaries every design keeps to, and the operands added to it, each with a target and a weight */
export const MERIT_OPS = ['EFL', 'FNO', 'TTL', 'DIST', 'SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT'];
export function normMerit(m) {
  m = m && typeof m === 'object' ? m : {};
  const b = m.bounds && typeof m.bounds === 'object' ? m.bounds : {};
  return {
    crit: ['spot', 'chief', 'wfe'].includes(m.crit) ? m.crit : 'spot',
    rings: Math.round(clamp(num(m.rings, 3), 1, 4)), arms: [4, 6, 8, 12].includes(+m.arms) ? +m.arms : 6,
    bounds: { glassMin: clamp(num(b.glassMin, 1), 0, 1e3), glassMax: clamp(num(b.glassMax, 0), 0, 1e4), edgeMin: clamp(num(b.edgeMin, 0.5), 0, 1e3), airMin: clamp(num(b.airMin, 0.1), 0, 1e3) },
    ops: (Array.isArray(m.ops) ? m.ops : []).filter(o => o && MERIT_OPS.includes(o.op)).slice(0, 50)
      .map(o => ({ op: o.op, target: clamp(num(o.target, 0), -1e6, 1e6), weight: clamp(num(o.weight, 1), 0, 1e6) })),
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
   Lenses (round about their axes, not cylinders), round stops and windows, all on one axis: facing
   along it (a lens either way round), on it, at one height, upright. The light runs along the axis
   away from a source on it; with none, the way most of the lenses face. */
const ang = a => ((a % 360) + 360) % 360;
const sameAng = (a, b, tol) => { const d = ang(a - b); return Math.min(d, 360 - d) <= tol; };
export function asmCheck(els, opts) {
  opts = opts || {};
  const name = e => e.name || e.type;
  if (els.length < (opts.min || 2)) return { ok: false, why: 'Select at least two parts: lenses and stops on one axis.' };
  const bad = els.find(e => !asmKind(e));
  if (bad) return { ok: false, why: name(bad) + ' can’t be in an assembly: only lenses, stops and windows on one axis can (leave out sources, screens and the rest).' };
  if (els.some(e => e.bench !== els[0].bench)) return { ok: false, why: 'The parts are on different tabs.' };
  const lenses = els.filter(e => asmKind(e) !== 'stop');
  if (!lenses.length) return { ok: false, why: 'An assembly needs at least one lens or window.' };
  const cyl = els.find(e => e.type === 'lens' && e.cyl);
  if (cyl) return { ok: false, why: name(cyl) + ' is cylindrical: an assembly’s parts are round about the axis.' };
  const stopOdd = els.find(e => e.type === 'stop' && (e.shape !== 'round' || e.offset));
  if (stopOdd) return { ok: false, why: name(stopOdd) + ' is not a round iris on the axis: an assembly’s stop is round.' };
  const ref = opts.ref ? els.find(e => e.id === opts.ref) || lenses[0] : lenses[0], a0 = ref.angle;
  const d = [Math.cos(a0 * deg), Math.sin(a0 * deg)];
  for (const e of els) {
    const ok = asmKind(e) === 'stop' ? sameAng(e.angle, a0, 1e-6) || sameAng(e.angle, a0 + 180, 1e-6) : sameAng(e.angle, a0, 1e-6) || sameAng(e.angle, a0 + 180, 1e-6);
    if (!ok) return { ok: false, why: name(e) + ' faces another way from ' + name(ref) + ': an assembly’s parts face along one axis.' };
    const rx = e.x - ref.x, ry = e.y - ref.y;
    if (Math.abs(-rx * d[1] + ry * d[0]) > 1e-3) return { ok: false, why: name(e) + ' is off the axis of ' + name(ref) + ' (by ' + (+Math.abs(-rx * d[1] + ry * d[0]).toPrecision(3)) + ' mm). Line them up first.' };
    if (Math.abs((e.z === undefined ? 75 : e.z) - (ref.z === undefined ? 75 : ref.z)) > 1e-3) return { ok: false, why: name(e) + ' is at another height from ' + name(ref) + '.' };
    if (e.tip) return { ok: false, why: name(e) + ' is tipped out of the plane.' };
  }
  // which way the light runs: away from a source on the axis, else the way most lenses face
  let rev = opts.rev;
  if (rev === undefined) {
    const half = Math.max(...lenses.map(e => (e.diameter || e.size || 0) / 2));
    const srcs = (opts.sources || []).filter(s => Math.abs(-(s.x - ref.x) * d[1] + (s.y - ref.y) * d[0]) < half && s.bench === ref.bench)
      .sort((p, q) => Math.hypot(p.x - ref.x, p.y - ref.y) - Math.hypot(q.x - ref.x, q.y - ref.y));
    if (srcs.length) rev = (srcs[0].x - ref.x) * d[0] + (srcs[0].y - ref.y) * d[1] > 0;
    else {
      const turned = lenses.filter(e => !sameAng(e.angle, a0, 1e-6)).length;
      rev = 2 * turned > lenses.length;
    }
  }
  // in order along the light, and none overlapping
  const D = rev ? [-d[0], -d[1]] : d;
  const span = e => { const c = (e.x - ref.x) * D[0] + (e.y - ref.y) * D[1], T = asmKind(e) === 'lens' ? e.gaps.reduce((a, b) => a + b, 0) : asmKind(e) === 'window' ? e.thickness : 0; return [c - T / 2, c + T / 2]; };
  const order = els.slice().sort((p, q) => span(p)[0] - span(q)[0]);
  for (let i = 1; i < order.length; i++) if (span(order[i])[0] < span(order[i - 1])[1] - 1e-6) return { ok: false, why: name(order[i]) + ' overlaps ' + name(order[i - 1]) + '.' };
  return { ok: true, ref: ref.id, rev, order: order.map(e => e.id) };
}

/* ---------- The prescription: the parts as one sequence of surfaces ----------
   Along the light, from the first surface's vertex: each surface's shape (R, conic k, a2, the even
   terms A, the odd terms), its clear radius, the gap to the next and the material in that gap (air
   between parts), the stop as a flat surface in air. Each surface remembers which part, and which
   of its surfaces, it came from, so changes can be written back. A lens turned against the light is
   read face for face the other way round, each sag of the other sign. */
const flipSurf = s => ({ R: s.R === null ? null : -s.R, k: s.k, a2: -s.a2, A: s.A.map(v => -v), odd: s.odd ? s.odd.map(v => -v) : null });
export function asmPrescription(asm, els) {
  els = els || asmMembers(asm);
  const ref = els.find(e => e.id === asm.ref) || els[0];
  const a0 = ref.angle * deg, d = [Math.cos(a0), Math.sin(a0)].map(v => v * (asm.rev ? -1 : 1));
  const along = e => (e.x - ref.x) * d[0] + (e.y - ref.y) * d[1];
  const parts = els.map(e => {
    const kind = asmKind(e), c = along(e);
    if (kind === 'stop') return { e, kind, z0: c, z1: c, surfaces: [{ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.aperture / 2, stop: true, from: { id: e.id, i: 0 } }], gaps: [], materials: [] };
    let surfaces, gaps, materials;
    const flip = (Math.cos(e.angle * deg) * d[0] + Math.sin(e.angle * deg) * d[1]) < 0;
    if (kind === 'lens') {
      surfaces = e.surfaces.map((s, i) => ({ R: s.R, k: s.k, a2: s.a2, A: s.A.slice(), odd: s.odd ? s.odd.slice() : null, semi: s.semi || e.diameter / 2, from: { id: e.id, i } }));
      gaps = e.gaps.slice(); materials = e.materials.map(m => Object.assign({}, m));
    } else {
      surfaces = [0, 1].map(i => ({ R: null, k: 0, a2: 0, A: [], odd: null, semi: e.size / 2, from: { id: e.id, i } }));
      gaps = [e.thickness]; materials = [Object.assign({}, e.material)];
    }
    if (flip) {
      surfaces = surfaces.reverse().map(s => Object.assign(flipSurf(s), { semi: s.semi, from: s.from }));
      gaps.reverse(); materials.reverse();
    }
    const T = gaps.reduce((a, b) => a + b, 0);
    return { e, kind, flip, z0: c - T / 2, z1: c + T / 2, surfaces, gaps, materials };
  }).sort((p, q) => p.z0 - q.z0 || (p.kind === 'stop' ? -1 : 1));
  const surfaces = [], gaps = [], materials = [];
  parts.forEach((p, i) => {
    if (i) { gaps.push(Math.max(0, p.z0 - parts[i - 1].z1)); materials.push({ glass: 'AIR' }); }
    surfaces.push(...p.surfaces); gaps.push(...p.gaps); materials.push(...p.materials);
  });
  const stopIndex = surfaces.findIndex(s => s.stop);
  // the first vertex, in the world, and the axis: where the prescription sits on the bench
  const z0 = parts[0].z0, origin = [ref.x + d[0] * z0, ref.y + d[1] * z0];
  return { surfaces, gaps, materials, stopIndex, origin, dir: d, parts: parts.map(p => ({ id: p.e.id, kind: p.kind, flip: !!p.flip, n: p.surfaces.length })) };
}

/* Writes a prescription back to the parts: each surface's shape to the surface it came from, each
   part's own thicknesses and glass, and each part's place along the axis from the gaps (the first
   vertex stays where it is). The prescription keeps the parts in the same order; a lens's surfaces
   may be more or fewer than it had (a surface inserted or taken out in the design). */
export function asmApply(asm, P, els) {
  els = els || asmMembers(asm);
  const byId = new Map(els.map(e => [e.id, e]));
  let z = 0, k = 0;
  P.parts.forEach((p, pi) => {
    const e = byId.get(p.id), S = P.surfaces.slice(k, k + p.n), G = P.gaps.slice(k, k + p.n - 1), M = P.materials.slice(k, k + p.n - 1);
    const zFirst = z;
    for (let i = 0; i < p.n - 1; i++) z += P.gaps[k + i];
    const zLast = z, c = (zFirst + zLast) / 2;
    // moved only when it moves: a prescription written back unchanged leaves every place exactly as it was
    const nx = P.origin[0] + P.dir[0] * c, ny = P.origin[1] + P.dir[1] * c;
    if (Math.hypot(nx - e.x, ny - e.y) > 1e-9) { e.x = nx; e.y = ny; }
    if (p.kind === 'stop') e.aperture = 2 * S[0].semi;
    else if (p.kind === 'lens') {
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
    k += p.n;
    if (pi < P.parts.length - 1) z += P.gaps[k - 1];
  });
}

/* first-order figures of the prescription at one wavelength: its focal length and back focal distance */
export function asmParaxial(P, nm, paraxial) {
  return paraxial({ surfaces: P.surfaces, gaps: P.gaps, materials: P.materials }, nm);
}
