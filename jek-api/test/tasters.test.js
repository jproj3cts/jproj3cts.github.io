// What is left of the tasters: a free account's share links, as the app asks after them. The month's free uses of
// JEKrayPro's in-browser work are gone (that work is a free account's now), so there is nothing to spend.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, send, signedIn } from './helpers.js';
import { TASTERS, thisMonth } from '../src/tasters.js';

const json = async (res) => ({ status: res.status, body: await res.json() });

describe('tasters', () => {
  it('reports a free account’s share links left, and has no month’s uses to spend', async () => {
    const a = await signedIn('Ada');
    const start = await json(await send('/v1/tasters', 'GET', a.token));
    expect(start.status).toBe(200);
    expect(start.body.month).toBe(thisMonth());
    expect(TASTERS).toEqual({});
    expect(start.body.left).toEqual({ share: 3 });
    expect(start.body.limits).toEqual({ share: 3 });
    for (const f of ['optimise', 'script', 'nothing']) expect((await send('/v1/tasters/' + f, 'POST', a.token)).status).toBe(404);
  });

  it('needs a sign-in, and what was counted goes with the account', async () => {
    expect((await call('/v1/tasters')).status).toBe(401);
    const c = await signedIn('Cy');
    await env.DB.prepare("INSERT INTO taster_uses (user_id, feature, month, n) VALUES (?, 'script', ?, 1)").bind(c.user.id, thisMonth()).run();
    expect((await send('/v1/me', 'DELETE', c.token, { confirm: 'delete my account' })).status).toBeLessThan(300);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM taster_uses WHERE user_id = ?').bind(c.user.id).first()).n).toBe(0);
  });
});
