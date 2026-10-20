import { SOURCE_UI } from './source.js';
import { MIRROR_UI } from './mirror.js';
import { LENS_UI } from './lens.js';
import { SCREEN_UI } from './screen.js';
import { STOP_UI } from './stop.js';
import { CUBE_UI } from './cube.js';
import { PRISM_UI } from './prism.js';
import { WAVEPLATE_UI } from './waveplate.js';
import { POLARISER_UI } from './polariser.js';
import { MASK_UI } from './mask.js';
import { GRATING_UI } from './grating.js';
import { FIBRE_UI } from './fibre.js';
import { DETECTOR_UI } from './detector.js';
import { SPECTROMETER_UI } from './spectrometer.js';
import { FARADAY_UI } from './faraday.js';
import { ISOLATOR_UI } from './isolator.js';
import { STL_UI } from './stl.js';
import { CRYSTAL_UI } from './crystal.js';
import { FILTER_UI } from './filter.js';
import { GAIN_UI } from './gain.js';
import { CELL_UI } from './cell.js';
import { NLC_UI } from './nlc.js';
import { LINK_UI } from './link.js';
import { AOM_UI } from './aom.js';
import { EOM_UI } from './eom.js';
import { CHOPPER_UI } from './chopper.js';
import { DRAW_UI } from './draw.js';
import { FCOMP_UI } from './fcomp.js';
import { PIC_PART_UI } from './pic.js';
import { ELEC_PART_UI } from './elec.js';

/* ==========================================================================
   The parts on the page, by type: how each is drawn on the bench (draw(el, sel)), picked by the
   pointer (hit(el, lx, ly, tol), in the part's own frame; rank: which is picked first where
   parts overlap, lowest first), and edited (panel(el), its own sections after the common ones;
   noModPanel: a mod's part shows the mod's panel instead). Their 3D models are still in
   ui/view3d.js. What each part is: parts/<type>.js.
   ========================================================================== */
export const PART_UI = {
  source: SOURCE_UI, mirror: MIRROR_UI, lens: LENS_UI, screen: SCREEN_UI, stop: STOP_UI, cube: CUBE_UI, prism: PRISM_UI, waveplate: WAVEPLATE_UI, polariser: POLARISER_UI, mask: MASK_UI, grating: GRATING_UI, fibre: FIBRE_UI, detector: DETECTOR_UI, spectrometer: SPECTROMETER_UI, faraday: FARADAY_UI, isolator: ISOLATOR_UI, stl: STL_UI, crystal: CRYSTAL_UI, filter: FILTER_UI, gain: GAIN_UI, cell: CELL_UI, nlc: NLC_UI, link: LINK_UI, aom: AOM_UI, eom: EOM_UI, chopper: CHOPPER_UI, draw: DRAW_UI, fcomp: FCOMP_UI, pic: PIC_PART_UI, elec: ELEC_PART_UI,
};
