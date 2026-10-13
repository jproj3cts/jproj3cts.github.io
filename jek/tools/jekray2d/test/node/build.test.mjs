import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build, lint, PAGE, order, stripModule, mainModule, devPage, MAIN, DEV_PAGE } from '../../build.mjs';

test('every module imports what it uses from where it is declared', () => {
  const { errors } = lint();
  assert.deepEqual(errors, []);
});
test('the built page is the one committed', () => {
  assert.equal(build(), fs.readFileSync(PAGE, 'utf8'), 'jek/tools/jekray2d.html is out of date: run node build.mjs');
});
test('the dev page and its entry module are current', () => {
  assert.equal(fs.readFileSync(MAIN, 'utf8'), mainModule());
  assert.equal(fs.readFileSync(DEV_PAGE, 'utf8'), devPage());
});
test('the build drops import lines and export keywords and nothing else', () => {
  const src = "import { a } from './a.js';\n// Shared mutable state read or set here, not yet imported (see state/shared.md): b\n\nexport const x = 1;\nfunction f() { return 'export '; }\n";
  assert.equal(stripModule(src), "const x = 1;\nfunction f() { return 'export '; }\n");
  assert.equal(stripModule("const y = 2;\n"), "const y = 2;\n");
});
test('order.json lists every module once, and every module exists', () => {
  const files = order();
  assert.equal(new Set(files).size, files.length);
  for (const f of files) assert.ok(fs.existsSync(new URL('../../src/' + f, import.meta.url)), f);
});
