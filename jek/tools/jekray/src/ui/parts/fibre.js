import { V } from '../../state/project.js';
import { FIBRE_COLOUR } from '../../state/elements.js';
import { frame } from '../../core/mask.js';
import { RAY_PATTERNS } from '../../engines/trace.js';
import { bodyFill, ctx, drawPorts, pathLocal, selInk } from '../render.js';
import { bindSync, h, panel, param, selectField } from '../panel.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { fibreMode } from '../../engines/fibre-face.js';
import { anyPulse, pulseSection, pulseSectionEmpty, readoutBox } from '../panels.js';

/* Fibre on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/fibre.js */

/* the ferrule (or a collimator's barrel) behind the face, mm, as its 3D model has it: the same at every zoom */
const fibreBody = el => el.coll > 0 ? Math.max(el.coll * 1.4, 10) : 10;
function drawFibre(el, sel) {
  const f = frame(el), L = Math.max(el.length / 2, 0.6), k = 1 / V().scale, body = fibreBody(el);
  pathLocal(f, [[-body, -L], [0, -L], [0, L], [-body, L]], true);
  ctx.fillStyle = bodyFill('#39454c'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#cfd8dc'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  // a collimator's lens, at its face
  if (el.coll > 0) {
    const pts = []; for (let i = 0; i <= 16; i++) { const v = L * 0.85 * (2 * i / 16 - 1); pts.push([-0.3 * L * (1 - (v / L) ** 2), v]); }
    pathLocal(f, pts); ctx.strokeStyle = '#8fd3e8'; ctx.lineWidth = 1.6; ctx.stroke();
  }
  // the jacketed fibre leaving the back of the ferrule
  pathLocal(f, [[-body, 0], [-body - 10, 0]]);
  ctx.strokeStyle = FIBRE_COLOUR; ctx.lineWidth = 3; ctx.stroke();
  // the core on the face
  pathLocal(f, [[0, -Math.max(el.core * 5e-4, 2 * k)], [0, Math.max(el.core * 5e-4, 2 * k)]]);
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3; ctx.stroke();
  drawPorts(el);
}

function fibrePanel(el) {
  panel.append(h('h3', null, 'Fibre'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Type', [['sm', 'Single mode'], ['mm', 'Multimode']], () => el.mm ? 'mm' : 'sm', v => {
      el.mm = v === 'mm';
      // the usual fibres of each kind, where the core still has the other kind's size
      if (el.mm && el.core < 20) { el.core = 50; el.na = 0.22; } else if (!el.mm && el.core >= 20) { el.core = 4.4; el.na = 0.12; }
    }, { wide: true }),
    param('Core (µm)', el, 'core'), param('NA', el, 'na'),
    param(el.coll > 0 ? 'Clear aperture (mm)' : 'Ferrule face (mm)', el, 'length', { wide: true }),
    ...(el.mm ? [] : [param('Collimating lens f (mm)', el, 'coll', { wide: true })])));
  if (el.coll > 0 && !el.mm) {
    // the beam it sends out, as the focal length is edited: lambda f / (pi w) at 1550 nm
    const note = h('p', { class: 'note', style: 'margin-top:0.3rem' });
    bindSync(note, () => { note.textContent = 'Collimated beam out: 1/e\u00b2 radius ' + (+(1550e-6 * el.coll / (Math.PI * fibreMode(el.core, el.na, 1550).w)).toPrecision(3)) + ' mm at 1550 nm.'; });
    panel.append(note);
  }
  // the light it sends out, as a source's: the ray fan and the Gaussian beam each on their own tick, their settings under it
  panel.append(h('h3', null, 'Light from the fibre network'));
  const tick = (key, label) => {
    const c = h('input', { type: 'checkbox' });
    c.checked = el[key] !== false;
    c.addEventListener('change', () => { checkpoint(); if (c.checked) delete el[key]; else el[key] = false; changed(true); });
    return h('label', { class: 'rt-check' }, c, label);
  };
  panel.append(tick('emitTraceRays', 'Trace the ray fan'));
  if (el.emitTraceRays !== false) panel.append(h('div', { class: 'rt-rows', style: 'margin: 0.4rem 0 0.6rem' },
    param('Rays', el, 'emitRays'),
    // across the beam: the line of the 2D bench, or up and down it too (in 3D), as a source's
    selectField('Rays across the beam', RAY_PATTERNS, () => el.emitPattern || 'line', v => { if (v === 'line') delete el.emitPattern; else el.emitPattern = v; }, { wide: true })));
  panel.append(tick('emitGauss', 'Propagate a Gaussian beam along the axis'));
  if (el.emitGauss !== false) panel.append(h('div', { class: 'rt-rows', style: 'margin: 0.4rem 0 0.6rem' },
    // its beam's diffracted field, worked out as a source's is
    selectField('Field model', [['auto', 'Round when it can be'], ['2d', 'Always 2D, with polarisation']], () => el.popModel || 'auto', v => { el.popModel = v; }),
    selectField('Grid points', [128, 256, 512, 1024].map(v => [String(v), String(v)]), () => String(el.popN || 256), v => { el.popN = +v; })));
  else panel.append(h('p', { class: 'note' }, 'Rays only: with no Gaussian beam, nothing downstream can couple into a fibre, read a field or interfere with this light.'));
  if (el.emitTraceRays === false && el.emitGauss === false) panel.append(h('p', { class: 'note' }, 'Nothing leaves the tip: tick the ray fan, the Gaussian beam, or both.'));
  panel.append(readoutBox('fibre'));
  if (anyPulse()) pulseSection(el); else pulseSectionEmpty();
  if (el.mm) panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A multimode fibre (50 or 62.5 \u00b5m core, NA 0.22 or 0.275 are usual): it takes in whatever lands on its core inside its acceptance cone, so it is forgiving to align, and sends light out filling its core and NA, a beam of M\u00b2 = \u03c0 a NA / \u03bb (capped at 30). Joined to the network, what it carries keeps its power; its polarisation and phase are scrambled (set the fibre joined to it to Multimode), and the speckle a real one makes is not modelled: think of its output as speckle averaged.'));
  else panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Takes in the overlap of the light arriving on its face with its own mode, for each polarisation, with the beams of one launch added as fields first. The mode size comes from the core and NA (Marcuse’s formula for the fundamental mode), so offset, tilt, a mismatched waist and a wrong focus all cost what they should. It needs a Gaussian source; a ray fan has no field to overlap.'));
}

function hitFibre(el, lx, ly, tol) {
  const H = Math.max(el.length / 2, 0.6), body = fibreBody(el);
  return lx <= tol && lx >= -body - tol && Math.abs(ly) <= H + tol;
}

export const FIBRE_UI = {
  draw: drawFibre, hit: hitFibre, panel: fibrePanel, rank: 1,
};
