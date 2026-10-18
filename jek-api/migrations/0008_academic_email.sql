-- The academic price (and a university licence) through a university email
-- address the person proves they read, by a code sent to it: for people who
-- sign in with a personal Google account, or whose university does not let
-- them sign in with Microsoft.
ALTER TABLE users ADD COLUMN academic_email TEXT;   -- the address proved, while academic_until lasts
CREATE INDEX users_academic_email ON users(academic_email);

-- A code waiting to be typed in: one at a time per person; only its hash is kept.
CREATE TABLE email_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0
);

-- Codes sent, for the limits on how often (per person and per address); kept a day.
CREATE TABLE email_sends (
  email   TEXT NOT NULL,
  user_id TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX email_sends_email ON email_sends(email, at);
CREATE INDEX email_sends_user ON email_sends(user_id, at);
