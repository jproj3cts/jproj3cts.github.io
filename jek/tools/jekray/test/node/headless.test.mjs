/* JEKray headless (headless.mjs) and its command line (cli.mjs): a bench opened from its file, traced, its parts read as the
   panels read them; a parameter swept to a table and put back; the RF designer's figures; and the same through the CLI. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { openBench, openFile, parseValues } from '../../headless.mjs';
const DEMO = new URL('../../../demos/rf-24ghz-grin-lens.jekray', import.meta.url).pathname, CLI = new URL('../../cli.mjs', import.meta.url).pathname;

test('a bench opened headless traces and reads as the page does; a sweep leaves the part as it was', async () => {
  const B = await openFile(DEMO);
  const t = B.trace();
  assert.ok(t.rays > 0 && t.rayPower > 0 && t.beams > 0, JSON.stringify(t));
  assert.ok(B.elements().some(e => e.name === 'GRIN lens' && e.type === 'mask'));
  const A = B.antenna('GRIN lens');
  assert.ok(Math.abs(A.Gdbi - 25.31) < 0.05 && A.eta.ap > 0.5 && A.eta.ap < 0.56, JSON.stringify(A));
  const ghz0 = B.get('Feed horn, 24 GHz', 'mmw.ghz');
  const rows = B.sweep('Feed horn, 24 GHz', 'mmw.ghz', parseValues('22:26:3'), b => ({ G: b.antenna('GRIN lens').Gdbi }));
  assert.equal(rows.length, 3);
  assert.ok(rows[0].value === 22 && rows[2].value === 26 && rows[2].G > rows[0].G, JSON.stringify(rows));
  assert.equal(B.get('Feed horn, 24 GHz', 'mmw.ghz'), ghz0, 'put back');
  assert.deepEqual(parseValues('1,2.5,4'), [1, 2.5, 4]);
  assert.throws(() => B.screen('nothing of that name'), /No part called/);
  assert.throws(() => B.rf(), /No assembly/);
  // the RF designer's figures for an assembly, at its design frequency and another
  const D = await openBench({ format: 'jekray', version: 1, elements: [{ type: 'lens', id: 'L', name: 'L', x: 0, y: 0, angle: 0, diameter: 120, asphere: true,
    surfaces: [{ R: 104, k: -2.7 }, { R: null }], gaps: [30], materials: [{ glass: 'PLA' }], mmw: { part: true }, group: 'g' }],
    assemblies: [{ id: 'g', name: 'RF', ref: 'L', kind: 'rf', rf: { ghz: 24, feed: { kind: 'corrugated', a: 15, L: 80, d: 150 }, goal: { kind: 'collimate', d: 300 } } }] });
  const r = D.rf(), r2 = D.rf('RF', 26);
  assert.ok(r.ghz === 24 && r.gain > 25 && r.gain < 32 && r.eff > 0 && r.eff < 1 && r2.ghz === 26 && r2.gain !== r.gain, JSON.stringify([r, r2]));
  assert.ok(D.rfBand().mid.ghz === 24);
});

test('the command line prints the same figures as JSON, and a sweep as CSV', () => {
  const out = JSON.parse(execFileSync(process.execPath, [CLI, 'antenna', DEMO, 'GRIN lens'], { encoding: 'utf8' }));
  assert.ok(Math.abs(out.Gdbi - 25.31) < 0.05, out.Gdbi);
  const csv = execFileSync(process.execPath, [CLI, 'sweep', DEMO, 'Feed horn, 24 GHz', 'mmw.ghz', '22:26:3', '--read', 'antenna:GRIN lens', '--csv'], { encoding: 'utf8' }).trim().split('\n');
  assert.equal(csv.length, 4);
  assert.ok(csv[0].startsWith('value,GRIN lens.Gdbi') && csv[1].startsWith('22,') && csv[3].startsWith('26,'), csv[0]);
  const help = execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.ok(/Commands: trace/.test(help));
});
