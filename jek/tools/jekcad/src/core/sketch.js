/* ==========================================================================
   A sketch: its shapes, the constraints between them, and its dimensions (begun as JEKray's Model-mode sketch,
   core/sketch.js there, and owned here since). The shapes are lines (a, b), arcs (centre c, radius r, from angle
   a0 to a1 counter-clockwise, degrees), circles (c, r) and points (c); k marks a construction shape. Constraints and
   dimensions name their points (a line's ends a and b and its middle m, an arc's centre c and ends p0, p1, a
   circle's centre c, a point's c) or the shapes themselves, and the sketch's origin.
   The solver moves the shapes' numbers as little as it can so that every constraint and dimension holds: a
   dimension changed, a point dragged, the model regenerated with a variable changed.

   Constraints (t): coincident (two points), oncurve (a point on a line, circle or arc), horizontal and vertical (a
   line, or two points), parallel, perpendicular, equal (two lines' lengths, or two circles' or arcs' radii), tangent
   (a line and a circle or arc, or two of those), midpoint (a point at a line's middle), concentric, fix (a point
   where it is), symmetric (two points about a line). Dimensions (t): dist (two points; h or v: across or up only),
   len (a line), pl (a point from a line), rad, dia (a circle or arc), ang (between two lines); v is its value, mm
   or degrees, and x what was typed for it (an expression, which may name the Variables table's #names).
   ========================================================================== */
const deg = Math.PI / 180;
const num = (v, d) => { const x = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(x) ? x : d; };
export const CON_KINDS = ['coincident', 'oncurve', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'equal', 'tangent', 'midpoint', 'concentric', 'fix', 'symmetric'];
export const DIM_KINDS = ['dist', 'len', 'pl', 'rad', 'dia', 'ang'];
export const ENT_KINDS = ['line', 'arc', 'circle', 'point'];
const sfin = (v, d) => { const x = num(v, d); return Number.isFinite(x) ? x : d; };
const okRef = r => r && typeof r === 'object' && typeof r.e === 'string' && r.e.length < 30 && (r.k === undefined || /^(a|b|m|c|p0|p1|p2|p3)$/.test(r.k));
const cleanRef = r => (r.k ? { e: r.e, k: r.k } : { e: r.e });
let sidN = 0;
export const sketchId = p => p + Date.now().toString(36).slice(-3) + (sidN++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
/* a sketch's constraints and dimensions, checked against its shapes: one that names a shape not there is dropped */
export function normCons(cons, ents) {
  const ids = new Set(ents.map(e => e.id).concat('origin'));
  return (Array.isArray(cons) ? cons : []).slice(0, 2000).filter(c => c && CON_KINDS.includes(c.t) && Array.isArray(c.r) && c.r.length >= 1 && c.r.length <= 3 && c.r.every(okRef) && c.r.every(r => ids.has(r.e)))
    .map(c => Object.assign({ id: typeof c.id === 'string' && c.id.length < 30 ? c.id : sketchId('c'), t: c.t, r: c.r.map(cleanRef) }, c.t === 'fix' && Array.isArray(c.at) ? { at: c.at.slice(0, 6).map(v => sfin(v, 0)) } : {},
      c.t === 'tangent' && (c.s === 1 || c.s === -1) ? { s: c.s } : {}, c.t === 'tangent' && (c.at === 'p0' || c.at === 'p1') ? { at: c.at } : {}));
}
export function normDims(dims, ents) {
  const ids = new Set(ents.map(e => e.id).concat('origin'));
  return (Array.isArray(dims) ? dims : []).slice(0, 1000).filter(d => d && DIM_KINDS.includes(d.t) && Array.isArray(d.r) && d.r.length >= 1 && d.r.length <= 2 && d.r.every(okRef) && d.r.every(r => ids.has(r.e)))
    .map(d => Object.assign({ id: typeof d.id === 'string' && d.id.length < 30 ? d.id : sketchId('d'), t: d.t, r: d.r.map(cleanRef), v: d.t === 'ang' ? sfin(d.v, 90) : Math.max(0, sfin(d.v, 10)) },
      d.dir === 'h' || d.dir === 'v' ? { dir: d.dir } : {}, d.s === 1 || d.s === -1 ? { s: d.s } : {}, d.rev && d.t === 'ang' ? { rev: true } : {}, Array.isArray(d.off) && d.off.length === 2 ? { off: [sfin(d.off[0], 0), sfin(d.off[1], 0)] } : {},
      typeof d.x === 'string' && d.x.length < 200 ? { x: d.x } : {}));
}

/* ---------- a shape's numbers, and its points from them ---------- */
const PARAMS = {
  line: [['a', 0], ['a', 1], ['b', 0], ['b', 1]], arc: [['c', 0], ['c', 1], ['r'], ['a0'], ['a1']], circle: [['c', 0], ['c', 1], ['r']], hole: [['c', 0], ['c', 1], ['d']],
  slot: [['a', 0], ['a', 1], ['b', 0], ['b', 1], ['r']], poly: [['c', 0], ['c', 1], ['r'], ['rot']], rect: [['c', 0], ['c', 1], ['w'], ['h'], ['rot']], point: [['c', 0], ['c', 1]],
};
const getP = (e, p) => (p.length === 2 ? e[p[0]][p[1]] : e[p[0]]);
const setP = (e, p, v) => { if (p.length === 2) e[p[0]][p[1]] = v; else e[p[0]] = v; };
/* a point of a shape, by its key; the origin is [0, 0] */
export function hpt(E, r) {
  if (r.e === 'origin') return [0, 0];
  const e = E.get(r.e); if (!e) return [0, 0];
  const k = r.k || 'c';
  switch (e.t) {
    case 'line': return k === 'a' ? e.a : k === 'b' ? e.b : [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    case 'slot': return k === 'a' ? e.a : k === 'b' ? e.b : [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    case 'arc': { if (k === 'c') return e.c; const a = (k === 'p0' ? e.a0 : e.a1) * deg; return [e.c[0] + e.r * Math.cos(a), e.c[1] + e.r * Math.sin(a)]; }
    case 'rect': {
      if (k === 'c' || k === 'm') return e.c;
      const i = +k.slice(1), w = e.w / 2, hh = e.h / 2, q = [[w, -hh], [w, hh], [-w, hh], [-w, -hh]][i] || [0, 0], a = e.rot * deg;
      return [e.c[0] + q[0] * Math.cos(a) - q[1] * Math.sin(a), e.c[1] + q[0] * Math.sin(a) + q[1] * Math.cos(a)];
    }
    default: return e.c || [0, 0];
  }
}
/* the keys of a shape's points: its ends (and the like), then its centre */
export function entKeys(e) {
  switch (e.t) {
    case 'line': return ['a', 'b'];
    case 'slot': return ['a', 'b'];
    case 'arc': return ['p0', 'p1', 'c'];
    case 'rect': return ['p0', 'p1', 'p2', 'p3', 'c'];
    default: return ['c'];
  }
}
export const lineDir = e => [e.b[0] - e.a[0], e.b[1] - e.a[1]];
const radiusOf = e => (e.t === 'hole' ? e.d / 2 : e.r);
const curveC = e => e.c;
// a point's signed distance from a line (left of it, positive)
const sdLine = (p, e) => { const d = lineDir(e), L = Math.hypot(d[0], d[1]) || 1e-12; return ((p[0] - e.a[0]) * d[1] - (p[1] - e.a[1]) * d[0]) / -L; };

/* ---------- each constraint and dimension as equations (residuals that are 0 when it holds) ---------- */
function conResiduals(E, c, out) {
  const P = r => hpt(E, r), en = r => E.get(r.e);
  switch (c.t) {
    case 'coincident': { const a = P(c.r[0]), b = P(c.r[1]); out.push(a[0] - b[0], a[1] - b[1]); return; }
    case 'oncurve': { const p = P(c.r[0]), e = en(c.r[1]); if (!e) return; if (e.t === 'line') out.push(sdLine(p, e)); else out.push(Math.hypot(p[0] - curveC(e)[0], p[1] - curveC(e)[1]) - radiusOf(e)); return; }
    case 'horizontal': case 'vertical': {
      const k = c.t === 'horizontal' ? 1 : 0;
      if (c.r.length === 1) { const e = en(c.r[0]); if (e && e.t === 'line') out.push(e.a[k] - e.b[k]); return; }
      const a = P(c.r[0]), b = P(c.r[1]); out.push(a[k] - b[k]); return;
    }
    case 'parallel': case 'perpendicular': {
      const e1 = en(c.r[0]), e2 = en(c.r[1]); if (!e1 || !e2) return;
      const d1 = lineDir(e1), d2 = lineDir(e2), L = (Math.hypot(...d1) * Math.hypot(...d2)) || 1e-12;
      out.push(c.t === 'parallel' ? (d1[0] * d2[1] - d1[1] * d2[0]) / L * 50 : (d1[0] * d2[0] + d1[1] * d2[1]) / L * 50);
      return;
    }
    case 'equal': {
      const e1 = en(c.r[0]), e2 = en(c.r[1]); if (!e1 || !e2) return;
      if (e1.t === 'line' && e2.t === 'line') out.push(Math.hypot(...lineDir(e1)) - Math.hypot(...lineDir(e2)));
      else out.push(radiusOf(e1) - radiusOf(e2));
      return;
    }
    case 'tangent': {
      const e1 = en(c.r[0]), e2 = en(c.r[1]); if (!e1 || !e2) return;
      if (e1.t === 'line' || e2.t === 'line') {
        const L = e1.t === 'line' ? e1 : e2, C = L === e1 ? e2 : e1;
        // at an arc's end on the line (a fillet, a tangent arc): the radius there square to the line (as the distance form
        // alone is met only to second order there, which leaves the end seeming free to slide)
        if (c.at && C.t === 'arc') { const p = hpt(E, { e: C.id, k: c.at }), d = lineDir(L), n = Math.hypot(...d) || 1e-12; out.push(((p[0] - C.c[0]) * d[0] + (p[1] - C.c[1]) * d[1]) / n); return; }
        out.push(Math.abs(sdLine(curveC(C), L)) - radiusOf(C)); return;
      }
      const d = Math.hypot(e1.c[0] - e2.c[0], e1.c[1] - e2.c[1]), s = c.s || 1;
      out.push(s > 0 ? d - (radiusOf(e1) + radiusOf(e2)) : d - Math.abs(radiusOf(e1) - radiusOf(e2)));
      return;
    }
    case 'midpoint': { const p = P(c.r[0]), e = en(c.r[1]); if (!e) return; const m = hpt(E, { e: c.r[1].e, k: 'm' }); out.push(p[0] - m[0], p[1] - m[1]); return; }
    case 'concentric': { const e1 = en(c.r[0]), e2 = en(c.r[1]); if (!e1 || !e2) return; const a = hpt(E, { e: e1.id, k: 'c' }), b = hpt(E, { e: e2.id, k: 'c' }); out.push(a[0] - b[0], a[1] - b[1]); return; }
    case 'fix': { const p = P(c.r[0]), at = c.at || p; out.push(p[0] - at[0], p[1] - at[1]); return; }
    case 'symmetric': {
      const a = P(c.r[0]), b = P(c.r[1]), L = en(c.r[2]); if (!L) return;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = lineDir(L), n = Math.hypot(...d) || 1e-12;
      out.push(sdLine(m, L), ((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1]) / n);
      return;
    }
  }
}
function dimResidual(E, d, out) {
  const P = r => hpt(E, r), en = r => E.get(r.e);
  switch (d.t) {
    case 'dist': { const a = P(d.r[0]), b = P(d.r[1]); if (d.dir === 'h') out.push((d.s || 1) * (b[0] - a[0]) - d.v); else if (d.dir === 'v') out.push((d.s || 1) * (b[1] - a[1]) - d.v); else out.push(Math.hypot(b[0] - a[0], b[1] - a[1]) - d.v); return; }
    case 'len': { const e = en(d.r[0]); if (e && e.t === 'line') out.push(Math.hypot(...lineDir(e)) - d.v); else if (e && e.t === 'slot') out.push(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) - d.v); return; }
    case 'pl': { const p = P(d.r[0]), e = en(d.r[1]); if (e && e.t === 'line') out.push((d.s || 1) * sdLine(p, e) - d.v); return; }
    case 'rad': case 'dia': { const e = en(d.r[0]); if (!e) return; const r = e.t === 'slot' ? e.r : e.t === 'rect' ? (e.rad || 0) : radiusOf(e); out.push((d.t === 'dia' ? 2 * r : r) - d.v); return; }
    case 'ang': {
      const e1 = en(d.r[0]), e2 = en(d.r[1]); if (!e1 || !e2) return;
      // rev: the second line taken the other way along, so the angle is the one inside the corner the lines make
      const u = lineDir(e1), k = d.rev ? -1 : 1, w = lineDir(e2).map(x => x * k), cr = u[0] * w[1] - u[1] * w[0], dt = u[0] * w[0] + u[1] * w[1];
      out.push((Math.atan2((d.s || 1) * cr, dt) / deg - d.v) * 0.5);
      return;
    }
  }
}
/* what a dimension measures now (to show, or to start a new one at) */
export function dimMeasure(ents, d) {
  const E = new Map(ents.map(e => [e.id, e])), out = [];
  dimResidual(E, Object.assign({}, d, { v: 0 }), out);
  return d.t === 'ang' ? out[0] / 0.5 : out[0];
}

/* ---------- the solver ---------- */
/* every number of every shape (each a variable), and each equation with the shapes it depends on */
function system(ents, cons, dims, extra) {
  const E = new Map(ents.map(e => [e.id, e])), vars = [], at = new Map();
  for (const e of ents) { at.set(e.id, vars.length); for (const p of PARAMS[e.t] || []) vars.push([e, p]); }
  const eqs = [];
  const deps = rs => [...new Set(rs.filter(r => r.e !== 'origin').map(r => r.e))];
  for (const c of cons) eqs.push({ f: out => conResiduals(E, c, out), d: deps(c.r), src: c });
  for (const d of dims) eqs.push({ f: out => dimResidual(E, d, out), d: deps(d.r), src: d });
  for (const x of extra || []) eqs.push({ f: out => { const p = hpt(E, x.r); out.push((p[0] - x.to[0]) * (x.w || 1), (p[1] - x.to[1]) * (x.w || 1)); }, d: deps([x.r]), src: x });
  return { E, vars, at, eqs };
}
function evalAll(S) {
  const F = [], rows = [];
  for (const q of S.eqs) { const o = []; q.f(o); rows.push([F.length, o.length]); F.push(...o); }
  return { F, rows };
}
// the Jacobian, by small steps in each variable, re-evaluating only the equations that depend on its shape
function jacobian(S, F0, rows) {
  const m = F0.length, n = S.vars.length, J = Array.from({ length: m }, () => new Float64Array(n));
  const byEnt = new Map();
  S.eqs.forEach((q, i) => { for (const id of q.d) { if (!byEnt.has(id)) byEnt.set(id, []); byEnt.get(id).push(i); } });
  for (let j = 0; j < n; j++) {
    const [e, p] = S.vars[j], x0 = getP(e, p), h = 1e-7 * Math.max(1, Math.abs(x0));
    setP(e, p, x0 + h);
    for (const i of byEnt.get(e.id) || []) {
      const o = []; S.eqs[i].f(o); const [r0] = rows[i];
      for (let k = 0; k < o.length; k++) J[r0 + k][j] = (o[k] - F0[r0 + k]) / h;
    }
    setP(e, p, x0);
  }
  return J;
}
// (A + lam I) y = b, by Gaussian elimination with pivoting (A square, small)
function solveSym(A, b, lam) {
  const m = b.length, M = A.map((row, i) => { const r = Array.from(row); r[i] += lam; r.push(b[i]); return r; });
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) continue;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < m; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; }
  }
  const y = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) { let s = M[r][m]; for (let k = r + 1; k < m; k++) s -= M[r][k] * y[k]; y[r] = Math.abs(M[r][r]) > 1e-300 ? s / M[r][r] : 0; }
  return y;
}
const maxAbs = F => F.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
/* every constraint and dimension made to hold, the shapes moved as little as they can be (each step the smallest that
   would solve the equations, Levenberg's damping keeping it in hand): { ok, err (the largest left, mm), it } */
export function solveSketch(ents, cons, dims, extra, opts) {
  opts = opts || {};
  const S = system(ents, cons || [], dims || [], extra);
  if (!S.eqs.length || !S.vars.length) return { ok: true, err: 0, it: 0 };
  let { F, rows } = evalAll(S), err = maxAbs(F), lam = 1e-9, it = 0;
  const tol = opts.tol || 1e-9, n = S.vars.length;
  for (; it < (opts.iters || 60) && err > tol; it++) {
    const J = jacobian(S, F, rows), m = F.length;
    // the smallest step: dx = -J^T y, (J J^T + lam) y = F
    const A = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) for (let k = i; k < m; k++) { let s = 0; const a = J[i], b = J[k]; for (let j = 0; j < n; j++) s += a[j] * b[j]; A[i][k] = s; A[k][i] = s; }
    const tr = A.reduce((s, row, i) => s + row[i], 0) / Math.max(1, m);
    const keep = S.vars.map(([e, p]) => getP(e, p));
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      const y = solveSym(A, F, lam * Math.max(tr, 1e-12));
      for (let j = 0; j < n; j++) { let s = 0; for (let i = 0; i < m; i++) s -= J[i][j] * y[i]; const [e, p] = S.vars[j]; setP(e, p, keep[j] + s); }
      const r = evalAll(S), e2 = maxAbs(r.F);
      if (e2 < err || !Number.isFinite(err)) { F = r.F; rows = r.rows; err = e2; lam = Math.max(lam / 4, 1e-12); improved = true; break; }
      S.vars.forEach(([e, p], j) => setP(e, p, keep[j]));
      lam *= 10;
    }
    if (!improved) break;
  }
  // a shape's sizes stay sizes (a radius, a width above nothing)
  for (const e of ents) { if (e.r !== undefined && e.t !== 'rect') e.r = Math.abs(e.r) || 1e-4; if (e.t === 'hole') e.d = Math.abs(e.d) || 1e-3; if (e.t === 'rect') { e.w = Math.abs(e.w) || 1e-3; e.h = Math.abs(e.h) || 1e-3; } }
  return { ok: err <= Math.max(tol * 1e3, 1e-7), err, it };
}
/* which shapes are fully defined: none of their numbers can move without breaking a constraint or a dimension (the
   null space of the equations' Jacobian has no part in them). Returns a Set of their ids */
/* a sketch solved after one thing in it changed (a dimension typed), the rest left where it was as far as it can
   be: every other shape's points are held, lightly, while the change is taken up, so it is the shape that was
   dimensioned that moves and a loose shape it touches stays put; then solved once more with nothing held */
export function solveNear(ents, cons, dims, freeIds, opts) {
  const free = new Set(freeIds || []), E = new Map(ents.map(e => [e.id, e])), hold = [];
  for (const e of ents) if (!free.has(e.id)) for (const k of entKeys(e)) hold.push({ r: { e: e.id, k }, to: hpt(E, { e: e.id, k }).slice(), w: 0.03 });
  solveSketch(ents, cons, dims, hold, opts);
  return solveSketch(ents, cons, dims, null, opts);
}
export function definedEnts(ents, cons, dims) {
  const S = system(ents, cons || [], dims || []);
  const n = S.vars.length; if (!n) return new Set();
  if (n > 240) return new Set();               // (a sketch this big is not worked out: nothing is shown as fully defined)
  const { F, rows } = evalAll(S), J = jacobian(S, F, rows), m = F.length;
  // J^T J, its eigenvectors by Jacobi's rotations; those with a (relatively) zero eigenvalue span the freedom left
  const A = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let k = i; k < n; k++) { let s = 0; for (let r = 0; r < m; r++) s += J[r][i] * J[r][k]; A[i][k] = s; A[k][i] = s; }
  const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) off += A[i][k] * A[i][k];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-14) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const ev = Array.from({ length: n }, (_, i) => A[i][i]), top = Math.max(1e-12, ...ev.map(Math.abs));
  const free = new Float64Array(n);
  for (let k = 0; k < n; k++) if (Math.abs(ev[k]) < 1e-9 * top) for (let i = 0; i < n; i++) free[i] += V[i][k] * V[i][k];
  const out = new Set();
  for (const e of ents) { const a = S.at.get(e.id), np = (PARAMS[e.t] || []).length; let ok = np > 0; for (let j = a; j < a + np; j++) if (free[j] > 1e-8) ok = false; if (ok) out.add(e.id); }
  return out;
}

/* ---------- regions: the plane cut by every curve of the sketch, as a CAD program's sketch regions ----------
   Every (non-construction) shape's outline is cut where it crosses another; the faces those edges bound are the regions,
   each an outline and the holes in it (what lies inside it, not joined to it). A region is chosen by a point inside it,
   so a choice survives the sketch being changed while the region is still there. */
export function sketchRegions(ents, outline) {
  // (each step of an outline remembers the shape it is a step of: a region's outline carries, as .src, the shape
  // each of its sides lies on, so the kernel can make the region's face of true lines and arcs)
  const segs = [], srcOf = [];
  for (const e of ents) {
    if (e.k || e.t === 'point') continue;
    const P = outline(e), closed = !(e.t === 'line' || e.t === 'arc');
    for (let i = 0; i + 1 < P.length; i++) { segs.push([P[i], P[i + 1]]); srcOf.push(e); }
    if (closed && P.length > 2) { segs.push([P[P.length - 1], P[0]]); srcOf.push(e); }
  }
  if (!segs.length) return [];
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const s of segs) for (const p of s) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
  const scale = Math.max(1, hi[0] - lo[0], hi[1] - lo[1]), tol = 1e-7 * scale;
  // where segments cross: each cut there
  const cuts = segs.map(() => [0, 1]);
  const bb = s => [Math.min(s[0][0], s[1][0]), Math.min(s[0][1], s[1][1]), Math.max(s[0][0], s[1][0]), Math.max(s[0][1], s[1][1])];
  const B = segs.map(bb);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = B[i], b = B[j];
    if (a[0] > b[2] + tol || b[0] > a[2] + tol || a[1] > b[3] + tol || b[1] > a[3] + tol) continue;
    const [p, p2] = segs[i], [q, q2] = segs[j], r = [p2[0] - p[0], p2[1] - p[1]], s = [q2[0] - q[0], q2[1] - q[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-14 * scale * scale) continue;
    const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den;
    const et = tol / (Math.hypot(...r) || 1), eu = tol / (Math.hypot(...s) || 1);
    if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) continue;
    cuts[i].push(Math.min(1, Math.max(0, t))); cuts[j].push(Math.min(1, Math.max(0, u)));
  }
  // the vertices (merged within tol) and the edges between them
  const verts = [], grid = new Map(), cell = Math.max(tol * 4, 1e-9);
  const vid = p => {
    const gx = Math.round(p[0] / cell), gy = Math.round(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const L = grid.get((gx + dx) + ',' + (gy + dy)); if (L) for (const v of L) if (Math.hypot(verts[v][0] - p[0], verts[v][1] - p[1]) <= tol * 2) return v; }
    verts.push(p); const k = gx + ',' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(verts.length - 1); return verts.length - 1;
  };
  const edges = new Map();
  segs.forEach((s, i) => {
    const ts = [...new Set(cuts[i])].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      if (ts[k + 1] - ts[k] < 1e-12) continue;
      const P = t => [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t];
      const a = vid(P(ts[k])), b = vid(P(ts[k + 1]));
      if (a !== b) edges.set(Math.min(a, b) + '-' + Math.max(a, b), [a, b, srcOf[i]]);
    }
  });
  // edges that end nowhere bound nothing: taken away until none is left
  const adj = new Map();
  const link = () => { adj.clear(); for (const [a, b] of edges.values()) { if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); } };
  link();
  for (let changedAny = true; changedAny;) {
    changedAny = false;
    for (const [k, [a, b]] of edges) if (adj.get(a).length < 2 || adj.get(b).length < 2) { edges.delete(k); changedAny = true; }
    if (changedAny) link();
  }
  // round each vertex, its edges by angle; each face traced keeping it on the left
  const ang = (a, b) => Math.atan2(verts[b][1] - verts[a][1], verts[b][0] - verts[a][0]);
  for (const [v, L] of adj) L.sort((x, y) => ang(v, x) - ang(v, y));
  const used = new Set(), cycles = [];
  for (const [a, b] of [...edges.values()].flatMap(([a, b]) => [[a, b], [b, a]])) {
    if (used.has(a + '>' + b)) continue;
    const cyc = [], cs = [];
    let u = a, v = b, guard = 0;
    while (!used.has(u + '>' + v) && guard++ < 100000) {
      used.add(u + '>' + v); cyc.push(u); cs.push(edges.get(Math.min(u, v) + '-' + Math.max(u, v))[2]);
      // at v: the edge just clockwise of the way back (v to u)
      const L = adj.get(v), i = L.indexOf(u), w = L[(i - 1 + L.length) % L.length];
      u = v; v = w;
    }
    if (cyc.length >= 3) cycles.push(Object.assign(cyc.map(i => verts[i]), { src: cs }));
  }
  const area = P => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const faces = cycles.filter(c => area(c) > tol * tol).map(c => ({ outer: c, holes: [], a: area(c) }));
  const rims = cycles.filter(c => area(c) < -tol * tol);
  // each component's rim (traced clockwise) a hole in the smallest face round it
  for (const r of rims) {
    const q = r[0];
    let best = null;
    for (const f of faces) if (f.a > -area(r) - tol && inside(f.outer, q) && !f.outer.some(p => p === q) && (!best || f.a < best.a)) best = f;
    if (best) best.holes.push(r);
  }
  for (const f of faces) f.pt = innerPoint(f, scale);
  return faces.map(f => ({ outer: f.outer, holes: f.holes, area: f.a - f.holes.reduce((s, h) => s - area(h), 0), pt: f.pt })).filter(f => f.pt);
}
export function inside(P, q) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
export const inRegion = (R, q) => inside(R.outer, q) && !R.holes.some(h => inside(h, q));
// a point well inside a region (to choose it by): its middle if that is in it, else just inside one of its edges
function innerPoint(f, scale) {
  const R = { outer: f.outer, holes: f.holes };
  const n = f.outer.length, c = f.outer.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  if (inRegion(R, c)) return c;
  let best = null, bd = -1;
  for (let i = 0; i < n; i++) {
    const a = f.outer[i], b = f.outer[(i + 1) % n], d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d);
    if (L < 1e-12) continue;
    for (const eps of [L * 0.2, L * 0.05, scale * 1e-4]) {
      const q = [(a[0] + b[0]) / 2 - d[1] / L * eps, (a[1] + b[1]) / 2 + d[0] / L * eps];
      if (inRegion(R, q)) { if (eps > bd) { bd = eps; best = q; } break; }
    }
  }
  return best;
}
