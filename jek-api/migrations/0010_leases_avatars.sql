-- Editing leases: while someone has a bench open to edit, they hold its
-- lease (renewed every minute, good for two); others see who is editing and
-- open it to look, and can take the lease over. A save against another
-- person's live lease is refused.
CREATE TABLE bench_leases (
  bench_id  TEXT PRIMARY KEY REFERENCES benches(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  since     INTEGER NOT NULL,
  until     INTEGER NOT NULL
);
CREATE INDEX bench_leases_user ON bench_leases(user_id);

-- A profile picture (R2, u/<user>/a/<id>), shown beside the person's name to
-- the people they share a workspace with.
ALTER TABLE users ADD COLUMN avatar_key TEXT;
