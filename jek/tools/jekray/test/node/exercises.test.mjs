// The exercises (core/exercises.js): each starts from its own bench (core/exercise-benches.js), names parts that are on
// it and measures the optimiser has, gives two hints and a result line; a visit's ?ex= starts the right one, and an
// Instagram link starts none. That each can be solved, and only so, is the browser suite's ('Exercises').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHALLENGES, EXERCISES, checkPasses, checkWant, exerciseArrival, exerciseBench, isChallenge } from '../../src/core/exercises.js';
import { EXERCISE_BENCHES } from '../../src/core/exercise-benches.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const METRICS = new Set([...readFileSync(join(here, '../../src/ui/optimise.js'), 'utf8').matchAll(/\{ key: '([a-zA-Z0-9]+)', fam: '[a-z]+', on: '([a-z]+)'/g)].map(m => m[1] + '@' + m[2]));
const kindOf = e => (e.type === 'fibre' ? 'fibre' : e.type);

test('every exercise and challenge starts from its own bench, and names parts on it and measures they have', () => {
  const ids = new Set();
  for (const ex of [...EXERCISES, ...CHALLENGES]) {
    assert.match(ex.id, /^[a-z0-9][a-z0-9-]{0,47}$/, ex.id);
    assert.ok(!ids.has(ex.id), 'one id each: ' + ex.id); ids.add(ex.id);
    const start = EXERCISE_BENCHES[ex.start.reel];
    assert.ok(start && Array.isArray(start.elements), ex.id + ': its bench');
    const b = exerciseBench(ex, start), on = n => b.elements.find(e => e.name === n);
    assert.equal(new Set(b.elements.map(e => e.id)).size, b.elements.length, ex.id + ': ids apart');
    for (const c of ex.checks) {
      assert.ok(on(c.part), ex.id + ': ' + c.part + ' is on the bench');
      if (c.field) assert.ok(isFinite(on(c.part)[c.field]), ex.id + ': ' + c.part + '.' + c.field + ' is a number');
      else assert.ok(METRICS.has(c.key + '@' + kindOf(on(c.part))), ex.id + ': ' + c.key + ' is measured on a ' + on(c.part).type);
      assert.ok(['above', 'below', 'within'].includes(c.op) && isFinite(c.value) && (c.op !== 'within' || c.tol > 0));
    }
    for (const [n, f] of Object.entries(ex.unlocked)) { assert.ok(on(n), ex.id + ': ' + n); for (const k of f) assert.ok(k in on(n) || k === 'aperture', ex.id + ': ' + n + '.' + k); }
    for (const [n, R] of Object.entries(ex.optimiser || {})) for (const [k, [lo, hi]] of Object.entries(R)) assert.ok((ex.unlocked[n] || []).includes(k) && lo < hi, ex.id + ': the optimiser’s ' + n + '.' + k);
    for (const [n, f] of Object.entries(ex.answer)) for (const k of Object.keys(f)) assert.ok((ex.unlocked[n] || []).includes(k), ex.id + ': the answer changes only what may be');
    assert.equal(ex.hints.length, 2);
    assert.ok(ex.goal && ex.title && (ex.teaches || isChallenge(ex)));
    assert.equal(typeof ex.result(ex.checks.map(c => c.value)), 'string');
    // its own bench is left as it was
    assert.ok(!start.elements.some(e => e.id === 'exs1'));
  }
  assert.equal(EXERCISES.length, 11);
});

test('no challenges for now (the reels’ went with their benches), and only ?ex= starts an exercise', () => {
  assert.deepEqual(CHALLENGES, []);
  assert.ok(!EXERCISES.some(isChallenge));
  assert.deepEqual(Object.keys(EXERCISE_BENCHES).sort(), [...new Set(EXERCISES.map(x => x.start.reel))].sort(), 'a bench for each exercise, and no more');
  assert.deepEqual(exerciseArrival('?ex=close-the-gap'), { id: 'close-the-gap', from: 'link' });
  assert.deepEqual(exerciseArrival('?ex=close-the-gap&src=solved'), { id: 'close-the-gap', from: 'link' });
  assert.equal(exerciseArrival('?src=ig-thread-both-irises'), null, 'an Instagram link opens the Michelson, not an exercise');
  assert.equal(exerciseArrival('?src=ig-bio'), null);
  assert.equal(exerciseArrival('?ex=nothing'), null);
  assert.equal(exerciseArrival(''), null);
});

test('a check passes above, below or within its tolerance, and not without a reading', () => {
  const A = { op: 'above', value: 0.9 }, B = { op: 'below', value: 0.03 }, W = { op: 'within', value: 4, tol: 0.2 };
  assert.ok(checkPasses(A, 0.95) && !checkPasses(A, 0.9) && !checkPasses(A, null));
  assert.ok(checkPasses(B, 0.02) && !checkPasses(B, 0.03));
  assert.ok(checkPasses(W, 3.81) && checkPasses(W, 4.2) && !checkPasses(W, 4.21) && !checkPasses(W, NaN));
  assert.deepEqual([A, B, W].map(checkWant), ['above 0.9', 'below 0.03', '4 ± 0.2']);
});
