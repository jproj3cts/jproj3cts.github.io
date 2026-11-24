-- JEKrf's benches and its RF designer's designs given their tools from their content (src/benches.js toolOf): a .jekrf
-- says format 'jekrf', a .rfd 'jekrfd'. Any saved by an API from before JEKrf were marked 'jekray', so they show as JEKray
-- benches in JEKsuite and cannot be saved again once the API knows JEKrf. Safe to run again: it changes only a bench
-- whose mark and content disagree.
UPDATE benches SET tool = 'jekrf' WHERE tool <> 'jekrf' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekrf';
UPDATE benches SET tool = 'jekrfd' WHERE tool <> 'jekrfd' AND json_valid(head_json) AND json_extract(head_json, '$.format') = 'jekrfd';
