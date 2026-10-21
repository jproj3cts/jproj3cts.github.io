// Sign-up prompts: when the return-visit card may show (core/nudge.js), the one weekly cap they share, and every
// prompt counted under a where-name the usage report knows, as a token the API takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NUDGE_DAYS, nudgeCapOk, returnDue } from '../../src/core/nudge.js';

const DAY = 864e5, NOW = Date.UTC(2026, 9, 21, 12);
const due = o => returnDue(Object.assign({ on: true, restored: true, again: false, signedOut: true, parts: 3, busy: false, arrived: '&', last: 0, now: NOW }, o));

test('the return-visit card: a bench restored on a later visit, signed out, with parts, nothing else up', () => {
  assert.equal(due({}), true);
  assert.equal(due({ restored: false }), false, 'a fresh bench (the demo) is not restored');
  assert.equal(due({ again: true }), false, 'a reload in the same session');
  assert.equal(due({ signedOut: false }), false, 'signed in, or not known yet (the API out of reach)');
  assert.equal(due({ parts: 0 }), false, 'an empty bench');
  assert.equal(due({ busy: true }), false, 'the welcome note, a tour, another prompt or a dialog up');
  assert.equal(due({ on: false }), false, 'no accounts here: an embed or the tests');
});
test('not over a link that opens something of its own', () => {
  for (const a of ['#p=zABC&', '#s=ABCDEFGHIJ&', '#demo=michelson&', '&?demo=michelson', '#tour=focus&', '#examples&', '#pro&', '#benches&', '&?pack=https://x', '&?jekinvite=t', '&?jekauth=signed_in', '&?jekbilling=success'])
    assert.equal(due({ arrived: a }), false, a);
  for (const a of ['&', '&?src=ig-spectrometer', '#&', '&?probe=1']) assert.equal(due({ arrived: a }), true, a);
});
test('one cap for all of them: once a week', () => {
  assert.equal(NUDGE_DAYS, 7);
  assert.equal(nudgeCapOk(null, NOW), true);
  assert.equal(nudgeCapOk('', NOW), true);
  assert.equal(nudgeCapOk(String(NOW - 6.9 * DAY), NOW), false);
  assert.equal(nudgeCapOk(String(NOW - 7 * DAY), NOW), true);
  assert.equal(nudgeCapOk('nonsense', NOW), true);
  assert.equal(due({ last: String(NOW - DAY) }), false);
  assert.equal(due({ last: String(NOW - 8 * DAY) }), true);
});

const here = fileURLToPath(new URL('.', import.meta.url)), src = join(here, '../../src');
const files = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.js') ? [join(d, f)] : []);
test('every prompt is counted as <where>.<answer>, a token the API takes, under a where the report names', () => {
  const token = new RegExp(readFileSync(join(here, '../../../../../jek-api/src/usage.js'), 'utf8').match(/const TOKEN = \/(.+)\/i;/)[1], 'i');
  const names = readFileSync(join(here, '../../../../../jek-api/scripts/usage.mjs'), 'utf8').match(/PROMPT_NAMES = \{([^}]*)\}/)[1];
  const known = new Set([...names.matchAll(/(\w+):/g)].map(m => m[1]));
  const wheres = new Set(), props = [];
  for (const f of files(src)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/track\('prompt', '([^']+)'\)/g)) props.push(m[1]);
    for (const m of s.matchAll(/(?:signInRow|nudgeCard)\((?:'[a-zA-Z]+', )?'([a-z]+)'/g)) wheres.add(m[1]);
    for (const m of s.matchAll(/track\('prompt', '([a-z]+)\.' \+/g)) wheres.add(m[1]);
  }
  for (const p of props) { assert.match(p, token, p); assert.match(p, /^[a-z]+\.[a-z]+$/, p); wheres.add(p.split('.')[0]); }
  assert.ok(props.length >= 12);
  for (const w of ['share', 'save', 'return', 'shared', 'tour', 'menu']) assert.ok(wheres.has(w), w + ' is not counted');
  for (const w of wheres) assert.ok(known.has(w), 'the usage report does not name the prompt ' + w);
});
