/* ---------- Exercises ----------
   Short exercises on the bench, each with a goal the bench itself checks (ui/challenge.js): a part, what is measured
   on it (a key of the optimiser's measures, ui/optimise.js METRICS: key) or one of its own settings (field: x, y,
   angle…, so a part must be where it is wanted, not deleted), and above, below or within ± a value. Only the
   parts in `unlocked`, and only those settings, can be changed while one is on; everything else is held. Each starts
   from one of our reels' benches (ui/reels.js), changed as `start` says. In order they make a short course (Help ›
   Exercises); the ones with a `reel` are also that reel's challenge, offered to visitors who come from it. Nothing of
   this goes in a bench file: a bench saved during an exercise is an ordinary bench.
   optimiser: the range JEKrayPro's optimiser searches for each setting, offered after the second hint; left out where
   it cannot find the answer (thread-both-irises reads nothing until both irises pass, so it has nothing to climb).
   result(v): the line once solved, from the checks' values in order. Figures measured on the benches as given:
   each exercise's answer is checked in the browser suite (jekray-tests.html, group 'Exercises'). */
const fix = (v, d) => (+v).toFixed(d);
export const EXERCISES = [
  { id: 'aim-a-mirror', title: 'Aim with a mirror', teaches: 'A mirror turned by an angle turns the beam by twice that.',
    start: { reel: 'ig-90-turn-always', set: { 'Mirror 2': { angle: 296.5 } } },
    goal: 'Put the spot in the middle of the Screen.',
    checks: [{ part: 'Screen', key: 'centroid', op: 'within', value: 0, tol: 0.5 }],
    unlocked: { 'Mirror 2': ['angle'] },
    hints: ['Turn Mirror 2 a little and watch how far the spot moves.', 'Each degree moves the spot about 2.2 mm. Turn it back about 4°.'],
    answer: { 'Mirror 2': { angle: 292.5 } },
    optimiser: { 'Mirror 2': { angle: [286.5, 306.5] } },
    result: () => 'spot centred' },
  { id: 'focus-a-camera', title: 'Focus a camera', teaches: 'A near object focuses further behind the lens, so the focus ring moves the lens out.',
    start: { reel: 'ig-focus-ring' },
    goal: 'Make the Object sharp on the Sensor.',
    checks: [{ part: 'Sensor', key: 'rms', op: 'below', value: 0.03 }],
    unlocked: { Lens: ['x'] },
    hints: ['Move the lens along the beam and watch the spot.', 'The lens needs to move about 11 mm towards the Object.'],
    answer: { Lens: { x: -11.4 } },
    optimiser: { Lens: { x: [-15, 15] } },
    result: () => 'Object sharp on the Sensor' },
  { id: 'find-a-focal-length', title: 'Find a lens’s focal length', teaches: 'Autocollimation: a point at the focus comes back to itself off a flat mirror, at any mirror distance.',
    start: { reel: 'ig-one-mirror-finds-f' },
    goal: 'Make the returning spot on the Screen as small as you can.',
    checks: [{ part: 'Screen', key: 'rms', op: 'below', value: 0.05 }],
    unlocked: { Lens: ['x'] },
    hints: ['The spot is smallest when the light between the lens and the mirror runs parallel.', 'That happens when the source sits one focal length from the lens.'],
    answer: { Lens: { x: -29.6 } },
    optimiser: { Lens: { x: [-45, -20] } },
    result: () => 'returning spot sharp: the focal length is the lens’s distance from the source' },
  { id: 'focus-into-a-fibre', title: 'Focus into a fibre', teaches: 'A fibre’s core is microns wide, so its focus must be placed to a few hundredths of a millimetre.',
    start: { reel: 'ig-hairs-gap', set: { 'Fibre A in': { x: 22 } } },
    goal: 'Get the light into fibre A.',
    checks: [{ part: 'Fibre A in', key: 'couple', op: 'above', value: 90 }],
    unlocked: { 'Fibre A in': ['x'] },
    hints: ['The lens brings the beam to a point; the fibre’s end must sit exactly there.', 'Type the position rather than dragging: it’s within 1 mm of the start, closer to the lens.'],
    answer: { 'Fibre A in': { x: 21 } },
    optimiser: { 'Fibre A in': { x: [7, 37] } },
    result: v => fix(v[0], 1) + '% into fibre A' },
  { id: 'close-the-gap', title: 'Close the gap', teaches: 'Light spreads as it leaves a fibre, so connectors press the ends together.',
    start: { reel: 'ig-hairs-gap', set: { 'End B': { x: -9.93 } } },
    goal: 'Get the light into fibre B.',
    checks: [{ part: 'Detector', key: 'dmw', op: 'above', value: 0.95 }],
    unlocked: { 'End B': ['x'] },
    hints: ['The light spreads out as it crosses the gap.', 'Bring End B to within 10 µm of End A.'],
    answer: { 'End B': { x: -9.995 } },
    optimiser: { 'End B': { x: [-25, 5] } },
    result: v => fix(v[0], 3) + ' mW reaches fibre B' },
  { id: 'steer-with-a-lens', title: 'Steer with a lens', teaches: 'Sliding a lens sideways steers the beam, by the slide over the focal length.',
    start: { reel: 'ig-lens-steer' },
    goal: 'Move the spot 4 mm across the Target without turning anything.',
    checks: [{ part: 'Target', key: 'centroid', op: 'within', value: 4, tol: 0.2 }],
    unlocked: { 'Lens 2': ['y'] },
    hints: ['Slide Lens 2 sideways, across the beam, not along it.', 'About 1 mm of slide moves the spot about 4 mm.'],
    answer: { 'Lens 2': { y: -1.02 } },
    optimiser: { 'Lens 2': { y: [-15, 15] } },
    result: () => 'spot moved 4 mm, nothing turned' },
  { id: 'double-the-beam', reel: 'ig-double-beam', title: 'Double the beam', teaches: 'Two lenses whose focuses meet make a telescope: the beam leaves as wide as their focal lengths’ ratio.',
    start: { reel: 'ig-double-beam' },
    goal: 'Make the beam twice as wide, 4 mm, on both cards.',
    checks: [{ part: 'Near card', key: 'full', op: 'within', value: 4, tol: 0.2 }, { part: 'Far card', key: 'full', op: 'within', value: 4, tol: 0.2 }],
    unlocked: { 'Lens 2': ['x'] },
    hints: ['Find where Lens 1 brings the light to a point.', 'Put Lens 2 so its own focus falls on that point, about 77 mm after Lens 1.'],
    answer: { 'Lens 2': { x: 0 } },
    optimiser: { 'Lens 2': { x: [-40, 20] } },
    result: () => '4 mm on both cards' },
  { id: 'thread-both-irises', reel: 'ig-thread-both-irises', title: 'Thread both irises', teaches: 'Two mirrors set a beam’s position and its angle, which one mirror alone cannot.',
    start: { reel: 'ig-thread-both-irises' },
    goal: 'Get the light through both irises to the Detector.',
    checks: [{ part: 'Detector', key: 'dmw', op: 'above', value: 0.9 }],
    unlocked: { 'Mirror 1': ['angle'], 'Mirror 2': ['angle'] },
    hints: ['One mirror can put the beam through one iris, but not both. The other mirror sets where it starts from.', 'Turn Mirror 1 until the beam passes Iris 1, then Mirror 2 until it passes Iris 2. Repeat, each time turning the same way.'],
    answer: { 'Mirror 1': { angle: 133.567 }, 'Mirror 2': { angle: 313.567 } },
    result: v => fix(v[0], 2) + ' mW through both irises' },
  { id: 'get-both-sharp', reel: 'ig-both-sharp', title: 'Get both sharp', teaches: 'A narrower cone of light deepens the focus: closing the aperture brings near and far into focus together.',
    // the reel's one Sensor shows both spots, its rms mixing them: two screens, one for each object's spot
    start: { reel: 'ig-both-sharp', remove: ['Sensor'], add: [
      { type: 'screen', id: 'exs1', name: 'Sensor top', x: 34, y: 5, angle: 180, length: 10 },
      { type: 'screen', id: 'exs2', name: 'Sensor bottom', x: 34, y: -5, angle: 180, length: 10 }] },
    goal: 'Get the near and the far object sharp at the same time.',
    checks: [{ part: 'Sensor top', key: 'rms', op: 'below', value: 0.03 }, { part: 'Sensor bottom', key: 'rms', op: 'below', value: 0.03 }],
    unlocked: { Lens: ['x'], Aperture: ['aperture'] },
    hints: ['Moving the lens only chooses which object is sharp.', 'Make the cone of light narrower: close the Aperture to about 1 mm.'],
    answer: { Aperture: { aperture: 1.2 } },
    optimiser: { Lens: { x: [-16.5, 13.5] }, Aperture: { aperture: [0.5, 5] } },
    result: () => 'both objects sharp' },
  { id: 'fix-the-polarisation', title: 'Fix the polarisation', teaches: 'An ordinary fibre turns polarisation into an oval. A quarter-wave plate makes it a straight line, and a half-wave plate turns that line.',
    start: { reel: 'ig-fibre-two-plates' },
    goal: 'Send all the light to the p light detector.',
    checks: [{ part: 'p light', key: 'dmw', op: 'above', value: 0.995 }],
    unlocked: { 'Quarter-wave': ['axis'], 'Half-wave': ['axis'] },
    hints: ['First turn the Quarter-wave until the s light reading is as low as it will go.', 'Then turn the Half-wave to swing what’s left into p.'],
    answer: { 'Quarter-wave': { axis: 35 }, 'Half-wave': { axis: 30 } },
    optimiser: { 'Quarter-wave': { axis: [0, 180] }, 'Half-wave': { axis: [0, 180] } },
    result: v => fix(v[0] * 100, 1) + '% in p' },
  { id: 'get-it-back-in', reel: 'ig-get-it-back-in', title: 'Get it back in', teaches: 'A tilted plate shifts a beam sideways without turning it; a second, tilted the other way, shifts it back.',
    start: { reel: 'ig-get-it-back-in' },
    goal: 'Get the light back into fibre B without moving the collimators or the first filter.',
    checks: [{ part: 'Detector', key: 'dmw', op: 'above', value: 0.9 }],
    unlocked: { 'Filter 2': ['angle'] },
    hints: ['A tilted plate shifts the beam sideways without turning it. Which way does Filter 2 shift it?', 'Tilt Filter 2 the other way from Filter, by the same amount.'],
    answer: { 'Filter 2': { angle: -25 } },
    optimiser: { 'Filter 2': { angle: [-40, 40] } },
    result: v => fix(v[0] * 100, 0) + '% back into fibre B' },
];
/* The reels' challenges: one puzzle a "Can you…" reel, newest first, kept out of the course so it stays a course. Each
   is an exercise in all but its place (the same fields, `teaches` left out) and always has its `reel`: offered to
   visitors who come from that reel, marked in the From Instagram note, and listed under Help › Exercises' Challenges.
   A new "Can you…" reel adds its challenge here, at the top (.claude/commands/instagram-conversion.md). The course's
   own exercises with a `reel` stay in the course, and are those reels' challenges too. */
export const CHALLENGES = [
  { id: 'hit-the-target', reel: 'ig-hit-the-target', title: 'Can you hit the target?',
    start: { reel: 'ig-hit-the-target' },
    goal: 'Turn Mirror 3 so the beam reaches the Target.',
    checks: [{ part: 'Target', key: 'power', op: 'above', value: 50 }],
    unlocked: { 'Mirror 3': ['angle'] },
    hints: ['After Mirror 3 the beam must run straight up to Mirror 4: a mirror turns light by twice its tilt.', 'A mirror at 45° turns the beam through a right angle: set Mirror 3 to 45°.'],
    answer: { 'Mirror 3': { angle: 45 } },
    // no optimiser: the Target reads 0 until the angle is within about 0.4° of the answer, so it has nothing to climb
    result: v => fix(v[0], 0) + '% of the beam on the Target' },
  { id: 'escape-the-box', reel: 'ig-escape-the-box', title: 'Can you escape the box?',
    start: { reel: 'ig-escape-the-box' },
    goal: 'Get the beam out through the gap in the right wall to the Target.',
    checks: [{ part: 'Target', key: 'dmw', op: 'above', value: 0.9 }],
    unlocked: { Laser: ['angle'] },
    hints: ['The beam has to leave through the gap: find a route the mirrors allow, as in a game of pool.', 'Aim at the gap\'s reflection in the left wall: about 164°.'],
    answer: { Laser: { angle: 163.75 } },
    // no optimiser: the Target reads 0 until the angle is within about 0.25° of a solution, so it has nothing to climb
    result: v => fix(v[0], 2) + ' mW out of the box' },
  { id: 'hit-the-pinhole', reel: 'ig-hit-the-pinhole', title: 'Can you hit the pinhole?',
    start: { reel: 'ig-hit-the-pinhole' },
    goal: 'Get the light through the pinhole to the Detector.',
    checks: [{ part: 'Detector', key: 'dmw', op: 'above', value: 0.9 }],
    unlocked: { Pinhole: ['x', 'y'] },
    hints: ['A tilted beam focuses off the axis: the pinhole has to move up as well as along.', 'The focus is about 50 mm from the lens and 0.53 mm above the axis.'],
    answer: { Pinhole: { x: 49.85, y: 0.53 } },
    // no optimiser: nothing reaches the Detector until the pinhole is within 0.05 mm, so it has nothing to climb
    result: v => fix(v[0], 2) + ' mW through the pinhole' },
];
export const isChallenge = ex => CHALLENGES.includes(ex);
/* how many reels (the From Instagram note) and challenges (Help › Exercises) are listed, newest first, before a
   "Show older" button; every one still opens from its own link (?src=ig-…, ?ex=), however old */
export const LISTED_NEWEST = 10;
export const exerciseById = id => EXERCISES.find(x => x.id === id) || CHALLENGES.find(x => x.id === id) || null;
export const exerciseOfReel = reel => CHALLENGES.find(x => x.reel === reel) || EXERCISES.find(x => x.reel === reel) || null;
/* one check against its value (null: not measured yet, as when no light arrives) */
export function checkPasses(c, v) {
  if (v === null || v === undefined || !isFinite(v)) return false;
  return c.op === 'above' ? v > c.value : c.op === 'below' ? v < c.value : Math.abs(v - c.value) <= c.tol + 1e-9;
}
/* what a check asks, in words: "above 0.9", "below 0.03", "4 ± 0.2" */
export const checkWant = c => (c.op === 'above' ? 'above ' + c.value : c.op === 'below' ? 'below ' + c.value : c.value + ' ± ' + c.tol);
/* the bench an exercise starts from: its reel's, changed as `start` says (a copy; the reel's own is left alone) */
export function exerciseBench(ex, reelBench) {
  const b = JSON.parse(JSON.stringify(reelBench)), S = ex.start || {};
  b.elements = b.elements.filter(e => !(S.remove || []).includes(e.name));
  for (const [name, f] of Object.entries(S.set || {})) { const e = b.elements.find(q => q.name === name); if (e) Object.assign(e, f); }
  for (const e of S.add || []) b.elements.push(JSON.parse(JSON.stringify(e)));
  b.name = ex.reel ? b.name : ex.title;
  return b;
}

/* where a visit came from, if it is to start in an exercise: ?ex=<id>, or a reel that is a challenge (?src=ig-…) */
export function exerciseArrival(search) {
  const m = /[?&]ex=([a-z0-9-]+)/.exec(search || ''), s = /[?&]src=([a-z0-9_-]+)/i.exec(search || '');
  if (m && exerciseById(m[1])) return { id: m[1], from: 'link' };
  const ex = s && exerciseOfReel(s[1].toLowerCase());
  return ex ? { id: ex.id, from: 'reel' } : null;
}
