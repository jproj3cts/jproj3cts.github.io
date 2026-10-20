import { refIndex } from '../core/glass.js';
import { C_SI, HPL, KB } from '../core/cells.js';
import { EPS0, HBAR, TRAP_ATOMS, gasDamping, waterDamping } from '../core/traps.js';
import { cohGamma, lagOf, splitRoot } from '../core/coherence.js';
import { beamAt, isHigherMode, m2Env, modeM2 } from '../core/beams-hom.js';
import { getEl } from '../state/elements.js';
import { lastTrace } from './trace.js';
import { pctOfSources, statsCache } from './pd-cavity.js';



/* The field across the screen, in bins.
   Rays of one source, one wavelength and one path form a beam, and a beam is a sampled
   wavefront: with interpolation on, each beam is laid onto the bin centres before the
   fields are added, which is what stops the fringes aliasing against the ray spacing.
   Wavelengths and separate sources add as intensities, never as fields. */
export const binCache = new Map();

/* the key carries the binning settings, so a change shows up at once */
export const binKey = el => el.id + '|' + el.binWidth + '|' + (el.binInterp !== false);

export function binnedField(el) {
  const key = binKey(el);
  if (binCache.has(key)) return binCache.get(key);
  const out = binnedFieldRaw(el);
  binCache.set(key, out);
  return out;
}

function binnedFieldRaw(el) {
  const all = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
  if (!all.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const t of all) { if (t.y < lo) lo = t.y; if (t.y > hi) hi = t.y; }
  let span = hi - lo;
  if (!(span > 0)) { lo -= 0.005; hi += 0.005; span = hi - lo; }

  const n = el.binWidth > 0 ? Math.min(4000, Math.max(1, Math.round(span / el.binWidth))) : 96;
  const width = span / n;
  const interp = el.binInterp !== false;

  const coh = new Float64Array(n), inc = new Float64Array(n);
  // the size of the cross terms between the paths of one launch in each bin, so how deep its fringes run there
  const cross = new Float64Array(n);
  const byNm = new Map();
  for (const t of all) { if (!byNm.has(t.nm)) byNm.set(t.nm, []); byNm.get(t.nm).push(t); }

  for (const [nm, list] of byNm) {
    const lam = nm * 1e-6;
    // Rays are binned per path family (one source's rays down one branch), each with its mean
    // optical path in each bin. Families of one launch (one laser, split or not) add as
    // fields, each pair weighted by gamma of their path difference; launches add as powers.
    const fams = new Map();
    for (const t of list) {
      const key = t.id.split(':')[0] + '|' + t.fam + '|' + t.path;
      if (!fams.has(key)) fams.set(key, []);
      fams.get(key).push(t);
    }
    const own = [];
    let acc = null, Lw = null;
    const deposit = (b, sr, si, pr, pi, opl, gp) => {
      const ph = 2 * Math.PI * (opl / lam);
      const c = Math.cos(ph), s2 = Math.sin(ph);
      acc[b * 4] += sr * c - si * s2; acc[b * 4 + 1] += sr * s2 + si * c;
      acc[b * 4 + 2] += pr * c - pi * s2; acc[b * 4 + 3] += pr * s2 + pi * c;
      const w = sr * sr + si * si + pr * pr + pi * pi;
      inc[b] += w;
      Lw[b * 2] += w * (gp === undefined ? opl : gp); Lw[b * 2 + 1] += w;
    };
    for (const fam of fams.values()) {
      const src = getEl(fam[0].id.split(':')[0]);
      acc = new Float64Array(n * 4); Lw = new Float64Array(n * 2);
      own.push({ acc, Lw, fam: fam[0].fam, lag: lagOf(src), g: src ? cohGamma(splitRoot(src)) : null });
      if (!interp || fam.length < 2) {
        for (const t of fam) deposit(Math.min(n - 1, Math.floor((t.y - lo) / width)), t.sr, t.si, t.pr, t.pi, t.opl, t.gpl);
        continue;
      }
      fam.sort((a, b) => a.y - b.y);
      let j = 0;
      for (let b = 0; b < n; b++) {
        const yb = lo + width * (b + 0.5);
        if (yb < fam[0].y || yb > fam[fam.length - 1].y) continue;
        while (j < fam.length - 2 && fam[j + 1].y < yb) j++;
        const a = fam[j], c2 = fam[j + 1];
        const dy0 = c2.y - a.y;
        const u = dy0 === 0 ? 0 : (yb - a.y) / dy0;
        const L = (p0, p1) => p0 + (p1 - p0) * u;
        deposit(b, L(a.sr, c2.sr), L(a.si, c2.si), L(a.pr, c2.pr), L(a.pi, c2.pi), L(a.opl, c2.opl), L(a.gpl, c2.gpl));
      }
    }
    const launches = new Map();
    for (const F of own) { if (!launches.has(F.fam)) launches.set(F.fam, []); launches.get(F.fam).push(F); }
    for (const Fs of launches.values()) for (let b = 0; b < n; b++) {
      const on = Fs.filter(F => F.Lw[b * 2 + 1] > 0), o = b * 4;
      let xr = 0, xi = 0;
      for (let i = 0; i < on.length; i++) for (let j = i; j < on.length; j++) {
        const A = on[i], B = on[j];
        const d = A.acc[o] * B.acc[o] + A.acc[o + 1] * B.acc[o + 1] + A.acc[o + 2] * B.acc[o + 2] + A.acc[o + 3] * B.acc[o + 3];
        const g = i === j || !A.g ? 1 : A.g(A.Lw[b * 2] / A.Lw[b * 2 + 1] + A.lag - B.Lw[b * 2] / B.Lw[b * 2 + 1] - B.lag);
        coh[b] += (i === j ? 1 : 2 * g) * d;
        if (i !== j) { xr += g * d; xi += g * (A.acc[o + 1] * B.acc[o] - A.acc[o] * B.acc[o + 1] + A.acc[o + 3] * B.acc[o + 2] - A.acc[o + 2] * B.acc[o + 3]); }
      }
      cross[b] += 2 * Math.hypot(xr, xi);
    }
  }

  let cMax = 0, iMax = 0, sumC = 0, sumI = 0;
  for (let b = 0; b < n; b++) {
    sumC += coh[b]; sumI += inc[b];
    if (coh[b] > cMax) cMax = coh[b];
    if (inc[b] > iMax) iMax = inc[b];
  }
  // fringe visibility, 2|cross terms| over the powers' sum at its deepest where the light is (5% of the peak and up): it needs
  // light that meets itself by two paths, so separate lasers overlapping, or one beam's own profile, show none
  let vis = null;
  if (cMax > 0.05 * iMax) {
    let vMax = 0;
    for (let b = 0; b < n; b++) if (inc[b] >= 0.05 * iMax) vMax = Math.max(vMax, Math.min(1, cross[b] / inc[b]));
    if (vMax > 1e-6) vis = vMax;
  }
  return { lo, hi, width, n, interp, coh, inc, max: cMax, incMax: iMax,
    visibility: vis, interference: sumI > 0 ? sumC / sumI : null,
    total: all.reduce((a, t) => a + t.w, 0) };
}

export function screenStats(el) {
  const key = el.type === 'screen' ? binKey(el) : el.id;
  if (statsCache.has(key)) return statsCache.get(key);
  const out = screenStatsRaw(el);
  statsCache.set(key, out);
  return out;
}

function screenStatsRaw(el) {
  const all = (lastTrace.screens && lastTrace.screens[el.id]) || [];
  const hits = all.filter(t => !t.chief);
  const chiefHit = all.find(t => t.chief);
  const chiefSrc = chiefHit ? getEl(chiefHit.id.split(':')[0]) : null;
  const beam = chiefHit ? beamAt(chiefHit.qr, chiefHit.qi, chiefHit.n, chiefHit.nm, m2Env(chiefSrc)) : null;
  // a Hermite-Gauss mode wider one way than the other: its size out of the plane too (for optics
  // that treat both directions alike; the diffracted field has the rest)
  if (beam && isHigherMode(chiefSrc)) { const [mx, my] = modeM2(chiefSrc); if (mx !== my) beam.wy = beam.w * Math.sqrt(my / mx); }
  if (!hits.length) return beam ? { count: 0, power: 0, beam, empty: true } : null;
  let W0 = 0, m = 0, lo = Infinity, hi = -Infinity;
  let S0 = 0, S1 = 0, S2 = 0, S3 = 0;
  for (const t of hits) {
    W0 += t.w; m += t.y * t.w;
    if (t.y < lo) lo = t.y;
    if (t.y > hi) hi = t.y;
    const Is = t.sr * t.sr + t.si * t.si, Ip = t.pr * t.pr + t.pi * t.pi;
    S0 += Is + Ip; S1 += Ip - Is;
    S2 += 2 * (t.pr * t.sr + t.pi * t.si);      // Re(Ep conj(Es))
    S3 += 2 * (t.pi * t.sr - t.pr * t.si);      // Im(Ep conj(Es)): positive is right-handed
  }
  m /= W0;
  let v2 = 0;
  for (const t of hits) v2 += t.w * (t.y - m) * (t.y - m);

  // optical path: use the largest group of one wavelength, first crossing per ray
  const byNm = new Map();
  for (const t of hits) { if (!byNm.has(t.nm)) byNm.set(t.nm, []); byNm.get(t.nm).push(t); }
  let set = [], nm = 0;
  for (const [k, v] of byNm) if (v.length > set.length) { set = v; nm = k; }
  const firstOf = new Map();
  for (const t of set) if (!firstOf.has(t.id) || t.opl < firstOf.get(t.id).opl) firstOf.set(t.id, t);
  const front = [...firstOf.values()];
  let pw = 0, pmean = 0;
  const paths = front.map(t => {
    const L = t.opl + t.n * (m - t.y) * t.dly;    // to a reference point at the centroid
    pw += t.w; pmean += L * t.w;
    return { L, w: t.w };
  });
  pmean /= pw;
  let plo = Infinity, phi = -Infinity, pv2 = 0;
  for (const q of paths) { if (q.L < plo) plo = q.L; if (q.L > phi) phi = q.L; pv2 += q.w * (q.L - pmean) * (q.L - pmean); }

  // a cavity's round trip: the same ray arriving again and again, each time one round trip
  // further on, so the steps between its arrivals sorted by path (the order they are stored
  // in is not the order the light took), and the middle one of all of them
  const trips = [], seen = new Map();
  for (const t of set) { if (!seen.has(t.id)) seen.set(t.id, []); seen.get(t.id).push(t.opl); }
  for (const L of seen.values()) { L.sort((a, b) => a - b); for (let i = 1; i < L.length; i++) if (L[i] - L[i - 1] > 1e-6) trips.push(L[i] - L[i - 1]); }
  trips.sort((a, b) => a - b);

  // per-wavelength spot, so chromatic focal shift and lateral colour are visible
  const perNm = [...byNm.entries()].map(([k, v]) => {
    let w0 = 0, c = 0;
    for (const t of v) { w0 += t.w; c += t.y * t.w; }
    c /= w0;
    let q = 0;
    for (const t of v) q += t.w * (t.y - c) * (t.y - c);
    return { nm: k, centroid: c, rms: Math.sqrt(q / w0), count: v.length };
  }).sort((a, b) => a.nm - b.nm);

  const field = binnedField(el);
  const profile = field ? { lo: field.lo, hi: field.hi, binC: field.coh, binI: field.inc, nb: field.n, max: field.max } : null;
  const vis = field ? field.visibility : null;
  const interference = field ? field.interference : null;

  return {
    count: hits.length,
    power: W0,
    stokes: { S0, S1, S2, S3 },
    profile,
    visibility: vis,
    interference,
    beam,
    perNm,
    // of the light the sources that reach this screen send out, not every source on the bench
    powerPct: pctOfSources(W0, new Set(hits.map(t => t.sid))),
    centroid: m,
    rms: Math.sqrt(v2 / W0),
    full: hi - lo,
    nm, oplMean: pmean,
    wfPV: front.length > 1 ? phi - plo : null,
    wfRMS: front.length > 1 ? Math.sqrt(pv2 / pw) : null,
    roundTrip: trips.length ? trips[trips.length >> 1] : null,
    mixed: byNm.size > 1,
  };
}

/* What a trap solution means for its particle: intensity, depth, frequencies, scattering */
export function trapReport(el, T) {
  if (!T || T.error) return T || null;
  const I = 0.5 * T.nMed * EPS0 * C_SI * T.E2;                            // W/m^2
  const out = { I, dx: T.x, dy: T.y, dz: T.z, fx: T.fx, fy: T.fy, fz: T.fz, k: T.k, U: T.U, depthK: -T.U / KB, depthHz: -T.U / HPL,
    trap: T.trap, converged: T.converged, nMed: T.nMed, nBench: T.nBench, beams: T.beams, launches: T.launches, skipped: T.skipped, mass: T.mass, away: T.away };
  if (T.isAtom) {
    const nm = el.trap && lastTraceNm(el);
    out.sc = T.alpha[1] * T.E2 / (2 * HBAR);                            // photons/s
    const k = 2 * Math.PI / (nm * 1e-9), Erec = HBAR * HBAR * k * k / (2 * T.mass);
    out.heat = (2 * Erec / KB) * out.sc / 3;
    const A = TRAP_ATOMS[el.trap];
    out.near = Math.min(...['D1', 'D2'].map(q => Math.abs(C_SI / (nm * 1e-9) - A[q][0]))) < 1e12;
  } else {
    const S = T.sphere;
    out.kT = -T.U / (KB * el.trapT);
    out.Psc = S.sigma * I;                                                // W scattered
    out.Fscat = T.nMed * S.sigma * I / C_SI;                              // N, one beam's worth
    out.np = S.np; out.m = S.m; out.ka = S.ka;
    // damping by the medium, and each direction's quality factor
    const water = Math.abs(T.nMed - refIndex({ glass: 'Water' }, lastTraceNm(el))) < 0.01;
    if (el.trapMed === 'air') { const g = gasDamping(el.trapR, T.mass, el.trapP, el.trapT); out.G = g.G; out.mfp = g.l; out.Kn = g.Kn; out.dampBy = 'air'; }
    else if (el.trapMed === 'bench' && water) { out.G = waterDamping(el.trapR, T.mass, el.trapT); out.dampBy = 'water'; }
    else { out.G = 0; out.dampBy = el.trapMed === 'vacuum' ? 'vacuum' : 'none'; }
    out.Q = [T.fx, T.fy, T.fz].map(f => f && out.G > 0 ? 2 * Math.PI * f / out.G : null);
  }
  return out;
}

const lastTraceNm = el => { const all = (lastTrace.screens && lastTrace.screens[el.id]) || []; const c = all.find(t => t.chief); return c ? c.nm : 1064; };
