import { AMU, ATOMS, ATOM_ISO, C_SI, HPL } from './cells.js';
import { FACT } from './traps.js';
import { cellPumps } from '../engines/trace.js';
import { H, V } from '../ui/render.js';

/* ---------- A magnetic field on the cell ----------
   A field B along the cell's axis splits each line into its Zeeman components. The hyperfine
   and Zeeman Hamiltonian of each level, A I.J (+ B's quadrupole term for J' = 3/2) +
   mu_B B (g_J m_J + g_I m_I), is diagonalised in the uncoupled basis |m_I m_J>, one block of
   m_F at a time, so it holds from the weak field through the Paschen-Back regime (as ElecSus
   does). Light along the field drives sigma+ (m up by one) and sigma- only; each transition's
   strength is 3 (2J+1) |sum c_g c_e <J' m_J'|d_q|J m_J>|^2, so the strengths of either
   hand from each ground state average one, as the field-free lines' do. */
export const MU_B = 1.39962449361;                         // Bohr magneton / h, MHz per gauss
const ZEE_G = { gS: 2.00231930436, gI: { Rb85: -0.00029364000, Rb87: -0.0009951414, Cs133: -0.00039885395, K39: -0.00014193489 } };
const zeeGJ = (L, J) => { const gL = 0.99999369, S = 0.5, Lq = L; return gL * (J * (J + 1) - S * (S + 1) + Lq * (Lq + 1)) / (2 * J * (J + 1)) + ZEE_G.gS * (J * (J + 1) + S * (S + 1) - Lq * (Lq + 1)) / (2 * J * (J + 1)); };
/* the Wigner 3j symbol, by Racah's formula (half-integer arguments allowed) */
function threej(j1, j2, j3, m1, m2, m3) {
  if (Math.abs(m1 + m2 + m3) > 1e-9 || Math.abs(m1) > j1 + 1e-9 || Math.abs(m2) > j2 + 1e-9 || Math.abs(m3) > j3 + 1e-9) return 0;
  if (j3 > j1 + j2 + 1e-9 || j3 < Math.abs(j1 - j2) - 1e-9) return 0;
  const r = Math.round, F = x => FACT[r(x)];
  const tri = F(j1 + j2 - j3) * F(j1 - j2 + j3) * F(-j1 + j2 + j3) / F(j1 + j2 + j3 + 1);
  const pre = Math.sqrt(tri * F(j1 + m1) * F(j1 - m1) * F(j2 + m2) * F(j2 - m2) * F(j3 + m3) * F(j3 - m3));
  let sum = 0;
  const kLo = r(Math.max(0, j2 - j3 - m1, j1 - j3 + m2)), kHi = r(Math.min(j1 + j2 - j3, j1 - m1, j2 + m2));
  for (let k = kLo; k <= kHi; k++) sum += (k % 2 ? -1 : 1) / (F(k) * F(j3 - j2 + k + m1) * F(j3 - j1 + k - m2) * F(j1 + j2 - j3 - k) * F(j1 - k - m1) * F(j2 - k + m2));
  return (r(j1 - j2 - m3) % 2 ? -1 : 1) * pre * sum;
}
/* a real symmetric matrix's eigenvalues and (column) eigenvectors, by Jacobi rotations */
function symEig(A) {
  const n = A.length, a = A.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - sn * vkq; V[k][q] = sn * vkp + c * vkq; }
    }
  }
  return { vals: a.map((r, i) => r[i]), vecs: V };
}
/* one level's states in a field of B gauss: [{ E (MHz from the fine-structure centroid), mF, c: Map 'mI|mJ' -> amplitude }] */
export function zeemanStates(iso, level, B) {
  const X = ATOM_ISO[iso], I = X.I;
  const J = level === 'S' ? 0.5 : level === 'D1' ? 0.5 : 1.5, Lq = level === 'S' ? 0 : 1;
  const A = level === 'S' ? X.Ag : X[level].Ae, Bq = level === 'D2' ? X[level].Be : 0;
  const gJ = zeeGJ(Lq, J), gI = ZEE_G.gI[iso] || 0, out = [];
  const ms = j => { const v = []; for (let m = -j; m <= j + 1e-9; m++) v.push(m); return v; };
  const lad = (j, m, up) => Math.sqrt(Math.max(0, j * (j + 1) - m * (m + (up ? 1 : -1))));
  for (let mF = -(I + J); mF <= I + J + 1e-9; mF++) {
    const basis = [];
    for (const mJ of ms(J)) { const mI = mF - mJ; if (Math.abs(mI) <= I + 1e-9) basis.push([mI, mJ]); }
    const n = basis.length, IJ = Array.from({ length: n }, () => new Array(n).fill(0));
    basis.forEach(([mI, mJ], a) => {
      IJ[a][a] = mI * mJ;
      basis.forEach(([mI2, mJ2], b) => {
        if (Math.abs(mI2 - mI - 1) < 1e-9 && Math.abs(mJ2 - mJ + 1) < 1e-9) { const v = 0.5 * lad(I, mI, true) * lad(J, mJ, false); IJ[b][a] += v; IJ[a][b] += v; }
      });
    });
    const H = IJ.map(r => r.map(v => A * v));
    if (Bq && I >= 1 && J >= 1) {
      const IJ2 = IJ.map((r, i) => r.map((_, j) => r.reduce((s2, v, k) => s2 + v * IJ[k][j], 0))), den = 2 * I * (2 * I - 1) * J * (2 * J - 1);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += Bq * (3 * IJ2[i][j] + 1.5 * IJ[i][j] - (i === j ? I * (I + 1) * J * (J + 1) : 0)) / den;
    }
    basis.forEach(([mI, mJ], a) => { H[a][a] += MU_B * B * (gJ * mJ + gI * mI); });
    const { vals, vecs } = symEig(H);
    vals.forEach((E, k) => { const c = new Map(); basis.forEach(([mI, mJ], a) => c.set(mI + '|' + mJ, vecs[a][k])); out.push({ E, mF, c }); });
  }
  return out;
}
/* every sigma+ and sigma- transition of a cell's line in a field of B gauss along its axis (q is
   the change of m about the field), each as atomLines gives a line; Fg names its ground state */
const zeeLineCache = new Map();
export function zeemanLines(atom, line, B) {
  const key = atom + '|' + line + '|' + (+B.toPrecision(9));
  if (zeeLineCache.has(key)) return zeeLineCache.get(key);
  const out = [], Jp = line === 'D1' ? 0.5 : 1.5, J = 0.5;
  for (const [isoName, ab] of ATOMS[atom].iso) {
    const X = ATOM_ISO[isoName], L = X[line], I = X.I, Aw = 1e9 / L.tau, lam = C_SI / L.nu;
    const G = zeemanStates(isoName, 'S', B), E = zeemanStates(isoName, line, B);
    const sInt = lam * lam / (8 * Math.PI) * (2 * Jp + 1) / (2 * J + 1) * Aw, Isat0 = Math.PI * HPL * C_SI * Aw / (3 * lam ** 3);
    G.forEach((g, gi) => E.forEach(e => {
      const q = Math.round(e.mF - g.mF);
      if (Math.abs(q) !== 1) return;
      let amp = 0;
      for (const [k, cg] of g.c) {
        const [mI, mJ] = k.split('|').map(Number), mJp = mJ + q, ce = e.c.get(mI + '|' + mJp);
        if (!ce) continue;
        amp += cg * ce * (Math.round(Jp - mJp) % 2 ? -1 : 1) * threej(Jp, 1, J, -mJp, q, mJ);
      }
      const S = 3 * (2 * J + 1) * amp * amp;
      if (S < 1e-9) return;
      out.push({ iso: isoName, Fg: 'g' + gi, q, nu: L.nu + 1e6 * (e.E - g.E), S, share: ab / ((2 * J + 1) * (2 * I + 1)), m: X.m * AMU, A: Aw, lam, sInt,
        // saturation against the cycling transition's strength, 3 (2J+1) / (2J'+1)
        Isat: Isat0 * 3 * (2 * J + 1) / (2 * Jp + 1) });
    }));
  }
  if (zeeLineCache.size > 64) zeeLineCache.clear();
  zeeLineCache.set(key, out);
  return out;
}
/* whether a cell must tell the hands of circular light apart: a field on it, or a beam through
   it circularly polarised enough to pump one hand harder (polarisation spectroscopy) */
export const cellPolar = el => el.bField !== 0 || (cellPumps.get(el.id) || []).some(r => r.circ && Math.abs(r.circ[0] - r.circ[1]) > 1e-3);
/* a ray's share of each hand about the cell's axis, from its Jones vector: py is its p axis
   along the cell's local y (+1 or -1); A_+- = (E_y -+ i E_z) / sqrt 2 */
export function circShares(pr, pi, sr, si, py) {
  const ap = 0.5 * ((py * pr + si) ** 2 + (py * pi - sr) ** 2), am = 0.5 * ((py * pr - si) ** 2 + (py * pi + sr) ** 2), t = ap + am;
  return t > 0 ? [ap / t, am / t] : [0.5, 0.5];
}
/* the Jones matrix, in the ray's (p, s), of a cell passing t+ and t- ([re, im]) on each hand */
export function cellJones(tp, tm, py) {
  const sum = [0.5 * (tp[0] + tm[0]), 0.5 * (tp[1] + tm[1])], d = [0.5 * (tp[0] - tm[0]), 0.5 * (tp[1] - tm[1])];
  const iD = [-d[1] * py, d[0] * py];          // i py (t+ - t-) / 2
  return [[sum, [-iD[0], -iD[1]]], [iD, sum]];
}
