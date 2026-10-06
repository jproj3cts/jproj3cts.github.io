import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bench, call, send, signedIn } from './helpers.js';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
const ask = (s, email) => send('/v1/me/academic/email', 'POST', s.token, { email });
const answer = (s, code) => send('/v1/me/academic/code', 'POST', s.token, { code });
const me = async (s) => (await json(await call('/v1/me', { token: s.token }))).body;

describe('the academic price by a university email address', () => {
  it('sends a 6-digit code from jeksys.net, keeps only its hash, and a right code gives the academic price for a year', async () => {
    const s = await signedIn('Kim');
    const sent = resend();
    const r = await json(await ask(s, '  K1234567@KCL.ac.uk '));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, email: 'k1234567@kcl.ac.uk' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: 'JEKray2D <jekray2d@jeksys.net>', to: ['k1234567@kcl.ac.uk'], reply_to: 'support@jeksys.net', auth: 'Bearer re_test_key' });
    const code = codeOf(sent[0]);
    expect(sent[0].subject).toContain(code);
    expect(sent[0].html).toContain(code);
    const row = await env.DB.prepare('SELECT * FROM email_codes WHERE user_id = ?').bind(s.user.id).first();
    expect(JSON.stringify(row)).not.toContain(code);
    expect((await me(s)).academic).toBeNull();
    const ok = await json(await answer(s, code.slice(0, 3) + ' ' + code.slice(3)));
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ via: 'email: kcl.ac.uk', email: 'k1234567@kcl.ac.uk' });
    expect(ok.body.until - Date.now()).toBeGreaterThan(364 * 86400000);
    expect((await me(s)).academic).toMatchObject({ via: 'email: kcl.ac.uk', email: 'k1234567@kcl.ac.uk' });
    // the code is used up
    expect((await answer(s, code)).status).toBe(404);
  });

  it('refuses addresses that are not academic, or not addresses, and sends nothing', async () => {
    const s = await signedIn();
    const sent = resend();
    expect((await json(await ask(s, 'someone@gmail.com'))).body.error.code).toBe('not_academic_domain');
    expect((await json(await ask(s, 'not an address'))).body.error.code).toBe('bad_email');
    expect((await json(await ask(s, 'a@b@ox.ac.uk'))).body.error.code).toBe('bad_email');
    expect(sent).toHaveLength(0);
  });

  it('cancels a code after 5 wrong tries, and refuses one that has run out', async () => {
    const s = await signedIn();
    const sent = resend();
    await ask(s, 'a.person@ox.ac.uk');
    const code = codeOf(sent[0]), wrong = code === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 1; i--) expect((await json(await answer(s, wrong))).body.error).toMatchObject({ code: 'wrong_code' });
    expect((await json(await answer(s, wrong))).body.error.code).toBe('too_many_tries');
    expect((await answer(s, code)).status).toBe(404);              // gone, the right code with it
    await ask(s, 'a.person@ox.ac.uk');
    await env.DB.prepare('UPDATE email_codes SET expires_at = 1 WHERE user_id = ?').bind(s.user.id).run();
    expect((await json(await answer(s, codeOf(sent[1])))).body.error.code).toBe('code_expired');
    expect((await json(await answer(s, '12ab56'))).body.error.code).toBe('bad_code');
  });

  it('sends at most 3 codes to one address, and 6 for one person, in a day', async () => {
    const a = await signedIn(), b = await signedIn();
    resend();
    for (let i = 0; i < 3; i++) expect((await ask(a, 'busy@cam.ac.uk')).status).toBe(200);
    expect((await json(await ask(b, 'busy@cam.ac.uk'))).body.error.code).toBe('too_many_codes');
    for (let i = 0; i < 3; i++) expect((await ask(a, `other${i}@cam.ac.uk`)).status).toBe(200);
    expect((await json(await ask(a, 'more@cam.ac.uk'))).body.error.code).toBe('too_many_codes');
  });

  it('confirms one address for one account at a time', async () => {
    const a = await signedIn('A'), b = await signedIn('B');
    const sent = resend();
    await ask(a, 'shared@imperial.ac.uk');
    await answer(a, codeOf(sent[0]));
    expect((await json(await ask(b, 'shared@imperial.ac.uk'))).body.error.code).toBe('email_in_use');
    // once A's year is over, B may have it
    await env.DB.prepare('UPDATE users SET academic_until = 1 WHERE id = ?').bind(a.user.id).run();
    await ask(b, 'shared@imperial.ac.uk');
    expect((await answer(b, codeOf(sent[1]))).status).toBe(200);
    expect((await env.DB.prepare('SELECT academic_email FROM users WHERE id = ?').bind(a.user.id).first()).academic_email).toBeNull();
  });

  it('gives a university’s licence to someone signed in with a personal address who proves one of its addresses', async () => {
    const ops = (path, body) => call(path, { method: 'POST', origin: null, body: JSON.stringify(body), headers: { Authorization: `Bearer ${OPS}`, 'Content-Type': 'application/json' } });
    const uni = await (await ops('/ops/institutions', { name: 'Email University', domains: ['email-uni.ac.uk'] })).json();
    await ops(`/ops/institutions/${uni.id}/manual`, { until: Date.now() + 86400000, max_users: 'unlimited' });
    const s = await signedIn('Personal Gmail');                       // signed in as t<n>@example.com
    const ws = s.workspaceId;
    expect((await send(`/v1/workspaces/${ws}/benches`, 'POST', s.token, { name: 'B', content: bench('B') })).status).toBe(402);
    const sent = resend();
    await ask(s, 'student@physics.email-uni.ac.uk');
    await answer(s, codeOf(sent[0]));
    vi.restoreAllMocks();
    expect((await me(s)).licence).toEqual({ name: 'Email University', via: 'email' });
    expect((await send(`/v1/workspaces/${ws}/benches`, 'POST', s.token, { name: 'B', content: bench('B') })).status).toBe(201);
    // the university takes them off by that address
    await ops(`/ops/institutions/${uni.id}/remove`, { email: 'student@physics.email-uni.ac.uk' });
    expect((await me(s)).licence).toBeNull();
  });

  it('says so, and keeps no code, when the email cannot be sent or email is not set up', async () => {
    const s = await signedIn();
    resend(500);
    expect((await json(await ask(s, 'x@ucl.ac.uk'))).body.error.code).toBe('email_failed');
    expect(await env.DB.prepare('SELECT 1 FROM email_codes WHERE user_id = ?').bind(s.user.id).first()).toBeNull();
    const key = env.RESEND_API_KEY;
    env.RESEND_API_KEY = '';
    try {
      expect((await json(await ask(s, 'x@ucl.ac.uk'))).body.error.code).toBe('email_off');
    } finally { env.RESEND_API_KEY = key; }
  });

  it('needs a signed-in person, from JEKray2D, and goes with the account', async () => {
    expect((await call('/v1/me/academic/email', { method: 'POST', body: '{"email":"a@ox.ac.uk"}', headers: { 'Content-Type': 'application/json' } })).status).toBe(401);
    const s = await signedIn();
    const sent = resend();
    expect((await call('/v1/me/academic/email', { method: 'POST', token: s.token, origin: 'https://evil.example', body: '{"email":"a@ox.ac.uk"}', headers: { 'Content-Type': 'application/json' } })).status).toBe(403);
    expect(sent).toHaveLength(0);
    await ask(s, 'gone@ox.ac.uk');
    await answer(s, codeOf(sent[0]));
    await ask(s, 'gone2@ox.ac.uk');
    vi.restoreAllMocks();
    expect((await call('/v1/me', { method: 'DELETE', token: s.token, body: JSON.stringify({ confirm: 'delete my account' }), headers: { 'Content-Type': 'application/json' } })).status).toBe(200);
    const u = await env.DB.prepare('SELECT academic_email FROM users WHERE id = ?').bind(s.user.id).first();
    expect(u.academic_email).toBeNull();
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_codes WHERE user_id = ?').bind(s.user.id).first()).n).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE user_id = ?').bind(s.user.id).first()).n).toBe(0);
  });
});
