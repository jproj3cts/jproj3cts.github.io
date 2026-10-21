import { EMBED, TEST_MODE } from '../core/constants.js';
import { API_BASE, account } from './account.js';
import { srcTag } from '../core/src-tag.js';

/* ---------- Usage counts ----------
   How the tool is used, so it can be made better: which parts are added, which designers and analyses are
   opened, what is exported, and the tool's own errors. Only counts leave the page: an event from a fixed list
   (jek-api src/usage.js EVENTS), a short token about it (a part's type, an export's format), and whether the
   person is signed out, on the free plan or has JEKrayPro. Never a bench, a name, a file name or anything typed,
   and no id of any kind: no cookie goes with them, so a count cannot be tied to a person or to their other
   counts. They are gathered on the page and sent together every half minute, and when the page is left.
   None are sent from an embed, in test mode, when the browser asks sites not to track it (Do Not Track,
   Global Privacy Control), or when the person turns them off (the account menu, or the account page on the site). */
const USAGE_OFF = 'jek-usage-off';          // '1': none sent from this browser (the site's account page sets it too)
const usageQ = new Map(), usageErrs = [], usageSeen = new Set(), USAGE_T0 = Date.now();
let usageTimer = 0, usageLeft = false, usageSent = false;
export const usageBrowserSaysNo = () => typeof navigator !== 'undefined' && (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1');
export function usageOff() { try { return localStorage.getItem(USAGE_OFF) === '1'; } catch (err) { return false; } }
export function setUsageOff(off) {
  try { if (off) localStorage.setItem(USAGE_OFF, '1'); else localStorage.removeItem(USAGE_OFF); } catch (err) { /* not kept: none sent this visit */ }
  if (off) { usageQ.clear(); usageErrs.length = 0; }
  else usageSent = true;                   // not a visit's start: nothing about how it began
}
const usageOn = () => !TEST_MODE && !EMBED && !usageBrowserSaysNo() && !usageOff();
// a short plain token, as the API takes it
const usageToken = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_.+-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 40);
export function track(event, prop) {
  if (!usageOn()) return;
  const k = event + '\n' + usageToken(prop);
  usageQ.set(k, (usageQ.get(k) || 0) + 1);
  if (!usageTimer) usageTimer = setTimeout(usageFlush, 30000);
}
const usageTier = () => (!account ? 'anon' : (account.workspaces || []).some(w => w.active && w.kind !== 'institution') ? 'pro' : 'free');
export function usageFlush() {
  clearTimeout(usageTimer); usageTimer = 0;
  if (!usageOn() || (!usageQ.size && !usageErrs.length)) return;
  const ev = [...usageQ].map(([k, n]) => { const [e, p] = k.split('\n'); return [e, p, n]; });
  const body = JSON.stringify({ tier: usageTier(), ev: ev.slice(0, 200), err: usageErrs.splice(0, 20) });
  usageQ.clear();
  // text/plain, without credentials: a simple request, with nothing that says who
  try { fetch(API_BASE + '/v1/events', { method: 'POST', body, credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {}); } catch (err) { /* not sent: fine */ }
}
// the tool's own errors: the message with anything quoted and every number taken out, and where in the tool
function usageError(msg, file, line) {
  if (!usageOn() || usageErrs.length >= 5) return;
  const m = String(msg || '').replace(/(["'`‘“]).*?(["'`’”])/g, '…').replace(/\d+(\.\d+)?/g, 'N').replace(/https?:\S+/g, 'URL').slice(0, 160);
  const src = String(file || '').split(/[?#]/)[0].split('/').pop() + ':' + (line || 0);
  // only the tool's own scripts: not extensions, not mods, and not what a browser runs in the page itself, which
  // reports the page's line 1 (an in-app browser's injected autofill script) or no line at all (a ResizeObserver
  // loop notice); the tool's own code starts well below the head
  if (!/jekray/.test(src) || !(line > 1) || usageSeen.has(m + src)) return;
  usageSeen.add(m + src); usageErrs.push([m, src]);
  if (!usageTimer) usageTimer = setTimeout(usageFlush, 30000);
}
const usageMinutes = ms => (ms < 60e3 ? 'under-1m' : ms < 300e3 ? '1-5m' : ms < 900e3 ? '5-15m' : ms < 3600e3 ? '15-60m' : 'over-1h');
const usageScreen = () => { const w = Math.min(screen.width || innerWidth, innerWidth || 1e9); return w < 600 ? 'phone' : w < 1024 ? 'tablet' : w < 1700 ? 'desktop' : 'wide'; };
function usageBrowser() {
  const u = navigator.userAgent;
  return /Edg\//.test(u) ? 'edge' : /OPR\//.test(u) ? 'opera' : /SamsungBrowser/.test(u) ? 'samsung' : /Firefox\//.test(u) ? 'firefox' : /Chrome\//.test(u) ? 'chrome' : /Safari\//.test(u) ? 'safari' : 'other';
}
// buttons counted wherever they are pressed: [event, token]
const USAGE_CLICKS = {
  btnView3d: ['view', '3d'], btnMeasure: ['view', 'measure'], btnPlayAll: ['sweep', 'all'], btnOptimise: ['optimise', 'bench'], btnTol: ['tolerance', 'bench'],
  btnShare: ['share', 'link'], btnSave: ['save', 'file'], btnSnaps: ['save', 'versions'], btnOpen: ['import', 'jekray'], btnImport: ['import', 'zmx'], btnImportStl: ['import', 'stl'],
  btnExportZmx: ['export', 'zmx'], btnHelp: ['help', 'shortcuts'], btnNews: ['news', ''], btnCite: ['help', 'cite'], btnBug: ['help', 'bug'], btnExamples: ['help', 'examples'],
  btnPacks: ['mod', 'packs'], btnScripts: ['mod', 'scripts'], btnCloudList: ['cloud', 'list'], btnCloudSave: ['cloud', 'save'], btnCloudFork: ['cloud', 'fork'], btnHome: ['cloud', 'home'],
  btnCart: ['quote', 'cart'], btnAddPart: ['search', 'picker'],
};
/* Where a visit came from: the tag on the link that brought it (?src=ig-spectrometer, from a post), or the
   social site it came through, and what it went on to do ('goal'). The tag names a post, never a person: it
   is kept in this browser for 30 days, so a visit that signs in, goes off to the sign-in page and comes back
   still counts for the post. Taken off the address bar once read, so a copied link does not carry it. */
const SRC_KEY = 'jek-src', SRC_DAYS = 30;
let usageSrc = '';
function readSrc() {
  const tag = typeof location === 'undefined' ? '' : srcTag(location.search, document.referrer);
  if (/[?&]src=/.test(location.search)) {
    const u = new URL(location.href); u.searchParams.delete('src');
    try { window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash); } catch (err) { /* left as it is */ }
  }
  try {
    if (tag && usageOn()) localStorage.setItem(SRC_KEY, JSON.stringify({ s: tag, t: Date.now() }));
    const k = JSON.parse(localStorage.getItem(SRC_KEY) || 'null');
    if (k && Date.now() - k.t < SRC_DAYS * 864e5) return { tag: k.s, now: !!tag };
    localStorage.removeItem(SRC_KEY);
  } catch (err) { /* not kept: this visit only */ }
  return { tag, now: !!tag };
}
/* something a visit led to (save, share, signin, account, subscribe, pro, remind), counted against where it came from */
export function goal(step) { track('goal', (usageSrc || 'none') + '.' + step); }
/* a visit's start: how it began (fresh, restored, a shared bench, an example), on what, and from where */
export function usageStart(how) {
  if (usageSent) return;
  usageSent = true;
  const src = readSrc();
  usageSrc = src.tag;
  track('open', how); track('screen', usageScreen()); track('browser', usageBrowser());
  track('from', src.now ? src.tag : src.tag ? src.tag + '.again' : 'none');
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireUsage() {
  if (TEST_MODE || EMBED) return;
  addEventListener('error', e => usageError(e.message, e.filename, e.lineno));
  addEventListener('unhandledrejection', e => {
    const r = e.reason, at = r && r.stack ? /([\w.-]+\.(?:html|js)):(\d+)/.exec(r.stack) : null;
    usageError(r && r.message || r, at && at[1], at && at[2]);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button[id],a[id]'), c = b && USAGE_CLICKS[b.id];
    if (c && !b.disabled) track(c[0], c[1]);
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') usageFlush(); });
  addEventListener('pagehide', () => { if (!usageLeft) { usageLeft = true; track('leave', usageMinutes(Date.now() - USAGE_T0)); } usageFlush(); });
}
