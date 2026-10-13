import { MOD_COLOURS } from '../../core/modulators.js';
import { V } from '../../state/project.js';
import { benchNms } from '../../state/elements.js';
import { MASK_PRESETS, compileMaskExpr, frame, maskFns } from '../../core/mask.js';
import { ctx, pathLocal, selInk } from '../render.js';
import { hitThin } from './hits.js';
import { fid, h, panel, param, selectField, setFid } from '../panel.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Mask on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/mask.js */

function drawMask(el, sel) {
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, col = el.mod ? MOD_COLOURS[el.mod.colour || 'grey'] : '#d8b35a';   // a mod's plate in its own colour
  pathLocal(f, [[-1.2 * k, -L], [1.2 * k, -L], [1.2 * k, L], [-1.2 * k, L]], true);
  ctx.fillStyle = col + '29'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : col; ctx.lineWidth = sel ? 2.5 : 1.6; ctx.stroke();
  // its amplitude along it, as a trace beside the plate (a mod's at the bench's wavelength)
  const fn = maskFns(el).fn, n = 64, pts = [], lam = el.mod ? benchNms()[0] * 1e-6 : 633e-6;
  for (let i = 0; i <= n; i++) { const u = -L + 2 * L * i / n; pts.push([-(3 + 6 * Math.min(1, Math.max(0, fn(u, 0, lam)[0]))) * k, u]); }
  pathLocal(f, pts); ctx.strokeStyle = col + 'b3'; ctx.lineWidth = 1; ctx.stroke();
}

function maskPanel(el) {
  panel.append(h('h3', null, 'Mask'));
  const rows = h('div', { class: 'rt-rows' }, param('Aperture (mm)', el, 'length', { wide: true }),
    selectField('Preset', [...MASK_PRESETS.map(p => [p[0], p[1]]), ['custom', 'Custom']], () => el.preset, v => {
      const p = MASK_PRESETS.find(q => q[0] === v);
      el.preset = v;
      if (p) { el.amp = p[2]; el.delay = p[3]; }
    }, { wide: true }));
  const err = h('p', { class: 'note', style: 'color:var(--jek-red, #b3261e)' });
  const text = (label, key) => {
    const id = 'rtf' + (setFid(fid + 1));
    const inp = h('input', { id, type: 'text', spellcheck: 'false', value: el[key], style: 'font-family:var(--jek-mono)' });
    inp.addEventListener('change', () => {
      const v = inp.value.trim() || (key === 'amp' ? '1' : '0');
      try { compileMaskExpr(v); } catch (e) { err.textContent = label + ': ' + e.message + '.'; return; }
      err.textContent = '';
      checkpoint(); el[key] = v; el.preset = 'custom'; changed(true);
    });
    return h('div', { class: 'rt-f wide' }, h('div', { class: 'rt-lab' }, h('label', { for: id }, label)), inp);
  };
  rows.append(text('Amplitude, A(x, y)', 'amp'), text('Delay in waves, D(x, y)', 'delay'));
  panel.append(rows, err);
  const me = maskFns(el);
  if (me.err) err.textContent = me.err;
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'The mask multiplies the field by A\u00b7exp(\u22122\u03c0iD): A is the amplitude transmission (the intensity goes as A\u00b2), and D delays the light by D waves, so a positive D acts like extra glass. x runs along the mask in the bench plane, y out of it, r and theta are their polar form, all in mm from its centre, and lambda is the wavelength in mm. Functions: sin, cos, tan, asin, acos, atan, atan2, exp, log, sqrt, abs, pow, min, max, floor, ceil, round, sign, hypot, mod, step (1 from 0 up), rect (1 within \u00b10.5), circ (1 up to 1), sinc, gauss (exp(\u2212x\u00b2)); ^ is a power, and ?: < > == && || work too.'));
  panel.append(h('p', { style: 'margin-top:0.4rem' }, 'Rays take A and D where they cross, and bend by the slope of D, so a phase lens focuses them and a grating\u2019s slope steers them; the diffracted field takes the full function. A function that is round about the beam keeps it round; anything else makes it a 2D field.'));
}

export const MASK_UI = {
  draw: drawMask, hit: hitThin, panel: maskPanel, rank: 1, noModPanel: true,
};
