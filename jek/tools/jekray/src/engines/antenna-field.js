import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { deg, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { frame, maskFns, toLocal, toLocalDir, toWorldDir } from '../core/mask.js';
import { RF_MAT, hornLam } from '../core/rf.js';
import { applyGrin, normGrin } from '../core/grin.js';
import { hornPattern } from '../core/horns.js';
import { beamAt } from '../core/beams-hom.js';
import { lastTrace, paraxial, setLastTraceKey, traceScene } from './trace.js';
import { rfCoupling } from './fibre-face.js';
import { popRun, segW } from './beam-tree.js';
import { popInside, popPower, popRadii, qdht } from './field.js';
import { fieldComps, popStats2 } from './field2d.js';
import { besselJ01 } from '../core/special.js';

/* ---------- An RF lens as an antenna, from the bench's own diffracted field ----------
   The field engine carries the horn's field (its modes, as launched) through the lens: each face
   by its traced phase, a graded-index lens by its own delay and loss, the rim cutting it. Just past
   the lens's last face that field, E, is the antenna's aperture field, and its far field follows:

     F(theta) = int E(x, y) exp(i k x sin theta) dx dy           (a cut in the bench plane; out of it, y)
     gain G(theta) = (4 pi / lambda^2) |F|^2 ((1 + cos theta) / 2)^2 / P_feed

   P_feed all the horn launched, so G holds the light that missed the lens and what the lens took.
   Its peak is the beam's direction, beside the beam the field engine follows (whose own direction
   it corrects); its width the beamwidth; and the directivity, against the aperture's power rather
   than the horn's, gives the aperture efficiency. Nothing here is a model of its own: it reads the
   field the bench's diffraction view shows. */
const fieldMemo = { key: '', out: new Map() };
let asking = 0;                                    // inside withBench: the bench is not as its key says
const benchKey = () => JSON.stringify(project.elements) + '|' + JSON.stringify(project.light || null);
function memoGet(what, el, make) {
  if (asking) return make();
  const k = benchKey();
  if (fieldMemo.key !== k) { fieldMemo.key = k; fieldMemo.out = new Map(); }
  const key = what + '|' + el.id;
  if (!fieldMemo.out.has(key)) fieldMemo.out.set(key, make());
  return fieldMemo.out.get(key);
}

/* the strongest RF beam leaving the lens into air, its index in the trace */
function exitIndex(el) {
  const B = lastTrace.beams || [];
  let best = -1;
  B.forEach((b, i) => {
    const s = b.ev && b.ev.surf;
    if (!s || !s.el || s.el.id !== el.id || !(b.nm > 1e5) || !(b.qi > 0) || b.n > 1.0001) return;
    if (best < 0 || b.w > B[best].w) best = i;
  });
  return best;
}
const fieldPower = (F, eng) => (eng === '2d' ? popStats2(F).power : popPower(F));

/* The aperture field as lines to sum: for each cut, the field collapsed across it, [x, re, im] per
   component, and the area element; and its power and the sums the efficiencies need */
function aperture(F, eng, wJ) {
  const k = 2 * Math.PI * F.n / F.lam0, amp = Math.sqrt(wJ);
  if (eng !== '2d') {
    const Q = qdht(F.re.length), r = popRadii(Q, F.R), V = Q.S / (2 * Math.PI * F.R), a = F.sphere ? -k / (2 * F.z) : 0;
    const re = new Float64Array(Q.N), im = new Float64Array(Q.N), dA = new Float64Array(Q.N);
    let P = 0, S1 = 0, rMax = 0;
    for (let i = 0; i < Q.N; i++) {
      const ph = a * r[i] * r[i], c = Math.cos(ph), s = Math.sin(ph);
      re[i] = amp * (F.re[i] * c - F.im[i] * s); im[i] = amp * (F.re[i] * s + F.im[i] * c);
      dA[i] = Q.inv[i] / (Math.PI * V * V);
      const I = re[i] ** 2 + im[i] ** 2;
      P += I * dA[i]; S1 += Math.sqrt(I) * dA[i];
      if (I > 0) rMax = r[i];
    }
    return { round: true, r, comps: [[re, im]], dA, P, S1, k };
  }
  const N = F.N, dx = F.ax.d, dy = F.ay.d;
  const bx = popInside(F.ax.z, F.ax.zR) ? 0 : -k / (2 * F.ax.z), by = popInside(F.ay.z, F.ay.zR) ? 0 : -k / (2 * F.ay.z);
  const xs = new Float64Array(N), ys = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = (i - N / 2) * dx; ys[i] = (i - N / 2) * dy; }
  const comps = [], mag2 = new Float64Array(N * N);
  for (const [kr, ki] of fieldComps(F)) {
    const gx = [new Float64Array(N), new Float64Array(N)], gy = [new Float64Array(N), new Float64Array(N)];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = j * N + i, ph = bx * xs[i] * xs[i] + by * ys[j] * ys[j], c = Math.cos(ph), s = Math.sin(ph);
      const er = amp * (F[kr][o] * c - F[ki][o] * s), ei = amp * (F[kr][o] * s + F[ki][o] * c);
      gx[0][i] += er * dy; gx[1][i] += ei * dy;                 // the bench-plane cut: summed across y
      gy[0][j] += er * dx; gy[1][j] += ei * dx;                 // the cut out of the plane: summed along x
      mag2[o] += er * er + ei * ei;
    }
    comps.push({ gx, gy });
  }
  let P = 0, S1 = 0;
  for (let o = 0; o < N * N; o++) { P += mag2[o]; S1 += Math.sqrt(mag2[o]); }
  return { round: false, xs, ys, dx, dy, comps, P: P * dx * dy, S1: S1 * dx * dy, k };
}
/* |F|^2 at angle t (degrees) along a cut: 'x' in the bench plane, 'y' out of it */
function farI(A, t, cut) {
  const s = Math.sin(t * deg);
  if (A.round) {
    let re = 0, im = 0;
    const [er, ei] = A.comps[0];
    for (let i = 0; i < er.length; i++) { const J = besselJ01(A.k * A.r[i] * s)[0] * A.dA[i]; re += er[i] * J; im += ei[i] * J; }
    return re * re + im * im;
  }
  const u = cut === 'y' ? A.ys : A.xs, d = cut === 'y' ? A.dy : A.dx;
  let I = 0;
  for (const C of A.comps) {
    const [gr, gi] = cut === 'y' ? C.gy : C.gx;
    let re = 0, im = 0;
    for (let i = 0; i < u.length; i++) { const p = A.k * u[i] * s, c = Math.cos(p), sn = Math.sin(p); re += (gr[i] * c - gi[i] * sn) * d; im += (gr[i] * sn + gi[i] * c) * d; }
    I += re * re + im * im;
  }
  return I;
}
const oblq = t => ((1 + Math.cos(t * deg)) / 2) ** 2;

/* A pattern cut: from -tMax to tMax, its peak between samples, the half-power width about it,
   the first sidelobe past it either side and the highest lobe outside the main one */
function cutOf(A, cut, tMax, M) {
  const th = [], I = [];
  for (let m = 0; m <= M; m++) { const t = -tMax + 2 * tMax * m / M; th.push(t); I.push(farI(A, t, cut) * oblq(t)); }
  let pk = 0;
  for (let m = 1; m <= M; m++) if (I[m] > I[pk]) pk = m;
  let t0 = th[pk], I0 = I[pk];
  if (pk > 0 && pk < M) { const y0 = I[pk - 1], y1 = I[pk], y2 = I[pk + 1], den = y0 - 2 * y1 + y2; if (den < 0) { t0 += 0.5 * (y0 - y2) / den * (th[1] - th[0]); I0 = y1 - (y0 - y2) ** 2 / (8 * den); } }
  const db = I.map(v => 10 * Math.log10(Math.max(v, 1e-30) / I0));
  const edge = dir => {
    for (let m = pk + dir; m >= 0 && m <= M; m += dir) if (db[m] <= -3.0103) { const f = (db[m - dir] + 3.0103) / (db[m - dir] - db[m]); return Math.abs(th[m - dir] + f * (th[m] - th[m - dir]) - t0); }
    return null;
  };
  const l = edge(-1), r = edge(1);
  const hpbw = l !== null && r !== null ? l + r : null;
  let lo = pk, hi = pk;
  while (lo > 0 && db[lo - 1] < db[lo]) lo--;
  while (hi < M && db[hi + 1] < db[hi]) hi++;
  let side = null, first = null;
  for (let m = 0; m <= M; m++) if ((m < lo || m > hi) && (side === null || db[m] > side)) side = db[m];
  for (const m of [lo - 1, hi + 1]) if (m >= 0 && m <= M) {
    let j = m; const dir = m < lo ? -1 : 1;
    while (j + dir >= 0 && j + dir <= M && db[j + dir] >= db[j]) j += dir;
    first = first === null ? db[j] : Math.max(first, db[j]);
  }
  return { th, db, I, peak: t0, Ipk: I0, hpbw, sll: first, lobe: side };
}

/* the field just past the lens, and just before it, as the engine carries them */
function lensFields(el) {
  const B = lastTrace.beams || [], ix = exitIndex(el);
  if (ix < 0) return null;
  const chain = new Set();
  for (let i = ix; i >= 0; i = B[i].parent) chain.add(i);
  const src = getEl(B[ix].src);
  if (!src) return null;
  const R = popRun(B, [src], { keep: chain, noCavity: true });
  const out = R.segs.find(s => s.i === ix);
  if (!out) return null;
  const root = R.segs.find(s => B[s.i].parent < 0) || R.segs[0];
  // the beam arriving at the lens from outside it: the last of the chain that ends on the lens and is not inside it
  let inSeg = null;
  for (const s of R.segs) { const b = B[s.i]; if (b.endEl === el.id && b.n <= 1.0001 && !(b.ev && b.ev.surf && b.ev.surf.el && b.ev.surf.el.id === el.id)) inSeg = s; }
  return { B, ix, out, root, inSeg, src, eng: out.eng };
}

/* the power of the field arriving at the lens that falls inside its rim: the field's grid lies across
   the beam (its x along the beam's normal in the bench plane), centred where the beam meets the lens */
function insideRim(sg, b, f, a) {
  const F = sg.leg.at(b.len), w = segW(sg), [, ly] = toLocal(f, b.x0 + b.dx * b.len, b.y0 + b.dy * b.len);
  if (sg.eng !== '2d') {
    const Q = qdht(F.re.length), r = popRadii(Q, F.R), V = Q.S / (2 * Math.PI * F.R);
    let p = 0;
    for (let i = 0; i < Q.N; i++) if (Math.hypot(r[i], ly) <= a) p += (F.re[i] ** 2 + F.im[i] ** 2) * Q.inv[i];
    return p / (Math.PI * V * V) * w;
  }
  const N = F.N, dx = F.ax.d, dy = F.ay.d, cx = toLocalDir(f, -b.dy, b.dx)[1];
  let p = 0;
  for (let j = 0; j < N; j++) {
    const y = (j - N / 2) * dy;
    for (const [kr, ki] of fieldComps(F)) for (let i = 0; i < N; i++) {
      const lat = ly + cx * (i - N / 2) * dx;
      if (lat * lat + y * y <= a * a) { const o = j * N + i; p += F[kr][o] ** 2 + F[ki][o] ** 2; }
    }
  }
  return p * dx * dy * w;
}

/* The lens antenna, from the bench's field. Null when no RF beam leaves the lens. */
export function lensFieldAntenna(el) {
  return memoGet('ant', el, () => {
    const L = lensFields(el);
    if (!L) return null;
    const { B, out, root, inSeg, src, eng } = L, b = B[L.ix], lam = b.nm * 1e-6;
    const Pfeed = fieldPower(root.F0, root.eng) * segW(root);
    if (!(Pfeed > 0)) return null;
    const A = aperture(out.F0, eng, segW(out));
    const a = (el.grin || el.type === 'mirror' ? el.length : el.diameter) / 2, Dmax = 4 * Math.PI * Math.PI * a * a / (lam * lam);
    // the cuts: wide enough for a few beamwidths and the steering the engine's beam already has
    const bw = lam / (2 * a) / deg, tMax = Math.min(80, Math.max(6, 10 * bw)), M = Math.min(1200, Math.max(240, Math.ceil(2 * tMax / (bw / 10))));
    const X = cutOf(A, 'x', tMax, M), Y = A.round ? X : cutOf(A, 'y', tMax, M);
    const G = 4 * Math.PI / (lam * lam) * X.Ipk / Pfeed, D = 4 * Math.PI / (lam * lam) * X.Ipk / A.P;
    // where the power went: past the rim (the field arriving, against what the horn sent), then the lens
    const f = frame(el), Pin = inSeg ? insideRim(inSeg, B[inSeg.i], f, a) : null;
    const through = A.P / Pfeed, spill = Pin !== null ? Math.min(1, Pin / Pfeed) : null;
    const eta = { taper: A.S1 * A.S1 / (Math.PI * a * a * A.P), phase: X.Ipk / (oblq(X.peak) * A.S1 * A.S1), ap: D / Dmax, through,
      spill, loss: spill ? Math.min(1, through / spill) : null };
    // the beam's direction against the lens's axis: the engine's beam, turned by the pattern's peak
    const [ldx, ldy] = toLocalDir(f, b.dx, b.dy), back = ldx < 0;
    const beam = Math.atan2(back ? -ldy : ldy, Math.abs(ldx)) / deg + (back ? -1 : 1) * X.peak;
    // the feed's direction from the lens: the horn's place against its axis
    const [hx, hy] = toLocal(f, src.x, src.y), feed = Math.atan2(back ? hy : -hy, Math.abs(hx)) / deg;
    const Bq = beamAt(b.qr, b.qi, b.n, b.nm), focus = Bq && Bq.waistDist > 0 && isFinite(Bq.waistDist) ? Bq.waistDist : null;
    const horn = src.mmw && src.mmw.kind ? hornPattern(src.mmw.kind, src.mmw.a, src.mmw.L, hornLam(src)) : null;
    return {
      G, D, Gdbi: 10 * Math.log10(G), Ddbi: 10 * Math.log10(D), Dmax, eta,
      hpbw: X.hpbw, hpbwY: Y.hpbw, sll: X.sll, lobe: X.lobe, beam, feed, cutX: X, cutY: Y, round: A.round,
      lam, a, focus, farField: 2 * (2 * a) ** 2 / lam, hornDbi: horn ? horn.dir : null, horn, eng,
    };
  });
}

/* ---------- Asking the bench "what if" ----------
   A change made to the bench (a part moved, a material's permittivity), the bench traced again
   with it, something read, and the bench put back as it was: the same way the receiving horn's
   frequency sweep works. */
export function withBench(apply, read) {
  const undo = apply();
  asking++;
  try { setLastTraceKey(null); traceScene(); return read(); }
  finally { asking--; undo(); setLastTraceKey(null); traceScene(); }
}

/* ---------- How closely it must be made, by tracing the bench again ----------
   The plastic's permittivity as printed is known to a few percent until it is measured (and the
   printer's flow moves it the same way). The lens's plastic is given a permittivity 5% higher,
   then 5% lower, and the bench traced again each time with the horn where it is: the antenna's
   gain from the field again, every receiving horn's power, and the lens's focal length (a
   graded-index lens's from its plate near the axis, a solid one's paraxial). How far the
   permittivity may go before the gain falls 1 dB comes from the parabola through the three. */
export const TOL_EPS = 0.05;
function lensMaterial(el) {
  if (el.grin) return normGrin(el.grin).mat;
  if (el.type === 'lens' && el.materials && el.materials.length === 1 && RF_MAT[el.materials[0].glass]) return el.materials[0].glass;
  return null;
}
function focalOf(el, nm) {
  if (el.type === 'mirror') return el.R ? Math.abs(el.R) / 2 : null;
  if (el.grin) {
    const fn = maskFns(el).fn, lam = nm * 1e-6, r = 0.05 * el.length / 2, d = (fn(r, 0, lam)[1] - fn(0, 0, lam)[1]) * lam;
    return d < 0 ? r * r / (-2 * d) : null;
  }
  const p = paraxial(el, nm);
  return p && isFinite(p.efl) ? p.efl : null;
}
const rfReceivers = () => project.elements.filter(e => e.type === 'detector' && e.mmw && !e.mmw.part);
function lensTolerance(el) {
  const mat = lensMaterial(el), A0 = lensFieldAntenna(el);
  if (!mat || !A0) return null;
  const nm = A0.lam * 1e6, rxs = rfReceivers();
  const read = () => {
    const A = lensFieldAntenna(el);
    return { G: A ? A.Gdbi : null, f: focalOf(el, nm), rx: rxs.map(r => { const C = rfCoupling(r); return C ? C.mw : 0; }) };
  };
  // a solid lens's plastic is changed where the bench takes its index from; a graded-index lens keeps
  // its design and is given the plastic's index as printed (core/grin.js applyGrin)
  const at = d => withBench(() => {
    const M = RF_MAT[mat], n0 = M.n, n1 = n0 * Math.sqrt(1 + d);
    if (el.grin) { applyGrin(el, n1); return () => applyGrin(el); }
    M.n = n1;
    return () => { M.n = n0; };
  }, read);
  // with matching layers the as-printed plate takes the core's index as the panel's (within a hundredth): its own zero
  const base = el.grin && normGrin(el.grin).match ? at(0) : read();
  const up = at(TOL_EPS), down = at(-TOL_EPS);
  if (base.G === null || up.G === null || down.G === null) return null;
  // dG(d) = p d + q d^2 through the three
  const gu = up.G - base.G, gd = down.G - base.G, p = (gu - gd) / (2 * TOL_EPS), q = (gu + gd) / (2 * TOL_EPS * TOL_EPS);
  const root = sgn => {                                   // the least d of this sign where dG = -1
    if (Math.abs(q) < 1e-12) return sgn * p < 0 ? -1 / p : null;
    const disc = p * p - 4 * q;                            // q d^2 + p d + 1 = 0
    if (disc < 0) return null;
    const r = [(-p + Math.sqrt(disc)) / (2 * q), (-p - Math.sqrt(disc)) / (2 * q)].filter(v => v * sgn > 0);
    return r.length ? Math.min(...r.map(Math.abs)) * sgn : null;
  };
  const dB = (a, b) => (a > 0 && b > 0 ? 10 * Math.log10(a / b) : null);
  return {
    eps: TOL_EPS, mat, up: gu, down: gd, budget: [root(-1), root(1)],
    f: base.f, focusUp: up.f !== null && base.f !== null ? up.f - base.f : null, focusDown: down.f !== null && base.f !== null ? down.f - base.f : null,
    rx: rxs.map((r, i) => ({ name: r.name, up: dB(up.rx[i], base.rx[i]), down: dB(down.rx[i], base.rx[i]) })),
  };
}

/* ---------- Steering, by moving the horn ----------
   The horn moved round the lens, as far from its centre and aimed at it, and the bench traced
   again at each place: the gain and the beam's direction from the field. The first place, on the
   axis, is what the scan loss is against. */
function hornMoves(el) {
  const B = lastTrace.beams || [], ix = exitIndex(el);
  if (ix < 0) return null;
  const src = getEl(B[ix].src);
  if (!src) return null;
  const f = frame(el), [ldx] = toLocalDir(f, B[ix].dx, B[ix].dy), back = ldx < 0;
  const [hx, hy] = toLocal(f, src.x, src.y), dist = Math.hypot(hx, hy);
  const [ux, uy] = toWorldDir(f, back ? -1 : 1, 0);
  const at = phi => {                                     // the horn whose light comes in phi degrees off the axis
    const c = Math.cos(phi * deg), s = Math.sin(phi * deg), dx = ux * c - uy * s, dy = ux * s + uy * c;
    return [el.x - dist * dx, el.y - dist * dy, Math.atan2(dy, dx) / deg];
  };
  const place = phi => withBench(() => {
    const was = [src.x, src.y, src.angle];
    [src.x, src.y, src.angle] = at(phi);
    return () => { [src.x, src.y, src.angle] = was; };
  }, () => { const A = lensFieldAntenna(el); return A && { feed: phi, beam: A.beam, G: A.Gdbi, lobe: A.lobe }; });
  return { place, src };
}
/* the horn on the axis, as far away: what the gain off it is against */
function onAxisRef(el) {
  const H = hornMoves(el);
  return H ? H.place(0) : null;
}
function steerScan(el) {
  const H = hornMoves(el), A = lensFieldAntenna(el);
  if (!H || !A) return null;
  const span = Math.min(40, Math.max(20, 1.5 * Math.abs(A.feed))), pts = [];
  for (let i = 0; i <= 6; i++) { const r = H.place(span * i / 6); if (r) pts.push(r); }
  if (!pts.length) return null;
  return pts.map(r => Object.assign(r, { loss: r.G - pts[0].G }));
}

/* ---------- Asked for by the panel ----------
   What a lens's panel shows, worked out in the field worker (which has its own copy of the bench
   to trace again as it likes) and kept until the bench changes; the last answer stands meanwhile.
   Without a worker, and in the tests, on the page. */
export function antennaJob(el, what) {
  if (what === 'ant') return lensFieldAntenna(el);
  if (what === 'ref') return onAxisRef(el);
  if (what === 'tol') return lensTolerance(el);
  if (what === 'scan') return steerScan(el);
  return null;
}
export const antCache = new Map();
const antAsked = new Map();
export function antennaLater(el, what) {
  const key = benchKey(), id = el.id + '|' + what, c = antCache.get(id);
  if (c && c.key === key) return { A: c.out, busy: false };
  if (TEST_MODE || !hooks.fieldWorker()) {
    const out = antennaJob(el, what);
    antCache.set(id, { key, out });
    return { A: out, busy: false };
  }
  if (antAsked.get(id) !== key) {
    antAsked.set(id, key);
    hooks.fwRequest('antenna', 'antenna:' + id, { id: el.id, what }).then(o => {
      if (antAsked.get(id) === key) antAsked.delete(id);
      if (o) antCache.set(id, { key, out: o.out });
      hooks.syncPanel(); hooks.requestRender();
    }).catch(() => { antAsked.delete(id); });
  }
  return { A: c ? c.out : null, busy: true };
}
/* worked out now, on the page, and kept (for the tests) */
export function antennaNow(el, what) {
  const out = antennaJob(el, what);
  antCache.set(el.id + '|' + what, { key: benchKey(), out });
  return out;
}
/* only what is already worked out, asking for nothing (the scan, until its button is pressed) */
export function antennaHeld(el, what) {
  const c = antCache.get(el.id + '|' + what);
  return c ? { A: c.out, current: c.key === benchKey() } : null;
}
