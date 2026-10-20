import { clamp } from '../core/constants.js';
import { CMODES } from '../core/pulses.js';
import { wavelengthColour } from '../core/colour.js';
import { nextName, num } from '../state/project.js';
import { RAY_PATTERNS } from '../engines/trace.js';

/* Source: A light source: a fan of rays and, with "gauss": true, a Gaussian beam whose diffracted field can be shown. */
export const SOURCE = {
  type: 'source', label: 'Source',
  picker: [{ key: 'source', short: 'Source' }],
  keys: ['source'],
  make: (x, y) => ({ type: 'source', name: nextName('Source'), x, y, wavelength: 633, width: 4, divergence: 0, rays: 11 }),
  norm(e, base) {
    const wl = e.mmw ? num(e.wavelength, 633) : Math.min(1e6, Math.max(100, num(e.wavelength, 633)));
    return Object.assign(base, {
      wavelength: wl,
      colourAuto: e.colourAuto !== false,
      colour: /^#[0-9a-f]{6}$/i.test(e.colour) ? e.colour : wavelengthColour(wl),
      width: Math.max(0, num(e.width, 4)),
      // the soft edge of the fan's field, mm: the 10-90% rise of its uniform top-hat; automatic (core/fan-edge.js) unless set
      edgeAuto: e.edgeAuto !== false,
      edge: Math.max(0, num(e.edge, 0)),                        // used only when not automatic; the panel shows the automatic one
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
  },
  guide: {
    what: 'A light source: a fan of rays and, with "gauss": true, a Gaussian beam whose diffracted field can be shown.',
    angle: 'the direction the light leaves in (0 = travelling +x).',
    fields: {
    wavelength: 'nm, 100 to 1000000 (1 mm); longer waves come from an RF feed horn (mmw).', width: 'mm: the full width of the ray fan (follows the beam when gauss is true).', edgeAuto: 'true (the default) sets edge for the field grid: 8% of the width at popN 256, in proportion to 256/popN; false keeps edge as given.', edge: 'mm: without gauss, the field of the fan is a uniform top-hat of its width whose edge rises over this distance (10% to 90%); 0 is a hard edge.',
    divergence: 'degrees, full angle of the fan; negative converges.', rays: 'number of rays in the fan, 1 to 501 (use 1 to 11 with gauss).',
    gauss: 'true for a Gaussian beam: then set w0 and z0.', w0: 'mm: the 1/e² waist radius.', z0: 'mm: how far ahead of the source the waist is (negative: behind it).',
    m2: 'beam quality M² ≥ 1.', tem: '"gauss" (TEM00), "hg" (a Hermite–Gauss mode HG_mn) or "lg" (a Laguerre–Gauss mode LG_pl, a vortex of charge l when l ≠ 0), built on a Gaussian of waist w0; a higher-order mode uses the 2D field model and ignores m2.', hm: 'HG m: nodes across the beam in the bench plane, 0–10.', hn: 'HG n: nodes out of the bench plane, 0–10.', lp: 'LG p: radial order (rings), 0–10.', ll: 'LG l: vortex charge, −10 to 10; its phase is a delay of l·theta/2π waves, as a vortex mask of charge l writes it.',
    popN: 'grid points for the field: 128, 256, 512 or 1024.', popModel: '"auto" (round when it can be) or "2d".',
    traceRays: 'false hides the ray fan.', pol: '"unpolarised", "s" (out of the bench plane), "p" (in the plane) or "linear" (then polAngle).',
    polAngle: 'degrees from p, for pol "linear".', lines: 'extra wavelengths in nm, up to 12.', power: 'mW.',
    coh: 'coherence length in mm, with cmode "line"; 0 for a single frequency.', lineshape: '"lorentz" or "gauss": the laser line’s shape, with coh.',
    cmode: '"single" (one frequency: every path interferes), "line" (a line of its own, from coh and lineshape) or "broad" (incoherent, broadband light of bandwidth bw: only near-equal paths interfere).',
    bw: 'bandwidth in nm (FWHM), with cmode "broad": the coherence length is wavelength² / bw.',
    splitFrom: 'id of another source this one is split from (same laser, so they interfere); null for a laser of its own.',
    splitPhase: 'degrees of phase against the source it is split from.', splitPath: 'mm of extra fibre before this launch, against the other.',
    fibre: 'optional {"core": µm, "na": NA}: a launch from a single-mode fibre, which sets w0 and z0 itself.',
    tau: 'fs: a mode-locked laser’s pulse duration (intensity FWHM at its transform limit); 0 for a continuous laser. Its bandwidth then sets coh.',
    pshape: '"sech2" or "gauss": the pulse’s shape.', rep: 'MHz: the repetition rate (power is the average power).',
    gdd0: 'fs²: the chirp the pulse leaves the laser with (0 at its transform limit).',
  },
  },
};
