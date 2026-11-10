import { stackR } from '../../../jekray/src/core/coatdesign.js';
import { faceAmps } from '../../../jekray/src/core/face-pol.js';
import { cabs2 } from '../../../jekray/src/core/numeric.js';

/* ==========================================================================
   What a coater needs: the specification of the coating and the substrate it is on, kept with the coating (make), and
   the performance it is accepted against (nothing of the part beyond its substrate: that is the part's drawing's). The limits follow the coating's target, each with the value the design gives over the band and
   the angles judged, for the polarisation chosen, so a requirement the design itself misses shows before it is sent:
     ar      R mean ≤, R max ≤, T mean ≥            hr     R min ≥, R mean ≥
     split   R ≥ R − tol, R ≤ R + tol, T min ≥     edge   R ≥ on the reflected side; R ≤ and T ≥ on the passed side
   (the edge ± 2% left out). T is what one coated surface passes into the substrate (faceAmps, absorption counted).
   A limit not set by hand takes a default from the design with a margin (makeDefaults); one set by hand is kept.
   ========================================================================== */
export const MAKE_DURABILITY = {
  'mil-48497': 'MIL-C-48497A: moderate abrasion, adhesion, humidity',
  'mil-675': 'MIL-C-675C: severe abrasion, adhesion, humidity, salt',
  'iso-9211': 'ISO 9211-4: the tests named with the order',
  maker: 'The maker’s own standard coating durability',
};
const mnum = (v, lo, hi, d) => (v === null || v === undefined || v === '' || !isFinite(+v) ? d : Math.min(hi, Math.max(lo, +v)));
export function normMake(m) {
  m = m && typeof m === 'object' ? m : {};
  const lim = m.limits && typeof m.limits === 'object' ? m.limits : {}, limits = {};
  for (const [k, v] of Object.entries(lim)) if (/^[a-z]{2,8}$/.test(k) && isFinite(+v)) limits[k] = Math.min(100, Math.max(0, +v));
  return { durability: MAKE_DURABILITY[m.durability] ? m.durability : 'mil-48497', witness: m.witness !== false, splitTol: mnum(m.splitTol, 0.1, 50, 3), limits };
}
/* one coated surface's transmittance into the substrate at nm and cosine ci, for the polarisation judged (or pol) */
export function surfaceT(layers, spec, ci, nm, pol = spec.pol) {
  const F = faceAmps({ coat: { mode: 'stack', layers } }, spec.n0, spec.ns, ci, nm);
  const ts = cabs2(F.ts), tp = cabs2(F.tp);
  return pol === 's' ? ts : pol === 'p' ? tp : (ts + tp) / 2;
}
/* the reflectance (or, kind 'T', the transmittance) over the band and the angles judged, five angles across them */
function sampleR(layers, spec, keep, kind) {
  const out = [], nA = spec.theta > spec.theta0 ? 5 : 1;
  for (let i = 0; i < 61; i++) {
    const nm = spec.lo + (spec.hi - spec.lo) * i / 60;
    if (keep && !keep(nm)) continue;
    for (let j = 0; j < nA; j++) {
      const a = spec.theta0 + (spec.theta - spec.theta0) * (nA > 1 ? j / (nA - 1) : 0), ci = Math.cos(a * Math.PI / 180);
      out.push(kind === 'T' ? surfaceT(layers, spec, ci, nm) : stackR(layers, spec.n0, spec.ns, ci, nm, spec.pol));
    }
  }
  return out;
}
const up = v => { if (!(v > 0)) return 0.01; const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.ceil(v / p) * p; };
const down = v => Math.floor(v * 10 + 1e-6) / 10;
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
/* the requirement rows for the coating: [{ key, q ('R' | 'T'), label, op ('le' | 'ge'), value, auto, design, ok, where }] */
export function makeLimits(f, spec, make) {
  const L = f.layers, pc = v => 100 * v, set = (make && make.limits) || {};
  const rows = [];
  const row = (key, label, op, design, dflt, where) => {
    const value = set[key] !== undefined ? set[key] : dflt;
    rows.push({ key, q: label[0], label, op, value, auto: set[key] === undefined, design, ok: op === 'le' ? design <= value + 1e-9 : design >= value - 1e-9, where });
  };
  const band = spec.lo + '–' + spec.hi + ' nm';
  if (spec.target === 'ar' || spec.target === 'hr') {
    const R = sampleR(L, spec).map(pc), m = mean(R), mx = Math.max(...R), mn = Math.min(...R);
    if (spec.target === 'ar') {
      row('mean', 'R mean', 'le', m, up(m * 1.5), band); row('max', 'R max', 'le', mx, up(mx * 1.3), band);
      const T = mean(sampleR(L, spec, null, 'T').map(pc)); row('tmean', 'T mean', 'ge', T, down(T - 0.5), band);
    }
    else { row('min', 'R min', 'ge', mn, Math.min(99.9, down(mn - 0.2)), band); row('mean', 'R mean', 'ge', m, Math.min(99.9, down(m - 0.1)), band); }
  } else if (spec.target === 'split') {
    const R = sampleR(L, spec).map(pc), tol = (make && make.splitTol) || 3;
    row('min', 'R min', 'ge', Math.min(...R), Math.max(0, spec.R - tol), band); row('max', 'R max', 'le', Math.max(...R), Math.min(100, spec.R + tol), band);
    const T = sampleR(L, spec, null, 'T').map(pc); row('tmin', 'T min', 'ge', Math.min(...T), Math.max(0, down(Math.min(...T) - 1)), band);
  } else if (spec.target === 'edge') {
    const off = 0.02 * spec.edge, reflBelow = !spec.passBelow;
    const refl = sampleR(L, spec, nm => (reflBelow ? nm < spec.edge - off : nm > spec.edge + off)).map(pc);
    const pass = sampleR(L, spec, nm => (reflBelow ? nm > spec.edge + off : nm < spec.edge - off)).map(pc);
    const rw = reflBelow ? spec.lo + '–' + Math.round(spec.edge - off) + ' nm' : Math.round(spec.edge + off) + '–' + spec.hi + ' nm';
    const pw = reflBelow ? Math.round(spec.edge + off) + '–' + spec.hi + ' nm' : spec.lo + '–' + Math.round(spec.edge - off) + ' nm';
    if (refl.length) row('refl', 'R min, reflected side', 'ge', Math.min(...refl), Math.min(90, down(Math.min(...refl) - 1)), rw);
    if (pass.length) {
      row('pass', 'R max, passed side', 'le', Math.max(...pass), Math.max(5, up(Math.max(...pass) * 1.2)), pw);
      const T = sampleR(L, spec, nm => (reflBelow ? nm > spec.edge + off : nm < spec.edge - off), 'T').map(pc);
      row('tpass', 'T min, passed side', 'ge', Math.min(...T), Math.min(90, down(Math.min(...T) - 1)), pw);
    }
  }
  return rows;
}
/* the yield: how many of the tolerance runs' stacks meet every limit of Make it, and each limit alone. The limits are
   the coating's own (the values set, or the defaults from the nominal design), held fixed while each run is judged:
   { runs, pass (all limits), rows: [{ key, label, op, value, nominal, pass, p10 (the value nine runs in ten do better than) }] } */
export function filmYield(stacks, f, spec, make) {
  const lims = makeLimits(f, spec, make), fixed = { ...(make || {}), limits: Object.fromEntries(lims.map(r => [r.key, r.value])) };
  const rows = lims.map(r => ({ key: r.key, label: r.label, op: r.op, value: r.value, where: r.where, nominal: r.design, pass: 0, vals: [] }));
  let pass = 0;
  for (const L of stacks || []) {
    const got = makeLimits({ ...f, layers: L }, spec, fixed);
    let all = true;
    got.forEach((g, i) => { if (g.ok) rows[i].pass++; else all = false; rows[i].vals.push(g.design); });
    if (all) pass++;
  }
  const n = (stacks || []).length;
  for (const r of rows) {
    r.vals.sort((a, b) => (r.op === 'le' ? a - b : b - a));
    r.p10 = r.vals.length ? r.vals[Math.min(r.vals.length - 1, Math.floor(0.9 * (r.vals.length - 1) + 0.5))] : NaN;
    delete r.vals;
  }
  return { runs: n, pass, rows };
}
/* the coating as a note for the part's optical drawing, in the manner of ISO 10110-9 (the coating marked on its
   surface by λ in a circle, its requirements by ρ(λ) for reflectance and τ(λ) for transmittance, to ISO 9211): one
   line a requirement, then the durability. The standard's own text was not to hand: check the layout against it. */
export function drawingNote(f, spec, make) {
  const rows = makeLimits(f, spec, make), pol = { avg: 'mean of s and p', s: 's', p: 'p' }[spec.pol];
  const aoi = spec.theta > spec.theta0 ? spec.theta0 + '°–' + spec.theta + '°' : spec.theta0 + '°';
  const lines = rows.map(r => {
    const [q, kind] = r.label.split(' '), sym = q === 'T' ? 'τ(λ)' : 'ρ(λ)', range = r.where.replace(/^(\d+)–(\d+) nm$/, '$1 nm ≤ λ ≤ $2 nm');
    return (kind === 'mean' ? 'mean ' : '') + sym + ' ' + (r.op === 'le' ? '≤' : '≥') + ' ' + r.value + ' %, ' + range + ', AOI ' + aoi + ', ' + pol;
  });
  return ['Coating (λ in a circle on the surface), to ISO 9211:', ...lines, 'Durability: ' + MAKE_DURABILITY[(make && make.durability) || 'mil-48497'].split(':')[0]];
}
