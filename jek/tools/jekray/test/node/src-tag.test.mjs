/* Where a visit came from: a post's tag on the link, plain and short, or the social site by its referrer. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srcTag } from '../../src/core/src-tag.js';

test('a link’s tag wins, made plain and short', () => {
  assert.equal(srcTag('?src=ig-Spectrometer_01', 'https://l.instagram.com/'), 'ig-spectrometer_01');
  assert.equal(srcTag('?a=1&src=Hello%20World!&b=2', ''), 'hello-world');
  assert.equal(srcTag('?src=' + 'x'.repeat(60), ''), 'x'.repeat(24));
  assert.equal(srcTag('?src=<script>', ''), 'script');
});
test('no tag: the social site it came through, or nothing', () => {
  assert.equal(srcTag('', 'https://l.instagram.com/?u=https%3A%2F%2Fjeksys.net'), 'instagram');
  assert.equal(srcTag('', 'https://www.instagram.com/'), 'instagram');
  assert.equal(srcTag('', 'https://lm.facebook.com/'), 'facebook');
  assert.equal(srcTag('', 'https://www.linkedin.com/feed/'), 'linkedin');
  assert.equal(srcTag('', 'https://t.co/abc'), 'x');
  assert.equal(srcTag('', 'https://www.google.com/'), '');
  assert.equal(srcTag('', 'https://notinstagram.com/'), '');
  assert.equal(srcTag('?src=', ''), '');
  assert.equal(srcTag('', 'not a url'), '');
});
