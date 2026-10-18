import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call, send, signedIn } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });
afterEach(() => vi.restoreAllMocks());

function resend() {
  const sent = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('unexpected fetch ' + url);
    sent.push(JSON.parse(init.body));
    return new Response('{"id":"x"}', { status: 200 });
  });
  return sent;
}
const codeOf = (mail) => mail.text.match(/code is (\d{6})/)[1];
const start = (email) => send('/auth/email/start', 'POST', null, { email });
const code = (email, c, extra = {}) => send('/auth/email/code', 'POST', null, { email, code: c, ...extra });
const pw = (email, password, headers = {}) => send('/auth/password', 'POST', null, { email, password }, headers);
const sessionOf = (res) => (res.headers.get('Set-Cookie') || '').match(/jek_session=([0-9a-f]{64})/);
const PW = 'correct horse battery';

// a new account made by code, with a password chosen on the way in
async function newAccount(email) {
  const sent = resend();
  await start(email);
  const res = await code(email, codeOf(sent[0]), { password: PW });
  expect(await res.json()).toMatchObject({ signed_in: true, password_set: true });
  return sessionOf(res)[1];
}

describe('an account with a password', () => {
  it('is made by code with a password chosen, signs in with the password, and keeps only a salted hash', async () => {
    const token = await newAccount('pat@example.org');
    const me = (await json(await call('/v1/me', { token }))).body;
    expect(me.has_password).toBe(true);
    const row = await env.DB.prepare('SELECT * FROM passwords WHERE user_id = ?').bind(me.user.id).first();
    expect(row.iters).toBe(100000);
    expect(JSON.stringify(row)).not.toContain(PW);
    const res = await pw('Pat@Example.org', PW);
    expect(res.status).toBe(200);
    const me2 = (await json(await call('/v1/me', { token: sessionOf(res)[1] }))).body;
    expect(me2.user.id).toBe(me.user.id);
  });

  it('gives one answer for a wrong password and an unknown address, and locks after ten wrong tries', async () => {
    await newAccount('lock@example.org');
    const ip = { 'CF-Connecting-IP': '10.9.9.9' };
    expect((await json(await pw('lock@example.org', 'not it at all', ip))).body.error.code).toBe('wrong_password');
    expect((await json(await pw('nobody@example.org', 'not it at all', ip))).body.error.code).toBe('wrong_password');
    for (let k = 0; k < 9; k++) await pw('lock@example.org', 'still wrong here');     // from addresses of their own: the email's own count
    expect((await json(await pw('lock@example.org', PW, ip))).body.error.code).toBe('locked');
    // the address is locked from any network address, and the lock lifts when its time is up
    expect((await json(await pw('lock@example.org', PW))).body.error.code).toBe('locked');
    await env.DB.prepare('UPDATE password_fails SET until = ?').bind(Date.now() - 1).run();
    expect((await pw('lock@example.org', PW)).status).toBe(200);
  });

  it('a burst of guesses sent together gets ten between them, not one each', async () => {
    await newAccount('burst@example.org');
    const answers = await Promise.all(Array.from({ length: 25 }, (_, k) => pw('burst@example.org', 'guess number ' + k).then((r) => r.status)));
    expect(answers.filter((st) => st === 401)).toHaveLength(10);
    expect(answers.filter((st) => st === 429)).toHaveLength(15);
    expect((await json(await pw('burst@example.org', PW))).body.error.code).toBe('locked');
  });

  it('refuses weak passwords; a code sign-in with a new password replaces the old one and ends every other session', async () => {
    const sent = resend();
    await start('weak@example.org');
    expect((await json(await code('weak@example.org', codeOf(sent[0]), { password: 'short' }))).body.error.code).toBe('weak_password');
    expect((await json(await code('weak@example.org', codeOf(sent[0]), { password: 'weak@example.org!!' }))).body.error.code).toBe('weak_password');
    expect((await json(await code('weak@example.org', codeOf(sent[0]), { password: 'aaaaaaaaaaaa' }))).body.error.code).toBe('weak_password');
    // the code is still good: a weak password is refused before it is used up
    const res = await code('weak@example.org', codeOf(sent[0]), { password: PW });
    expect((await res.json()).password_set).toBe(true);
    const old = sessionOf(res)[1];
    // forgotten: a code with a new password replaces it, and the old session is ended
    await start('weak@example.org');
    const res2 = await code('weak@example.org', codeOf(sent[1]), { password: 'another fine phrase' });
    expect((await res2.json()).password_set).toBe(true);
    expect((await pw('weak@example.org', PW)).status).toBe(401);
    expect((await pw('weak@example.org', 'another fine phrase')).status).toBe(200);
    expect((await call('/v1/me', { token: old })).status).toBe(401);
    expect((await call('/v1/me', { token: sessionOf(res2)[1] })).status).toBe(200);
  });

  it('needs the pepper secret, and says so rather than failing', async () => {
    const token = await newAccount('pep@example.org');
    const was = env.PASSWORD_PEPPER; env.PASSWORD_PEPPER = '';
    try {
      expect((await json(await pw('pep@example.org', PW))).body.error.code).toBe('passwords_off');
      expect((await json(await send('/v1/me/password', 'PUT', token, { password: PW }))).body.error.code).toBe('passwords_off');
      // a code sign-in with a password is refused before the code is spent
      const sent = resend();
      await start('pep2@example.org');
      expect((await json(await code('pep2@example.org', codeOf(sent[0]), { password: PW }))).body.error.code).toBe('passwords_off');
      expect((await code('pep2@example.org', codeOf(sent[0]))).status).toBe(200);
    } finally { env.PASSWORD_PEPPER = was; }
    expect((await pw('pep@example.org', PW)).status).toBe(200);
  });

  it('is gone with the account', async () => {
    const token = await newAccount('bye@example.org');
    const me = (await json(await call('/v1/me', { token }))).body;
    expect((await send('/v1/me', 'DELETE', token, { confirm: 'delete my account' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 AS y FROM passwords WHERE user_id = ?').bind(me.user.id).first()).toBeNull();
    expect((await json(await pw('bye@example.org', PW))).body.error.code).toBe('wrong_password');
  });

  it('is set, changed with the current one, and removed from the account page, and needs an email sign-in', async () => {
    const s = await signedIn('Kim');
    expect((await json(await send('/v1/me/password', 'PUT', s.token, { password: PW }))).body.error.code).toBe('no_email_identity');
    await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('email', 'kim@example.org', ?, 0)").bind(s.user.id).run();
    expect((await send('/v1/me/password', 'PUT', s.token, { password: PW })).status).toBe(200);
    expect((await json(await send('/v1/me/password', 'PUT', s.token, { password: 'a new long phrase' }))).body.error.code).toBe('wrong_password');
    // a change ends the other sessions, not this one
    const other = (await import('../src/sessions.js')).createSession;
    const { token: otherToken } = await other(env, s.user.id, 'elsewhere');
    expect((await send('/v1/me/password', 'PUT', s.token, { password: 'a new long phrase', current: PW })).status).toBe(200);
    expect((await call('/v1/me', { token: otherToken })).status).toBe(401);
    expect((await call('/v1/me', { token: s.token })).status).toBe(200);
    expect((await pw('kim@example.org', 'a new long phrase')).status).toBe(200);
    expect((await call('/v1/me/password', { method: 'DELETE', token: s.token })).status).toBe(200);
    expect((await json(await call('/v1/me', { token: s.token }))).body.has_password).toBe(false);
    expect((await json(await pw('kim@example.org', 'a new long phrase'))).body.error.code).toBe('wrong_password');
  });
});
