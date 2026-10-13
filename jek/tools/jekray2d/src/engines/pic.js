import { clamp } from '../core/constants.js';
import { fmtHz, fmtLen, fmtMw } from '../core/format.js';
import { V, deg, nextName, num, project } from '../state/project.js';
import { FIBRE_COLOUR, getEl, normElement } from '../state/elements.js';
import { frame, toWorld } from '../core/mask.js';
import { lastTrace } from './trace.js';
import { bodyFill, ctx, draw, getCss, portFill, portsInUse, removeFibre, selInk, sx, sy } from '../ui/render.js';
import { netPower, pkey, portWorld } from './fibre.js';
import { signalSection } from '../ui/instruments.js';
import { bindSync, fid, h, numInput, panel, param, selectField, setFid, vs } from '../ui/panel.js';
import { portRows, readoutBox } from '../ui/panels.js';
import { drawAxes, plotArea, plotCsv, plotSaveRow } from '../ui/plots.js';

/* ==========================================================================
   Photonic circuits (experimental: exp('pic'))
   Parts of a photonic chip drawn as a schematic, as the fibre components are: grating
   couplers, directional couplers, MMIs, rings, phase shifters and photodiodes, joined port
   to port by waveguides. TE only, one mode, about 1550 nm. Each part is a compact model: a
   small scattering matrix that depends on the wavelength. A chip (the parts its waveguides
   join) is solved directly at each wavelength, as one linear system over all its ports, so a
   ring of high Q costs no more than a straight waveguide; to the fibre network it is one part,
   whose matrix between its grating couplers' fibre sides (and the light its photodiodes take
   in) is that solution. The field convention is the fibre network's, e^{-ikz}; the light
   crossing a coupler picks up +i, as in the fibre coupler.
   Everything for it lives here, behind PIC. The rest of the tool reaches it only where a line
   is marked "PIC hook"; the choices made for a later layout view (lengths as settings, each
   waveguide a connection with an optional path, parts described in physical units) are noted
   where they are made.
   ========================================================================== */
export const PIC = (() => {
  const LAM0 = 1550;                               // nm: where the indices are given
  const C_NM = 299792458e9;                        // light, nm/s
  const GREEN = '#3a9d5d', DARK = '#1e3327';
  // waveguide presets, TE at 1550 nm: effective index, group index, loss (dB/cm)
  const WG = {
    si: { name: 'Silicon strip, 220 × 500 nm', neff: 2.44, ng: 4.2, loss: 2 },
    sin: { name: 'Silicon nitride, low loss', neff: 1.8, ng: 2.0, loss: 0.1 },
    custom: { name: 'Custom' },
  };
  /* ---------- complex numbers, [re, im] ---------- */
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cabs2 = a => a[0] * a[0] + a[1] * a[1];
  const cexp = ph => [Math.cos(ph), Math.sin(ph)];
  const csc = (a, s) => [a[0] * s, a[1] * s];
  const cdiv = (a, b) => { const d = cabs2(b) || 1e-300; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const Z = [0, 0];
  /* matrices: n x n complex as one Float64Array, row by row, re and im side by side; entry
     (r, c) at 2 (r n + c) */
  const cmat = n => new Float64Array(2 * n * n);
  const cput = (S, n, r, c, re, im) => { S[2 * (r * n + c)] = re; S[2 * (r * n + c) + 1] = im; };
  const cget = (S, n, r, c) => [S[2 * (r * n + c)], S[2 * (r * n + c) + 1]];
  const cabs2At = (S, n, r, c) => { const i = 2 * (r * n + c); return S[i] * S[i] + S[i + 1] * S[i + 1]; };

  /* a waveguide's index at lam (nm), from its index and group index at 1550 nm (first order) */
  const nAt = (w, lam) => w.neff - (w.ng - w.neff) * (lam - LAM0) / LAM0;
  /* its field transmission over len um: loss and the phase e^{-i 2 pi n L / lam} */
  function wgT(w, lenUm, lam) {
    const a = Math.pow(10, -Math.max(0, w.loss) * lenUm * 1e-4 / 20);
    return csc(cexp(-2 * Math.PI * nAt(w, lam) * lenUm * 1e3 / lam), a);
  }
  /* a 2x2 coupler, 4 ports: 0 and 1 on one side, 2 and 3 on the other; k2 the power across */
  function couplerS(k2, lossDb) {
    const a = Math.pow(10, -Math.max(0, lossDb || 0) / 20), k = clamp(k2, 0, 1);
    const t = a * Math.sqrt(1 - k), x = a * Math.sqrt(k), S = cmat(4);
    for (const [r, c] of [[0, 2], [2, 0], [1, 3], [3, 1]]) cput(S, 4, r, c, t, 0);
    for (const [r, c] of [[0, 3], [3, 0], [1, 2], [2, 1]]) cput(S, 4, r, c, 0, x);
    return S;
  }

  /* ---------- a network of parts, solved directly ----------
     parts: [{ S: n x n }], their ports numbered in order across all of them; links: [[p, q, t]]
     joining port p to port q with field transmission t both ways; ext: the ports light enters
     and leaves by; obs: ports whose incoming light is wanted (photodiodes). With in the light
     entering each part's ports and out what leaves them, out = S in, and in_q = t out_p over
     each link, plus what is put in at ext: (I - C S) in = E. Returns, for light put in at
     each ext port, what leaves every ext port (S) and what arrives at every obs port (into).
     It comes in two halves: compileNet, the structure (which ports are whose, what joins
     what), fixed across a wavelength sweep and so worked out once; and solvePlan, the numbers
     at one wavelength: each part's S and each link's t. */
  function compileNet(sizes, links, ext, obs) {
    const off = []; let N = 0;
    for (const n of sizes) { off.push(N); N += n; }
    const owner = new Int32Array(N), local = new Int32Array(N);
    sizes.forEach((n, k) => { for (let i = 0; i < n; i++) { owner[off[k] + i] = k; local[off[k] + i] = i; } });
    // each port's partner across a link, and which link (its t)
    const partner = new Int32Array(N).fill(-1), link = new Int32Array(N).fill(-1);
    links.forEach(([p, q], i) => { partner[q] = p; link[q] = i; partner[p] = q; link[p] = i; });
    // M's pattern: row q holds its diagonal and, if joined, the row of its partner's part
    const cols = Array.from({ length: N }, (_, q) => { const p = partner[q], c = [q]; if (p >= 0) for (let i = 0; i < sizes[owner[p]]; i++) c.push(off[owner[p]] + i); return c; });
    return { N, sizes, off, owner, local, partner, link, ext: ext.slice(), obs: obs.slice(), sp: compileSparse(N, cols) };
  }
  /* The sparse LU of M, worked out from its pattern alone: an order to eliminate the ports in
     (minimum degree, so little fills in), and for each step where its numbers sit. M = I - C S
     has each row a port and its partner's part, a handful of entries however large the chip,
     where the dense solve works through all N^2. Pivots are on the diagonal in this order; a
     wavelength where one comes out too small against its column goes to the dense solve. */
  function compileSparse(N, cols) {
    const adj = Array.from({ length: N }, () => new Set());
    cols.forEach((c, q) => { for (const j of c) if (j !== q) { adj[q].add(j); adj[j].add(q); } });
    const slot = new Map(), at = (r, c) => { const k = r * N + c; let s = slot.get(k); if (s === undefined) { s = slot.size; slot.set(k, s); } return s; };
    const done = new Uint8Array(N), order = new Int32Array(N), start = [0], nodes = [], colSlot = [], rowSlot = [], pairStart = [0], pairSlot = [];
    for (let k = 0; k < N; k++) {
      let v = -1;
      for (let i = 0; i < N; i++) if (!done[i] && (v < 0 || adj[i].size < adj[v].size)) v = i;
      done[v] = 1; order[k] = v;
      const nb = [...adj[v]].sort((a, b) => a - b);
      for (const a of nb) { adj[a].delete(v); for (const b of nb) if (b !== a) adj[a].add(b); }
      at(v, v);
      for (const a of nb) { nodes.push(a); colSlot.push(at(a, v)); rowSlot.push(at(v, a)); }
      for (const a of nb) for (const b of nb) pairSlot.push(at(a, b));
      start.push(nodes.length); pairStart.push(pairSlot.length);
    }
    const diag = new Int32Array(N);
    for (let q = 0; q < N; q++) diag[q] = at(q, q);
    const fillStart = [0], fill = [];
    cols.forEach((c, q) => { for (const j of c.slice(1)) fill.push(at(q, j)); fillStart.push(fill.length); });
    const I = a => Int32Array.from(a);
    return { nnz: slot.size, order, start: I(start), nodes: I(nodes), colSlot: I(colSlot), rowSlot: I(rowSlot), pairStart: I(pairStart), pairSlot: I(pairSlot), diag, fillStart: I(fillStart), fill: I(fill) };
  }
  let forceDense = false;                          // for the tests: the dense solve, to compare
  /* M x = b for the ne unit b's already in X, by the sparse LU; false (X untouched) if a pivot
     is too small, 1e-3 of the largest entry under it */
  function sparseSolve(pl, Ss, ts, X, ne) {
    const { N, sizes, off, owner, local, partner, link } = pl, { nnz, order, start, nodes, colSlot, rowSlot, pairStart, pairSlot, diag, fillStart, fill } = pl.sp;
    const V = new Float64Array(2 * nnz);
    for (let q = 0; q < N; q++) {
      const p = partner[q];
      if (p >= 0) {
        const k = owner[p], S = Ss[k], sr = 2 * local[p] * sizes[k], tl = 2 * link[q], t0 = ts[tl], t1 = ts[tl + 1];
        for (let i = 0, f = fillStart[q]; f < fillStart[q + 1]; i += 2, f++) { const a = S[sr + i], b = S[sr + i + 1], s2 = 2 * fill[f]; V[s2] = -(t0 * a - t1 * b); V[s2 + 1] = -(t0 * b + t1 * a); }
      }
      V[2 * diag[q]] += 1;
    }
    // factor: L below the diagonal (in the order), U on and above it, in place
    for (let k = 0; k < N; k++) {
      const v = order[k], dv = 2 * diag[v], d0 = V[dv], d1 = V[dv + 1], dd = d0 * d0 + d1 * d1, a0 = start[k], m = start[k + 1] - a0;
      let big = 0;
      for (let a = 0; a < m; a++) { const s2 = 2 * colSlot[a0 + a]; big = Math.max(big, V[s2] * V[s2] + V[s2 + 1] * V[s2 + 1]); }
      if (!(dd > 1e-300) || dd < 1e-6 * big) return false;
      for (let a = 0; a < m; a++) {
        const s2 = 2 * colSlot[a0 + a], x0 = V[s2], x1 = V[s2 + 1];
        if (!(x0 * x0 + x1 * x1)) continue;
        const f0 = (x0 * d0 + x1 * d1) / dd, f1 = (x1 * d0 - x0 * d1) / dd, ps = pairStart[k] + a * m;
        V[s2] = f0; V[s2 + 1] = f1;
        for (let b = 0; b < m; b++) { const u = 2 * rowSlot[a0 + b], u0 = V[u], u1 = V[u + 1], t = 2 * pairSlot[ps + b]; V[t] -= f0 * u0 - f1 * u1; V[t + 1] -= f0 * u1 + f1 * u0; }
      }
    }
    const N2 = 2 * N;
    for (let j = 0; j < ne; j++) {
      const x = j * N2;
      for (let k = 0; k < N; k++) {                  // L y = b
        const v = order[k], y0 = X[x + 2 * v], y1 = X[x + 2 * v + 1];
        if (!(y0 || y1)) continue;
        for (let a = start[k]; a < start[k + 1]; a++) { const l = 2 * colSlot[a], r = x + 2 * nodes[a]; X[r] -= V[l] * y0 - V[l + 1] * y1; X[r + 1] -= V[l] * y1 + V[l + 1] * y0; }
      }
      for (let k = N - 1; k >= 0; k--) {             // U x = y
        const v = order[k];
        let s0 = X[x + 2 * v], s1 = X[x + 2 * v + 1];
        for (let a = start[k]; a < start[k + 1]; a++) { const u = 2 * rowSlot[a], c = x + 2 * nodes[a]; s0 -= V[u] * X[c] - V[u + 1] * X[c + 1]; s1 -= V[u] * X[c + 1] + V[u + 1] * X[c]; }
        const dv = 2 * diag[v], b0 = V[dv], b1 = V[dv + 1], bb = b0 * b0 + b1 * b1;
        X[x + 2 * v] = (s0 * b0 + s1 * b1) / bb; X[x + 2 * v + 1] = (s1 * b0 - s0 * b1) / bb;
      }
    }
    return true;
  }
  /* Ss: each part's S at this wavelength (cmat); ts: each link's t, re and im side by side.
     Returns { ne, no, S: ne x ne over ext, into: no x ne, obs by ext }, both cmat layout.
     cols: which ext ports to put light in at (their indices in ext), all if left out; the
     columns for the others are left zero. A spectrum needs one, and a chip with many ports
     left open would otherwise solve for every one of them at every wavelength. */
  function solvePlan(pl, Ss, ts, cols) {
    const { N, sizes, off, owner, local, partner, link, ext, obs } = pl, ne = ext.length, no = obs.length, N2 = 2 * N;
    cols = cols || ext.map((_, j) => j);
    const nc = cols.length;
    // right-hand sides, one after another: a unit of light in at each ext port asked for
    const X = new Float64Array(N2 * nc);
    for (let k = 0; k < nc; k++) X[k * N2 + 2 * ext[cols[k]]] = 1;
    if (forceDense || !sparseSolve(pl, Ss, ts, X, nc)) {
      // M = I - C S, row q: -t_q S[partner(q)][.], dense
      const M = new Float64Array(N2 * N);
      for (let q = 0; q < N; q++) {
        const p = partner[q], row = q * N2;
        if (p >= 0) {
          const k = owner[p], n = sizes[k], S = Ss[k], sr = 2 * local[p] * n, tl = 2 * link[q], t0 = ts[tl], t1 = ts[tl + 1], o = row + 2 * off[k];
          for (let i = 0; i < 2 * n; i += 2) { const a = S[sr + i], b = S[sr + i + 1]; M[o + i] = -(t0 * a - t1 * b); M[o + i + 1] = -(t0 * b + t1 * a); }
        }
        M[row + 2 * q] += 1;
      }
      csolve(M, N, X, nc);
    }
    // what leaves each ext port: its part's S over the light into that part
    const S = new Float64Array(2 * ne * ne), into = new Float64Array(2 * no * ne);
    for (let kc = 0; kc < nc; kc++) {
      const j = cols[kc], x = kc * N2;
      for (let i = 0; i < ne; i++) {
        const e = ext[i], k = owner[e], n = sizes[k], Sp = Ss[k], sr = 2 * local[e] * n, o = x + 2 * off[k];
        let re = 0, im = 0;
        for (let m = 0; m < 2 * n; m += 2) { const a = Sp[sr + m], b = Sp[sr + m + 1], c = X[o + m], d = X[o + m + 1]; re += a * c - b * d; im += a * d + b * c; }
        S[2 * (i * ne + j)] = re; S[2 * (i * ne + j) + 1] = im;
      }
      for (let i = 0; i < no; i++) { into[2 * (i * ne + j)] = X[x + 2 * obs[i]]; into[2 * (i * ne + j) + 1] = X[x + 2 * obs[i] + 1]; }
    }
    return { ne, no, S, into };
  }
  /* A x = b for m b's at once, complex, by Gaussian elimination with partial pivoting, in place:
     A n x n (cmat), X the b's one after another (2n each), left holding the x's */
  function csolve(A, n, X, m) {
    const n2 = 2 * n;
    for (let c = 0; c < n; c++) {
      const c2 = 2 * c, rc = c * n2;
      let p = c, best = A[rc + c2] * A[rc + c2] + A[rc + c2 + 1] * A[rc + c2 + 1];
      for (let r = c + 1; r < n; r++) { const i = r * n2 + c2, v = A[i] * A[i] + A[i + 1] * A[i + 1]; if (v > best) { p = r; best = v; } }
      if (p !== c) {
        const rp = p * n2;
        for (let k = c2; k < n2; k++) { const t = A[rc + k]; A[rc + k] = A[rp + k]; A[rp + k] = t; }
        for (let j = 0; j < m; j++) { const x = j * n2; for (const d of [0, 1]) { const t = X[x + c2 + d]; X[x + c2 + d] = X[x + 2 * p + d]; X[x + 2 * p + d] = t; } }
      }
      const d0 = A[rc + c2], d1 = A[rc + c2 + 1], dd = d0 * d0 + d1 * d1;
      if (!(dd > 1e-300)) continue;
      for (let r = c + 1; r < n; r++) {
        const rr = r * n2, a0 = A[rr + c2], a1 = A[rr + c2 + 1];
        if (!(a0 * a0 + a1 * a1)) continue;
        const f0 = (a0 * d0 + a1 * d1) / dd, f1 = (a1 * d0 - a0 * d1) / dd;
        for (let k = c2; k < n2; k += 2) { const x0 = A[rc + k], x1 = A[rc + k + 1]; A[rr + k] -= f0 * x0 - f1 * x1; A[rr + k + 1] -= f0 * x1 + f1 * x0; }
        for (let j = 0; j < m; j++) { const x = j * n2, x0 = X[x + c2], x1 = X[x + c2 + 1]; X[x + 2 * r] -= f0 * x0 - f1 * x1; X[x + 2 * r + 1] -= f0 * x1 + f1 * x0; }
      }
    }
    for (let j = 0; j < m; j++) {
      const x = j * n2;
      for (let r = n - 1; r >= 0; r--) {
        const rr = r * n2;
        let s0 = X[x + 2 * r], s1 = X[x + 2 * r + 1];
        for (let k = r + 1; k < n; k++) { const a0 = A[rr + 2 * k], a1 = A[rr + 2 * k + 1], x0 = X[x + 2 * k], x1 = X[x + 2 * k + 1]; s0 -= a0 * x0 - a1 * x1; s1 -= a0 * x1 + a1 * x0; }
        const b0 = A[rr + 2 * r], b1 = A[rr + 2 * r + 1], bb = b0 * b0 + b1 * b1;
        if (bb > 1e-300) { X[x + 2 * r] = (s0 * b0 + s1 * b1) / bb; X[x + 2 * r + 1] = (s1 * b0 - s0 * b1) / bb; }
        else { X[x + 2 * r] = 0; X[x + 2 * r + 1] = 0; }
      }
    }
  }

  /* ---------- the parts ----------
     Each: its ports ([x, y] on its box, in half-widths; 'f' marks the one side of a grating
     coupler that takes a fibre, the rest are on the chip), their names, its settings [key,
     label, default], and S(el, lam) over its ports. A ring is a small network of its own. */
  const wgOf = el => ({ neff: el.neff, ng: el.ng, loss: el.loss });
  const WG_PARAMS = [['neff', 'n_eff at 1550 nm', 2.44], ['ng', 'Group index', 4.2], ['loss', 'Loss (dB/cm)', 2]];
  // bus in at 0, through at 2; the ring leaves at 3 and comes back into 1
  const RING1 = compileNet([4], [[3, 1]], [0, 2], []);
  // a second coupler on the far side: add in at its 0, drop out at its 2; the ring runs
  // from the first coupler's 3 to the second's 1, and from the second's 3 to the first's 1
  const RING2 = compileNet([4, 4], [[3, 5], [7, 1]], [0, 2, 4, 6], []);
  function ringS(el, lam, drop) {
    const w = wgOf(el), L = 2 * Math.PI * el.radius;
    if (!drop) return solvePlan(RING1, [couplerS(el.kappa1 / 100)], Float64Array.from(wgT(w, L, lam))).S;
    const half = wgT(w, L / 2, lam);
    return solvePlan(RING2, [couplerS(el.kappa1 / 100), couplerS(el.kappa2 / 100)], Float64Array.of(half[0], half[1], half[0], half[1])).S;   // ports: in, through, add, drop
  }
  const KINDS = {
    gc: { label: 'Grating coupler', tag: 'GC', ports: [[-1, 0], [1, 0, 'f']], names: ['chip', 'fibre'],
      params: [['centre', 'Centre (nm)', 1550], ['peak', 'Peak (dB)', -3], ['bw', '1 dB band (nm)', 30], ['polAngle', 'Fibre pol. (° from s)', 0]],
      S: (el, lam) => { const t = Math.sqrt(Math.pow(10, (el.peak - ((lam - el.centre) / (el.bw / 2)) ** 2) / 10)), S = cmat(2); cput(S, 2, 0, 1, t, 0); cput(S, 2, 1, 0, t, 0); return S; } },
    dc: { label: 'Directional coupler', tag: 'DC', ports: [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]], names: ['1', '2', '3', '4'],
      params: [['kappa', 'Coupling (%)', 50], ['dkappa', 'Change (%/nm)', 0], ['loss', 'Excess loss (dB)', 0]],
      S: (el, lam) => couplerS((el.kappa + el.dkappa * (lam - LAM0)) / 100, el.loss) },
    mmi12: { label: '1×2 MMI', tag: 'MMI 1×2', ports: [[-1, 0], [1, 0.5], [1, -0.5]], names: ['in', 'out 1', 'out 2'],
      params: [['loss', 'Excess loss (dB)', 0.2]],
      S: el => { const a = Math.pow(10, -el.loss / 20) / Math.SQRT2, S = cmat(3); for (const [r, c] of [[0, 1], [1, 0], [0, 2], [2, 0]]) cput(S, 3, r, c, a, 0); return S; } },
    mmi22: { label: '2×2 MMI', tag: 'MMI 2×2', ports: [[-1, 0.5], [-1, -0.5], [1, 0.5], [1, -0.5]], names: ['1', '2', '3', '4'],
      params: [['loss', 'Excess loss (dB)', 0.2]],
      S: el => couplerS(0.5, el.loss) },
    ring: { label: 'Ring, all-pass', tag: 'RING', wg: true, ports: [[-1, -0.6], [1, -0.6]], names: ['in', 'through'],
      params: [['radius', 'Radius (µm)', 10], ['kappa1', 'Coupling (%)', 10], ...WG_PARAMS],
      S: (el, lam) => ringS(el, lam, false) },
    ringad: { label: 'Ring, add-drop', tag: 'RING', wg: true, ports: [[-1, -0.6], [1, -0.6], [1, 0.6], [-1, 0.6]], names: ['in', 'through', 'add', 'drop'],
      params: [['radius', 'Radius (µm)', 10], ['kappa1', 'Coupling, in (%)', 10], ['kappa2', 'Coupling, drop (%)', 10], ...WG_PARAMS],
      S: (el, lam) => ringS(el, lam, true) },
    ps: { label: 'Phase shifter', tag: 'φ', wg: true, ports: [[-1, 0], [1, 0]], names: ['1', '2'],
      params: [['phase', 'Phase (°)', 0], ['len', 'Length (µm)', 100], ...WG_PARAMS],
      // ELEC hook: a drive _v (volts, set only while the electronics trace it) adds a phase pi v / V_pi
      S: (el, lam) => { const t = cm(wgT(wgOf(el), el.len, lam), cexp(-el.phase * Math.PI / 180 - Math.PI * (el._v || 0) / Math.max(1e-6, num(el.vpi, 5)))), S = cmat(2); cput(S, 2, 0, 1, t[0], t[1]); cput(S, 2, 1, 0, t[0], t[1]); return S; } },
    pd: { label: 'On-chip photodiode', tag: 'PD', sink: true, ports: [[-1, 0]], names: ['in'],
      params: [['resp', 'Responsivity (A/W)', 1], ['gain', 'Gain (V/A)', 1e4], ['vmax', 'Output limit (V)', 10], ['bandwidth', 'Bandwidth (Hz)', 1e9],
        ['demodF', 'Demod. at (MHz)', 0], ['demodPhase', 'Demod. phase (°)', 0]],
      S: () => cmat(1) },
  };
  const W_BOX = 14, H_BOX = 9;
  const portList = el => KINDS[el.kind].ports.map(([x, y, f]) => ({ x: x * W_BOX / 2, y: y * H_BOX / 2, dx: Math.abs(x) >= 1 ? Math.sign(x) : 0, dy: Math.abs(x) >= 1 ? 0 : Math.sign(y), chip: f !== 'f' }));
  const isChipPort = (id, p) => { const e = getEl(id); return !!(e && e.type === 'pic' && portList(e)[p] && portList(e)[p].chip); };

  /* ---------- the element and its waveguides, as saved ---------- */
  function norm(e, base) {
    const K = KINDS[e.kind];
    if (!K) return null;
    base.kind = e.kind;
    for (const [k, , d] of K.params) base[k] = num(e[k], d);
    if (K.wg) {
      base.wg = WG[e.wg] ? e.wg : 'si';
      // a preset's own numbers where the file gives none
      if (base.wg !== 'custom') for (const k of ['neff', 'ng', 'loss']) if (e[k] === undefined) base[k] = WG[base.wg][k];
    }
    return base;
  }
  /* a waveguide: its length is a setting (a layout would measure it from the drawn path) */
  const normWg = w => {
    w = w && typeof w === 'object' ? w : {};
    const pre = WG[w.preset] ? w.preset : 'si', P = WG[pre === 'custom' ? 'si' : pre];
    return { preset: pre, len: Math.max(0, num(w.len, 100)), neff: Math.max(1, num(w.neff, P.neff)), ng: Math.max(1, num(w.ng, P.ng)), loss: Math.max(0, num(w.loss, P.loss)) };
  };
  const make = (kind, x, y) => normElement({ type: 'pic', kind, name: nextName(KINDS[kind].label), x, y, angle: 0 });

  /* ---------- chips: the parts the waveguides join ---------- */
  let chipMemo = { key: null, chips: [] };
  function chips() {
    const els = project.elements.filter(e => e.type === 'pic'), wgs = (project.fibres || []).filter(F => F.wg);
    const key = JSON.stringify([els, wgs]);
    if (chipMemo.key === key) return chipMemo.chips;
    const idx = new Map(els.map((e, i) => [e.id, i])), par = els.map((_, i) => i);
    const find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (const F of wgs) if (idx.has(F.a[0]) && idx.has(F.b[0])) par[find(idx.get(F.a[0]))] = find(idx.get(F.b[0]));
    const groups = new Map();
    els.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
    const list = [...groups.values()].map(g => {
      const ids = new Set(g.map(e => e.id)), off = new Map(); let n = 0;
      for (const e of g) { off.set(e.id, n); n += portList(e).length; }
      const links = wgs.filter(F => ids.has(F.a[0]) && ids.has(F.b[0])).map(F => ({ p: off.get(F.a[0]) + F.a[1], q: off.get(F.b[0]) + F.b[1], w: F.wg }));
      const linked = new Set(links.flatMap(l => [l.p, l.q])), ports = [];
      for (const e of g) portList(e).forEach((P, i) => ports.push({ el: e, i, g: off.get(e.id) + i }));
      // light goes in and out by the fibre sides of the grating couplers and any chip port left
      // open; the photodiodes' ports are where it is read
      const ext = ports.filter(P => !linked.has(P.g) && !KINDS[P.el.kind].sink).map(P => P.g);
      const obs = ports.filter(P => KINDS[P.el.kind].sink).map(P => P.g);
      const c = { els: g, ids, off, links, ports, ext, obs, key: JSON.stringify([g, links]), memo: new Map() };
      return compileChip(c);
    });
    chipMemo = { key, chips: list };
    return list;
  }
  const chipOf = el => chips().find(c => c.ids.has(el.id)) || null;
  /* a chip's structure, compiled once: its network, each part's model and each waveguide */
  function compileChip(c) {
    c.plan = compileNet(c.els.map(e => portList(e).length), c.links.map(l => [l.p, l.q]), c.ext, c.obs);
    c.models = c.els.map(e => KINDS[e.kind].S);
    c.wgs = c.links.map(l => l.w);
    return c;
  }
  /* the chip at one wavelength: only the numbers change */
  function solveAtWavelength(c, lam, cols) {
    const ts = new Float64Array(2 * c.wgs.length);
    c.wgs.forEach((w, i) => { const t = wgT(w, w.len, lam); ts[2 * i] = t[0]; ts[2 * i + 1] = t[1]; });
    return solvePlan(c.plan, c.els.map((e, i) => c.models[i](e, lam)), ts, cols);
  }
  /* the chip solved at lam (nm) for light put in at ext port j (its index in ext): { S over
     ext, into over obs }, only column j filled in */
  function solveChip(c, lam, j) {
    const k = lam.toFixed(9) + '|' + j;
    let r = c.memo.get(k);
    if (r) return r;
    r = solveAtWavelength(c, lam, [j]);
    if (c.memo.size > 20000) c.memo.clear();
    c.memo.set(k, r);
    return r;
  }
  const portLabel = (c, g) => { const P = c.ports.find(q => q.g === g); return P.el.name + (portList(P.el).length > 1 ? ' ' + KINDS[P.el.kind].names[P.i] : ''); };

  /* ---------- to the fibre network: light arriving at a grating coupler's fibre side ----------
     Returns what leaves the chip's other fibre sides and what its photodiodes take in, each as
     a 2x2 on the fibre's (s, p), and the extra path it has been delayed by (its group delay:
     long near a ring's resonance, where the light goes round many times) */
  function scatter(el, port, nm, fo) {
    const c = chipOf(el);
    if (!c) return [];
    const g = c.off.get(el.id) + port, j = c.ext.indexOf(g);
    if (j < 0) return [];
    const lam = C_NM / (C_NM / nm + (fo || 0)), d = 1e-5;
    const r = solveChip(c, lam, j), rp = solveChip(c, lam + d, j), rm = solveChip(c, lam - d, j);
    const th = e => (e.polAngle || 0) * Math.PI / 180;
    const ti = th(el), ci = Math.cos(ti), si = Math.sin(ti);
    // the delay as a path: dphi/dlambda lambda^2 / 2 pi (e^{-ikz}: phase falls as the path grows)
    const path = (a, b) => { const dph = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]), w = dph - 2 * Math.PI * Math.round(dph / (2 * Math.PI)); return -w / (2 * d) * lam * lam / (2 * Math.PI) * 1e-6; };
    const out = [];
    c.ext.forEach((e, i) => {
      const P = c.ports.find(q => q.g === e);
      if (P.el.kind !== 'gc' || P.i !== 1) return;          // only a fibre side leads anywhere
      const s = cget(r.S, r.ne, i, j);
      if (cabs2(s) < 1e-30) return;
      const to = th(P.el), co = Math.cos(to), so = Math.sin(to);
      out.push({ to: [P.el.id, 1], M: [[csc(s, co * ci), csc(s, co * si)], [csc(s, so * ci), csc(s, so * si)]], ddl: path(cget(rm.S, r.ne, i, j), cget(rp.S, r.ne, i, j)) });
    });
    c.obs.forEach((o, i) => {
      const P = c.ports.find(q => q.g === o), s = cget(r.into, r.ne, i, j);
      if (cabs2(s) < 1e-30) return;
      out.push({ to: [P.el.id, 0], sink: true, M: [[csc(s, ci), csc(s, si)], [Z, Z]], ddl: path(cget(rm.into, r.ne, i, j), cget(rp.into, r.ne, i, j)) });
    });
    return out;
  }

  /* ---------- the spectrum between two ports, and its lines ---------- */
  function spectrum(c, from, to, lams) {
    const j = c.ext.indexOf(from), io = c.obs.indexOf(to), ie = c.ext.indexOf(to);
    return lams.map(lam => { const r = solveChip(c, lam, j); return io >= 0 ? cabs2At(r.into, r.ne, io, j) : cabs2At(r.S, r.ne, ie, j); });
  }
  /* The lines in a spectrum: dips (a notch) or peaks (a pass band), whichever stand out more.
     Each is measured against its own surroundings, the lower of the highest points either side
     of a dip before anything deeper (the higher of the lowest, for a peak), so a slope under it
     (a grating coupler's band) does not count; then refined: where, how deep, how wide at half
     its depth, its Q; and the mean spacing between neighbours. The refining needs the spectrum
     at wavelengths of its own: linesGen yields each one and takes back its value, so the panel
     can spread the work over time; lines answers them at once. */
  function lines(c, from, to, lams, T) {
    const g = linesGen(lams, T);
    let r = g.next();
    while (!r.done) r = g.next(spectrum(c, from, to, [r.value])[0]);
    return r.value;
  }
  function* linesGen(lams, T) {
    const n = T.length, step = lams[1] - lams[0];
    const find = sg => {
      const out = [];
      for (let i = 1; i < n - 1; i++) {
        if (!(sg * T[i] > sg * T[i - 1] && sg * T[i] >= sg * T[i + 1])) continue;
        const reach = dir => { let m = T[i]; for (let k = i + dir; k >= 0 && k < n; k += dir) { if (sg * T[k] > sg * T[i]) break; m = sg > 0 ? Math.min(m, T[k]) : Math.max(m, T[k]); } return m; };
        const base = sg > 0 ? Math.max(reach(-1), reach(1)) : Math.min(reach(-1), reach(1));
        const er = 10 * Math.log10(Math.max(T[i], 1e-30) / Math.max(base, 1e-30));
        if (Math.abs(er) >= 0.3) out.push({ i, base, er });
      }
      return out;
    };
    const P = find(1), D = find(-1), sum = L => L.reduce((a, q) => a + Math.abs(q.er), 0);
    const dips = sum(D) >= sum(P), sg = dips ? -1 : 1, list = [];
    for (const q of dips ? D : P) {
      let a = lams[q.i] - step, b = lams[q.i] + step;
      for (let it = 0; it < 50; it++) { const m1 = a + 0.382 * (b - a), m2 = a + 0.618 * (b - a); if (sg * (yield m1) > sg * (yield m2)) b = m2; else a = m1; }
      const at = 0.5 * (a + b), ext = yield at, half = 0.5 * (ext + q.base);
      const side = function* (dir) {
        let lo = at, hi = null;
        for (let k = 1; k <= 8 * n; k++) { const x = at + dir * k * step / 8; if (sg * ((yield x) - half) <= 0) { hi = x; break; } lo = x; if (Math.abs(x - at) > lams[n - 1] - lams[0]) break; }
        if (hi === null) return null;
        for (let it = 0; it < 50; it++) { const m = 0.5 * (lo + hi); if (sg * ((yield m) - half) > 0) lo = m; else hi = m; }
        return Math.abs(0.5 * (lo + hi) - at);
      };
      const l = yield* side(-1), r = yield* side(1), fw = l !== null && r !== null ? l + r : null;
      list.push({ at, T: ext, er: 10 * Math.log10(Math.max(ext, 1e-30) / Math.max(q.base, 1e-30)), fwhm: fw, Q: fw ? at / fw : null });
    }
    const fsr = list.length > 1 ? (list[list.length - 1].at - list[0].at) / (list.length - 1) : null;
    return { dips, list, fsr };
  }

  /* ---------- drawing ---------- */
  /* ---------- the parts as schematic symbols, in green, as on the review sheet: each drawn in
     the sheet's own units, mapped onto the part's ports (mm, v down the page); the box is still
     what is clicked. Rings are a fixed size, not to scale. ---------- */
  // each symbol's map from sheet units: u = (x - ox) kx, v = (y - oy) ky
  const PMAP = { gc: [14 / 86, 14 / 86, -3, 0], dc: [7 / 48, 2.25 / 14, 0, 0], mmi12: [7 / 46, 2.25 / 12, 0, 0], mmi22: [7 / 46, 2.25 / 12, 0, 0],
    ring: [7 / 46, 7 / 46, 0, 10 - 2.7 * 46 / 7], ringad: [7 / 46, 2.7 / 18, 0, 0], ps: [7 / 46, 7 / 46, 0, 0], pd: [7 / 46, 7 / 46, 0, 0] };
  const PSYM = {
    gc(d) {
      d.line([[-40, 0], [-14, 0]]); d.line([[-14, -1.5], [6, -14]]); d.line([[-14, 1.5], [6, 14]]);
      const a = Math.asin(11 / 26), off = Math.sqrt(26 * 26 - 11 * 11);
      for (const r of [0, 5, 10, 15]) d.arc(-2 + r - off, 0, 26, -a, a);
      d.dash(FIBRE_COLOUR, [[18, 0], [34, 0]]);
    },
    dc(d) { for (const g of [-1, 1]) d.path([['M', -42, g * 14], ['C', -24, g * 14, -22, g * 3, -12, g * 3], ['L', 12, g * 3], ['C', 22, g * 3, 24, g * 14, 42, g * 14]]); },
    mmi12(d) {
      d.rect(-14, -12, 28, 24);
      for (const P of [[[-40, 0], [-24, 0], [-14, -4]], [[-24, 0], [-14, 4]], [[14, -8], [24, -12], [40, -12]], [[14, -4], [24, -12]], [[14, 4], [24, 12], [40, 12]], [[14, 8], [24, 12]]]) d.line(P);
    },
    mmi22(d) {
      d.rect(-14, -12, 28, 24);
      for (const P of [[[-40, -12], [-24, -12], [-14, -8]], [[-24, -12], [-14, -4]], [[-40, 12], [-24, 12], [-14, 8]], [[-24, 12], [-14, 4]],
        [[14, -8], [24, -12], [40, -12]], [[14, -4], [24, -12]], [[14, 4], [24, 12], [40, 12]], [[14, 8], [24, 12]]]) d.line(P);
    },
    ring(d) { d.line([[-40, 10], [40, 10]]); d.circle(0, -7, 14); },
    ringad(d) { d.line([[-40, 18], [40, 18]]); d.line([[-40, -18], [40, -18]]); d.circle(0, 0, 14); },
    ps(d) { d.line([[-40, 0], [40, 0]]); d.fillRect(-16, -9, 32, 5, '#7fd49b'); d.line([[-16, -4], [-16, -1]]); d.line([[16, -4], [16, -1]]); },
    pd(d) {
      d.line([[-40, 0], [-6, 0]]); d.poly([[-6, -12], [12, 0], [-6, 12]]); d.line([[12, -12], [12, 12]]);
      for (const x of [-14, -4]) { d.line([[x, -26], [x + 10, -14]]); d.line([[x + 10, -14], [x + 9, -20]]); d.line([[x + 10, -14], [x + 4, -15]]); }
    },
  };
  // a key value beside each, where the sheet has it (sheet units)
  const PVAL = { gc: el => [(+el.centre.toPrecision(5)) + ' nm', 4, 28], dc: el => ['κ ' + (+el.kappa.toPrecision(3)) + '%', 0, -8],
    ring: el => ['R ' + (+el.radius.toPrecision(3)) + ' µm', 0, -26], ringad: el => ['R ' + (+el.radius.toPrecision(3)), 0, 0], ps: el => ['φ ' + (+el.phase.toPrecision(3)) + '°', 0, 16] };
  // a drawing context in sheet units, for one part
  function sheet(c, M) {
    const [kx, ky, ox, oy] = M, U = x => (x - ox) * kx, W = y => (y - oy) * ky;
    return {
      line(P) { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(U(x), W(y)) : c.moveTo(U(x), W(y))); c.stroke(); },
      path(P) { c.beginPath(); for (const [op, ...a] of P) { if (op === 'M') c.moveTo(U(a[0]), W(a[1])); else if (op === 'L') c.lineTo(U(a[0]), W(a[1])); else c.bezierCurveTo(U(a[0]), W(a[1]), U(a[2]), W(a[3]), U(a[4]), W(a[5])); } c.stroke(); },
      poly(P) { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(U(x), W(y)) : c.moveTo(U(x), W(y))); c.closePath(); c.fillStyle = bodyFill(DARK); c.fill(); c.stroke(); },
      rect(x, y, w, h) { c.beginPath(); c.rect(U(x), W(y), w * kx, h * ky); c.fillStyle = bodyFill(DARK); c.fill(); c.stroke(); },
      fillRect(x, y, w, h, col) { c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(U(x), W(y), w * kx, h * ky); c.globalAlpha = 1; },
      circle(x, y, r) { c.beginPath(); c.ellipse(U(x), W(y), r * kx, r * ky, 0, 0, 2 * Math.PI); c.stroke(); },
      arc(x, y, r, a0, a1) { c.beginPath(); c.ellipse(U(x), W(y), r * kx, r * ky, 0, a0, a1); c.stroke(); },
      dash(col, P) { const st = c.strokeStyle; c.strokeStyle = col; c.setLineDash([3 * kx, 3 * kx]); this.line(P); c.setLineDash([]); c.strokeStyle = st; },
      at: (x, y) => [U(x), W(y)],
    };
  }
  function draw(el, sel) {
    const s = V().scale, c = ctx, ports = portList(el), names = KINDS[el.kind].names, M = PMAP[el.kind];
    c.save(); c.translate(sx(el.x), sy(el.y)); c.rotate(-el.angle * deg); c.scale(s, s);
    c.strokeStyle = sel ? selInk() : GREEN; c.lineWidth = (sel ? 2.2 : 1.5) / s; c.lineJoin = 'round'; c.lineCap = 'round';
    PSYM[el.kind](sheet(c, M));
    c.restore();
    if (PVAL[el.kind] && s > 2.5) {
      const [t, x0, y0] = PVAL[el.kind](el), [u, v] = sheet(null, M).at(x0, y0), [x, y] = toWorld(frame(el), u, -v);
      c.save(); c.font = clamp(1.6 * s, 8, 11) + 'px ' + getCss('--jek-mono'); c.fillStyle = '#bfe8cc'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, sx(x), sy(y)); c.restore();
    }
    const used = portsInUse(), r = clamp(1.1 * s, 3, 6);
    ports.forEach((P, i) => {
      const Q = portWorld(el, i), X = sx(Q.x), Y = sy(Q.y), on = used.has(pkey(el.id, i)), col = P.chip ? GREEN : FIBRE_COLOUR;
      c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI);
      c.fillStyle = on ? col : portFill(); c.fill(); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
      if (ports.length > 1 && s > 3) {
        c.save(); c.fillStyle = '#bfe8cc'; c.font = '9px ' + getCss('--jek-mono'); c.textAlign = Q.dx > 0 ? 'left' : 'right'; c.textBaseline = 'bottom';
        c.fillText(names[i], X + Q.dx * (r + 3), Y - 3); c.restore();
      }
    });
  }
  const hit = (el, lx, ly, tol) => Math.abs(lx) <= W_BOX / 2 + tol && Math.abs(ly) <= H_BOX / 2 + tol;
  /* what a drag from one port to another makes: a waveguide on the chip, a fibre off it, or
     nothing (a fibre cannot end on the chip) */
  function linkKind(a, b) {
    const ca = isChipPort(a[0], a[1]), cb = isChipPort(b[0], b[1]);
    return ca && cb ? 'wg' : !ca && !cb ? 'fibre' : null;
  }

  /* ---------- panels ---------- */
  const wgSelect = (get, set) => selectField('Waveguide', Object.entries(WG).map(([k, v]) => [k, v.name]), get, set, { wide: true });
  function panelFor(el) {
    const K = KINDS[el.kind];
    panel.append(h('h3', null, K.label, h('span', { class: 'rt-exp' }, 'Experimental')));
    const rows = h('div', { class: 'rt-rows' });
    if (K.wg) rows.append(wgSelect(() => el.wg, v => { el.wg = v; if (v !== 'custom') Object.assign(el, { neff: WG[v].neff, ng: WG[v].ng, loss: WG[v].loss }); }));
    for (const [k, label] of K.params) rows.append(param(label, el, k));
    panel.append(rows);
    panel.append(readoutBox('pic'));
    if (el.kind === 'pd') signalSection(el);
    spectrumSection(el);
    const notes = {
      gc: 'Couples the chip’s TE mode to a fibre above it: join a fibre to its yellow port. It takes the fibre’s light polarised at its angle (from s) and loses the rest, as a real one does, with a Gaussian band about its centre wavelength. No back-reflection.',
      dc: 'Two waveguides close enough to couple: 1 goes to 3 and, across, to 4; 2 to 4 and, across, to 3. The light crossing over leads by a quarter wave, so two equal arms recombine into one port.',
      mmi12: 'Splits the light equally into its two outputs, in phase; run backwards, it adds the two, sending what is out of phase off the chip. It stands for a Y-branch too.',
      mmi22: 'A 50:50 coupler made as a multimode section: as a directional coupler at 50%, with its own excess loss.',
      ring: 'A ring beside one bus waveguide: dips in its through port at every resonance, as deep as the coupling matches the ring’s loss (critical coupling).',
      ringad: 'A ring between two bus waveguides: at resonance the light goes to the drop port; off it, straight through. Light put in at the add port goes to the drop port off resonance and to the through port on it.',
      ps: 'A section of waveguide with a phase you set (a heater or an electro-optic section): give the phase a sweep to tune a Mach–Zehnder or a ring, or wire a signal to its drive input (π of phase per Vπ volts on top of the phase set).',
      pd: 'Absorbs what reaches it and reads it as the fibre photodiodes do: DC, beat notes, the mixer. Its out port carries what it reads to the electronics.',
    };
    panel.append(h('p', { style: 'margin-top:0.6rem' }, notes[el.kind]));
    panel.append(h('p', { class: 'note', style: 'margin-top:0.35rem' }, 'Photonic circuits are experimental: TE only, near 1550 nm, each part a compact model, checked on the validation page against closed forms and SAX. Its settings are numbers, not a drawn layout: sizes on the bench are only a schematic.'));
  }
  /* the chip's spectrum between two of its ports, and the lines in it */
  function spectrumSection(el) {
    const c = chipOf(el);
    panel.append(h('h3', null, 'Spectrum'));
    if (!c || !c.ext.length) { panel.append(h('p', null, 'Nothing to put light in by: leave a port open or add a grating coupler.')); return; }
    // the grating couplers' fibre sides and the photodiodes first, then the chip ports left open
    const V2 = vs(el), P = g => c.ports.find(q => q.g === g), isGc = g => P(g).el.kind === 'gc';
    const froms = [...c.ext.filter(isGc), ...c.ext.filter(g => !isGc(g))], outs = [...c.obs, ...froms];
    const pick = (k, list, dflt) => { if (!list.includes(V2[k])) V2[k] = dflt; };
    pick('picFrom', froms, froms[0]);
    // to this photodiode, or the first photodiode, or another coupler, or whatever else there is
    const mine = c.obs.find(g => P(g).el.id === el.id);
    pick('picTo', outs, mine ?? c.obs[0] ?? froms.find(g => g !== V2.picFrom && isGc(g)) ?? outs.find(g => g !== V2.picFrom) ?? outs[0]);
    if (!(V2.picC > 0)) V2.picC = 1550;
    if (!(V2.picSpan > 0)) V2.picSpan = 20;
    const opts = list => list.map(g => [String(g), portLabel(c, g)]);
    const rows = h('div', { class: 'rt-rows' },
      selectField('From', opts(froms), () => String(V2.picFrom), v => { V2.picFrom = +v; }),
      selectField('To', opts(outs), () => String(V2.picTo), v => { V2.picTo = +v; }));
    const numF = (label, key, lo) => { const id = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f' }, h('label', { for: id }, label), numInput(id, () => V2[key], v => { if (v > lo) V2[key] = v; })); };
    rows.append(numF('Centre (nm)', 'picC', 0), numF('Span (nm)', 'picSpan', 0));
    const cv = h('canvas', { height: '160', style: 'width:100%;display:block;margin-top:0.4rem' });
    const box = h('div', { class: 'rt-readout' });
    panel.append(rows, cv, plotSaveRow(cv), box);
    // Worked out a little at a time, so the page stays live and a large chip shows something at
    // once: about a hundred points across the span first, drawn as soon as they are in; then the
    // points between them, the step halving each pass, redrawn as they come; then the lines. A
    // change (or the panel closing) drops whatever is still to do.
    let last = '', job = 0;
    const dl = (a, b) => h('dl', null, ...[[a, b]].flatMap(([x, y]) => [h('dt', null, x), h('dd', null, y)]));
    bindSync(cv, () => {
      const cc = chipOf(el);
      if (!cc) return;
      const key = cc.key + '|' + V2.picFrom + '|' + V2.picTo + '|' + V2.picC + '|' + V2.picSpan + '|' + (cv.clientWidth || 0) + '|' + laserNms(cc).join();
      if (key === last) return;
      last = key;
      const my = ++job, from = V2.picFrom, to = V2.picTo, C0 = V2.picC, marks = laserNms(cc), title = portLabel(cc, from) + ' → ' + portLabel(cc, to);
      const n = samplesFor(cc, V2.picSpan), lams = Array.from({ length: n }, (_, i) => C0 + (i / (n - 1) - 0.5) * V2.picSpan);
      const T = new Float64Array(n).fill(NaN), order = coarseToFine(n, 100), first = order.first;
      const live = () => my === job && cv.isConnected, f = lam => spectrum(cc, from, to, [lam])[0];
      const show = () => { const I = []; for (let i = 0; i < n; i++) if (T[i] === T[i]) I.push(i); drawSpectrum(cv, I.map(i => lams[i]), I.map(i => T[i]), marks, title); };
      let k = 0, drawn = 0;
      const sweep = () => {
        if (!live()) return;
        const t0 = performance.now();
        while (k < order.length && performance.now() - t0 < 12) { const i = order[k++]; T[i] = f(lams[i]); }
        const now = performance.now();
        if (k === order.length || (k >= first && (!drawn || now - drawn > 150))) { show(); drawn = now; }
        if (k < order.length) { if (k >= first) box.replaceChildren(dl('Refining', Math.round(100 * k / order.length) + '% of ' + n.toLocaleString() + ' points')); setTimeout(sweep, 0); return; }
        box.replaceChildren(dl('Lines', 'finding…'));
        const g = linesGen(lams, T);
        let r = g.next();
        const refine = () => {
          if (!live()) return;
          const t1 = performance.now();
          while (!r.done && performance.now() - t1 < 12) r = g.next(f(r.value));
          if (!r.done) { setTimeout(refine, 0); return; }
          const L = r.value, rows = [], nmT = v => (+v.toFixed(3)) + ' nm';
          L.list.slice(0, 8).forEach(q => rows.push([nmT(q.at), (q.er >= 0 ? '+' : '') + q.er.toFixed(2) + ' dB' + (q.fwhm ? ', FWHM ' + (q.fwhm < 0.1 ? (+(q.fwhm * 1e3).toPrecision(3)) + ' pm' : (+q.fwhm.toPrecision(3)) + ' nm') + ', Q ' + (+q.Q.toPrecision(3)).toLocaleString() : '')]));
          if (L.list.length > 8) rows.push(['', (L.list.length - 8) + ' more']);
          if (L.fsr) rows.push(['Spacing (FSR)', (+L.fsr.toPrecision(4)) + ' nm (' + fmtHz(C_NM * L.fsr / (C0 * C0)) + ')']);
          if (!L.list.length) rows.push(['Lines', 'none deeper than 0.3 dB in this span']);
          else rows.unshift([L.dips ? 'Dips' : 'Peaks', 'each against the level either side of it']);
          box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
        };
        refine();
      };
      box.replaceChildren(dl('Spectrum', 'working…'));
      sweep();
    });
  }
  /* the order to fill n evenly spaced samples in: every s-th (s a power of two, giving at least
     n0 of them) and the last, then those halfway between, and so on; .first counts the opening pass */
  function coarseToFine(n, n0) {
    let s = 1;
    while ((n - 1) / (s * 2) >= n0) s *= 2;
    const seen = new Uint8Array(n), out = [];
    const add = i => { if (!seen[i]) { seen[i] = 1; out.push(i); } };
    for (let i = 0; i < n; i += s) add(i);
    add(n - 1);
    out.first = out.length;
    for (s /= 2; s >= 1; s /= 2) for (let i = 0; i < n; i += s) add(i);
    return out;
  }
  /* the wavelengths of the lasers reaching the chip now, from the fibre network */
  function laserNms(c) {
    const net = lastTrace.net;
    if (!net) return [];
    const out = new Set();
    for (const g of c.ext) {
      const P = c.ports.find(q => q.g === g), m = net.inn.get(pkey(P.el.id, P.i));
      if (m) for (const K of net.keys) if (m.has(K.gk) && !K.root.ase) out.add(+K.nm.toFixed(4));
    }
    return [...out];
  }
  function drawSpectrum(cv, lams, T, marks, title) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 160;
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
    const dB = T.map(v => 10 * Math.log10(Math.max(v, 1e-12)));
    plotCsv(cv, 'chip spectrum ' + title, ['wavelength_nm', 'transmission', 'transmission_dB'], () => lams.map((l, i) => [l, T[i], dB[i]]));
    let lo = Math.max(-60, Math.min(...dB)), hi = Math.max(...dB);
    if (!(hi - lo > 0.5)) { lo -= 0.5; hi += 0.5; }
    const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;
    const sx2 = { kind: 'plain', title: 'wavelength, nm' }, sy2 = { kind: 'plain', title: 'dB' };
    const A = plotArea(g, w, hgt, [lo, hi], sy2);
    const X = l => A.l + (l - lams[0]) / (lams[lams.length - 1] - lams[0]) * A.w, Y = v => A.t + A.h - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * A.h;
    g.strokeStyle = GREEN; g.lineWidth = 1.4; g.beginPath();
    // each pixel column from its lowest to its highest sample, so a line narrower than a pixel still shows
    let col = -1, mn = 0, mx = 0, first = true;
    const flush = () => { if (col < 0) return; const x = A.l + col + 0.5; if (first) { g.moveTo(x, Y(mx)); first = false; } else g.lineTo(x, Y(mx)); g.lineTo(x, Y(mn)); };
    dB.forEach((v, i) => { const c2 = Math.floor(X(lams[i]) - A.l); if (c2 !== col) { flush(); col = c2; mn = mx = v; } else { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
    flush();
    g.stroke();
    // where the lasers reaching it are
    g.strokeStyle = 'rgba(219,53,80,0.7)'; g.setLineDash([3, 3]);
    for (const m of marks) if (m >= lams[0] && m <= lams[lams.length - 1]) { g.beginPath(); g.moveTo(X(m), A.t); g.lineTo(X(m), A.t + A.h); g.stroke(); }
    g.setLineDash([]);
    drawAxes(g, A, [lams[0], lams[lams.length - 1]], [lo, hi], sx2, sy2);
  }
  /* a ring's line width (nm) and free spectral range at 1550 nm, from its closed form */
  function ringLine(el) {
    const L = 2 * Math.PI * el.radius, fsr = LAM0 * LAM0 / (el.ng * L * 1e3), a = Math.pow(10, -el.loss * L * 1e-4 / 20);
    const t1 = Math.sqrt(1 - el.kappa1 / 100), t2 = el.kind === 'ringad' ? Math.sqrt(1 - el.kappa2 / 100) : 1, x = t1 * t2 * a;
    const F = Math.PI * Math.sqrt(x) / Math.max(1e-12, 1 - x);
    return { L, fsr, a, t1, t2, F, fw: fsr / F };
  }
  /* samples across a span fine enough for the narrowest ring on the chip: four to a line width */
  const samplesFor = (c, span) => clamp(Math.ceil(span / (Math.min(...c.els.filter(e => e.kind === 'ring' || e.kind === 'ringad').map(e => ringLine(e).fw), Infinity) / 4)), 1201, 20001) | 1;
  /* the readout rows under the settings */
  function readout(el) {
    const rows = portRows(el), K = KINDS[el.kind];
    if (el.kind === 'pd') {
      const net = lastTrace.net, mw = net ? netPower(net.pd.get(el.id), net.keys) : 0, mA = mw * el.resp, Vo = mA * 1e-3 * el.gain;
      rows.unshift(['Optical power', fmtMw(mw)], ['Photocurrent', (+mA.toPrecision(4)) + ' mA'], ...(el.diode ? [] : [['Output', (+Math.min(Vo, el.vmax).toPrecision(4)) + ' V' + (Vo > el.vmax ? ', at its limit' : '')]]));
    }
    if (el.kind === 'ring' || el.kind === 'ringad') {
      const { L, fsr, a, t1, F, fw } = ringLine(el);
      rows.unshift(['Free spectral range', (+fsr.toPrecision(4)) + ' nm at 1550 nm (' + fmtHz(C_NM * fsr / (LAM0 * LAM0)) + ')'],
        ['Round trip', fmtLen(L * 1e-3) + ', loss ' + (+(-20 * Math.log10(a)).toPrecision(3)) + ' dB'],
        ['Finesse, loaded', (+F.toPrecision(3)) + ': lines ' + (fw < 0.1 ? (+(fw * 1e3).toPrecision(3)) + ' pm' : (+fw.toPrecision(3)) + ' nm') + ' wide, Q ' + (+(LAM0 / fw).toPrecision(3)).toLocaleString()]);
      if (el.kind === 'ring') rows.push(['Coupling', Math.abs(t1 - a) < 0.002 * a ? 'critical: the dips go to zero' : t1 > a ? 'under-coupled' : 'over-coupled']);
    }
    if (el.kind === 'gc') {
      const nms = (() => { const c = chipOf(el); return c ? laserNms(c) : []; })();
      for (const nm of nms.slice(0, 3)) rows.push(['Coupling at ' + nm + ' nm', (+(el.peak - ((nm - el.centre) / (el.bw / 2)) ** 2).toFixed(2)) + ' dB']);
    }
    return [rows, K.sink ? 'Power from the fibre network, through the chip, at each laser’s wavelength.' : 'Ports and what they join; powers where the fibre network reaches them.'];
  }
  /* a waveguide, selected: its settings and what it does */
  function wgPanel(F) {
    const A = getEl(F.a[0]), B = getEl(F.b[0]), w = F.wg;
    panel.append(h('h2', null, h('span', null, 'Waveguide'), h('span', { class: 'kind' }, (A ? A.name : '?') + ' → ' + (B ? B.name : '?'))));
    const fnum = (label, key, set) => { const id = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f' }, h('label', { for: id }, label), numInput(id, () => w[key], v => set(v))); };
    panel.append(h('div', { class: 'rt-rows' },
      wgSelect(() => w.preset, v => { w.preset = v; if (v !== 'custom') Object.assign(w, { neff: WG[v].neff, ng: WG[v].ng, loss: WG[v].loss }); }),
      fnum('Length (µm)', 'len', v => { w.len = Math.max(0, v); }),
      fnum('Loss (dB/cm)', 'loss', v => { w.loss = Math.max(0, v); w.preset = 'custom'; }),
      fnum('Effective index', 'neff', v => { w.neff = Math.max(1, v); w.preset = 'custom'; }),
      fnum('Group index', 'ng', v => { w.ng = Math.max(1, v); w.preset = 'custom'; })));
    const out = h('div', { class: 'rt-readout' });
    panel.append(out);
    bindSync(out, () => {
      const ph = 2 * Math.PI * w.neff * w.len * 1e3 / LAM0;
      const rows = [['Phase at 1550 nm', (+(ph / (2 * Math.PI)).toPrecision(6)) + ' waves'], ['Delay', (+(w.ng * w.len * 1e-6 / 0.299792458 * 1e3).toPrecision(4)) + ' ps'],
        ['Loss', (+(w.loss * w.len * 1e-4).toPrecision(3)) + ' dB']];
      out.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
    });
    panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Its length is this number, not the length drawn (a layout view, later, could measure it from the path). The index changes with wavelength through the group index: n(λ) = nₑ − (n_g − nₑ)(λ − 1550 nm)/1550 nm. Drag either end off its port to take it away.'));
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, h('button', { class: 'rt-btn danger wide', type: 'button', onclick: () => removeFibre(F) }, 'Delete waveguide')));
  }

  /* the Add row's parts, each under the experimental key */
  const PALETTE = [['pic:gc', 'Grating coupler'], ['pic:dc', 'Directional coupler'], ['pic:mmi12', 'MMI 1×2'], ['pic:mmi22', 'MMI 2×2'],
    ['pic:ring', 'Ring', 'Ring resonator, all-pass'], ['pic:ringad', 'Add-drop ring', 'Ring resonator, add-drop'], ['pic:ps', 'Phase shifter'], ['pic:pd', 'Photodiode', 'On-chip photodiode']]
    .map(([k, l, t]) => [k, l, t || l, 'pic']);

  return {
    KINDS, WG, GREEN, PALETTE, norm, normWg, make, draw, hit, linkKind, panelFor, wgPanel, readout, scatter,
    ports: portList, label: el => KINDS[el.kind] ? KINDS[el.kind].label : 'Photonic part', names: el => KINDS[el.kind].names,
    halfSize: () => H_BOX / 2 + 1,
    // for the tests: a chip's response by element name and port number, and the pieces
    api: {
      response(fromName, fromPort, toName, toPort, lams) {
        const A = project.elements.find(e => e.name === fromName), B = project.elements.find(e => e.name === toName), c = A && chipOf(A);
        if (!c) return null;
        const g1 = c.off.get(A.id) + fromPort, g2 = c.off.get(B.id) + toPort, j = c.ext.indexOf(g1), io = c.obs.indexOf(g2), ie = c.ext.indexOf(g2);
        if (j < 0 || (io < 0 && ie < 0)) return null;                // a port joined inside the chip has no light put in or taken out
        return lams.map(lam => { const r = solveChip(c, lam, j); return io >= 0 ? cget(r.into, r.ne, io, j) : cget(r.S, r.ne, ie, j); });
      },
      lines(fromName, fromPort, toName, toPort, lo, hi, n) {
        const A = project.elements.find(e => e.name === fromName), B = project.elements.find(e => e.name === toName), c = A && chipOf(A);
        if (!c) return null;
        const g1 = c.off.get(A.id) + fromPort, g2 = c.off.get(B.id) + toPort, lams = Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
        const L = lines(c, g1, g2, lams, spectrum(c, g1, g2, lams));
        return { dips: L.dips, fsr: L.fsr, list: L.list.map(q => ({ at: q.at, T: q.T, er: q.er, fwhm: q.fwhm, Q: q.Q })) };
      },
      chips: () => chips().map(c => ({ parts: c.els.map(e => e.name), ext: c.ext.length, obs: c.obs.length })),
      // the dense solve instead of the sparse one, to compare them (forgetting what was solved)
      dense(on) { forceDense = !!on; for (const c of chips()) c.memo.clear(); },
      // a ring's panel readout: its free spectral range and line width at 1550 nm, from the closed form
      ring(name) { const e = project.elements.find(q => q.name === name); if (!e || !(e.kind === 'ring' || e.kind === 'ringad')) return null; const r = ringLine(e); return { fsr: r.fsr, fw: r.fw, F: r.F }; },
      linkKind,
    },
  };
})();

