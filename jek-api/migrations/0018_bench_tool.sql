-- Which tool a cloud bench belongs to: 'jekray' (a .jekray, format 'jek-raytracer') or 'jekion' (a .jekion,
-- format 'jekion'). Set from the content when a bench is made, kept by forks and restores, and never changed by
-- a save (src/benches.js). Both tools' benches live in the same workspaces; each tool lists its own by default
-- (?tool=) and shows the other's with a mark, opening them in the other tool.
ALTER TABLE benches ADD COLUMN tool TEXT NOT NULL DEFAULT 'jekray';
