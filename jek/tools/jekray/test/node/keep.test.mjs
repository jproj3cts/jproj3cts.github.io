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

test('work is kept in the browser signed in or not (signed out too, so a bench shown to someone survives a reload)', () => {
  const was = hooks.account;
  try {
    for (const a of [{ on: false, signedIn: false, known: false }, { on: true, signedIn: true, known: true }, { on: true, signedIn: false, known: true }, { on: true, signedIn: false, known: false }]) {
      hooks.account = () => a;
      assert.equal(keepHere(), true, JSON.stringify(a));
    }
  } finally { hooks.account = was; }
  // the one switch that would turn signed-out keeping off again
  assert.match(src('jekray/src/ui/pro.js'), /const KEEP_SIGNED_OUT = true;/);
});

test('JEKray: the autosave, the earlier versions and Open recent each ask before they write', () => {
  const auto = src('jekray/src/io/autosave.js');
  const save = fnBody(auto, 'scheduleSave'), snap = fnBody(auto, 'keepSnapshot'), recent = fnBody(src('jekray/src/io/recent.js'), 'noteRecent');
  assert.ok(save.indexOf('keepHere()') >= 0 && save.indexOf('keepHere()') < save.indexOf('localStorage.setItem('), 'scheduleSave');
  assert.match(save, /if \(!keepHere\(\)\) \{ workChanged\(\);/, 'a skipped autosave is told to the sign');
  assert.ok(snap.indexOf('keepHere()') >= 0 && snap.indexOf('keepHere()') < snap.indexOf('localStorage.setItem('), 'keepSnapshot');
  assert.ok(recent.indexOf('keepHere()') >= 0 && recent.indexOf('keepHere()') < recent.indexOf('localStorage.setItem('), 'noteRecent');
});

test('JEKray: Open recent lists kept files only where keepHere allows, and Earlier versions is open to all', () => {
  const fill = fnBody(src('jekray/src/io/recent.js'), 'fillRecent');
  assert.match(fill, /out = !keepHere\(\), list = readRecent\(\)\.filter\(r => !out \|\| r\.kind === 'example'\)/);
  assert.match(src('jekray/src/ui/news.js'), /getElementById\('btnSnaps'\)\.addEventListener\('click', \(\) => \{ fill\(\); dlg\.showModal\(\); \}\)/);
  assert.doesNotMatch(src('jekray/page.html'), /id="btnSnaps"[^>]*data-need=/);
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
