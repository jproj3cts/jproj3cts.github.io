-- Forks: a bench copied from another (or from one of its versions) keeps
-- where it came from. The name is kept as it was, so the origin still reads
-- right after the original is renamed, deleted or out of reach.
ALTER TABLE benches ADD COLUMN forked_from TEXT;
ALTER TABLE benches ADD COLUMN forked_version INTEGER;
ALTER TABLE benches ADD COLUMN forked_name TEXT;
CREATE INDEX benches_forked_from ON benches(forked_from);
