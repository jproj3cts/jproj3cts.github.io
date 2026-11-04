/* A bench through a share link and back, in Node: the hash deflates, reads back, refuses JEKray's and damaged ones. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.location = { hostname: '', hash: '', search: '', href: '', origin: '', pathname: '' };
const { shareHash, readShareHash } = await import('../../src/io/share.js');
const { normProject } = await import('../../src/state/elements.js');

test('a bench deflates into a link and reads back the same', async () => {
  const P = normProject({ name: 'Link test', grid: { sym: 'cyl', h: 0.5, x0: -10, x1: 10, y0: 0, y1: 10 }, electrodes: [{ shape: 'tube', rIn: 3, rOut: 4, L: 5, V: 12 }], ions: [{ species: 'Ar+', n: 3 }] });
  const data = JSON.parse(JSON.stringify(P));
  const hash = await shareHash(data);
  assert.equal(hash[0], 'i');
  assert.ok(hash.length < JSON.stringify(data).length);
  assert.deepEqual(await readShareHash(hash), data);
});
test('a JEKray link, a damaged link and a link without a bench are refused with a word', async () => {
  await assert.rejects(readShareHash('zABCDEF'), /JEKray/);
  await assert.rejects(readShareHash('iQUJDREVG'), /damaged/);
  const plain = 'k' + Buffer.from(JSON.stringify({ format: 'jekray' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await assert.rejects(readShareHash(plain), /JEKion bench/);
});
