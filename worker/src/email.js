/**
 * Transactional email via Resend.
 *
 * Cloudflare Email Workers can only route inbound mail and send to verified
 * destination addresses, so outbound mail to arbitrary customers needs a
 * third party. Resend is used here; Postmark or Mailgun would drop in with
 * only this file changed.
 */

export async function sendEmail(env, { to, subject, html, attachments = [] }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      replyTo: env.SUPPORT_EMAIL,
      to: [to],
      subject,
      html,
      attachments,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Resend ${res.status}: ${body || '(empty body)'} ` +
        `[from: ${env.FROM_EMAIL} | to: ${to} | attachments: ${attachments.length}]`,
    );
  }

  return res.json();
}

/**
 * Customer-facing delivery email. Kept deliberately plain: heavy HTML and
 * image-only layouts are a reliable way into a spam folder, which matters
 * more than usual when the attachment is the product.
 */
export function deliveryEmailHtml({ items, supportEmail }) {
  const list = items
    .map((i) => `<li style="margin-bottom:6px;">${escapeHtml(i.name)}</li>`)
    .join('');

  const plural = items.length === 1 ? 'is attached' : 'are attached';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:28px;border-radius:8px;">

    <div style="height:4px;background:linear-gradient(90deg,#ffb347 0%,#ffb347 20%,#f47742 20%,#f47742 40%,#db3550 40%,#db3550 60%,#73b9ca 60%,#73b9ca 80%,#0092b2 80%,#0092b2 100%);border-radius:2px;margin-bottom:22px;"></div>

    <h1 style="margin:0 0 16px;font-size:20px;">Thanks for your order</h1>

    <p style="margin:0 0 14px;line-height:1.6;">
      Your purchase ${plural} to this email:
    </p>

    <ul style="margin:0 0 18px;padding-left:20px;line-height:1.6;">${list}</ul>

    <p style="margin:0 0 14px;line-height:1.6;">
      If the attachment didn't come through, or you need the file in another
      format, reply to this email and we'll sort it out.
    </p>

    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3e3e3;font-size:13px;color:#666;line-height:1.6;">
      JEK Systems &middot; <a href="mailto:${escapeHtml(supportEmail)}" style="color:#0092b2;">${escapeHtml(supportEmail)}</a><br>
      This file is for your own use. Please don't redistribute it.
    </p>

  </div>
</body>
</html>`;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
