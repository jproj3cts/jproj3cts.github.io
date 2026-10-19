import { clamp } from './constants.js';
import { deg } from '../state/project.js';
import { sagFn } from './geometry.js';
import { modMaskFns } from '../engines/mods.js';

/* ---------- Mask functions ----------
   An amplitude or a delay given as a formula in x (along the element, in the bench
   plane), y (out of it), r and theta, in millimetres, with lambda the wavelength in mm.
   It is parsed here into a tree and compiled; only the names below exist in it, so
   nothing else can run. ^ is a power and binds tighter than a leading minus. */
const MASK_VARS = { x: 'x', y: 'y', r: 'Math.sqrt(x*x+y*y)', theta: 'Math.atan2(y,x)', lambda: 'lam', pi: 'Math.PI', e: 'Math.E' };
const MASK_FNS = {
  sin: ['Math.sin', 1], cos: ['Math.cos', 1], tan: ['Math.tan', 1], asin: ['Math.asin', 1], acos: ['Math.acos', 1],
  atan: ['Math.atan', 1], atan2: ['Math.atan2', 2], exp: ['Math.exp', 1], log: ['Math.log', 1], sqrt: ['Math.sqrt', 1],
  abs: ['Math.abs', 1], pow: ['Math.pow', 2], min: ['Math.min', -1], max: ['Math.max', -1], floor: ['Math.floor', 1],
  ceil: ['Math.ceil', 1], round: ['Math.round', 1], sign: ['Math.sign', 1], hypot: ['Math.hypot', -1],
  mod: ['H.mod', 2], step: ['H.step', 1], rect: ['H.rect', 1], circ: ['H.circ', 1], sinc: ['H.sinc', 1], gauss: ['H.gauss', 1],
};
const MASK_H = {
  mod: (a, b) => ((a % b) + b) % b,
  step: v => v >= 0 ? 1 : 0,
  rect: v => Math.abs(v) <= 0.5 ? 1 : 0,
  circ: v => v <= 1 ? 1 : 0,
  sinc: v => v === 0 ? 1 : Math.sin(Math.PI * v) / (Math.PI * v),
  gauss: v => Math.exp(-v * v),
};
export function compileMaskExpr(src) {
  const toks = [], re = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|<=|>=|==|!=|&&|\|\||[-+*/^%(),<>!?:]))/y;
  let m, pos = 0;
  const s = String(src).trim();
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m || m[0].length === 0) {
      if (/^\s+$/.test(s.slice(pos))) break;
      throw new Error('cannot read \u201c' + s.slice(pos, pos + 8) + '\u201d');
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: 'n', v: m[1] });
    else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
    else toks.push({ t: 'op', v: m[3] });
  }
  let i = 0;
  const peek = () => toks[i], isOp = v => toks[i] && toks[i].t === 'op' && toks[i].v === v;
  const need = v => { if (!isOp(v)) throw new Error('expected \u201c' + v + '\u201d'); i++; };
  const ternary = () => {
    const c = orE();
    if (isOp('?')) { i++; const a = ternary(); need(':'); const b = ternary(); return '((' + c + ')?(' + a + '):(' + b + '))'; }
    return c;
  };
  const orE = () => { let l = andE(); while (isOp('||')) { i++; l = '(+(!!(' + l + ')||!!(' + andE() + ')))'; } return l; };
  const andE = () => { let l = cmp(); while (isOp('&&')) { i++; l = '(+(!!(' + l + ')&&!!(' + cmp() + ')))'; } return l; };
  const cmp = () => {
    let l = add();
    while (peek() && peek().t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(peek().v)) {
      const op = toks[i++].v; l = '(+((' + l + ')' + op + '(' + add() + ')))';
    }
    return l;
  };
  const add = () => {
    let l = mul();
    while (isOp('+') || isOp('-')) { const op = toks[i++].v; l = '(' + l + op + mul() + ')'; }
    return l;
  };
  const mul = () => {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[i++].v; l = '(' + l + op + unary() + ')'; }
    return l;
  };
  const unary = () => {
    if (isOp('-')) { i++; return '(-' + unary() + ')'; }
    if (isOp('+')) { i++; return unary(); }
    if (isOp('!')) { i++; return '(+!(' + unary() + '))'; }
    return pow();
  };
  const pow = () => {
    const b = primary();
    if (isOp('^') || isOp('**')) { i++; return 'Math.pow(' + b + ',' + unary() + ')'; }
    return b;
  };
  const primary = () => {
    const tk = toks[i];
    if (!tk) throw new Error('ends too soon');
    if (tk.t === 'n') { i++; return '(' + tk.v + ')'; }
    if (tk.t === 'id') {
      i++;
      if (isOp('(')) {
        // own names only: never 'constructor' and the like from Object's prototype
        const F = Object.hasOwn(MASK_FNS, tk.v) ? MASK_FNS[tk.v] : null;
        if (!F) throw new Error('no function \u201c' + tk.v + '\u201d');
        i++;
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { i++; args.push(ternary()); } }
        need(')');
        if (F[1] >= 0 && args.length !== F[1]) throw new Error(tk.v + ' takes ' + F[1] + ' argument' + (F[1] === 1 ? '' : 's'));
        return F[0] + '(' + args.join(',') + ')';
      }
      if (!Object.hasOwn(MASK_VARS, tk.v)) throw new Error('no variable \u201c' + tk.v + '\u201d');
      return '(' + MASK_VARS[tk.v] + ')';
    }
    if (isOp('(')) { i++; const e = ternary(); need(')'); return e; }
    throw new Error('unexpected \u201c' + tk.v + '\u201d');
  };
  if (!toks.length) throw new Error('empty');
  const js = ternary();
  if (i < toks.length) throw new Error('unexpected \u201c' + toks[i].v + '\u201d');
  return new Function('H', '"use strict"; return function (x, y, lam) { return ' + js + '; };')(MASK_H);
}
const maskCache = new Map();
/* The element's pair (amplitude, delay in waves) as one function, and any error */
export function maskFns(el) {
  if (el.mod) return modMaskFns(el);                       // a mod's plate: its table, not a formula
  const key = el.amp + '\u0000' + el.delay;
  if (maskCache.has(key)) return maskCache.get(key);
  let out;
  try {
    const A = compileMaskExpr(el.amp), D = compileMaskExpr(el.delay);
    out = { fn: (u, v, lam) => { const a = A(u, v, lam), d = D(u, v, lam); return [isFinite(a) ? a : 0, isFinite(d) ? d : 0]; }, err: null };
  } catch (e) {
    out = { fn: () => [1, 0], err: e.message };
  }
  maskCache.set(key, out);
  return out;
}
/* A mask's complex transmission A e^{-2 pi i D} at a point of its plane, as [re, im] */
function maskT(fn, u, v, lam) { const [A, D] = fn(u, v, lam), ph = -2 * Math.PI * D; return [A * Math.cos(ph), A * Math.sin(ph)]; }
/* Where a mask's formula jumps inside a sample, the sample takes the mean transmission over
   its footprint (du by dv about (u, v)), not the value at its centre: a hard edge in the
   formula is then anti-aliased the way a stop's edge is, amplitude and phase alike. A whole
   wave of delay is no jump, so a wrapped phase is left alone. Returns null where it is smooth,
   else [mean re, mean im, mean power]. */
export function maskFootprint(fn, u, v, du, dv, lam, radial) {
  // The formula's smooth behaviour about the sample's centre: its delay to second order, from
  // finite differences over a step far below the sample. Only a departure from that is an
  // edge: a lens-like phase turns fast everywhere yet has none, and the traced path already
  // carries it, so it must pass untouched.
  const e = 1e-3 * Math.min(du, radial ? du : dv);
  const D = (a, b) => fn(u + a, v + b, lam)[1];
  // differences are taken modulo whole waves: a delay that wraps (a vortex's cut) is no edge
  const wrap = d => d - Math.round(d);
  const d0 = D(0, 0), a1 = wrap(D(e, 0) - d0), a2 = wrap(d0 - D(-e, 0));
  const b1 = radial ? 0 : wrap(D(0, e) - d0), b2 = radial ? 0 : wrap(d0 - D(0, -e));
  const gu = (a1 + a2) / (2 * e), gv = (b1 + b2) / (2 * e);
  const huu = (a1 - a2) / (e * e), hvv = (b1 - b2) / (e * e);
  const huv = radial ? 0 : (wrap(D(e, e) - d0) - wrap(D(e, -e) - d0) - wrap(D(-e, e) - d0) + wrap(D(-e, -e) - d0)) / (4 * e * e);
  // the transmission against that smooth model: 1 (times the amplitude) where smooth, the
  // jump across an edge where there is one
  const rel = (a, b) => {
    const [A, Dv] = fn(u + a, v + b, lam);
    const dm = d0 + gu * a + gv * b + 0.5 * (huu * a * a + 2 * huv * a * b + hvv * b * b), ph = -2 * Math.PI * (Dv - dm);
    return [A * Math.cos(ph), A * Math.sin(ph)];
  };
  const t0 = rel(0, 0), tol = 0.05 * (1 + Math.hypot(t0[0], t0[1]));
  const probes = radial ? [[0.5 * du, 0], [-0.5 * du, 0]] : [[0.5 * du, 0], [-0.5 * du, 0], [0, 0.5 * dv], [0, -0.5 * dv]];
  if (!probes.some(([a, b]) => { const t = rel(a, b); return Math.hypot(t[0] - t0[0], t[1] - t0[1]) > tol; })) return null;
  const K = radial ? 64 : 8;          // a ring is one-dimensional, so it can afford a finer average
  let sr = 0, si = 0, sp = 0, n = 0;
  for (let a = 0; a < K; a++) for (let b = 0; b < (radial ? 1 : K); b++) {
    // across a ring, sample at equal areas; across a square, evenly
    const fa = (a + 0.5) / K;
    const du1 = radial ? Math.sqrt(Math.max(0, (u - 0.5 * du) ** 2 + fa * ((u + 0.5 * du) ** 2 - (u - 0.5 * du) ** 2))) - u : (fa - 0.5) * du;
    const t = rel(du1, radial ? 0 : ((b + 0.5) / K - 0.5) * dv);
    sr += t[0]; si += t[1]; sp += t[0] * t[0] + t[1] * t[1]; n++;
  }
  // back onto the centre's own phase: the mean relative to the smooth model, times e^{-2 pi i d0}
  const c = Math.cos(-2 * Math.PI * d0), s = Math.sin(-2 * Math.PI * d0), mr = sr / n, mi = si / n;
  return [mr * c - mi * s, mr * s + mi * c, sp / n];
}
/* A mask whose formula jumps inside more than this share of the samples (by the light they
   pass) has detail finer than about four samples: features W samples wide put an edge in
   about 2/W of them. Those samples are averaged, which keeps the power right but not the
   shape of what the detail sends out. */
export const MASK_EDGE_SHARE = 0.5;
/* A mask delay's slope along u, in waves per mm, from just round (u, 0) where the formula is
   singular or jumps there: the mean of its slopes at four points 2 um away, each taken modulo
   whole waves, or 0 unless all four are smooth (a binary step bends nothing) */
export function maskMeanSlope(fn, u, lam) {
  // round a sampled delay's core (a mod's table), far enough out that the samples hold the vortex
  const h = 1e-4, e = Math.max(2e-3, 2.5 * (fn.cell || 0)), w = d => d - Math.round(d);
  let sum = 0;
  for (const [a, b] of [[e, 0], [-e, 0], [0, e], [0, -e]]) {
    const D = (x) => fn(u + a + x, b, lam)[1], d0 = D(0), dp = w(D(h) - d0), dm = w(d0 - D(-h));
    if (Math.abs(dp) > 0.45 || Math.abs(dm) > 0.45 || Math.abs(dp - dm) > 0.05) return 0;
    sum += (dp + dm) / (2 * h);
  }
  return sum / 4;
}
/* How many whole waves a mask's delay resets by between two points (a blazed grating's or a
   kinoform's): its change less what its local slopes, taken modulo whole waves, account for */
export function maskResets(fn, u0, v0, u1, v1, lam) {
  const h = 1e-5, w = d => d - Math.round(d), D = (u, v) => fn(u, v, lam)[1];
  // a slope from one-sided differences that agree; none where they don't (a vortex's core, a step)
  const one = (u, v, a, b) => { const d0 = D(u, v), p = w(D(u + a, v + b) - d0), m = w(d0 - D(u - a, v - b)); return Math.abs(p - m) < 0.02 ? (p + m) / (2 * h) : 0; };
  const g = (u, v) => [one(u, v, h, 0), one(u, v, 0, h)];
  const g0 = g(u0, v0), g1 = g(u1, v1);
  const left = D(u1, v1) - D(u0, v0) - 0.5 * ((g0[0] + g1[0]) * (u1 - u0) + (g0[1] + g1[1]) * (v1 - v0)), n = Math.round(left);
  return n && Math.abs(left - n) < 0.25 ? n : 0;
}
/* Does a mask's formula jump anywhere along a line through the beam? */
export function maskJumps(fn, u0, v0, du, dv, lam) {
  let prev = null;
  for (let i = 0; i <= 600; i++) {
    const f = i / 600 * 2 - 1, t = maskT(fn, u0 + f * du, v0 + f * dv, lam);
    if (prev && Math.hypot(t[0] - prev[0], t[1] - prev[1]) > 0.2) return true;
    prev = t;
  }
  return false;
}
/* Is a mask round about where the beam crosses it? Sampled on rings round the hit point. */
export function popMaskRound(ev) {
  if (Math.abs(ev.cth - 1) > 1e-9) return false;
  const fn = ev.surf.maskFn, R = ev.semi, c = ev.ly, lam = 1e-3;
  for (const f of [0.05, 0.2, 0.45, 0.9]) {
    const rr = f * R, ref = fn(c + rr, 0, lam);
    for (let k = 1; k < 12; k++) {
      const th = k * Math.PI / 6, v = fn(c + rr * Math.cos(th), rr * Math.sin(th), lam);
      if (Math.abs(v[0] - ref[0]) > 1e-9 * (1 + Math.abs(ref[0])) || Math.abs(v[1] - ref[1]) > 1e-9 * (1 + Math.abs(ref[1]))) return false;
    }
  }
  return true;
}
export const MASK_PRESETS = [
  ['clear', 'Clear', '1', '0'],
  ['gauss', 'Gaussian apodiser', 'exp(-(r/2)^2)', '0'],
  ['pinhole', 'Pinhole, 1 mm', 'circ(r/0.5)', '0'],
  ['annulus', 'Annulus', 'step(r-1)*step(2-r)', '0'],
  ['lens', 'Phase lens, f = 100 mm', '1', '-r^2/(2*100)/lambda'],
  ['axicon', 'Axicon, 10 mrad', '1', '-0.01*r/lambda'],
  ['vortex', 'Vortex, charge 1', '1', 'theta/(2*pi)'],
  ['vortex2', 'Spiral phase plate, charge 2', '1', '2*theta/(2*pi)'],
  ['fork', 'Fork hologram, charge 1, 0.1 mm (SLM)', '1', 'mod(x/0.1 + theta/(2*pi), 1)'],
  ['blazed', 'Blazed grating, 0.1 mm (SLM)', '1', 'mod(x/0.1, 1)'],
  ['pistep', '\u03c0 step across x (TEM\u2080\u2080 to HG\u2081\u2080)', '1', '0.5*step(x)'],
  ['pgrating', 'Binary phase grating, 0.2 mm', '1', '0.5*step(sin(2*pi*x/0.2))'],
  ['agrating', 'Amplitude grating, 0.2 mm', 'step(sin(2*pi*x/0.2))', '0'],
];

export const STOP_SHAPES = [['round', 'Iris'], ['slit', 'Slit'], ['double', 'Double slit'], ['comb', 'Slit comb'], ['knife', 'Knife edge'], ['disc', 'Beam block']];
/* The openings of a slit-like stop, as their centres along it: one, two, or a comb's worth */
function stopSlitCentres(el) {
  if (el.shape === 'double') return [el.offset - el.sep / 2, el.offset + el.sep / 2];
  if (el.shape === 'comb') return Array.from({ length: el.count }, (_, i) => el.offset + (i - (el.count - 1) / 2) * el.pitch);
  return [el.offset];
}
export const stopSlitLike = el => el.shape === 'slit' || el.shape === 'double' || el.shape === 'comb';
/* How far the openings reach from the offset, for sizing grids */
export const stopExtent = el => el.shape === 'double' ? el.sep / 2 + el.aperture / 2
  : el.shape === 'comb' ? (el.count - 1) / 2 * el.pitch + el.aperture / 2 : el.aperture / 2;
/* The blocking parts of a stop along its length, as [from, to] in its own frame: round
   and slit leave an opening at the offset, a knife covers one side of its edge, a disc
   blocks only itself. Out of the plane a round opening is a circle, a slit has a height. */
export function stopBlades(el) {
  const b = el.outer / 2, a = el.aperture / 2, o = el.offset, out = [];
  const add = (lo, hi) => { lo = Math.max(-b, lo); hi = Math.min(b, hi); if (hi - lo > 1e-9) out.push([lo, hi]); };
  if (el.shape === 'knife') el.side > 0 ? add(o, b) : add(-b, o);
  else if (el.shape === 'disc') add(o - a, o + a);
  else if (stopSlitLike(el)) {
    // blades between the openings, merged where openings overlap
    const open = stopSlitCentres(el).map(c => [c - a, c + a]).sort((p, q) => p[0] - q[0]);
    let x = -b;
    for (const [lo, hi] of open) { if (lo > x) add(x, lo); x = Math.max(x, hi); }
    add(x, b);
  }
  else { add(-b, o - a); add(o + a, b); }
  return out;
}
/* Signed distance to a stop's edge at (u along it, v out of the plane): positive where
   light gets through. The plate itself is a disc of the outer size. */
export function stopMargin(el) {
  const b = el.outer / 2, a = el.aperture / 2, o = el.offset, h = el.height / 2;
  const plate = (u, v) => Math.hypot(u, v) - b;
  if (el.shape === 'knife') return (u, v) => Math.max(-el.side * (u - o), plate(u, v));
  if (el.shape === 'disc') return (u, v) => Math.hypot(u - o, v) - a;
  if (stopSlitLike(el)) {
    // through any one slit, or past the plate; the nearest slit decides the edge
    const cs = stopSlitCentres(el), pitch = el.shape === 'comb' ? el.pitch : 0, c0 = cs[0], n = cs.length;
    return (u, v) => {
      let best = -Infinity;
      if (pitch > 0) {
        const i = clamp(Math.round((u - c0) / pitch), 0, n - 1);
        for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < n) best = Math.max(best, a - Math.abs(u - (c0 + j * pitch)));
      } else for (const c of cs) best = Math.max(best, a - Math.abs(u - c));
      return Math.max(Math.min(best, h > 0 ? h - Math.abs(v) : Infinity), plate(u, v));
    };
  }
  return (u, v) => Math.max(a - Math.hypot(u - o, v), plate(u, v));
}

/* Lens edges (the ground rim) absorb light, returned as local line segments */
export function lensEdges(el, surfs) {
  // the rim runs between one face and the next: a face is the stack of the surfaces sharing a vertex (a gap of 0
  // between them), and its edge is its widest member's
  const stacks = [];
  surfs.forEach((s, i) => { if (!i || el.gaps[i - 1] !== 0) stacks.push({ wide: s, last: i }); else { const st = stacks[stacks.length - 1]; st.last = i; if (s.semi > st.wide.semi) st.wide = s; } });
  const segs = [];
  for (let i = 0; i < stacks.length - 1; i++) {
    if (el.materials[stacks[i].last].glass === 'AIR') continue;
    const a = stacks[i].wide, b = stacks[i + 1].wide;
    for (const sgn of [1, -1]) {
      segs.push([a.z + sagFn(a, sgn*a.semi), sgn*a.semi, b.z + sagFn(b, sgn*b.semi), sgn*b.semi]);
    }
  }
  return segs;
}

export function frame(el) {
  const a = el.angle * deg;
  return { ox: el.x, oy: el.y, c: Math.cos(a), s: Math.sin(a) };
}
export const toLocal = (f, x, y) => { const dx = x - f.ox, dy = y - f.oy; return [dx*f.c + dy*f.s, -dx*f.s + dy*f.c]; };
export const toLocalDir = (f, x, y) => [x*f.c + y*f.s, -x*f.s + y*f.c];
export const toWorld = (f, x, y) => [f.ox + x*f.c - y*f.s, f.oy + x*f.s + y*f.c];
export const toWorldDir = (f, x, y) => [x*f.c - y*f.s, x*f.s + y*f.c];

