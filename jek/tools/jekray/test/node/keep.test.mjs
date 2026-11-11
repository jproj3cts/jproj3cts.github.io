// Nothing is kept without an account (ui/pro.js keepHere): who may keep work in the browser, and that every place
// an app writes its work there asks first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hooks } from '../../src/core/hooks.js';
import { keepHere } from '../../src/ui/pro.js';

const TOOLS = new URL('../../../', import.meta.url);
const src = f => fs.readFileSync(new URL(f, TOOLS), 'utf8');
const fnBody = (text, name) => { const i = text.indexOf('function ' + name + '('); assert.ok(i >= 0, name + ' is there'); return text.slice(i, text.indexOf('\n}', i)); };

test('work is kept in the browser with no accounts here, or signed in; not signed out for sure, nor while the account is still looked up', () => {
  const was = hooks.account, perf = globalThis.performance, at = t => { Object.defineProperty(globalThis, 'performance', { value: { now: () => t }, configurable: true }); };
  try {
    at(1000);
    hooks.account = () => ({ on: false, signedIn: false, known: false }); assert.equal(keepHere(), true, 'no accounts here');
    hooks.account = () => ({ on: true, signedIn: true, known: true }); assert.equal(keepHere(), true, 'signed in');
    hooks.account = () => ({ on: true, signedIn: false, known: true }); assert.equal(keepHere(), false, 'signed out');
    hooks.account = () => ({ on: true, signedIn: false, known: false }); assert.equal(keepHere(), false, 'the account still looked up');
    at(9000); assert.equal(keepHere(), true, 'the API has not answered: kept, as an export is let through');
    hooks.account = () => ({ on: true, signedIn: false, known: true }); assert.equal(keepHere(), false, 'signed out, however long the page has been open');
  } finally { hooks.account = was; Object.defineProperty(globalThis, 'performance', { value: perf, configurable: true }); }
});

test('JEKray: the autosave, the earlier versions and Open recent each ask before they write', () => {
  const auto = src('jekray/src/io/autosave.js');
  const save = fnBody(auto, 'scheduleSave'), snap = fnBody(auto, 'keepSnapshot'), recent = fnBody(src('jekray/src/io/recent.js'), 'noteRecent');
  assert.ok(save.indexOf('keepHere()') >= 0 && save.indexOf('keepHere()') < save.indexOf('localStorage.setItem('), 'scheduleSave');
  assert.match(save, /if \(!keepHere\(\)\) \{ workChanged\(\);/, 'a skipped autosave is told to the sign');
  assert.ok(snap.indexOf('keepHere()') >= 0 && snap.indexOf('keepHere()') < snap.indexOf('localStorage.setItem('), 'keepSnapshot');
  assert.ok(recent.indexOf('keepHere()') >= 0 && recent.indexOf('keepHere()') < recent.indexOf('localStorage.setItem('), 'noteRecent');
});

test('JEKion, JEKfilm and JEKcad: each autosave asks before it writes; the work handed to a sign-in is still written', () => {
  const ion = src('jekion/src/io/open.js'), ionSave = fnBody(ion, 'scheduleSave');
  assert.ok(ionSave.indexOf('keepHere()') >= 0 && ionSave.indexOf('keepHere()') < ionSave.indexOf('localStorage.setItem('), 'JEKion scheduleSave');
  assert.match(ion, /addEventListener\('beforeunload', \(\) => \{ if \([^)]*keepHere\(\)\)/, 'JEKion on leaving');
  const film = fnBody(src('jekfilm/src/io/files.js'), 'filmKeepNow');
  assert.ok(film.indexOf('keepHere()') >= 0 && film.indexOf('keepHere()') < film.indexOf('localStorage.setItem('), 'JEKfilm filmKeepNow');
  assert.match(src('jekfilm/src/io/film-account.js'), /keepWork: \(\) => filmKeepNow\(true\)/, 'JEKfilm hands over');
  const cad = fnBody(src('jekcad/src/io/files.js'), 'scheduleSave');
  assert.ok(cad.indexOf('keepHere()') >= 0 && cad.indexOf('keepHere()') < cad.indexOf('localStorage.setItem('), 'JEKcad scheduleSave');
  for (const [f, key] of [['jekray/src/io/nudges.js', 'STORE_KEY'], ['jekion/src/io/ion-account.js', 'ION_STORE_KEY'], ['jekcad/src/io/cad-account.js', 'CAD_STORE_KEY']])
    assert.match(src(f), new RegExp('keepWork: \\(\\) => \\{ if \\(!EMBED\\) try \\{[^}]*localStorage\\.setItem\\(' + key), f + ' hands over');
});

test('the sign beside Save is made only for someone signed out for sure, in an app whose Save needs an account or a plan', () => {
  const sign = fnBody(src('jekray/src/ui/pro.js'), 'keepSign');
  assert.match(sign, /a\.on && a\.known && !a\.signedIn && save && save\.dataset\.need/);
  assert.match(sign, /hooks\.exportSignIn\('keep your work'\)/);
  for (const f of ['jekray/page.html', 'jekion/page.html', 'jekfilm/page.html']) assert.match(src(f), /id="btnSave"[^>]*data-need="(account|pro)"/, f);
});
