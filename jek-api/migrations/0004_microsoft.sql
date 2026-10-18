-- Sign-in with Microsoft (university and work accounts), universities found
-- by their Microsoft tenant, and people a university invites.

-- identities: 'microsoft' joins the providers (SQLite cannot change a CHECK,
-- so the table is rebuilt; nothing references it). A Microsoft subject is
-- '<tenant id>:<object id>'.
CREATE TABLE identities_new (
  provider    TEXT NOT NULL CHECK (provider IN ('google', 'orcid', 'microsoft')),
  subject     TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
INSERT INTO identities_new (provider, subject, user_id, created_at) SELECT provider, subject, user_id, created_at FROM identities;
DROP TABLE identities;
ALTER TABLE identities_new RENAME TO identities;
CREATE INDEX identities_user ON identities(user_id);

-- licences: 'microsoft' (their university's tenant) joins the ways in.
CREATE TABLE licences_new (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  via          TEXT NOT NULL CHECK (via IN ('email', 'orcid', 'invite', 'microsoft')),
  detail       TEXT,
  joined_at    INTEGER NOT NULL,
  until        INTEGER,
  removed_at   INTEGER,
  PRIMARY KEY (workspace_id, user_id)
);
INSERT INTO licences_new SELECT workspace_id, user_id, via, detail, joined_at, until, removed_at FROM licences;
DROP TABLE licences;
ALTER TABLE licences_new RENAME TO licences;
CREATE INDEX licences_user ON licences(user_id);

-- A university's Microsoft Entra tenants: anyone signing in from one is its.
CREATE TABLE institution_tenants (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tenant       TEXT NOT NULL PRIMARY KEY
);
CREATE INDEX institution_tenants_workspace ON institution_tenants(workspace_id);

-- People a university's administrators include who have no university
-- address: covered when they sign in with this verified email.
CREATE TABLE institution_invites (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, email)
);
CREATE INDEX institution_invites_email ON institution_invites(email);
