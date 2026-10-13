import { V } from '../../state/project.js';
import { FIBRE_COLOUR } from '../../state/elements.js';
import { frame } from '../../core/mask.js';
import { RAY_PATTERNS } from '../../engines/trace.js';
import { bodyFill, ctx, drawPorts, pathLocal, selInk } from '../render.js';
import { h, panel, param, selectField } from '../panel.js';
import { anyPulse, pulseSection, pulseSectionEmpty, readoutBox } from '../panels.js';

/* Fibre on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/fibre.js */

function drawFibre(el, sel) {
  const f = frame(el), L = Math.max(el.length / 2, 0.6), k = 1 / V().scale, body = Math.max(8, 30 * k);
  pathLocal(f, [[-body, -L], [0, -L], [0, L], [-body, L]], true);
  ctx.fillStyle = bodyFill('#39454c'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#cfd8dc'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  // the jacketed fibre leaving the back of the ferrule
  pathLocal(f, [[-body, 0], [-body - Math.max(10, 40 * k), 0]]);
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
    param('Ferrule face (mm)', el, 'length', { wide: true })));
  panel.append(h('h3', null, 'Light from the fibre network'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Rays', el, 'emitRays'),
    // across the beam: the line of the 2D bench, or up and down it too (in 3D), as a source's
    selectField('Rays across the beam', RAY_PATTERNS, () => el.emitPattern || 'line', v => { if (v === 'line') delete el.emitPattern; else el.emitPattern = v; }, { wide: true })));
  panel.append(readoutBox('fibre'));
  if (anyPulse()) pulseSection(el); else pulseSectionEmpty();
  if (el.mm) panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A multimode fibre (50 or 62.5 \u00b5m core, NA 0.22 or 0.275 are usual): it takes in whatever lands on its core inside its acceptance cone, so it is forgiving to align, and sends light out filling its core and NA, a beam of M\u00b2 = \u03c0 a NA / \u03bb (capped at 30). Joined to the network, what it carries keeps its power; its polarisation and phase are scrambled (set the fibre joined to it to Multimode), and the speckle a real one makes is not modelled: think of its output as speckle averaged.'));
  else panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Takes in the overlap of the light arriving on its face with its own mode, for each polarisation, with the beams of one launch added as fields first. The mode size comes from the core and NA (Marcuse’s formula for the fundamental mode), so offset, tilt, a mismatched waist and a wrong focus all cost what they should. It needs a Gaussian source; a ray fan has no field to overlap.'));
}

function hitFibre(el, lx, ly, tol) {
  const H = Math.max(el.length / 2, 0.6), body = Math.max(8, 30 / V().scale);
  return lx <= tol && lx >= -body - tol && Math.abs(ly) <= H + tol;
}

export const FIBRE_UI = {
  draw: drawFibre, hit: hitFibre, panel: fibrePanel, rank: 1,
};
