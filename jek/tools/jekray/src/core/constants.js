/* ==========================================================================
   Constants
   ========================================================================== */

export const STORE_KEY = 'jek-raytracer-session-v1';
export let cloud = null, cloudOpening = false;       // the cloud bench this one is linked to (see Cloud benches)
export function setCloudOpening(v) { return (cloudOpening = v); }
export function setCloud(v) { return (cloud = v); }
// This same script also runs as the field worker (see "The field worker" near the end): there
// it has no page, and runs the way the tests do, without timers or drawing
export const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
export const IN_PAGE = !IN_WORKER && typeof document !== 'undefined';     // not Node (the engine tests)
export const APP_SRC = IN_PAGE && document.currentScript ? document.currentScript.textContent : null;
// the dev page runs the modules as they are: its workers come from this module script instead
export const DEV_WORKER = IN_PAGE && !APP_SRC && self.JEKRAY_DEV_WORKER || null;
const QUERY = typeof location === 'undefined' ? '' : location.hash + location.search;
export const TEST_MODE = IN_WORKER || !IN_PAGE || /(^|[#?&])test\b/.test(QUERY);
// ?embed: the bench alone, for a web page to show in a frame; it keeps nothing in this browser
export const EMBED = IN_PAGE && !TEST_MODE && /(^|[?&])embed\b/.test(QUERY);
// ?embed=locked: the parts stay where they are; the reader pans, zooms, turns the 3D view and plays the sweeps
export const LOCKED = EMBED && /(^|[?&])embed=locked\b/.test(QUERY);
export const FORMAT = 'jekray';
export const VERSION = 1;
export const TRACE_BUDGET = 4e6;  // ray–element interactions per redraw, keeps the page responsive
export const FAR = 2e4;          // mm: how far an escaping ray is drawn
export const BEAM_Z = 75;        // mm: the beam's height above the breadboard, where parts sit unless moved
export const EPS = 1e-6;         // mm

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ZOOM_MAX = 1e5;          // px per mm: 10 nm a pixel, enough to see a standing wave's fringes

/* A canvas to draw into off screen: in the worker, an OffscreenCanvas */
export function mkCanvas(w, h) {
  w = Math.max(1, Math.round(w || 1)); h = Math.max(1, Math.round(h || 1));
  if (IN_WORKER) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
