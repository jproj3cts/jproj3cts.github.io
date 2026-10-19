-- Usage counts (src/usage.js): how the app is used, as counts a day, for
-- everyone alike. Nothing here says who: no account, session, address or
-- browser id, only what was done, a short token about it (a part's type, an
-- export's format), and whether it was done signed out, on the free plan or
-- with JEKrayPro. Kept 25 months; errors 90 days.
CREATE TABLE usage_daily (
  day    TEXT NOT NULL,                 -- UTC, YYYY-MM-DD
  event  TEXT NOT NULL,                 -- one of src/usage.js EVENTS
  prop   TEXT NOT NULL DEFAULT '',      -- a short token, or ''
  tier   TEXT NOT NULL,                 -- anon, free or pro
  n      INTEGER NOT NULL,
  PRIMARY KEY (day, event, prop, tier)
);
-- The app's own errors, so they can be fixed: the message (with anything in
-- quotes and any number taken out by the app) and where in the app it was.
CREATE TABLE usage_errors (
  day    TEXT NOT NULL,
  msg    TEXT NOT NULL,
  src    TEXT NOT NULL,
  n      INTEGER NOT NULL,
  PRIMARY KEY (day, msg, src)
);
