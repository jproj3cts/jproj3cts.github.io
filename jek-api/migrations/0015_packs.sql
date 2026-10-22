-- Signed part packs (src/packs.js). Nothing of a pack itself is kept: only
-- its id, its hash, who signed it and when, and whether it was taken down.

-- An id belongs to whoever first signed a pack with it: a person (their user
-- id) or an organisation (a team's workspace id, or 'jek' for JEK Systems).
-- blocked_at: taken down by id, and no more signing of it.
CREATE TABLE pack_ids (
  id          TEXT PRIMARY KEY,
  owner_kind  TEXT NOT NULL CHECK (owner_kind IN ('person', 'org')),
  owner_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  blocked_at  INTEGER,
  reason      TEXT
);
CREATE INDEX pack_ids_owner ON pack_ids(owner_kind, owner_id);

-- Each signature, by the SHA-256 of the pack it signed. revoked_at: taken
-- down, with the reason shown to whoever has the pack.
CREATE TABLE pack_sigs (
  hash         TEXT PRIMARY KEY,
  id           TEXT NOT NULL,
  pack_version TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('parts', 'module')),
  signer_kind  TEXT NOT NULL CHECK (signer_kind IN ('person', 'org')),
  signer_id    TEXT NOT NULL,
  signer_name  TEXT,                    -- the name signed with; emptied when the account goes
  domain       TEXT,
  asked_by     TEXT,                    -- the person who asked (for a team, which member); null for JEK Systems
  signed_at    INTEGER NOT NULL,
  revoked_at   INTEGER,
  reason       TEXT
);
CREATE INDEX pack_sigs_id ON pack_sigs(id);
CREATE INDEX pack_sigs_signer ON pack_sigs(signer_kind, signer_id);

-- Set by JEK Systems: 'jek' may sign ids under jek.; 'blocked' may sign nothing.
CREATE TABLE pack_flags (
  owner_kind  TEXT NOT NULL CHECK (owner_kind IN ('person', 'org')),
  owner_id    TEXT NOT NULL,
  flag        TEXT NOT NULL CHECK (flag IN ('jek', 'blocked')),
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (owner_kind, owner_id, flag)
);

-- A team that signs packs as itself: its domain, checked by JEK Systems.
CREATE TABLE pack_orgs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  domain       TEXT NOT NULL UNIQUE,
  verified_at  INTEGER NOT NULL
);
