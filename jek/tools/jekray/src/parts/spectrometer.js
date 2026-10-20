import { nextName, num } from '../state/project.js';

/* Spectrometer: a free-space spectrometer: light through its entrance (a slit, or a fibre's core) is spread by wavelength across a
   detector array and read pixel by pixel. Its resolution follows from its range, its array and its entrance width; its counts from
   the light through the entrance, the sensor's quantum efficiency and the integration time. The presets are kinds of instrument. */
export const SPEC_SENSORS = {
  si: { name: 'Silicon CCD (back-thinned)', wl: [200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1150], qe: [0.3, 0.42, 0.5, 0.62, 0.85, 0.9, 0.86, 0.66, 0.4, 0.14, 0.02, 0] },
  ingaas: { name: 'InGaAs array', wl: [850, 900, 1000, 1100, 1300, 1500, 1600, 1650, 1700, 1750], qe: [0.04, 0.6, 0.75, 0.8, 0.82, 0.85, 0.85, 0.75, 0.4, 0.02] },
  ingaasx: { name: 'Extended InGaAs array', wl: [1000, 1100, 1300, 1600, 1900, 2200, 2400, 2500, 2550], qe: [0.35, 0.55, 0.7, 0.75, 0.75, 0.7, 0.55, 0.15, 0.02] },
};
// the kinds of instrument: each sets every field but the entrance's place on the bench
export const SPEC_PRESETS = {
  compact: { name: 'Compact, UV to near-infrared', wmin: 200, wmax: 1100, pixels: 2048, pitch: 14, entrance: 'slit', slit: 25, slitH: 1, core: 400, na: 0.13, sensor: 'si', tint: 10, well: 60000, read: 30, dark: 50 },
  hires: { name: 'High resolution, visible', wmin: 550, wmax: 650, pixels: 3648, pitch: 8, entrance: 'slit', slit: 10, slitH: 1, core: 200, na: 0.1, sensor: 'si', tint: 50, well: 100000, read: 20, dark: 30 },
  fibrevis: { name: 'Fibre-coupled, visible', wmin: 350, wmax: 1000, pixels: 2048, pitch: 14, entrance: 'fibre', slit: 50, slitH: 1, core: 50, na: 0.22, sensor: 'si', tint: 10, well: 60000, read: 30, dark: 50 },
  nir: { name: 'Near-infrared', wmin: 900, wmax: 1700, pixels: 512, pitch: 25, entrance: 'slit', slit: 25, slitH: 1, core: 400, na: 0.22, sensor: 'ingaas', tint: 5, well: 5e6, read: 500, dark: 2e5 },
  swir: { name: 'Short-wave infrared, extended', wmin: 1000, wmax: 2500, pixels: 256, pitch: 50, entrance: 'slit', slit: 50, slitH: 1, core: 400, na: 0.22, sensor: 'ingaasx', tint: 2, well: 1e7, read: 800, dark: 5e6 },
};
const ENTRANCES = ['slit', 'fibre'];
// what makes the kind: the integration time is how it is run, not what it is, so it is left out
const PRESET_KEYS = Object.keys(SPEC_PRESETS.compact).filter(k => k !== 'name' && k !== 'tint');
/* the preset an instrument's values are, or 'custom' once any differs */
export const specPresetOf = el => Object.keys(SPEC_PRESETS).find(k => PRESET_KEYS.every(f => SPEC_PRESETS[k][f] === el[f])) || 'custom';
export const SPEC_W = 24, SPEC_L = 60;          // mm: its face across the bench, and its body behind the face

export const SPECTROMETER = {
  type: 'spectrometer', label: 'Spectrometer',
  picker: [{ key: 'spectrometer', short: 'Spectrometer' }],
  keys: ['spectrometer'],
  make: (x, y) => Object.assign({ type: 'spectrometer', name: nextName('Spectrometer'), x, y, angle: 180, preset: 'compact' }, SPEC_PRESETS.compact),
  norm(e, base) {
    const P = SPEC_PRESETS[e.preset] || null, d = P || SPEC_PRESETS.compact;
    const wmin = Math.max(100, num(e.wmin, d.wmin)), wmax = Math.max(wmin + 1, num(e.wmax, d.wmax));
    const o = Object.assign(base, {
      length: SPEC_W,                                                                 // its face across the bench, mm
      entrance: ENTRANCES.includes(e.entrance) ? e.entrance : d.entrance,              // a slit, or a fibre's core
      slit: Math.max(1, num(e.slit, d.slit)),                                          // slit width, µm
      slitH: Math.max(0.01, num(e.slitH, d.slitH)),                                    // slit height, mm
      core: Math.max(1, num(e.core, d.core)),                                          // a fibre entrance's core diameter, µm
      na: Math.min(0.9, Math.max(0.01, num(e.na, d.na))),                              // the light it takes in: NA
      wmin, wmax,                                                                      // nm, its range across the array
      pixels: Math.round(Math.min(16384, Math.max(16, num(e.pixels, d.pixels)))),
      pitch: Math.max(1, num(e.pitch, d.pitch)),                                       // µm
      sensor: SPEC_SENSORS[e.sensor] ? e.sensor : d.sensor,
      tint: Math.max(0.001, num(e.tint, d.tint)),                                      // integration time, ms
      well: Math.max(100, num(e.well, d.well)),                                        // full well, electrons
      read: Math.max(0, num(e.read, d.read)),                                          // read noise, electrons rms
      dark: Math.max(0, num(e.dark, d.dark)),                                          // dark current, electrons per second per pixel
      absorb: true,
    });
    o.preset = specPresetOf(o);
    return o;
  },
  zHalf: () => SPEC_W / 2,
  zSquare: true,
  guide: {
    what: 'A free-space spectrometer: the light through its entrance (a slit, or a fibre core) is spread by wavelength over a detector array. Its Spectrum tab plots counts against wavelength, with the peak, its width, the resolution, the throughput and the signal-to-noise. "preset" picks a kind of instrument and sets the rest; any field given as well overrides it (and makes it "custom", except the integration time, which is how it is run, not what it is).',
    angle: 'the direction its entrance faces: towards the light arriving (180 for light travelling +x).',
    fields: { length: 'mm: its face across the bench, fixed.', preset: '"compact" (200 to 1100 nm, silicon CCD), "hires" (550 to 650 nm), "fibrevis" (350 to 1000 nm, fibre entrance), "nir" (900 to 1700 nm, InGaAs), "swir" (1000 to 2500 nm, extended InGaAs) or "custom".',
      entrance: '"slit" or "fibre".', slit: 'µm: the slit’s width, across the bench; it sets the resolution with the array.', slitH: 'mm: the slit’s height.', core: 'µm: a fibre entrance’s core diameter.',
      na: 'the largest NA of light it takes in.', wmin: 'nm: the shortest wavelength on the array.', wmax: 'nm: the longest.', pixels: 'the array’s pixels.', pitch: 'µm: the pixel pitch.',
      sensor: '"si", "ingaas" or "ingaasx".', tint: 'ms: integration time.', well: 'electrons: full well.', read: 'electrons rms: read noise.', dark: 'electrons per second per pixel.' },
  },
};
