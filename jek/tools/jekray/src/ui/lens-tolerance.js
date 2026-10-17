import { TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { normTol } from '../core/assembly.js';
import { designOf } from '../engines/lens-design.js';
import { cloneP, optProblem } from '../engines/lens-opt.js';
import { compensated, compsFor, mcStats, opValues, rssEstimate, tolOps, tolRun, yieldOf } from '../engines/lens-tol.js';
import { surfaceParts } from '../engines/lens-design.js';
import { helpLine, h } from './panel.js';
import { plotCsv, plotSaveRow } from './plots.js';
import { fmtSig } from '../core/format.js';

/* ==========================================================================
   Tolerance the design: the workspace's tab for how the design holds up as it is made
   The tolerances by kind, the compensator and Monte Carlo's settings (kept with the design), and
   the two runs: Sensitivity, each tolerance alone at its limits, and Monte Carlo, all of them at
   random, build after build. Both run a batch at a time, in the background worker where there is
   one, and show as they go; their results are kept for the design as it was when they ran.
   ========================================================================== */
const KIND_ROWS = [['rad', 'Radius', 'fringes', 'Each lens surface’s sag at its clear radius, by this many fringes at 632.8 nm (λ/2 each)'],
  ['thk', 'Thickness and air gaps', 'mm', 'Every lens’s thickness and every gap between parts'],
  ['dec', 'Lens decentre', 'mm', 'Each lens moved across the axis, in x and in y'],
  ['tilt', 'Lens tilt', 'arcmin', 'Each lens tilted about its mechanical reference (below), about x and about y'],
  ['ind', 'Glass index', 'Δn', 'Each glass’s index at every wavelength'],
  ['abbe', 'Abbe number', '%', 'Each glass’s dispersion'],
  ['irr', 'Surface irregularity', 'fringes', 'Each lens surface’s form error beyond its radius: a fourth-order departure this many fringes peak to valley at 632.8 nm, with none at its clear radius'],
  ['wedge', 'Surface wedge', 'arcmin', 'Each lens surface tilted on its own about its vertex, about x and about y: its lens wedged, its faces no longer square to one axis (at a cemented interface, the cement wedged)'],
  ['sdec', 'Surface decentre', 'mm', 'Each lens surface moved across the axis on its own, in x and in y: in a cemented lens, its parts glued off one another\u2019s axis']];
const tolFmt = (v, p) => fmtSig(v, p || 4);
let TOL = null;
export const lensTolState = () => TOL && { running: TOL.running, mode: TOL.mode, sens: TOL.sens, inv: TOL.inv, mc: TOL.mc && { n: TOL.mc.trials.length, stats: mcStats(TOL.mc.trials.map(t => t.crit)) }, note: TOL.note };
export function tolStop(note) { if (TOL && TOL.running) { TOL.running = false; TOL.note = note || 'Stopped.'; } }
// (the yield's specification is left out: it is worked out again from the builds as they are, whatever it says)
const keyOf = prob => JSON.stringify([prob.P.surfaces.map(s => [s.R, s.k, s.semi]), prob.P.gaps, prob.P.materials, prob.P.image, prob.cond, prob.design.merit, Object.assign({}, prob.design.tol, { yield: null })]);

/* the last runs' results, if they were made on the design as it now is: { sens (when complete), mc, est } */
export function tolResultsFor(asm, P) {
  if (!TOL || TOL.id !== asm.id || TOL.key !== keyOf(optProblem(asm, P))) return null;
  const T = TOL.prob.design.tol, S = TOL.sens && TOL.sens.rows.length >= TOL.sens.count ? TOL.sens : null, M = TOL.mc && TOL.mc.trials.length ? TOL.mc : null;
  return { sens: S, est: S ? rssEstimate(S.nominal, S.rows, T.dist) : null, mc: M && { n: M.trials.length, nominal: M.nominal, stats: mcStats(M.trials.map(t => t.crit)), yield: yieldOf(M.trials, T.yield) }, crit: TOL.prob.design.merit.crit };
}
/* a run: ctx { asm, P, redraw, sync } */
export function tolStart(mode, ctx) {
  const prob = optProblem(ctx.asm, ctx.P), T = prob.design.tol, ops = tolOps(prob.P, T);
  if (!ops.length) return false;
  TOL = { id: ctx.asm.id, key: keyOf(prob), mode, running: true, note: '', prob, count: ops.length,
    sens: mode === 'sens' ? { nominal: null, rows: [], count: ops.length } : (TOL && TOL.id === ctx.asm.id && TOL.key === keyOf(prob) ? TOL.sens : null),
    inv: mode === 'inv' ? { nominal: null, target: null, rows: [], count: ops.length } : (TOL && TOL.id === ctx.asm.id && TOL.key === keyOf(prob) ? TOL.inv : null),
    mc: mode === 'mc' ? (() => { const n = compensated(prob, cloneP(prob.P), T.comp, T.comps); return { trials: [], target: T.trials, nominal: n.crit, nominalDz: n.dz, nominalOps: prob.design.merit.ops.length ? opValues(prob, n.fin) : null }; })() : (TOL && TOL.id === ctx.asm.id && TOL.key === keyOf(prob) ? TOL.mc : null) };
  ctx.redraw();
  if (ctx.sync) { while (TOL.running) tolBatch(ctx); return true; }
  setTimeout(() => tolBatch(ctx), 0);
  return true;
}
function tolBatch(ctx) {
  const O = TOL;
  if (!O || !O.running) return;
  const prob = O.prob, S = O.sens, M = O.mc, I = O.inv;
  const run = O.mode === 'sens' ? { mode: 'sens', from: S.rows.length, to: S.rows.length + 4 } : O.mode === 'inv' ? { mode: 'inv', from: I.rows.length, to: I.rows.length + 1 } : { mode: 'mc', from: M.trials.length, to: Math.min(M.target, M.trials.length + 10) };
  const take = out => {
    if (TOL !== O || !O.running) return;
    if (!out) { O.running = false; O.note = 'Stopped: the background worker was busy.'; ctx.redraw(); return; }
    if (O.mode === 'inv') {
      I.nominal = out.nominal; I.target = out.target; I.rows.push(...out.rows);
      if (I.rows.length >= I.count) { O.running = false; O.note = 'Done: ' + I.count + ' tolerances.'; }
    } else if (O.mode === 'sens') {
      S.nominal = out.nominal; S.rows.push(...out.rows);
      if (S.rows.length >= S.count) { O.running = false; O.note = 'Done: ' + S.count + ' tolerances.'; }
    } else {
      M.trials.push(...out.trials);
      if (M.trials.length >= M.target) { O.running = false; O.note = 'Done: ' + M.trials.length + ' builds.'; }
    }
    ctx.redraw();
    if (O.running && !ctx.sync) setTimeout(() => tolBatch(ctx), 0);
  };
  if (ctx.sync || TEST_MODE || !hooks.fieldWorker()) take(tolRun(prob, run));
  else hooks.fwRequest('lenstol', 'lenstol', { prob, run }).then(o => take(o && o.out)).catch(() => take(null));
}

/* the tab: ctx { asm, P, redraw, edit(fn): a change to the tolerance settings, undoable } */
export function tolCard(ctx) {
  const { asm, P } = ctx, D = designOf(asm), T = D.tol, prob = optProblem(asm, P), ops = tolOps(prob.P, T);
  const mine = TOL && TOL.id === asm.id ? TOL : null, running = !!(mine && mine.running), current = mine && mine.key === keyOf(prob);
  const wf = D.merit.crit === 'wfe', unit = v => wf ? tolFmt(v, 4) + ' waves' : tolFmt(1000 * v, 4) + ' µm';
  const card = h('div', { class: 'rt-lcard rt-ltol', role: 'tabpanel' });
  const set = (fn) => { tolStop('Stopped: the tolerances were changed.'); ctx.edit(dd => { const t = JSON.parse(JSON.stringify(dd.tol)); fn(t); dd.tol = normTol(t); }); };
  // the tolerances by kind
  const tbl = h('table', { class: 'rt-ltable rt-ltolset' });
  tbl.append(h('thead', null, h('tr', null, ...['', 'Tolerance', '±', '', 'What it moves'].map(t => h('th', { scope: 'col' }, t)))));
  const tb = h('tbody');
  for (const [k, label, u, what] of KIND_ROWS) {
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Apply the ' + label.toLowerCase() + ' tolerance' }); cb.checked = T[k].on;
    cb.addEventListener('change', () => set(t => { t[k].on = cb.checked; }));
    const v = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: tolFmt(T[k].v, 6), 'aria-label': label + ' tolerance (' + u + ')' });
    v.addEventListener('change', () => { const x = parseFloat(v.value); if (isFinite(x) && x >= 0) set(t => { t[k].v = x; }); else v.value = tolFmt(T[k].v, 6); });
    tb.append(h('tr', null, h('td', null, cb), h('td', null, label), h('td', null, v), h('td', { class: 'ro' }, u), h('td', { class: 'rt-lsub' }, what)));
  }
  tbl.append(tb);
  card.append(h('div', { class: 'rt-ltwrap' }, tbl));
  const comp = h('input', { type: 'checkbox', 'aria-label': 'Refocus each build' }); comp.checked = T.comp;
  comp.addEventListener('change', () => set(t => { t.comp = comp.checked; }));
  const dist = h('select', { 'aria-label': 'Distribution' }, h('option', { value: 'uniform' }, 'uniform within the limits'), h('option', { value: 'normal' }, 'normal, the limits at two deviations'));
  dist.value = T.dist; dist.addEventListener('change', () => set(t => { t.dist = dist.value; }));
  const trials = h('input', { type: 'text', inputmode: 'numeric', class: 'rt-lnum', value: String(T.trials), 'aria-label': 'Builds' });
  trials.addEventListener('change', () => { const x = parseInt(trials.value, 10); if (x >= 10) set(t => { t.trials = x; }); else trials.value = String(T.trials); });
  const seed = h('input', { type: 'text', inputmode: 'numeric', class: 'rt-lnum', value: String(T.seed), 'aria-label': 'Seed' });
  seed.addEventListener('change', () => { const x = parseInt(seed.value, 10); if (x >= 1) set(t => { t.seed = x; }); else seed.value = String(T.seed); });
  card.append(h('div', { class: 'rt-lrow rt-ltolopts' }, h('label', null, comp, ' Refocus each build (the image plane is a compensator)'),
    h('label', null, 'Monte Carlo: ', trials, ' builds, ', dist, ', seed ', seed)));
  const piv = h('select', { 'aria-label': 'A lens tilts about' }, h('option', { value: 'first' }, 'its first vertex'), h('option', { value: 'centre' }, 'its centre'), h('option', { value: 'last' }, 'its last vertex'));
  piv.value = T.pivot; piv.addEventListener('change', () => set(t => { t.pivot = piv.value; }));
  card.append(h('div', { class: 'rt-lrow rt-ltolopts' }, h('label', null, 'A lens tilts about ', piv, h('span', { class: 'rt-lsub' }, ' (its mechanical reference: where its cell holds it)'))));
  card.append(compsCard(P, T, set));
  card.append(yieldCard(D, T, wf, set));
  card.append(h('p', { class: 'rt-lsub' }, 'The criterion is the merit’s image term: the ' + (wf ? 'RMS wavefront error' : D.merit.crit === 'chief' ? 'RMS spot about the chief ray' : 'RMS spot about the centroid') +
    ' over ' + asm.cond.fields.length + ' field' + (asm.cond.fields.length === 1 ? '' : 's') + ' × ' + asm.cond.waves.length + ' wavelength' + (asm.cond.waves.length === 1 ? '' : 's') + ' (set in Merit). ' + ops.length + ' tolerances.'));
  const invV = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: T.inv.by === 'abs' ? tolFmt(wf ? T.inv.v : 1000 * T.inv.v, 6) : tolFmt(T.inv.v, 6), 'aria-label': 'Worsening allowed' });
  const invBy = h('select', { 'aria-label': 'Worsening allowed as' }, h('option', { value: 'pct' }, '% of nominal'), h('option', { value: 'abs' }, wf ? 'waves' : 'µm'));
  invBy.value = T.inv.by;
  const invSet = () => { const x = parseFloat(invV.value); if (!(isFinite(x) && x > 0)) { invV.value = tolFmt(T.inv.v, 6); return; } set(t => { t.inv = { by: invBy.value, v: invBy.value === 'abs' && !wf ? x / 1000 : x }; }); };
  invV.addEventListener('change', invSet); invBy.addEventListener('change', invSet);
  card.append(h('div', { class: 'rt-lrow rt-ltolopts' }, h('label', null, 'Inverse sensitivity: the limit of each tolerance alone that worsens the criterion by ', invV, ' ', invBy)));
  card.append(h('div', { class: 'rt-lbar' }, ...(running
    ? [h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { tolStop('Stopped.'); ctx.redraw(); } }, 'Stop')]
    : [h('button', { class: 'rt-btn primary', type: 'button', disabled: ops.length ? null : '', onclick: () => tolStart('sens', ctx) }, 'Sensitivity'),
      h('button', { class: 'rt-btn primary', type: 'button', disabled: ops.length ? null : '', onclick: () => tolStart('mc', ctx) }, 'Monte Carlo'),
      h('button', { class: 'rt-btn primary', type: 'button', disabled: ops.length ? null : '', onclick: () => tolStart('inv', ctx) }, 'Inverse sensitivity')])));
  if (mine && (mine.note || running)) card.append(h('div', { class: 'rt-lnote', role: 'status' }, running ? (mine.mode === 'sens' ? 'Sensitivity: ' + mine.sens.rows.length + ' of ' + mine.sens.count + '…' : mine.mode === 'inv' ? 'Inverse sensitivity: ' + mine.inv.rows.length + ' of ' + mine.inv.count + '…' : 'Monte Carlo: ' + mine.mc.trials.length + ' of ' + mine.mc.target + ' builds…') : mine.note));
  if (mine && !current && !running) card.append(h('div', { class: 'rt-lnote' }, 'These results are for the design as it was when they ran; run them again for it as it is now.'));
  // sensitivity
  const S = mine && mine.sens;
  if (S && S.nominal !== null && S.rows.length) {
    const rows = S.rows.slice().sort((a, b) => Math.max(b.minus, b.plus) - Math.max(a.minus, a.plus)), worst = Math.max(1e-30, ...rows.map(r => Math.max(r.minus, r.plus)));
    const est = rssEstimate(S.nominal, S.rows, T.dist);
    card.append(h('h3', null, 'Sensitivity'), h('div', { class: 'rt-readout' }, h('dl', null,
      h('dt', null, 'Nominal'), h('dd', { class: 'mono' }, unit(S.nominal)),
      h('dt', null, 'Expected over the builds'), h('dd', { class: 'mono' }, unit(est) + (S.rows.length < S.count ? ' (so far)' : ''), h('span', { class: 'rt-lsub' }, ' the tolerances’ effects added in quadrature')),
      ...(S.nominalCv ? compsFor(mine.prob.P, T.comps).flatMap((c, j) => [h('dt', null, compLabel(mine.prob.P, c) + ', on the nominal'), h('dd', { class: 'mono' }, tolFmt(S.nominalCv[j], 4) + ' ' + (c.kind === 'tilt' ? 'arcmin' : 'mm') + (Math.abs(S.nominalCv[j]) >= c.range * (1 - 1e-9) ? ' (at its range: the nominal itself would move it further, leaving it nothing for the tolerances on that side)' : ''))]) : []))));
    const st = h('table', { class: 'rt-ltable rt-ltolsens' });
    st.append(h('thead', null, h('tr', null, ...['Tolerance', '±', 'At −', 'At +', ''].map(t => h('th', { scope: 'col' }, t)))));
    const sb = h('tbody'), show = ctx.state.allSens ? rows : rows.slice(0, 12);
    const kindUnit = KIND_UNIT;
    for (const r of show) {
      const w = Math.max(r.minus, r.plus) / worst;
      sb.append(h('tr', null, h('td', null, r.label), h('td', { class: 'mono' }, tolFmt(r.lim, 4) + ' ' + kindUnit[r.kind]),
        h('td', { class: 'mono' }, (r.minus >= 0 ? '+' : '') + unit(r.minus)), h('td', { class: 'mono' }, (r.plus >= 0 ? '+' : '') + unit(r.plus)),
        h('td', null, h('div', { class: 'rt-lshare' }, h('div', { class: 'bar' }, h('span', { style: 'width:' + Math.max(0, 100 * w).toFixed(1) + '%' }))))));
    }
    st.append(sb);
    card.append(h('div', { class: 'rt-ltwrap' }, st));
    if (rows.length > 12) card.append(h('button', { class: 'rt-link', type: 'button', onclick: () => { ctx.state.allSens = !ctx.state.allSens; ctx.redraw(); } }, ctx.state.allSens ? 'Show the 12 worst' : 'Show all ' + rows.length));
    card.append(h('p', { class: 'rt-lsub' }, 'Each tolerance alone at its limits, ' + (T.comp ? 'each build refocused' : 'not refocused') + ': the change in the criterion from nominal. Sorted worst first.'));
  }
  // inverse sensitivity
  const I = mine && mine.inv;
  if (I && I.nominal !== null && I.rows.length) card.append(...invView(ctx, I, T, unit, set));
  // Monte Carlo
  const M = mine && mine.mc;
  if (M && M.trials.length) {
    const st = mcStats(M.trials.map(t => t.crit));
    card.append(h('h3', null, 'Monte Carlo'));
    const row = h('div', { class: 'rt-lpair' }), left = h('div'), right = h('div');
    row.append(left, right); card.append(row);
    const cv = histogram(left, M.trials.map(t => t.crit), wf ? 1 : 1000, wf ? 'waves' : 'µm', M.nominal, st.p90);
    plotCsv(cv, 'monte carlo', ['build', 'criterion', 'refocus (mm)'], () => M.trials.map(t => [t.j + 1, t.crit, t.dz]));
    left.append(plotSaveRow(cv));
    const dz = M.trials.map(t => t.dz - (M.nominalDz || 0)), dzm = dz.reduce((a, b) => a + b, 0) / dz.length, dzs = Math.sqrt(dz.reduce((a, b) => a + (b - dzm) ** 2, 0) / Math.max(1, dz.length - 1));
    const rr = [['Builds', String(st.n)], ['Nominal', unit(M.nominal)], ['Mean', unit(st.mean)], ['Standard deviation', unit(st.sd)], ['Best', unit(st.best)],
      ['50% of builds at least as good as', unit(st.p50)], ['80%', unit(st.p80)], ['90%', unit(st.p90)], ['98%', unit(st.p98)], ['Worst', unit(st.worst)]];
    if (T.comp) rr.push(['Refocus from the nominal’s best focus', tolFmt(1000 * dzm, 4) + ' ± ' + tolFmt(1000 * dzs, 4) + ' µm']);
    const live = compsFor(mine.prob.P, T.comps);
    live.forEach((c, j) => {
      const v = M.trials.filter(t => t.cv).map(t => t.cv[j]);
      if (!v.length) return;
      const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)), big = Math.max(...v.map(Math.abs));
      rr.push([compLabel(mine.prob.P, c), tolFmt(m, 3) + ' \u00b1 ' + tolFmt(sd, 3) + ' ' + (c.kind === 'tilt' ? 'arcmin' : 'mm') + ', at most ' + tolFmt(big, 3) + (big >= c.range * (1 - 1e-9) ? ' (at its range)' : '')]);
    });
    const Yd = yieldOf(M.trials, T.yield);
    if (Yd) {
      const pc = v => tolFmt(100 * v, 3) + '%';
      rr.unshift(['Yield, meeting the specification', pc(Yd.rate) + ' (' + Yd.k + ' of ' + Yd.n + '; ' + pc(Yd.lo) + ' to ' + pc(Yd.hi) + ' at 95% confidence)']);
      if (Yd.per.length > 1) Yd.per.forEach((q, i) => rr.splice(1 + i, 0, ['  ' + (q.what === 'crit' ? 'criterion at most ' + unit(T.yield.crit) : specName(D, T.yield.specs.find(s => s.j === q.what))), pc(q.rate) + ' of builds']));
    }
    right.append(h('div', { class: 'rt-readout' }, h('dl', null, ...rr.flatMap(([a, b]) => [h('dt', null, a), h('dd', { class: 'mono' }, b)]))));
  }
  card.append(helpLine('Tolerances the design against its own conditions.', ['Tolerance the bench, in the Sweeps menu, varies the bench’s parts as they stand there; this tab tolerances the lens design against its own conditions.'], 'rt-lsub'));
  return card;
}

const KIND_UNIT = { rad: 'fringes', thk: 'mm', dec: 'mm', tilt: 'arcmin', ind: 'in n', abbe: '%', irr: 'fringes', wedge: 'arcmin', sdec: 'mm' };
/* a limit to set: two significant figures, rounded down (so it keeps within what was found) */
const roundDown = v => { if (!(v > 0)) return v; const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.floor(v / p + 1e-9) * p; };
/* inverse sensitivity's results: each kind's tightest item against its setting, with the means to take them, and every item */
function invView(ctx, I, T, unit, set) {
  const out = [h('h3', null, 'Inverse sensitivity')];
  out.push(h('div', { class: 'rt-readout' }, h('dl', null, h('dt', null, 'Nominal'), h('dd', { class: 'mono' }, unit(I.nominal)), h('dt', null, 'Worsening allowed'), h('dd', { class: 'mono' }, unit(I.target) + (T.inv.by === 'pct' ? ' (' + tolFmt(T.inv.v, 4) + '%)' : '')))));
  const kinds = KIND_ROWS.filter(([k]) => I.rows.some(r => r.kind === k)).map(([k, label]) => { const rs = I.rows.filter(r => r.kind === k), lim = rs.filter(r => !r.beyond), m = (lim.length ? lim : rs).reduce((a, r) => r.inv < a.inv ? r : a, (lim.length ? lim : rs)[0]); return { k, label, now: T[k].v, tight: m.inv, by: m.label, beyond: rs.every(r => r.beyond) }; });
  const kt = h('tbody');
  for (const q of kinds) kt.append(h('tr', { class: q.tight < q.now ? 'on' : '' }, h('td', null, q.label), h('td', { class: 'mono' }, tolFmt(q.now, 4) + ' ' + KIND_UNIT[q.k]),
    h('td', { class: 'mono' }, (q.beyond ? '\u2265 ' : '') + tolFmt(q.tight, 3) + ' ' + KIND_UNIT[q.k]), h('td', { class: 'rt-lsub' }, q.beyond ? 'none of them worsens it that much' : q.by)));
  out.push(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable rt-ltolinv' }, h('thead', null, h('tr', null, ...['Tolerance', 'Set now', 'Allowed, the tightest', 'Set by'].map(t => h('th', { scope: 'col' }, t)))), kt)));
  out.push(h('div', { class: 'rt-lbar' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => set(t => { for (const q of kinds) if (!q.beyond) t[q.k].v = roundDown(q.tight); }) }, 'Use these limits'),
    h('span', { class: 'rt-lsub' }, 'Each kind set to its tightest, to two figures, rounded down. Kinds tighter than now are marked.')));
  const rows = I.rows.slice().sort((a, b) => a.inv / a.lim - b.inv / b.lim), show = ctx.state.allInv ? rows : rows.slice(0, 12), tb = h('tbody');
  for (const r of show) tb.append(h('tr', null, h('td', null, r.label), h('td', { class: 'mono' }, tolFmt(r.lim, 4) + ' ' + KIND_UNIT[r.kind]),
    h('td', { class: 'mono' }, (r.beyond ? '\u2265 ' : '') + tolFmt(r.inv, 3) + ' ' + KIND_UNIT[r.kind]), h('td', { class: 'rt-lsub' }, (r.beyond ? 'beyond a thousand times the limit' : '') + (r.closes ? (r.beyond ? '; ' : '') + 'the ' + (r.label.startsWith('Air') ? 'gap' : 'glass') + ' has closed on its \u2212 side' : ''))));
  out.push(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable rt-ltolsens' }, h('thead', null, h('tr', null, ...['Tolerance', 'Set now', 'Allowed', ''].map(t => h('th', { scope: 'col' }, t)))), tb)));
  if (rows.length > 12) out.push(h('button', { class: 'rt-link', type: 'button', onclick: () => { ctx.state.allInv = !ctx.state.allInv; ctx.redraw(); } }, ctx.state.allInv ? 'Show the 12 tightest' : 'Show all ' + rows.length));
  out.push(helpLine('Each tolerance alone, ' + (T.comp ? 'each build refocused' : 'not refocused') + ', tightest first.', ['Each tolerance alone, ' + (T.comp ? 'each build refocused' : 'not refocused') + ': the limit at which the criterion is worse by the worsening allowed, the worse of its two signs, found to a part in a hundred. Sorted tightest first against the limit set now. Together the tolerances add (Sensitivity\u2019s estimate, Monte Carlo\u2019s spread), so a build with every one at its allowed limit is worse than this.'], 'rt-lsub'));
  return out;
}
/* a merit operand as the yield names it, and its specification */
const specName = (D, sp) => { const o = D.merit.ops[sp.j]; return (o ? o.op : 'operand') + ' ' + (sp.j + 1) + (sp.lo !== null && sp.hi !== null ? ' within ' + tolFmt(sp.lo, 5) + ' to ' + tolFmt(sp.hi, 5) : sp.lo !== null ? ' at least ' + tolFmt(sp.lo, 5) : ' at most ' + tolFmt(sp.hi, 5)); };
/* the yield's specification: the criterion at most this, and any merit operand within limits */
function yieldCard(D, T, wf, set) {
  const Y = T.yield || { crit: null, specs: [] }, wrap = h('div', { class: 'rt-lyield' });
  const crit = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: Y.crit === null ? '' : tolFmt(wf ? Y.crit : 1000 * Y.crit, 6), placeholder: 'none', 'aria-label': 'Yield: the criterion at most (' + (wf ? 'waves' : '\u00b5m') + ')' });
  crit.addEventListener('change', () => { const t = crit.value.trim(), x = parseFloat(t); set(q => { q.yield = Object.assign({ specs: [] }, q.yield || {}, { crit: t === '' || !(x > 0) ? null : wf ? x : x / 1000 }); }); });
  wrap.append(h('div', { class: 'rt-lrow' }, h('b', null, 'Yield'), h('label', null, 'the share of builds with the criterion at most ', crit, ' ' + (wf ? 'waves' : '\u00b5m'))));
  if (D.merit.ops.length) {
    const tb = h('tbody');
    D.merit.ops.forEach((o, j) => {
      const sp = Y.specs.find(q => q.j === j) || { lo: null, hi: null };
      const box = side => { const i = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: sp[side] === null ? '' : tolFmt(sp[side], 6), placeholder: 'none', 'aria-label': (side === 'lo' ? 'Yield: least ' : 'Yield: greatest ') + o.op + ' ' + (j + 1) });
        i.addEventListener('change', () => { const t = i.value.trim(), x = parseFloat(t); set(q => { const y = Object.assign({ crit: null, specs: [] }, q.yield || {}), cur = Object.assign({ j, lo: null, hi: null }, y.specs.find(z => z.j === j) || {}); cur[side] = t === '' || !isFinite(x) ? null : x; y.specs = y.specs.filter(z => z.j !== j).concat([cur]); q.yield = y; }); }); return i; };
      tb.append(h('tr', null, h('td', null, o.op + ' ' + (j + 1)), h('td', { class: 'rt-lsub' }, 'target ' + tolFmt(o.target, 5)), h('td', null, 'from ', box('lo'), ' to ', box('hi'))));
    });
    wrap.append(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable' }, h('thead', null, h('tr', null, ...['Merit operand', '', 'Within, on each build'].map(t => h('th', { scope: 'col' }, t)))), tb)));
  }
  wrap.append(helpLine('Monte Carlo gives the share of builds that meet this.', ['Monte Carlo gives the share of its builds, each compensated, that meet every part of this, with the range it is within at 95% confidence, and each part\u2019s own share. Change it after a run and the yield is worked out again from the same builds.'], 'rt-lsub'));
  return wrap;
}
/* a compensator's name, in this prescription */
export function compLabel(P, c) {
  const sps = surfaceParts(P);
  if (c.kind === 'gap') return 'Air gap after surface ' + (c.i + 1);
  const first = sps.findIndex(s => s.pi === c.i), p = P.parts[c.i], name = p && p.kind === 'mirror' ? 'mirror, surface ' + (first + 1) : 'lens on surfaces ' + (first + 1) + '\u2013' + (first + (p ? p.n : 1));
  return (c.kind === 'dec' ? 'Decentre in ' : 'Tilt about ') + c.axis + ' of the ' + name;
}
/* the compensators beyond the focus: each moved, within its range, to make each build as good as it can be */
function compsCard(P, T, set) {
  const sps = surfaceParts(P), have = T.comps || [], live = compsFor(P, have), unit = c => c.kind === 'tilt' ? 'arcmin' : 'mm';
  const wrap = h('div', { class: 'rt-lcomps' });
  const rows = h('tbody');
  have.forEach((c, j) => {
    const ok = live.includes(c);
    const r = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum', value: tolFmt(c.range, 6), 'aria-label': 'Range of ' + (ok ? compLabel(P, c) : 'compensator ' + (j + 1)) + ' (' + unit(c) + ')' });
    r.addEventListener('change', () => { const x = parseFloat(r.value); if (isFinite(x) && x > 0) set(t => { t.comps[j].range = x; }); else r.value = tolFmt(c.range, 6); });
    rows.append(h('tr', null, h('td', null, ok ? compLabel(P, c) : h('span', { class: 'rt-lsub' }, 'not in the design as it now is')), h('td', null, '\u00b1 ', r, ' ', unit(c)),
      h('td', null, h('button', { class: 'rt-link', type: 'button', 'aria-label': 'Remove ' + (ok ? compLabel(P, c) : 'compensator ' + (j + 1)), onclick: () => set(t => { t.comps.splice(j, 1); }) }, 'Remove'))));
  });
  // what can be added: each air gap between parts, each lens's decentre and tilt
  const opts = [];
  for (let i = 0; i + 1 < sps.length; i++) if (sps[i].pi !== sps[i + 1].pi) opts.push({ kind: 'gap', i });
  P.parts.forEach((p, pi) => { if (p.kind !== 'stop') for (const kind of ['dec', 'tilt']) for (const axis of ['x', 'y']) opts.push({ kind, i: pi, axis }); });
  const free = opts.filter(o => !have.some(c => c.kind === o.kind && c.i === o.i && c.axis === o.axis));
  const sel = h('select', { 'aria-label': 'Add a compensator' }, h('option', { value: '' }, 'Add a compensator\u2026'), ...free.map((o, k) => h('option', { value: String(k) }, compLabel(P, o))));
  sel.addEventListener('change', () => { const o = free[+sel.value]; if (!o) return; set(t => { t.comps = (t.comps || []).concat([Object.assign({}, o, { range: o.kind === 'tilt' ? 10 : 0.5 })]); }); });
  wrap.append(h('div', { class: 'rt-lrow' }, h('b', null, 'Compensators'), sel));
  if (have.length) wrap.append(h('div', { class: 'rt-ltwrap' }, h('table', { class: 'rt-ltable' }, rows)));
  wrap.append(helpLine(have.length ? 'Set in each build, as an assembler would adjust them.' : 'Add values an assembler would adjust in each build.', [have.length ? 'For each build, ' + (T.comp ? 'the focus and ' : '') + 'these are set to make it as good as it can be (damped least squares on the criterion), each within its range: what an assembler adjusting them would do.'
    : 'Beyond the focus, an air gap, or a lens\u2019s decentre or tilt, can be set for each build to make it as good as it can be, within a range: as an assembler adjusts them.'], 'rt-lsub'));
  return wrap;
}
/* the builds' criterion, binned; the nominal and the 90% line marked */
function histogram(parent, vals, k, u, nominal, p90) {
  const cv = h('canvas', { role: 'img', 'aria-label': 'The criterion over ' + vals.length + ' builds' });
  const wrap = h('div', { class: 'rt-lplot' }, cv);
  parent.append(wrap);
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1, W = Math.max(220, wrap.clientWidth || 360), H = 200;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lo = Math.min(...vals, nominal !== null ? nominal : Infinity), hi = Math.max(...vals), nb = 20, span = (hi - lo) || 1e-12, bins = new Array(nb).fill(0);
    for (const v of vals) bins[Math.min(nb - 1, Math.floor((v - lo) / span * nb))]++;
    const top = Math.max(...bins), l = 8, r = W - 8, t = 10, b = H - 34, bw = (r - l) / nb;
    g.fillStyle = '#2a78d6';
    bins.forEach((n, i) => { const hgt = (b - t) * n / top; if (n) { g.beginPath(); g.roundRect ? g.roundRect(l + i * bw + 1, b - hgt, bw - 2, hgt, [3, 3, 0, 0]) : g.rect(l + i * bw + 1, b - hgt, bw - 2, hgt); g.fill(); } });
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.moveTo(l, b + 0.5); g.lineTo(r, b + 0.5); g.stroke();
    const X = v => l + (v - lo) / span * (r - l);
    g.font = '10px ' + (getComputedStyle(document.body).getPropertyValue('--jek-mono') || 'monospace'); g.fillStyle = '#555'; g.textAlign = 'left';
    g.fillText(tolFmt(k * lo, 4) + ' ' + u, l, b + 14); g.textAlign = 'right'; g.fillText(tolFmt(k * hi, 4) + ' ' + u, r, b + 14);
    const mark = (v, label, dash) => { const x = X(v); g.strokeStyle = '#222'; g.setLineDash(dash ? [4, 3] : []); g.beginPath(); g.moveTo(x + 0.5, t); g.lineTo(x + 0.5, b); g.stroke(); g.setLineDash([]); g.textAlign = x > W / 2 ? 'right' : 'left'; g.fillStyle = '#222'; g.fillText(label, x + (x > W / 2 ? -4 : 4), t + 10); };
    if (nominal !== null) mark(nominal, 'nominal', false);
    mark(p90, '90%', true);
    g.fillStyle = '#555'; g.textAlign = 'center'; g.fillText('Criterion over the builds (count of builds in each bin, most ' + top + ')', W / 2, H - 6);
  });
  return cv;
}
