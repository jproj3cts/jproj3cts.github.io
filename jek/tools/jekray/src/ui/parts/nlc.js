import { fmtW } from '../../core/format.js';
import { NLC } from '../../core/nlc.js';
import { getEl } from '../../state/elements.js';
import { frame, toWorld } from '../../core/mask.js';
import { lastTrace } from '../../engines/trace.js';
import { ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { helpLine, bindSync, h, panel, param, selectField } from '../panel.js';
import { drawNlcTuning } from '../panels.js';
import { plotSaveRow } from '../plots.js';

/* Nonlinear crystal on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/nlc.js */

function drawNlc(el, sel) {
  const f = frame(el), L = el.length / 2, H = el.nlLen / 2;
  pathLocal(f, [[-H, -L], [H, -L], [H, L], [-H, L]], true);
  ctx.fillStyle = 'rgba(120,200,160,0.16)'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#78c8a0'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  // the poling: a few stripes across
  const n = Math.max(3, Math.min(24, Math.round(el.nlLen / 2)));
  ctx.beginPath();
  for (let i = 1; i < n; i++) { const x = -H + 2 * H * i / n, [ax, ay] = toWorld(f, x, -L), [bx, by] = toWorld(f, x, L); ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
  ctx.strokeStyle = 'rgba(120,200,160,0.35)'; ctx.lineWidth = 1; ctx.stroke();
}

/* A vapour cell's panel: what it holds and how hot, and its spectrum against the laser */
export function nlcPanel(el) {
  panel.append(h('h3', null, 'Nonlinear crystal'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Crystal', Object.entries(NLC).map(([k, v]) => [k, v.name + ' (d_eff ' + (v.d * 1e12) + ' pm/V)']), () => el.material, v => { el.material = v; }, { wide: true }),
    param('Length (mm)', el, 'nlLen'), param('Aperture (mm)', el, 'length'),
    param('Poling period (µm)', el, 'period'), param('Temperature (°C)', el, 'temp'),
    selectField('Its z axis', [['s', 'Out of the bench plane: s light converts'], ['p', 'In the plane: p light converts']], () => el.axis, v => { el.axis = v; }, { wide: true }),
    selectField('End faces', [['ar', 'Anti-reflection coated (0.1%)'], ['bare', 'Bare']], () => el.faces, v => { el.faces = v; }, { wide: true })));
  const box = h('div', { class: 'rt-readout' }), cv = h('canvas', { height: '150', style: 'width:100%;display:block' });
  panel.append(box, h('div', { style: 'margin-top:0.5rem' }, cv), plotSaveRow(cv));
  let sig = '';
  bindSync(box, () => {
    const hits = ((lastTrace.nlc) || []).filter(H => H.id === el.id), rows = [];
    for (const H of hits.slice(0, 4)) {
      const r = H.r, S = getEl(H.src);
      rows.push([(S ? S.name : 'Beam') + ', ' + (+H.nm.toPrecision(6)) + ' nm', fmtW(H.P) + ' along the crystal’s axis → ' + fmtW(r.P2) + ' at ' + (+(H.nm / 2).toPrecision(6)) + ' nm (' + (+(100 * r.conv).toPrecision(3)) + '% converted); ' + (+(r.eta * 100).toPrecision(3)) + ' %/W small-signal']);
      rows.push(['Phase matching', (el.period > 0 ? 'period ' + el.period + ' µm' : 'period ' + (+r.period.toPrecision(5)) + ' µm, the best for this beam') + ' (' + (+r.periodPW.toPrecision(5)) + ' µm for a plane wave at ' + el.temp + ' °C); n = ' + r.n1.toFixed(4) + ', ' + r.n2.toFixed(4)]);
      rows.push(['Focusing', 'ξ = L/b = ' + (+r.xi.toPrecision(3)) + ' (best 2.84), h = ' + (+r.h.toPrecision(3)) + ' of Boyd and Kleinman’s 1.068' + (Math.abs(r.mu) > 0.2 ? '; the waist sits ' + (+(r.mu * 50).toPrecision(2)) + '% of the length from the middle' : '')]);
    }
    if (!hits.length) rows.push(['', 'No Gaussian beam crosses it. Send a laser through it (a source with “Propagate a Gaussian beam”) focused near its middle.']);
    const s2 = JSON.stringify(rows);
    if (s2 !== sig) { sig = s2; box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    drawNlcTuning(cv, el, hits);
  });
  panel.append(helpLine('Second-harmonic generation in a poled crystal, by Boyd and Kleinman’s theory.', ['Second-harmonic generation in a periodically poled crystal (quasi-phase-matched, type 0: light polarised along the crystal’s z axis makes a harmonic polarised the same way). The harmonic of a Gaussian beam is Boyd and Kleinman’s: it depends on how tightly the beam is focused inside (best when the crystal is 2.84 confocal parameters long) and on how well the poling period cancels the mismatch between the two wavelengths’ indices, which the temperature tunes. The fundamental is used up as P₂ = P₁ tanh²(√(ηP₁)). The harmonic leaves as a beam of its own, with the fundamental’s confocal parameter and waist position. The indices are MgO:LiNbO₃’s (Gayer et al. 2008) and KTP’s (Kato and Takaoka 2002, Emanueli and Arie 2003). The crystal is a block of its own index (along its z axis) with anti-reflection coated faces (0.1%, or bare): it moves a focus inside it by L(1 − 1/n), so focus the beam for its middle inside the glass; the harmonic leaves through the exit face. Left out: absorption and heating, walk-off, the index the other polarisation sees, a laser’s linewidth and a pulse’s peak power (a pulsed laser is taken at its average power). The plot shows the harmonic against the crystal’s temperature, the period held.'], 'note', 'margin-top:0.5rem'));
}

const hitNlc = (el, lx, ly, tol) => Math.abs(lx) <= el.nlLen / 2 + tol && Math.abs(ly) <= el.length / 2 + tol;

export const NLC_UI = {
  draw: drawNlc, hit: hitNlc, panel: nlcPanel, rank: 2,
};
