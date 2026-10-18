-- Sign-ins in progress, kept here rather than in KV (whose free plan allows
-- 1,000 writes a day, which a stream of started sign-ins could use up).
-- Keyed by the SHA-256 of the state; each is used once, and the daily cron
-- removes any left behind.
CREATE TABLE oauth_states (
  hash        TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
