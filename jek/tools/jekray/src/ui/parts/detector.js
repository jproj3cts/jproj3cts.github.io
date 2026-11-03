import { DETECTOR_MATERIALS } from '../../core/rf.js';
import { detR } from '../../state/elements.js';
import { frame, toWorld } from '../../core/mask.js';
import { lastTrace } from '../../engines/trace.js';
import { bodyFill, ctx, drawHorn, pathLocal, selInk, sx, sy } from '../render.js';
import { modReadouts } from '../../engines/mods.js';
import { signalSection } from '../instruments.js';
import { h, panel, param, renderPanel, selectField, vs } from '../panel.js';
import { anyPulse, pulseSection, readoutBox } from '../panels.js';
import { modReadoutSection } from '../../io/mods.js';

/* Photodetector on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/detector.js */

function drawDetector(el, sel) {
  if (el.mmw && !el.mmw.part) return drawHorn(el, sel);
  const f = frame(el), L = el.length / 2, H = detR(el), pts = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI / 2 + Math.PI * i / 32; pts.push([H * Math.cos(a), H * Math.sin(a)]); }
  pathLocal(f, pts, true);
  ctx.fillStyle = bodyFill('#2b3338'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#9aa4ab'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  pathLocal(f, [[0, -L], [0, L]]);
  ctx.strokeStyle = '#7ee0a1'; ctx.lineWidth = 3.5; ctx.stroke();
  const hits = lastTrace.screens[el.id] || [];
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const t of hits) { if (t.chief) continue; const [x1, y1] = toWorld(f, 0, t.y); ctx.fillRect(sx(x1) - 1.5, sy(y1) - 1.5, 3, 3); }
}

function detectorPanel(el) {
  // in tabs, as a mirror's or a screen's: the detector and its amplifier; what its signal does (demodulation, a spectrum
  // and a scope); and a pulse, when one reaches the bench
  const tabsOf = [['det', el.diode ? 'Photodiode' : 'Photodetector'], ['signal', 'Signal'], ...(anyPulse() ? [['pulse', 'Pulse']] : [])];
  if (!tabsOf.some(([k]) => k === vs(el).detTab)) vs(el).detTab = 'det';
  panel.append(h('div', { class: 'rt-tabs' }, ...tabsOf.map(([k, l]) => h('button', { class: 'rt-tab' + (vs(el).detTab === k ? ' on' : ''), type: 'button', onclick: () => { vs(el).detTab = k; renderPanel(); } }, l))));
  if (vs(el).detTab === 'signal') { signalSection(el); return; }
  if (vs(el).detTab === 'pulse') { pulseSection(el); return; }
  panel.append(h('h3', null, el.diode ? 'Photodiode' : 'Photodetector'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Material', Object.entries(DETECTOR_MATERIALS).map(([k, v]) => [k, v.name]), () => el.material, v => { el.material = v; }));
  if (el.material === 'custom') rows.append(param('Responsivity (A/W)', el, 'resp', { wide: true }));
  rows.append(param('Diameter (mm)', el, 'length'));
  panel.append(rows);
  if (el.diode) panel.append(h('div', { class: 'rt-rows' }, param('Bandwidth (Hz)', el, 'bandwidth'), param('Dark (nA)', el, 'dark')));   // a bare diode: no amplifier
  else {
    panel.append(h('h3', null, 'Amplifier'));
    panel.append(h('div', { class: 'rt-rows' },
      param('Gain (V/A)', el, 'gain'), param('Bandwidth (Hz)', el, 'bandwidth'),
      param('Dark (nA)', el, 'dark'), param('Noise (pA/√Hz)', el, 'ampNoise'),
      param('Output limit (V)', el, 'vmax', { wide: true })));
  }
  panel.append(readoutBox('detector'));
  if (modReadouts('detector').length) modReadoutSection(el);                     // the mods' readouts
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Integrates the light over the active area: Gaussian beams as fields, so beams of one launch interfere on it and a beam larger than the diode is clipped; ray fans ray by ray. Set each source’s power in its own panel. Noise is shot noise on the photocurrent and dark current, the gain resistor’s Johnson noise and the amplifier’s input current noise, over the noise bandwidth: the bandwidth is a single pole, so white noise counts over π/2 times it.'));
}

const hitDetector = (el, lx, ly, tol) => lx <= tol && Math.hypot(lx, ly) <= detR(el) + tol;   // its semicircle

export const DETECTOR_UI = {
  draw: drawDetector, hit: hitDetector, panel: detectorPanel, rank: 1,
};
