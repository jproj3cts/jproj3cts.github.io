import { stackR } from '../../../jekray/src/core/coatdesign.js';

/* ==========================================================================
   What a maker needs to coat the part: the specification kept with the coating (make) and the performance it is
   accepted against. The limits follow the coating's target, each with the value the design gives over the band and
   the angles judged, for the polarisation chosen, so a requirement the design itself misses shows before it is sent:
     ar      R mean ≤, R max ≤          hr     R min ≥, R mean ≥
     split   R ≥ R − tol, R ≤ R + tol    edge   R ≥ on the reflected side, R ≤ on the passed side (the edge ± 2% left out)
   A limit not set by hand takes a default from the design with a margin (makeDefaults); one set by hand is kept.
   ========================================================================== */
export const MAKE_DURABILITY = {
  'mil-48497': 'MIL-C-48497A: moderate abrasion, adhesion, humidity',
  'mil-675': 'MIL-C-675C: severe abrasion, adhesion, humidity, salt',
  'iso-9211': 'ISO 9211-4: the tests named with the order',
  maker: 'The maker’s own standard coating durability',
};
export const MAKE_SURFACES = { s1: 'Surface 1 (the light’s side)', s2: 'Surface 2', both: 'Both surfaces' };
const mnum = (v, lo, hi, d) => (v === null || v === undefined || v === '' || !isFinite(+v) ? d : Math.min(hi, Math.max(lo, +v)));
export function normMake(m) {
  m = m && typeof m === 'object' ? m : {};
  const lim = m.limits && typeof m.limits === 'object' ? m.limits : {}, limits = {};
  for (const [k, v] of Object.entries(lim)) if (/^[a-z]{2,8}$/.test(k) && isFinite(+v)) limits[k] = Math.min(100, Math.max(0, +v));
  return {
    part: String(m.part || '').slice(0, 80), qty: Math.round(mnum(m.qty, 1, 1e6, 1)),
    size: mnum(m.size, 0.1, 2000, 25.4), ca: mnum(m.ca, 1, 100, 90), surfaces: MAKE_SURFACES[m.surfaces] ? m.surfaces : 's1',
    durability: MAKE_DURABILITY[m.durability] ? m.durability : 'mil-48497', quality: String(m.quality || '60-40 scratch-dig (MIL-PRF-13830B)').slice(0, 60),
    witness: m.witness !== false, splitTol: mnum(m.splitTol, 0.1, 50, 3), limits,
  };
}
/* the reflectance over the band and the angles judged (five angles across them), each wavelength's value at each angle */
function sampleR(layers, spec, keep) {
  const out = [], nA = spec.theta > spec.theta0 ? 5 : 1;
  for (let i = 0; i < 61; i++) {
    const nm = spec.lo + (spec.hi - spec.lo) * i / 60;
    if (keep && !keep(nm)) continue;
    for (let j = 0; j < nA; j++) { const a = spec.theta0 + (spec.theta - spec.theta0) * (nA > 1 ? j / (nA - 1) : 0); out.push(stackR(layers, spec.n0, spec.ns, Math.cos(a * Math.PI / 180), nm, spec.pol)); }
  }
  return out;
}
const up = v => { if (!(v > 0)) return 0.01; const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.ceil(v / p) * p; };
const down = v => Math.floor(v * 10 + 1e-6) / 10;
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
/* the requirement rows for the coating: [{ key, label, op ('le' | 'ge'), value, auto, design, ok, where }] */
export function makeLimits(f, spec, make) {
  const L = f.layers, pc = v => 100 * v, set = (make && make.limits) || {};
  const rows = [];
  const row = (key, label, op, design, dflt, where) => {
    const value = set[key] !== undefined ? set[key] : dflt;
    rows.push({ key, label, op, value, auto: set[key] === undefined, design, ok: op === 'le' ? design <= value + 1e-9 : design >= value - 1e-9, where });
  };
  const band = spec.lo + '–' + spec.hi + ' nm';
  if (spec.target === 'ar' || spec.target === 'hr') {
    const R = sampleR(L, spec).map(pc), m = mean(R), mx = Math.max(...R), mn = Math.min(...R);
    if (spec.target === 'ar') { row('mean', 'R mean', 'le', m, up(m * 1.5), band); row('max', 'R max', 'le', mx, up(mx * 1.3), band); }
    else { row('min', 'R min', 'ge', mn, Math.min(99.9, down(mn - 0.2)), band); row('mean', 'R mean', 'ge', m, Math.min(99.9, down(m - 0.1)), band); }
  } else if (spec.target === 'split') {
    const R = sampleR(L, spec).map(pc), tol = (make && make.splitTol) || 3;
    row('min', 'R min', 'ge', Math.min(...R), Math.max(0, spec.R - tol), band); row('max', 'R max', 'le', Math.max(...R), Math.min(100, spec.R + tol), band);
  } else if (spec.target === 'edge') {
    const off = 0.02 * spec.edge, reflBelow = !spec.passBelow;
    const refl = sampleR(L, spec, nm => (reflBelow ? nm < spec.edge - off : nm > spec.edge + off)).map(pc);
    const pass = sampleR(L, spec, nm => (reflBelow ? nm > spec.edge + off : nm < spec.edge - off)).map(pc);
    const rw = reflBelow ? spec.lo + '–' + Math.round(spec.edge - off) + ' nm' : Math.round(spec.edge + off) + '–' + spec.hi + ' nm';
    const pw = reflBelow ? Math.round(spec.edge + off) + '–' + spec.hi + ' nm' : spec.lo + '–' + Math.round(spec.edge - off) + ' nm';
    if (refl.length) row('refl', 'R min, reflected side', 'ge', Math.min(...refl), Math.min(90, down(Math.min(...refl) - 1)), rw);
    if (pass.length) row('pass', 'R max, passed side', 'le', Math.max(...pass), Math.max(5, up(Math.max(...pass) * 1.2)), pw);
  }
  return rows;
}
