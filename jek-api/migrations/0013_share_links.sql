-- Share links: a bench as a short link anyone can open (src/links.js). Only
-- someone with a plan can make one. The bench itself is in R2 (r2_key,
-- l/<user>/<id>), as the app wrote it; the row says whose it is and how often
-- it has been opened. Links go with their maker's account.
CREATE TABLE share_links (
  id          TEXT PRIMARY KEY,               -- 10 base-32 capitals: the /s/ part of the link
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  opens       INTEGER NOT NULL DEFAULT 0,
  opened_at   INTEGER
);
CREATE INDEX share_links_user ON share_links(user_id, created_at);
