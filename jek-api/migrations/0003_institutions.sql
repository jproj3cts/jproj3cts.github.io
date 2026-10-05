-- University licences.
--
-- An institution is a workspace of kind 'institution', owned by the JEK
-- Systems user below; its row in subscriptions is the licence (invoiced
-- through Stripe, or a pilot set by hand). Who is in it: anyone with a
-- verified email at one of its domains (institution_domains), or a current
-- affiliation on ORCID with one of its organisations (institution_orgs).

INSERT OR IGNORE INTO users (id, name, created_at) VALUES ('system', 'JEK Systems', 0);

-- ORCID affiliations name organisations by ROR, Ringgold or GRID id.
CREATE TABLE institution_orgs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scheme       TEXT NOT NULL CHECK (scheme IN ('ROR', 'RINGGOLD', 'GRID')),
  value        TEXT NOT NULL,
  PRIMARY KEY (scheme, value)
);
CREATE INDEX institution_orgs_workspace ON institution_orgs(workspace_id);

-- The people an institution's licence covers, and how. An email match is
-- checked afresh each time; an ORCID one holds for a year; removed_at keeps
-- someone an administrator took off from joining again by themselves.
CREATE TABLE licences (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  via          TEXT NOT NULL CHECK (via IN ('email', 'orcid', 'invite')),
  detail       TEXT,
  joined_at    INTEGER NOT NULL,
  until        INTEGER,
  removed_at   INTEGER,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX licences_user ON licences(user_id);

-- Who used JEKray2D Pro through an institution in each month ('2026-10'),
-- for its usage report and price band.
CREATE TABLE licence_months (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  PRIMARY KEY (workspace_id, month, user_id)
);
