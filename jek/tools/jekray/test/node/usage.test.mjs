// Usage counts: every event the app counts is one the API takes (jek-api src/usage.js EVENTS),
// and the module sends nothing that could say who: no credentials, no ids, nothing from an embed or the tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url)), src = join(here, '../../src'), api = join(here, '../../../../../jek-api/src/usage.js');
const files = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.js') ? [join(d, f)] : []);

test('every counted event is on the API’s list, and every button counted is on the page', () => {
  const allowed = new Set([...readFileSync(api, 'utf8').match(/EVENTS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]));
  const used = new Set();
  for (const f of files(src)) for (const m of readFileSync(f, 'utf8').matchAll(/\btrack\('([a-z]+)'/g)) used.add(m[1]);
  const usage = readFileSync(join(src, 'io/usage.js'), 'utf8'), page = readFileSync(join(here, '../../page.html'), 'utf8');
  const clicks = usage.match(/USAGE_CLICKS = \{([\s\S]*?)\};/)[1];
  // a button in the page's markup, or one the page makes (the rail's Add part: id: 'btnAddPart' in its module)
  const made = files(src).map(f => readFileSync(f, 'utf8')).join('\n');
  for (const m of clicks.matchAll(/(\w+): \['([a-z]+)'/g)) { used.add(m[2]); assert.ok(page.includes(`id="${m[1]}"`) || made.includes(`id: '${m[1]}'`), `${m[1]} is not on the page`); }
  for (const e of used) assert.ok(allowed.has(e), `the API does not take '${e}'`);
  assert.ok(used.size >= 20);
});

test('the counts go without credentials, as plain text, and not from an embed, the tests or a browser that says no', () => {
  const u = readFileSync(join(src, 'io/usage.js'), 'utf8');
  assert.match(u, /credentials: 'omit'/);
  assert.match(u, /'Content-Type': 'text\/plain'/);
  assert.match(u, /const usageOn = \(\) => !TEST_MODE && !EMBED && !usageBrowserSaysNo\(\) && !usageOff\(\);/);
  assert.match(u, /globalPrivacyControl === true/);
  assert.match(u, /doNotTrack === '1'/);
  assert.doesNotMatch(u, /document\.cookie|crypto\.randomUUID|getRandomValues/);
});

test('people are counted without an id: a browser marks only the first visit of its day, week and month, and its first ever', async () => {
  const { visitorMarks } = await import('../../src/core/src-tag.js');
  const t = Date.parse('2026-10-26T10:00:00Z'), a = visitorMarks(t, null);
  assert.deepEqual(a.marks, ['new', 'day', 'week', 'month']);
  assert.deepEqual(a.seen, { d: '2026-10-26', w: '2026-W44', m: '2026-10' });
  assert.deepEqual(visitorMarks(t + 3600e3, a.seen).marks, [], 'again the same day: nothing');
  assert.deepEqual(visitorMarks(Date.parse('2026-10-27T09:00:00Z'), a.seen).marks, ['day'], 'the next day, same week and month');
  assert.deepEqual(visitorMarks(Date.parse('2026-11-02T09:00:00Z'), a.seen).marks, ['day', 'week', 'month']);
  assert.equal(visitorMarks(Date.parse('2027-01-01T00:00:00Z'), null).seen.w, '2026-W53');
  // what is kept and sent holds no id: dates only
  assert.deepEqual(Object.keys(a.seen).sort(), ['d', 'm', 'w']);
});
