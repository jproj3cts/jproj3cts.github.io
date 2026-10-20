import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call } from './helpers.js';

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
const ask = (body, opts = {}) => call('/v1/remind', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, ...opts });

describe('a link to the app emailed from a phone', () => {
  it('sends the same fixed email, whatever else the request carries, and keeps no address', async () => {
    const sent = resend();
    const r = await ask({ email: ' Ada@Example.org ', name: '<b>Buy now</b>', message: 'http://evil.example' });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['ada@example.org']);
    expect(sent[0].text).toContain(env.APP_URL + '?src=email');
    expect(sent[0].html + sent[0].text).not.toMatch(/Buy now|evil/);
    const rows = (await env.DB.prepare("SELECT email FROM email_sends WHERE user_id = 'remind'").all()).results;
    expect(rows.length).toBe(1);
    expect(rows[0].email).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sends one address at most twice a day', async () => {
    resend();
    expect((await ask({ email: 'bob@example.org' })).status).toBe(200);
    expect((await ask({ email: 'bob@example.org' })).status).toBe(200);
    const r = await ask({ email: 'BOB@example.org' });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe('already_sent');
  });

  it('takes only an address, and only from the app’s own pages', async () => {
    const sent = resend();
    for (const email of ['', 'not an address', 'a@b', 'x'.repeat(300) + '@example.org']) expect((await ask({ email })).status).toBe(400);
    expect((await ask({ email: 'c@example.org' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect(sent).toHaveLength(0);
  });
});
