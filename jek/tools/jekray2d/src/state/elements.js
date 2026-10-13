import { FORMAT, VERSION } from '../core/constants.js';
import { glassKey } from '../core/glass.js';
import { CRYSTALS, CRYSTAL_SHAPES, FILTER_TYPES } from '../core/crystals.js';
import { ATOMS } from '../core/cells.js';
import { SPHERE_DENSITY, TRAP_ATOMS } from '../core/traps.js';
import { NLC } from '../core/nlc.js';
import { normModRef } from '../core/modulators.js';
import { DETECTOR_MATERIALS, applyRf, normRf } from '../core/rf.js';
import { CMODES, applyPulse, isLaserLike, syncLine } from '../core/pulses.js';
import { wavelengthColour } from '../core/colour.js';
import {
  PRISM_SHAPES, TYPE_LABEL, deg, nextName, normCoat, normMat, num, project, selectedId, setProject,
  uid
} from './project.js';
import { ensureBenches } from './tabs.js';
import { STL_UNITS, stlMeshNorm } from '../core/stl.js';
import { STOP_SHAPES } from '../core/mask.js';
import { RAY_PATTERNS, loadGen, setLoadGen, tippable } from '../engines/trace.js';
import { ZOOM_MAX, benchStyleShown } from '../ui/render.js';
import { normDraw } from '../ui/drawings.js';
import { clamp, getPath } from '../ui/params.js';
import { SWEEP_STEPS_MAX } from '../ui/sweeps.js';
import { applyFibre } from '../engines/fibre-face.js';
import { CONNS, FC, FIBRE_POLS, fcPortsOf, pkey, portsOf } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { V3D } from '../ui/view3d.js';
import { modsCarried, normCarried } from '../io/mods.js';

function normSurface(s) {
  s = s || {};
  const R = (s.R === null || s.R === undefined || s.R === '' || !isFinite(s.R) || s.R === 0) ? null : +s.R;
  return {
    R, k: num(s.k, 0), a2: num(s.a2, 0),
    A: Array.isArray(s.A) ? s.A.map(Number).filter(isFinite) : [],
    odd: Array.isArray(s.odd) && s.odd.some(v => +v) ? s.odd.map(Number).filter(isFinite) : undefined,
    semi: (isFinite(s.semi) && s.semi > 0) ? +s.semi : null,
    coat: normCoat(s.coat),
  };
}
export function normElement(e) {
  const o = normElementBase(e);
  if (!o) return null;
  ELEC.normExtra(e, o);                                                                      // ELEC hook: an optical part's electrical settings
  if (o.mmw) applyRf(o);                                  // a horn sets its own beam
  if (o.type === 'source' && o.fibre) applyFibre(o);     // a fibre launch sets its own beam
  if ((o.type === 'source' || (o.type === 'fcomp' && o.kind === 'laser')) && o.tau > 0) applyPulse(o);
  if (isLaserLike(o)) syncLine(o);
  o.sweeps = {};
  if (e.sweeps && typeof e.sweeps === 'object') {
    for (const [k, v] of Object.entries(e.sweeps)) {
      const cur = getPath(o, k);
      if (cur === undefined || (cur !== null && typeof cur !== 'number')) continue;
      if (!v || !isFinite(v.min) || !isFinite(v.max)) continue;
      const freq = isFinite(v.freq) && v.freq > 0 ? +v.freq : 1 / Math.max(0.1, num(v.period, 4));
      o.sweeps[k] = { min: +v.min, max: +v.max, freq: clamp(freq, 0.001, 50), phase: num(v.phase, 0),
        wave: ['sine', 'triangle', 'ramp'].includes(v.wave) ? v.wave : 'sine' };
      if (v.field === true) o.sweeps[k].field = true;
      // steps a cycle: the positions it plays through (and renders, with the field); none, smooth
      if (isFinite(v.steps) && v.steps >= 2) o.sweeps[k].steps = Math.round(clamp(+v.steps, 2, SWEEP_STEPS_MAX));
    }
  }
  return o;
}
export function normElementBase(e) {
  const base = {
    id: typeof e.id === 'string' ? e.id : uid(),
    type: e.type,
    name: String(e.name || TYPE_LABEL[e.type] || 'Element'),
    x: num(e.x, 0), y: num(e.y, 0), angle: num(e.angle, 0),
    bench: typeof e.bench === 'string' ? e.bench : null,     // the tab it is on (ensureBenches fills it in)
  };
  if (e.locked === true) base.locked = true;                  // held in place: not moved by dragging or the arrow keys
  if (e.hide3d === true) base.hide3d = true;                  // not drawn in the 3D view (the light still meets it)
  // its height above the breadboard (mm), kept only when not the beam height (see zOf)
  if (isFinite(e.z) && e.z !== null && +e.z !== 75) base.z = clamp(+e.z, 0, 2000);
  // a free-space part tipped up (+) or down out of the bench plane, degrees (see setTip)
  if (isFinite(e.tip) && e.tip !== null && +e.tip !== 0 && tippable(base)) base.tip = clamp(+(+e.tip).toFixed(6), -90, 90);
  // and rolled about its own axis (the way it faces, or its optical axis), degrees (see setRoll)
  if (isFinite(e.roll) && e.roll !== null && +e.roll !== 0 && tippable(base)) base.roll = clamp(+(+e.roll).toFixed(6), -180, 180);
  if (typeof e.group === 'string' && e.group) base.group = e.group.slice(0, 40);     // one of a group, picked and moved together
  // what its import had to assume (a coating from the part number, a fold it could not follow): shown in red until dismissed
  if (Array.isArray(e.assumed) && e.assumed.length) base.assumed = e.assumed.filter(x => typeof x === 'string' && x).slice(0, 12).map(x => x.slice(0, 400));
  if (e.mmw && typeof e.mmw === 'object') base.mmw = normRf(e.mmw, e.type);              // an RF part: the RF palette's, a horn's settings
  if (e.mod && typeof e.mod === 'object') { const m = normModRef(e.mod, e.type); if (m) base.mod = m; }   // a mod's part: which mod, its settings
  // its name moved off its usual place (mm from the part) or made bigger or smaller
  if (e.label && isFinite(e.label.dx) && isFinite(e.label.dy)) base.label = { dx: +e.label.dx, dy: +e.label.dy, s: clamp(num(e.label.s, 1), 0.4, 8) };
  switch (e.type) {
    case 'stl': {
      // an STL object: its triangles (base64 float32, centred), how many, its size and the file it came from
      const M = e.mesh && typeof e.mesh === 'object' && typeof e.mesh.data === 'string' && /^[A-Za-z0-9+/=]*$/.test(e.mesh.data) ? e.mesh : null;
      const units = Object.prototype.hasOwnProperty.call(STL_UNITS, e.units) ? e.units : e.units === 'other' ? 'other' : 'mm';
      return Object.assign(base, {
        mesh: M ? stlMeshNorm(M) : null,
        units, scale: units === 'other' ? clamp(num(e.scale, 1), 1e-6, 1e6) : STL_UNITS[units],
        colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : '#8a8f96',
      });
    }
    case 'source': {
      // light from 100 nm (below, air and every optic absorb) to 1 mm (beyond, radio: the RF palette's horns)
      const wl = e.mmw ? num(e.wavelength, 633) : Math.min(1e6, Math.max(100, num(e.wavelength, 633)));
      return Object.assign(base, {
        wavelength: wl,
        colourAuto: e.colourAuto !== false,
        colour: /^#[0-9a-f]{6}$/i.test(e.colour) ? e.colour : wavelengthColour(wl),
        width: Math.max(0, num(e.width, 4)),
        divergence: clamp(num(e.divergence, 0), -179, 179),
        ...(RAY_PATTERNS.some(([k]) => k === e.pattern) && e.pattern !== 'line' ? { pattern: e.pattern } : {}),
        gauss: e.gauss === true,
        w0: Math.max(1e-4, num(e.w0, 0.35)),
        z0: num(e.z0, 0),
        popN: [128, 256, 512, 1024].includes(+e.popN) ? +e.popN : 256,
        popModel: e.popModel === '2d' ? '2d' : 'auto',
        traceRays: e.traceRays !== false,
        pol: ['unpolarised', 's', 'p', 'linear'].includes(e.pol) ? e.pol : 'unpolarised',
        polAngle: num(e.polAngle, 45),
        lines: Array.isArray(e.lines) ? e.lines.map(Number).filter(v => isFinite(v) && v >= 100 && v <= 20000).slice(0, 12) : [],
        rays: Math.round(Math.min(501, Math.max(1, num(e.rays, 11)))),
        power: Math.max(0, num(e.power, 1)),                       // mW, for detectors and fibres
        coh: Math.max(0, num(e.coh, 0)),                           // coherence length, mm; 0 for a single frequency
        splitFrom: typeof e.splitFrom === 'string' && e.splitFrom ? e.splitFrom : null,   // the source this is split from
        splitPhase: num(e.splitPhase, 0), splitPath: num(e.splitPath, 0),               // degrees; mm of fibre
        lineshape: e.lineshape === 'gauss' ? 'gauss' : 'lorentz',
        // the coherence: from before there was a choice, a line when it had a coherence length
        cmode: CMODES.includes(e.cmode) ? e.cmode : num(e.coh, 0) > 0 ? 'line' : 'single',
        bw: Math.max(0.001, num(e.bw, 40)),                        // nm, FWHM, when broadband
        m2: Math.max(1, num(e.m2, 1)),                             // beam quality: 1 for a pure Gaussian
        tem: ['gauss', 'hg', 'lg'].includes(e.tem) ? e.tem : 'gauss',   // a higher-order mode: Hermite- or Laguerre-Gauss
        hm: Math.round(clamp(num(e.hm, 1), 0, 10)), hn: Math.round(clamp(num(e.hn, 0), 0, 10)),
        lp: Math.round(clamp(num(e.lp, 0), 0, 10)), ll: Math.round(clamp(num(e.ll, 1), -10, 10)),
        tau: Math.max(0, num(e.tau, 0)),                           // fs, a pulse's duration at its transform limit; 0 for continuous
        pshape: e.pshape === 'gauss' ? 'gauss' : 'sech2',
        rep: Math.max(0.001, num(e.rep, 80)),                      // MHz, pulses a second
        gdd0: num(e.gdd0, 0),                                      // fs^2, the chirp it leaves the laser with
        fibre: e.fibre && isFinite(e.fibre.core) && isFinite(e.fibre.na)
          ? { core: Math.max(0.5, +e.fibre.core), na: clamp(+e.fibre.na, 0.01, 0.9) } : undefined,
      });
    }
    case 'mirror':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25)),
        reflect: clamp(num(e.reflect, 100), 0, 100),
        offset: num(e.offset, 0),
        k: num(e.k, 0),
        R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
        gdd: num(e.gdd, 0),                            // fs^2 a reflection: a chirped mirror
        // its readouts of the light arriving, as a screen's
        mapScale: e.mapScale === 'log' ? 'log' : 'lin',
        vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
        mtfFreq: Math.max(0, num(e.mtfFreq, 50)),
      });
    case 'screen':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 25)), absorb: e.absorb !== false,
        ...(e.faceMap === true ? { faceMap: true } : {}),             // its diffraction pattern painted on its face in the 3D view
        R: (isFinite(e.R) && e.R !== 0 && e.R !== null) ? +e.R : null,
        binWidth: Math.max(0, num(e.binWidth, 0)),
        binInterp: e.binInterp !== false,
        mapScale: e.mapScale === 'log' ? 'log' : 'lin',
        vectorFocus: ['auto', 'on', 'off'].includes(e.vectorFocus) ? e.vectorFocus : 'auto',
        trap: e.trap in TRAP_ATOMS || e.trap === 'sphere' ? e.trap : 'none',   // an atom or a sphere to read an optical trap at this focus for
        trapF: ['lo', 'hi'].includes(e.trapF) ? e.trapF : 'avg',     // atoms: the ground hyperfine level (avg: the centroid)
        trapMat: glassKey(e.trapMat) || 'Fused silica',              // the sphere's material
        trapR: Math.max(1, num(e.trapR, 100)),                       // its radius, nm
        trapRho: Math.max(1, num(e.trapRho, SPHERE_DENSITY[glassKey(e.trapMat) || 'Fused silica'] || 2200)),   // kg/m^3
        trapMed: ['bench', 'vacuum', 'air'].includes(e.trapMed) ? e.trapMed : 'bench',
        trapP: Math.max(1e-12, num(e.trapP, 1013.25)),                // mbar, for air
        trapT: Math.max(0.001, num(e.trapT, 295)),                   // K, for the depth in kT
        mtfFreq: Math.max(0, num(e.mtfFreq, 50)),
        abSrc: typeof e.abSrc === 'string' ? e.abSrc : '',          // the source the Aberrations tab sweeps ('' the first)
        abAng: clamp(num(e.abAng, 2), 0, 60),                        // its largest field angle, degrees (a collimated source)
        abH: Math.max(0, num(e.abH, 1)),                             // or object height, mm (a diverging one)
        abN: Math.round(clamp(num(e.abN, 7), 3, 21)),                // fields across, -largest to +largest
        abRays: Math.round(clamp(num(e.abRays, 61), 11, 401)) | 1 });   // rays in each field's fan, odd
    case 'waveplate':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25.4)),
        retard: num(e.retard, 0.25),
        retardCustom: e.retardCustom === true || ![0.25, 0.5].includes(num(e.retard, 0.25)),
        axis: num(e.axis, 45),
      });
    case 'polariser':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25.4)),
        axis: num(e.axis, 0),
      });
    case 'mask':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25.4)),
        amp: typeof e.amp === 'string' && e.amp.trim() ? e.amp : '1',
        delay: typeof e.delay === 'string' && e.delay.trim() ? e.delay : '0',
        preset: typeof e.preset === 'string' ? e.preset : 'custom',
      });
    case 'stop':
      return Object.assign(base, {
        aperture: Math.max(0, num(e.aperture, 5)),
        outer: Math.max(0.2, num(e.outer, 25.4)),
        shape: STOP_SHAPES.some(s => s[0] === e.shape) ? e.shape : 'round',
        sep: Math.max(0, num(e.sep, 0.5)),             // a double slit's centre-to-centre separation
        pitch: Math.max(1e-6, num(e.pitch, 0.2)),      // a comb's slit-to-slit pitch
        count: Math.round(clamp(num(e.count, 5), 2, 400)),   // and its number of slits
        offset: num(e.offset, 0),                      // along the stop, from its centre
        height: Math.max(0, num(e.height, 0)),         // a slit's height out of the plane; 0 is unlimited
        side: e.side === -1 ? -1 : 1,                  // which side of its edge a knife covers
      });
    case 'cube':
      return Object.assign(base, {
        size: Math.max(0.1, num(e.size, 12.7)),
        mode: e.mode === 'pbs' ? 'pbs' : 'npbs',
        reflect: clamp(num(e.reflect, 50), 0, 100),
        reflectS: clamp(num(e.reflectS, 99), 0, 100),
        reflectP: clamp(num(e.reflectP, 1), 0, 100),
        material: normMat(e.material),
        coat: normCoat(e.coat),
        source: typeof e.source === 'string' ? e.source : undefined,
      });
    case 'prism':
      return Object.assign(base, {
        shape: PRISM_SHAPES[e.shape] ? e.shape : 'right',
        size: Math.max(0.1, num(e.size, 20)),
        thickness: Math.max(0.1, num(e.thickness, 5)),
        material: normMat(e.material),
        coat: normCoat(e.coat),
        source: typeof e.source === 'string' ? e.source : undefined,
      });
    case 'lens': {
      const surfaces = (Array.isArray(e.surfaces) && e.surfaces.length >= 2 ? e.surfaces : [{}, {}]).map(normSurface);
      const gaps = surfaces.slice(1).map((_, i) => Math.max(0, num(e.gaps && e.gaps[i], 3)));
      const materials = surfaces.slice(1).map((_, i) => normMat(e.materials && e.materials[i]));
      return Object.assign(base, {
        diameter: Math.max(0.1, num(e.diameter, 25.4)),
        surfaces, gaps, materials,
        cyl: e.cyl === 'plane' || e.cyl === 'out' ? e.cyl : undefined,    // cylindrical: power in the bench plane, or out of it
        source: typeof e.source === 'string' ? e.source : undefined,
      });
    }
    case 'grating':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25)),
        lpmm: clamp(num(e.lpmm, 600), 1, 10000),
        mode: e.mode === 'transmit' ? 'transmit' : 'reflect',
        blaze: clamp(num(e.blaze, 500), 100, 20000),
        eff: clamp(num(e.eff, 80), 0, 100),
      });
    case 'fibre':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 2.5)),       // the ferrule's face
        core: Math.max(0.5, num(e.core, 4.4)),           // core diameter, µm
        na: clamp(num(e.na, 0.12), 0.01, 0.9),
        emitRays: Math.round(clamp(num(e.emitRays, 5), 0, 51)),
        ...(RAY_PATTERNS.some(([k]) => k === e.emitPattern) && e.emitPattern !== 'line' ? { emitPattern: e.emitPattern } : {}),   // its rays across the beam, as a source's
        mm: e.mm === true,                               // multimode: takes light in by its core and NA, sends out a multimode beam
        absorb: true,
      });
    case 'detector':
      return Object.assign(base, {
        length: Math.max(0.01, num(e.length, 3.6)),      // active area's diameter
        material: DETECTOR_MATERIALS[e.material] ? e.material : 'si',
        resp: Math.max(0, num(e.resp, 0.5)),             // A/W, for a fixed responsivity
        gain: Math.max(0, num(e.gain, 1e4)),             // transimpedance, V/A
        bandwidth: Math.max(1, num(e.bandwidth, 1e6)),   // Hz
        dark: Math.max(0, num(e.dark, 1)),               // nA
        ampNoise: Math.max(0, num(e.ampNoise, 2)),       // input current noise, pA/rtHz
        vmax: Math.max(0.01, num(e.vmax, 10)),           // output swing, V
        demodF: Math.max(0, num(e.demodF, 0)),           // mixer frequency, MHz (0: none)
        demodPhase: num(e.demodPhase, 0),                // and its phase, degrees
        absorb: true,
      });
    case 'faraday':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 5)), rotation: num(e.rotation, 45) });
    case 'isolator':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 5)), axis: num(e.axis, 0), extinction: clamp(num(e.extinction, 40), 0, 80) });
    case 'crystal':
      return Object.assign(base, {
        shape: CRYSTAL_SHAPES[e.shape] ? e.shape : 'displacer',
        crystal: CRYSTALS[e.crystal] ? e.crystal : 'calcite',
        size: Math.max(0.1, num(e.size, 10)),
        length: Math.max(0.1, num(e.length, 10)),
        axisAngle: clamp(num(e.axisAngle, 45), -89, 89),
        wedge: clamp(num(e.wedge, 30), 5, 60),
      });
    case 'filter':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25)),
        ftype: FILTER_TYPES[e.ftype] ? e.ftype : 'longpass',
        edge: clamp(num(e.edge, 600), 100, 20000), slope: Math.max(0.1, num(e.slope, 10)),
        centre: clamp(num(e.centre, 550), 100, 20000), fwhm: Math.max(0.1, num(e.fwhm, 10)),
        od: clamp(num(e.od, 1), 0, 10), tmax: clamp(num(e.tmax, 95), 0, 100),
        reflect: e.reflect === true,
      });
    case 'link':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 25)), pair: String(e.pair || 'Link 1').slice(0, 60) });
    case 'aom':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 4)), rf: Math.max(0, num(e.rf, 80)), v: Math.max(1, num(e.v, 4200)),
        eff: clamp(num(e.eff, 80), 0, 100), order: num(e.order, 1) < 0 ? -1 : 1 });
    case 'eom':
      return Object.assign(base, { length: Math.max(0.1, num(e.length, 4)), fm: Math.max(0, num(e.fm, 20)), beta: Math.max(0, num(e.beta, 1.08)),
        emode: e.emode === 'amplitude' ? 'amplitude' : 'phase', bias: num(e.bias, 90), loss: Math.max(0, num(e.loss, 0)) });
    case 'fcomp': {
      const K = FC[e.kind];
      if (!K) return null;
      Object.assign(base, { kind: e.kind });
      for (const [k, , d] of K.params) base[k] = num(e[k], d);
      if (e.kind === 'laser') { base.pshape = e.pshape === 'gauss' ? 'gauss' : 'sech2'; base.tau = Math.max(0, base.tau); base.rep = Math.max(0.001, base.rep); base.lineshape = e.lineshape === 'gauss' ? 'gauss' : 'lorentz'; base.wavelength = clamp(base.wavelength, 100, 20000); base.power = Math.max(0, base.power); base.coh = Math.max(0, base.coh);
        // its polarisation: s, p, linear at polAngle from s, or circular; a file from before
        // there was a choice gave only the angle, which is s or p when it is one of them
        const a = ((base.polAngle % 360) + 360) % 360;
        base.pol = FIBRE_POLS.includes(e.pol) ? e.pol : e.led ? 'unpolarised' : a % 180 === 0 ? 's' : a % 180 === 90 ? 'p' : 'linear';
        // a fibre-coupled LED: a laser's ports and drives, broadband light, unpolarised to start with, never pulsed
        base.led = !!e.led;
        base.cmode = base.led ? 'broad' : CMODES.includes(e.cmode) ? e.cmode : base.coh > 0 ? 'line' : 'single';
        base.bw = Math.max(0.001, num(e.bw, 40));
        if (base.led) base.tau = 0; }
      if (e.kind === 'thru') base.pair = String(e.pair || 'Feedthrough 1').slice(0, 60);
      if (e.kind === 'pd') { base.balanced = !!e.balanced; base.cmrr = Math.max(0, num(e.cmrr, 30)); }
      if (e.kind === 'switch') base.cross = base.cross >= 0.5 ? 1 : 0;
      if (e.kind === 'amp') { base.soa = !!e.soa; base.pdg = Math.max(0, num(e.pdg, 0.5)); }
      if (e.kind === 'star') { base.ins = Math.round(clamp(base.ins, 1, 32)); base.outs = Math.round(clamp(base.outs, 1, 32)); }
      if (e.kind === 'depol') base.dgd = Math.max(0, base.dgd);
      if (e.kind === 'split') { base.ways = Math.round(clamp(base.ways, 2, 64)); base.loss = Math.max(0, base.loss); base.combine = !!e.combine; }
      if (e.kind === 'eom') base.emode = e.emode === 'amplitude' ? 'amplitude' : 'phase';
      // a fibre photodetector's material, as a free-space one's; a file from before there was one keeps its fixed responsivity
      if (e.kind === 'pd') base.material = DETECTOR_MATERIALS[e.material] ? e.material : 'custom';
      return base;
    }
    case 'draw': return normDraw(e, base);
    case 'pic': return PIC.norm(e, base);                                                    // PIC hook
    case 'elec': return ELEC.norm(e, base);                                                  // ELEC hook
    case 'chopper': return ELEC.normChopper(e, base);                                        // ELEC hook
    case 'nlc':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 3)),              // aperture across, mm
        nlLen: clamp(num(e.nlLen, 20), 0.1, 200),             // along the beam, mm
        material: NLC[e.material] ? e.material : 'ppln',
        period: Math.max(0, num(e.period, 0)),                // poling period, um; 0: the best for the beam through it
        temp: clamp(num(e.temp, 40), -50, 250),               // deg C
        axis: e.axis === 'p' ? 'p' : 's',                     // the crystal's z axis: out of the bench plane (s) or in it (p)
        faces: e.faces === 'bare' ? 'bare' : 'ar',            // its end faces: anti-reflection coated (0.1%) or bare
      });
    case 'cell':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 25)),            // window diameter, mm
        cellLen: Math.max(1, num(e.cellLen, 75)),            // along the beam, mm
        atom: ATOMS[e.atom] ? e.atom : 'Rb',
        line: e.line === 'D1' ? 'D1' : 'D2',
        temp: clamp(num(e.temp, 25), -20, 250),              // deg C
        bField: clamp(num(e.bField, 0), -20000, 20000),      // gauss, along the cell's axis (+x of its frame)
      });
    case 'gain':
      return Object.assign(base, {
        length: Math.max(0.1, num(e.length, 6)),
        g0: clamp(num(e.g0, 1.2), 0, 1000),
        isat: Math.max(0, num(e.isat, 2.9)),                // saturation intensity, kW/cm^2 (Nd:YAG 2.9); 0: it does not saturate
        centre: clamp(num(e.centre, 1064), 100, 20000), fwhm: Math.max(0.01, num(e.fwhm, 30)),
      });
  }
  return null;
}

/* the RF palette's parts: horns, and the optics of millimetre-wave benches (each an ordinary part,
   marked as the palette's, with its sizes and materials) */
function rfMake(kind, x, y) {
  const rf = { part: true };
  switch (kind) {
    case 'horn': return normElement({ type: 'source', name: nextName('Horn'), x, y, angle: 0, rays: 3, mmw: { kind: 'corrugated', ghz: 100, dbm: 0, a: 7.5, L: 60 } });
    case 'rx': return normElement({ type: 'detector', name: nextName('Receiver'), x, y, angle: 180, material: 'custom', resp: 0.5, gain: 1e4, mmw: { kind: 'corrugated', a: 7.5, L: 60 } });
    case 'lens': return normElement({ type: 'lens', name: nextName('RF lens'), x, y, diameter: 100, surfaces: [{ R: 78.9 }, { R: null }], gaps: [22], materials: [{ glass: 'HDPE' }], mmw: rf });
    case 'mirror': return normElement({ type: 'mirror', name: nextName('Flat mirror'), x, y, angle: 135, length: 100, mmw: rf });
    case 'fmirror': return normElement({ type: 'mirror', name: nextName('Focusing mirror'), x, y, angle: 180, length: 100, R: 300, mmw: rf });
    case 'grid': return normElement({ type: 'polariser', name: nextName('Wire grid'), x, y, angle: 0, axis: 0, length: 100, mmw: rf });
    case 'bs': return normElement({ type: 'mirror', name: nextName('Film beam splitter'), x, y, angle: 135, length: 100, reflect: 50, mmw: rf });
    case 'load': return normElement({ type: 'screen', name: nextName('Absorber load'), x, y, angle: 180, length: 50, mmw: rf });
  }
  return null;
}
export function makeElement(kind, x, y) {
  if (kind.startsWith('rf:')) return rfMake(kind.slice(3), x, y);
  if (kind.startsWith('pic:')) return PIC.make(kind.slice(4), x, y);                         // PIC hook
  if (kind.startsWith('elec:')) return ELEC.make(kind.slice(5), x, y);                       // ELEC hook (and the chopper, a free-space part made there)
  switch (kind) {
    case 'source':
      return normElement({ type: 'source', name: nextName('Source'), x, y, wavelength: 633, width: 4, divergence: 0, rays: 11 });
    case 'mirror':
      return normElement({ type: 'mirror', name: nextName('Mirror'), x, y, angle: 135, length: 25.4 });
    case 'screen':
      return normElement({ type: 'screen', name: nextName('Screen'), x, y, angle: 180, length: 25.4 });
    case 'waveplate':
      return normElement({ type: 'waveplate', name: nextName('Waveplate'), x, y, angle: 0, retard: 0.25, axis: 45 });
    case 'polariser':
      return normElement({ type: 'polariser', name: nextName('Polariser'), x, y, angle: 0, axis: 0 });
    case 'stop':
      return normElement({ type: 'stop', name: nextName('Stop'), x, y, angle: 0, aperture: 5, outer: 25.4 });
    case 'mask':
      return normElement({ type: 'mask', name: nextName('Mask'), x, y, angle: 0, amp: '1', delay: '0', preset: 'clear' });
    case 'cube':
      return normElement({ type: 'cube', name: nextName('Beam splitter'), x, y, size: 12.7, reflect: 50, material: { glass: 'N-BK7' } });
    case 'prism':
      return normElement({ type: 'prism', name: nextName('Prism'), x, y, shape: 'right', size: 20, material: { glass: 'N-BK7' } });
    case 'lens':
      return normElement({ type: 'lens', name: nextName('Lens'), x, y, diameter: 25.4,
        surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] });
    case 'asphere':
      return normElement({ type: 'lens', name: nextName('Asphere'), x, y, diameter: 12.7,
        surfaces: [{ R: 8.2, k: -0.9 }, { R: null }], gaps: [5], materials: [{ glass: 'S-LAH64' }] });
    case 'cylinder':
      return normElement({ type: 'lens', name: nextName('Cylindrical lens'), x, y, diameter: 25.4, cyl: 'plane',
        surfaces: [{ R: 25.8 }, { R: null }], gaps: [5], materials: [{ glass: 'N-BK7' }] });
    case 'axicon':
      return normElement({ type: 'lens', name: nextName('Axicon'), x, y, diameter: 25.4,
        surfaces: [{ R: null, odd: [Math.tan(10 * deg)] }, { R: null }], gaps: [5], materials: [{ glass: 'Fused silica' }] });
    case 'grating':
      return normElement({ type: 'grating', name: nextName('Grating'), x, y, angle: 180, length: 25, lpmm: 600, blaze: 500 });
    case 'fibre':
      return normElement({ type: 'fibre', name: nextName('Fibre'), x, y, angle: 180 });
    case 'detector':
      return normElement({ type: 'detector', name: nextName('Detector'), x, y, angle: 180 });
    case 'faraday':
      return normElement({ type: 'faraday', name: nextName('Faraday rotator'), x, y, angle: 0 });
    case 'isolator':
      return normElement({ type: 'isolator', name: nextName('Isolator'), x, y, angle: 0 });
    case 'crystal':
      return normElement({ type: 'crystal', name: nextName('Crystal'), x, y, angle: 0, shape: 'displacer' });
    case 'filter':
      return normElement({ type: 'filter', name: nextName('Filter'), x, y, angle: 0 });
    case 'gain':
      return normElement({ type: 'gain', name: nextName('Gain medium'), x, y, angle: 0 });
    case 'cell':
      return normElement({ type: 'cell', name: nextName('Vapour cell'), x, y, angle: 0 });
    case 'nlc':
      return normElement({ type: 'nlc', name: nextName('Nonlinear crystal'), x, y, angle: 0 });
    case 'aom':
      return normElement({ type: 'aom', name: nextName('AOM'), x, y, angle: 0 });
    case 'eom':
      return normElement({ type: 'eom', name: nextName('EOM'), x, y, angle: 0 });
    case 'splitter': case 'combiner':
      return normElement({ type: 'fcomp', kind: 'split', combine: kind === 'combiner', name: nextName(kind === 'combiner' ? 'Combiner' : 'Splitter'), x, y, angle: 0, ways: 4 });
    case 'led':
      return normElement({ type: 'fcomp', kind: 'laser', led: true, name: nextName('LED'), x, y, angle: 0, wavelength: 1550, bw: 40, power: 0.1, pol: 'unpolarised' });
    case 'bpd':
      return normElement({ type: 'fcomp', kind: 'pd', balanced: true, material: 'ingaas', name: nextName('Balanced detector'), x, y, angle: 0 });
    case 'soa':
      return normElement({ type: 'fcomp', kind: 'amp', soa: true, name: nextName('SOA'), x, y, angle: 0, g0: 25, psat: 10, nf: 8, centre: 1550, bw: 60, iso: 0, pdg: 0.5 });
    case 'pbs': case 'fmir': case 'switch': case 'delay': case 'stretch': case 'tbf': case 'osa': case 'depol': case 'star':
    case 'fcomp': case 'laser': case 'coupler': case 'wdm': case 'circ': case 'iso': case 'voa': case 'pc': case 'pol': case 'fm': case 'fbg': case 'term': case 'pd': case 'thru':
    case 'amp': case 'faom': case 'feom': {
      if (kind === 'faom') kind = 'aom'; else if (kind === 'feom') kind = 'eom';
      const k = FC[kind] ? kind : 'coupler', used = new Set(project.elements.filter(e => e.kind === 'thru').map(e => e.pair));
      let n = 1; while (used.has('Feedthrough ' + n)) n++;
      return normElement(Object.assign({ type: 'fcomp', kind: k, name: nextName(FC[k].label), x, y, angle: 0, pair: 'Feedthrough ' + n }, k === 'pd' ? { material: 'ingaas' } : {}));
    }
    case 'link': {
      // a new pair's name: the first "Link n" not in use
      const used = new Set(project.elements.filter(e => e.type === 'link').map(e => e.pair));
      let n = 1; while (used.has('Link ' + n)) n++;
      return normElement({ type: 'link', name: nextName('Link plane'), x, y, angle: 0, length: 25, pair: 'Link ' + n });
    }
  }
}

export function demoProject() {
  const p = { name: 'Untitled bench', view: { cx: 5, cy: 8, scale: 6 }, snap: 1, maxBounces: 200, minPower: 0.1, ghosts: false, library: [], elements: [] };
  setProject(p);
  p.elements.push(
    normElement({ type: 'source', name: 'HeNe 633 nm', x: -60, y: 0, angle: 0, wavelength: 632.8, width: 10, divergence: 0, rays: 15 }),
    normElement({ type: 'lens', name: 'f = 50 mm biconvex', x: 0, y: 0, angle: 0, diameter: 25.4,
      surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }] }),
    normElement({ type: 'mirror', name: 'Fold mirror', x: 25, y: 0, angle: 135, length: 25.4 }),
    normElement({ type: 'screen', name: 'Screen', x: 25, y: 26.2, angle: -90, length: 12 }),
  );
  return ensureBenches(p);
}

/* How the bench shows its light, for every source alike: rays or not, and Gaussian beams as
   their envelope, as their diffracted field, or not at all, with the field's intensity scale.
   (Older benches set this source by source: a bench with any source showing its field shows
   every beam's field.) */
/* how many decades a log scale of the field spans: 0 for linear, 3 (30 dB) or 6 (60 dB) */
export const fieldDec = sc => sc === 'log60' ? 6 : sc === 'log' ? 3 : 0;
function normLight(L, els) {
  L = L && typeof L === 'object' ? L : null;
  const any = k => (els || []).some(e => e && (e.beamView === k || e.emitView === k));
  // a bench saved with one choice for its beams (envelope, field or none) takes the same picture
  const was = L && ['envelope', 'field', 'none'].includes(L.beams) ? L.beams : null;
  return {
    rays: L ? L.rays !== false : true,
    envelope: L && typeof L.envelope === 'boolean' ? L.envelope : was ? was !== 'none' : true,
    field: L && typeof L.field === 'boolean' ? L.field : was ? was === 'field' : any('field'),
    scale: L && (L.scale === 'log' || L.scale === 'log60' || L.scale === 'lin') ? L.scale : (els || []).some(e => e && e.beamView === 'field' && e.beamScale === 'log') ? 'log' : 'lin',
  };
}
export const lightOf = () => (project && project.light) || (project && (project.light = normLight(null, project.elements))) || { rays: true, envelope: true, field: false, scale: 'lin' };
export function serialize() {
  return {
    format: FORMAT, version: VERSION,
    name: project.name,
    saved: new Date().toISOString(),
    view: project.view, snap: project.snap, maxBounces: project.maxBounces, minPower: project.minPower, ghosts: project.ghosts, light: lightOf(),
    library: project.library || [],
    cavityLock: project.cavityLock || {},
    benches: project.benches, tab: project.tab,
    elements: project.elements,
    fibres: project.fibres || [],
    measures: project.measures || [],
    notes: project.notes || '',
    ...(project.labelMm > 0 ? { labelMm: project.labelMm } : {}),
    ...(project.elements.some(e => e.mod) ? { mods: modsCarried() } : {}),
    ...(project.style && (project.style.bg || project.style.holes === false) ? { style: project.style } : {}),
  };
}

export function loadProject(data) {
  try { V3D.reset(); } catch (e) { /* not set up yet */ }        // another project: back to 2D, its views forgotten
  setLoadGen(loadGen + 1);
  if (!data || typeof data !== 'object') throw new Error('The file is not a ray tracer project.');
  if (data.format !== FORMAT) throw new Error('This file is not a .jekray project.');
  if (data.version > VERSION) throw new Error('This project was saved by a newer version of the ray tracer.');
  if (!Array.isArray(data.elements)) throw new Error('The project has no element list.');
  const p = {
    name: String(data.name || 'Untitled bench'),
    view: {
      cx: num(data.view && data.view.cx, 0), cy: num(data.view && data.view.cy, 0),
      scale: Math.min(ZOOM_MAX, Math.max(0.05, num(data.view && data.view.scale, 4))),
    },
    snap: num(data.snap, 1),
    maxBounces: Math.round(Math.min(100000, Math.max(1, num(data.maxBounces, 200)))),
    ghosts: data.ghosts === true,
    light: normLight(data.light, data.elements),
    minPower: Math.min(50, Math.max(1e-6, num(data.minPower, 0.1))),
    library: (Array.isArray(data.library) ? data.library : []).map(normMat).filter(m => m.table),
    cavityLock: data.cavityLock && typeof data.cavityLock === 'object' ? Object.fromEntries(Object.entries(data.cavityLock).filter(([, v]) => v === 'lock' || v === 'built')) : {},
    elements: [],
    mods: normCarried(data.mods),                  // the code of the mods its parts use: kept, never run from here
  };
  setProject(p);
  for (const e of data.elements) { const n = normElement(e); if (n) p.elements.push(n); }
  if (Array.isArray(data.benches) && data.benches.length) {
    const vw = v => ({ cx: num(v && v.cx, 0), cy: num(v && v.cy, 0), scale: Math.min(ZOOM_MAX, Math.max(0.05, num(v && v.scale, 4))) });
    p.benches = data.benches.filter(b => b && typeof b.id === 'string').map((b, i) => ({ id: b.id, name: String(b.name || 'Bench ' + (i + 1)).slice(0, 40), view: vw(b.view) }));
    p.tab = data.tab;
  } else p.benches = [{ id: 'b1', name: 'Bench 1', view: p.view }];
  ensureBenches(p);
  p.fibres = normFibres(data.fibres, p.elements);
  p.measures = normMeasures(data.measures, p.benches);
  p.notes = typeof data.notes === 'string' ? data.notes.slice(0, 20000) : '';
  if (isFinite(data.labelMm) && data.labelMm > 0) p.labelMm = clamp(+data.labelMm, 1e-6, 1e4);     // parts' names, mm high
  // the bench's colour and its holes (View › Bench colour)
  const st = data.style && typeof data.style === 'object' ? data.style : {};
  p.style = {};
  if (typeof st.bg === 'string' && /^#[0-9a-f]{6}$/i.test(st.bg)) p.style.bg = st.bg.toLowerCase();
  if (st.holes === false) p.style.holes = false;
  requestAnimationFrame(() => benchStyleShown());      // after the page is set up, on first load
  return p;
}
/* Rulers and angles left on the bench: points, and for those on a beam its direction there */
function normMeasures(list, benches) {
  const ids = new Set(benches.map(b => b.id)), out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || (m.type !== 'ruler' && m.type !== 'angle') || !ids.has(m.bench) || !Array.isArray(m.pts) || m.pts.length !== (m.type === 'ruler' ? 2 : 3)) continue;
    const pts = m.pts.map(q => {
      if (!q || !isFinite(q.x) || !isFinite(q.y)) return null;
      const o = { x: +q.x, y: +q.y };
      if (isFinite(q.dx) && isFinite(q.dy) && q.beam !== undefined) Object.assign(o, { beam: 0, dx: +q.dx, dy: +q.dy });
      return o;
    });
    if (pts.every(Boolean)) out.push({ type: m.type, bench: m.bench, pts });
  }
  return out;
}
/* Fibres: port to port, each port taking one; length in m, loss in dB/km */
function normFibres(list, els) {
  const byId = new Map(els.map(e => [e.id, e])), used = new Set(), out = [];
  const nPorts = e => (e.type === 'fcomp' ? (FC[e.kind] ? fcPortsOf(e).length : 0) : e.type === 'fibre' ? 1 : e.type === 'pic' ? PIC.ports(e).length : e.type === 'elec' ? (ELEC.KINDS[e.kind] ? ELEC.ports(e).length : 0) : 0) + (e.type !== 'elec' ? ELEC.extra(e).length : 0);
  // ELEC hook: an electrical port's direction, for wires
  const dir = x => { const e = byId.get(x[0]), P = !e ? null : e.type === 'elec' ? (ELEC.KINDS[e.kind] ? ELEC.ports(e)[x[1]] : null) : portsOf(e)[x[1]]; return P && P.elec || null; };
  const end = x => Array.isArray(x) && byId.has(String(x[0])) && (x[1] | 0) >= 0 && (x[1] | 0) < nPorts(byId.get(String(x[0]))) ? [String(x[0]), x[1] | 0] : null;
  for (const F of Array.isArray(list) ? list : []) {
    let a = F && end(F.a), b = F && end(F.b);
    // a wire: from an output to an input, one wire to an input, any number from an output
    if (a && b && (dir(a) || dir(b))) {
      if (!dir(a) || !dir(b) || (dir(a) === dir(b) && dir(a) !== 'io')) continue;
      if (dir(a) === 'in' || dir(b) === 'out') [a, b] = [b, a];
      if (used.has(pkey(...b))) continue;
      used.add(pkey(...b));
      const pt = v => Array.isArray(v) && v.length === 2 && v.every(isFinite) ? [+v[0], +v[1]] : [0, 0];
      const path = Array.isArray(F.path) ? F.path.filter(n => n && isFinite(n.x) && isFinite(n.y)).map(n => ({ x: +n.x, y: +n.y, h1: pt(n.h1), h2: pt(n.h2) })) : [];
      out.push({ id: typeof F.id === 'string' ? F.id : uid(), a, b, wire: true, path });
      continue;
    }
    if (!a || !b || used.has(pkey(...a)) || used.has(pkey(...b)) || pkey(...a) === pkey(...b)) continue;
    used.add(pkey(...a)); used.add(pkey(...b));
    const pt = v => Array.isArray(v) && v.length === 2 && v.every(isFinite) ? [+v[0], +v[1]] : [0, 0];
    const path = Array.isArray(F.path) ? F.path.filter(n => n && isFinite(n.x) && isFinite(n.y)).map(n => ({ x: +n.x, y: +n.y, h1: pt(n.h1), h2: pt(n.h2) })) : [];
    out.push({ id: typeof F.id === 'string' ? F.id : uid(), a, b, len: Math.max(0, num(F.len, 1)), loss: Math.max(0, num(F.loss, 0.2)),
      disp: F.disp !== null && F.disp !== undefined && isFinite(F.disp) ? +F.disp : null,
      gamma: F.gamma !== null && F.gamma !== undefined && isFinite(F.gamma) && +F.gamma >= 0 ? +F.gamma : null,    // 1/(W km); null: from n2 and the mode area
      // what it does to polarisation: kept (an ideal fibre held still), random (standard fibre as
      // laid: a fixed but unknown birefringence, drifting with wavelength), pm (polarisation
      // maintaining, key at an angle to s, with its beat length and extinction ratio), or mm
      // (multimode: scrambled)
      ftype: ['smf', 'random', 'pm', 'mm'].includes(F.ftype) ? F.ftype : 'smf',
      // its ends: spliced (no reflection), or connectors: PC, APC, or a flat cleave
      conn: CONNS[F.conn] ? F.conn : 'splice',
      key: num(F.key, 0), beat: Math.max(0.1, num(F.beat, 4)), per: clamp(num(F.per, 25), 0, 60), seed: Math.round(num(F.seed, 1)),
      path, ta: isFinite(F.ta) && F.ta !== null ? Math.max(0, +F.ta) : null, tb: isFinite(F.tb) && F.tb !== null ? Math.max(0, +F.tb) : null,
      wg: F.wg ? PIC.normWg(F.wg) : undefined });                                            // PIC hook: a waveguide on a chip
  }
  return out;
}

export let VSRC = new Map();                  // the sources fibre tips make, by id (see tipSources)
export function setVSRC(v) { return (VSRC = v); }
export const FIBRE_COLOUR = '#e86fa6';        // fibres and fibre ports, rose: yellow is the electronics'
export const getEl = id => project.elements.find(e => e.id === id) || VSRC.get(id);
/* every source: those on the benches, and those fibre tips make */
export const allSources = () => project.elements.filter(e => e.type === 'source').concat([...VSRC.values()]);
export const selected = () => selectedId ? getEl(selectedId) : null;

