import { deg, project, typeLabel } from '../state/project.js';
import { benchNms, getEl, serialize } from '../state/elements.js';
import { beamAt, m2Env } from '../core/beams-hom.js';
import { mirrorFocus } from '../core/assembly.js';
import { lastTrace, traceScene } from './trace.js';
import { detectorReading } from './fibre-face.js';
import { specReading } from './spectrometer.js';
import { linkBudget, rfSweep } from './rf-sweep.js';
import { antennaNow } from './antenna-field.js';
import { diffraction, pctOfSources, viaCavity } from './pd-cavity.js';
import { screenStats } from './screen-stats.js';

/* ==========================================================================
   The bench's numbers as data: tables and arrays for File › Export data (io/data-export.js), a script's
   J.data(), and Node (headless.mjs). Each kind gives { items, parts }: the items (core/datafiles.js's tables,
   arrays and values, each column with its unit, as the panels give it) and the ids of the parts they come
   from, whose settings go with the file. The plots are the page's own (io/data-export.js reads them from the
   panels); everything else is here, from the trace and the engines, so it is the same in the page, the
   script worker and Node.
   ========================================================================== */

/* The kinds, as File › Export data lists them */
export const DATA_KINDS = [['readouts', 'Readouts'], ['plots', 'Plots'], ['screens', 'Screen data'], ['beams', 'Beams'], ['sweeps', 'Sweep results'], ['bench', 'The bench']];

/* What the bench's studies found, kept for the export as they are run (ui/tours.js): the sensitivity table,
   the Monte Carlo's trials and the optimiser's search, each with what it measured. Plain data: names, not parts */
export const STUDIES = { sensitivity: null, tolerance: null, optimiser: null };
export function keepStudy(kind, v) { STUDIES[kind] = v ? Object.assign({ when: new Date().toISOString(), bench: project.name }, v) : null; }

const tabName = el => { const b = (project.benches || []).find(x => x.id === el.bench); return b ? b.name : ''; };
const fin = v => (typeof v === 'number' && isFinite(v) ? v : v === Infinity || v === -Infinity ? v : NaN);
/* a part's settings for a file's context: as saved, less an imported mesh's triangles */
export function partSettings(el) {
  const s = JSON.parse(JSON.stringify(el));
  if (s.mesh && typeof s.mesh.data === 'string') s.mesh = Object.assign({}, s.mesh, { data: '(' + s.mesh.data.length + ' characters of triangles, left out)' });
  return s;
}
const col = (name, unit, values, type) => ({ name, unit: unit || '', values, ...(type ? { type } : {}) });
const isRf = () => benchNms().some(nm => nm > 1e5);
const isAntenna = el => (el.type === 'lens' && (el.mmw || el.grin) && isRf()) || (el.type === 'mirror' && isRf() && (F => !!F && !F.h)(mirrorFocus(el)));
const readoutParts = () => project.elements.filter(el => el.type === 'screen' || el.type === 'detector' || el.type === 'spectrometer' || isAntenna(el));

/* ---------- Readouts: every screen, detector, spectrometer and antenna on the bench, as one long table ---------- */
export function readoutsData() {
  traceScene();
  const part = [], type = [], tab = [], reading = [], value = [], unit = [], text = [], ids = new Set();
  const add = (el, what, v, u, t) => {
    if (v === null || v === undefined) return;
    ids.add(el.id); part.push(el.name); type.push(typeLabel(el)); tab.push(tabName(el)); reading.push(what);
    if (typeof v === 'boolean') { value.push(v ? 1 : 0); text.push(t || (v ? 'yes' : 'no')); }
    else if (typeof v === 'string') { value.push(NaN); text.push(v); }
    else { value.push(fin(v)); text.push(t || ''); }
    unit.push(u || '');
  };
  for (const el of readoutParts()) {
    if (el.type === 'screen') {
      const st = screenStats(el);
      if (!st || st.empty) { add(el, el.absorb ? 'Rays hitting' : 'Crossings recorded', 0, ''); }
      else {
        add(el, el.absorb ? 'Rays hitting' : 'Crossings recorded', st.count, '');
        add(el, el.absorb ? 'Power received' : 'Power, all crossings', st.powerPct, '%', 'of what its sources emit');
        add(el, 'Centroid', st.centroid, 'mm'); add(el, 'RMS spot', st.rms, 'mm'); add(el, 'Full width', st.full, 'mm');
        add(el, 'Mean optical path', st.oplMean, 'mm'); add(el, 'Wavelength of the path figures', st.nm, 'nm');
        add(el, 'Wavefront, peak to valley', st.wfPV, 'mm', 'optical path'); add(el, 'Wavefront, RMS', st.wfRMS, 'mm', 'optical path');
        add(el, 'Round trip', st.roundTrip, 'mm', 'optical path'); add(el, 'Fringe visibility', st.visibility, ''); add(el, 'Interference', st.interference, '', 'coherent over incoherent power');
        const K = st.stokes;
        if (K && K.S0 > 0) { add(el, 'Stokes S1/S0', K.S1 / K.S0, ''); add(el, 'Stokes S2/S0', K.S2 / K.S0, ''); add(el, 'Stokes S3/S0', K.S3 / K.S0, '', 'positive right-handed'); }
        for (const q of st.perNm || []) if (st.mixed) { add(el, 'RMS spot at ' + q.nm + ' nm', q.rms, 'mm'); add(el, 'Centroid at ' + q.nm + ' nm', q.centroid, 'mm'); }
      }
      const B = st && st.beam;
      if (B) {
        add(el, 'Beam radius (1/e²)', B.w, 'mm'); add(el, 'Wavefront radius of curvature', B.R, 'mm'); add(el, 'Waist radius', B.w0, 'mm');
        add(el, 'Waist ahead of the screen', B.waistDist, 'mm', 'negative: behind it'); add(el, 'Rayleigh range', B.zR, 'mm');
      }
      const D = diffraction(el);
      if (D) {
        add(el, 'Strehl ratio', D.strehl, ''); add(el, 'Peak irradiance', D.peak, 'relative'); add(el, 'FWHM', D.fwhm, 'mm');
        add(el, 'FWHM along the screen', D.fwhmX, 'mm'); add(el, 'FWHM out of the plane', D.fwhmY, 'mm');
        add(el, 'Radius holding 50% of the energy', D.ee50, 'mm'); add(el, 'Radius holding 80% of the energy', D.ee80, 'mm');
        add(el, 'MTF falls to 50% at', D.mtf50, 'lp/mm'); add(el, 'Airy radius', D.airy, 'mm'); add(el, 'NA', D.NA, '');
        add(el, 'Field power arriving', D.power, 'relative'); add(el, 'Degree of polarisation', D.dop, '');
      }
    } else if (el.type === 'detector') {
      const r = detectorReading(el);
      if (el.mmw) {
        add(el, 'Power into its mode', r.mw, 'mW'); if (r.rf) add(el, 'Coupling into its mode', r.rf.eff, '');
        add(el, r.mixer ? 'IF tone, peak' : 'Video output', r.V, 'V'); if (r.mixer) add(el, 'IF power', r.ifMw, 'mW');
        add(el, 'Noise, rms', r.noiseV, 'V'); add(el, 'Smallest detectable signal', r.mds, 'mW'); add(el, 'Signal to noise', r.snr, 'dB');
        if (r.mixer) add(el, 'System noise temperature', r.tsys, 'K');
        if (!r.mixer) add(el, 'Saturated', !!r.sat);
        const L = linkBudget(el);
        if (L) add(el, 'Link budget, horn to receiver', L.total, 'dB');
      } else {
        add(el, 'Power', r.mw, 'mW'); add(el, 'Photocurrent', r.mA, 'mA'); add(el, 'Output', r.V, 'V'); add(el, 'Saturated', !!r.sat);
        add(el, 'Noise, rms', r.noiseV, 'V'); add(el, 'Signal to noise', r.snr, 'dB'); add(el, 'From the cavity’s field', !!viaCavity(el));
      }
    } else if (el.type === 'spectrometer') {
      const r = specReading(el);
      add(el, 'Peak', r.peak, 'nm'); add(el, 'Peak width (FWHM)', r.fwhm, 'nm'); add(el, 'Resolution', r.R, 'nm');
      add(el, 'Power through the entrance', r.mw, 'mW'); add(el, 'Share of the light at its face', r.share, ''); add(el, 'Counts at the peak', r.counts, 'e⁻');
      add(el, 'Signal to noise at the peak', r.snr, ''); add(el, 'Saturated', !!r.sat);
    } else {
      const A = antennaNow(el, 'ant');
      if (!A) continue;
      add(el, 'Gain, horn and lens', A.Gdbi, 'dBi'); add(el, 'Directivity', A.Ddbi, 'dBi'); add(el, 'Horn alone', A.hornDbi, 'dBi');
      add(el, 'Half-power beamwidth', A.hpbw, '°', 'in the bench plane'); if (!A.round) add(el, 'Half-power beamwidth across', A.hpbwY, '°');
      add(el, 'Highest sidelobe', A.sll, 'dB'); add(el, 'Beam direction', A.beam, '°', 'from the axis'); add(el, 'Feed direction', A.feed, '°', 'from the axis');
      if (A.eta) { add(el, 'Aperture efficiency', A.eta.ap, ''); add(el, 'Taper efficiency', A.eta.taper, ''); add(el, 'Phase efficiency', A.eta.phase, ''); add(el, 'Spillover efficiency', A.eta.spill, ''); add(el, 'Through the lens', A.eta.through, ''); }
      add(el, 'Far field from', A.farField, 'mm', '2D²/λ'); add(el, 'Focus', A.focus, 'mm');
    }
  }
  const item = { kind: 'table', name: 'readouts', about: 'every screen, detector, spectrometer and antenna on the bench: one row for each reading, as its panel gives it',
    cols: [col('part', '', part, 'str'), col('type', '', type, 'str'), col('tab', '', tab, 'str'), col('reading', '', reading, 'str'), col('value', '', value, 'num'), col('unit', '', unit, 'str'), col('note', '', text, 'str')] };
  return { items: part.length ? [item] : [], parts: ids };
}

/* ---------- Screen data: each screen's ray hits, and the diffracted field's map where there is one ---------- */
const screensOf = () => project.elements.filter(el => el.type === 'screen');
export function screensData() {
  traceScene();
  const items = [], ids = new Set();
  for (const el of screensOf()) {
    const hits = ((lastTrace.screens || {})[el.id] || []).filter(t => !t.chief);
    if (hits.length) {
      ids.add(el.id);
      for (const s of new Set(hits.map(t => t.sid))) ids.add(s);
      const nameOf = new Map();
      const srcName = id => { if (!nameOf.has(id)) { const s = getEl(id); nameOf.set(id, s ? s.name : id); } return nameOf.get(id); };
      const C = f => hits.map(f);
      items.push({ kind: 'table', name: el.name + ' hits', about: 'each ray arriving on ' + el.name + ': where (across the screen from its centre, and up out of the bench plane), its direction, power, wavelength, optical path and polarisation (s out of the bench plane, p in it; amplitudes as the trace carries them, their squares the powers)',
        cols: [col('source', '', C(t => srcName(t.sid)), 'str'), col('ray', '', C(t => t.k), 'int'), col('path', '', C(t => t.path || ''), 'str'),
          col('across', 'mm', C(t => t.y)), col('up', 'mm', C(t => t.z || 0)),
          col('angle from the normal', '°', C(t => Math.asin(Math.max(-1, Math.min(1, t.dly || 0))) / deg)), col('slope up', '', C(t => t.dz || 0)),
          col('power', '% of its source', C(t => pctOfSources(t.w, [t.sid]))), col('ray weight', '', C(t => t.w)),
          col('wavelength', 'nm', C(t => t.nm)), col('optical path', 'mm', C(t => t.opl)), col('index', '', C(t => t.n)),
          col('s power', '', C(t => t.sr * t.sr + t.si * t.si)), col('p power', '', C(t => t.pr * t.pr + t.pi * t.pi)),
          col('Es real', '', C(t => t.sr)), col('Es imaginary', '', C(t => t.si)), col('Ep real', '', C(t => t.pr)), col('Ep imaginary', '', C(t => t.pi))] });
    }
    const D = diffraction(el), M = D && D.map;
    if (M && M.n) {
      ids.add(el.id);
      const n = M.n, du = (M.u1 - M.u0) / n, dv = (M.v1 - M.v0) / n;
      items.push({ kind: 'array', name: el.name + ' field', unit: 'relative', dtype: 'f8', shape: [n, n], data: Float64Array.from(M.v),
        about: 'the diffracted field’s irradiance on ' + el.name + ' (relative), row j out of the bench plane at "' + el.name + ' field up", column i along the screen at "' + el.name + ' field along"' });
      items.push({ kind: 'array', name: el.name + ' field along', unit: 'mm', dtype: 'f8', shape: [n], data: Float64Array.from({ length: n }, (_, i) => M.u0 + (i + 0.5) * du), about: 'the field map’s columns: along the screen from its centre' });
      items.push({ kind: 'array', name: el.name + ' field up', unit: 'mm', dtype: 'f8', shape: [n], data: Float64Array.from({ length: n }, (_, j) => M.v0 + (j + 0.5) * dv), about: 'the field map’s rows: out of the bench plane' });
    }
  }
  return { items, parts: ids };
}

/* ---------- Beams: each Gaussian beam's segments, face to face: q, its size, waist and divergence at each end ---------- */
export function beamsData() {
  traceScene();
  const B = (lastTrace.beams || []), ids = new Set(), rows = [];
  B.forEach((b, i) => {
    if (b.fan || !isFinite(b.qr) || !isFinite(b.qi)) return;
    const src = getEl(b.src), M2 = src ? m2Env(src) : 1, L = b.len3 || b.len || 0;
    const a = beamAt(b.qr, b.qi, b.n, b.nm, M2), e = beamAt(b.qr + L, b.qi, b.n, b.nm, M2);
    if (!a) return;
    if (src) ids.add(src.id);
    const end = b.endEl ? getEl(b.endEl) : null;
    rows.push([i, b.parent, src ? src.name : b.src, (project.benches.find(x => x.id === b.bench) || {}).name || '', b.nm, b.n, b.x0, b.y0, b.z0 || 0,
      Math.atan2(b.dy, b.dx) / deg, b.uz || 0, L, end ? end.name : '', b.qr, b.qi, a.w, e ? e.w : NaN, a.R, a.w0, a.waistDist, a.zR,
      a.zR > 0 ? 1000 * a.w0 / a.zR : NaN, M2, b.w, b.lmw || 0]);
  });
  const H = [['beam', '', 'int'], ['parent', '', 'int'], ['source', '', 'str'], ['tab', '', 'str'], ['wavelength', 'nm'], ['index', ''], ['start x', 'mm'], ['start y', 'mm'], ['start z', 'mm'],
    ['direction', '°'], ['slope up', ''], ['length', 'mm'], ['ends at', '', 'str'], ['q real', 'mm'], ['q imaginary', 'mm'], ['radius at the start', 'mm'], ['radius at the end', 'mm'],
    ['wavefront radius at the start', 'mm'], ['waist radius', 'mm'], ['waist ahead of the start', 'mm'], ['Rayleigh range', 'mm'], ['divergence (half angle)', 'mrad'], ['M²', ''], ['share of its launch', ''], ['launch power', 'mW']];
  const item = { kind: 'table', name: 'beams', about: 'each Gaussian beam segment, from the face it starts at to the face it ends at (beam is its number, parent the one it came from, -1 for none): q = z + i zR at the start (z from the waist), the 1/e² radius at each end, and the waist, Rayleigh range and far-field half angle in the medium it is in (times M²)',
    cols: H.map(([n, u, t], j) => col(n, u, rows.map(r => r[j]), t)) };
  return { items: rows.length ? [item] : [], parts: ids };
}

/* ---------- Sweep results: the sweeps set, each RF receiver's frequency sweep, and the bench's studies ---------- */
export function sweepsData() {
  const items = [], ids = new Set();
  const sw = [];
  for (const el of project.elements) for (const [path, s] of Object.entries(el.sweeps || {})) { sw.push([el, path, s]); ids.add(el.id); }
  if (sw.length) items.push({ kind: 'table', name: 'sweeps', about: 'each parameter given a sweep: its range, the wave it follows, how fast, its phase, and its value now',
    cols: [col('part', '', sw.map(q => q[0].name), 'str'), col('parameter', '', sw.map(q => q[1]), 'str'), col('from', '', sw.map(q => q[2].min)), col('to', '', sw.map(q => q[2].max)),
      col('wave', '', sw.map(q => q[2].wave || 'sine'), 'str'), col('frequency', 'Hz', sw.map(q => q[2].freq)), col('phase', '°', sw.map(q => q[2].phase || 0)),
      col('now', '', sw.map(([el, path]) => { let v = el; for (const k of path.split('.')) v = v == null ? v : v[k]; return typeof v === 'number' ? v : NaN; }))] });
  for (const el of project.elements) {
    if (el.type !== 'detector' || !el.mmw || el.mmw.part) continue;
    const S = rfSweep(el);
    if (!S) continue;
    ids.add(el.id);
    items.push({ kind: 'table', name: el.name + ' frequency sweep', about: 'the receiving horn ' + el.name + ' against frequency, the bench traced again at each step: S21 (into its mode over what the horns are set to) and its coupling',
      cols: [col('frequency', 'GHz', S.ghz.slice()), col('S21', 'dB', S.s21.slice()), col('coupling', '', S.eff.slice())] });
  }
  const T = STUDIES.sensitivity;
  if (T) items.push({ kind: 'table', name: 'sensitivity', about: 'Tolerance the bench › Sensitivity: each parameter alone at each end of its range, and how far ' + T.metric + ' on ' + T.target + ' moved from ' + T.base + ' (RSS ' + T.rss + ')',
    cols: [col('part', '', T.rows.map(r => r.part), 'str'), col('parameter', '', T.rows.map(r => r.path), 'str'), col('at the low end', '', T.rows.map(r => r.lo)), col('at the high end', '', T.rows.map(r => r.hi)),
      col('change at the low end', '', T.rows.map(r => r.dLo)), col('change at the high end', '', T.rows.map(r => r.dHi)), col('worst swing', '', T.rows.map(r => r.worst))] });
  const M = STUDIES.tolerance;
  if (M) items.push({ kind: 'table', name: 'monte carlo', about: 'Tolerance the bench › Monte Carlo: ' + M.samples.length + ' trials of ' + M.metric + ' on ' + M.target + ' (' + M.dist + ' over the swept ranges), sorted; nominal ' + M.nominal,
    cols: [col('trial', '', M.samples.map((_, i) => i + 1), 'int'), col(M.metric, '', M.samples.slice())] });
  const O = STUDIES.optimiser;
  if (O) {
    items.push({ kind: 'table', name: 'optimiser', about: 'Optimise the bench: each value varied and each goal, at the start and at the best found (' + O.evals + ' traces' + (O.stopped ? ', stopped early' : '') + '; merit ' + O.startMerit + ' to ' + O.bestMerit + ')',
      cols: [col('what', '', [...O.vars.map(v => v.part + ': ' + v.path), ...O.terms.map(q => q.target + ': ' + q.metric + ' (' + q.goal + ')')], 'str'),
        col('at the start', '', [...O.vars.map(v => v.start), ...O.terms.map(q => q.start)]), col('best', '', [...O.vars.map(v => v.best), ...O.terms.map(q => q.best)])] });
    if (O.history && O.history.length) items.push({ kind: 'table', name: 'optimiser merit', about: 'the best merit found, trace by trace', cols: [col('trace', '', O.history.map((_, i) => i), 'int'), col('best merit', '', O.history.slice())] });
    if (O.scan && O.scan.length) items.push({ kind: 'table', name: 'optimiser scan', about: 'the coarse scan of the one value varied', cols: [col('value tried', '', O.scan.map(q => q.v)), col('reading', '', O.scan.map(q => (q.raw === null ? NaN : q.raw)))] });
  }
  return { items, parts: ids };
}

/* ---------- The bench: its parts (name, type, place and every setting) and the whole bench as saved ---------- */
export function benchData() {
  const E = project.elements;
  const parts = { kind: 'table', name: 'parts', about: 'every part on the bench: where it is, and all its settings (as JSON, as a .jekray file holds them)',
    cols: [col('name', '', E.map(e => e.name), 'str'), col('type', '', E.map(e => e.type), 'str'), col('kind', '', E.map(e => typeLabel(e)), 'str'), col('tab', '', E.map(tabName), 'str'),
      col('x', 'mm', E.map(e => e.x)), col('y', 'mm', E.map(e => e.y)), col('z', 'mm', E.map(e => (typeof e.z === 'number' ? e.z : NaN))), col('angle', '°', E.map(e => e.angle)),
      col('settings', '', E.map(e => JSON.stringify(partSettings(e))), 'str')] };
  const all = serialize();
  all.elements = all.elements.map(partSettings);
  return { items: [parts, { kind: 'value', name: 'bench', about: 'the whole bench, as a .jekray file holds it (an imported mesh’s triangles left out)', value: all }], parts: new Set() };
}

/* how many of each kind the bench has, for the export's list: { readouts, screens, beams, sweeps, bench } (plots are the page's) */
export function dataCounts() {
  return {
    readouts: readoutParts().length,
    screens: screensOf().length,
    beams: (lastTrace.beams || []).filter(b => !b.fan).length,
    sweeps: project.elements.reduce((a, el) => a + Object.keys(el.sweeps || {}).length + (el.type === 'detector' && el.mmw && !el.mmw.part ? 1 : 0), 0) + Object.values(STUDIES).filter(Boolean).length,
    bench: project.elements.length,
  };
}
/* the kinds named, gathered: { items, parts } (the plots left to the page) */
export function gatherData(kinds) {
  const F = { readouts: readoutsData, screens: screensData, beams: beamsData, sweeps: sweepsData, bench: benchData }, items = [], parts = new Set();
  for (const k of kinds) { const f = F[k]; if (!f) continue; const r = f(); items.push(...r.items); for (const id of r.parts) parts.add(id); }
  return { items, parts };
}
/* the parts' settings, by name, for the file's context */
export const partsMeta = ids => Object.fromEntries([...ids].map(getEl).filter(Boolean).map(el => [el.name, partSettings(el)]));
