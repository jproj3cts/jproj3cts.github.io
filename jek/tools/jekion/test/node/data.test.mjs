/* The data gathered for export, and written by JEKray's writers: CSV and JSON read back. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatherIonData, ionDataCounts, ION_DATA_KINDS } from '../../src/engines/data.js';
import { dfWrite, dfJson } from '../../../jekray/src/core/datafiles.js';
import { normProject } from '../../src/state/elements.js';
import { buildArray, solveArray, fieldSetOf } from '../../src/engines/session.js';
import { flyAll } from '../../src/engines/fly.js';
import { trapAnalysis } from '../../src/engines/trap.js';

const P = normProject({ grid: { sym: 'planar', h: 0.5, x0: -5, x1: 45, y0: -10, y1: 10, bc: { ylo: 'mirror', yhi: 'mirror' } },
  electrodes: [{ name: 'Plate', shape: 'box', x: -4, sx: 1, sy: 30, sz: 30, V: 100 }, { name: 'Aperture', shape: 'aperture', x: 10, rIn: 2, rOut: 15, L: 1, V: 0 }],
  ions: [{ name: 'Ar', species: 'Ar+', n: 5, ke: 1, x: -3, dist: 'line', size: 1 }], detectors: [{ name: 'Screen', axis: 'x', x: 40, half: 0, stop: true }] });
const A = buildArray(P); solveArray(A); const F = fieldSetOf(A, P), R = flyAll(F, P), T = trapAnalysis(F, P, [20, 0, 0], P.species);

test('every kind of data is a table or value with the right rows', () => {
  const items = gatherIonData(P, R, T, ION_DATA_KINDS.map(k => k[0]));
  const ions = items.find(i => i.name === 'ions'), det = items.find(i => i.name === 'detector Screen'), paths = items.filter(i => i.name.startsWith('path ')), el = items.find(i => i.name === 'electrodes');
  assert.equal(ions.cols[0].values.length, 5); assert.equal(det.cols[0].values.length, 5); assert.equal(paths.length, 5); assert.equal(el.cols[0].values.length, 2);
  assert.ok(items.find(i => i.name === 'trap analysis').value.axes.length === 2);
  assert.deepEqual(ionDataCounts(P, R, T), { ions: 5, hits: 5, paths: 5, trap: 1, electrodes: 2 });
});
test('the set writes as JSON and CSV through JEKray’s writers', async () => {
  const set = { meta: { title: 'test', tool: 'JEKion' }, items: gatherIonData(P, R, T, ['ions', 'electrodes']) };
  const j = JSON.parse(dfJson(set));
  assert.equal(j.tables.ions.data.ke_eV.length, 5);
  const zip = await dfWrite(set, 'csv');
  assert.ok(zip.bytes.length > 200 && zip.ext === '.zip');
});
