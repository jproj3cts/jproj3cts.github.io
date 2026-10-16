import { DESIGN_KEY, asmApply, asmMembers, asmPrescription, normCond, normDesign } from '../core/assembly.js';
import { deg, nextName, project, uid } from '../state/project.js';
import { normElement } from '../state/elements.js';
import { lensSystem, seidel } from './lens-engine.js';

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
   and "t:image". Solves and pickups are worked out after every change, and the result is written
   back to the parts: the bench is always the design.
   ========================================================================== */
export const designOf = asm => (asm.design = asm.design && asm.design.solves ? asm.design : normDesign(asm.design));
/* ---------- Where a key is in the prescription ---------- */
export const sidOf = s => s.from.id + '.' + s.from.i;
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
/* what can be changed: a lens's or a mirror's radii and conics; a lens's aspheric terms; any gap; a lens's glass (the gaps inside it) */
export function editable(P, q, i) {
  const sp = surfaceParts(P)[i];
  if (!sp) return false;
  if (q === 'R' || q === 'k') return sp.kind === 'lens' || sp.kind === 'mirror';
  if (q[0] === 'a') return sp.kind === 'lens';
  if (q === 'g') return sp.kind !== 'stop' && sp.j < sp.n - 1;
  return true;
}
export function getV(P, at) {
  if (at.q === 'R') return P.surfaces[at.i].R;
  if (at.q === 'k') return P.surfaces[at.i].k;
  if (at.q[0] === 'a') return asphGet(P.surfaces[at.i], +at.q.slice(1));
  return at.image ? P.image : P.gaps[at.i];
}
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
  else if (at.image) P.image = isFinite(v) ? v : P.image;
  else if (isFinite(v)) P.gaps[at.i] = Math.max(0, v);
}
/* a surface's sag at height h (NaN beyond a sphere's edge) */
export function surfSag(s, h) {
  const c = s.R ? 1 / s.R : 0, r2 = h * h;
  let v = c ? c * r2 / (1 + Math.sqrt(1 - (1 + (s.k || 0)) * c * c * r2)) : 0;
  v += (s.a2 || 0) * r2;
  let p = r2 * r2;
  for (const a of s.A || []) { v += a * p; p *= r2; }
  let q = h;
  for (const o of s.odd || []) { v += o * q; q *= h; }
  return v;
}

/* ---------- Conditions and first order ---------- */
export const primaryNm = c => c.waves[c.primary].nm;
/* the entrance pupil's diameter the conditions give: as set, or the focal length over the F-number */
export function designEpd(c, efl) {
  if (c.aperture.kind === 'epd') return c.aperture.v;
  return isFinite(efl) && efl ? Math.abs(efl) / c.aperture.v : 10;
}
export function designPrescription(asm) {
  const P = asmPrescription(asm), D = designOf(asm);
  P.image = D.image;
  // the image distance is the design's alone: kept at focus whatever changed the parts on the bench
  if (D.solves['t:image']) { const b = lensSystem(P, primaryNm(asm.cond)).par.bfl; if (isFinite(b)) P.image = D.image = b; }
  return P;
}
export function designSystem(asm, P, nm) {
  const c = asm.cond, S0 = lensSystem(P, primaryNm(c));
  return lensSystem(P, nm || primaryNm(c), { epd: designEpd(c, S0.par.efl), image: P.image });
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
    const b = lensSystem(P, nm).par.bfl;
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
/* a change made: solved, written to the parts */
export function commitDesign(asm, P) {
  const notes = solveDesign(asm, P);
  asmApply(asm, P);
  return notes;
}

/* ---------- Surfaces and lenses in and out ----------
   Each edit keeps every other surface where it was along the axis (an inserted lens pushes those
   after it back, by its thickness and a gap), and the design's keys follow their surfaces. */
function reKey(asm, P, edit) {
  const D = designOf(asm), N0 = P.surfaces.length;
  const pos = k => { const at = posOf(P, k); return at ? { q: at.q, i: at.image ? -1 : at.i } : null; };
  const vars = D.vars.map(k => [pos(k)]), solves = Object.entries(D.solves).map(([k, s]) => [pos(k), s]);
  const picks = Object.entries(D.pickups).map(([k, p]) => [pos(k), pos(p.from), p]);
  const map = edit();
  if (!map) return false;
  asmApply(asm, P);
  const P2 = asmPrescription(asm);
  P2.image = P.image;
  const back = a => { if (!a) return null; if (a.i === -1) return 't:image'; const j = map(a.i); return j < 0 || j >= P2.surfaces.length ? null : keyAt(P2, a.q, j); };
  const nd = { image: P.image, vars: vars.map(([a]) => back(a)).filter(Boolean), solves: {}, pickups: {} };
  for (const [a, s] of solves) { const k = back(a); if (k) nd.solves[k] = s; }
  for (const [a, f, p] of picks) { const k = back(a), kf = back(f); if (k && kf) nd.pickups[k] = Object.assign({}, p, { from: kf }); }
  void N0;
  asm.design = normDesign(nd);
  commitDesign(asm, P2);
  return true;
}
const zsOf = P => { const z = [0]; for (const g of P.gaps) z.push(z[z.length - 1] + g); return z; };
const gapsFrom = (P, z) => { P.gaps = z.slice(1).map((v, i) => Math.max(0, v - z[i])); };
/* a flat surface after surface i: inside a lens, splitting the glass after it in two (a cemented
   doublet); after a lens's last surface, a new glass 2 mm thick behind it, the rest pushed back */
export function insertSurface(asm, P, i) {
  const sps = surfaceParts(P), sp = sps[i];
  if (!sp || sp.kind !== 'lens') return 'Pick a surface of a lens: a stop or a window takes no more surfaces. Insert a singlet instead.';
  return reKey(asm, P, () => {
    const z = zsOf(P), last = sp.j === sp.n - 1, glass = last ? Object.assign({}, P.materials[i - 1] || { glass: 'N-BK7' }) : null;
    const s = { R: null, k: 0, a2: 0, A: [], odd: null, semi: P.surfaces[i].semi, from: { id: sp.id, i: -1 } };
    if (!last) {
      z.splice(i + 1, 0, (z[i] + z[i + 1]) / 2);
      P.materials.splice(i, 0, Object.assign({}, P.materials[i]));
    } else {
      for (let j = i + 1; j < z.length; j++) z[j] += 2;
      z.splice(i + 1, 0, z[i] + 2);
      P.materials.splice(i, 0, glass);
    }
    P.surfaces.splice(i + 1, 0, s);
    gapsFrom(P, z);
    P.parts[sp.pi].n++;
    return j => j <= i ? j : j + 1;
  }) || 'Nothing was inserted.';
}
/* a new flat singlet (N-BK7, 2 mm) after the part surface i is on, in the gap after it, the rest
   pushed back if the gap is short of room; i 'front': before the first surface */
export function insertSinglet(asm, P, i) {
  const sps = surfaceParts(P), front = i === 'front';
  i = front ? 0 : i === undefined || i < 0 ? P.surfaces.length - 1 : i;
  const sp = sps[i], after = front ? -1 : i + (sp.n - 1 - sp.j);        // the part's last surface (or before them all)
  let el = null;
  const ok = reKey(asm, P, () => {
    const z = zsOf(P), T = 2;
    if (front) {
      // before the first surface, 2 mm clear of it: the first vertex moves back, nothing else does
      const semi = Math.min(25, Math.max(...P.surfaces.filter(s => isFinite(s.semi) && s.semi > 0).map(s => s.semi), 5));
      el = newSinglet(asm, P, semi);
      z.unshift(-T - 2, -2);
      P.surfaces.unshift(sing(el, 0, semi), sing(el, 1, semi));
      P.materials.unshift({ glass: 'N-BK7' }, { glass: 'AIR' });
      P.origin = [P.origin[0] - P.dir[0] * (T + 2), P.origin[1] - P.dir[1] * (T + 2)];
      gapsFrom(P, z.map(v => v - z[0]));
      P.parts.unshift({ id: el.id, kind: 'lens', flip: false, n: 2 });
      return j => j + 2;
    }
    const room = after < P.surfaces.length - 1 ? P.gaps[after] : P.image;
    const lead = after < P.surfaces.length - 1 ? Math.max(1, (room - T) / 2) : Math.max(1, Math.min(5, room / 4));
    const push = after < P.surfaces.length - 1 ? Math.max(0, lead + T + 1 - room) : 0;
    for (let j = after + 1; j < z.length; j++) z[j] += push;
    const za = z[after] + lead;
    const semi = Math.min(25, Math.max(...P.surfaces.filter(s => isFinite(s.semi) && s.semi > 0).map(s => s.semi), 5));
    el = newSinglet(asm, P, semi);
    z.splice(after + 1, 0, za, za + T);
    P.surfaces.splice(after + 1, 0, sing(el, 0, semi), sing(el, 1, semi));
    P.materials.splice(after, 0, { glass: 'AIR' }, { glass: 'N-BK7' });
    gapsFrom(P, z);
    if (after === P.surfaces.length - 3) P.image = Math.max(1, P.image - lead - T);
    P.parts.splice(sp.pi + 1, 0, { id: el.id, kind: 'lens', flip: false, n: 2 });
    return j => j <= after ? j : j + 2;
  });
  return ok ? el : 'Nothing was inserted.';
}
function newSinglet(asm, P, semi) {
  const ref = project.elements.find(e => e.id === asm.ref) || asmMembers(asm)[0];
  const el = normElement({ type: 'lens', id: uid(), name: nextName('Singlet'), x: ref.x, y: ref.y, z: ref.z, angle: Math.atan2(P.dir[1], P.dir[0]) / deg, diameter: 2 * semi,
    surfaces: [{ R: null }, { R: null }], gaps: [2], materials: [{ glass: 'N-BK7' }], group: asm.id, bench: asm.bench });
  if (ref.z === undefined) delete el.z;
  project.elements.push(el);
  return el;
}
const sing = (el, j, semi) => ({ R: null, k: 0, a2: 0, A: [], odd: null, semi, from: { id: el.id, i: j } });
/* surface i taken out: a lens of two surfaces goes whole (the gaps either side and its glass
   becoming one gap); a lens's extra surface goes, the glass either side becoming one */
export function removeSurface(asm, P, i) {
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
  const lo = Math.min(...nms), hi = Math.max(...nms), o = { epd: 2 * S.epr, image: P.image };
  const Ss = hi > lo ? lensSystem(P, lo, o) : null, Sl = hi > lo ? lensSystem(P, hi, o) : null;
  const fmax = Math.max(...c.fields.map(f => Math.abs(f.deg)));
  const efl = S.par.efl;
  return { S, epd: 2 * S.epr, efl, bfl: S.par.bfl, fno: efl / (2 * S.epr), track: P.gaps.reduce((a, b) => a + b, 0) + P.image,
    epz: S.par.epz, xpz: S.par.xpz - S.z[S.N - 1], imgH: efl * Math.tan(fmax * deg), fmax, seidel: seidel(S, fmax, Ss, Sl), lo, hi };
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
  const fields = new Set([0]), waves = new Set();
  let epd = 0;
  for (const [src, L] of by) {
    const a = L.reduce((s, r) => s + r.a, 0) / L.length;
    fields.add(Math.round(Math.abs(a / deg) * 100) / 100);
    const across = L.map(r => r.y * Math.cos(a));
    epd = Math.max(epd, Math.max(...across) - Math.min(...across));
    for (const nm of linesOf(src)) waves.add(nm);
  }
  const W = [...waves].filter(nm => nm >= 100 && nm <= 1e7).sort((a, b) => a - b).slice(0, 12);
  return { fields: [...fields].sort((a, b) => a - b).slice(0, 12), waves: W, epd, sources: by.size };
}
/* conditions to design for from that light: the bench's fields and wavelengths, its beam as the entrance pupil */
export function condFromBench(asm, B) {
  const c = asm.cond;
  return normCond({ aperture: B.epd > 1e-6 ? { kind: 'epd', v: +B.epd.toPrecision(6) } : c.aperture,
    fields: B.fields.map(deg => ({ deg, w: 1 })), waves: (B.waves.length ? B.waves : c.waves.map(w => w.nm)).map(nm => ({ nm, w: 1 })),
    primary: B.waves.length ? Math.floor((B.waves.length - 1) / 2) : c.primary });
}
/* how the bench uses it outside what it is designed for: a list of short sentences, empty when within */
export function condMismatch(asm, B, efl) {
  const c = asm.cond, out = [];
  const fmax = Math.max(...c.fields.map(f => Math.abs(f.deg))), bmax = Math.max(...B.fields);
  if (bmax > fmax + 0.05) out.push('light arrives at ' + (+bmax.toFixed(2)) + '°, beyond its fields (to ' + (+fmax.toFixed(2)) + '°)');
  const nms = c.waves.map(w => w.nm), lo = Math.min(...nms), hi = Math.max(...nms);
  const off = B.waves.filter(nm => nm < lo - 0.5 || nm > hi + 0.5);
  if (off.length) out.push(off.map(nm => +nm.toPrecision(5)).join(', ') + ' nm, outside its wavelengths (' + (lo === hi ? +lo.toPrecision(5) : +lo.toPrecision(5) + ' to ' + (+hi.toPrecision(5))) + ' nm)');
  const epd = designEpd(c, efl);
  if (B.epd > epd * 1.02 + 1e-3) out.push('a beam ' + (+B.epd.toPrecision(3)) + ' mm across, wider than its entrance pupil (' + (+epd.toPrecision(3)) + ' mm)');
  return out;
}
