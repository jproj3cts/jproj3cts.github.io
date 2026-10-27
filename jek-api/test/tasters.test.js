// Tasters: a free account's monthly uses of JEKrayPro's in-browser work, counted per person and month on the
// server, spent one at a time, refused once spent, and gone with the account.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, send, signedIn } from './helpers.js';
import { TASTERS, thisMonth } from '../src/tasters.js';

const json = async (res) => ({ status: res.status, body: await res.json() });

describe('tasters', () => {
  it('lists this month’s allowance, spends one at a time, refuses the one past it, and keeps people apart', async () => {
    const a = await signedIn('Ada'), b = await signedIn('Bea');
    const start = await json(await send('/v1/tasters', 'GET', a.token));
    expect(start.status).toBe(200);
    expect(start.body.month).toBe(thisMonth());
    expect(start.body.left).toEqual(Object.assign({}, TASTERS, { share: 3 }));
    for (let i = TASTERS.optimise - 1; i >= 0; i--) {
      const r = await json(await send('/v1/tasters/optimise', 'POST', a.token));
      expect(r.status).toBe(200);
      expect(r.body.left).toBe(i);
    }
    const over = await json(await send('/v1/tasters/optimise', 'POST', a.token));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('taster_used');
    expect((await json(await send('/v1/tasters', 'GET', a.token))).body.left.optimise).toBe(0);
    expect((await json(await send('/v1/tasters', 'GET', b.token))).body.left.optimise).toBe(TASTERS.optimise);
    expect((await send('/v1/tasters/nothing', 'POST', a.token)).status).toBe(404);
  });

  it('needs a sign-in, and goes with the account', async () => {
    expect((await call('/v1/tasters')).status).toBe(401);
    const c = await signedIn('Cy');
    await send('/v1/tasters/script', 'POST', c.token);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM taster_uses WHERE user_id = ?').bind(c.user.id).first()).n).toBe(1);
    expect((await send('/v1/me', 'DELETE', c.token, { confirm: 'delete my account' })).status).toBeLessThan(300);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM taster_uses WHERE user_id = ?').bind(c.user.id).first()).n).toBe(0);
  });
});
