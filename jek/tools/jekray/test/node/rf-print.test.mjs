/* The printing filaments for RF lenses, and the printer's limits: each filament an index and a
   loss tangent in the range published for printed plastics at 10 to 40 GHz, marked as a
   printing filament; its absorption the textbook 2 pi n tan(delta) / lambda; and the limits on
   what can be made inside the build volume. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RF_MAT, PRINTER, C_NM_GHZ } from '../../src/core/rf.js';
import { absorbAt, refIndex } from '../../src/core/glass.js';

const FILAMENTS = ['PLA', 'ABS', 'PETG', 'ASA', 'PP'];
test('each printing filament has a plausible index and loss, and is marked for printing', () => {
  for (const k of FILAMENTS) {
    const M = RF_MAT[k];
    assert.ok(M && M.print, k + ' is a printing filament');
    assert.ok(M.n > 1.4 && M.n < 1.75, k + ' index ' + M.n);
    assert.ok(M.tand > 1e-4 && M.tand < 3e-2, k + ' loss tangent ' + M.tand);
  }
});
test('a filament absorbs 2 pi n tan(delta) / lambda per mm, its index as given', () => {
  for (const ghz of [10, 24]) {
    const nm = C_NM_GHZ / ghz, lam = nm * 1e-6;
    for (const k of FILAMENTS) {
      const M = RF_MAT[k], want = 2 * Math.PI * M.n * M.tand / lam;
      assert.ok(Math.abs(absorbAt({ glass: k }, nm) / want - 1) < 1e-9, k + ' at ' + ghz + ' GHz');
      assert.equal(refIndex({ glass: k }, nm), M.n);
    }
  }
  // the 10 GHz example's PLA lens, 51 mm at its centre: about 0.76 dB
  const nm = C_NM_GHZ / 10, dB = 4.343 * absorbAt({ glass: 'PLA' }, nm) * 51;
  assert.ok(Math.abs(dB - 0.76) < 0.01, 'PLA, 51 mm at 10 GHz: ' + dB.toFixed(3) + ' dB');
});
test('the limits on what can be made sit inside the build volume', () => {
  assert.ok(PRINTER.maxDia < Math.min(...PRINTER.bed));
  assert.ok(PRINTER.maxHeight < PRINTER.height);
  assert.ok(PRINTER.minWall >= 0.4);
});
