import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, send, signedIn } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
afterEach(() => vi.restoreAllMocks());

// Resend, as the API sees it: every email it is asked to send
function resend(status = 200) {
  const sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('unexpected fetch ' + url);
    sent.push({ auth: init.headers.Authorization, ...JSON.parse(init.body) });
    return new Response(status === 200 ? '{"id":"x"}' : '{"message":"nope"}', { status });
  });
  return sent;
}
const codeOf = (mail) => mail.text.match(/code is (\d{6})/)[1];
const start = (email, extra = {}, headers = {}) => send('/auth/email/start', 'POST', null, { email, ...extra }, headers);
const code = (email, c, token) => send('/auth/email/code', 'POST', token, { email, code: c });
const sessionOf = (res) => (res.headers.get('Set-Cookie') || '').match(/jek_session=([0-9a-f]{64})/);

describe('sign-in with an email address, by a code sent to it', () => {
  it('sends a 6-digit code, keeps only its hash, and the right code opens a session for a new account with that verified email', async () => {
    const sent = resend();
    const r = await json(await start('  New.Person@Example.ORG '));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, email: 'new.person@example.org' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ['new.person@example.org'], from: 'JEKray <jekray@jeksys.net>' });
    const c = codeOf(sent[0]);
    expect(sent[0].subject).toContain(c);
    const row = await env.DB.prepare('SELECT * FROM signin_codes WHERE email = ?').bind('new.person@example.org').first();
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(c);
    const res = await code('new.person@example.org', c.slice(0, 3) + ' ' + c.slice(3));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ signed_in: true, email: 'new.person@example.org' });
    const m = sessionOf(res);
    expect(m).toBeTruthy();
    const me = await json(await call('/v1/me', { token: m[1] }));
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: 'New Person', email: 'new.person@example.org' });
    expect(me.body.identities).toEqual([expect.objectContaining({ provider: 'email', subject: 'new.person@example.org' })]);
    // the code is used up
    expect((await code('new.person@example.org', c)).status).toBe(404);
    // the same address signs in to the same account next time
    const sent2 = resend();
    await start('new.person@example.org');
    const res2 = await code('new.person@example.org', codeOf(sent2[0]));
    const me2 = await json(await call('/v1/me', { token: sessionOf(res2)[1] }));
    expect(me2.body.user.id).toBe(me.body.user.id);
  });

  it('refuses what is not an address or a code, counts wrong tries, and cancels after five', async () => {
    const sent = resend();
    expect((await json(await start('not an address'))).body.error.code).toBe('bad_email');
    expect((await json(await code('a@b.co', '12'))).body.error.code).toBe('bad_code');
    expect((await json(await code('nobody@b.co', '123456'))).body.error.code).toBe('no_code');
    await start('a.person@b.co');
    const right = codeOf(sent[0]);
    const wrong = String((Number(right) + 1) % 1000000).padStart(6, '0');
    for (let k = 1; k <= 4; k++) {
      const r = await json(await code('a.person@b.co', wrong));
      expect(r.status).toBe(400);
      expect(r.body.error.left).toBe(5 - k);
    }
    expect((await json(await code('a.person@b.co', wrong))).body.error.code).toBe('too_many_tries');
    expect((await json(await code('a.person@b.co', right))).body.error.code).toBe('no_code');
  });

  it('refuses a code that has run out', async () => {
    const sent = resend();
    await start('late@b.co');
    await env.DB.prepare('UPDATE signin_codes SET expires_at = ? WHERE email = ?').bind(Date.now() - 1, 'late@b.co').run();
    expect((await json(await code('late@b.co', codeOf(sent[0])))).body.error.code).toBe('code_expired');
  });

  it('sends at most three codes to one address a day, and sends nothing when email is off', async () => {
    const sent = resend();
    for (let k = 0; k < 3; k++) expect((await start('many@b.co')).status).toBe(200);
    expect((await json(await start('many@b.co'))).body.error.code).toBe('too_many_codes');
    expect(sent).toHaveLength(3);
    const key = env.RESEND_API_KEY; env.RESEND_API_KEY = '';
    try { expect((await json(await start('other@b.co'))).body.error.code).toBe('email_off'); } finally { env.RESEND_API_KEY = key; }
  });

  it('links an address to the signed-in account, refuses one that signs in elsewhere, and unlinks it while another way in remains', async () => {
    const s = await signedIn('Kim');
    await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('google', 'g-kim', ?, 0)").bind(s.user.id).run();
    const sent = resend();
    expect((await json(await start('kim@b.co', { link: true }))).body.error.code).toBe('signed_out');
    expect((await send('/auth/email/start', 'POST', s.token, { email: 'kim@b.co', link: true })).status).toBe(200);
    // the code must be typed by the same signed-in person
    expect((await json(await code('kim@b.co', codeOf(sent[0])))).body.error.code).toBe('signed_out');
    await send('/auth/email/start', 'POST', s.token, { email: 'kim@b.co', link: true });
    const r = await json(await code('kim@b.co', codeOf(sent[1]), s.token));
    expect(r.body).toMatchObject({ linked: true, email: 'kim@b.co' });
    const me = (await json(await call('/v1/me', { token: s.token }))).body;
    expect(me.identities.map((i) => i.provider).sort()).toEqual(['email', 'google']);
    // another account asking for the same address is refused
    const o = await signedIn('Other');
    await send('/auth/email/start', 'POST', o.token, { email: 'kim@b.co', link: true });
    expect((await json(await code('kim@b.co', codeOf(sent[2]), o.token))).body.error.code).toBe('taken');
    // unlinked, as any sign-in is, while Google remains
    expect((await call('/v1/me/identities/email', { method: 'DELETE', token: s.token })).status).toBeLessThan(300);
    expect((await call('/v1/me/identities/google', { method: 'DELETE', token: s.token })).status).toBe(409);
  });
});
