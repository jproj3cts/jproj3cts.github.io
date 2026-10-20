import { STL } from './stl.js';
import { SOURCE } from './source.js';
import { MIRROR } from './mirror.js';
import { SCREEN } from './screen.js';
import { WAVEPLATE } from './waveplate.js';
import { POLARISER } from './polariser.js';
import { MASK } from './mask.js';
import { STOP } from './stop.js';
import { CUBE } from './cube.js';
import { PRISM } from './prism.js';
import { LENS } from './lens.js';
import { GRATING } from './grating.js';
import { FIBRE } from './fibre.js';
import { DETECTOR } from './detector.js';
import { SPECTROMETER } from './spectrometer.js';
import { FARADAY } from './faraday.js';
import { ISOLATOR } from './isolator.js';
import { CRYSTAL } from './crystal.js';
import { FILTER } from './filter.js';
import { LINK } from './link.js';
import { AOM } from './aom.js';
import { EOM } from './eom.js';
import { FCOMP } from './fcomp.js';
import { DRAW } from './draw.js';
import { PIC_PART } from './pic.js';
import { ELEC_PART } from './elec.js';
import { CHOPPER } from './chopper.js';
import { NLC_PART } from './nlc.js';
import { CELL } from './cell.js';
import { GAIN } from './gain.js';

/* ==========================================================================
   The parts: one module each in this folder, gathered here. A part says what it is called, how the
   picker lists it (picker, and its place in FREE_GROUPS), what a new one is (make), what a saved one
   is taken to be (norm: every field checked and given its default), its extent out of the bench
   plane (zHalf, zSquare) and what the AI guide says of it (guide). How it is drawn, picked and
   edited on the page: ui/parts/<type>.js. How the light meets it, and its 3D model, still find it
   by type in engines/trace.js and ui/view3d.js.
   ========================================================================== */
export const PARTS = {
  stl: STL, source: SOURCE, mirror: MIRROR, screen: SCREEN, waveplate: WAVEPLATE, polariser: POLARISER, mask: MASK, stop: STOP, cube: CUBE, prism: PRISM, lens: LENS, grating: GRATING, fibre: FIBRE, detector: DETECTOR, spectrometer: SPECTROMETER, faraday: FARADAY, isolator: ISOLATOR, crystal: CRYSTAL, filter: FILTER, link: LINK, aom: AOM, eom: EOM, fcomp: FCOMP, draw: DRAW, pic: PIC_PART, elec: ELEC_PART, chopper: CHOPPER, nlc: NLC_PART, cell: CELL, gain: GAIN
};
/* the order the guide and the labels list them in */
export const PART_ORDER = ['source', 'mirror', 'lens', 'screen', 'stop', 'cube', 'prism', 'waveplate', 'polariser', 'mask', 'grating', 'fibre', 'detector', 'spectrometer', 'faraday', 'isolator', 'stl', 'crystal', 'filter', 'gain', 'cell', 'nlc', 'link', 'aom', 'eom', 'chopper', 'draw'];
export const TYPE_LABEL = Object.fromEntries(PART_ORDER.map(t => [t, PARTS[t].label]));
/* the free-space palette: its parts in the picker's order, and the rail's groups */
export const FREE_PARTS = [SOURCE, MIRROR, LENS, CUBE, PRISM, WAVEPLATE, POLARISER, STOP, MASK, SCREEN, GRATING, CRYSTAL, FILTER, FARADAY, ISOLATOR, GAIN, CELL, NLC_PART, FIBRE, DETECTOR, SPECTROMETER, CHOPPER, AOM, EOM, LINK];
export const FREE_GROUPS = [['Sources and detectors', ['source', 'detector', 'spectrometer', 'screen', 'fibre']],
  ['Mirrors and lenses', ['mirror', 'lens', 'asphere', 'diffractive', 'grinrod', 'cylinder', 'axicon']],
  ['Splitting and polarisation', ['cube', 'waveplate', 'polariser', 'crystal', 'faraday', 'isolator']],
  ['Shaping and filtering', ['stop', 'mask', 'filter', 'grating', 'prism']],
  ['Active and atomic', ['gain', 'cell', 'nlc', 'aom', 'eom', 'elec:chopper']],
  ['Tabs', ['link']]];
/* the picker's rows, [key, short, long?], from the parts' entries */
export const pickerRows = parts => parts.flatMap(p => (p.picker || []).map(it => it.long ? [it.key, it.short, it.long] : [it.key, it.short]));
/* a picker key (lens, asphere, splitter, ...) to the part that makes it */
export const PART_BY_KEY = Object.fromEntries(Object.values(PARTS).flatMap(p => (p.keys || []).map(k => [k, p])));
