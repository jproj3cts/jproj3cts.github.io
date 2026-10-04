import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../src/users.js';
import { newId, now } from '../src/util.js';

const TABLES = [
  'users', 'identities', 'sessions', 'workspaces', 'members', 'invitations', 'subscriptions',
  'folders', 'benches', 'bench_versions', 'institution_domains', 'jobs', 'audit',
];

describe('schema', () => {
  it('has every table in the design', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all();
    const names = results.map((r) => r.name);
    for (const t of TABLES) expect(names).toContain(t);
  });

  it('creates a user with one personal workspace they own', async () => {
    const { user, workspaceId } = await createUser(env, { name: 'Ada' });
    expect(user.id).toMatch(/^[0-9a-f]{32}$/);
    const m = await env.DB.prepare('SELECT role, seat FROM members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, user.id).first();
    expect(m).toEqual({ role: 'owner', seat: 1 });
    // A second personal workspace for the same user is refused.
    await expect(
      env.DB.prepare("INSERT INTO workspaces VALUES (?, 'personal', 'x', ?, ?)").bind(newId(), user.id, now()).run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('keeps one identity per provider subject', async () => {
    const a = await createUser(env, { name: 'A' });
    const b = await createUser(env, { name: 'B' });
    const ins = (u) => env.DB.prepare("INSERT INTO identities VALUES ('orcid', '0000-0002-1825-0097', ?, ?)").bind(u, now()).run();
    await ins(a.user.id);
    await expect(ins(b.user.id)).rejects.toThrow(/UNIQUE|PRIMARY/);
  });

  it('enforces roles, providers and invitation targets', async () => {
    const { user, workspaceId } = await createUser(env, { name: 'C' });
    await expect(
      env.DB.prepare("INSERT INTO members VALUES (?, ?, 'god', 1, ?)").bind(workspaceId, user.id, now()).run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      env.DB.prepare("INSERT INTO identities VALUES ('github', 'x', ?, ?)").bind(user.id, now()).run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      env.DB.prepare("INSERT INTO invitations (id, workspace_id, role, token_hash, invited_by, created_at, expires_at) VALUES (?, ?, 'editor', ?, ?, 0, 0)")
        .bind(newId(), workspaceId, newId(), user.id).run(),
    ).rejects.toThrow(/CHECK/);
  });

  it('enforces foreign keys', async () => {
    await expect(
      env.DB.prepare("INSERT INTO sessions VALUES ('h', 'nobody', 0, 0, '')").run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('removes sessions and memberships with the user', async () => {
    const { user } = await createUser(env, { name: 'D' });
    await env.DB.prepare("INSERT INTO sessions VALUES ('hd', ?, 0, 0, '')").bind(user.id).run();
    // Personal workspace first (it references the owner), then the user.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM workspaces WHERE owner_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    const left = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM sessions WHERE user_id = ?1) + (SELECT COUNT(*) FROM members WHERE user_id = ?1) AS n')
      .bind(user.id).first();
    expect(left.n).toBe(0);
  });
});
