// JEKcad's page is built from its sources and committed: it must be current, its modules pass the lint, and what it
// shares of JEKray and gates is as the README says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEV_PAGE, MAIN, PAGE, WORKER_MAIN, build, devPage, lint, mainModule, order, workerModule } from '../../build.mjs';

const src = f => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
test('the lint passes: unique names, imports from where they are declared, nothing run at load but boot.js, the layers', () => {
  const { errors } = lint();
  assert.deepEqual(errors, []);
});
test('jekcad.html, its dev page, main.js and worker-main.js are current (node build.mjs)', () => {
  assert.equal(fs.readFileSync(PAGE, 'utf8') === build(), true, 'jekcad.html is out of date');
  assert.equal(fs.readFileSync(DEV_PAGE, 'utf8'), devPage());
  assert.equal(fs.readFileSync(MAIN, 'utf8'), mainModule());
  assert.equal(fs.readFileSync(WORKER_MAIN, 'utf8'), workerModule());
});
test('it shares only JEKray modules that reach no bench: constants, hooks, usage counts, the account and its gates, the worker shim', () => {
  const shared = order().filter(f => f.startsWith('../')).map(f => f.replace(/^(\.\.\/)+jekray\/src\//, ''));
  assert.deepEqual(shared.sort(), ['core/constants.js', 'core/hooks.js', 'core/src-tag.js', 'io/account.js', 'io/usage.js', 'ui/dom.js', 'ui/pro.js', 'worker/shim.js']);
});
test('the kernel is the vendored build, loaded from the site on first use, never a CDN', () => {
  assert.match(src('core/doc.js'), /KERNEL_DIR = '\/jek\/assets\/vendor\/replicad-opencascadejs\/1\.2\.1\/'/);
  assert.ok(fs.existsSync(new URL('../../../../assets/vendor/replicad-opencascadejs/1.2.1/replicad_single.wasm', import.meta.url)));
  const all = order().filter(f => !f.startsWith('../')).map(src).join('\n');
  assert.doesNotMatch(all, /https?:\/\/(cdn|unpkg|esm\.sh|jsdelivr)/);
});
test('exports (STEP, STL) need a free account, gated first; saving the .jekcad needs none; the cloud is JEKrayPro’s', () => {
  assert.match(src('io/files.js'), /export async function exportParts\(fmt, ids\) \{\n {2}if \(!accountGate\('export ' \+/);
  assert.doesNotMatch(src('io/files.js').match(/export function saveFile\(\) \{[\s\S]*?\n\}/)[0], /accountGate|designPro/);
  assert.match(src('io/cloud.js'), /if \(!designPro\('save to the cloud'\)\) return;/);
  const all = order().filter(f => !f.startsWith('../')).map(src).join('\n');
  // a drawing's PDF is an export too: gated first
  assert.match(src('io/files.js'), /export function exportPdf\(\) \{\n {2}if \(!accountGate\('export a PDF'\)\) return false;/);
  // every file made on the page goes through downloadFile: the .jekcad, the exports and the PDF
  assert.equal((all.match(/downloadFile\(/g) || []).length, 4);
});
