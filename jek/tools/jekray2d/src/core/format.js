import { C_NM_GHZ } from './rf.js';



export const fmtGHz = nm => { const f = C_NM_GHZ / nm; return f >= 1000 ? +(f / 1000).toPrecision(4) + ' THz' : +f.toPrecision(4) + ' GHz'; };

/* a wavelength as a readout says it: in nm, or for an RF beam as its frequency */
export const fmtWl = nm => nm > 1e5 ? fmtGHz(nm) : nm + ' nm';

export const fmtDbm = mw => mw > 0 ? (10 * Math.log10(mw)).toFixed(2) + ' dBm' : '\u2212\u221e dBm';

export const fmtTime = t => t >= 60 ? (+(t / 60).toPrecision(3)) + ' min' : t >= 1 ? (+t.toPrecision(3)) + ' s' : t >= 1e-3 ? (+(t * 1e3).toPrecision(3)) + ' ms' : t >= 1e-6 ? (+(t * 1e6).toPrecision(3)) + ' µs' : (+(t * 1e9).toPrecision(3)) + ' ns';

export function fmtNum(v) {
  if (v === null || v === undefined || !isFinite(v)) return '';
  return String(+(+v).toPrecision(8));
}

export function fmtFreq(hz) {
  if (!isFinite(hz)) return '∞';
  if (hz >= 1e9) return (+(hz / 1e9).toPrecision(4)) + ' GHz';
  if (hz >= 1e6) return (+(hz / 1e6).toPrecision(4)) + ' MHz';
  return (+(hz / 1e3).toPrecision(4)) + ' kHz';
}

export function fmtLen(mm) {
  if (!isFinite(mm)) return '∞';
  const a = Math.abs(mm);
  if (a < 1e-9) return '0 mm';
  if (a >= 1000) return (mm / 1000).toPrecision(4) + ' m';
  if (a >= 1 || a === 0) return (+mm.toPrecision(5)) + ' mm';
  if (a < 1e-3) return (+(mm * 1e6).toPrecision(4)) + ' nm';
  return (+(mm * 1000).toPrecision(4)) + ' µm';
}

export const fmtFs = v => { const a = Math.abs(v); return a >= 1e6 ? +(v / 1e6).toPrecision(4) + ' ns' : a >= 1e3 ? +(v / 1e3).toPrecision(4) + ' ps' : +v.toPrecision(4) + ' fs'; };

export const fmtFs2 = v => { const a = Math.abs(v); return a >= 1e6 ? +(v / 1e6).toPrecision(4) + ' ps²' : Math.abs(v) < 0.05 ? '0 fs²' : +v.toPrecision(4) + ' fs²'; };

export const fmtFs3 = v => { const a = Math.abs(v); return a >= 1e9 ? +(v / 1e9).toPrecision(4) + ' ps³' : Math.abs(v) < 0.5 ? '0 fs³' : +v.toPrecision(4) + ' fs³'; };

export const fmtW = v => v >= 1e6 ? +(v / 1e6).toPrecision(4) + ' MW' : v >= 1e3 ? +(v / 1e3).toPrecision(4) + ' kW' : v >= 1 ? +v.toPrecision(4) + ' W' : +(v * 1e3).toPrecision(4) + ' mW';

export const fmtJ = v => v >= 1e-6 ? +(v * 1e6).toPrecision(4) + ' µJ' : v >= 1e-9 ? +(v * 1e9).toPrecision(4) + ' nJ' : +(v * 1e12).toPrecision(4) + ' pJ';

export const fmtMw = v => v === 0 ? '0 mW' : Math.abs(v) >= 0.01 ? (+v.toPrecision(4)) + ' mW' : (+(v * 1000).toPrecision(4)) + ' \u00b5W';

/* ---------- Cavities in the panels ----------
   Every cavity found shows as a card: in the bench overview, and in the panel of each
   element on its loop (so it pins like any panel) */
export const fmtHz = v => { const a = Math.abs(v); return a >= 1e9 ? +(v / 1e9).toPrecision(4) + ' GHz' : a >= 1e6 ? +(v / 1e6).toPrecision(4) + ' MHz' : a >= 1e3 ? +(v / 1e3).toPrecision(4) + ' kHz' : +v.toPrecision(3) + ' Hz'; };

/* an irradiance in W/mm², as W/cm² with a prefix */
export function fmtIrr(v) {
  const w = v * 100;
  if (!(w > 0)) return '0 W/cm²';
  const [k, u] = w >= 1e6 ? [1e6, 'MW'] : w >= 1e3 ? [1e3, 'kW'] : w >= 1 ? [1, 'W'] : w >= 1e-3 ? [1e-3, 'mW'] : w >= 1e-6 ? [1e-6, 'µW'] : [1e-9, 'nW'];
  return (+(w / k).toPrecision(3)) + ' ' + u + '/cm²';
}

export const packText = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
