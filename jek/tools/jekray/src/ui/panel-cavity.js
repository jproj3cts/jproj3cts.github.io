import { TEST_MODE, clamp } from '../core/constants.js';
import { fmtHz, fmtLen, fmtW } from '../core/format.js';
import { cavLine } from '../core/beams-hom.js';
import { deg, project, selectOne, typeLabel } from '../state/project.js';
import { allSources, getEl, lightOf } from '../state/elements.js';
import { curBench } from '../state/tabs.js';
import { lastTrace } from '../engines/trace.js';
import { getCss, inkA, requestRender } from './render.js';
import { V3D } from './view3d.js';
import { updateReadouts } from './readouts.js';
import { BENCH_PIN, bindSync, fid, h, numInput, panel, pinTitle, renderPanel, selectField, setFid, syncPanel } from './panel.js';
import {
  axisFont, drawAxes, magma, plotArea, plotCsv, plotFrame, plotZoom, updateSyncButtons, zoomControls,
  zoomRange
} from './plots.js';
import { popRadii, popStats, qdht } from '../engines/field.js';
import { cavModes, cavRunCache, cavSolved, findCavities, laserState } from '../engines/cavity.js';
import { interp2, popStats2 } from '../engines/field2d.js';
import { popRunGen } from '../engines/beam-tree.js';
import { changed } from './actions.js';
import { checkpoint, selectEl } from './tabs.js';
import { scheduleSave } from '../io/autosave.js';
import { fieldWorker, fwRequest } from '../page/workers.js';

/* A card with nothing solved yet starts a field run of the bench in the background, in
   slices, and the panels refresh when it is done */
export let cavJob = null;
export function cavityLater() {
  if (TEST_MODE || (cavJob && cavJob.trace === lastTrace)) return;
  if (fieldWorker()) {
    const job = { trace: lastTrace };
    cavJob = job;
    fwRequest('cavity', 'cavity').then(() => { if (cavJob === job) { job.done = true; syncPanel(); } })
      .catch(() => { if (cavJob === job) cavJob = null; cavityLater(); });
    return;
  }
  const gen = popRunGen(lastTrace.beams, allSources(), {});
  const job = { trace: lastTrace, gen };
  cavJob = job;
  const step = () => {
    if (cavJob !== job) return;
    if (job.trace !== lastTrace) { cavJob = null; cavityLater(); return; }     // the bench moved on: start again on it
    const until = performance.now() + 30;
    let r; do r = gen.next(); while (!r.done && performance.now() < until);
    if (r.done) { job.done = true; syncPanel(); } else setTimeout(step, 0);
  };
  setTimeout(step, 20);
}
function cavGainRows(c) {
  const L = laserState(c);
  if (!L) return [];
  const g = L.G[0];
  if (!L.above) return [['Laser threshold', 'below: needs a single-pass gain of \u00d7' + (+L.need.toPrecision(4)) + ' in ' + g.e.name + (L.G.length > 1 ? ' (with the others as they are)' : '')]];
  if (!L.sat) return [['Laser threshold', 'above: the round trip gains ' + ((Math.exp(L.lnNet0) - 1) * 100).toPrecision(3) + '%, so it lases; give its gain a saturation intensity to see the power it settles at']];
  const rows = [['Laser', 'lases at ' + (+L.nm.toPrecision(6)) + ' nm, ' + fmtW(L.P) + ' circulating'],
    ['Saturated gain', L.G.map((q, i) => '\u00d7' + (+L.Gsat[i].toPrecision(4)) + ' a pass in ' + q.e.name + ' (small-signal \u00d7' + (+q.g0.toPrecision(4)) + ', mode ' + fmtLen(q.w) + ')').join('; ')],
    ['Threshold', '\u00d7' + (+L.need.toPrecision(4)) + ' a pass: ' + (+(Math.log(g.g0) / Math.log(L.need)).toPrecision(3)) + '\u00d7 above it']];
  for (const o of L.outs) rows.push(['Output through ' + o.e.name, fmtW(o.P) + ' (T ' + (+(100 * o.T).toPrecision(3)) + '%)']);
  if (L.best) rows.push(['Best output coupler', 'R ' + (+(100 * L.best.R).toPrecision(3)) + '% on ' + L.best.e.name + ' gives ' + fmtW(L.best.P)]);
  return rows;
}
function cavityCard(c) {
  const box = h('div', { class: 'rt-cavity' });
  const head = h('h3', null, c.name + ': ' + (c.kind === 'linear' ? 'linear, ' : 'ring, ') + c.names.join(' \u2192 ') + (c.kind === 'ring' ? ' \u2192 ' + c.names[0] : ''));
  const lockSel = selectField('Laser', [['lock', 'Locked to its strongest resonance'], ['built', 'As built (its own frequency and lengths)']],
    () => (project.cavityLock && project.cavityLock[c.id]) || 'lock',
    v => { project.cavityLock = Object.assign({}, project.cavityLock, { [c.id]: v }); cavSolved.delete(c.id); cavRunCache.delete(lastTrace); }, { wide: true });
  const dl = h('div', { class: 'rt-readout' }), cv = h('canvas', { height: '140', style: 'width:100%;display:block' });
  const pseudo = { id: 'cav:' + c.id };
  const note = h('p', { class: 'note', style: 'margin-top:0.4rem' });
  const modesBox = h('div', { class: 'rt-modes' });
  box.append(head, h('div', { class: 'rt-rows' }, lockSel), dl,
    h('div', { style: 'margin-top:0.4rem' }, plotFrame(cv, () => 'cav-scan', () => plotZoom(pseudo, 'scan'), () => drawCavityScan(cv, c, pseudo))),
    zoomControls(cv, () => plotZoom(pseudo, 'scan'), () => drawCavityScan(cv, c, pseudo), () => true), modesBox, note);
  let sig = '', modesFor = null;
  const refresh = () => {
    let S = cavSolved.get(c.id);
    if (S && S.trace !== lastTrace) S = null;
    const P = S && S.res;
    if (!P) cavityLater();
    const rows = [
      ['Free spectral range', fmtHz(c.fsr)],
      ['Round-trip optical path', fmtLen(c.Lopt)],
      ['Finesse', c.finesse ? String(+c.finesse.toPrecision(4)) : '\u2014'.replace('\u2014', 'n/a')],
      ['Linewidth (FWHM)', c.linewidth ? fmtHz(c.linewidth) : 'n/a'],
      ['Round-trip power kept', c.rho !== null ? (100 * c.rho * c.rho).toPrecision(5) + '%' : 'n/a'],
      ...cavGainRows(c),
      ['Input coupler lets in', c.Tin !== null ? (100 * c.Tin).toPrecision(3) + '%' : 'n/a'],
      ['Build-up on resonance', c.buildup !== null ? String(+c.buildup.toPrecision(4)) + '\u00d7' : 'n/a'],
      ['Stability', c.stability.x === c.stability.y && Math.abs(c.stability.hx - c.stability.hy) < 1e-9 ? c.stability.x + ', m = ' + (+c.stability.hx.toFixed(4))
        : c.stability.turned ? c.stability.x + ' along one axis (m = ' + (+c.stability.hx.toFixed(4)) + '), ' + c.stability.y + ' along the other (m = ' + (+c.stability.hy.toFixed(4)) + '); its axes turned out of the plane'
        : c.stability.x + ' in the plane, ' + c.stability.y + ' out of it'],
    ];
    {
      // one line for a waist the two planes share, two where they differ
      const [pa, pb] = c.mode.waists.some(wv => wv.plane === 'a') ? ['a', 'b'] : ['x', 'y'];
      const wx = c.mode.waists.filter(wv => wv.plane === pa), wy = c.mode.waists.filter(wv => wv.plane === pb);
      const where = wv => wv.at < 1e-6 ? 'on ' + wv.after : fmtLen(wv.at) + ' past ' + wv.after;
      const alike = wx.length === wy.length && wx.every((a, i) => Math.abs(a.w0 - wy[i].w0) < 1e-6 * a.w0 && Math.abs(a.at - wy[i].at) < 1e-6);
      if (alike) for (const wv of wx) rows.push(['Waist', fmtLen(wv.w0) + ', ' + where(wv)]);
      else for (const wv of c.mode.waists) rows.push(['Waist ' + ({ x: 'in the plane', y: 'out of it', a: 'along one axis', b: 'along the other' })[wv.plane], fmtLen(wv.w0) + ', ' + where(wv)]);
    }
    for (const a of c.mode.along) rows.push(['Mode on ' + a.name, fmtLen(a.wx) + (Math.abs(a.wx - a.wy) > 1e-6 * a.wx ? ' \u00d7 ' + fmtLen(a.wy) + (a.Q && Math.abs(Math.sin(2 * a.angle)) > 1e-6 ? ', turned ' + (a.angle / deg).toFixed(1) + '\u00b0' : '') : '')]);
    if (c.gouy.x !== null) rows.push(['Round-trip Gouy phase', (c.gouy.x * 180 / Math.PI).toFixed(2) + '\u00b0' + (c.gouy.y !== null && Math.abs(c.gouy.y - c.gouy.x) > 1e-9 ? ', ' + (c.gouy.y * 180 / Math.PI).toFixed(2) + '\u00b0' : '')]);
    if (c.tms.x !== null) rows.push(['Transverse mode spacing', fmtHz(c.tms.x) + (c.tms.y !== null && Math.abs(c.tms.y - c.tms.x) > 1 ? ', ' + fmtHz(c.tms.y) : '')]);
    if (c.match) rows.push(['Mode matching', (100 * c.match.total).toPrecision(4) + '%']);
    // how far the axis walks, at the first mirror, for a µrad on each mirror's knobs (mm per rad is µm per mrad)
    if (c.sens && c.sens.length && c.stability.x === 'stable' && c.stability.y === 'stable') for (const q of c.sens)
      rows.push([q.name + ' turned, tipped 1 µrad: axis at ' + c.names[0] + ' moves', (q.turn * 1e-3).toPrecision(3) + ', ' + (q.tip * 1e-3).toPrecision(3) + ' µm']);
    if (c.axis && c.axis.miss > 1e-9) {
      // across the beam, and, where a part is tipped out of the plane, up it too
      const up = Math.abs(c.axis.v || 0) > 1e-9 || Math.abs(c.axis.tv || 0) > 1e-12, n = c.segs && c.segs[0] ? c.segs[0].n : 1;
      if (!up) rows.push(['Cavity axis from the input beam', fmtLen(Math.abs(c.axis.h)) + ', ' + (1e3 * Math.abs(c.axis.t)).toPrecision(3) + ' mrad']);
      else {
        const parts = []; if (Math.abs(c.axis.h) > 1e-6) parts.push(fmtLen(Math.abs(c.axis.h)) + ' across'); if (Math.abs(c.axis.v) > 1e-6) parts.push(fmtLen(Math.abs(c.axis.v)) + (c.axis.v >= 0 ? ' up' : ' down'));
        rows.push(['Cavity axis from the input beam', (parts.join(', ') || '0 mm') + ', ' + (1e3 * Math.hypot(c.axis.t, c.axis.tv) / n).toPrecision(3) + ' mrad']);
      }
    }
    if (P) {
      const scale = S.eng === '2d' ? 1 : (() => { const J = c.segs[0].J; return J.reduce((a, v) => a + v * v, 0); })();
      const off = -P.dLock * c.fsr / (2 * Math.PI), src = getEl(c.segs[0].src);
      // every mode of a beam of M^2 above 1, and over the laser's line when it has one
      const all = [S, ...(S.others || [])], line = r => cavLine(r.res, c.Lg || c.Lopt, src);
      const circ0 = all.reduce((a, r) => a + r.res.at(r.delta).P, 0) * scale;
      const circ = all.reduce((a, r) => { const l = line(r); return a + (l ? l.avg(r.delta) : r.res.at(r.delta).P); }, 0) * scale;
      rows.push(['Circulating (\u00d7 the source)', String(+circ.toPrecision(4)) + (S.mode === 'lock' ? ', locked' : ', as built') + (circ !== circ0 ? ', over the laser\u2019s line' : '')]);
      if (circ !== circ0) rows.push(['At the line\u2019s centre', String(+circ0.toPrecision(4))]);
      if (all.length > 1) rows.push(['Beam modes summed (M\u00b2)', String(all.length)]);
      rows.push(['Built up from what gets in', String(+(P.at(S.delta).P / (P.beta * P.beta)).toPrecision(4)) + '\u00d7']);
      rows.push(['As built, off resonance by', fmtHz(Math.abs(off))]);
    } else rows.push(['Steady state', 'working it out\u2026']);
    const s2 = JSON.stringify(rows);
    if (s2 !== sig) { sig = s2; dl.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    drawCavityScan(cv, c, pseudo);
    // its own modes, from the round trip: once per solve
    if (P && modesFor !== P) {
      modesFor = P;
      const ms = cavModes(P, c.fsr, 6);
      modesBox.replaceChildren(h('h4', null, 'Modes of the cavity'));
      if (!ms.length) modesBox.append(h('p', { class: 'note' }, 'None settled yet.'));
      for (const md of ms) {
        const th = h('canvas');
        modesBox.append(h('div', { class: 'rt-mode' }, th, h('div', null,
          h('div', null, md.loss >= 0 ? 'Loses ' + (100 * md.loss).toPrecision(4) + '% a round trip' : 'Gains ' + (-100 * md.loss).toPrecision(4) + '% a round trip, so it lases'),
          h('div', null, md.offset === 0 ? 'The strongest line' : (md.offset > 0 ? '+' : '\u2212') + fmtHz(Math.abs(md.offset)) + ' from it'),
          h('div', { class: 'note' }, 'Takes ' + (100 * md.share).toPrecision(3) + '% of the light let in'))));
        drawModeThumb(th, md.field);
      }
    }
    note.textContent = 'Found from the light\u2019s own path: the run of surfaces that repeats. Its mode is the Gaussian its round trip reproduces, in the bench plane and out of it; the field inside is the sum of every round trip, solved at once, so the screens outside see what a real cavity sends them (the reflected light cancelling on resonance, the transmitted light built up). The plot is the circulating power against the laser\u2019s frequency over one free spectral range: the tall peaks are its fundamental mode, the small ones the higher modes a mismatched or misaligned input also excites. Scroll on it to zoom in on a line. The modes are the cavity\u2019s own, found from its round trip as Fox and Li found them: each with its loss per round trip (mirrors, and whatever its edges cut away) and its frequency from the strongest line, for those the input excites.';
  };
  bindSync(cv, refresh);
  return box;
}
/* A small picture of a mode's intensity across the beam: the round engine's profile turned
   round its axis, or the 2D field itself */
function drawModeThumb(cv, F) {
  const n = 56, dpr = window.devicePixelRatio || 1;
  cv.width = n * dpr; cv.height = n * dpr; cv.style.width = n + 'px'; cv.style.height = n + 'px';
  const g = cv.getContext('2d'), img = g.createImageData(n, n);
  let I = null, half = 1;
  if (F.ax) {
    const st = popStats2(F); half = 2.5 * Math.max(st.wx, st.wy) || F.N / 2 * F.ax.d;
    I = (x, y) => { const a = interp2(F, x, y); let v = a[0] * a[0] + a[1] * a[1]; if (F.re2) { const b = interp2(F, x, y, F.re2, F.im2); v += b[0] * b[0] + b[1] * b[1]; } return v; };
  } else {
    const r = popRadii(qdht(F.re.length), F.R), st = popStats(F); half = 2.5 * st.w || F.R;
    I = (x, y) => { const q = Math.hypot(x, y); if (q >= r[r.length - 1]) return 0; let lo = 0, hi = r.length - 1; if (q <= r[0]) return F.re[0] ** 2 + F.im[0] ** 2; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r[m] <= q) lo = m; else hi = m; } const t = (q - r[lo]) / (r[hi] - r[lo]), re = F.re[lo] + (F.re[hi] - F.re[lo]) * t, im = F.im[lo] + (F.im[hi] - F.im[lo]) * t; return re * re + im * im; };
  }
  const vals = new Float64Array(n * n); let pk = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = I(((i + 0.5) / n * 2 - 1) * half, (1 - (j + 0.5) / n * 2) * half); vals[j * n + i] = v; if (v > pk) pk = v; }
  for (let o = 0; o < n * n; o++) { const [r2, g2, b2] = magma(pk > 0 ? vals[o] / pk : 0); img.data[4 * o] = r2; img.data[4 * o + 1] = g2; img.data[4 * o + 2] = b2; img.data[4 * o + 3] = 255; }
  const off = document.createElement('canvas'); off.width = n; off.height = n; off.getContext('2d').putImageData(img, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, n, n);
}
function drawCavityScan(cv, c, pseudo) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 140;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  cv._full = null; cv._csv = null;
  updateSyncButtons();
  const S0 = cavSolved.get(c.id), S = S0 && S0.trace === lastTrace ? S0 : null, P = S && S.res;
  g.fillStyle = getCss('--jek-ink-soft'); g.font = axisFont();
  if (!P) { g.fillText('working out the steady state…', 4, 14); return; }
  const Z = plotZoom(pseudo, 'scan');
  // across: the laser's detuning over one free spectral range; up: the circulating power, as
  // a share of its peak (a log scale shows the small higher-mode lines)
  const [xa, xb] = zoomRange(Z, 'x', -0.5, 0.5), [ya, yb] = zoomRange(Z, 'y', 0, 1);
  const src0 = getEl(c.segs[0].src), broad = !!(src0 && src0.coh > 0);
  const sx = { kind: 'hz', title: 'detuning' }, sy = { kind: 'plain', title: 'of the peak (dashed: as built, solid: locked' + (broad ? '; faint: the line\u2019s centre alone)' : ')') };
  const A = plotArea(g, w, hgt, [ya, yb], sy);
  cv._area = A; cv._full = { x: [-0.5 * c.fsr, 0.5 * c.fsr], y: [0, 1] };
  const n = Math.max(400, Math.round(A.w * 2));
  // every mode of a beam of M^2 above 1 adds its power; a laser with a line of its own
  // builds up the average over it (solid), the line's centre alone shown faint
  const all = [S, ...(S.others || [])], src = getEl(c.segs[0].src);
  const lines = all.map(r => cavLine(r.res, c.Lg || c.Lopt, src));
  const pk = all.reduce((a, r) => a + r.res.Plock, 0);
  const curve = (fn, style, lw) => {
    g.strokeStyle = style; g.lineWidth = lw; g.beginPath();
    for (let i = 0; i <= n; i++) {
      const f = xa + (xb - xa) * i / n, d = -2 * Math.PI * f, v = fn(d) / pk;
      const X = A.l + (f - xa) / (xb - xa) * A.w, Y = A.t + A.h - (v - ya) / ((yb - ya) || 1) * A.h;
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
  };
  g.save(); g.beginPath(); g.rect(A.l, A.t - 2, A.w + 2, A.h + 4); g.clip();
  const centre = d => all.reduce((a, r) => a + r.res.at(d).P, 0);
  const avgd = d => all.reduce((a, r, k) => a + (lines[k] ? lines[k].avg(d) : r.res.at(d).P), 0);
  plotCsv(cv, 'cavity scan', ['detuning_Hz', 'circulating_of_peak', ...(lines.some(Boolean) ? ['over_the_line'] : [])], () => {
    const r = [];
    for (let i = 0; i <= 1000; i++) { const f = -0.5 + i / 1000, d = -2 * Math.PI * f; r.push([f * c.fsr, centre(d) / pk, ...(lines.some(Boolean) ? [avgd(d) / pk] : [])]); }
    return r;
  });
  if (lines.some(Boolean)) {
    curve(centre, 'rgba(90,180,200,0.35)', 1);
    curve(d => all.reduce((a, r, k) => a + (lines[k] ? lines[k].avg(d) : r.res.at(d).P), 0), getCss('--jek-cyan'), 1.6);
  } else curve(centre, getCss('--jek-cyan'), 1.3);
  // where the laser is as built (0) and where the lock puts it
  const mark = (f, dash) => { const X = A.l + (f - xa) / (xb - xa) * A.w; g.strokeStyle = inkA(0.35); g.setLineDash(dash); g.beginPath(); g.moveTo(X, A.t); g.lineTo(X, A.t + A.h); g.stroke(); g.setLineDash([]); };
  mark(0, [3, 3]);
  let fl = -P.dLock / (2 * Math.PI); fl -= Math.round(fl); mark(fl, []);
  g.restore();
  drawAxes(g, A, [xa * c.fsr, xb * c.fsr], [ya, yb], sx, sy);
  updateSyncButtons();
}

export let benchTab = 'bench';
export function setBenchTab(v) { return (benchTab = v); }
let aboutNode = null;
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 10s3.6 5 10 5 10-5 10-5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 13.2 3.4 15.6M9.2 14.7l-.8 2.7M14.8 14.7l.8 2.7M19 13.2l1.6 2.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
export function renderOverview() {
  const title = h('h2', null, h('span', { style: 'flex:1' }, 'Bench'));
  pinTitle(title, BENCH_PIN, () => { selectOne(null); renderPanel(); requestRender(); });
  panel.append(title);
  // a bench with a cavity gets a Cavity tab, boxed in orange so it is plain there is one
  const cavs = project.elements.length ? findCavities() : [];
  if (!cavs.length) benchTab = 'bench';
  if (cavs.length) {
    const tabs = h('div', { class: 'rt-tabs' });
    for (const [key, label] of [['bench', 'Bench'], ['cavity', cavs.length > 1 ? 'Cavities (' + cavs.length + ')' : 'Cavity']])
      tabs.append(h('button', { class: 'rt-tab' + (key === 'cavity' ? ' cav' : '') + (benchTab === key ? ' on' : ''), type: 'button',
        onclick: () => { benchTab = key; renderPanel(); } }, label));
    panel.append(tabs);
    if (benchTab === 'cavity') { for (const c of cavs) panel.append(cavityCard(c)); return; }
  }
  if (project.elements.length) {
    const list = h('ul', { class: 'rt-list' });
    const col = { source: null, lens: '#73b9ca', cube: '#73b9ca', prism: '#73b9ca', mirror: '#b9c2c9',
      screen: '#ffb347', stop: '#9aa4ab', waveplate: '#73b9ca', polariser: '#b79bff', mask: '#d8b35a',
      grating: '#c9a6ff', crystal: '#b79bff', fibre: '#e86fa6', detector: '#7ee0a1', faraday: '#ff9f6b', isolator: '#ff9f6b',
      filter: '#9aa4ab', gain: '#ff6a3d', cell: '#c79bff', nlc: '#78c8a0', link: '#7fdcff', fcomp: '#e86fa6', elec: '#f2c14e', aom: '#9ad0ff', eom: '#c6a8ff' };
    // this tab's first, then the others', each under its name when there are several
    const multi = project.benches.length > 1;
    for (const b of [curBench(), ...project.benches.filter(b2 => b2 !== curBench())]) {
      const mine = project.elements.filter(e => e.bench === b.id);
      if (multi) list.append(h('li', { class: 'tabhead' }, b.name + (b === curBench() ? ' (on show)' : '')));
      for (const el of mine) {
        // the eye: shown or hidden in the 3D view, for a part drawn there; hidden, the light still meets it
        const eye = V3D.free(el) ? h('button', { type: 'button', class: 'rt-eye' + (el.hide3d ? ' off' : ''), 'aria-pressed': String(!el.hide3d),
          title: el.hide3d ? 'Hidden in the 3D view (the light still meets it): show it' : 'Hide it in the 3D view (the light still meets it)',
          'aria-label': (el.hide3d ? 'Show ' : 'Hide ') + el.name + ' in the 3D view',
          onclick: () => { checkpoint(); if (el.hide3d) delete el.hide3d; else el.hide3d = true; changed(true); } }) : null;
        if (eye) eye.innerHTML = el.hide3d ? EYE_SHUT : EYE_OPEN;
        list.append(h('li', { class: eye ? 'has-eye' : null }, h('button', { onclick: () => selectEl(el) },
          h('span', { class: 'swatch', style: 'background:' + (col[el.type] || (el.type === 'draw' ? (el.stroke !== 'none' ? el.stroke : el.fill !== 'none' ? el.fill : '#9aa4ab') : el.colour)) }),
          el.name, h('span', { class: 't' }, typeLabel(el))), ...(eye ? [eye] : [])));
      }
    }
    panel.append(list);
  } else {
    panel.append(h('p', null, 'The bench is empty. Add a source and a few elements from the toolbar, or import a lens from a .zmx file.'));
  }

  // what the bench is, where it came from, what was assumed: the author's, or an assistant's
  const notes = h('textarea', { class: 'rt-notes', id: 'rtf' + (setFid(fid + 1)), rows: '3', spellcheck: 'true',
    placeholder: 'What this bench is, where it comes from, what was assumed\u2026' });
  notes.value = project.notes || '';
  const fitH = () => { notes.style.height = 'auto'; notes.style.height = Math.min(320, notes.scrollHeight + 2) + 'px'; };
  notes.addEventListener('input', () => { project.notes = notes.value.slice(0, 20000); fitH(); scheduleSave(); });
  requestAnimationFrame(fitH);
  panel.append(h('h3', null, h('label', { for: notes.id }, 'Notes')), notes);

  const limId = 'rtf' + (setFid(fid + 1));
  const lim = numInput(limId, () => project.maxBounces, v => { project.maxBounces = Math.round(clamp(v, 1, 100000)); });
  const floorId = 'rtf' + (setFid(fid + 1));
  const floor = numInput(floorId, () => project.minPower, v => { if (v > 0) project.minPower = clamp(v, 1e-6, 50); });
  panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
    selectField('Snap while dragging', [['0', 'Off'], ['0.1', '0.1 mm'], ['1', '1 mm'], ['5', '5 mm'], ['12.5', '12.5 mm'], ['25', '25 mm (hole pitch)']],
      () => String(project.snap), v => project.snap = +v, { wide: true }),
    h('div', { class: 'rt-f' }, h('label', { for: limId }, 'Interactions per ray'), lim),
    h('div', { class: 'rt-f' }, h('label', { for: floorId }, 'Power floor (%)'), floor),
  ));
  // how the light is shown, for every source on the bench alike
  panel.append(h('h3', null, 'Light'));
  const L = lightOf();
  // each a tick of its own: the rays, the Gaussian beams' envelope, their diffracted field (over it, the envelope marks 1/e\u00b2)
  const tick = (key, text) => {
    const c = h('input', { type: 'checkbox' });
    c.checked = !!L[key];
    c.addEventListener('change', () => { checkpoint(); L[key] = c.checked; changed(false); renderPanel(); });
    return h('label', { class: 'rt-check', style: key === 'rays' ? null : 'margin-top:0.35rem' }, c, text);
  };
  panel.append(tick('rays', 'Show the rays'), tick('envelope', 'Show the Gaussian beams\u2019 envelope'), tick('field', 'Show the diffracted field (slower)'));
  if (L.field) panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' },
    selectField('Field intensity', [['lin', 'Linear'], ['log', 'Logarithmic, 30 dB'], ['log60', 'Logarithmic, 60 dB']], () => L.scale, v => { L.scale = v; }, { wide: true })));
  panel.append(h('p', { style: 'margin-top:0.35rem', class: 'note' }, 'For every source on the bench. With the field and the envelope both on, the envelope is drawn as its 1/e\u00b2 edge over the field. Hiding any of them changes only what is drawn: the light is traced, and measured, all the same (the diffracted field is worked out only while it is shown, or a screen reads it).'));
  const gh = h('input', { type: 'checkbox' });
  gh.checked = project.ghosts;
  gh.addEventListener('change', () => { checkpoint(); project.ghosts = gh.checked; changed(false); });
  panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.5rem' }, gh, 'Follow weak reflections (ghosts), in rays and beams'));
  panel.append(h('p', { style: 'margin-top:0.35rem', class: 'note' }, 'The few percent a bare glass surface reflects. Its loss always counts against the power; with this on, the reflected light is followed too, which is how ghosts and back-reflections show up. Each one is another branch of a Gaussian beam to work out, so with the diffracted field shown it can slow the bench down a lot, a retroreflector\u2019s most of all.'));
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'bench' }));

  panel.append(h('h3', null, 'Using the bench'));
  panel.append(h('ul', { class: 'rt-keys' },
    h('li', null, 'Click an element to edit it; drag it to move and drag the blue handle to rotate. Hold ', h('kbd', null, 'Shift'), ' for free movement or 15° steps.'),
    h('li', null, 'Choose \u223f at the end of any value\u2019s row to give it a range, then drag its slider or press Play.'),
    h('li', null, 'Fibre components (switch the orange Free-space button at the start of Add to Fibre, which turns red) have ports: drag from one port to another to join them with a fibre, click a fibre to set its length and loss, and drag its end off a port to take it away. A selected fibre shows its nodes: drag the fibre to pull one out, drag nodes and handles to shape it, double-click to add or remove one.'),
    h('li', null, 'The tabs at the top left of the bench are benches of their own: + adds one, double-click a tab to rename it. A link plane and its partner on another tab carry light between them.'),
    h('li', null, 'Drag across empty bench to select a boxful; Shift- or Ctrl-click to add to the selection. Right-click for copy, paste, rotate, lock and more.'),
    h('li', null, 'Drag with the middle button, or hold Space and drag, to pan (one finger on a touch screen). Scroll or pinch to zoom; below 50 \u00b5m across, a beam shown as its diffracted field is drawn pixel by pixel, standing waves and all.'),
    h('li', null, 'On a screen\u2019s plots, scroll to zoom about the cursor (Shift: across only, Alt: up and down only), drag to pan and double-click to see the whole plot again; the buttons under each plot zoom one axis at a time. Curves that rise from zero stretch up from their baseline.'),
    h('li', null, 'The pin in a panel\u2019s title keeps it open: what you select next opens beside it, so a screen\u2019s plots stay in view while you change other things. Pin as many as you like; click a pinned panel\u2019s title to select its element.'),
    h('li', null, h('kbd', null, '←↑→↓'), ' nudge, ', h('kbd', null, 'Del'), ' delete, ', h('kbd', null, 'Ctrl'), ' ', h('kbd', null, 'D'), ' duplicate, ', h('kbd', null, 'Ctrl'), ' ', h('kbd', null, 'Z'), ' undo.'),
  ));
  panel.append(h('p', { style: 'margin-top:0.75rem' }, 'Your work is kept in this browser automatically. To move a project to another browser or share it, use Save .jekray and open the file there.'));
  // what it models, and what it does not: the page's own note, moved to the foot of this panel
  aboutNode = aboutNode || document.querySelector('.rt-about');    // kept: a panel rebuilt drops it from the page
  if (aboutNode) panel.append(aboutNode);
  updateReadouts();
}

