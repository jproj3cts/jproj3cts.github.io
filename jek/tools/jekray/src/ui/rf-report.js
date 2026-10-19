import { project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { designPrescription, surfaceParts } from '../engines/lens-design.js';
import { RF_HORNS, RF_MAT } from '../core/rf.js';
import { RF_MERIT_OPS, RF_MERIT_SENSES, RF_TOL_KINDS, RF_T0, normRfMeritOps, normRfTol, rfBand, rfBandSweep, rfCrossPol, rfMcOf, rfMcValue, rfMeritReport, rfOptVars, rfPattern, rfPhaseMap, rfScan, rfSensitivity, rfThermal, rfWaistView, rfYield } from '../engines/rf-design.js';
import { VecCtx, pdfDoc } from '../io/layout.js';
import { downloadFile, safeFileName, toast } from './actions.js';
import { RP_H, RP_INK, RP_M, RP_RULE, RP_SOFT, RP_W, rpHead, rpKey, rpNum, rpPage, rpPara, rpPlot, rpRange, rpTable, rpText } from './lens-report.js';
import { diverge } from './lens-analyses.js';
import { magma } from './plots.js';
import { drawSheet, lensDrawings } from './lens-drawing.js';
import { RW_LIGHT, rwMakeGrin, rwMakeLens, rwPaintLayout } from './rf-workspace.js';
import { track } from '../io/usage.js';

/* ==========================================================================
   The RF design report: the design as a PDF to hand on
   A4 pages, portrait: the summary (its conditions, its figures, the layout with the beam, the loss budget);
   its Element data with the merit function, the configurations and the optimiser's variables; its analyses
   (over the band, the far-field pattern or the beam to the goal, the phase map, the cross-polar field, the scan,
   temperature); its tolerances (the settings, the sensitivity of each error, the Monte Carlo if it was run on
   the design as it is) and what can be made; then each lens's drawing, landscape. Every page is drawn with the
   canvas's own calls into a VecCtx, so all of it stays vector.
   ========================================================================== */
const RF_COLS = ['#2a78d6', '#e0a030', '#e34948'];
const rfDbOf = v => 10 * Math.log10(Math.max(1e-12, v));
const rfPct = v => rpNum(100 * v, 4) + ' %';

/* the pages of the report, as records; opts.mc: the workspace's Monte Carlo run on this design, if any */
export function rfReportRecs(asm, opts) {
  opts = opts || {};
  const P = designPrescription(asm), R = asm.rf, T = rfBand(asm, P), m = T.mid, coll = R.goal.kind === 'collimate', unit = coll ? 'dBi' : 'dB';
  const meta = { name: asm.name, date: new Date().toISOString().slice(0, 10), pages: [], kind: 'RF design report' };
  const sps = surfaceParts(P), nameOf = i => { const sp = sps[i], e = getEl(sp.id), nm = e ? e.name : '?'; return sp.n === 2 ? nm + (sp.j ? ', back' : ', front') : nm; };
  const figOf = t => coll ? t.gain : rfDbOf(t.coupling);
  const band = (f, p) => rpNum(Math.min(f(T.lo), f(T.mid), f(T.hi)), p || 4) + ' to ' + rpNum(Math.max(f(T.lo), f(T.mid), f(T.hi)), p || 4);

  // ---- 1: summary ----
  let pg = rpPage(meta, '');
  const g = pg.g;
  rpText(g, asm.name, RP_M, pg.y + 8, { size: 22, bold: true }); pg.y += 26;
  rpText(g, 'RF design report · ' + benchName(asm.bench) + ' in ' + (project.name || 'Untitled bench'), RP_M, pg.y, { size: 9.5, ink: RP_SOFT }); pg.y += 22;
  rpHead(pg, 'Conditions');
  const horn = (hh, what) => what + ': ' + (RF_HORNS[hh.kind] || RF_HORNS.corrugated).name.toLowerCase() + ', aperture radius ' + rpNum(hh.a, 4) + ' mm, slant length ' + rpNum(hh.L, 4) + ' mm';
  const goal = R.goal.kind === 'collimate' ? 'a collimated beam, shown to ' + rpNum(R.goal.d, 5) + ' mm past the last face' : R.goal.kind === 'focus' ? 'a waist of ' + rpNum(R.goal.w, 4) + ' mm radius ' + rpNum(R.goal.d, 5) + ' mm past the last face' : horn(R.goal.rx, 'a receiving horn').replace('a receiving horn: ', 'a receiving horn (') + ') with its aperture ' + rpNum(R.goal.d, 5) + ' mm past the last face';
  rpPara(pg, 'Designed at ' + rpNum(R.ghz, 5) + ' GHz, judged over ' + rpNum(R.lo, 5) + ' to ' + rpNum(R.hi, 5) + ' GHz. ' + horn(R.feed, 'Feed horn') + ', its aperture ' + rpNum(R.feed.d, 5) + ' mm before the first surface' + (R.feed.off ? ', ' + rpNum(R.feed.off, 4) + ' mm off the axis' + (R.feed.aim === false ? ' pointed ' + rpNum(R.feed.ang, 4) + '° from it' : ', aimed at the first vertex') : '') + '. Goal: ' + goal + '.');
  rpHead(pg, 'Figures, at ' + rpNum(R.ghz, 5) + ' GHz' + (P.folded ? ' (the axis folded by its mirrors, unfolded here)' : ''));
  const rows1 = coll
    ? [['Gain', rpNum(m.gain, 4) + ' dBi', 'over the band ' + band(t => t.gain) + ' dBi'], ['Aperture efficiency', rfPct(m.apEff), 'the last aperture, ' + rpNum(m.D, 5) + ' mm across'], ['Beam leaving', 'waist ' + rpNum(m.waist.w, 4) + ' mm', rpNum(Math.abs(m.waist.at), 4) + ' mm ' + (m.waist.at < 0 ? 'before' : 'after') + ' the last face; divergence ' + rpNum(m.theta, 3) + '° (1/e²)']]
    : [['Coupling', rfPct(m.coupling) + ' (' + rpNum(rfDbOf(m.coupling), 4) + ' dB)', 'over the band ' + band(t => 100 * t.coupling) + ' %'], ['Waist made', rpNum(m.waist.w, 4) + ' mm', rpNum(Math.abs(m.waist.at), 4) + ' mm ' + (m.waist.at < 0 ? 'before' : 'after') + ' the last face; wanted ' + rpNum(m.target.w, 4) + ' mm at ' + rpNum(m.target.at, 4) + ' mm']];
  if (T.ref && m.steer) rows1.push(['Beam steered', rpNum(Math.abs(m.steer.squint), 3) + '°, the feed ' + rpNum(Math.abs(m.steer.feedDeg), 3) + '° off', 'scan loss ' + rpNum(figOf(T.ref) - figOf(m), 3) + ' dB']);
  rows1.push(['Efficiency', rfPct(m.eff) + ' (' + rpNum(rfDbOf(m.eff), 4) + ' dB)', 'over the band ' + band(t => 100 * t.eff) + ' %'],
    ['Reflections', rpNum(rfDbOf(m.refl), 3) + ' dB', 'Absorption ' + rpNum(rfDbOf(m.absorb), 3) + ' dB; spillover ' + rpNum(rfDbOf(m.spill), 3) + ' dB'],
    ['Phase error', rpNum(m.sigma / m.lam, 3) + ' λ RMS', rpNum(rfDbOf(m.phaseEff), 3) + ' dB' + (m.shadow < 1 ? '; the zones’ steps shadow ' + rpNum(rfDbOf(m.shadow), 3) + ' dB' : '')]);
  rpTable(pg, [{ label: 'Figure', w: 100 }, { label: 'Value', w: 150, mono: true }, { label: '', w: 249 }], rows1);
  rpHead(pg, 'Layout: the feed horn, the parts and the beam (1/e² radius) to the goal');
  const LW = RP_W - 2 * RP_M, LH = 200;
  g.save(); g.translate(RP_M, pg.y); rwPaintLayout(g, LW, LH, asm, P, T, RW_LIGHT); g.restore();
  g.strokeStyle = RP_RULE; g.lineWidth = 0.5; g.strokeRect(RP_M, pg.y, LW, LH); pg.y += LH + 12;
  rpKey(g, RP_M, pg.y, [[rpNum(R.ghz, 4) + ' GHz', '#e0a030'], ['the band’s edges', 'rgba(224,160,48,0.8)', true]]); pg.y += 18;
  rpHead(pg, 'Where the power goes, at ' + rpNum(R.ghz, 5) + ' GHz');
  const lb = [['Feed horn: its power in the Gaussian', m.g]];
  for (const f of m.faces) { const sp = sps[f.i], el = getEl(P.parts[sp.pi].id); lb.push([f.mirror ? 'Ohmic loss, ' + (el ? el.name : 'mirror') : 'Reflection, ' + (el ? el.name : 'face') + (sp.j === 0 ? ' front' : ' back') + (f.matched ? ' (matched)' : ''), 1 - f.R]); }
  for (const l of m.lenses) { const el = getEl(P.parts[sps[l.i].pi].id); lb.push(['Absorption, ' + (el ? el.name : 'lens') + ' (' + l.mat + ')', l.T]); }
  lb.push(['Spillover on the way', m.spill], ['Phase error', m.phaseEff]);
  if (m.shadow < 1) lb.push(['Shadow of the zones’ steps', m.shadow]);
  if (coll) lb.push(['Aperture efficiency of the last aperture', m.apEff]); else { lb.push(['Coupling to the goal’s beam', m.coupling]); if (R.goal.kind === 'couple') lb.push(['Receiving horn: the share its mode takes', m.gRx]); }
  lb.push(['All of it', m.eff]);
  rpTable(pg, [{ label: 'Factor', w: 300 }, { label: 'Share', w: 90, mono: true, align: 'right' }, { label: 'dB', w: 109, mono: true, align: 'right' }], lb.map(([a, v]) => [a, rfPct(v), rpNum(rfDbOf(v), 3)]), { size: 7.5 });

  // ---- 2: element data, merit, configurations ----
  pg = rpPage(meta, 'Element data');
  const cols = [{ label: '#', w: 34 }, { label: 'Surface', w: 120 }, { label: 'Radius', w: 70, mono: true, align: 'right' }, { label: 'Conic', w: 55, mono: true, align: 'right' }, { label: 'Thickness', w: 70, mono: true, align: 'right' }, { label: 'Material', w: 95 }, { label: 'Clear radius', w: 55, mono: true, align: 'right' }];
  const rows = [['FEED', 'Feed horn', '—', '', rpNum(R.feed.d, 6), 'Air', rpNum(R.feed.a, 4)]];
  P.surfaces.forEach((s, i) => {
    const sp = sps[i], p = P.parts[sp.pi], last = i === P.surfaces.length - 1;
    const mat = p.kind === 'mirror' ? 'Mirror' + (s.sec ? ', off ' + rpNum(s.sec.h, 4) + ' mm' : '') : last || !P.materials[i] || P.materials[i].glass === 'AIR' ? 'Air' : (RF_MAT[P.materials[i].glass] || {}).name || P.materials[i].glass;
    const rad = p.kind === 'mirror' ? (s.R === null ? 'Flat' : rpNum(-s.R, 6)) : p.kind === 'grin' ? 'flat' : s.R === null ? 'Flat' : rpNum(s.R, 6);
    rows.push([String(i + 1), nameOf(i), rad, s.k ? rpNum(s.k, 5) : '', last ? rpNum(R.goal.d, 6) : rpNum(P.gaps[i], 6), mat, rpNum(s.semi, 5)]);
  });
  rows.push(['GOAL', coll ? 'Collimated beam' : R.goal.kind === 'focus' ? 'Waist' : 'Receiving horn', '—', '', '', 'Air', R.goal.kind === 'couple' ? rpNum(R.goal.rx.a, 4) : R.goal.kind === 'focus' ? rpNum(R.goal.w, 4) : '']);
  rpTable(pg, cols, rows, { size: 7.5 });
  rpPara(pg, 'Lengths in mm. The feed’s thickness is its aperture’s distance to the first surface; the last is to the goal. A lens’s radius is positive with its centre beyond the face; a mirror’s positive concave, as its part has it, and an offset reflector’s offset is its section’s distance off the parent axis.', { ink: RP_SOFT });
  const vars = rfOptVars(P), keys = (asm.rfOpt && asm.rfOpt.keys) || [], named = keys.map(k => { const v = vars.find(q => q.key === k); if (!v) return k; const el = v.part ? getEl(v.part) : null; return v.label.toLowerCase() + (el ? ' of ' + el.name : ''); });
  rpHead(pg, 'Optimiser: its variables and merit');
  rpPara(pg, (named.length ? 'Variables: ' + named.join(', ') + '.' : 'No variables marked.'));
  const o = asm.rfOpt || {}, ops = normRfMeritOps(o.ops), Rp = rfMeritReport(asm, P, { keys: [], flat: o.flat || 0, edgeMin: o.edgeMin || 0, tMax: o.tMax || 0, ops });
  const MC = rfMcOf(asm);
  if (Rp.own) rpTable(pg, [{ label: 'Term', w: 190 }, { label: 'At', w: 95 }, { label: 'Target', w: 90, mono: true }, { label: 'Weight', w: 45, mono: true }, { label: 'Now', w: 79, mono: true }], Rp.ops.map(q => [RF_MERIT_OPS[q.op].label + (MC && q.c !== undefined ? ' (' + MC.configs[q.c].name + ')' : ''), q.ghz === null ? 'across the band' : rpNum(q.ghz, 5) + ' GHz', RF_MERIT_SENSES[q.sense] + ' ' + rpNum(q.target, 5), rpNum(q.weight, 3), q.at.length > 1 ? rpNum(Math.min(...q.at.map(a => a.value)), 4) + ' to ' + rpNum(Math.max(...q.at.map(a => a.value)), 4) : rpNum(q.at[0] ? q.at[0].value : NaN, 4)]), { size: 7.5 });
  else rpPara(pg, 'The merit is the efficiency at five frequencies across the band, as high as it can be (no terms set).', { ink: RP_SOFT });
  rpPara(pg, 'Merit ' + rpNum(Rp.merit, 5) + (o.flat ? '; the efficiency asked to be flat across the band' : '') + '. Boundaries: each lens’s edge at least ' + rpNum(o.edgeMin === undefined ? 1 : o.edgeMin, 3) + ' mm' + (o.tMax > 0 ? ', its centre at most ' + rpNum(o.tMax, 4) + ' mm' : '') + ', the air between parts open, the feed before the first surface.', { ink: RP_SOFT });
  if (MC) {
    rpHead(pg, 'Configurations (this report is of ' + MC.configs[MC.active].name + ')');
    const shown = MC.configs.slice(0, 5), cw = Math.floor((RP_W - 2 * RP_M - 150) / shown.length), rfOf = ci => (ci === MC.active ? R : MC.configs[ci].rf);
    const crow = [['Weight', ...shown.map(c => rpNum(c.w, 4))], ['Design frequency (GHz)', ...shown.map((c, ci) => rpNum(rfOf(ci).ghz, 5))], ['Band (GHz)', ...shown.map((c, ci) => rpNum(rfOf(ci).lo, 4) + '–' + rpNum(rfOf(ci).hi, 4))],
      ['Feed horn', ...shown.map((c, ci) => (RF_HORNS[rfOf(ci).feed.kind] || {}).name || rfOf(ci).feed.kind)], ['Feed to the first surface (mm)', ...shown.map((c, ci) => rpNum(rfOf(ci).feed.d, 5))], ['Feed off the axis (mm)', ...shown.map((c, ci) => rpNum(rfOf(ci).feed.off || 0, 4))],
      ['Goal', ...shown.map((c, ci) => rfOf(ci).goal.kind + ', ' + rpNum(rfOf(ci).goal.d, 5) + ' mm')]];
    for (const k of MC.keys) { const v = vars.find(q => q.key === k); if (!v) continue; const el = v.part ? getEl(v.part) : null; crow.push([v.label + (el ? ' of ' + el.name : ''), ...shown.map((c, ci) => { const x = rfMcValue(asm, P, ci, k); return rpNum(k[0] === 'c' || k[0] === 'p' ? (Math.abs(x) < 1e-12 ? Infinity : 1 / x) : x, 6); })]); }
    rpTable(pg, [{ label: '', w: 150 }].concat(shown.map(c => ({ label: c.name, w: cw, mono: true, align: 'right' }))), crow, { size: 7.5 });
    if (MC.configs.length > shown.length) rpPara(pg, 'And ' + (MC.configs.length - shown.length) + ' more configurations, not shown.', { ink: RP_SOFT });
  }

  // ---- 3: analyses ----
  pg = rpPage(meta, 'Analyses');
  const S = rfBandSweep(asm, P, 61), xs = S.map(s => s.ghz), pw = (RP_W - 2 * RP_M - 40) / 2, ph = 140;
  rpHead(pg, 'Over the band');
  rpPlot(pg.g, RP_M + 30, pg.y + 10, pw - 30, ph, { xr: [xs[0], xs[xs.length - 1]], yr: rpRange(S.map(s => coll ? s.gain : rfDbOf(s.coupling)), 0.1), series: [{ xs, ys: S.map(s => coll ? s.gain : rfDbOf(s.coupling)), colour: RF_COLS[1] }], title: coll ? 'Gain' : 'Coupling', xName: 'frequency (GHz)', yName: unit });
  const losses = [['efficiency', s => s.eff, RF_COLS[1]], ['reflections', s => s.refl, RF_COLS[0]], ['absorption', s => s.absorb, '#2a9d5c'], ['spillover', s => s.spill, '#8a4fd1'], ['phase error', s => s.phaseEff, RF_COLS[2]]];
  rpPlot(pg.g, RP_M + pw + 70, pg.y + 10, pw - 30, ph, { xr: [xs[0], xs[xs.length - 1]], yr: rpRange(losses.flatMap(([, f]) => S.map(s => rfDbOf(f(s)))).concat([0]), 0.1), series: losses.map(([, f, c]) => ({ xs, ys: S.map(s => rfDbOf(f(s))), colour: c })), title: 'The losses', xName: 'frequency (GHz)', yName: 'dB' });
  pg.y += ph + 48;
  rpKey(pg.g, RP_M, pg.y, losses.map(([t, , c]) => [t, c])); pg.y += 18;
  if (coll) {
    rpHead(pg, 'Far-field pattern of the last aperture');
    const th1 = Math.min(60, 8 * Math.atan(m.lam / m.D) * 180 / Math.PI + 4), ps = [T.lo, T.mid, T.hi].map(t => rfPattern(t.apAt, t.lam, th1));
    rpPlot(pg.g, RP_M + 30, pg.y + 10, pw - 30, ph, { xr: [0, th1], yr: [-50, 2], series: ps.map((p, k) => ({ xs: p.th, ys: p.db, colour: RF_COLS[k] })), title: 'Pattern', xName: 'angle from the axis (°)', yName: 'dB' });
    const Wv = rfWaistView(asm, P);
    rpPlot(pg.g, RP_M + pw + 70, pg.y + 10, pw - 30, ph, { xr: [0, Wv.lines[1].zs[Wv.lines[1].zs.length - 1]], yr: [0, 1.1 * Math.max(...Wv.lines.map(l => Math.max(...l.ws)))], series: Wv.lines.map((l, k) => ({ xs: l.zs, ys: l.ws, colour: RF_COLS[k] })), title: 'The beam on its way out', xName: 'past the last face (mm)', yName: '1/e² radius (mm)' });
    pg.y += ph + 48;
    rpKey(pg.g, RP_M, pg.y, [R.lo, R.ghz, R.hi].map((f, k) => [rpNum(f, 4) + ' GHz', RF_COLS[k]])); pg.y += 14;
    rpPara(pg, 'At ' + rpNum(R.ghz, 4) + ' GHz: half-power beamwidth ' + rpNum(ps[1].hpbw, 3) + '°, first sidelobe ' + (ps[1].sidelobe === null ? 'none within ' + rpNum(th1, 3) + '°' : rpNum(ps[1].sidelobe, 3) + ' dB') + '. The beam leaving: waist ' + rpNum(Wv.lines[1].waist.w, 4) + ' mm, ' + rpNum(Math.abs(Wv.lines[1].waist.at), 4) + ' mm ' + (Wv.lines[1].waist.at < 0 ? 'behind' : 'past') + ' the last face.', { ink: RP_SOFT });
  } else {
    rpHead(pg, 'The beam to the goal');
    const Wv = rfWaistView(asm, P), G = Wv.goal, wmax = Math.max(...Wv.lines.map(l => Math.max(...l.ws)));
    const ser = Wv.lines.map((l, k) => ({ xs: l.zs, ys: l.ws, colour: RF_COLS[k] }));
    if (G) ser.push({ xs: [G.at, G.at], ys: [0, wmax * 1.05], colour: RP_SOFT, dash: true });
    if (G && G.w) ser.push({ xs: [0, Wv.lines[1].zs[Wv.lines[1].zs.length - 1]], ys: [G.w, G.w], colour: RF_COLS[2], dash: true });
    rpPlot(pg.g, RP_M + 30, pg.y + 10, RP_W - 2 * RP_M - 30, ph, { xr: [0, Wv.lines[1].zs[Wv.lines[1].zs.length - 1]], yr: [0, 1.1 * wmax], series: ser, title: 'Beam radius past the last face', xName: 'past the last face (mm)', yName: '1/e² radius (mm)' });
    pg.y += ph + 48;
    rpKey(pg.g, RP_M, pg.y, [R.lo, R.ghz, R.hi].map((f, k) => [rpNum(f, 4) + ' GHz', RF_COLS[k]]).concat([['the goal’s plane', RP_SOFT, true]])); pg.y += 14;
    rpPara(pg, 'Waist at ' + rpNum(R.ghz, 4) + ' GHz: ' + rpNum(Wv.lines[1].waist.w, 4) + ' mm radius, ' + rpNum(Wv.lines[1].waist.at, 4) + ' mm past the last face; wanted ' + rpNum(G.w, 4) + ' mm at ' + rpNum(G.at, 4) + ' mm.', { ink: RP_SOFT });
  }
  // the phase map and the cross-polar field, side by side
  rpHead(pg, 'The wavefront over the beam, and the cross-polar field, at ' + rpNum(R.ghz, 4) + ' GHz');
  const Mp = rfPhaseMap(asm, P, R.ghz, 33), Xp = rfCrossPol(asm, P, R.ghz, 25), sq = 120, cell = (x0, N, val, colour) => {
    const d = sq / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = val(i, j); if (v === null) continue; const c = colour(v); pg.g.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; pg.g.fillRect(x0 + i * d, pg.y + (N - 1 - j) * d, d + 0.3, d + 0.3); }
    pg.g.strokeStyle = RP_RULE; pg.g.lineWidth = 0.5; pg.g.strokeRect(x0, pg.y, sq, sq);
  };
  const mx = Math.max(1e-6, ...Array.from(Mp.W).filter(isFinite).map(Math.abs));
  cell(RP_M, Mp.N, (i, j) => { const v = Mp.W[j * Mp.N + i]; return isFinite(v) ? v : null; }, v => diverge(v / mx));
  cell(RP_M + sq + 24, Xp.N, (i, j) => { const v = Xp.pol.y.map[j * Xp.N + i]; return isFinite(v) ? v : null; }, v => magma(Math.max(0, Math.min(1, (v + 60) / 60))));
  const tx = RP_M + 2 * sq + 48;
  rpText(pg.g, 'Wavefront error over the beam, in waves:', tx, pg.y + 12, { size: 7.5 });
  rpText(pg.g, 'RMS ' + rpNum(Mp.rms, 3) + ', peak to valley ' + rpNum(Mp.pv, 3) + '; scale ±' + rpNum(mx, 3) + ' λ.', tx, pg.y + 24, { size: 7.5 });
  rpText(pg.g, 'Red ahead, blue behind; the constant, tilt and defocus taken out.', tx, pg.y + 36, { size: 7, ink: RP_SOFT });
  rpText(pg.g, 'Cross-polar field, feed polarised in the bench’s plane:', tx, pg.y + 52, { size: 7.5 });
  rpText(pg.g, 'its power ' + rpNum(Xp.pol.y.frac, 3) + ' dB of the total (out of the plane: ' + rpNum(Xp.pol.x.frac, 3) + ' dB).', tx, pg.y + 64, { size: 7.5 });
  rpText(pg.g, 'Black −60 dB and below against the co-polar peak, bright 0 dB.', tx, pg.y + 76, { size: 7, ink: RP_SOFT });
  rpText(pg.g, 'The horn’s own cross-polar peak: ' + (Xp.horn === null ? 'none (an ideal Gaussian)' : Xp.horn < -100 ? 'next to none' : rpNum(Xp.horn, 3) + ' dB') + '.', tx, pg.y + 88, { size: 7, ink: RP_SOFT });
  pg.y += sq + 16;
  // ---- 4: tolerance and making ----
  pg = rpPage(meta, 'Tolerance and making');
  // the scan and temperature, as tables
  const sc = rfScan(asm, P, R.ghz, 5), Th = rfThermal(asm, P, [-20, 0, 20, 40, 60], 23.6e-6);
  rpHead(pg, 'The feed scanned across the axis, and the design over temperature in aluminium');
  rpTable(pg, [{ label: 'Feed off (mm)', w: 70, mono: true }, { label: 'Feed (°)', w: 60, mono: true }, { label: 'Beam (°)', w: 60, mono: true }, { label: 'Scan loss (dB)', w: 80, mono: true }, { label: '°C', w: 40, mono: true }, { label: (coll ? 'Gain' : 'Coupling') + ' (' + unit + ')', w: 80, mono: true }, { label: 'Change', w: 55, mono: true }, { label: 'Refocused', w: 54, mono: true }],
    sc.map((r, k) => [rpNum(r.off, 4), rpNum(r.feedDeg, 3), rpNum(Math.abs(r.beamDeg), 3), rpNum(r.loss, 3), rpNum(Th.rows[k].T, 3), rpNum(Th.rows[k].fig, 4), (Th.rows[k].dfig >= 0 ? '+' : '') + rpNum(Th.rows[k].dfig, 3), (Th.rows[k].comp.dfig >= 0 ? '+' : '') + rpNum(Th.rows[k].comp.dfig, 3)]), { size: 7 });
  rpPara(pg, 'Left, the feed moved across the axis and aimed at the first surface: the beam’s angle and what the scan costs. Right, each lens grown by its plastic’s expansion and the air by the housing’s, against the design at ' + RF_T0 + ' °C; the ' + (coll ? 'gain' : 'coupling') + ' changes by ' + (Th.drift >= 0 ? '+' : '') + rpNum(Th.drift, 3) + ' ' + unit + ' per kelvin.', { ink: RP_SOFT });

  rpHead(pg, 'Tolerances');
  const tol = normRfTol(asm.rfTol);
  rpTable(pg, [{ label: 'Error', w: 220 }, { label: 'Within ±', w: 90, mono: true }, { label: 'Unit', w: 189 }], Object.entries(RF_TOL_KINDS).map(([k, d]) => [d.label, tol[k].on ? rpNum(tol[k].v, 4) : 'off', d.unit]));
  rpPara(pg, (tol.comp ? 'Compensator: each built system’s feed distance refocused for the most of its figure. ' : 'No compensator: each build measured as it comes. ') + 'The criterion is the ' + (coll ? 'gain' : 'efficiency') + ' at ' + rpNum(R.ghz, 4) + ' GHz.', { ink: RP_SOFT });
  const Se = rfSensitivity(asm, P, tol);
  rpHead(pg, 'Sensitivity: each error alone at its limits');
  rpTable(pg, [{ label: 'Error', w: 230 }, { label: 'At −limit', w: 80, mono: true, align: 'right' }, { label: 'At +limit', w: 80, mono: true, align: 'right' }, { label: 'Beam moves', w: 109, mono: true, align: 'right' }], Se.rows.map(r => [r.label, (r.dn >= 0 ? '+' : '') + rpNum(r.dn, 3) + ' dB', (r.up >= 0 ? '+' : '') + rpNum(r.up, 3) + ' dB', r.moves > 1e-3 ? rpNum(r.moves, 3) + '°' : '—']), { size: 7.5 });
  rpPara(pg, 'The change in the ' + (coll ? 'gain' : 'efficiency') + ' from its nominal ' + rpNum(Se.nominal, 4) + ' ' + unit + (tol.comp ? ' (refocused)' : '') + '; a decentre or tilt also steers the beam, by the angle in the last column.', { ink: RP_SOFT });
  const mc = opts.mc && opts.mc.plan && opts.mc.plan.builds && opts.mc.plan.builds.length ? opts.mc : null;
  if (mc) {
    const B = mc.plan.builds, worst = B.map(b => b.worst).sort((a, b) => a - b), q = p => worst[Math.min(worst.length - 1, Math.max(0, Math.floor(p * (worst.length - 1))))];
    rpHead(pg, 'Monte Carlo: ' + B.length + ' builds, every error drawn at once');
    rpTable(pg, [{ label: 'Nominal', w: 90, mono: true }, { label: 'Mean', w: 90, mono: true }, { label: 'Worst 10 %', w: 90, mono: true }, { label: 'Worst 2 %', w: 90, mono: true }, { label: 'Worst build', w: 139, mono: true }],
      [[rpNum(mc.plan.nominal, 4), rpNum(worst.reduce((a, v) => a + v, 0) / worst.length, 4), rpNum(q(0.1), 4), rpNum(q(0.02), 4), rpNum(worst[0], 4)]]);
    if (tol.spec !== null) { const Y = rfYield(B, tol.spec); rpPara(pg, 'Yield: ' + rpNum(100 * Y.p, 3) + ' % of the builds (' + Y.k + ' of ' + Y.n + ') hold ' + rpNum(tol.spec, 4) + ' ' + unit + ' across the band, ' + rpNum(100 * Y.lo, 3) + ' to ' + rpNum(100 * Y.hi, 3) + ' % at 95 % confidence.', { ink: RP_SOFT }); }
  } else rpPara(pg, 'No Monte Carlo run has been made on the design as it is now. Run it in the Tolerance tab and make the report again to include it.', { ink: RP_SOFT });
  rpHead(pg, 'What can be made');
  let any = false;
  P.parts.forEach(p => {
    if (p.kind !== 'lens' && p.kind !== 'grin') return;
    const el = getEl(p.id); if (!el) return;
    any = true;
    const { M, geo, outside, grams, checks } = el.grin ? rwMakeGrin(el, R) : rwMakeLens(el, R), ok = checks.every(c => c[0]);
    rpPara(pg, el.name + ': ' + (ok ? 'manufacturable' : 'not manufacturable as it is') + '. ' + (M ? M.name + (el.grin ? ', graded' : '') : '—') + ', ' + rpNum(outside, 4) + ' mm outside' + (isFinite(grams) ? ', about ' + Math.round(grams) + ' g' : '') + (geo && isFinite(geo.centre) ? ', ' + rpNum(geo.centre, 4) + ' mm at the centre' : '') + '.');
    for (const [pass, what, why] of checks) rpPara(pg, '   ' + (pass ? '✓' : '✗') + ' ' + what + ': ' + why, { ink: pass ? RP_SOFT : RP_INK });
    pg.y += 4;
  });
  if (!any) rpPara(pg, 'No lenses to make: the system is mirrors.', { ink: RP_SOFT });

  // ---- the drawings, landscape ----
  const draws = lensDrawings(asm), recs = meta.pages.map(p => p.g);
  draws.forEach((Dd, i) => { const r = new VecCtx(842, 595, { plain: true }); drawSheet(r, Dd, { assembly: asm.name, sheet: i + 1, of: draws.length, date: meta.date }); recs.push(r); });
  recs.forEach((r, i) => rpText(r, 'Page ' + (i + 1) + ' of ' + recs.length, r.w - (r.w > r.h ? 22 + 330 : RP_M), r.w > r.h ? 14 : RP_H - 24, { size: 7.5, ink: RP_SOFT, align: r.w > r.h ? 'left' : 'right' }));
  return recs;
}
export const rfReportPdfBlob = (asm, opts) => pdfDoc(rfReportRecs(asm, opts), asm.name + ' RF design report', opts);
export async function saveRfReport(asm, opts) {
  const name = safeFileName(asm.name + ' - RF design report') + '.pdf';
  try { downloadFile(name, await rfReportPdfBlob(asm, opts)); toast('Saved ' + name); track('report', 'rf'); }
  catch (e) { toast('The report could not be made: ' + e.message, true); }
  return name;
}
