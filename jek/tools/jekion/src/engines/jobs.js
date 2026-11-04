import { normProject } from '../state/elements.js';
import { gNode } from '../core/grid.js';
import { buildArray, fieldSetOf, geometryKey, solveStartArray, voltageKey } from './session.js';
import { eFieldAt, potentialAlong, potentialAt } from './fields.js';
import { flyStart } from './fly.js';
import { trapAnalysis } from './trap.js';

/* ==========================================================================
   The jobs the page asks for, run in the worker (worker/main.js) or, where there is none, on the page itself
   (page/workers.js): the same code either way. A job state keeps the solved array between jobs, so a change
   of voltage flies again without solving; a change of geometry solves again. Each job yields between steps
   (await), so a cancel can reach it, and reports progress as it goes.
   ========================================================================== */
export const jobsState = () => ({ A: null, key: null, F: null, vkey: null, P: null });
const tick = () => new Promise(r => setTimeout(r, 0));
/* the array solved for the project, kept; progress({ phase: 'solve', k, n, cycle }) */
async function ensureSolved(St, P, ctx) {
  const key = geometryKey(P);
  if (!St.A || St.key !== key) {
    St.A = buildArray(P); St.key = key; St.F = null; St.vkey = null;
    const J = solveStartArray(St.A);
    let last = 0;
    while (!J.step()) {
      if (ctx.cancelled()) return false;
      const now = Date.now();
      if (now - last > 80) { last = now; const p = J.progress; if (ctx.progress) ctx.progress({ phase: 'solve', k: p.k, n: p.n, cycle: p.cycle }); await tick(); }
    }
    St.solveInfo = { cycles: J.result(), painted: St.A.painted.slice(), nodes: St.A.g.n };
  }
  const vk = voltageKey(P);
  if (!St.F || St.vkey !== vk) { St.F = fieldSetOf(St.A, P); St.vkey = vk; }
  St.P = P;
  return true;
}
/* the potential (and the electrodes' voxels, and |E| if asked) on the view plane: { nu, nv, u0, v0, h, pot, mask, emag } */
function sliceOf(St, P, args) {
  const F = St.F, g = F.g, plane = args.plane || 'xy', s = args.slice || 0, t = args.t || 0;
  const [iu, iv, ip] = plane === 'xy' ? [0, 1, 2] : plane === 'xz' ? [0, 2, 1] : [1, 2, 0];
  const n = [g.nx, g.ny, g.nz], o0 = [g.x0, g.y0, g.z0];
  let nu = n[iu], nv = n[iv];
  if (g.nz === 1 && plane !== 'xy') { nu = plane === 'xz' ? g.nx : g.ny; nv = 1; }
  const pot = new Float32Array(nu * nv), mask = new Int16Array(nu * nv), emag = args.efield ? new Float32Array(nu * nv) : null, E = [0, 0, 0], p = [0, 0, 0];
  for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
    p[iu] = o0[iu] + a * g.h; p[iv] = o0[iv] + b * g.h; p[ip] = s;
    if (g.nz === 1) { if (plane === 'xy') p[2] = 0; else if (plane === 'xz') { p[1] = s; p[2] = 0; } else { p[0] = s; p[2] = 0; } }
    const q = a + nu * b;
    pot[q] = potentialAt(F.G, g, p[0], p[1], p[2], t);
    const node = gNode(g, p[0], p[1], p[2]); mask[q] = node >= 0 ? F.mask[node] : -1;
    if (emag) { emag[q] = eFieldAt(F.G, g, p[0], p[1], p[2], t, E) ? Math.hypot(E[0], E[1], E[2]) : NaN; }
  }
  return { nu, nv, u0: o0[iu], v0: o0[iv], h: g.h, pot, mask, emag, sym: g.sym };
}
/* run a job: kind 'solve' | 'fly' | 'slice' | 'trap' | 'line' | 'probe'; P the project (plain data); ctx { progress, cancelled }.
   Resolves with { out, transfer } (transfer: buffers to hand over), or { cancelled: true }. */
export async function runJob(St, kind, data, args, ctx) {
  const P = normProject(data);
  if (!(await ensureSolved(St, P, ctx))) return { cancelled: true };
  const info = St.solveInfo;
  if (kind === 'solve') return { out: { nodes: info.nodes, cycles: info.cycles, painted: info.painted, g: Object.assign({}, St.A.g) }, transfer: [] };
  if (kind === 'slice') { const S = sliceOf(St, P, args || {}); return { out: S, transfer: [S.pot.buffer, S.mask.buffer].concat(S.emag ? [S.emag.buffer] : []) }; }
  if (kind === 'trap') { const p = args && args.point ? args.point : [0, 0, 0]; return { out: trapAnalysis(St.F, P, p, args && args.species ? args.species : P.species), transfer: [] }; }
  if (kind === 'line') return { out: potentialAlong(St.F.G, St.F.g, args.a, args.b, args.n || 200, args.t || 0), transfer: [] };
  if (kind === 'probes') { const t = args.t || 0, ts = args.ts || null, v = []; args.pts.forEach((p, i) => v.push(potentialAt(St.F.G, St.F.g, p[0], p[1], p[2], ts ? ts[i] : t))); return { out: { v }, transfer: [] }; }
  if (kind === 'probe') { const E = [0, 0, 0], ok = eFieldAt(St.F.G, St.F.g, args.p[0], args.p[1], args.p[2], args.t || 0, E); return { out: { V: potentialAt(St.F.G, St.F.g, args.p[0], args.p[1], args.p[2], args.t || 0), E: ok ? E : null, el: St.F.mask[gNode(St.F.g, args.p[0], args.p[1], args.p[2])] }, transfer: [] }; }
  if (kind === 'fly') {
    const J = flyStart(St.F, P);
    let last = 0;
    while (!J.step(40)) {
      if (ctx.cancelled()) return { cancelled: true };
      const now = Date.now();
      if (now - last > 120) { last = now; if (ctx.progress) ctx.progress(Object.assign({ phase: 'fly' }, J.progress)); }
      await tick();
    }
    const R = J.result();
    return { out: R, transfer: R.particles.map(p => p.pts.buffer) };
  }
  throw new Error('no such job: ' + kind);
}
