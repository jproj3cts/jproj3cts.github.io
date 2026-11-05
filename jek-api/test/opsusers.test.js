import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bench, call, send, signedIn, withPlan } from './helpers.js';
import { csv, html, text } from '../scripts/users.mjs';

const OPS = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const list = async () => (await call('/ops/users', { origin: null, headers: { Authorization: `Bearer ${OPS}` } })).json();

describe('people with accounts (ops)', () => {
  it('answers 404 without the ops token, as to anyone guessing at /ops', async () => {
    expect((await call('/ops/users', { origin: null })).status).toBe(404);
    expect((await call('/ops/users', { origin: null, headers: { Authorization: 'Bearer nope' } })).status).toBe(404);
  });

  it('lists each person with their sign-ins, plan and what their account holds, and never a bench\'s contents', async () => {
    const free = await signedIn('Free Person');
    const pro = await signedIn('Pro Person');
    await withPlan(pro.workspaceId);
    await env.DB.prepare("INSERT INTO identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)").bind('g-' + pro.user.id, pro.user.id, Date.now()).run();
    const secret = 'A bench whose contents must not leak';
    const made = await send(`/v1/workspaces/${pro.workspaceId}/benches`, 'POST', pro.token, { name: 'Michelson', content: bench(secret) });
    expect(made.status).toBe(201);
    await env.DB.prepare('INSERT INTO exercises_solved (user_id, ex_id, solved_at, changes) VALUES (?, ?, ?, 1)').bind(pro.user.id, 'focus', Date.now()).run();

    const r = await list();
    const p = r.users.find((u) => u.id === pro.user.id), f = r.users.find((u) => u.id === free.user.id);
    expect(p).toMatchObject({ name: 'Pro Person', plan: 'individual', benches: 1, exercises: 1, live_sessions: 1 });
    expect(p.signs_in_with).toContain('google');
    expect(p.last_saved).toBeGreaterThan(0);
    expect(p.last_active).toBeGreaterThan(Date.now() - 86400000);
    expect(f).toMatchObject({ plan: 'free', benches: 0, signs_in_with: [] });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.summary.people).toBeGreaterThanOrEqual(2);
    expect(r.summary.paying).toBeGreaterThanOrEqual(1);
    expect(r.summary.joined_7d).toBeGreaterThanOrEqual(2);
    expect(r.weeks).toHaveLength(26);
    expect(r.weeks.at(-1).joined).toBeGreaterThanOrEqual(2);
  });

  it('leaves out deleted accounts', async () => {
    const gone = await signedIn('Gone Person');
    await env.DB.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').bind(Date.now(), gone.user.id).run();
    expect((await list()).users.some((u) => u.id === gone.user.id)).toBe(false);
  });

  it('turns the answer into a terminal table, a spreadsheet and a page', async () => {
    await signedIn('Ada, "the" Tester');
    const r = await list();
    expect(text(r)).toContain('people with accounts');
    const c = csv(r);
    expect(c.startsWith('﻿name,email,joined')).toBe(true);
    expect(c).toContain('"Ada, ""the"" Tester"');
    const h = html(r);
    expect(h).toContain('<title>JEKray accounts</title>');
    expect(h).toContain('Ada, &quot;the&quot; Tester');
    expect(h).not.toContain('<script>alert');
  });
});

describe('people with accounts, on a database a migration has not reached', () => {
  it('still answers, leaving out what it could not read and saying so', async () => {
    await signedIn('Still Listed');
    await env.DB.prepare('ALTER TABLE taster_uses RENAME TO taster_uses_away').run();
    try {
      const res = await call('/ops/users', { origin: null, headers: { Authorization: `Bearer ${OPS}` } });
      expect(res.status).toBe(200);
      const r = await res.json();
      expect(r.users.some((u) => u.name === 'Still Listed')).toBe(true);
      expect(r.problems.length).toBe(1);
      expect(r.problems[0].query).toContain('taster_uses');
      expect(text(r)).toContain('Left out');
    } finally {
      await env.DB.prepare('ALTER TABLE taster_uses_away RENAME TO taster_uses').run();
    }
  });
});
