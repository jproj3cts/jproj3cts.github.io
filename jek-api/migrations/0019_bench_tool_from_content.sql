-- A bench's tool set again from its content (src/benches.js toolOf): a .jekion says format 'jekion', a JEKfilm coating
-- format 'jekfilm', anything else is JEKray's. Benches saved by an API from before JEKfilm were all marked 'jekray',
-- so a coating saved then shows as a JEKray bench, opens in JEKray and cannot be saved again from JEKfilm. Safe to run
-- again: it changes only a bench whose mark and content disagree.
UPDATE benches SET tool = 'jekfilm' WHERE tool <> 'jekfilm' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekfilm';
UPDATE benches SET tool = 'jekion' WHERE tool <> 'jekion' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekion';
