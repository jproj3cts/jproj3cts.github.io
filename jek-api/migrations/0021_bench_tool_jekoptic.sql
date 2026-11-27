-- A design's tool set from its content (src/benches.js toolOf): a .optic, from JEKray's Optics designer, says format
-- 'jekoptic'. Designs saved by an API from before the Optics designer were marked 'jekray', so they show as JEKray
-- benches in JEKsuite and cannot be saved again once the API knows the Optics designer. Safe to run again: it changes
-- only a bench whose mark and content disagree.
UPDATE benches SET tool = 'jekoptic' WHERE tool <> 'jekoptic' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekoptic';
