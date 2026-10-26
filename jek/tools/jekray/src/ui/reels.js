/* ---------- The benches from our Instagram reels ----------
   What the "From Instagram" note lists (ui/landing.js), newest first: one line a reel. Each has a title, a short
   line, and either `demo`, an example's id from EXAMPLES in ui/news.js (its picture comes from demos/thumbs/), or
   `bench`, a whole bench as a .jekray file's JSON (File › Save, then paste the file's text here). `id` is short and
   new for each reel: the note shows again to someone who closed it once a reel with a new first id is added.
   Every new reel adds its bench here, at the top, the day it is posted (.claude/commands/instagram-conversion.md): a
   copy of the bench as the reel shows it, as `bench`; `demo` only when the reel shows an example exactly as it ships.
     { id: 'ig-slug', title: 'What the reel shows', line: 'One short line on what to try.', bench: { ...the .jekray file... } }, */
export const REELS = [
  { id: 'michelson', title: 'Michelson interferometer', line: 'Move a mirror and watch the fringes walk.', demo: 'michelson' },
  { id: 'czerny-turner', title: 'Czerny\u2013Turner spectrometer', line: 'A slit, two mirrors and a grating spread out the lines.', demo: 'czerny-turner' },
  { id: 'poisson-spot', title: 'Poisson\u2019s spot', line: 'The bright spot in the shadow of a disc.', demo: 'poissons-spot' },
];
