import { clamp } from '../core/constants.js';
import { CRYSTAL_SHAPES, FILTER_TYPES } from '../core/crystals.js';
import { DRAW_SHAPES } from './drawings.js';
import { lensKind } from './elements.js';
import { FC } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { modName } from '../engines/mods.js';

/* ==========================================================================
   Project state
   ========================================================================== */

export let project = null;
export function setProject(v) { return (project = v); }
export let selectedId = null;
export function setSelectedId(v) { return (selectedId = v); }
// several selected: the one the panel shows is selectedId, the rest are here
export let extraSel = new Set();
export function setExtraSel(v) { return (extraSel = v); }
export const selectOne = id => { selectedId = id; extraSel.clear(); };
export let history = [], future = [];
export function setHistory(v) { return (history = v); }
export function setFuture(v) { return (future = v); }
export const uid = () => 'e' + Math.random().toString(36).slice(2, 9);
export const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
export const deg = Math.PI / 180;

export const TYPE_LABEL = { source: 'Source', mirror: 'Mirror', lens: 'Lens', screen: 'Screen', stop: 'Stop',
  cube: 'Beam splitter cube', prism: 'Prism', waveplate: 'Waveplate', polariser: 'Polariser', mask: 'Mask',
  grating: 'Grating', fibre: 'Fibre', detector: 'Photodetector', faraday: 'Faraday rotator', isolator: 'Optical isolator',
  stl: 'STL object', crystal: 'Crystal', filter: 'Filter', gain: 'Gain medium', cell: 'Vapour cell', nlc: 'Nonlinear crystal', link: 'Link plane', aom: 'Acousto-optic modulator', eom: 'Electro-optic modulator', chopper: 'Optical chopper', draw: 'Drawing' };
export const PRISM_SHAPES = { right: 'Right-angle prism', equilateral: 'Equilateral prism', window: 'Window', dove: 'Dove prism' };
export const DOVE_RATIO = 4.224;              // a Dove prism's length over its height, for N-BK7 (as catalogue ones are)
export const typeLabel = el => el.mod ? modName(el) : el.type === 'lens' && el.mmw ? 'RF lens' : el.mmw && !el.mmw.part ? (el.type === 'source' ? 'Feed horn' : 'Receiving horn') : el.type === 'draw' ? DRAW_SHAPES[el.shape] : el.type === 'chopper' ? 'Optical chopper' : el.type === 'fcomp' ? (el.kind === 'pd' && el.balanced ? 'Balanced photodetector' : el.kind === 'pd' && el.diode ? 'Fibre photodiode' : el.led ? 'Fibre-coupled LED' : el.kind === 'amp' && el.soa ? 'Semiconductor optical amplifier' : el.kind === 'split' ? (el.combine ? 'Combiner, ' + el.ways + '\u00d71' : 'Splitter, 1\u00d7' + el.ways) : FC[el.kind].label) : el.type === 'detector' && el.diode ? 'Photodiode' : el.type === 'pic' ? PIC.label(el) : el.type === 'elec' ? ELEC.label(el) : el.type === 'lens' ? lensKind(el) : el.type === 'prism' ? PRISM_SHAPES[el.shape]
  : el.type === 'crystal' ? CRYSTAL_SHAPES[el.shape] : el.type === 'filter' ? FILTER_TYPES[el.ftype] + ' filter' : TYPE_LABEL[el.type];

export function nextName(prefix) {
  const used = new Set(project.elements.map(e => e.name));
  let i = 1;
  while (used.has(prefix + ' ' + i)) i++;
  return prefix + ' ' + i;
}

export function normMat(m) {
  if (!m || typeof m !== 'object') return { glass: 'N-BK7', abs: 0 };
  const out = { glass: String(m.glass || 'N-BK7'), abs: Math.max(0, num(m.abs, 0)) };
  if (m.table && Array.isArray(m.table.wl) && m.table.wl.length > 1) {
    out.table = {
      wl: m.table.wl.map(Number),
      n: (m.table.n || []).map(Number),
      k: (m.table.k || []).map(Number),
    };
  }
  if (out.glass === 'custom') out.n = num(m.n, 1.5);
  if (isFinite(m.nd)) out.nd = +m.nd;
  if (isFinite(m.vd)) out.vd = +m.vd;
  return out;
}
export function normCoat(c) {
  c = c || {};
  const mode = ['bare', 'ar', 'custom', 'stack', 'band'].includes(c.mode) ? c.mode : 'bare';
  const out = { mode, R: clamp(num(c.R, mode === 'ar' ? 0.5 : 4), 0, 100) };
  if (mode === 'band') {
    out.lo = clamp(num(c.lo, 350), 100, 20000);
    out.hi = clamp(num(c.hi, 700), 100, 20000);
    if (c.label) out.label = String(c.label).slice(0, 40);
  }
  if (mode === 'stack') {
    out.design = clamp(num(c.design, 550), 100, 20000);
    out.layers = (Array.isArray(c.layers) ? c.layers : []).slice(0, 40).map(L => ({
      n: Math.max(1, num(L && L.n, 1.38)),
      d: Math.max(0, num(L && L.d, 100)),
    }));
  }
  return out;
}

/* Thorlabs name their coatings by band, and the part number carries the suffix.
   Outside its band a coating is not a coating, so the surface falls back to bare glass. */
const COATING_BANDS = {
  'A':   { lo: 350, hi: 700, R: 0.5, label: 'AR band A' },
  'AB':  { lo: 400, hi: 1100, R: 0.75, label: 'AR band AB' },
  'B':   { lo: 650, hi: 1050, R: 0.5, label: 'AR band B' },
  'C':   { lo: 1050, hi: 1700, R: 0.5, label: 'AR band C' },
  'D':   { lo: 1650, hi: 3000, R: 1.0, label: 'AR band D' },
  'E':   { lo: 2000, hi: 5000, R: 1.5, label: 'AR band E' },
  'UV':  { lo: 245, hi: 400, R: 1.0, label: 'AR band UV' },
};
const MIRROR_COATINGS = {
  'E02': { lo: 400, hi: 750, R: 99, label: 'E02 dielectric' },
  'E03': { lo: 750, hi: 1100, R: 99, label: 'E03 dielectric' },
  'E04': { lo: 1280, hi: 1600, R: 99, label: 'E04 dielectric' },
  'F01': { lo: 250, hi: 450, R: 89, label: 'F01 UV aluminium' },
  'G01': { lo: 450, hi: 20000, R: 96, label: 'G01 protected aluminium' },
  'P01': { lo: 450, hi: 20000, R: 97.5, label: 'P01 protected silver' },
  'M01': { lo: 800, hi: 20000, R: 96, label: 'M01 protected gold' },
};
/* The trailing letters of a part number, e.g. C350TMD-C or PF10-03-P01 */
export function coatingFromPart(name) {
  const m = String(name).toUpperCase().match(/-([A-Z]{1,2}\d{0,2})(?:\.[A-Z]+)?$/);
  if (!m) return null;
  const tag = m[1];
  if (MIRROR_COATINGS[tag]) return { kind: 'mirror', tag, spec: MIRROR_COATINGS[tag] };
  if (COATING_BANDS[tag]) return { kind: 'ar', tag, spec: COATING_BANDS[tag] };
  return null;
}
export function bandCoat(spec, tag) {
  return normCoat({ mode: 'band', R: spec.R, lo: spec.lo, hi: spec.hi, label: spec.label + ' (-' + tag + ')' });
}

export const V = () => project.view;
