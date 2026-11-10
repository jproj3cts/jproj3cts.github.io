-- A JEKcad part studio's tool set from its content (src/benches.js toolOf): a .jekcad says format 'jekcad'. Part
-- studios saved by an API from before JEKcad were all marked 'jekray', so they show as JEKray benches in JEKsuite,
-- are missing from JEKcad's own list there, and cannot be saved again once the API knows JEKcad. Safe to run again:
-- it changes only a bench whose mark and content disagree.
UPDATE benches SET tool = 'jekcad' WHERE tool <> 'jekcad' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekcad';
