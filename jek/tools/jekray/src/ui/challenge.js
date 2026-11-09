import { hooks } from '../core/hooks.js';
import { V, project } from '../state/project.js';
import { onTab } from '../state/tabs.js';
import { lastTrace } from '../engines/trace.js';
import { CHALLENGES, EXERCISES, LISTED_NEWEST, checkPasses, checkWant, exerciseBench, exerciseById, isChallenge } from '../core/exercises.js';
import { renderPanel } from './panel.js';
import { h } from './dom.js';
import { changed, fitView, toast } from './actions.js';
import { metricRaw, optimiseMany } from './optimise.js';
import { designPro } from './pro.js';
import { EXERCISE_BENCHES } from '../core/exercise-benches.js';
import { requestRender, sx, sy } from './render.js';
import { openProjectData } from '../io/open.js';
import { account, accountLoaded, accountsOn, api, signInRow } from '../io/account.js';
import { funnel, track } from '../io/usage.js';

/* ---------- Exercises and challenges ----------
   An exercise (core/exercises.js) on the bench: a bar at its top with the goal, the reading against it, hints and a
   way out. Only the parts it names can be changed, and only those settings: the rest are held in place (not dragged:
   a lock that is never saved) and anything else changed is put back. Solved, the bar says so, in how many changes,
   and offers the next one, a link to share it, and (signed out) a free account, which keeps the list of those solved
   in any browser (jek-api src/exercises.js; signed out, this browser's own list, sent once they sign in).
   Started from Help › Exercises or from a link (?ex=<id>). Nothing of it is in the bench: leave, and the bench is an
   ordinary one, every part free. Counted as 'exercise' <id>.<step> and the funnel's 'solve'. */
let EX = null;                   // { ex, from, snap: Map id -> JSON, fibres, ids: { id: fields }, names, changes, hints, solved, seen, values }
const SOLVED_KEY = 'jek-exercises';             // this browser's list: { id: { at, changes } }
export const exerciseOn = () => EX;
export function exSolvedList() { try { return JSON.parse(localStorage.getItem(SOLVED_KEY) || '{}') || {}; } catch (err) { return {}; } }
let exServer = null;                             // the account's list, once read: { id: { at, changes } }
const exSolved = () => Object.assign({}, exSolvedList(), exServer || {});

/* an exercise put on the bench, from its own bench (core/exercise-benches.js) */
export function startExercise(id, from) {
  const ex = exerciseById(id), start = ex && EXERCISE_BENCHES[ex.start.reel];
  if (!ex || !start) return false;
  if (EX) exerciseLeave(true);
  const bench = exerciseBench(ex, start);
  openProjectData(bench, ex.title);
  fitView();
  const byName = n => project.elements.find(e => e.name === n);
  const ids = {};
  for (const [n, f] of Object.entries(ex.unlocked)) { const e = byName(n); if (e) ids[e.id] = f; }
  EX = { ex, from: from || 'help', snap: new Map(project.elements.map(e => [e.id, JSON.stringify(e)])), fibres: JSON.stringify(project.fibres || []),
    ids, changes: 0, hints: 0, solved: false, seen: null, values: [], title: ex.title };
  exLocks();
  exBar();
  track('exercise', ex.id + '.start');
  renderPanel(); requestRender();
  return true;
}
/* out of it: the bench as it is, every part free */
export function exerciseLeave(quiet) {
  if (!EX) return;
  if (!quiet) track('exercise', EX.ex.id + '.leave');
  for (const e of project.elements) if (Object.prototype.hasOwnProperty.call(e, 'locked') && !Object.getOwnPropertyDescriptor(e, 'locked').enumerable) delete e.locked;
  EX = null;
  const bar = document.getElementById('exBar');
  if (bar) bar.remove();
  renderPanel(); requestRender();
}
// held in place, not saved: a lock no JSON carries, for every part whose place is not the exercise's to change
function exLocks() {
  for (const e of project.elements) {
    const f = EX.ids[e.id] || [];
    if (f.includes('x') || f.includes('y') || e.locked === true) continue;
    if (!Object.prototype.hasOwnProperty.call(e, 'locked')) Object.defineProperty(e, 'locked', { value: true, enumerable: false, configurable: true, writable: true });
  }
}
// a part as the exercise holds it: everything but the settings it may change
const exHeld = (o, fields) => { const c = Object.assign({}, o); for (const k of fields) delete c[k]; delete c.locked; return JSON.stringify(c); };
/* what was changed that may not be is put back: parts, their settings, the fibres; parts added go, parts deleted come back */
function exEnforce() {
  let back = false;
  const now = new Map(project.elements.map(e => [e.id, e]));
  const list = [];
  for (const [id, js] of EX.snap) {
    const was = JSON.parse(js), e = now.get(id), f = EX.ids[id] || [];
    if (!e) { list.push(was); back = true; continue; }
    if (exHeld(e, f) !== exHeld(was, f)) {
      const keep = Object.fromEntries(f.filter(k => k in e).map(k => [k, e[k]]));
      for (const k of Object.keys(e)) delete e[k];
      Object.assign(e, was, keep); back = true;
    }
    list.push(e);
  }
  if (project.elements.some(e => !EX.snap.has(e.id))) back = true;
  if (back) project.elements.splice(0, project.elements.length, ...list);
  if (JSON.stringify(project.fibres || []) !== EX.fibres) { project.fibres = JSON.parse(EX.fibres); back = true; }
  if (back) {
    exLocks();
    toast('In this exercise only ' + exAllowedText() + ' can be changed');
    changed(true);
  }
  return back;
}
// the settings by the names their panels give them
const EX_FIELDS = { x: 'x', y: 'y', angle: 'facing angle', axis: 'axis', aperture: 'aperture' };
function exAllowedText() {
  return Object.entries(EX.ex.unlocked).map(([n, f]) => n + '’s ' + f.map(k => EX_FIELDS[k] || k).join(' and ')).join(' and ');
}
/* after each trace: anything not allowed put back, then the goal read */
export function exerciseTick() {
  if (!EX) return;
  exLocks();
  if (EX.seen === lastTrace) return;
  // another bench opened (or Undo past the start): the exercise is over
  if (![...EX.snap.keys()].some(id => project.elements.some(e => e.id === id))) { exerciseLeave(true); return; }
  if (exEnforce()) return;
  EX.seen = lastTrace;
  exRead();
}
function exRead() {
  const els = EX.ex.checks.map(c => project.elements.find(e => e.name === c.part && onTab(e)));
  // a measure on the part (the optimiser's), or one of the part's own settings (field: x, y, angle…): none if it is gone
  EX.values = EX.ex.checks.map((c, i) => (!els[i] ? null : c.field ? (isFinite(els[i][c.field]) ? +els[i][c.field] : null) : metricRaw(els[i], c.key)));
  const ok = EX.ex.checks.map((c, i) => checkPasses(c, EX.values[i]));
  if (!EX.solved && ok.every(Boolean)) exSolvedNow();
  exBarReading(ok);
}
// when a change is made (ui/tabs.js checkpoint): counted until solved
export function exerciseStep() { if (EX && !EX.solved) EX.changes++; }

function exSolvedNow() {
  EX.solved = true;
  const id = EX.ex.id, rec = { at: Date.now(), changes: EX.changes }, mine = exSolvedList();
  if (!mine[id] || mine[id].changes > rec.changes) { mine[id] = Object.assign({}, rec, mine[id] ? { at: mine[id].at } : {}); try { localStorage.setItem(SOLVED_KEY, JSON.stringify(mine)); } catch (err) { /* kept on the account, if any */ } }
  if (account) api('/v1/exercises/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(rec) }).then(exTake).catch(() => {});
  track('exercise', id + '.solve');
  funnel('solve');
  exBar();
}
// the account's list read in: { solved: [{ id, at, changes }] }
const exTake = r => { if (r && Array.isArray(r.solved)) exServer = Object.fromEntries(r.solved.map(x => [x.id, { at: x.at, changes: x.changes }])); };
/* the account's list, and this browser's solved before signing in, sent to it */
export async function exerciseSync() {
  if (!account) { exServer = null; return; }
  try {
    exTake(await api('/v1/exercises'));
    for (const [id, x] of Object.entries(exSolvedList())) {
      if (exServer[id] && exServer[id].changes <= x.changes) continue;
      if (!exerciseById(id)) continue;
      exTake(await api('/v1/exercises/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ changes: x.changes, at: x.at }) }));
    }
  } catch (err) { /* this browser's list meanwhile */ }
}

/* the next exercise, the first not yet solved: after this one, in the course's order; from a reel's challenge or a
   link, from the course's start (a way into it). After one of the reels' challenges, the next challenge instead */
export function exerciseNext(id, fromStart) {
  const L = isChallenge(exerciseById(id)) ? CHALLENGES : EXERCISES;
  const S = exSolved(), i = fromStart && L === EXERCISES ? -1 : L.findIndex(x => x.id === id);
  const after = [...L.slice(i + 1), ...L.slice(0, Math.max(0, i))].filter(x => x.id !== id);
  return after.find(x => !S[x.id]) || null;
}
const exUnits = { rms: ' mm', full: ' mm', centroid: ' mm', couple: '%', dmw: ' mW', dir: '\u00b0', tilt: '\u00b0', x: ' mm', y: ' mm', angle: '\u00b0', z: ' mm' };
const exWhat = { rms: 'RMS spot', full: 'width', centroid: 'spot centre', couple: 'coupling', dmw: 'power', dir: 'beam direction', tilt: 'arrival angle', x: 'x', y: 'y', angle: 'angle', z: 'height' };
const exKey = c => c.field || c.key;
const exFmt = v => (v === null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : Math.abs(v) >= 0.01 ? v.toFixed(3) : v === 0 ? '0' : v.toPrecision(2));
function exShareLink() {
  const u = location.origin + location.pathname.replace(/jekray-dev\.html$/, 'jekray.html') + '?ex=' + EX.ex.id + '&src=solved';
  const text = 'Solved: ' + EX.title + '\n' + EX.ex.result(EX.values) + ', in ' + EX.changes + ' ' + (EX.changes === 1 ? 'change' : 'changes') + '. Can you do it?\nFree in your browser, nothing to install · JEKray';
  track('exercise', EX.ex.id + '.share');
  if (navigator.share && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) { navigator.share({ title: 'Solved: ' + EX.title, text, url: u }).catch(() => {}); return; }
  const all = text + '\n' + u;
  (navigator.clipboard ? navigator.clipboard.writeText(all) : Promise.reject()).then(() => toast('Copied: the link opens this exercise for whoever you send it to'), () => toast(u));
}
/* the optimiser finds it (JEKrayPro, or a free account's optimiser runs): offered after the second hint */
export function exerciseOptimise() { if (EX && EX.ex.optimiser) exOptimise(); }
function exOptimise() {
  if (!designPro('optimise a design')) return;
  track('exercise', EX.ex.id + '.optimise');
  const vars = [], terms = [];
  const keep = [];
  for (const [n, R] of Object.entries(EX.ex.optimiser)) {
    const e = project.elements.find(q => q.name === n);
    for (const [k, [lo, hi]] of Object.entries(R)) { keep.push([e, k, e.sweeps && e.sweeps[k]]); e.sweeps = Object.assign({}, e.sweeps, { [k]: { min: lo, max: hi } }); vars.push([e, k]); }
  }
  // the ranges are the optimiser's for this search only: each part's sweeps put back as they were
  const unkeep = () => { for (const [e, k, was] of keep) { if (was) e.sweeps[k] = was; else delete e.sweeps[k]; } };
  for (const c of EX.ex.checks.filter(q => !q.field)) terms.push({ target: project.elements.find(q => q.name === c.part), key: c.key, goal: c.op === 'above' ? 'max' : c.op === 'below' ? 'min' : 'match', targetVal: c.value, weight: 1 });
  toast('The optimiser is looking…');
  setTimeout(() => {
    try { optimiseMany(vars, terms); } catch (err) { unkeep(); toast('The optimiser could not finish: ' + err.message, true); return; }
    unkeep();
    EX.changes++; changed(true);
  }, 30);
}

/* the bar at the bench's top */
function exBar() {
  let bar = document.getElementById('exBar');
  if (!bar) { bar = h('div', { class: 'rt-exbar', id: 'exBar', role: 'region', 'aria-label': 'Exercise' }); document.getElementById('stage').append(bar); }
  const E = EX.ex, n = EXERCISES.indexOf(E) + 1, ch = isChallenge(E);
  const head = h('div', { class: 'rt-exhead' },
    h('span', { class: 'rt-exkind' }, ch ? 'Challenge' : 'Exercise ' + n + ' of ' + EXERCISES.length),
    h('b', null, EX.title),
    h('button', { class: 'rt-wx', type: 'button', title: 'Leave the exercise: the bench stays, every part free', 'aria-label': 'Leave the exercise', onclick: () => exerciseLeave(false) }, '×'));
  const body = [head, h('p', { class: 'rt-exgoal' }, E.goal), h('div', { class: 'rt-exread', id: 'exRead' })];
  if (!EX.solved) {
    for (let i = 0; i < EX.hints; i++) body.push(h('p', { class: 'rt-exhint' }, h('b', null, 'Hint ' + (i + 1) + ': '), E.hints[i]));
    const acts = h('div', { class: 'rt-actions' });
    if (EX.hints < E.hints.length) acts.append(h('button', { class: 'rt-btn', type: 'button', onclick: () => { EX.hints++; track('exercise', E.id + '.hint' + EX.hints); exBar(); } }, EX.hints ? 'Another hint' : 'Hint'));
    else if (E.optimiser) acts.append(h('button', { class: 'rt-btn', type: 'button', title: 'JEKrayPro’s optimiser searches the settings you may change for the goal (a free account has a few runs a month)', onclick: exOptimise }, 'Let the optimiser find it'));
    acts.append(h('span', { class: 'rt-exmay' }, 'You can change ' + exAllowedText() + '.'));
    body.push(acts);
  } else {
    const next = exerciseNext(E.id, EX.from === 'link');
    body.push(h('p', { class: 'rt-exsolved' }, '✓ Solved: ' + E.result(EX.values) + ', in ' + EX.changes + ' ' + (EX.changes === 1 ? 'change' : 'changes') + '.'));
    if (accountsOn() && !account) {
      track('prompt', 'exercise.shown');
      body.push(h('div', { class: 'rt-exacct' }, h('p', null, 'Make a free account to keep track of the ' + (ch ? 'challenges' : 'exercises') + ' you’ve solved.'), h('div', { class: 'rt-actions' }, ...signInRow('exercise', () => {}))));
    }
    body.push(h('div', { class: 'rt-actions' },
      next ? h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('exercise', E.id + '.next'); startExercise(next.id, 'help'); } }, (ch ? 'Next challenge: ' : 'Next exercise: ') + next.title) : null,
      h('button', { class: 'rt-btn', type: 'button', onclick: exShareLink }, 'Share'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => showExercises(ch ? 'challenge' : 'solved') }, ch ? 'All challenges' : 'All exercises'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => exerciseLeave(false) }, 'Keep the bench')));
  }
  bar.replaceChildren(...body);
  bar.classList.toggle('solved', EX.solved);
  if (EX.values.length) exBarReading(EX.ex.checks.map((c, i) => checkPasses(c, EX.values[i])));
}
function exBarReading(ok) {
  const box = document.getElementById('exRead');
  if (!box) return;
  box.replaceChildren(...EX.ex.checks.map((c, i) => h('div', { class: 'rt-exrow' + (ok[i] ? ' ok' : '') },
    h('span', { class: 'rt-exmark', 'aria-hidden': 'true' }, ok[i] ? '✓' : '○'),
    h('span', null, c.part + ' ' + (exWhat[exKey(c)] || exKey(c)) + ': ', h('b', null, exFmt(EX.values[i]) + (exUnits[exKey(c)] || ''))),
    h('small', null, ' goal ' + checkWant(c) + (exUnits[exKey(c)] || '')))));
}
/* on the bench: a dashed ring round each part the exercise lets you change */
export function exerciseDraw(ctx) {
  if (!EX) return;
  ctx.save();
  ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(240,160,40,0.9)';
  for (const e of project.elements) {
    if (!EX.ids[e.id] || !onTab(e)) continue;
    const r = Math.max(14, 0.6 * Math.max(e.length || 0, e.size || 0, e.diameter || 0, 12) * V().scale);
    ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), r, 0, 2 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}
/* a part's panel in an exercise: only the settings it may change take input; a line says what those are */
export function exercisePanel(box, el) {
  if (!EX || !el || !EX.snap.has(el.id)) return;
  const f = EX.ids[el.id] || [];
  for (const inp of box.querySelectorAll('input, select, textarea')) if (!(inp.dataset.path && f.includes(inp.dataset.path))) inp.disabled = true;
  box.prepend(h('p', { class: 'note rt-exnote' }, f.length ? 'In this exercise you can change only its ' + f.map(k => EX_FIELDS[k] || k).join(' and ') + '.' : 'Held in place for this exercise.'));
}

/* Help › Exercises: the course, in order, each with what it teaches and a tick once solved; then the reels'
   challenges, newest first, each with its goal (core/exercises.js CHALLENGES), apart so they do not get in its way */
export function showExercises(from) {
  track('exercise', 'list.' + (from || 'help'));
  let dlg = document.getElementById('exDialog');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'exDialog', 'aria-labelledby': 'exDialogTitle' }); document.body.append(dlg); }
  const S = exSolved(), done = EXERCISES.filter(x => S[x.id]).length;
  // the challenges, the newest few, the rest behind Show older
  const chItem = x => h('li', null, h('button', { type: 'button', class: 'rt-exitem' + (S[x.id] ? ' done' : ''), onclick: () => { dlg.close(); startExercise(x.id, 'help'); } },
    h('b', null, x.title, S[x.id] ? h('span', { class: 'rt-extick', title: 'Solved in ' + S[x.id].changes + ' changes' }, ' ✓') : null), h('small', null, x.goal)));
  const chList = h('ol', { class: 'rt-exlist rt-chlist' }, ...CHALLENGES.slice(0, LISTED_NEWEST).map(chItem));
  if (CHALLENGES.length > LISTED_NEWEST) {
    const more = h('li', { class: 'rt-older' }, h('button', { class: 'rt-link', type: 'button', onclick: () => more.replaceWith(...CHALLENGES.slice(LISTED_NEWEST).map(chItem)) }, 'Show older (' + (CHALLENGES.length - LISTED_NEWEST) + ')'));
    chList.append(more);
  }
  dlg.replaceChildren(h('h2', { id: 'exDialogTitle' }, 'Exercises'),
    h('p', null, EXERCISES.length + ' short exercises on the bench, about two minutes each, from aiming a mirror to fixing a fibre’s polarisation. Each says what to reach, checks it as you go, and has two hints.' + (done ? ' Solved: ' + done + ' of ' + EXERCISES.length + '.' : '')),
    h('ol', { class: 'rt-exlist' }, ...EXERCISES.map(x => h('li', null, h('button', { type: 'button', class: 'rt-exitem' + (S[x.id] ? ' done' : ''), onclick: () => { dlg.close(); startExercise(x.id, 'help'); } },
      h('b', null, x.title, S[x.id] ? h('span', { class: 'rt-extick', title: 'Solved in ' + S[x.id].changes + ' changes' }, ' ✓') : null), h('small', null, x.teaches))))),
    CHALLENGES.length ? h('h3', { id: 'exChallenges' }, 'Challenges') : null,
    CHALLENGES.length ? h('p', null, 'Puzzles, newest first: no lesson, just a goal to reach.' + (CHALLENGES.some(x => S[x.id]) ? ' Solved: ' + CHALLENGES.filter(x => S[x.id]).length + ' of ' + CHALLENGES.length + '.' : '')) : null,
    CHALLENGES.length ? chList : null,
    accountsOn() && !account ? h('p', { class: 'note' }, 'Signed out, the ones you solve are kept in this browser; a free account keeps them in any.') : null,
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Close')));
  dlg.showModal();
  if (from === 'challenge') { const c = document.getElementById('exChallenges'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); }
}
/* a quiet line for the welcome note */
export const exerciseInvite = () => h('p', { class: 'rt-exinvite' }, 'New to optics benches? ', h('button', { type: 'button', class: 'rt-link', onclick: () => { const w = document.getElementById('welcome'); if (w) w.remove(); showExercises('welcome'); } }, EXERCISES.length + ' short exercises, about 2 minutes each.'));
/* the page's wiring for this module: done once, from boot.js */
export function wireChallenge() {
  Object.assign(hooks, { exerciseDraw, exerciseTick, exercisePanel, exerciseStep });
  const b = document.getElementById('btnExercises');
  if (b) b.addEventListener('click', () => showExercises('help'));
  Promise.resolve(accountLoaded).then(exerciseSync);
}
