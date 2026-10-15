import { MOD_COLOURS } from '../../core/modulators.js';
import { V } from '../../state/project.js';
import { benchNms } from '../../state/elements.js';
import { MASK_PRESETS, compileMaskExpr, frame, maskFns } from '../../core/mask.js';
import { ctx, lightLayer, pathLocal, selInk } from '../render.js';
import { GRIN_PROFILES, grinDesign } from '../../core/grin.js';
import { PRINTER, RF_MAT } from '../../core/rf.js';
import { hitThin } from './hits.js';
import { fid, h, panel, param, selectField, setFid } from '../panel.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Mask on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/mask.js */

function drawMask(el, sel) {
  if (el.grin) return drawGrin(el, sel);
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, col = el.mod ? MOD_COLOURS[el.mod.colour || 'grey'] : '#d8b35a';   // a mod's plate in its own colour
  pathLocal(f, [[-1.2 * k, -L], [1.2 * k, -L], [1.2 * k, L], [-1.2 * k, L]], true);
  ctx.fillStyle = col + '29'; ctx.fill();
  ctx.strokeStyle = sel ? selInk() : col; ctx.lineWidth = sel ? 2.5 : 1.6; ctx.stroke();
  // its amplitude along it, as a trace beside the plate (a mod's at the bench's wavelength)
  const fn = maskFns(el).fn, n = 64, pts = [], lam = el.mod ? benchNms()[0] * 1e-6 : 633e-6;
  for (let i = 0; i <= n; i++) { const u = -L + 2 * L * i / n; pts.push([-(3 + 6 * Math.min(1, Math.max(0, fn(u, 0, lam)[0]))) * k, u]); }
  pathLocal(f, pts); ctx.strokeStyle = col + 'b3'; ctx.lineWidth = 1; ctx.stroke();
}

/* a graded-index lens: a slab its own thickness, each ring shaded by its fill, densest at the middle */
function drawGrin(el, sel) {
  const f = frame(el), D = grinDesign(el.grin, el.length), L = el.length / 2, T = (isFinite(D.t) ? Math.min(D.t, 4 * L) : 2) / 2;
  const ink = lightLayer ? '143,143,136' : '242,242,236';
  for (const R of D.rings) for (const s of [1, -1]) {
    pathLocal(f, [[-T, s * R.r0], [T, s * R.r0], [T, s * R.r1], [-T, s * R.r1]], true);
    ctx.fillStyle = 'rgba(' + ink + ',' + (0.08 + 0.5 * R.fill / 100).toFixed(3) + ')'; ctx.fill();
  }
  pathLocal(f, [[-T, -L], [T, -L], [T, L], [-T, L]], true);
  ctx.strokeStyle = sel ? selInk() : 'rgb(' + ink + ')'; ctx.lineWidth = sel ? 2.5 : 1.4; ctx.stroke();
}
const pct = v => v.toFixed(v < 10 ? 1 : 0) + '%';
/* its panel: the design, and what the design comes to. The rings it is made in stay in the
   design (core/grin.js), for making it; the panel speaks of density only */
function grinPanel(el) {
  const g = el.grin, D = grinDesign(g, el.length);
  panel.append(h('h3', null, 'Graded-index lens'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Diameter (mm)', el, 'length'), param('Focal length (mm)', el, 'grin.f'),
    selectField('Material', Object.entries(RF_MAT).filter(([, v]) => v.print).map(([k, v]) => [k, v.name + ' (typical)']), () => g.mat, v => { g.mat = v; }, { wide: true }),
    selectField('Profile', Object.entries(GRIN_PROFILES), () => g.profile, v => { g.profile = v; }, { wide: true }),
    param('Design frequency (GHz)', el, 'grin.ghz'), param('Density at the centre (%)', el, 'grin.fillMax'), param('Lowest density (%)', el, 'grin.fillMin')));
  const rows = D.usable ? [
    ['Thickness', D.t.toFixed(1) + ' mm'],
    ['Index', D.nHi.toFixed(3) + ' at the centre to ' + D.nLo.toFixed(3) + ' at the edge'],
    ['Density', pct(D.fillHi) + ' at the centre to ' + pct(D.fillLo) + ' at the edge'],
    ['Loss at the centre', D.lossDb(0).abs.toFixed(2) + ' dB absorbed, ' + D.lossDb(0).refl.toFixed(2) + ' dB reflected'],
    ['Loss at the edge', D.lossDb(D.a).abs.toFixed(2) + ' dB absorbed, ' + D.lossDb(D.a).refl.toFixed(2) + ' dB reflected'],
    ['Weight', Math.round(D.grams) + ' g'],
    ['Manufacturable', el.length <= PRINTER.maxDia && D.t <= PRINTER.maxHeight ? 'yes' : 'no'],
  ] : [];
  panel.append(h('div', { class: 'rt-readout' }, h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])),
    h('p', { class: 'note' }, 'Designed at ' + g.ghz + ' GHz. The lens is solid at its centre and less dense towards its edge, which lowers its index there. ' +
      (D.raised ? 'At ' + g.ghz + ' GHz its density goes no lower than ' + pct(D.fillFreq) + ', so its structure stays fine against the wavelength. ' : '') +
      D.M.name + ': typical values; these plastics vary with brand, colour and moisture.' + (D.checks.length ? ' Check: ' + D.checks.join(' ') : ''))));
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'grin' }));        // the beam at it, kept current
}

function maskPanel(el) {
  if (el.grin) return grinPanel(el);
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
