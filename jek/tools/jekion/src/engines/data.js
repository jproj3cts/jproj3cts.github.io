import { END_WORDS } from './fly.js';

/* ==========================================================================
   The bench's numbers as data items for the export (core/datafiles.js takes them): every particle's start and end,
   the detectors' records, the trajectories, the trap analysis and the electrodes. gatherIonData(P, R, T, kinds)
   needs no page: the scripts' save() and the tests use it too.
   ========================================================================== */
export const ION_DATA_KINDS = [
  ['ions', 'Ions: each particle’s start, end and energy', 'A row a particle: its group, species, start and end positions, times, energies and how it ended'],
  ['hits', 'Detectors: every crossing recorded', 'A table a detector, a row a crossing: position, time, energy and direction'],
  ['paths', 'Trajectories: every path’s points', 'A table a particle: x, y, z and t along its path (as kept: thinned when long)'],
  ['trap', 'Trap analysis', 'The Mathieu parameters, frequencies and stability at the analysis point'],
  ['electrodes', 'Electrodes: their voltages and places', 'A row an electrode: shape, place, size and voltage'],
];
export function gatherIonData(P, R, T, kinds) {
  const want = new Set(kinds || ION_DATA_KINDS.map(k => k[0])), items = [];
  const col = (name, unit, values, type) => ({ name, unit, values, type });
  if (want.has('ions') && R) {
    const ps = R.particles;
    items.push({ kind: 'table', name: 'ions', about: 'each particle flown: where it started and ended', cols: [
      col('group', '', ps.map(p => (P.ions[p.group] || {}).name || String(p.group)), 'str'), col('index', '', ps.map(p => p.i), 'int'), col('mass', 'u', ps.map(p => p.m)), col('charge', 'e', ps.map(p => p.q)),
      col('x0', 'mm', ps.map(p => p.start[0])), col('y0', 'mm', ps.map(p => p.start[1])), col('z0', 'mm', ps.map(p => p.start[2])), col('t0', 'us', ps.map(p => p.t0)), col('ke0', 'eV', ps.map(p => p.ke0)),
      col('x', 'mm', ps.map(p => p.end.x)), col('y', 'mm', ps.map(p => p.end.y)), col('z', 'mm', ps.map(p => p.end.z)), col('t', 'us', ps.map(p => p.end.t)), col('ke', 'eV', ps.map(p => p.end.ke)),
      col('end', '', ps.map(p => END_WORDS[p.end.why] || p.end.why), 'str'), col('electrode', '', ps.map(p => (p.end.why === 'splat' || p.end.why === 'start') && P.electrodes.filter(e => e.on !== false)[p.end.el] ? P.electrodes.filter(e => e.on !== false)[p.end.el].name : p.end.why === 'det' && P.detectors.filter(d => d.on !== false)[p.end.el] ? P.detectors.filter(d => d.on !== false)[p.end.el].name : ''), 'str'),
      col('collisions', '', ps.map(p => p.collisions || 0), 'int')] });
  }
  if (want.has('hits') && R) {
    P.detectors.filter(d => d.on !== false).forEach((d, di) => {
      const hs = []; for (const p of R.particles) for (const hh of p.hits) if (hh.det === di) hs.push(Object.assign({ p }, hh));
      items.push({ kind: 'table', name: 'detector ' + d.name, about: 'every crossing of ' + d.name + ' (across ' + d.axis + ' at ' + d.at + ' mm)', cols: [
        col('group', '', hs.map(hh => (P.ions[hh.p.group] || {}).name || ''), 'str'), col('index', '', hs.map(hh => hh.p.i), 'int'), col('x', 'mm', hs.map(hh => hh.x)), col('y', 'mm', hs.map(hh => hh.y)), col('z', 'mm', hs.map(hh => hh.z)), col('t', 'us', hs.map(hh => hh.t)), col('ke', 'eV', hs.map(hh => hh.ke)),
        col('ux', 'mm/us', hs.map(hh => hh.ux)), col('uy', 'mm/us', hs.map(hh => hh.uy)), col('uz', 'mm/us', hs.map(hh => hh.uz))] });
    });
  }
  if (want.has('paths') && R) for (const p of R.particles) {
    const n = p.pts.length / 4, xs = [], ys = [], zs = [], ts = [];
    for (let i = 0; i < n; i++) { xs.push(p.pts[4 * i]); ys.push(p.pts[4 * i + 1]); zs.push(p.pts[4 * i + 2]); ts.push(p.pts[4 * i + 3]); }
    items.push({ kind: 'table', name: 'path ' + ((P.ions[p.group] || {}).name || p.group) + ' ' + p.i, about: 'the trajectory of particle ' + p.i + ' of ' + ((P.ions[p.group] || {}).name || p.group), cols: [col('x', 'mm', xs), col('y', 'mm', ys), col('z', 'mm', zs), col('t', 'us', ts)] });
  }
  if (want.has('trap') && T) items.push({ kind: 'value', name: 'trap analysis', about: 'the Mathieu parameters, frequencies and stability at ' + T.point.join(', ') + ' mm', value: T });
  if (want.has('electrodes')) {
    const es = P.electrodes;
    items.push({ kind: 'table', name: 'electrodes', about: 'the electrodes: shape, place and voltage', cols: [col('name', '', es.map(e => e.name), 'str'), col('shape', '', es.map(e => e.shape), 'str'), col('x', 'mm', es.map(e => e.x)), col('y', 'mm', es.map(e => e.y)), col('z', 'mm', es.map(e => e.z)), col('axis', '', es.map(e => e.axis), 'str'),
      col('V', 'V', es.map(e => e.V)), col('rf amplitude', 'V', es.map(e => (e.rf && e.rf.on ? e.rf.amp : 0))), col('rf frequency', 'MHz', es.map(e => (e.rf && e.rf.on ? e.rf.mhz : 0))), col('rf phase', 'deg', es.map(e => (e.rf && e.rf.on ? e.rf.phase : 0))), col('in array', '', es.map(e => e.on !== false), 'bool')] });
  }
  return items;
}
export function ionDataCounts(P, R, T) {
  return { ions: R ? R.particles.length : 0, hits: R ? R.particles.reduce((a, p) => a + p.hits.length, 0) : 0, paths: R ? R.particles.length : 0, trap: T ? 1 : 0, electrodes: P.electrodes.length };
}
