// The funnel, coming back and the bench's drawing time (io/usage.js, core/src-tag.js), and page.html's early script,
// which counts visits that end before the bench is drawn: what it sends, and when it sends nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { backMarks, deviceOf, loadBand } from '../../src/core/src-tag.js';

const here = fileURLToPath(new URL('.', import.meta.url)), page = readFileSync(join(here, '../../page.html'), 'utf8');
const early = page.match(/<script id="jekEarly">([\s\S]*?)<\/script>/)[1];
const UA = {
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.22.109',
  facebook: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
  tiktok: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023',
  chrome: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
};

test('coming back is counted within 1, 7 and 30 days of the first visit, each once, and not for a reload', () => {
  const t = Date.UTC(2026, 10, 2, 12), first = { t, s: 'ig-irises', w: '2026-w45', b: [] }, h = 3600e3, d = 864e5;
  assert.deepEqual(backMarks(t + 10 * 60e3, first).marks, []);                      // ten minutes on: the same visit, reloaded
  const a = backMarks(t + 5 * h, first);
  assert.deepEqual(a.marks, ['d1', 'd7', 'd30']);
  assert.deepEqual(backMarks(t + 6 * h, a.keep).marks, []);                          // each once
  const b = backMarks(t + 3 * d, first);
  assert.deepEqual(b.marks, ['d7', 'd30']);
  assert.deepEqual(backMarks(t + 20 * d, b.keep).marks, []);
  assert.deepEqual(backMarks(t + 20 * d, first).marks, ['d30']);
  assert.equal(backMarks(t + 31 * d, first).keep, null);                             // over: nothing kept
  assert.deepEqual(backMarks(t, null), { marks: [], keep: null });
});

test('the device: an app’s own browser first, else the screen; the drawing time in bands', () => {
  assert.equal(deviceOf(UA.instagram, 390), 'instagram');
  assert.equal(deviceOf(UA.facebook, 390), 'facebook');
  assert.equal(deviceOf(UA.tiktok, 390), 'tiktok');
  assert.equal(deviceOf(UA.chrome, 390), 'phone');
  assert.equal(deviceOf(UA.chrome, 800), 'tablet');
  assert.equal(deviceOf(UA.chrome, 1920), 'desktop');
  assert.deepEqual([500, 2000, 4000, 8000, 15000, 30000].map(loadBand), ['under-1s', '1-3s', '3-6s', '6-10s', '10-20s', 'over-20s']);
});

// page.html's early script, run with a stand-in browser: what it sends when the page is left
function runEarly({ search = '', hash = '', ua = UA.instagram, width = 390, store = {}, drawn = false, dnt = false, ms = 4200, referrer = '', hostname = 'jeksys.net' } = {}) {
  const sent = [], on = {}, ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const win = {
    localStorage: ls, innerWidth: width, screen: { width }, performance: { now: () => ms },
    location: { search, hash, hostname }, navigator: { userAgent: ua, doNotTrack: dnt ? '1' : null, sendBeacon: (url, body) => { sent.push({ url, body: JSON.parse(body) }); return true; } },
    document: { referrer, visibilityState: 'visible', addEventListener: (e, f) => { on['doc:' + e] = f; } },
    addEventListener: (e, f) => { on[e] = f; }, Date, JSON, Math, decodeURIComponent,
  };
  win.window = win;
  vm.runInNewContext(early, win);
  if (drawn) win.JEK_DRAWN = true;
  if (on.pagehide) on.pagehide();
  win.document.visibilityState = 'hidden';
  if (on['doc:visibilitychange']) on['doc:visibilitychange']();
  return { sent, store };
}

test('page.html’s early script counts a visit that ends before the bench is drawn, by source and device, once', () => {
  const { sent, store } = runEarly({ search: '?src=ig-thread-both-irises' });
  assert.equal(sent.length, 1);                                                        // pagehide and hidden: one count
  assert.equal(sent[0].url, 'https://api.jeksys.net/v1/events');
  assert.deepEqual(sent[0].body, { tier: 'anon', ev: [['load', 'early.3-6s'], ['funnel', 'ig-thread-both-irises.early'], ['funnel', 'dev-instagram.early']], err: [] });
  assert.deepEqual(JSON.parse(store['jek-funnel']), { 'ig-thread-both-irises': ['early'], '@instagram': ['early'] });
  // the same browser leaving early again: the load counted, the funnel not again
  assert.deepEqual(runEarly({ search: '?src=ig-thread-both-irises', store }).sent[0].body.ev, [['load', 'early.3-6s']]);
  // the tag kept from an earlier visit, or Instagram as the referrer
  assert.equal(runEarly({ store: { 'jek-src': JSON.stringify({ s: 'ig-zoom', t: Date.now() }) }, ua: UA.chrome, width: 1400 }).sent[0].body.ev[1][1], 'ig-zoom.early');
  assert.equal(runEarly({ referrer: 'https://l.instagram.com/?u=x', ua: UA.chrome }).sent[0].body.ev[1][1], 'instagram.early');
  assert.equal(runEarly({ hostname: 'localhost' }).sent[0].url, 'http://localhost:8787/v1/events');
});

test('and sends nothing once the bench is drawn, in test mode, from an embed, with Do Not Track or with the counts off', () => {
  assert.equal(runEarly({ drawn: true }).sent.length, 0);
  assert.equal(runEarly({ search: '?test' }).sent.length, 0);
  assert.equal(runEarly({ hash: '#test' }).sent.length, 0);
  assert.equal(runEarly({ search: '?embed' }).sent.length, 0);
  assert.equal(runEarly({ dnt: true }).sent.length, 0);
  assert.equal(runEarly({ store: { 'jek-usage-off': '1' } }).sent.length, 0);
});

test('the early script’s device rule is core/src-tag.js’s, and its events are ones the API takes', () => {
  for (const ua of Object.values(UA)) for (const w of [390, 800, 1920]) {
    const got = runEarly({ ua, width: w }).sent[0].body.ev[2][1];
    assert.equal(got, 'dev-' + deviceOf(ua, w) + '.early');
  }
  const api = readFileSync(join(here, '../../../../../jek-api/src/usage.js'), 'utf8');
  for (const e of ['load', 'funnel', 'cohort', 'back']) assert.match(api, new RegExp(`'${e}'`));
  // the drawn mark the early script waits for is set by the app
  assert.match(readFileSync(join(here, '../../src/io/usage.js'), 'utf8'), /window\.JEK_DRAWN = true/);
});
