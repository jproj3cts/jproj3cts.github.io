import { IN_WORKER, TEST_MODE, clamp } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { packText } from '../core/format.js';
import { MODS, MOD_COLOURS, modNames, modText } from '../core/modulators.js';
import { num, project } from '../state/project.js';
import { PACKS } from '../state/packs.js';
import { setLastTraceKey } from './trace.js';
import { detectorReading } from './fibre-face.js';
import { diffraction } from './pd-cavity.js';

export async function modHash(code) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- what a mod defines, as the page keeps it (checked: nothing in it runs) ---------- */
function normModParams(list) {
  const out = [];
  for (const q of Array.isArray(list) ? list.slice(0, 24) : []) {
    if (!q || typeof q !== 'object' || typeof q.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(q.key)) continue;
    const P = { key: q.key, label: packText(q.label, 50) || q.key };
    if (Array.isArray(q.options)) { P.options = q.options.slice(0, 20).map(o => Array.isArray(o) ? [packText(String(o[0]), 30), packText(String(o[1] !== undefined ? o[1] : o[0]), 40)] : [packText(String(o), 30), packText(String(o), 40)]).filter(o => o[0]); P.value = P.options.some(o => o[0] === String(q.value)) ? String(q.value) : (P.options[0] || [''])[0]; }
    else { P.value = num(q.value, 0); if (isFinite(q.min)) P.min = +q.min; if (isFinite(q.max)) P.max = +q.max; }
    out.push(P);
  }
  return out;
}

export function normModDef(D) {
  if (!D || typeof D !== 'object' || !MOD_KINDS.includes(D.kind) || typeof D.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(D.key)) return null;
  const d = D.d || {}, has = D.has || {};
  const o = { key: D.key, kind: D.kind, name: packText(d.name, 50) || D.key, summary: packText(d.summary, 120), params: normModParams(d.params),
    colour: MOD_COLOURS[d.colour || d.color] ? (d.colour || d.color) : 'grey', tag: packText(d.tag, 8) };
  if (D.kind === 'element') { if (!has.transmit) return null; o.aperture = clamp(num(d.aperture, 25.4), 0.01, 1000); o.samples = Math.round(clamp(num(d.samples, 256), 16, 512)); }
  if (D.kind === 'plate') { if (!has.jones) return null; o.aperture = clamp(num(d.aperture, 25.4), 0.01, 1000); }
  if (D.kind === 'component') { if (!has.S) return null; const n = Math.round(clamp(num(Array.isArray(d.ports) ? d.ports.length : d.ports, 2), 1, 8)); o.ports = modNames(d.ports, n, i => String(i + 1)); }
  if (D.kind === 'block') {
    if (!has.H) return null;
    const ni = Math.round(clamp(Array.isArray(d.ins) ? d.ins.length : num(d.ins, 1), 0, 4)), no = Math.round(clamp(Array.isArray(d.outs) ? d.outs.length : num(d.outs, 1), 1, 4));
    o.ins = modNames(d.ins, ni, i => ni === 1 ? 'in' : 'in' + (i + 1)); o.outs = modNames(d.outs, no, i => no === 1 ? 'out' : 'out' + (i + 1));
    o.fmin = clamp(num(d.fmin, 1e-2), 1e-6, 1e12); o.fmax = clamp(num(d.fmax, 1e9), o.fmin * 10, 1e13); o.perDecade = Math.round(clamp(num(d.perDecade, 40), 5, 400)); o.noise = !!has.noise;
  }
  if (D.kind === 'readout') { if (!has.compute) return null; o.for = (Array.isArray(d.for) ? d.for : [d.for || 'screen']).filter(t => t === 'screen' || t === 'detector').slice(0, 2); if (!o.for.length) o.for = ['screen']; }
  return o;
}

/* the installed mod a part asks for, and the definition of its part (null if not installed) */
export const modPack = el => el && el.mod ? MODS.packs.get(el.mod.id) || null : null;

// what a mod's part is called: as its mod names it, else as the part carries it
export const modName = el => { const D = modDefOf(el); return D ? D.name : el.mod.name; };

export const modDefOf = el => { const pk = modPack(el); return pk && pk.defs ? pk.defs.find(D => D.key === el.mod.def) || null : null; };

// a part's settings: its own, else its definition's defaults
export function modParams(el) {
  const D = modDefOf(el), p = {};
  for (const q of D ? D.params : []) p[q.key] = el.mod.p[q.key] !== undefined ? el.mod.p[q.key] : q.value;
  return p;
}

/* Why a mod part is not working, or '' when it is: not installed, failed, still working out */
export function modStatus(el) {
  const pk = modPack(el);
  const off = !pk && PACKS.list.find(p => p.id === el.mod.id && p.code && p.trust && p.trust.revoked);
  if (off) return 'its module, ' + off.name + ', was revoked by JEK Systems (' + (off.trust.revoked.reason || 'no reason given') + '), so it is turned off';
  if (!pk) return MODS.packs.size || !IN_WORKER ? 'its mod, ' + el.mod.id + ', is not installed here' : '';
  if (!modDefOf(el)) return 'its mod has no part called ' + el.mod.def;
  const f = MODS.failed.get(pk.hash + '|' + el.mod.def);
  return f ? 'its module failed: ' + f : '';
}

// every answer checked for its shape before it is kept
export function modCheck(fn, out, args) {
  if (fn === 'transmit') { if (!(out instanceof Float64Array) || out.length !== 2 * args.N * args.N) throw new Error('its transmission is the wrong size'); return out; }
  if (fn === 'jones') { if (!Array.isArray(out) || out.length !== 8 || !out.every(v => typeof v === 'number' && isFinite(v))) throw new Error('its Jones matrix is not a 2 x 2 of complex numbers'); return out; }
  if (fn === 'S') {
    if (!Array.isArray(out)) throw new Error('its matrix is not a list');
    return out.filter(r => Array.isArray(r) && r.length === 10 && r.every(v => typeof v === 'number' && isFinite(v)) && r[0] >= 0 && r[0] < args.n && r[1] >= 0 && r[1] < args.n);
  }
  if (fn === 'H') { if (!out || !(out.H instanceof Float64Array) || out.H.length !== args.fs.length * args.no * args.ni * 2) throw new Error('its response is the wrong size'); return out; }
  if (fn === 'compute') return modReadoutCheck(out);
  throw new Error('no such question');
}

/* ---------- an element: a thin plate whose amplitude and delay the mod gives across its face ----------
   It is a mask (see Mask functions) whose formula is the mod's table: sampled at N x N points
   over the aperture at each wavelength the light has, and read between them by a cubic
   (Catmull-Rom, exact for a quadratic), so its delay has a smooth slope for the rays and a
   curvature for the beam. A delay given whole (a lens's, hundreds of waves at its edge) is read
   as it is; one given wrapped, within a single wave (a metasurface's or a kinoform's), has its
   neighbours read modulo whole waves, as the tracer reads a mask's, and must then change by
   less than half a wave between samples. Until its table comes (and if its mod is missing or
   fails), the plate passes nothing. */
function modTable(el, nm) {
  const D = modDefOf(el);
  if (!D || D.kind !== 'element') return null;
  const N = D.samples, R = el.length / 2, p = modParams(el);
  return modResult(el, 'transmit', { nm, R, N, p }, nm + '|' + R + '|' + N + '|' + JSON.stringify(p));
}

const CR = t => [((-t + 2) * t - 1) * t / 2, ((3 * t - 5) * t * t + 2) / 2, ((-3 * t + 4) * t + 1) * t / 2, (t - 1) * t * t / 2];

function modTableAt(T, N, R, u, v) {
  if (T.wrapped === undefined) { let lo = Infinity, hi = -Infinity; for (let q = 1; q < T.length; q += 2) { lo = Math.min(lo, T[q]); hi = Math.max(hi, T[q]); } T.wrapped = hi - lo <= 1 + 1e-9; }
  const h = 2 * R / (N - 1), fx = clamp((u + R) / h, 0, N - 1), fy = clamp((v + R) / h, 0, N - 1), W = T.wrapped ? 1 : 0;
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fy)), wx = CR(fx - i), wy = CR(fy - j), d0 = T[2 * (j * N + i) + 1];
  const A = MOD_NB, Dl = MOD_NB2;
  for (let b = 0; b < 4; b++) {
    const jj = clamp(j - 1 + b, 0, N - 1);
    for (let c = 0; c < 4; c++) { const q = 2 * (jj * N + clamp(i - 1 + c, 0, N - 1)), dv = T[q + 1]; A[b * 4 + c] = T[q]; Dl[b * 4 + c] = dv - W * Math.round(dv - d0); }
  }
  // a wrapped delay that jumps by a third of a wave or more between neighbours is no smooth
  // phase (no sampled one can change that fast): a step, or a vortex's core. Read there as the
  // nearest sample, so the step stays a step, for the tracer and the field to find
  if (W) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const k = b * 4 + c;
    if ((c < 3 && Math.abs(Dl[k + 1] - Dl[k]) > 0.34) || (b < 3 && Math.abs(Dl[k + 4] - Dl[k]) > 0.34)) {
      const q = 2 * (Math.round(fy) * N + Math.round(fx));
      return [T[q], T[q + 1]];
    }
  }
  let a = 0, d = 0;
  for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) { const w = wx[c] * wy[b]; a += w * A[b * 4 + c]; d += w * Dl[b * 4 + c]; }
  return [a, d];
}

const MOD_NB = new Float64Array(16);

const MOD_NB2 = new Float64Array(16);

const modMaskMemo = new Map();

export function modMaskFns(el) {
  const key = JSON.stringify(el.mod) + '|' + el.length + '|' + MODS.rev + '|' + MODS.packs.size;
  if (modMaskMemo.has(key)) return modMaskMemo.get(key);
  const D = modDefOf(el), N = D ? D.samples : 0, R = el.length / 2, byNm = new Map();
  const fn = (u, v, lam) => {
    const nm = Math.round(lam * 1e12) / 1e6;
    if (!byNm.has(nm)) byNm.set(nm, modTable(el, nm));
    const T = byNm.get(nm);
    return T ? modTableAt(T, N, R, u, v) : [0, 0];
  };
  fn.cell = N > 1 ? 2 * R / (N - 1) : 0;                   // its samples' spacing (see maskMeanSlope)
  const out = { fn, err: modStatus(el) || null };
  if (modMaskMemo.size > 200) modMaskMemo.clear();
  modMaskMemo.set(key, out);
  return out;
}

/* ---------- a plate: one Jones matrix across its face, at each wavelength ----------
   In the beam's frame: x across it in the bench plane (p), y up (s); [[Jxx, Jxy], [Jyx, Jyy]].
   Light going either way meets it as written, as it meets a waveplate. */
export function modJonesM(el, nm) {
  const p = modParams(el), z = (modDefOf(el) || {}).kind === 'plate' ? modResult(el, 'jones', { nm, p }, nm + '|' + JSON.stringify(p)) : null;
  const m = z || [0, 0, 0, 0, 0, 0, 0, 0];
  return [[[m[0], m[1]], [m[2], m[3]]], [[m[4], m[5]], [m[6], m[7]]]];
}

export function normCarried(list) {
  return (Array.isArray(list) ? list.slice(0, 16) : []).filter(m => m && typeof m.code === 'string' && m.code.length <= MOD_CODE_MAX && /^[a-z0-9][a-z0-9._-]{1,63}$/.test(m.id))
    .map(m => ({ id: m.id, name: modText(m.name, 60) || m.id, author: modText(m.author, 80), packVersion: modText(String(m.packVersion || '1'), 20), licence: modText(m.licence, 60),
      description: modText(m.description, 600), hash: /^[0-9a-f]{64}$/.test(m.hash) ? m.hash : '', code: m.code,
      // the module as its maker signed it (checked only when it is offered: io/packs.js), so it can be installed verified
      ...(modSignedOk(m) ? { signed: m.signed } : {}) }));
}
const modSignedOk = m => !!(m.signed && typeof m.signed === 'object' && !Array.isArray(m.signed) && m.signed.format === 'jekpack' && m.signed.id === m.id && typeof m.signed.code === 'string'
  && m.signed.sig && JSON.stringify(m.signed).length <= 2.5 * 1024 * 1024);

/* ---------- a readout's answer: rows of figures, and series to plot, checked ---------- */
function modReadoutCheck(out) {
  const o = { rows: [], series: [] };
  if (!out || typeof out !== 'object') return o;
  for (const r of Array.isArray(out.rows) ? out.rows.slice(0, 40) : []) if (Array.isArray(r) && r.length >= 2) o.rows.push([modText(String(r[0]), 60), modText(typeof r[1] === 'number' ? String(+r[1].toPrecision(6)) : String(r[1]), 80)]);
  for (const S of Array.isArray(out.series) ? out.series.slice(0, 4) : []) {
    if (!S || !Array.isArray(S.x) || !Array.isArray(S.y)) continue;
    const n = Math.min(S.x.length, S.y.length, 4096), x = [], y = [];
    for (let i = 0; i < n; i++) { const a = +S.x[i], b = +S.y[i]; if (isFinite(a) && isFinite(b)) { x.push(a); y.push(b); } }
    if (x.length >= 2) o.series.push({ name: modText(S.name, 40), x, y, xLabel: modText(S.xLabel, 40), yLabel: modText(S.yLabel, 40), log: !!S.log });
  }
  return o;
}

/* ---------- readouts: a mod's figures for a screen or a detector, from what it reads ----------
   A readout is given what the part reads (a screen: its diffracted intensity map with its
   extent and its figures; a detector: its power, current and output) and returns rows of
   figures and series to plot, which the page draws in the part's panel. */
export const modReadouts = type => [...MODS.packs.values()].flatMap(pk => (pk.defs || []).filter(D => D.kind === 'readout' && D.for.includes(type)).map(D => ({ pk, D })));

function modReadoutData(el) {
  if (el.type === 'detector') { const r = detectorReading(el); return { kind: 'detector', mw: r.mw, mA: r.mA, V: r.V, noiseV: r.noiseV }; }
  const D = diffraction(el);
  if (!D || !D.map || !D.map.v) return null;
  const M = D.map, I = Float64Array.from(M.v);
  return { kind: 'screen', nm: D.nm, power: D.power, wx: D.wx, wy: D.wy, fwhm: D.fwhm, strehl: D.strehl, stokes: D.stokes ? Array.from(D.stokes) : null,
    map: { n: M.n, u0: M.u0, u1: M.u1, v0: M.v0, v1: M.v1, I } };
}

// each readout for a part: its result (null while worked out), or why it failed, or that there is nothing to read
export function modReadoutResults(el) {
  const list = modReadouts(el.type === 'detector' ? 'detector' : 'screen');
  if (!list.length) return [];
  const data = modReadoutData(el);
  let fp = '';
  if (data) { fp = JSON.stringify(Object.assign({}, data, { map: undefined })); if (data.map) { let a = 0; for (let i = 0; i < data.map.I.length; i += 97) a += data.map.I[i] * (i + 1); fp += '|' + data.map.n + '|' + a; } }
  return list.map(({ pk, D }) => {
    const ref = { mod: { id: pk.id, def: D.key, p: {} } }, fail = MODS.failed.get(pk.hash + '|' + D.key);
    return { pk, D, none: !data, fail, r: !data || fail ? null : modResult(ref, 'compute', { data, p: modParams(ref) }, fp) };
  });
}

/* ---------- the background workers get the results they need, each once ---------- */
export function modDelta(w) {
  if (!MODS.packs.size || !w) return undefined;
  let seen = MODS.sent.get(w);
  if (!seen) { seen = new Set(); MODS.sent.set(w, seen); }
  const packs = [...MODS.packs.values()].map(pk => ({ id: pk.id, hash: pk.hash, defs: pk.defs }));
  const pkKey = JSON.stringify(packs.map(p => p.hash));
  const res = [];
  for (const [k, v] of MODS.results) if (!seen.has(k)) { seen.add(k); res.push([k, v]); }
  if (!res.length && seen.has(pkKey)) return undefined;
  seen.add(pkKey);
  return { packs, res, rev: MODS.rev };
}

export function modAbsorb(D) {
  if (!D) return;
  MODS.packs = new Map(D.packs.map(p => [p.id, p]));
  for (const [k, v] of D.res) MODS.results.set(k, v);
  MODS.rev = D.rev;
}

/* ---------- a mod's component and block: their answers, as the fibre network and the electronics take them ---------- */
export function modS(el, nm) {
  const D = modDefOf(el);
  if (!D || D.kind !== 'component') return [];
  const p = modParams(el), n = el.mod.ports.length, r = modResult(el, 'S', { nm, p, n }, nm + '|' + n + '|' + JSON.stringify(p));
  return r ? r.map(q => [q[0], q[1], [[[q[2], q[3]], [q[4], q[5]]], [[q[6], q[7]], [q[8], q[9]]]]]) : [];
}

// a block's response on its grid: f = 0, then fmin to fmax at perDecade points a decade
export function modBlockH(el) {
  const D = modDefOf(el);
  if (!D || D.kind !== 'block') return null;
  const n = Math.round(Math.log10(D.fmax / D.fmin) * D.perDecade) + 1, fs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) fs[i + 1] = D.fmin * Math.pow(10, i / D.perDecade);
  const p = modParams(el), ni = el.mod.ins.length, no = el.mod.outs.length;
  const r = modResult(el, 'H', { fs, p, ni, no }, D.fmin + '|' + D.fmax + '|' + D.perDecade + '|' + ni + '|' + no + '|' + JSON.stringify(p));
  return r ? { fs, H: r.H, N: r.N, ni, no, noise: D.noise, lo: Math.log10(D.fmin), per: D.perDecade, n } : null;
}

export function modHAt(R, f, o, i) {
  const at = k => { const w = 2 * ((k * R.no + o) * R.ni + i); return [R.H[w], R.H[w + 1]]; };
  if (!(f > 0)) return at(0);
  const x = clamp((Math.log10(f) - R.lo) * R.per, 0, R.n - 1), k = Math.min(R.n - 2, Math.floor(x)), t = x - k, a = at(k + 1), b = at(Math.min(R.n, k + 2));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function modNAt(R, f, o) {
  const x = clamp((Math.log10(Math.max(f, 1e-300)) - R.lo) * R.per, 0, R.n - 1), k = Math.min(R.n - 2, Math.floor(x)), t = x - k;
  const a = R.N[(k + 1) * R.no + o], b = R.N[Math.min(R.n, k + 2) * R.no + o];
  return a + (b - a) * t;
}

/* a mod's code is kept to this size, and it is one of these kinds */
export const MOD_CODE_MAX = 512 * 1024, MOD_KINDS = ['element', 'plate', 'component', 'block', 'readout'];

/* ---------- a bench carries the code of the mods its parts use ----------
   Saved with it (so a file, a share link or a QR code opens complete), never run on opening:
   someone opening it is asked whether to install each mod not yet installed (or installed in
   another version), with the same prompt as any mod. Until then its parts stand in. */
export function modsCarried() {
  const ids = new Set(project.elements.filter(e => e.mod).map(e => e.mod.id)), out = [];
  for (const id of ids) {
    const pk = MODS.packs.get(id) || PACKS.list.find(p => p.id === id && p.code), was = (project.mods || []).find(m => m.id === id);
    if (pk) out.push(Object.assign({ id, name: pk.name, author: pk.author, packVersion: pk.packVersion, licence: pk.licence, description: pk.description, hash: pk.hash, code: pk.code }, pk.signed ? { signed: pk.signed } : {}));
    else if (was) out.push(was);
  }
  return out;
}

/* A result: kept, else asked for (on the page) and null meanwhile; when it comes, the bench is
   traced again. On a background worker, only what the page has sent it. */
export function modResult(el, fn, args, key, transfer) {
  const pk = modPack(el);
  if (!pk) return null;
  const k = pk.hash + '|' + el.mod.def + '|' + fn + '|' + key;
  if (MODS.results.has(k)) { const v = MODS.results.get(k); MODS.results.delete(k); MODS.results.set(k, v); return v; }
  if (IN_WORKER || MODS.failed.has(pk.hash + '|' + el.mod.def) || !modDefOf(el)) return null;
  if (!MODS.waiting.has(k)) {
    const P = hooks.modAsk(pk, el.mod.def, fn, args, transfer).then(out => {
      const v = modCheck(fn, out, args);
      MODS.results.set(k, v);
      // kept to a bounded size: the oldest go first
      let bytes = 0; for (const x of MODS.results.values()) bytes += x && x.byteLength ? x.byteLength : 64;
      for (const old of MODS.results.keys()) { if (bytes <= 256 * 1024 * 1024 || old === k) break; const x = MODS.results.get(old); bytes -= x && x.byteLength ? x.byteLength : 64; MODS.results.delete(old); }
    }, err => { MODS.failed.set(pk.hash + '|' + el.mod.def, err.message); })
      .finally(() => { MODS.waiting.delete(k); MODS.rev++; if (!TEST_MODE) { setLastTraceKey(null); hooks.requestRender(); hooks.renderPanel(); } });
    MODS.waiting.set(k, P);
  }
  return null;
}
