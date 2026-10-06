// Email from the API, through Resend (the same account as the URPG shop's
// Worker, with jeksys.net verified there; its own API key, RESEND_API_KEY, a
// secret). Only this file knows the provider. Without the key, nothing is
// sent and the features that need email say so.

import { ApiError } from './util.js';

export const mailOn = (env) => !!env.RESEND_API_KEY;

export async function sendEmail(env, { to, subject, html, text }) {
  if (!mailOn(env)) throw new ApiError(503, 'email_off', 'Email checks are not available just now. Please email support@jeksys.net and we will check by hand.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, reply_to: env.SUPPORT_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    console.error('Resend', res.status, (await res.text()).slice(0, 300));
    throw new ApiError(502, 'email_failed', 'We could not send the email just now. Please try again in a few minutes.');
  }
}
