// JEKsuite's page is built from its sources and committed: it must be current, and its modules pass the lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEV_PAGE, MAIN, PAGE, build, devPage, lint, mainModule, order } from '../../build.mjs';

test('the lint passes: unique names, imports from where they are declared, nothing run at load but boot.js', () => {
  const { errors } = lint();
  assert.deepEqual(errors, []);
});
test('jeksuite.html, its dev page and main.js are current (node build.mjs)', () => {
  assert.equal(fs.readFileSync(PAGE, 'utf8') === build(), true, 'jeksuite.html is out of date');
  assert.equal(fs.readFileSync(DEV_PAGE, 'utf8'), devPage());
  assert.equal(fs.readFileSync(MAIN, 'utf8'), mainModule());
});
test('it shares only JEKray modules that reach no bench (constants, hooks, the source tag, elements, merging, usage counts, the account)', () => {
  const shared = order().filter(f => f.startsWith('../')).map(f => f.replace(/^(\.\.\/)+jekray\/src\//, ''));
  assert.deepEqual(shared.sort(), ['core/constants.js', 'core/hooks.js', 'core/src-tag.js', 'io/account.js', 'io/merge.js', 'io/usage.js', 'ui/dom.js']);
});
test('a bench opens in its own app, in that app’s named tab', async () => {
  const dom = fs.readFileSync(new URL('../../src/ui/dom.js', import.meta.url), 'utf8');
  assert.match(dom, /id: 'jekray', name: 'JEKray', url: '\/jek\/tools\/jekray\.html', tab: 'jekray'/);
  assert.match(dom, /id: 'jekion', name: 'JEKion', url: '\/jek\/tools\/jekion\.html', tab: 'jekion'/);
  const home = fs.readFileSync(new URL('../../src/ui/home.js', import.meta.url), 'utf8');
  assert.match(home, /openApp\(tool \|\| 'jekray', 'cloud=' \+ id/);
});
