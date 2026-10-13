import { applyRf, normRf } from '../core/rf.js';
import { applyPulse } from '../core/pulses.js';
import { wavelengthColour } from '../core/colour.js';
import { project } from '../state/project.js';
import { selected } from '../state/elements.js';
import { setRoll, setTip, setZ, zOf } from '../engines/trace.js';
import { applyFibre } from '../engines/fibre-face.js';
import { renderPanel } from './panel.js';
import { fanFromGauss, gaussFromFan } from './panel-cavity.js';
import { toast } from './actions.js';

/* ==========================================================================
   Parameters: every numeric setting has a path (e.g. "surfaces.0.R"), so the
   panel and the sweep animator share one way of reading and writing it
   ========================================================================== */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function getPath(el, path) {
  // a free-space part's place out of the plane: kept only when not the default
  if (path === 'z' || path === 'tip' || path === 'roll') return path === 'z' ? zOf(el) : el[path] || 0;
  let o = el;
  for (const k of path.split('.')) { if (o === null || o === undefined) return undefined; o = o[k]; }
  return o;
}
export function setParam(el, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  let starWas = null;                                      // a star coupler's counts before, to move its fibres
  let o = el;
  for (const k of keys) { o = o[k]; if (!o) return; }
  if (last === 'R') v = (v === null || v === 0 || !isFinite(v)) ? null : v;
  else if (v === null || !isFinite(v)) return;
  switch (last) {
    case 'wavelength':
      if (el.mmw) return;                                 // a horn's is its frequency's
      if (v > 1e6 && el.type === 'source') toast('Light runs from 100 nm to 1 mm here; beyond that is radio: use a horn from the RF parts.');
      v = clamp(v, 100, el.type === 'source' ? 1e6 : 20000); break;
    case 'rays': v = Math.round(clamp(v, 1, 501)); break;
    case 'width': v = Math.max(0, v); break;
    case 'divergence': v = clamp(v, -179, 179); break;
    case 'length': case 'diameter': v = Math.max(0.1, v); break;
    case 'n': v = Math.max(1, v); break;
    case 'reflect': v = clamp(v, 0, 100); break;
    case 'aperture': v = Math.max(0, v); break;
    case 'reflectS': case 'reflectP': v = clamp(v, 0, 100); break;
    case 'polAngle': case 'axis': v = ((v % 360) + 360) % 360; break;
    case 'w0': v = Math.max(1e-4, v); break;
    case 'design': case 'lo': case 'hi': v = clamp(v, 100, 20000); break;
    case 'mtfFreq': case 'binWidth': v = Math.max(0, v); break;
    case 'abAng': v = clamp(v, 0, 60); break;
    case 'abH': v = Math.max(0, v); break;
    case 'abN': v = Math.round(clamp(v, 3, 21)); break;
    case 'abRays': v = Math.round(clamp(v, 11, 401)) | 1; break;
    case 'abs': v = Math.max(0, v); break;
    case 'd': v = Math.max(0, v); break;
    case 'retard': break;
    case 'R': if (keys[keys.length - 1] === 'coat' || (o && o.mode)) v = clamp(v, 0, 100); break;
    case 'outer': v = Math.max(0.2, v); break;
    case 'lpmm': v = clamp(v, 1, 10000); break;
    case 'eff': case 'tmax': v = clamp(v, 0, 100); break;
    case 'blaze': case 'edge': case 'centre': v = clamp(v, 100, 20000); break;
    case 'core': v = Math.max(0.5, v); break;
    case 'na': v = clamp(v, 0.01, 0.9); break;
    case 'od': v = clamp(v, 0, 10); break;
    case 'slope': case 'fwhm': v = Math.max(0.01, v); break;
    case 'g0': v = clamp(v, 0, 1000); break;
    case 'cellLen': v = Math.max(1, v); break;
    case 'temp': v = clamp(v, el.type === 'nlc' ? -50 : -20, 250); break;
    case 'nlLen': v = clamp(v, 0.1, 200); break;
    case 'period': v = Math.max(0, v); break;
    case 'isat': v = Math.max(0, v); break;
    case 'axisAngle': v = clamp(v, -89, 89); break;
    case 'wedge': v = clamp(v, 5, 60); break;
    case 'extinction': v = clamp(v, 0, 80); break;
    case 'gain': if (!(el.type === 'elec' && el.kind === 'amp')) v = Math.max(0, v); break;     // an electrical amplifier may invert
    case 'dark': case 'ampNoise': case 'resp': case 'power': v = Math.max(0, v); break;
    case 'bandwidth': v = Math.max(1, v); break;
    case 'coh': v = Math.max(0, v); break;
    case 'bw': v = Math.max(0.001, v); break;
    case 'db': v = Math.max(0, v); break;
    case 'rate': v = Math.max(1e-3, v); break;
    case 'bits': v = Math.round(clamp(v, 1, 32)); break;
    case 'ways': v = Math.round(clamp(v, 2, 64)); break;
    case 'ins': case 'outs': if (el.type === 'fcomp') { v = Math.round(clamp(v, 1, 32)); starWas = [el.ins, el.outs]; } break;
    case 'pdg': case 'dgd': v = Math.max(0, v); break;
    case 'cmrr': v = Math.max(0, v); break;
    case 'vpi': v = Math.max(1e-3, v); break;
    case 'range': v = Math.max(1e-9, v); break;
    case 'ratio': case 'rmax': v = clamp(v, 0, 100); break;
    case 'att': case 'iso': case 'rl': case 'loss': v = Math.max(0, v); break;
    case 'emitRays': v = Math.round(clamp(v, 0, 51)); break;
    case 'm2': v = clamp(v, 1, 50); break;
    case 'hm': case 'hn': case 'lp': v = Math.round(clamp(v, 0, 10)); break;
    case 'trapR': case 'trapRho': v = Math.max(1, v); break;
    case 'trapP': v = Math.max(1e-12, v); break;
    case 'trapT': v = Math.max(0.001, v); break;
    case 'll': v = Math.round(clamp(v, -10, 10)); break;
    case 'vmax': v = Math.max(0.01, v); break;
    case 'size': case 'thickness': v = Math.max(0.1, v); break;
    case 'tau': v = Math.max(0, v); break;
    case 'rep': v = Math.max(0.001, v); break;
    // PIC hook: the photonic parts' settings
    case 'kappa': case 'kappa1': case 'kappa2': v = clamp(v, 0, 100); break;
    case 'radius': case 'len': v = Math.max(0.01, v); break;
    case 'neff': case 'ng': v = Math.max(1, v); break;
    case 'peak': v = Math.min(0, v); break;
  }
  if (keys[0] === 'gaps') v = Math.max(0, v);
  if (!keys.length && (last === 'z' || last === 'tip' || last === 'roll')) { ({ z: setZ, tip: setTip, roll: setRoll })[last](el, v); return; }
  o[last] = v;
  if (el.type === 'source' && last === 'wavelength' && el.colourAuto) el.colour = wavelengthColour(v);
  if (el.type === 'source' && el.gauss) {
    if (last === 'width' || last === 'divergence') gaussFromFan(el);
    else if (last === 'w0' || last === 'z0' || last === 'wavelength') fanFromGauss(el);
  }
  if (el.type === 'lens' && last === 'diameter') el.surfaces.forEach(s => s.semi = null);
  if (keys[0] === 'mmw') { el.mmw = normRf(el.mmw, el.type); applyRf(el); }
  if (el.type === 'source' && el.fibre && (last === 'wavelength' || keys[0] === 'fibre')) applyFibre(el);
  if (el.type === 'source' && el.gauss && ['m2', 'hm', 'hn', 'lp', 'll'].includes(last)) fanFromGauss(el);
  if ((el.type === 'source' || el.kind === 'laser') && (last === 'tau' || last === 'pshape')) applyPulse(el);
  // a star coupler's inputs or outputs changed: its outputs' fibres move with them, and those on ports gone go
  if (starWas && el.type === 'fcomp' && el.kind === 'star') {
    const [M0, N0] = starWas, M = el.ins, N = el.outs, map = p => p < M0 ? (p < M ? p : -1) : (p - M0 < N ? M + p - M0 : -1);
    project.fibres = (project.fibres || []).filter(F => { for (const q of [F.a, F.b]) if (q[0] === el.id) { const m = map(q[1]); if (m < 0) return false; q[1] = m; } return true; });
    setTimeout(() => { if (selected() === el) renderPanel(); });
  }
  // fewer branches: the fibres on the ones gone go with them
  if (el.type === 'fcomp' && el.kind === 'split' && last === 'ways') {
    project.fibres = (project.fibres || []).filter(F => ![F.a, F.b].some(q => q[0] === el.id && q[1] > el.ways));
    setTimeout(() => { if (selected() === el) renderPanel(); });       // its title says how many
  }
}

