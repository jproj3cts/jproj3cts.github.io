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
