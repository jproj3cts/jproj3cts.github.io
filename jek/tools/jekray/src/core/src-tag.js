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
