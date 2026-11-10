// What a free account is needed for in JEKion: flying the ions and saving the .jekion file (as well as the exports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = f => fs.readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
const body = (text, name) => { const i = text.indexOf('function ' + name + '('); assert.ok(i >= 0, name + ' is there'); return text.slice(i, text.indexOf('\n}', i)); };

test('saving the .jekion file asks for an account before anything is downloaded', () => {
  const b = body(src('io/open.js'), 'saveFile');
  assert.ok(b.indexOf("accountGate('save the bench as a file')") >= 0 && b.indexOf('accountGate(') < b.indexOf('downloadFile('), b);
});
test('the ions fly only for someone signed in: asked or not, nothing is sent to be flown before the account is looked at', () => {
  const sim = src('ui/sim.js'), fly = body(sim, 'flyNow'), bar = body(sim, 'flyBar');
  assert.ok(fly.indexOf('flyBar()') >= 0 && fly.indexOf('flyBar()') < fly.indexOf("iwRequest('fly'"), 'flyNow looks at the account first');
  assert.match(fly, /if \(asked\) accountGate\('fly the ions'\)/, 'pressed, it says what is needed');
  assert.match(bar, /a\.signedIn\) return ''/, 'signed in, it flies');
  assert.match(bar, /TEST_MODE\) return ''/, 'the tests fly');
});
test('the Fly and Save controls carry the Free account badge', () => {
  const page = fs.readFileSync(new URL('../../page.html', import.meta.url), 'utf8');
  assert.match(page, /id="btnFly"[^>]*data-need="account" data-what="fly the ions"/);
  assert.match(page, /id="btnSave"[^>]*data-need="account" data-what="save the bench as a file"/);
});
