-- Exercises (src/exercises.js): which of JEKray's exercises a person has solved, so a free account keeps its
-- progress across browsers. The exercise's id, when it was first solved and in how many changes (the fewest).
-- Deleted with the account.
CREATE TABLE exercises_solved (
  user_id    TEXT NOT NULL,
  ex_id      TEXT NOT NULL,                 -- the app's exercise id (core/exercises.js), short and plain
  solved_at  INTEGER NOT NULL,              -- ms
  changes    INTEGER NOT NULL,              -- the fewest it was solved in
  PRIMARY KEY (user_id, ex_id)
);
