/* A part's own colours (core/part-colours.js): what is kept as a colour, how opaque a CSS colour is, and the
   colour that stands in for another at its opacity; and that an element keeps lineColour / fillColour only when
   they are set, so a bench from before them loads as it was. The stand-ins for the page are as in parts.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/core/constants.js';
import { workerShim } from '../../src/worker/shim.js';
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const { partHex, colourAlpha, partTint } = await import('../../src/core/part-colours.js');
const { PART_ORDER } = await import('../../src/parts/registry.js');
const { normElement, demoProject } = await import('../../src/state/elements.js');

test('a part\'s colour is "#rrggbb" in lower case, or nothing', () => {
  assert.equal(partHex('#B0005A'), '#b0005a');
  assert.equal(partHex(' #abc '), '#aabbcc');
  for (const v of ['red', '#12', '#1234567', 'rgb(1,2,3)', '', null, undefined, 12, {}, '#ggg']) assert.equal(partHex(v), '', String(v));
});
test('how opaque a colour is, read from its text', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' is not ' + b);
  for (const [c, a] of [['#fff', 1], ['#2b3338', 1], ['#9ad0ff29', 0x29 / 255], ['#0008', 8 / 15], ['rgb(1,2,3)', 1], ['rgba(115,185,202,0.16)', 0.16], ['rgba(115, 185, 202, .5)', 0.5],
    ['rgb(1 2 3 / 25%)', 0.25], ['hsla(10, 50%, 50%, 0.3)', 0.3], ['hsl(10 50% 50%)', 1], ['transparent', 0], ['rgba(0,0,0,0)', 0], ['white', 1], ['rgba(1,2,3,7)', 1]]) near(colourAlpha(c), a);
  near(colourAlpha({ addColorStop() {} }), 1);            // a gradient or a pattern: opaque
});
test('the colour standing in for another keeps its opacity; nothing stays nothing', () => {
  assert.equal(partTint('#9fb1b8', '#b0005a'), '#b0005a');
  assert.equal(partTint('rgba(115,185,202,0.16)', '#0050b0'), 'rgba(0,80,176,0.16)');
  assert.equal(partTint('#9ad0ff80', '#000000'), 'rgba(0,0,0,0.502)');
  assert.equal(partTint('transparent', '#000000'), 'transparent');
  assert.equal(partTint('rgba(9,9,9,0)', '#ffffff'), 'rgba(9,9,9,0)');
  assert.equal(partTint({ addColorStop() {} }, '#ffffff'), '#ffffff');
  assert.equal(partTint('rgba(115,185,202,0.16)', '#0050b0'), 'rgba(0,80,176,0.16)');      // (and again, from its memo)
  assert.equal(colourAlpha(partTint('rgba(1,2,3,0.37)', '#abcdef')), 0.37);
});
test('every part keeps a line and a fill colour when given, and has neither field when not', () => {
  demoProject();
  for (const t of PART_ORDER) {
    const base = { type: t, name: 'x', x: 1, y: 2, angle: 3 };
    const plain = normElement(base);
    assert.ok(plain, t);
    assert.ok(!('lineColour' in plain) && !('fillColour' in plain), t + ' has no colour of its own unless given one');
    const col = normElement(Object.assign({}, base, { lineColour: '#B0005A', fillColour: '#abc' }));
    if (t === 'draw') { assert.ok(!('lineColour' in col) && !('fillColour' in col), 'a drawing has its own colours'); continue; }
    assert.equal(col.lineColour, '#b0005a', t); assert.equal(col.fillColour, '#aabbcc', t);
    assert.deepEqual(normElement(col), col, t + ' is left alone when normalised again');
    const { lineColour, fillColour, id: i1, ...rest } = col, { id: i0, ...was } = plain;
    assert.deepEqual(rest, was, t + ' is otherwise the same part');
    const bad = normElement(Object.assign({}, base, { lineColour: 'red', fillColour: 7 }));
    assert.ok(!('lineColour' in bad) && !('fillColour' in bad), t + ' drops what is not a colour');
  }
});
