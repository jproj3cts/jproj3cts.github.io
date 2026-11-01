/* Where a visit came from, as a short plain token for the usage counts (io/usage.js): the tag on the link
   that brought it (?src=ig-spectrometer, from a post), or else the social site it came through by its
   referrer; '' for neither. A tag names a post, never a person. */
export function srcTag(search, referrer) {
  const m = /[?&]src=([^&#]*)/.exec(search || '');
  const tag = m ? decodeURIComponent(m[1]).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) : '';
  if (tag) return tag;
  let host = '';
  try { host = referrer ? new URL(referrer).hostname.replace(/^(www|l|lm|m)\./, '') : ''; } catch (err) { /* none */ }
  return /(^|\.)instagram\.com$/.test(host) ? 'instagram' : /(^|\.)(facebook\.com|fb\.me)$/.test(host) ? 'facebook'
    : /(^|\.)linkedin\.com$|^lnkd\.in$/.test(host) ? 'linkedin' : /(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host) ? 'x'
    : /(^|\.)(youtube\.com|youtu\.be)$/.test(host) ? 'youtube' : /(^|\.)reddit\.com$/.test(host) ? 'reddit' : /(^|\.)tiktok\.com$/.test(host) ? 'tiktok' : '';
}
/* a visit from one of our Instagram posts: a tag starting "ig" (ig-bio, ig-michelson), or Instagram as the referrer */
export const fromIgTag = tag => /^(ig|instagram$)/.test(tag || '');
/* a visit's 'visitor' marks (io/usage.js usageVisitor): which of the day, ISO week and month (UTC) are new to this
   browser, from what it kept last time (seen: { d, w, m } or nothing: 'new'), and what to keep now */
export function visitorMarks(now, seen) {
  const d = new Date(now), day = d.toISOString().slice(0, 10), month = day.slice(0, 7);
  // the ISO week (Monday first), as 2026-W44
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1), week = t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0');
  const was = seen && typeof seen === 'object' ? seen : null, marks = [];
  if (!was) marks.push('new');
  if (!was || was.d !== day) marks.push('day');
  if (!was || was.w !== week) marks.push('week');
  if (!was || was.m !== month) marks.push('month');
  return { marks, seen: { d: day, w: week, m: month } };
}

/* the kind of device a visit is on, for the funnel (io/usage.js): an app's own browser first (Instagram, Facebook,
   TikTok, LinkedIn: a link followed inside the app opens there), else the screen's size class. Also in page.html's
   early script, which counts visits that end before the bench is drawn: test/node/usage-funnel.test.mjs keeps them alike */
export function deviceOf(ua, width) {
  const u = String(ua || '');
  return /Instagram/.test(u) ? 'instagram' : /FBAN|FBAV|FB_IAB/.test(u) ? 'facebook' : /musical_ly|BytedanceWebview|TikTok/i.test(u) ? 'tiktok'
    : /LinkedInApp/.test(u) ? 'linkedin' : width < 600 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
}
/* how long the page took to draw its bench (ms from the start of loading), as a band */
export const loadBand = ms => (ms < 1000 ? 'under-1s' : ms < 3000 ? '1-3s' : ms < 6000 ? '3-6s' : ms < 10000 ? '6-10s' : ms < 20000 ? '10-20s' : 'over-20s');
/* Coming back, with no id. A browser's first visit ever keeps here (never sent) when it was, its week and where it
   came from: first = { t, s, w, b }. A later visit (more than an hour on) counts it back within 1, 7 and 30 days of
   that first visit, each once ('d1', 'd7', 'd30', all that apply: back within 1 day is back within 7 too), against
   its source and week. Returns the marks to send and what to keep (null after 30 days: nothing left to count). */
export const BACK_DAYS = [[1, 'd1'], [7, 'd7'], [30, 'd30']];
export function backMarks(now, first) {
  if (!first || typeof first !== 'object' || !(first.t > 0)) return { marks: [], keep: null };
  const dt = now - first.t, b = Array.isArray(first.b) ? first.b : [];
  if (dt > 30 * 864e5) return { marks: [], keep: null };
  if (dt < 3600e3) return { marks: [], keep: first };
  const marks = BACK_DAYS.filter(([d, m]) => dt <= d * 864e5 && !b.includes(m)).map(([, m]) => m);
  return { marks, keep: Object.assign({}, first, { b: [...b, ...marks] }) };
}
