/* The designers' work as JEKrayPro's (ui/pro.js): the reason given for each case of the account's own. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// designWhyOf is a pure function: read it from the module's source, without the page it needs to load
const src = readFileSync(new URL('../../src/ui/pro.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function designWhyOf'), src.indexOf('export const designWhy ='));
const designWhyOf = new Function(body.replace('export ', '') + '\nreturn designWhyOf;')();

test('the designers’ work is open with a plan, and says how to get one without', () => {
  assert.equal(designWhyOf('', 'optimise a design'), '');
  assert.equal(designWhyOf('Sign in, top right, to use the cloud', 'optimise a design'), 'Sign in with JEKrayPro, top right, to optimise a design');
  assert.equal(designWhyOf('Needs JEKrayPro: subscribe from the account menu, or join a team with a plan', 'save drawings'),
    'JEKrayPro is needed to save drawings: subscribe from the account menu, or join a team with a plan');
});

test('each piece of the designers’ work asks for JEKrayPro before it is done, and the open parts do not', () => {
  const read = p => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');
  const lw = read('ui/lens-workspace.js'), lt = read('ui/lens-tolerance.js'), ld = read('ui/lens-drawing.js'), rw = read('ui/rf-workspace.js'), zx = read('io/zmx-export.js');
  assert.match(lw, /export function optStart\(mode, opts\) \{\n  if \(!WS\) return false;\n  if \(!designPro\(/);
  assert.match(lw, /designPro\('save a design report'\)/);
  assert.match(lt, /export function tolStart\(mode, ctx\) \{\n  if \(!designPro\('tolerance a design'\)\)/);
  assert.match(ld, /export function saveDrawingSvg\(asm, i\) \{\n  if \(!designPro\('save drawings'\)\)/);
  assert.match(ld, /export async function saveDrawingsPdf\(asm, i\) \{\n  if \(!designPro\('save drawings'\)\)/);
  assert.match(rw, /function rwOptGo\(asm\) \{\n  if \(!designPro\('optimise a design'\)\)/);
  assert.match(rw, /function rwMcGo\(asm\) \{\n  if \(!designPro\('tolerance a design'\)\)/);
  assert.match(rw, /designPro\('save a design report'\)/);
  assert.match(zx, /if \(asmOfSelection\(selection\(\)\) && !designPro\('export a design'\)\) return;/);
  // the RF designer's way to a lens that can be made and quoted, and the coating designer, are open to all
  for (const fn of ['rwSynthCard', 'rwMakeCard', 'rwApplySynth']) { const i = rw.indexOf('function ' + fn + '('), j = rw.indexOf('\nfunction ', i + 10); assert.ok(i >= 0 && !/designPro\(/.test(rw.slice(i, j)), fn + ' is not gated'); }
  assert.ok(!/pro\.js/.test(read('ui/coat-workspace.js')), 'the coating designer is not gated');
});
