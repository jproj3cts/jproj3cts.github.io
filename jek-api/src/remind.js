// "Email me a link for my computer", from the app on a phone: a fixed email
// with the app's address in it, and nothing else. No sign-in, so what keeps
// it from being a way to send email to strangers:
//   - the email is always the same: no text from the request goes into it;
//   - at most PER_ADDRESS a day to one address, DAILY in all, and the
//     per-address rate limit (RL_SLOW) on top.
// The address itself is not kept: only a hash of it and the time, in
// email_sends, which the daily cron clears after 24 hours.

import { mailOn, sendEmail } from './mail.js';
import { ApiError, sha256 } from './util.js';

const DAY = 24 * 60 * 60 * 1000;
const PER_ADDRESS = 2;
const DAILY = 300;
const TAG = 'remind';                                   // email_sends.user_id for these

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;

export function reminder(env) {
  const link = `${env.APP_URL}?src=email`;
  return {
    subject: 'JEKray: open it on your computer',
    text: `Here is the link to JEKray, the optics bench in your browser, for when you are at a computer:\n\n${link}\n\nNo download and no account needed to start. Someone asked for this link to be sent to this address from a phone; if it was not you, ignore it and nothing more will come.\n\nJEK Systems`,
    html: `<p>Here is the link to JEKray, the optics bench in your browser, for when you are at a computer:</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#e8730c;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open JEKray</a></p>
<p>No download and no account needed to start.</p>
<p style="color:#666;font-size:13px">Someone asked for this link to be sent to this address from a phone; if it was not you, ignore it and nothing more will come.</p>
<p style="color:#666;font-size:13px">JEK Systems</p>`,
  };
}

// POST /v1/remind  {email}
export async function remind(req, env) {
  const body = await req.json().catch(() => null);
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) throw new ApiError(400, 'bad_email', 'Please give an email address.');
  if (!mailOn(env)) throw new ApiError(503, 'email_off', 'Email cannot be sent from here just now.');
  const key = await sha256('remind:' + email), t = Date.now();
  const [mine, all] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE email = ? AND user_id = ? AND at > ?').bind(key, TAG, t - DAY),
    env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE user_id = ? AND at > ?').bind(TAG, t - DAY),
  ]);
  if (mine.results[0].n >= PER_ADDRESS) throw new ApiError(429, 'already_sent', 'We have sent that address the link today already: check its inbox (and spam).');
  if (all.results[0].n >= DAILY) throw new ApiError(503, 'busy', 'We cannot send more links today. The address is jeksys.net/jek/tools/jekray.html');
  await sendEmail(env, { to: email, ...reminder(env) });
  await env.DB.prepare('INSERT INTO email_sends (email, user_id, at) VALUES (?, ?, ?)').bind(key, TAG, t).run();
  return { sent: true };
}
