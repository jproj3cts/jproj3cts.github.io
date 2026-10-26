// Instagram visitors: who is shown the reels' benches (core/src-tag.js fromIgTag), that each listed bench opens
// (ui/reels.js), when the note on a bench worked on may show (core/nudge.js workDue), and that every step the app
// counts against a visit's source is a column of the usage report's By source table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromIgTag, srcTag } from '../../src/core/src-tag.js';
import { WORK_EDITS, WORK_MS, workDue } from '../../src/core/nudge.js';
import { REELS } from '../../src/ui/reels.js';
import { STEPS, funnel } from '../../../../../jek-api/scripts/usage.mjs';

const here = fileURLToPath(new URL('.', import.meta.url)), src = join(here, '../../src'), demos = join(here, '../../../demos');
const files = d => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.js') ? [join(d, f)] : []);

test('the Instagram note: a tag starting ig, or Instagram as the referrer, and nothing else', () => {
  for (const [q, r] of [['?src=ig-bio', ''], ['?src=IG-Michelson', ''], ['?src=ig', ''], ['', 'https://l.instagram.com/?u=x'], ['', 'https://www.instagram.com/']])
    assert.equal(fromIgTag(srcTag(q, r)), true, q + ' ' + r);
  for (const [q, r] of [['', ''], ['?src=fb-post', ''], ['?src=newsletter', 'https://instagram.com/'], ['', 'https://facebook.com/'], ['?src=big', ''], ['?probe=ig', '']])
    assert.equal(fromIgTag(srcTag(q, r)), false, q + ' ' + r);
});

test('every reel listed opens: a short unique id, a title and a line, and an example that exists or a bench', () => {
  const news = readFileSync(join(src, 'ui/news.js'), 'utf8');
  const examples = new Set([...news.match(/EXAMPLES = \[([\s\S]*?)\n\];/)[1].matchAll(/\['([a-z0-9-]+)', '/g)].map(m => m[1]));
  assert.ok(REELS.length > 0);
  assert.equal(new Set(REELS.map(r => r.id)).size, REELS.length, 'ids are unique');
  for (const r of REELS) {
    assert.match(r.id, /^[a-z0-9-]{1,24}$/, r.id);
    assert.ok(r.title && r.line, r.id + ' has a title and a line');
    assert.ok(!!r.demo !== !!r.bench, r.id + ': a demo or a bench, one of them');
    if (r.demo) {
      assert.ok(examples.has(r.demo), r.demo + ' is not in EXAMPLES');
      for (const f of [r.demo + '.jekray', 'thumbs/' + r.demo + '.webp', 'thumbs/light/' + r.demo + '.webp']) assert.ok(existsSync(join(demos, f)), f + ' is missing');
    } else assert.ok(r.bench.format !== undefined && Array.isArray(r.bench.elements), r.id + ' is a .jekray bench');
  }
});

test('the note on a bench worked on: signed out, not asked yet, a few edits or a minute, never over a drag', () => {
  const due = o => workDue(Object.assign({ on: true, signedOut: true, asked: false, parts: 4, edits: WORK_EDITS, since: 5000, busy: false }, o));
  assert.equal(due({}), 'now');
  assert.equal(due({ edits: 1, since: 1000 }), 'later', 'one edit, just now: wait for more, or the minute');
  assert.equal(due({ edits: 1, since: WORK_MS }), 'now', 'a minute after the first edit');
  assert.equal(due({ busy: true }), 'later', 'mid-drag, a dialog or another prompt: looked at again');
  assert.equal(due({ edits: 0 }), '', 'nothing changed');
  assert.equal(due({ signedOut: false }), '', 'signed in, or not known yet');
  assert.equal(due({ asked: true }), '', 'once a session');
  assert.equal(due({ on: false }), '', 'no accounts here: an embed or the tests');
  assert.equal(due({ parts: 0 }), '', 'an empty bench');
});

test('every step counted against a source is a column of By source, the funnel steps among them', () => {
  const used = new Set();
  for (const f of files(src)) for (const m of readFileSync(f, 'utf8').matchAll(/\bgoal\('([a-z-]+)'\)/g)) used.add(m[1]);
  for (const k of ['landing', 'landing-open', 'edit', 'ask', 'ask-yes', 'account']) assert.ok(used.has(k), k + ' is not counted');
  for (const k of used) { assert.ok(STEPS.includes(k), 'the report has no column for ' + k); assert.match('ig-michelson-post-2024.' + k, /^[a-z0-9][a-z0-9_.+-]{0,39}$/); }
  const rows = funnel({ events: [{ event: 'from', prop: 'ig-bio', n: 10 }, { event: 'goal', prop: 'ig-bio.landing', n: 9 }, { event: 'goal', prop: 'ig-bio.landing-open', n: 4 }, { event: 'goal', prop: 'ig-bio.ask-yes', n: 1 }] });
  assert.deepEqual([rows[0].visits, rows[0].steps.landing, rows[0].steps['landing-open'], rows[0].steps['ask-yes']], [10, 9, 4, 1]);
});
