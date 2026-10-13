import { clamp } from '../core/constants.js';
import { fwhmOf, polyFit } from '../core/maths.js';
import { lagOf, splitRoot } from '../core/coherence.js';
import { C_FS, PULSE_SAMPLES, pulseGrid, pulseHalf, pulseOf, pulseSpectrum, specAt } from '../core/pulses.js';
import { deg } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { lastTrace } from './trace.js';



/* ---------- The pulse that arrives ----------
   At a screen, a photodiode or a fibre tip: the spectral samples of each pulsed launch that
   reached it, grouped into branches (each path the light took), give each branch's spectral
   phase at one point of the face, the tilt of its wavefront at each wavelength included.
   A polynomial fit to that phase gives its group delay, GDD and TOD; the pulse in time is the
   spectrum with that phase, the branches of one laser added as fields, separate lasers and
   the two polarisations as powers. */
const C_MMFS = 2.99792458e-4;             // light, mm per fs

const pulseMemo = new WeakMap();

export function pulseReport(el) {
  const hits = (lastTrace.pulses && lastTrace.pulses[el.id]) || [];
  if (!hits.length) return null;
  let memo = pulseMemo.get(lastTrace);
  if (!memo) { memo = new Map(); pulseMemo.set(lastTrace, memo); }
  if (memo.has(el.id)) return memo.get(el.id);
  const out = pulseReportRaw(el, hits);
  memo.set(el.id, out);
  return out;
}

function pulseReportRaw(el, hits) {
  // branches: one source, one polarisation state, one path
  const byB = new Map();
  for (const t of hits) {
    const k = t.src + '|' + t.pol + '|' + t.path;
    if (!byB.has(k)) byB.set(k, { src: t.src, pol: t.pol, path: t.path, h: [] });
    byB.get(k).h.push(t);
  }
  const mid = (PULSE_SAMPLES - 1) / 2;
  // the point on the face where the pulse is taken: the strongest branch's centre wavelength
  let ref = null;
  for (const B of byB.values()) for (const t of B.h) if (t.j === mid) { const w = t.sr ** 2 + t.si ** 2 + t.pr ** 2 + t.pi ** 2; if (!ref || w > ref.w) ref = { y: t.y, w }; }
  if (!ref) { const t = hits[0]; ref = { y: t.y }; }
  const branches = [];
  for (const B of byB.values()) {
    const src = getEl(B.src);
    const P = pulseOf(src), G = src && pulseGrid(src);
    if (!P || !G) continue;
    const launch = src.virtual ? (src.vRoot ? src.vRoot.id : src.id) : splitRoot(src).id;
    const tLag = (src.virtual ? src.vLag || 0 : lagOf(src)) / C_MMFS;    // fs: fibre before the launch
    const pts = [];
    for (const t of B.h.sort((a, b) => a.j - b.j)) {
      const q = G.samples[t.j];
      if (!q) continue;
      const k = 2 * Math.PI / (q.nm * 1e-6);
      // the path to the reference point along this wavelength's own wavefront, then the
      // laser's chirp and the fibre before the launch
      const ph = k * (t.opl + t.n * (ref.y - t.y) * t.dly) + 0.5 * (P.gdd0 || 0) * q.d * q.d + q.d * tLag;
      pts.push({ d: q.d, x: q.d / G.dW, ph, as: [t.sr, t.si], ap: [t.pr, t.pi], y: t.y, dly: t.dly, nm: q.nm, S: q.S });
    }
    if (pts.length < 6) continue;
    const c = polyFit(pts.map(p => p.x), pts.map(p => p.ph), Math.min(5, pts.length - 2));
    if (!c) continue;
    const dW = G.dW;
    let GD = c[1] / dW, GDD = 2 * c[2] / (dW * dW), TOD = 6 * c[3] / (dW * dW * dW);
    // a spectrum a fibre's nonlinearity reshaped carries a chirp of its own: its phase's
    // smooth part, where it has light, counts too
    if (P.spec) {
      const xs = [], ys = [];
      let prev = null, off = 0;
      for (const p of pts) {
        const A = specAt(P.spec, p.d);
        if (A[0] * A[0] + A[1] * A[1] < 1e-3) { prev = null; continue; }
        let ph = Math.atan2(A[1], A[0]) + off;
        if (prev !== null) { while (ph - prev > Math.PI) { ph -= 2 * Math.PI; off -= 2 * Math.PI; } while (ph - prev < -Math.PI) { ph += 2 * Math.PI; off += 2 * Math.PI; } }
        prev = ph; xs.push(p.x); ys.push(ph);
      }
      const cs = xs.length >= 6 ? polyFit(xs, ys, 3) : null;
      if (cs) { GD += cs[1] / dW; GDD += 2 * cs[2] / (dW * dW); TOD += 6 * cs[3] / (dW * dW * dW); }
    }
    const share = pts.reduce((a, p) => a + p.S * (p.as[0] ** 2 + p.as[1] ** 2 + p.ap[0] ** 2 + p.ap[1] ** 2), 0) / G.samples.reduce((a, q) => a + q.S, 0);
    // where each colour lands, and which way it is going: spatial chirp and angular dispersion
    const lin = (ys) => { const n = pts.length, mx = pts.reduce((a, p) => a + p.nm, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
      let sxy = 0, sxx = 0; pts.forEach((p, i) => { sxy += (p.nm - mx) * (ys[i] - my); sxx += (p.nm - mx) ** 2; }); return sxx > 0 ? sxy / sxx : 0; };
    const chirpY = lin(pts.map(p => p.y)), angD = lin(pts.map(p => Math.asin(clamp(p.dly, -1, 1))));
    branches.push({ src, P, G, launch, pol: B.pol, pts, c, GD, GDD, TOD, share, chirpY, angD,
      pft: Math.atan(Math.abs(P.wavelength * angD)) / deg });
  }
  if (!branches.length) return null;
  // stray paths carrying next to nothing (a ghost off the back of a grating, say) are left out
  const topShare = Math.max(...branches.map(b => b.share));
  for (let i = branches.length - 1; i >= 0; i--) if (branches[i].share < 1e-5 * topShare) branches.splice(i, 1);
  branches.sort((a, b) => a.GD - b.GD);
  const tMin = branches[0].GD;
  // each branch's own duration, on its own (for the table), and the window to show
  const G0 = branches[0].G, tau0 = branches[0].P.tau;
  const est = b => { const x = 4 * Math.LN2 * b.GDD / (tau0 * tau0); return tau0 * Math.sqrt(1 + x * x) + Math.abs(b.TOD) / (tau0 * tau0) * 2; };
  let main = branches.reduce((a, b) => b.share > a.share ? b : a);
  // the pulses near the strongest one are shown together; any further off are listed
  const span = b => 4 * est(b) + 2 * tau0;
  const near = branches.filter(b => Math.abs(b.GD - main.GD) < span(main) + span(b) + 30 * tau0);
  const t0 = Math.min(...near.map(b => b.GD - span(b))), t1 = Math.max(...near.map(b => b.GD + span(b)));
  const NT = 700, ts = Array.from({ length: NT }, (_, i) => t0 + (t1 - t0) * i / (NT - 1));
  // the field of each branch on a fine grid of frequencies, then summed in time
  const W = pulseHalf(G0.src), maxGDD = Math.max(...near.map(b => Math.abs(b.GDD))), maxT = Math.max(...near.map(b => Math.abs(b.GD - t0), Math.abs(t1 - t0)));
  const NF = Math.round(clamp(Math.ceil(6 * W * (maxT + maxGDD * W) / Math.PI), 256, 6000));
  const ds = Array.from({ length: NF }, (_, i) => -W + 2 * W * i / (NF - 1)), dd = 2 * W / (NF - 1);
  const polyAt = (c, x) => { let v = 0; for (let k = c.length - 1; k >= 0; k--) v = v * x + c[k]; return v; };
  const interp = (b, d, key, comp) => {          // an amplitude between the traced samples
    const p = b.pts; if (d <= p[0].d) return p[0][key][comp]; if (d >= p[p.length - 1].d) return p[p.length - 1][key][comp];
    let i = 1; while (p[i].d < d) i++;
    const u = (d - p[i - 1].d) / (p[i].d - p[i - 1].d); return p[i - 1][key][comp] * (1 - u) + p[i][key][comp] * u;
  };
  // fields in time, per launch and polarisation (s, p), each [re, im] per time step
  const fields = new Map();
  const spec = new Map();                        // the spectrum arriving, per launch: |sum of fields|^2
  for (const b of near) {
    const key = b.launch;
    // the power the rays' amplitudes are against: the laser's own (a fibre tip's amplitudes
    // already carry the share of it that reached the tip)
    if (!fields.has(key)) fields.set(key, { s: [new Float64Array(NT), new Float64Array(NT)], p: [new Float64Array(NT), new Float64Array(NT)], P: b.P, share: 0,
      Pw: b.src.virtual && b.src.vRoot ? b.src.vRoot.power : b.P.power });
    if (!spec.has(key)) spec.set(key, { s: [new Float64Array(NF), new Float64Array(NF)], p: [new Float64Array(NF), new Float64Array(NF)] });
    const F = fields.get(key), SP = spec.get(key);
    F.share += b.share;
    const range = [b.pts[0].d, b.pts[b.pts.length - 1].d];
    for (let q = 0; q < NF; q++) {
      const d = ds[q];
      if (d < range[0] || d > range[1]) continue;
      // the pulse's own amplitude: its shape's, or a reshaped spectrum's with its phase
      let amp = Math.sqrt(pulseSpectrum(b.P, d)) * dd, ph = polyAt(b.c, d / b.G.dW);
      if (b.P.spec) { const A = specAt(b.P.spec, d); amp = Math.hypot(A[0], A[1]) * dd; ph += Math.atan2(A[1], A[0]); }
      for (const [pk, key2] of [['s', 'as'], ['p', 'ap']]) {
        const ar = interp(b, d, key2, 0), ai = interp(b, d, key2, 1);
        if (!ar && !ai) continue;
        // U = amp (ar + i ai) e^{i ph}: in time, U e^{-i d t}
        const cr = amp * (ar * Math.cos(ph) - ai * Math.sin(ph)), ci2 = amp * (ar * Math.sin(ph) + ai * Math.cos(ph));
        SP[pk][0][q] += cr / dd; SP[pk][1][q] += ci2 / dd;
        const Fr = F[pk][0], Fi = F[pk][1];
        for (let i = 0; i < NT; i++) {
          const a = -d * ts[i], c2 = Math.cos(a), s2 = Math.sin(a);
          Fr[i] += cr * c2 - ci2 * s2; Fi[i] += cr * s2 + ci2 * c2;
        }
      }
    }
  }
  // intensity in time, each launch scaled to its peak power: its pulse energy at this face
  // (average power over the repetition rate) spread over the pulse as it arrives
  const I = new Float64Array(NT), parts = [];
  for (const [key, F] of fields) {
    const Ii = new Float64Array(NT);
    for (let i = 0; i < NT; i++) Ii[i] = F.s[0][i] ** 2 + F.s[1][i] ** 2 + F.p[0][i] ** 2 + F.p[1][i] ** 2;
    const area = Ii.reduce((a, v) => a + v, 0) * (t1 - t0) / (NT - 1);
    const energy = (F.Pw || 0) * 1e-3 * F.share / (F.P.rep * 1e6);             // J at this face
    const scale = area > 0 ? energy / (area * 1e-15) : 0;                       // W
    for (let i = 0; i < NT; i++) { Ii[i] *= scale; I[i] += Ii[i]; }
    parts.push({ launch: key, name: F.P.name, energy, peak: Math.max(...Ii) });
  }
  const S = new Float64Array(NF);
  for (const SP of spec.values()) for (let q = 0; q < NF; q++) S[q] += SP.s[0][q] ** 2 + SP.s[1][q] ** 2 + SP.p[0][q] ** 2 + SP.p[1][q] ** 2;
  // the transform limit of the strongest branch's spectrum as it arrives
  const tl = (() => {
    const b = main, M = 400, tt = Array.from({ length: M }, (_, i) => (i / (M - 1) - 0.5) * 6 * tau0), v = new Float64Array(M);
    for (let q = 0; q < NF; q += Math.max(1, Math.floor(NF / 512))) {
      const d = ds[q]; if (d < b.pts[0].d || d > b.pts[b.pts.length - 1].d) continue;
      const a = Math.sqrt(pulseSpectrum(b.P, d)) * Math.hypot(interp(b, d, 'as', 0), interp(b, d, 'as', 1), interp(b, d, 'ap', 0), interp(b, d, 'ap', 1));
      for (let i = 0; i < M; i++) v[i] += a * Math.cos(d * tt[i]);
    }
    return fwhmOf(tt, Array.from(v, x => x * x));
  })();
  const dur = fwhmOf(ts, Array.from(I));
  const nmAt = d => 2 * Math.PI * C_FS / (G0.w0 + d);
  return {
    branches: branches.map((b, i) => ({ n: i + 1, source: b.src.name, launch: b.launch, pol: b.pol ? 'p' : 's', arrive: b.GD - tMin, GD: b.GD, GDD: b.GDD, TOD: b.TOD,
      share: b.share, dur: est(b), chirpY: b.chirpY, angD: b.angD, pft: b.pft, shown: near.includes(b) })),
    t: ts, I: Array.from(I), dur, tl, tau0, peak: Math.max(...I), parts, tMin,
    nm: ds.map(nmAt), S: Array.from(S), spectralPhase: (() => {
      const b = main;
      return ds.map(d => d < b.pts[0].d || d > b.pts[b.pts.length - 1].d ? NaN : polyAt(b.c, d / b.G.dW) - b.c[0] - b.c[1] * d / b.G.dW);
    })(),
    main: branches.indexOf(main) + 1, hidden: branches.length - near.length,
  };
}
