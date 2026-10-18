import { DESIGN_KEY, MC_MAX, asmApply, asmMembers, asmPrescription, normCond, normDesign } from '../core/assembly.js';
import { deg, nextName, project, uid } from '../state/project.js';
import { normElement } from '../state/elements.js';
import { LENS } from '../parts/lens.js';
import { lensSystem, seidel } from './lens-engine.js';
import { sagInPlane } from '../core/sag.js';

/* ==========================================================================
   Lens design: an assembly worked on as a lens designer works on it
   The prescription (core/assembly.js) is the parts read along their axis; the design adds what a
   designer sets around it, kept on the assembly's record as "design":
     image: the distance from the last surface to the image plane (mm);
     vars: what an optimiser may change, each a key (below);
     solves: values worked out from others: the image distance at the paraxial focus ("focus"), a
       radius that gives the system an F-number ("fno", v), a thickness that gives an edge
       thickness ("edge", v);
     pickups: a value that follows another, times a scale plus an offset.
   A key names one value of one surface by where it came from, so it survives surfaces inserted
   or taken out around it: "R:<part id>.<surface>", "k:..." (its conic), "t:..." (the gap after it),
   "g:..." (the glass after it), "a4:..." to "a16:..." (its even aspheric coefficients, A4 to A16),
   "p2:..." to "p8:..." (a diffractive face's phase terms, on ρ² to ρ⁸, radians), "n2:..." to "n6:..." (a graded
   glass's terms on r² to r⁶, the glass after that surface),
   "T:..." and "D:..." on a part's first surface (the part's tilt in degrees and decentre in mm, about
   its first vertex), and "t:image". Solves and pickups are worked out after every change, and the result is written
   back to the parts: the bench is always the design.
   ========================================================================== */
export const designOf = asm => (asm.design = asm.design && asm.design.solves ? asm.design : normDesign(asm.design));
/* ---------- Where a key is in the prescription ---------- */
export const sidOf = s => s.from.id + '.' + s.from.i + (s.from.v ? '~' + s.from.v : '');
export function keyAt(P, q, i) { return q === 't' && i === P.surfaces.length - 1 ? 't:image' : q + ':' + sidOf(P.surfaces[i]); }
export function posOf(P, key) {
  const N = P.surfaces.length;
  if (key === 't:image') return { q: 't', i: N - 1, image: true };
  const m = DESIGN_KEY.exec(key);
  if (!m) return null;
  const i = P.surfaces.findIndex(s => sidOf(s) === m[2]);
  if (i < 0) return null;
  return { q: m[1], i, image: m[1] === 't' && i === N - 1 };
}
/* which part each surface is on: its index in P.parts, its kind, its place among the part's surfaces */
export function surfaceParts(P) {
  const out = [];
  P.parts.forEach((p, pi) => { for (let j = 0; j < p.n; j++) out.push({ pi, kind: p.kind, id: p.id, j, n: p.n }); });
  return out;
}
/* what can be changed: a lens's or a mirror's radii; an asphere's or a mirror's conic and aspheric terms; any gap; a lens's glass (the gaps inside it) */
export function editable(P, q, i) {
  const sp = surfaceParts(P)[i], s = P.surfaces[i];
  if (!sp) return false;
  // a face met again copies its first meeting (core/assembly.js lensVisits): edited there
  if (s && s.link) return false;
  if (q === 't' && s && s.glink !== undefined) return false;
  if (q === 'R') return sp.kind === 'lens' || sp.kind === 'mirror';
  // a conic and aspheric terms: an asphere's (a plain lens's surfaces are spheres) and a mirror's conic
  if (q === 'k') return sp.kind === 'mirror' || sp.kind === 'lens' && !!P.parts[sp.pi].asph;
  if (q[0] === 'a' || q[0] === 'f') return sp.kind === 'mirror' || sp.kind === 'lens' && !!P.parts[sp.pi].asph;
  // a diffractive lens's phase terms
  if (q[0] === 'p') return sp.kind === 'lens' && !!P.parts[sp.pi].diff;
  // a graded lens's glass (the gap after the surface, inside the lens)
  if (q[0] === 'n') return sp.kind === 'lens' && !!P.parts[sp.pi].grin && sp.j < sp.n - 1 && P.materials[i].glass !== 'AIR';
  if (q === 'T') return sp.j === 0 && (sp.kind === 'lens' || sp.kind === 'window' || sp.kind === 'mirror');
  if (q === 'D' || q === 'U' || q === 'X') return sp.j === 0 && (sp.kind === 'lens' || sp.kind === 'window');
  if (q === 'g') return sp.kind !== 'stop' && sp.j < sp.n - 1;
  return true;
}
export function getV(P, at) {
  if (at.q === 'R') return P.surfaces[at.i].R;
  if (at.q === 'k') return P.surfaces[at.i].k;
  if (at.q[0] === 'a') return asphGet(P.surfaces[at.i], +at.q.slice(1));
  if (at.q[0] === 'f') { const F = P.surfaces[at.i].F; return F && F[at.q.slice(1)] || 0; }
  if (at.q[0] === 'p') { const ph = P.surfaces[at.i].ph; return ph && ph[+at.q[1] / 2 - 1] || 0; }
  if (at.q[0] === 'n') { const G = P.materials[at.i] && P.materials[at.i].grad; return G && G[+at.q[1] / 2 - 1] || 0; }
  if (at.q === 'T') { const t = P.surfaces[at.i].tilt; return t ? t[0] / deg : 0; }
  if (at.q === 'D') { const d = P.surfaces[at.i].dec; return d ? d[1] : 0; }
  if (at.q === 'U') { const t = P.surfaces[at.i].tilt; return t ? (t[1] || 0) / deg : 0; }
  if (at.q === 'X') { const d = P.surfaces[at.i].dec; return d ? d[0] || 0 : 0; }
  return at.image ? P.image : P.gaps[at.i];
}
/* a part posed about its first vertex (surface i): tilted t degrees in the plane of the fields and moved
   ov mm across, and tilted u degrees out of it and moved ox mm up (the engine's x), each of its surfaces
   carried round with it as the prescription reads them off the bench */
export function partPose(P, i, t, ov, u, ox) {
  const sps = surfaceParts(P), pi = sps[i].pi, tr = t * deg, tb = (u || 0) * deg, ct = Math.cos(tr), st = Math.sin(tr), cb = Math.cos(tb), sb = Math.sin(tb);
  const g = [sb, st * cb, ct * cb];
  ox = ox || 0;
  let cum = 0;
  for (let k = i; k < P.surfaces.length && sps[k].pi === pi; k++) {
    if (k > i) cum += P.gaps[k - 1];
    const s = P.surfaces[k] = Object.assign({}, P.surfaces[k]);
    if (Math.abs(tr) > 1e-12 || Math.abs(tb) > 1e-12 || Math.abs(ov + cum * g[1]) > 1e-9 || Math.abs(ox + cum * g[0]) > 1e-9) { s.tilt = [tr, tb]; s.dec = [ox + cum * g[0], ov + cum * g[1], cum * (g[2] - 1)]; }
    else { delete s.tilt; delete s.dec; }
  }
}
const TILT_LIM = 29.9;      // a lens's tilt, within what an assembly allows (30°)
/* a surface's even aspheric coefficient of order n (A4 is s.A[0]), and set: the list as long as it needs, no zeros trailing */
export const asphGet = (s, n) => (s.A || [])[(n - 4) / 2] || 0;
export function asphSet(s, n, v) {
  const A = (s.A || []).slice(), j = (n - 4) / 2;
  while (A.length <= j) A.push(0);
  A[j] = isFinite(v) ? v : 0;
  while (A.length && !A[A.length - 1]) A.pop();
  s.A = A;
}
export function setV(P, at, v) {
  if (!editable(P, at.q, at.i)) return;
  if (at.q === 'R') P.surfaces[at.i].R = v === null || !isFinite(v) || Math.abs(v) > 1e9 || v === 0 ? null : v;
  else if (at.q === 'k') P.surfaces[at.i].k = isFinite(v) ? v : 0;
  else if (at.q[0] === 'a') asphSet(P.surfaces[at.i], +at.q.slice(1), v);
  else if (at.q[0] === 'f') { const s = P.surfaces[at.i], F = Object.assign({}, s.F || {}); F[at.q.slice(1)] = isFinite(v) ? v : 0; s.F = F; }
  else if (at.q[0] === 'p') { const s = P.surfaces[at.i], ph = (s.ph || [0, 0, 0, 0]).slice(); ph[+at.q[1] / 2 - 1] = isFinite(v) ? v : 0; s.ph = ph; }
  else if (at.q[0] === 'n') {
    const m = P.materials[at.i] = Object.assign({}, P.materials[at.i]), G = (m.grad || []).slice();
    while (G.length < 3) G.push(0);
    G[+at.q[1] / 2 - 1] = isFinite(v) ? v : 0;
    while (G.length && !G[G.length - 1]) G.pop();
    if (G.length) m.grad = G; else delete m.grad;
  }
  else if (at.q === 'T' || at.q === 'D' || at.q === 'U' || at.q === 'X') {
    const s = P.surfaces[at.i], t0 = s.tilt ? s.tilt[0] / deg : 0, d0 = s.dec ? s.dec[1] : 0, u0 = s.tilt ? (s.tilt[1] || 0) / deg : 0, x0 = s.dec ? s.dec[0] || 0 : 0, mir = !!s.mirror;
    const t = at.q === 'T' && isFinite(v) ? (mir ? Math.max(-80, Math.min(80, v)) : Math.max(-TILT_LIM, Math.min(TILT_LIM, v))) : t0;
    const u = at.q === 'U' && isFinite(v) ? Math.max(-TILT_LIM, Math.min(TILT_LIM, v)) : u0;
    partPose(P, at.i, t, at.q === 'D' && isFinite(v) ? v : d0, u, at.q === 'X' && isFinite(v) ? v : x0);
  }
  else if (at.image) P.image = isFinite(v) ? v : P.image;
  else if (isFinite(v)) P.gaps[at.i] = Math.max(0, v);
}
/* a surface's sag at height h in the plane of the fields (core/sag.js; NaN beyond a sphere's edge) */
export const surfSag = sagInPlane;

/* ---------- Conditions and first order ---------- */
export const primaryNm = c => c.waves[c.primary].nm;
/* the object's distance before the first surface the conditions give (0 for infinity), and the
   options a system is made with for it */
export const objectOf = c => c.object && c.object.kind === 'finite' ? c.object.d : 0;
export const objOpts = (c, o) => Object.assign({}, o, objectOf(c) ? { object: objectOf(c) } : {});
/* the entrance pupil's diameter the conditions give: as set; or for a working F-number in image space,
   from the marginal ray's last angle per unit pupil (the focal length over the F-number, from infinity);
   or for an object-space NA, from the object's distance to the pupil. S0: the system at the primary wavelength */
export function designEpd(c, S0) {
  if (c.aperture.kind === 'epd') return c.aperture.v;
  const u = S0 && S0.par ? Math.abs(S0.par.uEp) : 0;
  if (c.aperture.kind === 'na') { const d = objectOf(c); return d ? 2 * (d + S0.par.epz) * Math.tan(Math.asin(Math.min(0.999, c.aperture.v))) : 10; }
  return u > 0 && isFinite(u) ? 1 / (c.aperture.v * u) : 10;
}
export function designPrescription(asm) {
  const P = asmPrescription(asm), D = designOf(asm);
  P.image = D.image;
  // the image distance is the design's alone: kept at focus whatever changed the parts on the bench
  if (D.solves['t:image']) { const b = lensSystem(P, primaryNm(asm.cond), objOpts(asm.cond)).par.back; if (isFinite(b)) P.image = D.image = b; }
  return P;
}
export function designSystem(asm, P, nm) {
  const c = asm.cond, S0 = lensSystem(P, primaryNm(c), objOpts(c));
  return lensSystem(P, nm || primaryNm(c), objOpts(c, { epd: designEpd(c, S0), image: P.image }));
}

/* ---------- Solves and pickups ----------
   Pickups first, then each solve, then the pickups again (a solved value may be picked up), twice
   over so a chain settles; then the image distance; then the stop opened to the entrance pupil the
   conditions set. Returns notes on any solve that could not be met. */
function pickupAll(D, P) {
  for (const [k, p] of Object.entries(D.pickups)) {
    const at = posOf(P, k), src = posOf(P, p.from);
    if (!at || !src) continue;
    const v = getV(P, src);
    setV(P, at, v === null ? (at.q === 'R' ? null : 0) : p.scale * v + p.off);
  }
}
export function solveDesign(asm, P) {
  const D = designOf(asm), c = asm.cond, nm = primaryNm(c), notes = [];
  const efl = () => lensSystem(P, nm).par.efl;
  for (let pass = 0; pass < 2; pass++) {
    pickupAll(D, P);
    for (const [k, s] of Object.entries(D.solves)) {
      const at = posOf(P, k);
      if (!at || s.kind === 'focus') continue;
      if (s.kind === 'edge') {
        const a = P.surfaces[at.i], b = P.surfaces[at.i + 1];
        const hs = [a.semi, b.semi].filter(v => v > 0 && isFinite(v)), hh = hs.length ? Math.min(...hs) : 0;
        const t = s.v - surfSag(b, hh) + surfSag(a, hh);
        if (isFinite(t) && t >= 0) P.gaps[at.i] = t;
        else if (pass) notes.push('The edge thickness ' + s.v + ' mm can’t be met on surface ' + (at.i + 1) + '.');
      } else if (s.kind === 'fno') {
        if (c.aperture.kind !== 'epd') { if (pass) notes.push('The F-number solve on surface ' + (at.i + 1) + ' needs the aperture given as an entrance pupil diameter.'); continue; }
        // the system's power is affine in this surface's curvature: two traces give it
        const sf = P.surfaces[at.i], c0 = sf.R ? 1 / sf.R : 0, d = 1e-3;
        const p0 = 1 / efl();
        sf.R = 1 / (c0 + d);
        const p1 = 1 / efl(), want = 1 / (s.v * c.aperture.v);
        const c1 = Math.abs(p1 - p0) > 1e-15 ? c0 + (want - p0) * d / (p1 - p0) : c0;
        sf.R = Math.abs(c1) < 1e-12 ? null : 1 / c1;
        if (!isFinite(c1) && pass) notes.push('The F-number solve on surface ' + (at.i + 1) + ' has no answer.');
      }
    }
    pickupAll(D, P);
  }
  if (D.solves['t:image']) {
    const b = lensSystem(P, nm, objOpts(c)).par.back;
    if (isFinite(b)) P.image = b; else notes.push('The system is afocal: it has no paraxial focus.');
  }
  // the stop opens to suit the entrance pupil the conditions set
  if (P.stopIndex >= 0) {
    const S = designSystem(asm, P);
    if (isFinite(S.stopR) && S.stopR > 0) P.surfaces[P.stopIndex].semi = S.stopR;
  }
  D.image = P.image;
  return notes;
}
/* a change made: solved, written to the parts; with configurations, the active one's values kept as
   its own and every other configuration solved again round the change */
export function commitDesign(asm, P) {
  const notes = solveDesign(asm, P);
  asmApply(asm, P);
  mcStore(asm, P);
  mcRefresh(asm, P);
  return notes;
}

/* ---------- Configurations ----------
   The active configuration is the one on the bench: its values are the parts' and its object's
   distance is the conditions'. Each other one keeps its own values for the keys the configurations
   list, and its own object distance; the rest it shares. */
export const mcOf = D => D && D.mc && D.mc.configs && D.mc.configs.length > 1 ? D.mc : null;
/* the conditions configuration ci is designed for: the object moved to its own distance */
export function cfgCond(c, cfg) {
  if (!cfg || !(cfg.obj > 0) || !(c.object && c.object.kind === 'finite')) return c;
  return Object.assign({}, c, { object: { kind: 'finite', d: cfg.obj } });
}
const mcClone = P => Object.assign({}, P, { surfaces: P.surfaces.map(s => Object.assign({}, s)), gaps: P.gaps.slice(), materials: P.materials.map(m => Object.assign({}, m)) });
/* configuration ci's values put into P (a prescription of the shared values) */
export function cfgApply(P, M, ci) {
  const cfg = M.configs[ci];
  for (const k of M.keys) { const at = posOf(P, k); if (at && k in cfg.v) setV(P, at, cfg.v[k]); }
}
/* configuration ci, solved: P (any configuration's prescription) with its values; D.image is left as it was */
export function cfgSolved(asm, P, ci) {
  const D = designOf(asm), M = mcOf(D), Pc = mcClone(P), img = D.image;
  cfgApply(Pc, M, ci);
  const notes = solveDesign({ cond: cfgCond(asm.cond, M.configs[ci]), design: D }, Pc);
  D.image = img;
  Pc.notes = notes;
  return Pc;
}
/* the active configuration's values (from P, as on the bench) kept as its own */
export function mcStore(asm, P) {
  const M = mcOf(designOf(asm));
  if (!M) return;
  const cfg = M.configs[M.active];
  for (const k of M.keys) { const at = posOf(P, k); if (at) cfg.v[k] = getV(P, at); }
  if (asm.cond.object && asm.cond.object.kind === 'finite') cfg.obj = asm.cond.object.d;
}
/* every other configuration solved again (a solved value it keeps, such as its own focus, follows a change made in another) */
function mcRefresh(asm, P) {
  const M = mcOf(designOf(asm));
  if (!M) return;
  M.configs.forEach((cfg, ci) => {
    if (ci === M.active) return;
    const Pc = cfgSolved(asm, P, ci);
    for (const k of M.keys) { const at = posOf(Pc, k); if (at) cfg.v[k] = getV(Pc, at); }
  });
}
/* another configuration made active: its values onto the bench, its object distance into the conditions */
export function mcSwitch(asm, ci) {
  const D = designOf(asm), M = mcOf(D);
  if (!M || ci === M.active || !M.configs[ci]) return false;
  mcStore(asm, designPrescription(asm));
  M.active = ci;
  const cfg = M.configs[ci];
  if (cfg.obj > 0 && asm.cond.object && asm.cond.object.kind === 'finite') asm.cond = normCond(Object.assign({}, asm.cond, { object: { kind: 'finite', d: cfg.obj } }));
  const P = designPrescription(asm);
  cfgApply(P, M, ci);
  if (M.keys.includes('t:image')) D.image = P.image;
  commitDesign(asm, P);
  return true;
}
/* a configuration added, a copy of the active one (the first time, two: the design as it is, and its copy) */
export function mcAdd(asm) {
  const D = designOf(asm);
  let M = mcOf(D);
  if (!M) {
    const c0 = { name: 'Configuration 1', w: 1, v: {} };
    if (asm.cond.object && asm.cond.object.kind === 'finite') c0.obj = asm.cond.object.d;
    D.mc = M = { keys: [], configs: [c0], active: 0 };
  }
  if (M.configs.length >= MC_MAX) return 'A design has at most ' + MC_MAX + ' configurations.';
  mcStore(asm, designPrescription(asm));
  const a = M.configs[M.active], n = M.configs.length + 1;
  M.configs.push({ name: 'Configuration ' + n, w: a.w, v: Object.assign({}, a.v), ...(a.obj ? { obj: a.obj } : {}) });
  return true;
}
/* configuration ci taken out (the active one hands over to its neighbour); with one left, the design has none */
export function mcRemove(asm, ci) {
  const D = designOf(asm), M = mcOf(D);
  if (!M || !M.configs[ci]) return false;
  if (ci === M.active) mcSwitch(asm, ci ? ci - 1 : 1);
  M.configs.splice(ci, 1);
  if (M.active > ci) M.active--;
  // an operand in that configuration only goes with it; those in later ones follow their configuration
  D.merit.ops = D.merit.ops.filter(o => o.c !== ci).map(o => o.c > ci ? Object.assign({}, o, { c: o.c - 1 }) : o);
  if (M.configs.length < 2) delete D.mc;
  return true;
}
/* a key made to differ between the configurations (each starts from the value it has now), or made shared again (the active one's value kept) */
export function mcKey(asm, P, key, on) {
  const D = designOf(asm), M = mcOf(D);
  if (!M) return false;
  const at = posOf(P, key);
  if (!at || key[0] === 'g') return false;
  if (on) {
    if (M.keys.includes(key)) return false;
    M.keys.push(key);
    const v = getV(P, at);
    for (const cfg of M.configs) cfg.v[key] = v;
  } else {
    M.keys = M.keys.filter(k => k !== key);
    for (const cfg of M.configs) delete cfg.v[key];
  }
  return true;
}
/* one configuration's value of a key (the active one's is the bench's) */
export function mcValue(asm, P, ci, key) {
  const M = mcOf(designOf(asm));
  if (!M || ci === M.active) { const at = posOf(P, key); return at ? getV(P, at) : null; }
  return M.configs[ci].v[key];
}

/* ---------- Surfaces and lenses in and out ----------
   Each edit keeps every other surface where it was along the axis (an inserted lens pushes those
   after it back, by its thickness and a gap), and the design's keys follow their surfaces. */
function reKey(asm, P, edit) {
  const D = designOf(asm), N0 = P.surfaces.length;
  const pos = k => { const at = posOf(P, k); return at ? { q: at.q, i: at.image ? -1 : at.i } : null; };
  const vars = D.vars.map(k => [pos(k)]), solves = Object.entries(D.solves).map(([k, s]) => [pos(k), s]);
  const picks = Object.entries(D.pickups).map(([k, p]) => [pos(k), pos(p.from), p]);
  const mcKeys = mcOf(D) ? D.mc.keys.map(k => [k, pos(k)]) : null;
  const map = edit();
  if (!map) return false;
  asmApply(asm, P);
  const P2 = asmPrescription(asm);
  P2.image = P.image;
  const back = a => { if (!a) return null; if (a.i === -1) return 't:image'; const j = map(a.i); return j < 0 || j >= P2.surfaces.length ? null : keyAt(P2, a.q, j); };
  const nd = { image: P.image, vars: vars.map(([a]) => back(a)).filter(Boolean), solves: {}, pickups: {}, merit: D.merit, tol: D.tol };
  for (const [a, s] of solves) { const k = back(a); if (k) nd.solves[k] = s; }
  for (const [a, f, p] of picks) { const k = back(a), kf = back(f); if (k && kf) nd.pickups[k] = Object.assign({}, p, { from: kf }); }
  if (mcKeys) {
    const ks = mcKeys.map(([k, a]) => [k, back(a)]).filter(([, k2]) => k2);
    nd.mc = { active: D.mc.active, keys: ks.map(([, k2]) => k2), configs: D.mc.configs.map(c => Object.assign({}, c, { v: Object.fromEntries(ks.filter(([k]) => k in c.v).map(([k, k2]) => [k2, c.v[k]])) })) };
  }
  void N0;
  asm.design = normDesign(nd);
  commitDesign(asm, P2);
  return true;
}
const zsOf = P => { const z = [0]; for (const g of P.gaps) z.push(z[z.length - 1] + g); return z; };
const gapsFrom = (P, z) => { P.gaps = z.slice(1).map((v, i) => Math.max(0, v - z[i])); };
/* a flat surface after surface i: inside a lens, splitting the glass after it in two (a cemented
   doublet); after a lens's last surface, a new glass 2 mm thick behind it, the rest pushed back */
/* the kinds of surface the element data can insert: each sets the new surface's shape, and marks the part for
   what the surface needs (an asphere's conic, a freeform's terms, a diffractive face's phase, a graded glass) */
export const SURFACE_KINDS = [
  ['flat', 'Flat', 'A plane surface'], ['sphere', 'Spherical', 'A sphere, 100 mm in radius to start'],
  ['conic', 'Conic (asphere)', 'A conic surface: a paraboloid to start, with aspheric terms to add; the part becomes an asphere'],
  ['freeform', 'Freeform', 'An XY polynomial surface, flat to start; the part becomes an asphere'],
  ['diffractive', 'Diffractive', 'A flat face carrying a diffractive phase, nil to start; the part becomes a diffractive lens'],
  ['graded', 'Graded glass', 'A flat surface, the glass after it graded from the axis (its terms nil to start); the part becomes a graded lens'],
  ['same', 'Duplicate surface type', 'A surface of the same kind as the one selected: its radius and conic, with the same kinds of term, nil'],
];
const LINKED_MSG = 'That row is the light meeting a face again: the face is edited at its first row.';
export function insertSurface(asm, P, i, kind = 'flat') {
  if (P.surfaces[i] && (P.surfaces[i].link || P.surfaces[i].glink !== undefined || P.surfaces[i].mz)) return P.surfaces[i].link ? LINKED_MSG : 'A surface cannot be added inside a lens with a mirrored face.';
  const sps = surfaceParts(P), sp = sps[i];
  if (!sp || sp.kind !== 'lens') return 'Pick a surface of a lens: a stop or a window takes no more surfaces. Insert an element instead.';
  if (!SURFACE_KINDS.some(k => k[0] === kind)) return 'No such kind of surface.';
  return reKey(asm, P, () => {
    const z = zsOf(P), last = sp.j === sp.n - 1, glass = last ? Object.assign({}, P.materials[i - 1] || { glass: 'N-BK7' }) : null;
    const s = { R: null, k: 0, a2: 0, A: [], odd: null, semi: P.surfaces[i].semi, from: { id: sp.id, i: -1 } };
    const el = project.elements.find(e => e.id === sp.id), s0 = P.surfaces[i];
    if (kind === 'sphere') s.R = 100;
    else if (kind === 'conic') { s.R = 100; s.k = -1; if (el) el.asphere = true; }
    else if (kind === 'freeform') { s.F = { 20: 0, '02': 0 }; if (el) el.asphere = true; }
    else if (kind === 'diffractive') { s.ph = [0]; s.dm = (el && el.diffOrder) || 1; if (el) el.diffractive = true; }
    else if (kind === 'same') {
      s.R = s0.R; s.k = s0.k || 0;
      if (s0.A && s0.A.some(a => a)) s.A = s0.A.map(() => 0);
      if (s0.F) { s.F = {}; for (const key of Object.keys(s0.F)) s.F[key] = 0; }
      if (s0.ph) { s.ph = s0.ph.map(() => 0); s.dm = s0.dm || 1; }
      if (s0.cyl) s.cyl = s0.cyl;
    }
    if (kind === 'graded' && el) el.graded = true;
    if (!last) {
      z.splice(i + 1, 0, (z[i] + z[i + 1]) / 2);
      P.materials.splice(i, 0, Object.assign({}, P.materials[i]));
    } else {
      for (let j = i + 1; j < z.length; j++) z[j] += 2;
      z.splice(i + 1, 0, z[i] + 2);
      P.materials.splice(i, 0, glass);
    }
    if (kind === 'graded') P.materials[i + 1] = Object.assign({}, P.materials[i + 1], { grad: (P.materials[i + 1].grad || [0, 0, 0]).slice() });
    P.surfaces.splice(i + 1, 0, s);
    gapsFrom(P, z);
    P.parts[sp.pi].n++;
    return j => j <= i ? j : j + 1;
  }) || 'Nothing was inserted.';
}
/* the kinds of element the element data can insert: a flat singlet, or one of the bench's lens presets (parts/lens.js) */
export const ELEMENT_KINDS = [
  ['singlet', 'Singlet', 'A flat N-BK7 singlet, 2 mm thick, as wide as the design'],
  ['asphere', 'Asphere', 'The bench\u2019s asphere: a conic front face with aspheric terms to add'],
  ['diffractive', 'Diffractive lens', 'The bench\u2019s diffractive lens: a hybrid achromat, its flat face carrying a phase'],
  ['grinrod', 'GRIN rod lens', 'The bench\u2019s graded-index rod lens, a quarter of its pitch long'],
  ['cylinder', 'Cylindrical lens', 'The bench\u2019s cylindrical lens, curved in the plane of the fields'],
  ['mangin', 'Mangin mirror', 'A meniscus whose back face is mirrored: the light crosses the glass twice and comes back'],
  ['solidtel', 'Solid telescope', 'A block of glass with a mirrored spot on its front face and a mirrored annulus on its back: a solid Cassegrain, the image behind the hole'],
];
/* a new element after the part surface i is on, in the gap after it, the rest pushed back if the gap is
   short of room; i 'front': before the first surface. kind: one of ELEMENT_KINDS (a flat singlet unless given) */
export function insertSinglet(asm, P, i, kind = 'singlet') {
  const sps = surfaceParts(P), front = i === 'front';
  i = front ? 0 : i === undefined || i < 0 ? P.surfaces.length - 1 : i;
  const sp = sps[i], after = front ? -1 : i + (sp.n - 1 - sp.j);        // the part's last surface (or before them all)
  if (!ELEMENT_KINDS.some(k => k[0] === kind)) return 'No such kind of element.';
  let el = null;
  const ok = reKey(asm, P, () => {
    const z = zsOf(P);
    const semi = Math.min(25, Math.max(...P.surfaces.filter(s => isFinite(s.semi) && s.semi > 0).map(s => s.semi), 5));
    el = newPart(asm, P, semi, kind);
    const S = partSurfaces(el), M = partMaterials(el), n = S.length, T = el.gaps.reduce((a, b) => a + b, 0);
    const zs = [0]; for (const g of el.gaps) zs.push(zs[zs.length - 1] + g);
    if (front) {
      // before the first surface, 2 mm clear of it: the first vertex moves back, nothing else does
      z.unshift(...zs.map(v => v - T - 2));
      P.surfaces.unshift(...S);
      P.materials.unshift(...M, { glass: 'AIR' });
      P.origin = [P.origin[0] - P.dir[0] * (T + 2), P.origin[1] - P.dir[1] * (T + 2)];
      gapsFrom(P, z.map(v => v - z[0]));
      P.parts.unshift({ id: el.id, kind: 'lens', flip: false, n });
      return j => j + n;
    }
    const wasLast = after === P.surfaces.length - 1;
    const room = !wasLast ? P.gaps[after] : P.image;
    const lead = !wasLast ? Math.max(1, (room - T) / 2) : Math.max(1, Math.min(5, room / 4));
    const push = !wasLast ? Math.max(0, lead + T + 1 - room) : 0;
    for (let j = after + 1; j < z.length; j++) z[j] += push;
    const za = z[after] + lead;
    z.splice(after + 1, 0, ...zs.map(v => za + v));
    P.surfaces.splice(after + 1, 0, ...S);
    P.materials.splice(after, 0, { glass: 'AIR' }, ...M);
    gapsFrom(P, z);
    if (wasLast) P.image = Math.max(1, P.image - lead - T);
    P.parts.splice(sp.pi + 1, 0, { id: el.id, kind: 'lens', flip: false, n });
    return j => j <= after ? j : j + n;
  });
  return ok ? el : 'Nothing was inserted.';
}
/* the new part on the bench, at the assembly's reference and along its axis: a flat singlet as wide as asked,
   or a lens preset as the bench makes it (its own size) */
function newPart(asm, P, semi, kind) {
  const ref = project.elements.find(e => e.id === asm.ref) || asmMembers(asm)[0], ang = Math.atan2(P.dir[1], P.dir[0]) / deg;
  const base = kind === 'singlet' ? { type: 'lens', name: nextName('Singlet'), diameter: 2 * semi, surfaces: [{ R: null }, { R: null }], gaps: [2], materials: [{ glass: 'N-BK7' }] }
    : LENS.make(ref.x, ref.y, kind);
  const el = normElement(Object.assign(base, { id: uid(), x: ref.x, y: ref.y, z: ref.z, angle: ang, group: asm.id, bench: asm.bench }));
  if (ref.z === undefined) delete el.z;
  project.elements.push(el);
  return el;
}
/* the part's surfaces and the glasses between them as the prescription holds them (as asmPrescription reads a lens) */
const partSurfaces = el => el.surfaces.map((s, j) => ({ R: s.R, k: s.k || 0, a2: s.a2 || 0, A: (s.A || []).slice(), odd: s.odd ? s.odd.slice() : null, semi: el.diameter / 2, from: { id: el.id, i: j },
  ...(s.F ? { F: Object.assign({}, s.F) } : {}), ...(s.ph ? { ph: s.ph.slice(), dm: el.diffOrder || 1 } : {}), ...(el.cyl ? { cyl: el.cyl } : {}) }));
const partMaterials = el => el.materials.map(m => Object.assign({ glass: m.glass }, m.grad ? { grad: m.grad.slice() } : {}));
/* surface i taken out: a lens of two surfaces goes whole (the gaps either side and its glass
   becoming one gap); a lens's extra surface goes, the glass either side becoming one */
export function removeSurface(asm, P, i) {
  if (P.surfaces[i] && P.surfaces[i].link) return LINKED_MSG;
  const sps = surfaceParts(P), sp = sps[i];
  if (!sp || sp.kind === 'stop') return 'The stop stays: it sets the aperture. Split the assembly to take it out.';
  if (sp.kind === 'mirror') return 'The mirror stays: it folds the axis. Split the assembly to take it out.';
  if (sp.kind === 'window' || sp.n <= 2) {
    const lenses = P.parts.filter(p => p.kind === 'lens' || p.kind === 'window').length;
    if (lenses < 2) return 'An assembly keeps at least one lens.';
    const a = i - sp.j, b = a + sp.n - 1, id = sp.id;
    const ok = reKey(asm, P, () => {
      const z = zsOf(P);
      z.splice(a, b - a + 1);
      P.surfaces.splice(a, b - a + 1);
      // the glass and one of the airs either side
      if (b < P.materials.length) P.materials.splice(a, b - a + 1); else P.materials.splice(a - 1, b - a + 1);
      const z0 = z[0];
      P.origin = [P.origin[0] + P.dir[0] * z0, P.origin[1] + P.dir[1] * z0];
      gapsFrom(P, z.map(v => v - z0));
      P.parts.splice(sp.pi, 1);
      project.elements = project.elements.filter(e => e.id !== id);
      return j => j < a ? j : j > b ? j - (b - a + 1) : -1;
    });
    return ok || 'Nothing was taken out.';
  }
  const ok = reKey(asm, P, () => {
    const z = zsOf(P);
    z.splice(i, 1);
    P.surfaces.splice(i, 1);
    if (sp.j === sp.n - 1) P.materials.splice(i - 1, 1); else P.materials.splice(i, 1);
    const z0 = z[0];
    P.origin = [P.origin[0] + P.dir[0] * z0, P.origin[1] + P.dir[1] * z0];
    gapsFrom(P, z.map(v => v - z0));
    P.parts[sp.pi].n--;
    return j => j < i ? j : j > i ? j - 1 : -1;
  });
  return ok || 'Nothing was taken out.';
}

/* ---------- What the design gives ----------
   First order at the primary wavelength and the Seidel sums over the largest field */
export function designFigures(asm, P) {
  const c = asm.cond, nms = c.waves.map(w => w.nm), S = designSystem(asm, P);
  const lo = Math.min(...nms), hi = Math.max(...nms), o = objOpts(c, { epd: 2 * S.epr, image: P.image });
  const Ss = hi > lo ? lensSystem(P, lo, o) : null, Sl = hi > lo ? lensSystem(P, hi, o) : null;
  const fmax = Math.max(...c.fields.map(f => Math.abs(f.deg)));
  const efl = S.par.efl, d = objectOf(c);
  // the working F-number from the marginal ray's last angle (from infinity, the focal length over the pupil)
  const fno = Math.abs(S.par.uEp) > 0 ? 1 / (2 * S.epr * Math.abs(S.par.uEp)) : Infinity;
  return { S, epd: 2 * S.epr, efl, bfl: S.par.bfl, fno, track: P.gaps.reduce((a, b) => a + b, 0) + P.image,
    epz: S.par.epz, xpz: S.par.xpz - S.z[S.N - 1], imgH: d ? S.par.mag * fmax : efl * Math.tan(fmax * deg), fmax, seidel: seidel(S, fmax, Ss, Sl), lo, hi,
    object: d, mag: d ? S.par.mag : 0, imgDist: S.par.back, na: d ? Math.sin(Math.atan(S.epr / (d + S.par.epz))) : 0 };
}

/* ---------- The light the bench sends it ----------
   From the last trace's rays on its tab: each ray where it crosses a plane just before the first
   surface, going forward and inside its clear radius. Each source gives a field (its rays' mean
   angle to the axis) and its wavelengths; the widest beam, measured square to itself, the
   entrance pupil. Null when no light reaches it. */
export function condFromRays(asm, P, rays, linesOf) {
  const [ox, oy] = P.origin, [dx, dy] = P.dir, s0 = P.surfaces[0];
  const h0 = isFinite(s0.semi) && s0.semi > 0 ? s0.semi : 12.7, sg = surfSag(s0, h0);
  const zp = Math.min(0, isFinite(sg) ? sg : 0) - 0.5;
  const by = new Map();
  for (const r of rays) {
    if (r.bench !== asm.bench) continue;
    const p = r.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const z0 = (p[k] - ox) * dx + (p[k + 1] - oy) * dy, z1 = (p[k + 2] - ox) * dx + (p[k + 3] - oy) * dy;
      if (!(z0 < zp && z1 >= zp)) continue;
      const y0 = -(p[k] - ox) * dy + (p[k + 1] - oy) * dx, y1 = -(p[k + 2] - ox) * dy + (p[k + 3] - oy) * dx;
      const f = (zp - z0) / (z1 - z0), y = y0 + f * (y1 - y0);
      if (Math.abs(y) <= h0 * 1.001) {
        const a = Math.atan2(y1 - y0, z1 - z0);
        if (!by.has(r.src)) by.set(r.src, []);
        by.get(r.src).push({ y, a });
      }
      break;
    }
  }
  if (!by.size) return null;
  const fields = new Set([0]), waves = new Set(), pts = [];
  let epd = 0, na = 0;
  for (const [src, L] of by) {
    const a = L.reduce((s, r) => s + r.a, 0) / L.length;
    fields.add(Math.round(Math.abs(a / deg) * 100) / 100);
    const across = L.map(r => r.y * Math.cos(a));
    epd = Math.max(epd, Math.max(...across) - Math.min(...across));
    for (const nm of linesOf(src)) waves.add(nm);
    // light from a point: its rays' common point, by least squares (each ray the line through (zp, y) at angle a)
    const spread = Math.max(...L.map(r => r.a)) - Math.min(...L.map(r => r.a));
    if (L.length >= 2 && spread > 2e-4) {
      let m11 = 0, m12 = 0, m22 = 0, b1 = 0, b2 = 0;
      for (const r of L) {
        const nz = -Math.sin(r.a), ny = Math.cos(r.a), c = nz * zp + ny * r.y;   // the line: nz z + ny y = c
        m11 += nz * nz; m12 += nz * ny; m22 += ny * ny; b1 += nz * c; b2 += ny * c;
      }
      const det = m11 * m22 - m12 * m12;
      if (Math.abs(det) > 1e-12) {
        const z = (b1 * m22 - b2 * m12) / det, y = (m11 * b2 - m12 * b1) / det;
        if (z < 0) { pts.push({ d: -z, h: y }); na = Math.max(na, Math.sin(spread / 2)); }
      }
    }
  }
  const W = [...waves].filter(nm => nm >= 100 && nm <= 1e7).sort((a, b) => a - b).slice(0, 12);
  const out = { fields: [...fields].sort((a, b) => a - b).slice(0, 12), waves: W, epd, sources: by.size, object: 0 };
  // every source a point at much the same distance: an object there, its fields the points' heights
  if (pts.length === by.size) {
    const d = pts.reduce((s2, q) => s2 + q.d, 0) / pts.length;
    if (pts.every(q => Math.abs(q.d - d) < 0.02 * d + 0.5)) {
      out.object = +d.toPrecision(6); out.na = +na.toPrecision(4);
      out.heights = [...new Set([0, ...pts.map(q => Math.round(Math.abs(q.h) * 1000) / 1000)])].sort((p2, q2) => p2 - q2).slice(0, 12);
    }
  }
  return out;
}
/* conditions to design for from that light: the bench's fields and wavelengths, its beam as the entrance pupil */
export function condFromBench(asm, B) {
  const c = asm.cond;
  if (B.object) return normCond({ object: { kind: 'finite', d: B.object }, aperture: B.na > 0 ? { kind: 'na', v: B.na } : c.aperture,
    fields: B.heights.map(deg => ({ deg, w: 1 })), waves: (B.waves.length ? B.waves : c.waves.map(w => w.nm)).map(nm => ({ nm, w: 1 })),
    primary: B.waves.length ? Math.floor((B.waves.length - 1) / 2) : c.primary });
  return normCond({ aperture: B.epd > 1e-6 ? { kind: 'epd', v: +B.epd.toPrecision(6) } : c.aperture,
    fields: B.fields.map(deg => ({ deg, w: 1 })), waves: (B.waves.length ? B.waves : c.waves.map(w => w.nm)).map(nm => ({ nm, w: 1 })),
    primary: B.waves.length ? Math.floor((B.waves.length - 1) / 2) : c.primary });
}
/* how the bench uses it outside what it is designed for: a list of short sentences, empty when within */
export function condMismatch(asm, B) {
  const c = asm.cond, out = [], d = objectOf(c);
  const fmax = Math.max(...c.fields.map(f => Math.abs(f.deg)));
  if (!d && B.object) out.push('its light comes from a point ' + (+B.object.toPrecision(4)) + ' mm before it, but it is designed for an object at infinity');
  else if (d && !B.object) out.push('its light is parallel, but it is designed for an object ' + (+d.toPrecision(4)) + ' mm before it');
  else if (d) {
    if (Math.abs(B.object - d) > 0.02 * d + 0.5) out.push('its object is ' + (+B.object.toPrecision(4)) + ' mm before it, not the ' + (+d.toPrecision(4)) + ' mm it is designed for');
    const hmax = Math.max(...B.heights);
    if (hmax > fmax * 1.01 + 1e-3) out.push('light from ' + (+hmax.toPrecision(4)) + ' mm off the axis, beyond its fields (to ' + (+fmax.toPrecision(4)) + ' mm)');
  } else {
    const bmax = Math.max(...B.fields);
    if (bmax > fmax + 0.05) out.push('light arrives at ' + (+bmax.toFixed(2)) + '°, beyond its fields (to ' + (+fmax.toFixed(2)) + '°)');
  }
  const nms = c.waves.map(w => w.nm), lo = Math.min(...nms), hi = Math.max(...nms);
  const off = B.waves.filter(nm => nm < lo - 0.5 || nm > hi + 0.5);
  if (off.length) out.push(off.map(nm => +nm.toPrecision(5)).join(', ') + ' nm, outside its wavelengths (' + (lo === hi ? +lo.toPrecision(5) : +lo.toPrecision(5) + ' to ' + (+hi.toPrecision(5))) + ' nm)');
  const epd = designEpd(c, lensSystem(asmPrescription(asm), primaryNm(c), objOpts(c)));
  if (!d && !B.object && B.epd > epd * 1.02 + 1e-3) out.push('a beam ' + (+B.epd.toPrecision(3)) + ' mm across, wider than its entrance pupil (' + (+epd.toPrecision(3)) + ' mm)');
  return out;
}
