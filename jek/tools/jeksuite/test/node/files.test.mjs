// The file system's arithmetic (src/core/files.js): the tree, what a folder holds, where a folder may go, orders, runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOf, folderCounts, folderFits, folderKids, folderPath, runOf, sortBenches } from '../../src/core/files.js';

const folders = [{ id: 'a', name: 'Optics', parent_id: null }, { id: 'b', name: 'Old', parent_id: 'a' }, { id: 'c', name: 'Cad', parent_id: null }, { id: 'd', name: 'Lost', parent_id: 'gone' }];
const benches = [
  { id: '1', name: 'Zed', tool: 'jekray', folder_id: null, updated_at: 5, size_bytes: 10 },
  { id: '2', name: 'alpha', tool: 'jekion', folder_id: 'a', updated_at: 9, size_bytes: 30 },
  { id: '3', name: 'Mid', folder_id: 'b', updated_at: 7, size_bytes: 20 },
  { id: '4', name: 'Cap', tool: 'jekcad', folder_id: 'b', updated_at: 1, size_bytes: 40 },
];

test('the tree: each folder’s folders by name, one whose parent is gone at the top', () => {
  const kids = folderKids(folders);
  assert.deepEqual(kids.get(null).map(f => f.name), ['Cad', 'Lost', 'Optics']);
  assert.deepEqual(kids.get('a').map(f => f.name), ['Old']);
  assert.deepEqual(folderPath(folders, 'b').map(f => f.name), ['Optics', 'Old']);
});
test('a loop in the folders ends the walk', () => {
  const loop = [{ id: 'x', name: 'X', parent_id: 'y' }, { id: 'y', name: 'Y', parent_id: 'x' }];
  assert.equal(folderPath(loop, 'x').length, 2);
});
test('what a folder holds counts the folders inside it, by app, or one app alone', () => {
  const all = folderCounts(folders, benches);
  assert.deepEqual(all.get('a'), { n: 3, apps: { jekion: 1, jekray: 1, jekcad: 1 } });
  assert.deepEqual(all.get('b'), { n: 2, apps: { jekray: 1, jekcad: 1 } });
  assert.equal(all.has('c'), false);
  assert.equal(folderCounts(folders, benches, 'jekcad').get('a').n, 1);
});
test('a folder goes to the top or into another, not into itself or a folder inside it', () => {
  assert.equal(folderFits(folders, 'a', null), true);
  assert.equal(folderFits(folders, 'a', 'c'), true);
  assert.equal(folderFits(folders, 'a', 'a'), false);
  assert.equal(folderFits(folders, 'a', 'b'), false);
  assert.equal(folderFits(folders, 'b', 'a'), true);
});
test('orders: newest and largest first, names and apps by the alphabet, turned round by flip', () => {
  const ids = (key, flip, where) => sortBenches(benches, key, flip, where).map(b => b.id).join('');
  assert.equal(ids('changed'), '2314');
  assert.equal(ids('size'), '4231');
  assert.equal(ids('name'), '2431');
  assert.equal(ids('name', true), '1342');
  assert.equal(ids('app'), '4231');
  assert.equal(ids('folder', false, b => b.folder_id || ''), '1243');
  assert.equal(ids('nonsense'), '2314');
  assert.equal(benches[0].id, '1', 'the list given is left as it was');
});
test('a Shift-click’s run, either way round', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(runOf(ids, 'b', 'd'), ['b', 'c', 'd']);
  assert.deepEqual(runOf(ids, 'd', 'b'), ['b', 'c', 'd']);
  assert.deepEqual(runOf(ids, 'gone', 'c'), ['c']);
  assert.deepEqual(runOf(ids, 'a', 'gone'), []);
});
test('counts in words', () => {
  assert.equal(countOf(1, 'bench'), '1 bench');
  assert.equal(countOf(3, 'bench'), '3 benches');
  assert.equal(countOf(0, 'coating'), '0 coatings');
  assert.equal(countOf(2, 'part studio'), '2 part studios');
});
