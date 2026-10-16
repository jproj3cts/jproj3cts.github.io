import { getEl } from '../state/elements.js';
import { surfaceParts } from '../engines/lens-design.js';
import { optProblem } from '../engines/lens-opt.js';
import { designLenses, stockBaseline, stockCandidates, stockNominal, stockOf, stockTry } from '../engines/lens-stock.js';
import { parseZmx, readZmxFile } from '../io/zmx-import.js';
import { zmxPart } from '../io/zmx-export.js';
import { h } from './panel.js';

/* ---------- Stock lenses: the user's own lens files, matched to the lenses of a design ----------
   The lens files are the user's: chosen here, read in the browser, kept in this browser only (its local storage),
   never sent anywhere. */
const STORE = 'JEK_STOCK_LENSES';
let LIB = null;
function lib() {
  if (LIB) return LIB;
  LIB = [];
  try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); if (Array.isArray(v)) LIB = v.filter(x => x && x.el && x.el.type === 'lens'); } catch (e) { /* none kept */ }
  return LIB;
}
function keep() { try { localStorage.setItem(STORE, JSON.stringify(LIB)); return true; } catch (e) { return false; } }
/* lens files read into the stock: each a lens (a singlet or a cemented lens); others noted */
export async function stockAdd(files) {
  const added = [], skipped = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer(), F = readZmxFile(buf, f.name), Z = parseZmx(F.text, f.name, F.agf), el = zmxPart(Z, f.name, 'lens');
      if (el.type !== 'lens' || el.materials.some(m => m.glass === 'AIR')) { skipped.push(f.name + ' (not a single lens)'); continue; }
      const name = f.name.replace(/\.(zmx|zar)$/i, '');
      lib().push({ name, file: f.name, el: Object.assign(el, { name }) });
      added.push(name);
    } catch (err) { skipped.push(f.name + ' (' + err.message + ')'); }
  }
  const kept = keep();
  return { added, skipped, kept };
}
export function stockClear() { LIB = []; keep(); }
export const stockLibrary = () => lib();

const stFmt = (v, p) => (isFinite(v) ? String(+(+v).toPrecision(p || 4)) : '—');
let RUN = null;
/* the card: the stock kept, and for each lens of the design its matches, tried in the design */
export function stockCard({ asm, P, redraw, edit, toast }) {
  const card = h('div', { class: 'rt-lcard rt-lstock', role: 'tabpanel' }), L = lib(), nm = asm.cond.waves[asm.cond.primary].nm;
  const file = h('input', { type: 'file', accept: '.zmx,.zar', multiple: true, hidden: true, onchange: async () => {
    const r = await stockAdd([...file.files]);
    toast((r.added.length ? 'Added ' + r.added.length + ' lens file' + (r.added.length === 1 ? '' : 's') : 'No lenses added') + (r.skipped.length ? '. Not added: ' + r.skipped.join('; ') : '') + (r.kept ? '' : '. This browser would not keep them past this visit.'), !r.added.length);
    RUN = null; redraw();
  } });
  card.append(h('h3', null, 'Stock lenses'),
    h('p', { class: 'rt-lsub' }, 'Match the lenses of this design against stock lenses: lens files you have, such as the ones lens makers publish for their parts. Add them here; they are read and kept in this browser only, and never sent anywhere. ' +
      'For each lens of the design, the stock lenses with as many faces, a focal length within 30% and room for the beam are ranked, and the best tried in the design either way round, the air either side and the image distance optimised for the design’s merit. The lenses are taken as made: the merit here leaves out the limits on glass thickness and edges, and keeps only the air between lenses from closing.'),
    h('div', { class: 'rt-lchips' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => file.click() }, 'Add lens files…'), file,
      h('span', { class: 'rt-lsub' }, L.length + ' stock lens' + (L.length === 1 ? '' : 'es') + ' kept'),
      ...(L.length ? [h('button', { type: 'button', class: 'rt-link', onclick: () => { stockClear(); RUN = null; redraw(); } }, 'Remove them all')] : [])));
  if (!L.length) { card.append(h('p', { class: 'rt-lsub' }, 'No stock lenses yet. Add .zmx or .zar lens files to match against.')); return card; }
  const stock = L.map(x => stockOf(x.el, nm)), lenses = designLenses(asm, P), sps = surfaceParts(P);
  if (!lenses.length) { card.append(h('p', { class: 'rt-lsub' }, 'This design has no round lenses to match.')); return card; }
  const tbl = h('table', { class: 'rt-ltable rt-lghost rt-lstocktab' });
  tbl.append(h('thead', null, h('tr', null, ...['Lens', 'Focal length', 'Faces', 'Beam', 'Candidates', ''].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  for (const d of lenses) {
    const e = getEl(d.id), C = stockCandidates(d, stock), on = RUN && RUN.id === d.id;
    tb.append(h('tr', { class: on ? 'on' : '' }, h('td', null, e ? e.name : d.id), h('td', { class: 'mono' }, stFmt(d.f, 5) + ' mm'), h('td', { class: 'mono' }, String(d.n)), h('td', { class: 'mono' }, '⌀ ' + stFmt(d.beam, 3) + ' mm'),
      h('td', { class: 'mono' }, String(C.length)), h('td', null, C.length ? h('button', { type: 'button', class: 'rt-btn', onclick: () => start(d, C) }, on && !RUN.done ? 'Trying…' : 'Try them') : h('span', { class: 'rt-lsub' }, 'none fit'))));
  }
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  // the stock tried for one lens, a candidate at a time so the page stays live
  function start(d, C) {
    const prob = optProblem(asm, P), run = RUN = { id: d.id, d, rows: [], done: false, base: null, nominal: stockNominal(prob) };
    const jobs = [() => { run.base = stockBaseline(prob, d).merit; }];
    for (const c of C) jobs.push(() => {
      const a = stockTry(prob, d, c.s, false), b = stockTry(prob, d, c.s, true), best = a.merit <= b.merit ? a : b;
      run.rows.push({ c, merit: best.merit, flip: best.flip, prob: best.prob, other: (best === a ? b : a).merit });
    });
    let k = 0;
    const step = () => {
      if (RUN !== run) return;
      jobs[k++]();
      if (k < jobs.length) { setTimeout(step, 0); if (k === 2 || k % 2 === 0) redraw(); return; }
      run.rows.sort((p, q) => p.merit - q.merit); run.done = true; redraw();
    };
    redraw(); setTimeout(step, 0);
  }
  if (RUN && lenses.some(d => d.id === RUN.id)) {
    const run = RUN, e = getEl(run.id);
    card.append(h('h3', null, 'Stock for ' + (e ? e.name : run.id)));
    if (!run.done) card.append(h('p', { class: 'rt-lsub', role: 'status' }, 'Trying them in the design… ' + run.rows.length + ' tried'));
    if (run.base !== null) card.append(h('p', { class: 'rt-lsub' }, 'The design’s own lens, the same air optimised: merit ' + stFmt(run.base, 4) + ' (as it is: ' + stFmt(run.nominal, 4) + '). Each stock lens either way round; its better way shown.'));
    const t2 = h('table', { class: 'rt-ltable rt-lghost rt-lstockres' });
    t2.append(h('thead', null, h('tr', null, ...['Stock lens', 'Focal length', 'Diameter', 'Glass', 'Way round', 'Merit', 'Against the design’s', ''].map(t => h('th', { scope: 'col' }, t)))));
    const b2 = h('tbody');
    for (const r of run.rows) {
      const s = r.c.s, ratio = run.base > 0 ? r.merit / run.base : NaN;
      b2.append(h('tr', null, h('td', null, s.name), h('td', { class: 'mono' }, stFmt(s.f, 5) + ' mm'), h('td', { class: 'mono' }, stFmt(s.dia, 4) + ' mm'), h('td', null, s.glasses.join(' / ')),
        h('td', null, r.flip ? 'turned round' : 'as its file has it'), h('td', { class: 'mono' }, stFmt(r.merit, 4)), h('td', { class: 'mono' + (ratio > 1.5 ? ' warn' : '') }, isFinite(ratio) ? '×' + stFmt(ratio, 3) : '—'),
        h('td', null, run.done ? h('button', { type: 'button', class: 'rt-btn', 'aria-label': 'Use ' + s.name + ' for ' + (e ? e.name : run.id), onclick: () => use(run, r) } , 'Use') : '')));
    }
    t2.append(b2);
    card.append(h('div', { class: 'rt-ltwrap' }, t2));
    card.append(h('p', { class: 'rt-lsub' }, 'A stock lens is only as its file describes it: check its maker’s specification before buying. Use puts it in the design (its shape, thickness, glass and diameter, and the air as optimised); Undo takes it back.'));
  }
  // the chosen stock lens into the design: its shape, thicknesses, glasses and diameter, and the air as optimised
  function use(run, r) {
    const q = r.prob.P, el = getEl(run.id), s = r.c.s;
    edit(Pd => {
      const d = run.d;
      for (let j = 0; j < d.n; j++) Object.assign(Pd.surfaces[d.i0 + j], { R: q.surfaces[d.i0 + j].R, k: q.surfaces[d.i0 + j].k, a2: q.surfaces[d.i0 + j].a2, A: q.surfaces[d.i0 + j].A.slice(), odd: q.surfaces[d.i0 + j].odd, semi: s.dia / 2 });
      for (let j = 0; j < d.n - 1; j++) { Pd.gaps[d.i0 + j] = q.gaps[d.i0 + j]; Pd.materials[d.i0 + j] = Object.assign({}, q.materials[d.i0 + j]); }
      if (d.i0 > 0) Pd.gaps[d.i0 - 1] = q.gaps[d.i0 - 1];
      if (d.i0 + d.n - 1 < Pd.gaps.length) Pd.gaps[d.i0 + d.n - 1] = q.gaps[d.i0 + d.n - 1];
      if (isFinite(q.image)) Pd.image = q.image;
      if (el) { el.diameter = s.dia; if (q.parts[d.pi].asph) el.asphere = true; }
    });
    RUN = null;
    toast(s.name + ' is in the design in place of ' + (el ? el.name : 'the lens') + '.');
  }
  return card;
}
