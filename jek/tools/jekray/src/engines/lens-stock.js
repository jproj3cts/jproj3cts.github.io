import { lensSystem } from './lens-engine.js';
import { footprints, anaSystems } from './lens-analysis.js';
import { sidOf } from './lens-design.js';
import { meritReport, optApply, optRun } from './lens-opt.js';

/* ==========================================================================
   Stock lenses: a lens of a design swapped for one the user has (a lens file of theirs)
   The user's own lens files are the stock: nothing is fetched or bundled. For a lens of the design:
     - what it needs: its focal length alone in air (at the primary wavelength), its number of faces (a singlet
       two, a cemented doublet three), and the beam's diameter on its faces (from the footprints);
     - the stock that could do: the same number of faces, a focal length of the same sign within a share of it
       (30% by default), wide enough for the beam; ranked by how near its focal length is, and its faces' curvatures
       (as multiples of 1/f, either way round);
     - each of the best tried either way round in the design: its shape, thicknesses and glasses put in, its first
       vertex where the design's was, then the air either side of it and the image distance optimised for the
       design's own merit (damped least squares), and that merit against the design's own lens with the same air
       optimised.
   ========================================================================== */
const fOf = (surfaces, gaps, materials, nm) => {
  const P = { surfaces: surfaces.map(s => ({ R: s.R, k: s.k || 0, a2: s.a2 || 0, A: s.A || [], odd: s.odd || null, semi: 1e3 })), gaps, materials, stopIndex: 0 };
  return lensSystem(P, nm).par.efl;
};
const curv = R => (R === null || R === undefined || !isFinite(R) || !R ? 0 : 1 / R);
/* a stock lens (a lens element, as a lens file reads) as matching sees it */
export function stockOf(el, nm) {
  const f = fOf(el.surfaces, el.gaps, el.materials, nm);
  return { el, name: el.name || 'Lens', n: el.surfaces.length, f, dia: el.diameter, c1: curv(el.surfaces[0].R), c2: curv(el.surfaces[el.surfaces.length - 1].R),
    thick: el.gaps.reduce((a, b) => a + b, 0), glasses: el.materials.map(m => m.glass) };
}
/* the lenses of a design as matching sees them: each its part index, focal length, faces, curvatures and the beam's diameter */
export function designLenses(asm, P) {
  const nm = asm.cond.waves[asm.cond.primary].nm, A = anaSystems(asm, P), FP = footprints(A, 11, 24), out = [];
  let i0 = 0;
  P.parts.forEach((p, pi) => {
    if (p.kind === 'lens' && !p.diff && !p.grin) {
      const S = P.surfaces.slice(i0, i0 + p.n), G = P.gaps.slice(i0, i0 + p.n - 1), M = P.materials.slice(i0, i0 + p.n - 1);
      if (!S.some(s => s.cyl || (s.F && s.F.length))) {
        const beam = Math.max(...FP.surfaces.slice(i0, i0 + p.n).map(u => u.beam));
        out.push({ pi, i0, n: p.n, id: p.id, f: fOf(S, G, M, nm), c1: curv(S[0].R), c2: curv(S[p.n - 1].R), beam: 2 * beam, thick: G.reduce((a, b) => a + b, 0) });
      }
    }
    i0 += p.n;
  });
  return out;
}
/* the stock that could stand in for lens d, best first: { s, score, flip (the way round its curvatures fit best) } */
export function stockCandidates(d, stock, opts) {
  opts = opts || {};
  const tol = opts.tol || 0.3, out = [];
  for (const s of stock) {
    if (s.n !== d.n || !isFinite(s.f) || Math.sign(s.f) !== Math.sign(d.f)) continue;
    const df = Math.abs(s.f - d.f) / Math.abs(d.f);
    if (df > tol || s.dia < d.beam * (1 - 1e-9)) continue;
    const f = Math.abs(d.f), shape = flip => { const a = flip ? -s.c2 : s.c1, b = flip ? -s.c1 : s.c2; return Math.abs(a - d.c1) * f + Math.abs(b - d.c2) * f; };
    const s0 = shape(false), s1 = shape(true);
    out.push({ s, score: df + 0.25 * Math.min(s0, s1), flip: s1 < s0 });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, opts.n || 8);
}
/* the design's problem with lens d swapped for stock s (turned round if flip), its variables the air either side and the
   image distance */
export function stockTrial(prob, d, s, flip) {
  const q = JSON.parse(JSON.stringify(prob)), P = q.P, N = P.surfaces.length, el = s.el;
  let S = el.surfaces.map(t => ({ R: t.R === undefined ? null : t.R, k: t.k || 0, a2: t.a2 || 0, A: (t.A || []).slice(), odd: t.odd ? t.odd.slice() : null }));
  let G = el.gaps.slice(), M = el.materials.map(m => Object.assign({}, m));
  if (flip) {
    S = S.reverse().map(t => ({ R: t.R === null || !isFinite(t.R) ? null : -t.R, k: t.k, a2: -t.a2, A: t.A.map(v => -v), odd: t.odd ? t.odd.map(v => -v) : null }));
    G = G.reverse(); M = M.reverse();
  }
  S.forEach((t, j) => { Object.assign(P.surfaces[d.i0 + j], t, { semi: el.diameter / 2 }); if (!t.odd) delete P.surfaces[d.i0 + j].odd; });
  G.forEach((g, j) => { P.gaps[d.i0 + j] = g; });
  M.forEach((m, j) => { P.materials[d.i0 + j] = m; });
  P.parts[d.pi].asph = S.some(t => t.k || t.a2 || t.A.some(v => v) || (t.odd && t.odd.some(v => v)));
  q.design.vars = airAbout(q, d);
  made(q);
  return q;
}
// lenses as made: their glass's thickness, edges and aspheric departure are the maker's, not limits to hold;
// only the air between lenses is kept from closing
function made(q) { q.design.merit.bounds = Object.assign({}, q.design.merit.bounds, { glassMin: -1e9, glassMax: 0, edgeMin: -1e9, aspMax: 0, slopeMax: 0 }); }
// the air either side of lens d and the image distance, as variables (those not solved or picked up)
function airAbout(q, d) {
  const P = q.P, N = P.surfaces.length, last = d.i0 + d.n - 1, keys = [];
  if (d.i0 > 0 && P.materials[d.i0 - 1] && P.materials[d.i0 - 1].glass === 'AIR') keys.push('t:' + sidOf(P.surfaces[d.i0 - 1]));
  if (last < N - 1 && P.materials[last] && P.materials[last].glass === 'AIR') keys.push('t:' + sidOf(P.surfaces[last]));
  keys.push('t:image');
  return keys.filter(k => !q.design.solves[k] && !q.design.pickups[k]);
}
/* the design's merit as it is, its lenses taken as made */
export function stockNominal(prob) { const q = JSON.parse(JSON.stringify(prob)); made(q); return meritReport(q).merit; }
/* the design's own lens d, the same air about it optimised: what a stock lens is measured against */
export function stockBaseline(prob, d, iters) {
  const q = JSON.parse(JSON.stringify(prob));
  q.design.vars = airAbout(q, d);
  made(q);
  if (!q.design.vars.length) return { prob: q, merit: meritReport(q).merit };
  const out = optRun(q, { mode: 'dls', iters: iters || 15 });
  optApply(q.P, q, out, q.design);
  return { prob: q, merit: out.merit };
}
/* stock s tried in the design for lens d: the merit once the air about it is optimised */
export function stockTry(prob, d, s, flip, iters) {
  const q = stockTrial(prob, d, s, flip);
  if (!q.design.vars.length) return { prob: q, merit: meritReport(q).merit, flip };
  const out = optRun(q, { mode: 'dls', iters: iters || 15 });
  optApply(q.P, q, out, q.design);
  return { prob: q, merit: out.merit, flip };
}
