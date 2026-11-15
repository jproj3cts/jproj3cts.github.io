import { V, deg } from '../../state/project.js';
import { METAL_NAMES } from '../../core/metals.js';
import { SPHERE_DENSITY } from '../../core/traps.js';
import { ctx, getCss, selInk, sx, sy } from '../render.js';
import { h } from '../dom.js';
import { fid, helpLine, numInput, panel, param, selectField, setFid } from '../panel.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';
import { readoutTabs } from '../panels.js';
import { PARTICLE_SHAPES, particleMats } from '../scatter.js';

/* Particle on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/particle.js */

/* It is nanometres across on a bench of millimetres, so it is drawn as a sign that keeps its size on the page: its shape and
   proportions, its axis along the part's angle (a rod tilted up out of the plane is seen shortened), in its material's
   colour, with four ticks round it so that a dot on a beam can be found */
export const PARTICLE_PX = 16;             // its longest side on the page
const PARTICLE_INK = { Au: '#d8a650', Ag: '#dfe3e6', Al: '#c9ced3' };
/* the sign's half-length along its axis and half-width across it, px */
export function particleSign(el) {
  const sphere = !['cylinder', 'capsule', 'spheroid'].includes(el.trapShape), D = Math.max(1, 2 * el.trapR), L = sphere ? D : Math.max(el.trapShape === 'capsule' ? D : 1, el.trapLen || D);
  const k = PARTICLE_PX / Math.max(D, L), across = Math.max(2.5, D * k / 2), tl = (el.trapTilt || 0) * deg;
  // along its axis as the bench plane shows it: a rod tilted up is seen end on
  const along = sphere ? across : Math.max(2.5, Math.hypot(L * k / 2 * Math.cos(tl), D * k / 2 * Math.sin(tl)));
  return { along, across, shape: sphere ? 'sphere' : el.trapShape };
}
function drawParticle(el, sel) {
  const S = particleSign(el), cx = sx(el.x), cy = sy(el.y), a = el.angle * deg;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-a);
  ctx.beginPath();
  if (S.shape === 'cylinder') ctx.rect(-S.along, -S.across, 2 * S.along, 2 * S.across);
  else if (S.shape === 'capsule' && S.along > S.across) {
    const m = S.along - S.across;
    ctx.moveTo(-m, -S.across); ctx.lineTo(m, -S.across); ctx.arc(m, 0, S.across, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-m, S.across); ctx.arc(-m, 0, S.across, Math.PI / 2, 3 * Math.PI / 2); ctx.closePath();
  } else ctx.ellipse(0, 0, S.along, S.across, 0, 0, 2 * Math.PI);
  ctx.fillStyle = PARTICLE_INK[el.trapMat] || '#dff1f7';
  ctx.fill();
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-screen');
  ctx.lineWidth = sel ? 2 : 1.2;
  ctx.stroke();
  ctx.restore();
  // the ticks, level and upright whatever the axis
  const r0 = Math.max(S.along, S.across) + 4, r1 = r0 + 5;
  ctx.beginPath();
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + ux * r0, cy + uy * r0); ctx.lineTo(cx + ux * r1, cy + uy * r1); }
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-screen');
  ctx.lineWidth = sel ? 2 : 1.2;
  ctx.stroke();
}
/* picked within its ticks: a disc that keeps its size on the page */
const hitParticle = (el, lx, ly, tol) => Math.hypot(lx, ly) <= tol + (PARTICLE_PX / 2 + 9) / V().scale;

function particleParams(el) {
  const rows = h('div', { class: 'rt-rows' }), sph = el.trapShape === 'sphere';
  const did = 'rtf' + setFid(fid + 1);
  rows.append(selectField('Shape', PARTICLE_SHAPES, () => el.trapShape, v => { el.trapShape = v; }, { wide: true }),
    selectField('Material', particleMats(), () => el.trapMat, v => { el.trapMat = v; if (SPHERE_DENSITY[v]) el.trapRho = SPHERE_DENSITY[v]; }),
    h('div', { class: 'rt-f' }, h('label', { for: did }, 'Diameter (nm)'), numInput(did, () => 2 * el.trapR, v => { el.trapR = Math.max(1, v / 2); })));
  if (!sph) rows.append(param('Length (nm)', el, 'trapLen'), param('Axis tilt up (°)', el, 'trapTilt'));
  rows.append(selectField('Medium', [['bench', 'As on the bench'], ['vacuum', 'Vacuum'], ['air', 'Air, at a pressure'], ['water', 'Water']], () => el.trapMed, v => { el.trapMed = v; }));
  if (el.trapMed === 'air') rows.append(param('Pressure (mbar)', el, 'trapP'));
  const check = (key, text) => { const c = h('input', { type: 'checkbox' }); c.checked = el[key] !== false; c.onchange = () => { checkpoint(); el[key] = c.checked; changed(true); }; return h('label', { class: 'rt-check wide' }, c, text); };
  rows.append(check('scatLight', 'Send its scattered light to the parts'), check('scatFan', 'Draw the scattered light in every direction'));
  panel.append(h('h3', null, 'Particle'), rows);
  panel.append(helpLine('A point of the bench: the light passes it untouched, and what it scatters goes to the parts that can see it.', ['The particle is ' + (METAL_NAMES[el.trapMat] || el.trapMat) + ', in whatever light reaches where it is put. The part’s angle is the direction of a rod’s or spheroid’s axis in the bench plane. Its Scattering tab gives its cross-sections, the power it scatters and where that goes; its Trap tab the optical trap the light makes for it. ',
    'With its scattered light sent to the parts, each part with a clear line to the particle is sent a cone of rays that carry the scattered field along them: its power in that solid angle, its polarisation and its phase, as light of the laser that drives the particle. A lens collimates the cone, a photodetector reads it and adds it to the unscattered beam as a field, a fibre takes its overlap with its mode. The faint fan in every direction is a picture only: it is as bright as the pattern is along each ray and is never part of a reading. ',
    'The particle and everything the light meets are in each other’s far field. Light that comes back to the particle is not scattered again, and two particles do not light each other.'], 'note', 'margin-top:0.5rem'));
}
function particlePanel(el) {
  if (readoutTabs(el, [['params', 'Particle'], ['trap', 'Trap'], ['scatter', 'Scattering']])) return;
  particleParams(el);
}

export const PARTICLE_UI = {
  draw: drawParticle, hit: hitParticle, panel: particlePanel, rank: 0,
};
