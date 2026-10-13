import { fmtNum } from '../../core/format.js';
import { V } from '../../state/project.js';
import { STOP_SHAPES, frame, stopBlades, stopSlitLike } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { h, panel, param, selectField } from '../panel.js';

/* Stop on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/stop.js */

function drawStop(el, sel) {
  const f = frame(el), blades = stopBlades(el), b = el.outer / 2;
  ctx.strokeStyle = sel ? selInk() : '#9aa4ab';
  ctx.lineWidth = sel ? 5 : 4;
  ctx.lineCap = 'butt';
  for (const [lo, hi] of blades) { pathLocal(f, [[0, lo], [0, hi]]); ctx.stroke(); }
  // a tick at each blade edge inside the plate: the opening between them is open
  ctx.strokeStyle = 'rgba(154,164,171,0.6)'; ctx.lineWidth = 1;
  const k = 4 / V().scale;
  for (const [lo, hi] of blades) for (const e of [lo, hi]) if (Math.abs(Math.abs(e) - b) > 1e-6) {
    pathLocal(f, [[-k, e], [k, e]]); ctx.stroke();
  }
}

function stopPanel(el) {
  panel.append(h('h3', null, 'Stop'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Shape', STOP_SHAPES, () => el.shape, v => {
      el.shape = v;
      // slits that would overlap their neighbours get a width that leaves them apart
      if (v === 'double' && el.aperture >= el.sep) el.aperture = +(el.sep / 4).toPrecision(3);
      if (v === 'comb' && el.aperture >= el.pitch) el.aperture = +(el.pitch / 2).toPrecision(3);
    }, { wide: true }));
  const s = el.shape;
  if (s !== 'knife') rows.append(param(s === 'disc' ? 'Block diameter (mm)' : stopSlitLike(el) ? 'Slit width (mm)' : 'Clear aperture (mm)', el, 'aperture'));
  if (s === 'double') rows.append(param('Separation (mm)', el, 'sep'));
  if (s === 'comb') rows.append(param('Pitch (mm)', el, 'pitch'), param('Number of slits', el, 'count'));
  rows.append(param(s === 'knife' ? 'Edge position (mm)' : 'Offset (mm)', el, 'offset'));
  if (stopSlitLike(el)) rows.append(param('Height (mm)', el, 'height', { blank: 0, placeholder: 'unlimited', fmt: v => v ? fmtNum(v) : '' }));
  if (s === 'knife') rows.append(selectField('Covers', [['1', 'The side above the edge'], ['-1', 'The side below the edge']],
    () => String(el.side), v => { el.side = +v; }));
  rows.append(param('Outer size (mm)', el, 'outer'));
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An opaque plate of the outer size. Rays through an opening carry on untouched; anything striking a blade stops there. The offset moves the opening (or the pair of slits, the comb, the edge or the block) along the stop. A double slit\u2019s separation and a comb\u2019s pitch run centre to centre; a slit\u2019s height is its length out of the bench plane, blank for unlimited. Out of the bench plane an iris and a block are circles and slits run to their height, which matters to the diffracted field: the beam\u2019s reference ray passes through the blades, so the stop acts as a mask on the field wherever it sits across the beam. Sweep the width to watch a system vignette, or the separation to walk Young\u2019s fringes.'));
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'stop' }));
}

const hitStop = (el, lx, ly, tol) => Math.abs(lx) <= tol + 0.2 && Math.abs(ly) <= el.outer / 2 + tol;

export const STOP_UI = {
  draw: drawStop, hit: hitStop, panel: stopPanel, rank: 1,
};
