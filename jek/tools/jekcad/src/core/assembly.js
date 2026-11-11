import { sketchId } from './sketch.js';

/* ==========================================================================
   An assembly: parts of the document's Part Studios put together. Each instance is a part (its studio's tab, the
   part's id) and where it is: p, a place, and q, a turn (a quaternion x, y, z, w); world = turn(local) + p. A mate
   joins two instances by a connector on each: a point o and two axes z and x, in the part's own coordinates,
   found on a face (its middle and its normal; a round face's axis). The kinds of mate are what they leave free:
     fastened     nothing
     revolute     turning about z
     slider       sliding along z
     cylindrical  turning about z and sliding along it
     planar       sliding in the plane square to z, and turning about z
   The connectors' z axes meet head on (two faces laid one on the other), or the same way with flip.
   Pure: no page, no kernel. The solver moves the instances that are not fixed until every mate holds.
   ========================================================================== */
export const MATE_KINDS = ['fastened', 'revolute', 'slider', 'cylindrical', 'planar'];
export const MATE_NAMES = { fastened: 'Fastened', revolute: 'Revolute', slider: 'Slider', cylindrical: 'Cylindrical', planar: 'Planar' };
const asmFin3 = (v, d) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(Number.isFinite) ? v.slice(0, 3).map(Number) : d.slice());
const asmStr = (v, n) => typeof v === 'string' && v.length > 0 && v.length <= n;
const asmUnit = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
const asmCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const asmDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/* ---------- turns ---------- */
export const qnormal = q => { const L = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / L, q[1] / L, q[2] / L, q[3] / L]; };
export const qtimes = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qturn = (q, v) => { const u = [q[0], q[1], q[2]], t = asmCross(u, v).map(x => 2 * x), c = asmCross(u, t); return [v[0] + q[3] * t[0] + c[0], v[1] + q[3] * t[1] + c[1], v[2] + q[3] * t[2] + c[2]]; };
/* a turn about an axis (a unit vector) by an angle, radians; and the turn a small vector w stands for (about w, by its length) */
export const qabout = (ax, an) => { const s = Math.sin(an / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(an / 2)]; };
const asmQvec = w => { const an = Math.hypot(w[0], w[1], w[2]); return an < 1e-14 ? [0, 0, 0, 1] : qabout([w[0] / an, w[1] / an, w[2] / an], an); };
/* a turn as angles about x, y, z (degrees, applied in that order), and back: what the panel shows and takes */
export const qFromEuler = e => { const r = Math.PI / 180; return qnormal(qtimes(qabout([0, 0, 1], e[2] * r), qtimes(qabout([0, 1, 0], e[1] * r), qabout([1, 0, 0], e[0] * r)))); };
export function qToEuler(q) {
  const [x, y, z, w] = q, d = 180 / Math.PI, s = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
  return [Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * d, Math.asin(s) * d, Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * d];
}
/* a point, and a direction, of a part where its instance puts them */
export const placed = (I, v) => { const r = qturn(I.q, v); return [r[0] + I.p[0], r[1] + I.p[1], r[2] + I.p[2]]; };
export const turned3 = (I, v) => qturn(I.q, v);

/* ---------- the document's assembly, checked ---------- */
function asmConn(c) {
  if (!c || typeof c !== 'object' || !asmStr(c.inst, 40)) return null;
  const z = asmUnit(asmFin3(c.z, [0, 0, 1]));
  let x = asmFin3(c.x, [1, 0, 0]); x = [0, 1, 2].map(i => x[i] - z[i] * asmDot(x, z));
  if (Math.hypot(...x) < 1e-9) x = Math.abs(z[2]) < 0.9 ? asmCross([0, 0, 1], z) : [1, 0, 0];
  return Object.assign({ inst: c.inst, o: asmFin3(c.o, [0, 0, 0]), z, x: asmUnit(x) }, asmStr(c.face, 160) ? { face: c.face } : {}, c.round ? { round: true } : {});
}
export function normAsm(a, n) {
  a = a && typeof a === 'object' ? a : {};
  const ids = new Set(), instances = [];
  for (const I of (Array.isArray(a.instances) ? a.instances : []).slice(0, 500)) {
    if (!I || !asmStr(I.studio, 40) || !asmStr(I.part, 80)) continue;
    const id = asmStr(I.id, 40) && !ids.has(I.id) ? I.id : sketchId('i'); ids.add(id);
    const q = Array.isArray(I.q) && I.q.length === 4 && I.q.every(Number.isFinite) && Math.hypot(...I.q) > 1e-9 ? qnormal(I.q.map(Number)) : [0, 0, 0, 1];
    instances.push(Object.assign({ id, studio: I.studio, part: I.part, p: asmFin3(I.p, [0, 0, 0]), q }, asmStr(I.name, 80) ? { name: I.name } : {}, I.fixed ? { fixed: true } : {}, I.hidden ? { hidden: true } : {}));
  }
  const mids = new Set(), mates = [];
  for (const m of (Array.isArray(a.mates) ? a.mates : []).slice(0, 1000)) {
    if (!m || !MATE_KINDS.includes(m.t)) continue;
    const A = asmConn(m.a), B = asmConn(m.b);
    if (!A || !B || A.inst === B.inst || !ids.has(A.inst) || !ids.has(B.inst)) continue;
    const id = asmStr(m.id, 40) && !mids.has(m.id) ? m.id : sketchId('m'); mids.add(id);
    mates.push(Object.assign({ id, t: m.t, name: asmStr(m.name, 80) ? m.name : MATE_NAMES[m.t] + ' ' + (mates.filter(x => x.t === m.t).length + 1), a: A, b: B }, m.flip ? { flip: true } : {}, m.suppressed ? { suppressed: true } : {}));
  }
  return { id: asmStr(a.id, 40) ? a.id : sketchId('t'), kind: 'assembly', name: asmStr(a.name, 120) && a.name.trim() ? a.name : 'Assembly ' + (n || 1), instances, mates };
}

/* ---------- a connector from a face of a part's mesh ----------
   M: the mesh the kernel sends (pos, nrm, idx, faceGroups, faceKinds, faceNames). A flat face: its middle, z its
   normal (out of the part). A round one (a hole's wall, a pin's side): a point on its axis, half way along, z along
   the axis. In the part's own coordinates. */
export function faceConnector(M, face) {
  const from = M.faceGroups[2 * face], cnt = M.faceGroups[2 * face + 1];
  if (!(cnt >= 3)) return null;
  const V = i => [M.pos[3 * i], M.pos[3 * i + 1], M.pos[3 * i + 2]], N = i => [M.nrm[3 * i], M.nrm[3 * i + 1], M.nrm[3 * i + 2]];
  let A = 0; const c = [0, 0, 0], nm = [0, 0, 0], used = new Set();
  for (let k = from; k + 2 < from + cnt; k += 3) {
    const a = V(M.idx[k]), b = V(M.idx[k + 1]), d = V(M.idx[k + 2]), cr = asmCross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]), ar = Math.hypot(...cr) / 2;
    A += ar; for (let i = 0; i < 3; i++) { c[i] += ar * (a[i] + b[i] + d[i]) / 3; }
    const n0 = N(M.idx[k]); for (let i = 0; i < 3; i++) nm[i] += ar * n0[i];
    used.add(M.idx[k]); used.add(M.idx[k + 1]); used.add(M.idx[k + 2]);
  }
  if (!(A > 0)) return null;
  const mid = c.map(v => v / A), kind = M.faceKinds ? M.faceKinds[face] : 'plane', name = M.faceNames ? M.faceNames[face] : undefined;
  const frame = (o, z, round) => { z = asmUnit(z); const x = asmUnit(Math.abs(z[2]) < 0.9 ? asmCross([0, 0, 1], z) : [1, 0, 0]); return Object.assign({ o, z, x }, name ? { face: name } : {}, round ? { round: true } : {}); };
  if (kind === 'plane' || Math.hypot(...nm) / A > 0.999) return frame(mid, nm, false);
  // a round face: its axis is square to every normal (the direction the normals have least of); a point on it is
  // each corner less the radius along its normal
  const ix = [...used], S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of ix) { const n0 = N(i); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) S[r][s] += n0[r] * n0[s]; }
  // the least direction: what is left of a vector after the two greater ones are taken out (power steps on the rest)
  const big = M0 => { let v = [1, 0.7, 0.3]; for (let k = 0; k < 60; k++) { v = asmUnit([0, 1, 2].map(r => asmDot(M0[r], v))); } return v; };
  const v1 = big(S), l1 = asmDot(v1, [0, 1, 2].map(r => asmDot(S[r], v1))), S2 = S.map((row, r) => row.map((x, s) => x - l1 * v1[r] * v1[s])), v2 = big(S2);
  const ax = asmUnit(asmCross(v1, v2));
  if (!(Math.hypot(...asmCross(v1, v2)) > 1e-6)) return frame(mid, nm, false);
  const u = asmUnit(asmCross(ax, Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), w = asmCross(ax, u);
  // least squares for the centre (cu, cw) and the radius r: (p − r n)·u = cu, (p − r n)·w = cw
  let n2 = 0, su = 0, sw = 0, snu = 0, snw = 0, spn = 0, cnt2 = 0;
  for (const i of ix) { const p = V(i), n0 = N(i), pu = asmDot(p, u), pw = asmDot(p, w), nu = asmDot(n0, u), nw = asmDot(n0, w); su += pu; sw += pw; snu += nu; snw += nw; n2 += nu * nu + nw * nw; spn += pu * nu + pw * nw; cnt2++; }
  const den = n2 - (snu * snu + snw * snw) / cnt2, r = Math.abs(den) > 1e-12 ? (spn - (su * snu + sw * snw) / cnt2) / den : 0;
  const cu = (su - r * snu) / cnt2, cw = (sw - r * snw) / cnt2, hgt = asmDot(mid, ax);
  // (the axis the way that is mostly up, so two holes drilled the same way have axes the same way)
  const zz = (Math.abs(ax[2]) > 1e-6 ? ax[2] : Math.abs(ax[1]) > 1e-6 ? ax[1] : ax[0]) < 0 ? ax.map(v => -v) : ax;
  return frame([0, 1, 2].map(i => u[i] * cu + w[i] * cw + ax[i] * hgt), zz, true);
}

/* ---------- the mates as equations, and their solving ---------- */
function mateEqs(m, IA, IB, out) {
  const oa = placed(IA, m.a.o), ob = placed(IB, m.b.o), za = turned3(IA, m.a.z), zb0 = turned3(IB, m.b.z), xa = turned3(IA, m.a.x), xb = turned3(IB, m.b.x);
  // head on (a face laid on a face), or the same way; two round faces' axes run the same way unless flipped
  const same = !!(m.a.round && m.b.round) !== !!m.flip, zb = same ? zb0 : zb0.map(v => -v), W = 20;
  const d = [oa[0] - ob[0], oa[1] - ob[1], oa[2] - ob[2]], along = asmDot(d, zb);
  for (let i = 0; i < 3; i++) out.push((za[i] - zb[i]) * W);
  if (m.t === 'fastened' || m.t === 'slider') for (let i = 0; i < 3; i++) out.push((xa[i] - xb[i]) * W);
  if (m.t === 'fastened' || m.t === 'revolute') out.push(d[0], d[1], d[2]);
  else if (m.t === 'slider' || m.t === 'cylindrical') for (let i = 0; i < 3; i++) out.push(d[i] - along * zb[i]);
  else if (m.t === 'planar') out.push(along);
}
/* the instances moved until the mates hold. hold: [{ inst, p, w }] soft pulls of an instance's place towards p (a
   part being dragged). Changes the instances' p and q in place; { ok, err } */
export function solveMates(asm, hold) {
  // (a pull is weighed against the mates, which leaves them a little out: so the mates are then solved alone, from there)
  if (hold && hold.length) { solveMatesOnce(asm, hold); return solveMatesOnce(asm, null); }
  return solveMatesOnce(asm, null);
}
function solveMatesOnce(asm, hold) {
  const byId = new Map(asm.instances.map(I => [I.id, I])), mates = asm.mates.filter(m => !m.suppressed && byId.has(m.a.inst) && byId.has(m.b.inst));
  const pulls = (hold || []).filter(hd => byId.has(hd.inst));
  if (!mates.length) return { ok: true, err: 0 };
  // what moves: the instances a mate (or a pull) reaches that are not fixed; if none of a group is fixed, its first is held
  const touched = new Set(mates.flatMap(m => [m.a.inst, m.b.inst]));
  let free = asm.instances.filter(I => touched.has(I.id) && !I.fixed);
  if (!asm.instances.some(I => touched.has(I.id) && I.fixed) && !pulls.length) free = free.filter(I => I.id !== mates[0].b.inst);
  const n = free.length * 6;
  if (!n) { const F0 = []; for (const m of mates) mateEqs(m, byId.get(m.a.inst), byId.get(m.b.inst), F0); const e0 = Math.max(0, ...F0.map(Math.abs)); return { ok: e0 < 1e-6, err: e0 }; }
  const base = free.map(I => ({ p: I.p.slice(), q: I.q.slice() }));
  const put = x => free.forEach((I, k) => { const b = base[k]; I.p = [b.p[0] + x[6 * k], b.p[1] + x[6 * k + 1], b.p[2] + x[6 * k + 2]]; I.q = qnormal(qtimes(asmQvec([x[6 * k + 3], x[6 * k + 4], x[6 * k + 5]]), b.q)); });
  const evalF = x => { put(x); const F = []; for (const m of mates) mateEqs(m, byId.get(m.a.inst), byId.get(m.b.inst), F); for (const hd of pulls) { const I = byId.get(hd.inst); for (let i = 0; i < 3; i++) F.push((I.p[i] - hd.p[i]) * (hd.w || 0.05)); } return F; };
  const maxAbs = F => F.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
  let x = new Float64Array(n), F = evalF(x), err = maxAbs(F), lam = 1e-6;
  for (let it = 0; it < 80 && err > 1e-10; it++) {
    const m = F.length, J = Array.from({ length: m }, () => new Float64Array(n));
    for (let j = 0; j < n; j++) { const h0 = j % 6 < 3 ? 1e-6 : 1e-7, x2 = Float64Array.from(x); x2[j] += h0; const F2 = evalF(x2); for (let i = 0; i < m; i++) J[i][j] = (F2[i] - F[i]) / h0; }
    // (JᵀJ + lam) dx = −JᵀF
    const A = Array.from({ length: n }, () => new Float64Array(n)), g = new Float64Array(n);
    for (let i = 0; i < m; i++) { const r = J[i]; for (let a = 0; a < n; a++) { if (!r[a]) continue; g[a] -= r[a] * F[i]; for (let b = a; b < n; b++) A[a][b] += r[a] * r[b]; } }
    for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) A[a][b] = A[b][a];
    let done = false;
    for (let tries = 0; tries < 12 && !done; tries++) {
      const M = A.map((row, i) => { const r = Array.from(row); r[i] += lam * (1 + row[i]); r.push(g[i]); return r; });
      for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-300) continue; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
      const x2 = Float64Array.from(x); for (let i = 0; i < n; i++) x2[i] += Math.abs(M[i][i]) > 1e-300 ? M[i][n] / M[i][i] : 0;
      const F2 = evalF(x2), e2 = maxAbs(F2);
      if (e2 < err) { x = x2; F = F2; err = e2; lam = Math.max(lam / 5, 1e-12); done = true; } else lam *= 10;
    }
    if (!done) break;
    // (the turn so far is folded into the instance, so the next step's small vector stays small)
    put(x); free.forEach((I, k) => { base[k] = { p: I.p.slice(), q: I.q.slice() }; }); x = new Float64Array(n);
  }
  put(x);
  const Fm = []; for (const m of mates) mateEqs(m, byId.get(m.a.inst), byId.get(m.b.inst), Fm);
  const em = maxAbs(Fm);
  return { ok: em < 1e-6, err: em };
}
