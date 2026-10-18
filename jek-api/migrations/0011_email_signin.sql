-- Sign-in with an email address, proved by a code sent to it: for people whose
-- university does not let them sign in with Microsoft, and anyone without a
-- Google or Microsoft account. The address itself is the identity's subject.

-- identities: 'email' joins the providers (SQLite cannot change a CHECK, so the
-- table is rebuilt; nothing references it).
CREATE TABLE identities_new (
  provider    TEXT NOT NULL CHECK (provider IN ('google', 'orcid', 'microsoft', 'email')),
  subject     TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
INSERT INTO identities_new (provider, subject, user_id, created_at) SELECT provider, subject, user_id, created_at FROM identities;
DROP TABLE identities;
ALTER TABLE identities_new RENAME TO identities;
CREATE INDEX identities_user ON identities(user_id);

-- A sign-in code waiting to be typed in: one at a time per address; only its
-- hash is kept. link_user: the signed-in account the address is being added to.
CREATE TABLE signin_codes (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0,
  link_user  TEXT
);
