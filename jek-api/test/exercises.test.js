// Exercises: which a person has solved, kept with the account: the first time and the fewest changes, per person,
// checked ids, and gone with the account.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { call, send, signedIn } from './helpers.js';

const json = async (res) => ({ status: res.status, body: await res.json() });

describe('exercises', () => {
  it('records one solved, keeps the first time and the fewest changes, and keeps people apart', async () => {
    const a = await signedIn('Ada'), b = await signedIn('Bea');
    expect((await json(await send('/v1/exercises', 'GET', a.token))).body.solved).toEqual([]);
    const one = await json(await send('/v1/exercises/aim-a-mirror', 'POST', a.token, { changes: 6, at: 1000 }));
    expect(one.status).toBe(200);
    expect(one.body.solved).toEqual([{ id: 'aim-a-mirror', at: 1000, changes: 6 }]);
    await send('/v1/exercises/aim-a-mirror', 'POST', a.token, { changes: 3, at: 5000 });
    await send('/v1/exercises/aim-a-mirror', 'POST', a.token, { changes: 9 });
    const now = (await json(await send('/v1/exercises', 'GET', a.token))).body.solved;
    expect(now).toEqual([{ id: 'aim-a-mirror', at: 1000, changes: 3 }]);
    expect((await json(await send('/v1/exercises', 'GET', b.token))).body.solved).toEqual([]);
    expect((await send('/v1/exercises/Not%20one', 'POST', a.token, {})).status).toBe(400);
  });

  it('needs a sign-in, and goes with the account', async () => {
    expect((await call('/v1/exercises')).status).toBe(401);
    const c = await signedIn('Cy');
    await send('/v1/exercises/thread-both-irises', 'POST', c.token, { changes: 2 });
    const n = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM exercises_solved WHERE user_id = ?').bind(c.user.id).first()).n;
    expect(await n()).toBe(1);
    expect((await send('/v1/me', 'DELETE', c.token, { confirm: 'delete my account' })).status).toBeLessThan(300);
    expect(await n()).toBe(0);
  });
});
