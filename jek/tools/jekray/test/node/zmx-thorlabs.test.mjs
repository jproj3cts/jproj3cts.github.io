/* A lens file written the way Thorlabs' downloads are: three wavelengths in use and the rest of
   the twenty-four WAVM slots holding a placeholder 0.55 um, a title too long to be a name, and the
   archive served as <part>-Zemax.zar. The design keeps only the wavelengths in use, and the part
   its own number and the coating band its suffix gives. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const ZE = await import('../../src/io/zmx-export.js');
const ZI = await import('../../src/io/zmx-import.js');
const { loadProject } = await import('../../src/state/elements.js');
loadProject({ format: 'jekray', version: 1, elements: [] });         // the part placed on a bench, as an import is

const waves = ['4.861E-1', '5.876E-1', '6.563E-1'];
const wavm = Array.from({ length: 24 }, (_, i) => 'WAVM ' + (i + 1) + ' ' + (waves[i] || '5.5E-1') + ' 1').join('\n');
const file = (stop) => ['VERS 140101', 'MODE SEQ', 'NAME AC254-050-A Achromatic Doublet, f = 50 mm, ARC 400-700 nm, N-BAF10/SF10',
  'UNIT MM X W X CM MR CPMM', 'ENPD 22.86', 'PWAV 2', 'WAVL ' + waves.join(' '), 'WWGT 1 1 1', wavm,
  'SURF 0', '  TYPE STANDARD', '  CURV 0.0', '  DISZ INFINITY',
  ...(stop ? ['SURF 1', '  STOP', '  TYPE STANDARD', '  CURV 0.0', '  DISZ 5', '  DIAM 5'] : []),
  'SURF ' + (stop ? 2 : 1), '  TYPE STANDARD', '  CURV 2.999400119976E-2', '  DISZ 9', '  GLAS N-BAF10 0 0 1.67 47.1', '  DIAM 12.7',
  'SURF ' + (stop ? 3 : 2), '  TYPE STANDARD', '  CURV -4.488330341113E-2', '  DISZ 2.5', '  GLAS SF10 0 0 1.728 28.5', '  DIAM 12.7',
  'SURF ' + (stop ? 4 : 3), '  TYPE STANDARD', '  CURV -3.435599e-3', '  DISZ 43.4', '  DIAM 12.7',
  'SURF ' + (stop ? 5 : 4), '  TYPE STANDARD', '  CURV 0.0', '  DISZ 0', '  DIAM 1'].join('\n');

test('a Thorlabs file keeps only the wavelengths in use', () => {
  const Z = ZI.parseZmx(file(true), 'AC254-050-A-Zemax.zar', null);
  assert.deepEqual(Z.cond.waves.map(w => w.nm), [486.1, 587.6, 656.3]);
  const A = ZE.zmxAssembly(Z, ZE.zmxPart(Z, 'AC254-050-A-Zemax.zar', 'auto'));
  assert.deepEqual(A.asm.cond.waves.map(w => w.nm), [486.1, 587.6, 656.3]);
});

test('a Thorlabs download name gives the part number and its coating band', () => {
  const Z = ZI.parseZmx(file(false), 'AC254-050-A-Zemax.zar', null), el = ZE.zmxPart(Z, 'AC254-050-A-Zemax.zar', 'auto');
  assert.equal(el.name, 'AC254-050-A');
  assert.match(el.surfaces[0].coat.label, /band A/);
});
