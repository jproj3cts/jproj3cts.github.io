// JEKfilm's page is built from its sources and committed: it must be current, and its modules pass the lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEV_PAGE, MAIN, PAGE, build, devPage, lint, mainModule, order } from '../../build.mjs';

const src = f => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
test('the lint passes: unique names, imports from where they are declared, nothing run at load but boot.js', () => {
  const { errors } = lint();
  assert.deepEqual(errors, []);
});
test('jekfilm.html, its dev page and main.js are current (node build.mjs)', () => {
  assert.equal(fs.readFileSync(PAGE, 'utf8') === build(), true, 'jekfilm.html is out of date');
  assert.equal(fs.readFileSync(DEV_PAGE, 'utf8'), devPage());
  assert.equal(fs.readFileSync(MAIN, 'utf8'), mainModule());
});
test('it shares only JEKray modules that reach no bench: the thin-film physics, constants, hooks, usage counts, the account and its gates', () => {
  const shared = order().filter(f => f.startsWith('../')).map(f => f.replace(/^(\.\.\/)+jekray\/src\//, ''));
  assert.deepEqual(shared.sort(), ['core/coatdesign.js', 'core/coatings.js', 'core/constants.js', 'core/hooks.js', 'core/metals.js', 'core/numeric.js', 'core/src-tag.js', 'io/account.js', 'io/usage.js', 'ui/dom.js', 'ui/pro.js']);
});
test('saving a file, saving to the cloud and optimising are JEKrayPro’s, each gated first; exporting the curves a free account’s', () => {
  assert.match(src('io/files.js'), /export function saveFilmFile\(\) \{\n {2}if \(!designPro\('save a coating file'\)\) return false;/);
  assert.match(src('io/files.js'), /export function exportCurves\(\) \{\n {2}if \(!accountGate\('export the curves'\)\) return;/);
  assert.match(src('io/cloud.js'), /export async function saveToCloud\(\) \{\n {2}if \(!designPro\('save to the cloud'\)\) return;/);
  assert.match(src('ui/designer.js'), /if \(!designPro\('optimise a coating'\)\) return null;\n {2}const o = coatOptimise/);
  // every file made on the page goes through one of those: downloadBlob is declared once and called twice
  const all = order().filter(f => !f.startsWith('../')).map(src).join('\n');
  assert.equal((all.match(/downloadBlob\(/g) || []).length, 3);
  assert.equal((all.match(/coatOptimise\(/g) || []).length, 1);
});
test('a coating from the cloud that is another app’s opens in that app, in its named tab', () => {
  assert.match(src('io/cloud.js'), /jekray: \['\/jek\/tools\/jekray\.html', 'jekray'/);
  assert.match(src('io/cloud.js'), /jekion: \['\/jek\/tools\/jekion\.html', 'jekion'/);
});
