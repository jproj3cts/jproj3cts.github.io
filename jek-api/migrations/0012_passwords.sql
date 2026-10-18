-- A password of one's own, beside (never instead of) the email sign-in: an
-- account signs in with its address and password, or by a code sent to the
-- address, which is also how a forgotten password is replaced. Only a salted
-- PBKDF2 hash is kept.
CREATE TABLE passwords (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hash       TEXT NOT NULL,
  salt       TEXT NOT NULL,
  iters      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Wrong passwords, counted per address and per network address: ten in a
-- quarter of an hour locks that key for a quarter of an hour.
CREATE TABLE password_fails (
  key   TEXT PRIMARY KEY,
  n     INTEGER NOT NULL,
  until INTEGER NOT NULL
);
