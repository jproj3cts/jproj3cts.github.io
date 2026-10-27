-- Tasters (src/tasters.js): a free account's monthly allowance of the JEKrayPro work that runs in the
-- browser (the designers' optimiser, tolerancing, scripts, reports, drawings, design and data exports).
-- A count of uses a month for each, per person; a month's row is only ever counted up. Deleted with the
-- account; rows older than 13 months go.
CREATE TABLE taster_uses (
  user_id  TEXT NOT NULL,
  feature  TEXT NOT NULL,                 -- one of src/tasters.js TASTERS
  month    TEXT NOT NULL,                 -- UTC, YYYY-MM
  n        INTEGER NOT NULL,
  PRIMARY KEY (user_id, feature, month)
);
