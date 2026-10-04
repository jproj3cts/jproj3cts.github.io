-- JEKray2D accounts, workspaces and cloud benches.
-- Ids are random 128-bit hex strings; times are UTC milliseconds.

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,                     -- only when a provider verified it
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE identities (
  provider    TEXT NOT NULL CHECK (provider IN ('google', 'orcid')),
  subject     TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 of the cookie; the token is never stored
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('personal', 'team', 'institution')),
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);
-- Every user has exactly one personal workspace.
CREATE UNIQUE INDEX workspaces_one_personal ON workspaces(owner_id) WHERE kind = 'personal';

CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  seat         INTEGER NOT NULL DEFAULT 1, -- a viewer takes no paid seat
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

CREATE TABLE invitations (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT,
  orcid        TEXT,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  token_hash   TEXT NOT NULL UNIQUE,
  invited_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  CHECK (email IS NOT NULL OR orcid IS NOT NULL)
);
CREATE INDEX invitations_workspace ON invitations(workspace_id);

-- Mirrored from Stripe webhooks; never set by the app.
CREATE TABLE subscriptions (
  workspace_id        TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_customer     TEXT NOT NULL,
  stripe_subscription TEXT UNIQUE,
  plan                TEXT NOT NULL CHECK (plan IN ('individual', 'academic', 'team', 'institution')),
  seats               INTEGER NOT NULL DEFAULT 1,
  status              TEXT NOT NULL,     -- Stripe's: active, trialing, past_due, canceled, ...
  period_end          INTEGER,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX subscriptions_customer ON subscriptions(stripe_customer);

CREATE TABLE folders (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX folders_workspace ON folders(workspace_id, parent_id);

CREATE TABLE benches (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  head_json    TEXT NOT NULL,           -- the current .jekray, at most 2 MB
  head_version INTEGER NOT NULL DEFAULT 1,
  size_bytes   INTEGER NOT NULL,
  thumb_key    TEXT,
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT NOT NULL REFERENCES users(id),
  deleted_at   INTEGER                  -- in the bin for 30 days
);
CREATE INDEX benches_workspace ON benches(workspace_id, folder_id, deleted_at);

CREATE TABLE bench_versions (
  bench_id    TEXT NOT NULL REFERENCES benches(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  r2_key      TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  label       TEXT,
  PRIMARY KEY (bench_id, version)
);

-- Phase 2: automatic joining by university domain.
CREATE TABLE institution_domains (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain       TEXT NOT NULL UNIQUE,
  verified_at  INTEGER,
  PRIMARY KEY (workspace_id, domain)
);

-- Later: foundry export and other server work. A job names a bench version,
-- never the live bench.
CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bench_id      TEXT NOT NULL REFERENCES benches(id),
  bench_version INTEGER NOT NULL,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  inputs_key    TEXT,
  outputs_key   TEXT,
  cost          INTEGER,                -- pence
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX jobs_workspace ON jobs(workspace_id, created_at);

CREATE TABLE audit (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target       TEXT,
  at           INTEGER NOT NULL
);
CREATE INDEX audit_workspace ON audit(workspace_id, at);
