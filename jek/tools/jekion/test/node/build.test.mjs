import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build, lint, PAGE, order, mainModule, workerModule, devPage, MAIN, WORKER_MAIN, DEV_PAGE, isShared } from '../../build.mjs';

test('every module imports what it uses from where it is declared, across JEKion’s and JEKray’s shared modules', () => {
  const { errors } = lint();
  assert.deepEqual(errors, []);
});
test('the built page is the one committed', () => {
  assert.equal(build(), fs.readFileSync(PAGE, 'utf8'), 'jek/tools/jekion.html is out of date: run node build.mjs');
});
test('the dev page and its entry modules are current', () => {
  assert.equal(fs.readFileSync(MAIN, 'utf8'), mainModule());
  assert.equal(fs.readFileSync(WORKER_MAIN, 'utf8'), workerModule());
  assert.equal(fs.readFileSync(DEV_PAGE, 'utf8'), devPage());
});
test('order.json lists every module once, every module exists, and the shared ones are JEKray’s', () => {
  const files = order();
  assert.equal(new Set(files).size, files.length);
  for (const f of files) assert.ok(fs.existsSync(new URL('../../src/' + f, import.meta.url)), f);
  assert.ok(files.filter(isShared).length >= 8, 'JEKray’s modules are shared, not copied');
});
