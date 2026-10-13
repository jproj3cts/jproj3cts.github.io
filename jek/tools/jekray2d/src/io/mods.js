import { EMBED, IN_WORKER, TEST_MODE } from '../core/constants.js';
import { MODS, MOD_COLOURS, modNames, modText } from '../core/modulators.js';
import { num, project, typeLabel } from '../state/project.js';
import { normElement } from '../state/elements.js';
import { setLastTraceKey } from '../engines/trace.js';
import { requestRender } from '../ui/render.js';
import { clamp } from '../ui/params.js';
import { detectorReading } from '../engines/fibre-face.js';
import { h, panel, param, renderPanel, selectField } from '../ui/panel.js';
import { diffraction } from '../engines/pd-cavity.js';
import { toast } from '../ui/actions.js';
import { exp } from '../ui/experimental.js';
import { palOf } from '../ui/myparts.js';
import { PACKS, PACK_FORMAT, normPack, packConfirm, packText } from './packs.js';

/* ==========================================================================
   Mods: parts whose behaviour is code, written by anyone, run in a sandbox
   A mod comes in a part pack (version 2) as "code": a script that defines parts through the
   jek object (jek.element, jek.plate, jek.component, jek.block, jek.readout). The code never
   runs on this page. It runs in a Web Worker started inside a hidden frame of its own, which
   has an opaque origin (no cookies, storage, account or page to reach) and a content
   security policy that blocks every request, and the worker has the network taken out of
   it besides. The page asks it for numbers (a plate's transmission sampled across its face, a
   component's matrix at a wavelength, a block's response over frequency, a readout's rows)
   and checks every answer's shape and size before using it. Answers are kept by a key of the
   code's hash, the part, its settings and the question; the tracer and the background
   workers only ever see those numbers, so they never need the code. A call that runs past
   its time limit, or a worker that misbehaves, has its frame taken down (which ends every
   worker in it) and the part reads as not working, with the reason in its panel.
   ========================================================================== */
export const MOD_API = 1, MOD_TIMEOUT = 20000, MOD_CODE_MAX = 512 * 1024, MOD_KINDS = ['element', 'plate', 'component', 'block', 'readout'];
// the frame: an opaque origin that may run inline script and workers from blobs, and nothing else
const MOD_FRAME_SRC = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob:; worker-src blob:">' +
  '<script>"use strict";(function () {' +
  'var W = new Map(), send = function (m) { parent.postMessage(m, "*"); };' +
  'addEventListener("message", function (e) {' +
  ' if (e.source !== parent) return; var m = e.data || {};' +
  ' if (m.op === "load") {' +
  '  var old = W.get(m.key); if (old) old.w.terminate();' +
  '  var w; try { w = new Worker(URL.createObjectURL(new Blob([m.src], { type: "text/javascript" }))); } catch (err) { send({ id: m.id, ok: false, err: "its worker could not start" }); return; }' +
  '  var rec = { w: w, open: new Set([m.id]) }; W.set(m.key, rec);' +
  // a worker that answers what no one asked is ended there and then: it cannot flood the page
  '  w.onmessage = function (ev) { var r = ev.data || {}; if (!rec.open.has(r.id)) { w.terminate(); W.delete(m.key); send({ key: m.key, bad: "it sent a message no one asked for" }); return; } rec.open.delete(r.id); send(r); };' +
  '  w.onerror = function (ev) { ev.preventDefault(); w.terminate(); W.delete(m.key); rec.open.forEach(function (id) { send({ id: id, ok: false, err: String(ev.message || "its code failed").slice(0, 300) }); }); rec.open.clear(); };' +
  '  w.postMessage({ id: m.id, op: "defs" });' +
  ' } else if (m.op === "call") { var rec2 = W.get(m.key); if (!rec2) { send({ id: m.id, ok: false, err: "not loaded" }); return; } rec2.open.add(m.id); rec2.w.postMessage(m); }' +
  '});' +
  'send({ ready: true });' +
  '})();<\/script>';
/* What runs in the worker before the mod's code: the network and storage taken away, and the
   jek object a mod defines its parts through. After it, the mod's code; after that, the part
   that answers the page's questions. */
const MOD_PRELUDE = `"use strict";
(function () {
  var gone = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'RTCPeerConnection', 'Request', 'Response', 'Notification'];
  for (var i = 0; i < gone.length; i++) {
    var k = gone[i], o = self;
    while (o) { try { if (Object.prototype.hasOwnProperty.call(o, k)) delete o[k]; } catch (e) {} o = Object.getPrototypeOf(o); }
    try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  }
})();
var __DEFS = Object.create(null);
function __def(kind, key, d) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(key)) throw new Error('a part key is 1 to 40 letters, digits, dashes or underscores: ' + JSON.stringify(key));
  if (__DEFS[key]) throw new Error('two parts called ' + key);
  if (!d || typeof d !== 'object') throw new Error(key + ': give its definition as an object');
  __DEFS[key] = { kind: kind, d: d };
}
var jek = Object.freeze({ api: ${MOD_API},
  element: function (k, d) { __def('element', k, d); }, plate: function (k, d) { __def('plate', k, d); },
  component: function (k, d) { __def('component', k, d); }, block: function (k, d) { __def('block', k, d); },
  readout: function (k, d) { __def('readout', k, d); } });
`;
const MOD_POSTLUDE = `
;(function () {
  var num = function (v) { v = +v; return isFinite(v) ? v : 0; };
  // a complex number as [re, im] (a plain number is real)
  var cx = function (v) { return typeof v === 'number' ? [num(v), 0] : Array.isArray(v) ? [num(v[0]), num(v[1])] : [0, 0]; };
  // a 2x2 complex matrix as 8 numbers, [11, 12, 21, 22] each re then im (a plain value is that times the identity)
  var mat = function (v) {
    if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && Array.isArray(v[1])) { var a = cx(v[0][0]), b = cx(v[0][1]), c = cx(v[1][0]), d = cx(v[1][1]); return [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]; }
    var z = cx(v); return [z[0], z[1], 0, 0, 0, 0, z[0], z[1]];
  };
  var info = function (key) {
    var D = __DEFS[key], d = D.d, has = {};
    ['transmit', 'jones', 'S', 'H', 'noise', 'compute'].forEach(function (f) { has[f] = typeof d[f] === 'function'; });
    var plain = {};
    ['name', 'summary', 'params', 'ports', 'ins', 'outs', 'for', 'samples', 'aperture', 'colour', 'color', 'tag', 'fmin', 'fmax', 'perDecade'].forEach(function (f) { if (d[f] !== undefined && typeof d[f] !== 'function') plain[f] = d[f]; });
    return JSON.parse(JSON.stringify({ key: key, kind: D.kind, has: has, d: plain }));
  };
  var run = function (m, tr) {
    if (m.op === 'defs') return Object.keys(__DEFS).map(info);
    var D = __DEFS[m.def]; if (!D) throw new Error('it has no part called ' + m.def);
    var d = D.d, a = m.args || {}, p = Object.freeze(a.p || {});
    if (m.fn === 'transmit') {
      // the plate's transmission at N x N points across its face, -R to R both ways: amplitude, then delay in waves
      var N = a.N, R = a.R, out = new Float64Array(2 * N * N), h = 2 * R / (N - 1);
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
        var t = d.transmit(-R + i * h, -R + j * h, a.nm, p), q = 2 * (j * N + i);
        out[q] = Array.isArray(t) ? num(t[0]) : num(t); out[q + 1] = Array.isArray(t) ? num(t[1]) : 0;
      }
      tr.push(out.buffer); return out;
    }
    if (m.fn === 'jones') return mat(d.jones(a.nm, p));
    if (m.fn === 'S') {
      var list = d.S(a.nm, p) || [], res = [];
      for (var e = 0; e < list.length && e < 4096; e++) { var r = list[e]; if (Array.isArray(r) && r.length >= 3) res.push([r[0] | 0, r[1] | 0].concat(mat(r[2]))); }
      return res;
    }
    if (m.fn === 'H') {
      var fs = a.fs, ni = a.ni, no = a.no, Hs = new Float64Array(fs.length * no * ni * 2), Ns = new Float64Array(fs.length * no);
      for (var f = 0; f < fs.length; f++) {
        var Hv = d.H(fs[f], p);
        for (var o = 0; o < no; o++) for (var n = 0; n < ni; n++) {
          var z = ni === 1 && no === 1 ? cx(Hv) : cx(Array.isArray(Hv) && Array.isArray(Hv[o]) ? Hv[o][n] : 0), w = 2 * ((f * no + o) * ni + n);
          Hs[w] = z[0]; Hs[w + 1] = z[1];
        }
        if (d.noise) { var nv = d.noise(fs[f], p); for (var o2 = 0; o2 < no; o2++) Ns[f * no + o2] = Math.max(0, num(Array.isArray(nv) ? nv[o2] : nv)); }
      }
      tr.push(Hs.buffer, Ns.buffer); return { H: Hs, N: Ns };
    }
    if (m.fn === 'compute') return JSON.parse(JSON.stringify(d.compute(a.data, p) || {}));
    throw new Error('no such question');
  };
  self.onmessage = function (e) {
    var m = e.data || {}, tr = [];
    try { var out = run(m, tr); postMessage({ id: m.id, ok: true, out: out }, tr); }
    catch (err) { postMessage({ id: m.id, ok: false, err: String((err && err.message) || err).slice(0, 300) }); }
  };
})();
`;
/* the frame, made when first wanted; resolves once it is listening */
function modFrame() {
  if (IN_WORKER || typeof document === 'undefined') return Promise.reject(new Error('mods run on the page only'));
  if (MODS.frame) return MODS.frame.ready;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  const F = { el: f, ready: null };
  F.ready = new Promise((res, rej) => { F.ok = res; F.fail = rej; setTimeout(() => rej(new Error('the mod sandbox did not start')), 10000); });
  MODS.frame = F;
  f.srcdoc = MOD_FRAME_SRC;
  document.body.append(f);
  return F.ready;
}
// a mod's worker gone (it misbehaved): its calls fail, and it is loaded again when next wanted
function modDrop(hash, why) {
  MODS.loaded.delete(hash);
  for (const [id, C] of MODS.calls) if (C.hash === hash) { MODS.calls.delete(id); clearTimeout(C.timer); C.reject(new Error(why)); }
}
// the frame taken down (a call ran too long): every worker in it ends
export function modReset(why) {
  const F = MODS.frame;
  MODS.frame = null; MODS.loaded.clear();
  if (F) F.el.remove();
  for (const [id, C] of MODS.calls) { MODS.calls.delete(id); clearTimeout(C.timer); C.reject(new Error(why)); }
}
function modPost(hash, msg, transfer) {
  return new Promise((resolve, reject) => {
    const id = ++MODS.seq;
    const T = MODS.timeout || MOD_TIMEOUT, C = { hash, resolve, reject, timer: setTimeout(() => { modReset('it took longer than ' + T / 1000 + ' s'); }, T) };
    MODS.calls.set(id, C);
    MODS.frame.el.contentWindow.postMessage(Object.assign({ id }, msg), '*', transfer || []);
  });
}
/* the mod's code in its worker (once per frame); resolves with what it defines */
export async function modLoad(pk) {
  await modFrame();
  if (!MODS.loaded.has(pk.hash)) MODS.loaded.set(pk.hash, modPost(pk.hash, { op: 'load', key: pk.hash, src: MOD_PRELUDE + '\n' + pk.code + '\n' + MOD_POSTLUDE }).catch(err => { MODS.loaded.delete(pk.hash); throw err; }));
  return MODS.loaded.get(pk.hash);
}
export async function modAsk(pk, def, fn, args, transfer) {
  await modLoad(pk);
  return modPost(pk.hash, { op: 'call', key: pk.hash, def, fn, args, transfer }, transfer);
}
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
function normModDef(D) {
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
const modPack = el => el && el.mod ? MODS.packs.get(el.mod.id) || null : null;
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
  if (!pk) return MODS.packs.size || !IN_WORKER ? 'its mod, ' + el.mod.id + ', is not installed here' : '';
  if (!modDefOf(el)) return 'its mod has no part called ' + el.mod.def;
  const f = MODS.failed.get(pk.hash + '|' + el.mod.def);
  return f ? 'its mod failed: ' + f : '';
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
    const P = modAsk(pk, el.mod.def, fn, args, transfer).then(out => {
      const v = modCheck(fn, out, args);
      MODS.results.set(k, v);
      // kept to a bounded size: the oldest go first
      let bytes = 0; for (const x of MODS.results.values()) bytes += x && x.byteLength ? x.byteLength : 64;
      for (const old of MODS.results.keys()) { if (bytes <= 256 * 1024 * 1024 || old === k) break; const x = MODS.results.get(old); bytes -= x && x.byteLength ? x.byteLength : 64; MODS.results.delete(old); }
    }, err => { MODS.failed.set(pk.hash + '|' + el.mod.def, err.message); })
      .finally(() => { MODS.waiting.delete(k); MODS.rev++; if (!TEST_MODE) { setLastTraceKey(null); requestRender(); renderPanel(); } });
    MODS.waiting.set(k, P);
  }
  return null;
}
// every answer checked for its shape before it is kept
function modCheck(fn, out, args) {
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
const MOD_NB = new Float64Array(16), MOD_NB2 = new Float64Array(16);
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
/* ---------- the panel of a mod's part: its settings, and how it stands ---------- */
export function modPanel(el) {
  const pk = modPack(el), D = modDefOf(el), st = modStatus(el);
  panel.append(h('h3', null, modName(el)));
  panel.append(h('p', { class: 'rt-hint' }, 'A part from the mod ' + (pk ? pk.name + (pk.author ? ' by ' + pk.author : '') + ', version ' + pk.packVersion : el.mod.id) + '.' + (D && D.summary ? ' ' + D.summary : '')));
  if (st) panel.append(h('p', { class: 'note warn' }, 'Not working: ' + st + '.' + (pk ? '' : ' Its parts stand in, and pass nothing, until it is installed (File › Part packs…, or open a bench that carries it).')));
  else if (MODS.waiting.size) panel.append(h('p', { class: 'note' }, 'Working it out…'));
  if (pk && el.mod.hash && pk.hash !== el.mod.hash) panel.append(h('p', { class: 'note' }, 'Made with another version of the mod: this browser runs the one installed (' + pk.packVersion + ').'));
  const rows = h('div', { class: 'rt-rows' });
  if (el.type === 'mask' || el.type === 'waveplate') rows.append(param('Aperture (mm)', el, 'length'));
  for (const q of D ? D.params : []) {
    if (el.mod.p[q.key] === undefined) el.mod.p[q.key] = q.value;
    rows.append(q.options ? selectField(q.label, q.options, () => String(el.mod.p[q.key]), v => { el.mod.p[q.key] = v; }) : param(q.label, el, 'mod.p.' + q.key));
  }
  panel.append(rows);
}

/* ---------- installing: a version 2 pack's code read in the sandbox, its parts made ---------- */
// a part of a mod's, as an element: a plate is a mask, a polarisation plate a waveplate, a
// component a fibre part, a block an electronics part, each carrying its mod reference
function modElement(pk, D, extra) {
  const ref = { id: pk.id, def: D.key, hash: pk.hash, name: D.name, p: Object.fromEntries(D.params.map(q => [q.key, q.value])), colour: D.colour, tag: D.tag };
  if (D.kind === 'component') ref.ports = D.ports;
  if (D.kind === 'block') { ref.ins = D.ins; ref.outs = D.outs; }
  const e = D.kind === 'element' ? { type: 'mask', length: D.aperture, amp: '1', delay: '0' } : D.kind === 'plate' ? { type: 'waveplate', length: D.aperture }
    : D.kind === 'component' ? { type: 'fcomp', kind: 'mod' } : { type: 'elec', kind: 'mod.' + pk.id + '.' + D.key };
  return Object.assign({ name: D.name, x: 0, y: 0, angle: 0 }, e, extra || {}, { mod: Object.assign(ref, extra && extra.mod && extra.mod.p ? { p: Object.assign(ref.p, extra.mod.p) } : {}) });
}
export async function modPrepare(pack, notes) {
  pack.hash = await modHash(pack.code);
  let raw;
  try { raw = await modLoad(pack); } catch (err) { throw new Error('its code did not run: ' + err.message); }
  pack.defs = [];
  for (const D of Array.isArray(raw) ? raw.slice(0, 64) : []) {
    const d = normModDef(D);
    if (d) pack.defs.push(d); else notes.push('Its part ' + JSON.stringify(D && D.key) + ' is missing what a ' + (D && D.kind) + ' needs (see the mod guide): left out.');
  }
  if (!pack.defs.length) throw new Error('its code defines no parts JEKray2D can use');
  const parts = [], used = new Set();
  // the pack's own parts: an element naming one of its definitions ("mod": { "def": key }) becomes that part
  pack.rawParts.forEach((P, i) => {
    const pname = packText(P && P.name, 60) || 'Part ' + (i + 1), els = [];
    for (const e of Array.isArray(P && P.elements) ? P.elements : []) {
      const D = e && e.mod && pack.defs.find(d => d.key === e.mod.def);
      if (e && e.mod && !D) { notes.push(pname + ': it uses a part the code does not define, ' + JSON.stringify(e.mod.def) + ': left out.'); continue; }
      const n = normElement(D ? modElement(pack, D, e) : e);
      if (!n) { notes.push(pname + ': an element of type ' + JSON.stringify(e && e.type) + ' is not one JEKray2D has: left out.'); continue; }
      if (D) used.add(D.key);
      els.push(n);
    }
    if (els.length) parts.push({ name: pname, summary: packText(P.summary, 120) || typeLabel(els[0]), group: packText(P.group, 40), palette: palOf(els[0]), clip: { format: 'jekray-clip', version: 1, from: null, elements: els, fibres: [] } });
  });
  // and one of each part it defines that none of those uses (a readout is no part: it appears on the screens)
  for (const D of pack.defs) {
    if (used.has(D.key) || D.kind === 'readout') continue;
    const n = normElement(modElement(pack, D));
    if (n) parts.push({ name: D.name, summary: D.summary || { element: 'Plate', plate: 'Polarisation plate', component: 'Fibre component', block: 'Electronics block' }[D.kind], group: '', palette: palOf(n), clip: { format: 'jekray-clip', version: 1, from: null, elements: [n], fibres: [] } });
  }
  pack.parts = parts;
  delete pack.rawParts;
}
export function modConfirmText(pack, from) {
  const kinds = { element: 'a plate', plate: 'a polarisation plate', component: 'a fibre component', block: 'an electronics block', readout: 'a readout for screens and detectors' };
  return h('div', null,
    h('p', { class: 'note warn' }, 'This pack is a mod: it has code (' + Math.ceil(pack.code.length / 1024) + ' KB) that runs whenever one of its parts is on a bench. ' + (from ? 'From ' + from + '. ' : '') + 'Install it only if you trust where it came from.'),
    h('p', null, 'It defines:'),
    h('ul', null, ...pack.defs.map(D => h('li', null, h('b', null, D.name), ', ' + kinds[D.kind] + (D.summary ? ': ' + D.summary : '')))),
    h('p', { class: 'rt-hint' }, 'Its code runs in a sandbox, apart from this page: it cannot reach your account, your benches, your files or the internet. It is given only the settings of its own parts and what it is asked to work out, and a part can only send back numbers. Code ' + pack.hash.slice(0, 12) + '…'));
}
/* the mods in use: the installed packs with code, when mods are on */
export function modsSync() {
  const on = typeof exp === 'function' && exp('mods');
  MODS.packs = new Map(on ? PACKS.list.filter(p => p.code && p.hash).map(p => [p.id, p]) : []);
  MODS.rev++;
  if (!IN_WORKER && !TEST_MODE) { setLastTraceKey(null); requestRender(); }
}
/* ---------- a bench carries the code of the mods its parts use ----------
   Saved with it (so a file, a share link or a QR code opens complete), never run on opening:
   someone opening it is asked whether to install each mod not yet installed (or installed in
   another version), with the same prompt as any mod. Until then its parts stand in. */
export function modsCarried() {
  const ids = new Set(project.elements.filter(e => e.mod).map(e => e.mod.id)), out = [];
  for (const id of ids) {
    const pk = MODS.packs.get(id) || PACKS.list.find(p => p.id === id && p.code), was = (project.mods || []).find(m => m.id === id);
    if (pk) out.push({ id, name: pk.name, author: pk.author, packVersion: pk.packVersion, licence: pk.licence, description: pk.description, hash: pk.hash, code: pk.code });
    else if (was) out.push(was);
  }
  return out;
}
export function normCarried(list) {
  return (Array.isArray(list) ? list.slice(0, 16) : []).filter(m => m && typeof m.code === 'string' && m.code.length <= MOD_CODE_MAX && /^[a-z0-9][a-z0-9._-]{1,63}$/.test(m.id))
    .map(m => ({ id: m.id, name: modText(m.name, 60) || m.id, author: modText(m.author, 80), packVersion: modText(String(m.packVersion || '1'), 20), licence: modText(m.licence, 60),
      description: modText(m.description, 600), hash: /^[0-9a-f]{64}$/.test(m.hash) ? m.hash : '', code: m.code }));
}
// after a bench opens: its mods not installed here, offered one at a time
export async function modsOffer() {
  if (IN_WORKER || TEST_MODE || EMBED) return;
  // by the code's own hash, worked out here: what a file says of it is not taken on trust
  for (const m of project.mods || []) m.hash = await modHash(m.code);
  const want = (project.mods || []).filter(m => { const pk = PACKS.list.find(p => p.id === m.id); return (!pk || pk.hash !== m.hash) && !MODS.offered.has(m.id + '|' + m.hash); });
  if (!want.length) return;
  if (!exp('mods')) { toast('This bench uses mods (' + want.map(m => m.name).join(', ') + '), an experimental feature: turn mods on under Help › Experimental features to run them'); return; }
  for (const m of want) {
    MODS.offered.add(m.id + '|' + m.hash);
    try {
      const raw = { format: PACK_FORMAT, version: 2, id: m.id, name: m.name, author: m.author, packVersion: m.packVersion, licence: m.licence, description: m.description, code: m.code };
      const r = normPack(raw); await modPrepare(r.pack, r.notes);
      await packConfirm(r.pack, r.notes, 'this bench');
    } catch (err) { toast('This bench’s mod ' + m.name + ' could not be used: ' + err.message, true); }
  }
}
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
export function modReadoutSection(el) {
  for (const { pk, D, none, fail, r } of modReadoutResults(el)) {
    panel.append(h('h3', null, D.name, h('small', { class: 'rt-pby' }, ' from ' + pk.name)));
    if (none) panel.append(h('p', { class: 'note' }, el.type === 'detector' ? 'Nothing reaches it.' : 'Waiting for the diffracted field on this screen (nothing reaches it, or it is being worked out).'));
    else if (fail) panel.append(h('p', { class: 'note warn' }, 'Not working: ' + fail + '.'));
    else if (!r) panel.append(h('p', { class: 'note' }, 'Working it out…'));
    else {
      if (r.rows.length) panel.append(h('div', { class: 'rt-readout' }, h('table', null, ...r.rows.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v))))));
      for (const S of r.series) panel.append(modSeriesSvg(S));
    }
  }
}
// a series as a small line plot: its ranges on the axes, its labels under them. Built node by
// node, its text set as text: nothing a mod sends can become markup
function modSeriesSvg(S) {
  const W = 300, H = 150, l = 44, b = 26, t = 18, rgt = 8, xs = S.x, ys = S.log ? S.y.map(v => v > 0 ? Math.log10(v) : NaN) : S.y;
  const fin = ys.filter(isFinite), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...fin), y1 = Math.max(...fin);
  const X = v => l + (v - x0) / ((x1 - x0) || 1) * (W - l - rgt), Y = v => t + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - t - b);
  const NS = 'http://www.w3.org/2000/svg', node = (tag, at, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
  const f = v => String(+v.toPrecision(3)), y = (v) => S.log ? '1e' + f(v) : f(v);
  const svg = node('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img' });
  svg.setAttribute('aria-label', S.name || 'plot');
  svg.append(node('rect', { x: l, y: t, width: W - l - rgt, height: H - t - b, fill: 'none', stroke: 'currentColor', 'stroke-opacity': 0.3 }),
    node('polyline', { points: xs.map((x, i) => isFinite(ys[i]) ? X(x).toFixed(1) + ',' + Y(ys[i]).toFixed(1) : '').filter(Boolean).join(' '), fill: 'none', stroke: 'var(--jek-orange)', 'stroke-width': 1.6 }),
    node('text', { x: l, y: 12, 'font-size': 10, fill: 'currentColor' }, S.name || ''),
    node('text', { x: l - 4, y: t + 8, 'font-size': 9, 'text-anchor': 'end', fill: 'currentColor' }, y(y1)),
    node('text', { x: l - 4, y: H - b, 'font-size': 9, 'text-anchor': 'end', fill: 'currentColor' }, y(y0)),
    node('text', { x: l, y: H - b + 12, 'font-size': 9, fill: 'currentColor' }, f(x0)),
    node('text', { x: W - rgt, y: H - b + 12, 'font-size': 9, 'text-anchor': 'end', fill: 'currentColor' }, f(x1)),
    node('text', { x: (W + l) / 2, y: H - 3, 'font-size': 9, 'text-anchor': 'middle', fill: 'currentColor' }, S.xLabel || ''),
    node('text', { x: 9, y: (H - b + t) / 2, 'font-size': 9, 'text-anchor': 'middle', fill: 'currentColor', transform: 'rotate(-90 9 ' + (H - b + t) / 2 + ')' }, S.yLabel || ''));
  return h('div', { class: 'rt-modplot' }, svg);
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

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireMods() {
  if (!IN_WORKER) window.addEventListener('message', e => {
    const F = MODS.frame;
    if (!F || e.source !== F.el.contentWindow) return;            // only the sandbox's own frame is listened to
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.ready) { F.ok(); return; }
    if (m.bad && typeof m.key === 'string') { modDrop(m.key, 'it ' + String(m.bad).slice(0, 80).replace(/^it /, '')); return; }
    const C = MODS.calls.get(m.id);
    if (!C) return;
    MODS.calls.delete(m.id); clearTimeout(C.timer);
    if (m.ok) C.resolve(m.out); else C.reject(new Error(typeof m.err === 'string' ? m.err.slice(0, 300) : 'it failed'));
  });

}
