import { ctx, drawPlate, pathLocal } from '../render.js';
import { hitSlab } from './hits.js';
import { h, panel, param, selectField } from '../panel.js';
import { readoutBox } from '../panels.js';

/* Acousto-optic modulator on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/aom.js */

/* a modulator's crystal, half its thickness along the beam (mm), as its 3D model has it: an AOM's 8 mm, an EOM's 12 */
export const modHalf = el => el.type === 'aom' ? 4 : 6;
/* a modulator: a crystal block; an AOM's transducer along one side with its sound waves, an EOM's electrodes above and below */
export function drawModulator(el, sel) {
  const aom = el.type === 'aom', { f, L } = drawPlate(el, sel, aom ? '#9ad0ff' : '#c6a8ff', aom ? 'rgba(154,208,255,0.16)' : 'rgba(198,168,255,0.16)', modHalf(el));
  const t = modHalf(el);
  ctx.save();
  if (aom) {
    pathLocal(f, [[-3, L], [3, L], [3, L + 3], [-3, L + 3]], true); ctx.fillStyle = '#9ad0ff'; ctx.fill();
    ctx.strokeStyle = 'rgba(154,208,255,0.45)'; ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const y = L - i * 2 * L / 5; pathLocal(f, [[-t, y], [t, y]]); ctx.stroke(); }
  } else {
    for (const y of [L, -L]) { pathLocal(f, [[-t, y], [t, y]]); ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 3; ctx.stroke(); }
  }
  ctx.restore();
}

export function modulatorPanel(el) {
  if (el.type === 'aom') {
    panel.append(h('h3', null, 'Acousto-optic modulator'));
    panel.append(h('div', { class: 'rt-rows' },
      param('Drive (MHz)', el, 'rf'), param('Sound speed (m/s)', el, 'v'),
      param('Diffraction efficiency (%)', el, 'eff'),
      selectField('Order', [['1', '+1 (shifted up)'], ['-1', '\u22121 (shifted down)']], () => String(el.order), v => { el.order = +v; }),
      param('Aperture (mm)', el, 'length', { wide: true })));
    panel.append(readoutBox('aom'));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A Bragg cell: sound at the drive frequency makes a moving grating of period v / f in the crystal. The chosen order takes its share of the light, turned by \u03bbf/v and shifted in frequency by the drive; the rest goes straight through, unshifted. Tellurium dioxide carries sound at about 4200 m/s, fused silica 5960 m/s. Shifted light makes no steady fringes with the rest; on a photodiode it beats at the drive frequency.'));
  } else {
    panel.append(h('h3', null, 'Electro-optic modulator'));
    const rows = h('div', { class: 'rt-rows' },
      selectField('Modulates', [['phase', 'Phase (sidebands J\u2099(\u03b2))'], ['amplitude', 'Amplitude (Mach\u2013Zehnder)']], () => el.emode, v => { el.emode = v; }, { wide: true }),
      param('Drive (MHz)', el, 'fm'), param('Depth \u03b2 (rad)', el, 'beta'));
    if (el.emode === 'amplitude') rows.append(param('Bias (\u00b0)', el, 'bias'));
    rows.append(param('Insertion loss (dB)', el, 'loss'), param('Aperture (mm)', el, 'length'));
    panel.append(rows);
    panel.append(readoutBox('eom'));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each sideband leaves as a branch of its own, n f\u2098 from the light that came in, with its share of the field. Phase modulation at \u03b2 = 1.434 puts equal power in the carrier and each first sideband; at 2.405 the carrier is gone. With a cavity after it and a photodiode on the reflection, demodulated at the drive frequency, it is a Pound\u2013Drever\u2013Hall lock.'));
  }
}

export const AOM_UI = {
  draw: drawModulator, hit: hitSlab(modHalf), panel: modulatorPanel, rank: 1,
};
