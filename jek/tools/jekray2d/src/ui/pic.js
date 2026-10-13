import { clamp } from '../core/constants.js';
import { fmtHz, fmtLen, fmtMw } from '../core/format.js';
import { V, deg } from '../state/project.js';
import { FIBRE_COLOUR, getEl } from '../state/elements.js';
import { frame, toWorld } from '../core/mask.js';
import { lastTrace } from '../engines/trace.js';
import { bodyFill, ctx, getCss, portFill, portsInUse, removeFibre, selInk, sx, sy } from './render.js';
import { netPower, pkey, portWorld } from '../engines/fibre.js';
import {
  C_NM, LAM0, PIC_DARK, PIC_GREEN, PIC_KINDS, PIC_WG, PMAP, PSYM, PVAL, chipOf, coarseToFine, laserNms,
  linesGen, picPortList, portLabel, ringLine, samplesFor, spectrum
} from '../engines/pic.js';
import { signalSection } from './instruments.js';
import { bindSync, fid, h, numInput, panel, param, selectField, setFid, vs } from './panel.js';
import { portRows, readoutBox } from './panels.js';
import { drawAxes, plotArea, plotCsv, plotSaveRow } from './plots.js';

/* ==========================================================================
   Photonic circuits on the page: the parts' symbols, their panels and spectra. The chips and
   their scattering: engines/pic.js.
   ========================================================================== */

// a drawing context in sheet units, for one part
function sheet(c, M) {
  const [kx, ky, ox, oy] = M, U = x => (x - ox) * kx, W = y => (y - oy) * ky;
  return {
    line(P) { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(U(x), W(y)) : c.moveTo(U(x), W(y))); c.stroke(); },
    path(P) { c.beginPath(); for (const [op, ...a] of P) { if (op === 'M') c.moveTo(U(a[0]), W(a[1])); else if (op === 'L') c.lineTo(U(a[0]), W(a[1])); else c.bezierCurveTo(U(a[0]), W(a[1]), U(a[2]), W(a[3]), U(a[4]), W(a[5])); } c.stroke(); },
    poly(P) { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(U(x), W(y)) : c.moveTo(U(x), W(y))); c.closePath(); c.fillStyle = bodyFill(PIC_DARK); c.fill(); c.stroke(); },
    rect(x, y, w, h) { c.beginPath(); c.rect(U(x), W(y), w * kx, h * ky); c.fillStyle = bodyFill(PIC_DARK); c.fill(); c.stroke(); },
    fillRect(x, y, w, h, col) { c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(U(x), W(y), w * kx, h * ky); c.globalAlpha = 1; },
    circle(x, y, r) { c.beginPath(); c.ellipse(U(x), W(y), r * kx, r * ky, 0, 0, 2 * Math.PI); c.stroke(); },
    arc(x, y, r, a0, a1) { c.beginPath(); c.ellipse(U(x), W(y), r * kx, r * ky, 0, a0, a1); c.stroke(); },
    dash(col, P) { const st = c.strokeStyle; c.strokeStyle = col; c.setLineDash([3 * kx, 3 * kx]); this.line(P); c.setLineDash([]); c.strokeStyle = st; },
    at: (x, y) => [U(x), W(y)],
  };
}
function picDraw(el, sel) {
  const s = V().scale, c = ctx, ports = picPortList(el), names = PIC_KINDS[el.kind].names, M = PMAP[el.kind];
  c.save(); c.translate(sx(el.x), sy(el.y)); c.rotate(-el.angle * deg); c.scale(s, s);
  c.strokeStyle = sel ? selInk() : PIC_GREEN; c.lineWidth = (sel ? 2.2 : 1.5) / s; c.lineJoin = 'round'; c.lineCap = 'round';
  PSYM[el.kind](sheet(c, M));
  c.restore();
  if (PVAL[el.kind] && s > 2.5) {
    const [t, x0, y0] = PVAL[el.kind](el), [u, v] = sheet(null, M).at(x0, y0), [x, y] = toWorld(frame(el), u, -v);
    c.save(); c.font = clamp(1.6 * s, 8, 11) + 'px ' + getCss('--jek-mono'); c.fillStyle = '#bfe8cc'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, sx(x), sy(y)); c.restore();
  }
  const used = portsInUse(), r = clamp(1.1 * s, 3, 6);
  ports.forEach((P, i) => {
    const Q = portWorld(el, i), X = sx(Q.x), Y = sy(Q.y), on = used.has(pkey(el.id, i)), col = P.chip ? PIC_GREEN : FIBRE_COLOUR;
    c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI);
    c.fillStyle = on ? col : portFill(); c.fill(); c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
    if (ports.length > 1 && s > 3) {
      c.save(); c.fillStyle = '#bfe8cc'; c.font = '9px ' + getCss('--jek-mono'); c.textAlign = Q.dx > 0 ? 'left' : 'right'; c.textBaseline = 'bottom';
      c.fillText(names[i], X + Q.dx * (r + 3), Y - 3); c.restore();
    }
  });
}
/* ---------- panels ---------- */
const wgSelect = (get, set) => selectField('Waveguide', Object.entries(PIC_WG).map(([k, v]) => [k, v.name]), get, set, { wide: true });
function picPanelFor(el) {
  const K = PIC_KINDS[el.kind];
  panel.append(h('h3', null, K.label, h('span', { class: 'rt-exp' }, 'Experimental')));
  const rows = h('div', { class: 'rt-rows' });
  if (K.wg) rows.append(wgSelect(() => el.wg, v => { el.wg = v; if (v !== 'custom') Object.assign(el, { neff: PIC_WG[v].neff, ng: PIC_WG[v].ng, loss: PIC_WG[v].loss }); }));
  for (const [k, label] of K.params) rows.append(param(label, el, k));
  panel.append(rows);
  panel.append(readoutBox('pic'));
  if (el.kind === 'pd') signalSection(el);
  spectrumSection(el);
  const notes = {
    gc: 'Couples the chip’s TE mode to a fibre above it: join a fibre to its yellow port. It takes the fibre’s light polarised at its angle (from s) and loses the rest, as a real one does, with a Gaussian band about its centre wavelength. No back-reflection.',
    dc: 'Two waveguides close enough to couple: 1 goes to 3 and, across, to 4; 2 to 4 and, across, to 3. The light crossing over leads by a quarter wave, so two equal arms recombine into one port.',
    mmi12: 'Splits the light equally into its two outputs, in phase; run backwards, it adds the two, sending what is out of phase off the chip. It stands for a Y-branch too.',
    mmi22: 'A 50:50 coupler made as a multimode section: as a directional coupler at 50%, with its own excess loss.',
    ring: 'A ring beside one bus waveguide: dips in its through port at every resonance, as deep as the coupling matches the ring’s loss (critical coupling).',
    ringad: 'A ring between two bus waveguides: at resonance the light goes to the drop port; off it, straight through. Light put in at the add port goes to the drop port off resonance and to the through port on it.',
    ps: 'A section of waveguide with a phase you set (a heater or an electro-optic section): give the phase a sweep to tune a Mach–Zehnder or a ring, or wire a signal to its drive input (π of phase per Vπ volts on top of the phase set).',
    pd: 'Absorbs what reaches it and reads it as the fibre photodiodes do: DC, beat notes, the mixer. Its out port carries what it reads to the electronics.',
  };
  panel.append(h('p', { style: 'margin-top:0.6rem' }, notes[el.kind]));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.35rem' }, 'Photonic circuits are experimental: TE only, near 1550 nm, each part a compact model, checked on the validation page against closed forms and SAX. Its settings are numbers, not a drawn layout: sizes on the bench are only a schematic.'));
}
/* the chip's spectrum between two of its ports, and the lines in it */
function spectrumSection(el) {
  const c = chipOf(el);
  panel.append(h('h3', null, 'Spectrum'));
  if (!c || !c.ext.length) { panel.append(h('p', null, 'Nothing to put light in by: leave a port open or add a grating coupler.')); return; }
  // the grating couplers' fibre sides and the photodiodes first, then the chip ports left open
  const V2 = vs(el), P = g => c.ports.find(q => q.g === g), isGc = g => P(g).el.kind === 'gc';
  const froms = [...c.ext.filter(isGc), ...c.ext.filter(g => !isGc(g))], outs = [...c.obs, ...froms];
  const pick = (k, list, dflt) => { if (!list.includes(V2[k])) V2[k] = dflt; };
  pick('picFrom', froms, froms[0]);
  // to this photodiode, or the first photodiode, or another coupler, or whatever else there is
  const mine = c.obs.find(g => P(g).el.id === el.id);
  pick('picTo', outs, mine ?? c.obs[0] ?? froms.find(g => g !== V2.picFrom && isGc(g)) ?? outs.find(g => g !== V2.picFrom) ?? outs[0]);
  if (!(V2.picC > 0)) V2.picC = 1550;
  if (!(V2.picSpan > 0)) V2.picSpan = 20;
  const opts = list => list.map(g => [String(g), portLabel(c, g)]);
  const rows = h('div', { class: 'rt-rows' },
    selectField('From', opts(froms), () => String(V2.picFrom), v => { V2.picFrom = +v; }),
    selectField('To', opts(outs), () => String(V2.picTo), v => { V2.picTo = +v; }));
  const numF = (label, key, lo) => { const id = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f' }, h('label', { for: id }, label), numInput(id, () => V2[key], v => { if (v > lo) V2[key] = v; })); };
  rows.append(numF('Centre (nm)', 'picC', 0), numF('Span (nm)', 'picSpan', 0));
  const cv = h('canvas', { height: '160', style: 'width:100%;display:block;margin-top:0.4rem' });
  const box = h('div', { class: 'rt-readout' });
  panel.append(rows, cv, plotSaveRow(cv), box);
  // Worked out a little at a time, so the page stays live and a large chip shows something at
  // once: about a hundred points across the span first, drawn as soon as they are in; then the
  // points between them, the step halving each pass, redrawn as they come; then the lines. A
  // change (or the panel closing) drops whatever is still to do.
  let last = '', job = 0;
  const dl = (a, b) => h('dl', null, ...[[a, b]].flatMap(([x, y]) => [h('dt', null, x), h('dd', null, y)]));
  bindSync(cv, () => {
    const cc = chipOf(el);
    if (!cc) return;
    const key = cc.key + '|' + V2.picFrom + '|' + V2.picTo + '|' + V2.picC + '|' + V2.picSpan + '|' + (cv.clientWidth || 0) + '|' + laserNms(cc).join();
    if (key === last) return;
    last = key;
    const my = ++job, from = V2.picFrom, to = V2.picTo, C0 = V2.picC, marks = laserNms(cc), title = portLabel(cc, from) + ' → ' + portLabel(cc, to);
    const n = samplesFor(cc, V2.picSpan), lams = Array.from({ length: n }, (_, i) => C0 + (i / (n - 1) - 0.5) * V2.picSpan);
    const T = new Float64Array(n).fill(NaN), order = coarseToFine(n, 100), first = order.first;
    const live = () => my === job && cv.isConnected, f = lam => spectrum(cc, from, to, [lam])[0];
    const show = () => { const I = []; for (let i = 0; i < n; i++) if (T[i] === T[i]) I.push(i); picDrawSpectrum(cv, I.map(i => lams[i]), I.map(i => T[i]), marks, title); };
    let k = 0, drawn = 0;
    const sweep = () => {
      if (!live()) return;
      const t0 = performance.now();
      while (k < order.length && performance.now() - t0 < 12) { const i = order[k++]; T[i] = f(lams[i]); }
      const now = performance.now();
      if (k === order.length || (k >= first && (!drawn || now - drawn > 150))) { show(); drawn = now; }
      if (k < order.length) { if (k >= first) box.replaceChildren(dl('Refining', Math.round(100 * k / order.length) + '% of ' + n.toLocaleString() + ' points')); setTimeout(sweep, 0); return; }
      box.replaceChildren(dl('Lines', 'finding…'));
      const g = linesGen(lams, T);
      let r = g.next();
      const refine = () => {
        if (!live()) return;
        const t1 = performance.now();
        while (!r.done && performance.now() - t1 < 12) r = g.next(f(r.value));
        if (!r.done) { setTimeout(refine, 0); return; }
        const L = r.value, rows = [], nmT = v => (+v.toFixed(3)) + ' nm';
        L.list.slice(0, 8).forEach(q => rows.push([nmT(q.at), (q.er >= 0 ? '+' : '') + q.er.toFixed(2) + ' dB' + (q.fwhm ? ', FWHM ' + (q.fwhm < 0.1 ? (+(q.fwhm * 1e3).toPrecision(3)) + ' pm' : (+q.fwhm.toPrecision(3)) + ' nm') + ', Q ' + (+q.Q.toPrecision(3)).toLocaleString() : '')]));
        if (L.list.length > 8) rows.push(['', (L.list.length - 8) + ' more']);
        if (L.fsr) rows.push(['Spacing (FSR)', (+L.fsr.toPrecision(4)) + ' nm (' + fmtHz(C_NM * L.fsr / (C0 * C0)) + ')']);
        if (!L.list.length) rows.push(['Lines', 'none deeper than 0.3 dB in this span']);
        else rows.unshift([L.dips ? 'Dips' : 'Peaks', 'each against the level either side of it']);
        box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
      };
      refine();
    };
    box.replaceChildren(dl('Spectrum', 'working…'));
    sweep();
  });
}
function picDrawSpectrum(cv, lams, T, marks, title) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 160;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  const dB = T.map(v => 10 * Math.log10(Math.max(v, 1e-12)));
  plotCsv(cv, 'chip spectrum ' + title, ['wavelength_nm', 'transmission', 'transmission_dB'], () => lams.map((l, i) => [l, T[i], dB[i]]));
  let lo = Math.max(-60, Math.min(...dB)), hi = Math.max(...dB);
  if (!(hi - lo > 0.5)) { lo -= 0.5; hi += 0.5; }
  const pad = 0.08 * (hi - lo); lo -= pad; hi += pad;
  const sx2 = { kind: 'plain', title: 'wavelength, nm' }, sy2 = { kind: 'plain', title: 'dB' };
  const A = plotArea(g, w, hgt, [lo, hi], sy2);
  const X = l => A.l + (l - lams[0]) / (lams[lams.length - 1] - lams[0]) * A.w, Y = v => A.t + A.h - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * A.h;
  g.strokeStyle = PIC_GREEN; g.lineWidth = 1.4; g.beginPath();
  // each pixel column from its lowest to its highest sample, so a line narrower than a pixel still shows
  let col = -1, mn = 0, mx = 0, first = true;
  const flush = () => { if (col < 0) return; const x = A.l + col + 0.5; if (first) { g.moveTo(x, Y(mx)); first = false; } else g.lineTo(x, Y(mx)); g.lineTo(x, Y(mn)); };
  dB.forEach((v, i) => { const c2 = Math.floor(X(lams[i]) - A.l); if (c2 !== col) { flush(); col = c2; mn = mx = v; } else { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
  flush();
  g.stroke();
  // where the lasers reaching it are
  g.strokeStyle = 'rgba(219,53,80,0.7)'; g.setLineDash([3, 3]);
  for (const m of marks) if (m >= lams[0] && m <= lams[lams.length - 1]) { g.beginPath(); g.moveTo(X(m), A.t); g.lineTo(X(m), A.t + A.h); g.stroke(); }
  g.setLineDash([]);
  drawAxes(g, A, [lams[0], lams[lams.length - 1]], [lo, hi], sx2, sy2);
}
/* the readout rows under the settings */
function picReadout(el) {
  const rows = portRows(el), K = PIC_KINDS[el.kind];
  if (el.kind === 'pd') {
    const net = lastTrace.net, mw = net ? netPower(net.pd.get(el.id), net.keys) : 0, mA = mw * el.resp, Vo = mA * 1e-3 * el.gain;
    rows.unshift(['Optical power', fmtMw(mw)], ['Photocurrent', (+mA.toPrecision(4)) + ' mA'], ...(el.diode ? [] : [['Output', (+Math.min(Vo, el.vmax).toPrecision(4)) + ' V' + (Vo > el.vmax ? ', at its limit' : '')]]));
  }
  if (el.kind === 'ring' || el.kind === 'ringad') {
    const { L, fsr, a, t1, F, fw } = ringLine(el);
    rows.unshift(['Free spectral range', (+fsr.toPrecision(4)) + ' nm at 1550 nm (' + fmtHz(C_NM * fsr / (LAM0 * LAM0)) + ')'],
      ['Round trip', fmtLen(L * 1e-3) + ', loss ' + (+(-20 * Math.log10(a)).toPrecision(3)) + ' dB'],
      ['Finesse, loaded', (+F.toPrecision(3)) + ': lines ' + (fw < 0.1 ? (+(fw * 1e3).toPrecision(3)) + ' pm' : (+fw.toPrecision(3)) + ' nm') + ' wide, Q ' + (+(LAM0 / fw).toPrecision(3)).toLocaleString()]);
    if (el.kind === 'ring') rows.push(['Coupling', Math.abs(t1 - a) < 0.002 * a ? 'critical: the dips go to zero' : t1 > a ? 'under-coupled' : 'over-coupled']);
  }
  if (el.kind === 'gc') {
    const nms = (() => { const c = chipOf(el); return c ? laserNms(c) : []; })();
    for (const nm of nms.slice(0, 3)) rows.push(['Coupling at ' + nm + ' nm', (+(el.peak - ((nm - el.centre) / (el.bw / 2)) ** 2).toFixed(2)) + ' dB']);
  }
  return [rows, K.sink ? 'Power from the fibre network, through the chip, at each laser’s wavelength.' : 'Ports and what they join; powers where the fibre network reaches them.'];
}
/* a waveguide, selected: its settings and what it does */
function picWgPanel(F) {
  const A = getEl(F.a[0]), B = getEl(F.b[0]), w = F.wg;
  panel.append(h('h2', null, h('span', null, 'Waveguide'), h('span', { class: 'kind' }, (A ? A.name : '?') + ' → ' + (B ? B.name : '?'))));
  const fnum = (label, key, set) => { const id = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f' }, h('label', { for: id }, label), numInput(id, () => w[key], v => set(v))); };
  panel.append(h('div', { class: 'rt-rows' },
    wgSelect(() => w.preset, v => { w.preset = v; if (v !== 'custom') Object.assign(w, { neff: PIC_WG[v].neff, ng: PIC_WG[v].ng, loss: PIC_WG[v].loss }); }),
    fnum('Length (µm)', 'len', v => { w.len = Math.max(0, v); }),
    fnum('Loss (dB/cm)', 'loss', v => { w.loss = Math.max(0, v); w.preset = 'custom'; }),
    fnum('Effective index', 'neff', v => { w.neff = Math.max(1, v); w.preset = 'custom'; }),
    fnum('Group index', 'ng', v => { w.ng = Math.max(1, v); w.preset = 'custom'; })));
  const out = h('div', { class: 'rt-readout' });
  panel.append(out);
  bindSync(out, () => {
    const ph = 2 * Math.PI * w.neff * w.len * 1e3 / LAM0;
    const rows = [['Phase at 1550 nm', (+(ph / (2 * Math.PI)).toPrecision(6)) + ' waves'], ['Delay', (+(w.ng * w.len * 1e-6 / 0.299792458 * 1e3).toPrecision(4)) + ' ps'],
      ['Loss', (+(w.loss * w.len * 1e-4).toPrecision(3)) + ' dB']];
    out.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Its length is this number, not the length drawn (a layout view, later, could measure it from the path). The index changes with wavelength through the group index: n(λ) = nₑ − (n_g − nₑ)(λ − 1550 nm)/1550 nm. Drag either end off its port to take it away.'));
  panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, h('button', { class: 'rt-btn danger wide', type: 'button', onclick: () => removeFibre(F) }, 'Delete waveguide')));
}

export const PIC_UI = {
  draw: picDraw,
  panelFor: picPanelFor,
  wgPanel: picWgPanel,
  readout: picReadout,
};
