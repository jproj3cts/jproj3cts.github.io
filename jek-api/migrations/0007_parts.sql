-- My parts: parts and assemblies a person keeps to use on any bench. Each is
-- one or more elements and the fibres between them, as the app copies them
-- (a 'jekray-clip'), with a small picture drawn by the app. They belong to a
-- workspace, as benches do, so a team's library can be shared later.
CREATE TABLE parts (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  summary      TEXT NOT NULL,           -- what it is, e.g. "Lens" or "3 parts"
  palette      TEXT NOT NULL,           -- where the app lists it: free, fibre, elec or pic
  content      TEXT NOT NULL,           -- the clip, at most 256 KB
  size_bytes   INTEGER NOT NULL,
  icon         TEXT,                    -- a data: URL, a PNG of at most 24 KB
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  updated_at   INTEGER NOT NULL
);
CREATE INDEX parts_workspace ON parts(workspace_id, name);
