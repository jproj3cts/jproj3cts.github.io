/* ==========================================================================
   Constants
   ========================================================================== */

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
/* The page as another program, by its query (each keeps its work apart from JEKray's bench in this browser: each
   store's key, appStoreKey, has the mode after it):
   ?optic  the Optics designer, JEKray's lens designer as a program of its own; its document is a design, a .optic
           (format 'jekoptic'): the parts of one assembly and its record, with a uid that links the benches using it
   ?rf     JEKrf, the RF bench (format 'jekrf', a .jekrf): JEKray's bench with the RF parts alone
   ?rfd    JEKrf's RF designer, a program of its own as the Optics designer is; its document a .rfd (format 'jekrfd')
   (io/designs.js links the designs and the benches that use them) */
const PAGE_Q = typeof location === 'undefined' || !IN_PAGE || IN_WORKER ? '' : location.search;
export const OPTIC = /(^|[?&])optic\b/.test(PAGE_Q);
export const RFD = !OPTIC && /(^|[?&])rfd\b/.test(PAGE_Q);
export const RFAPP = !OPTIC && !RFD && /(^|[?&])rf\b/.test(PAGE_Q);
export const DESIGNER = OPTIC || RFD;
export const OPTIC_FORMAT = 'jekoptic', RF_FORMAT = 'jekrf', RFD_FORMAT = 'jekrfd';
/* the page's own mode ('ray', 'optic', 'rf' or 'rfd') and the format of the file it keeps */
export const PAGE_MODE = OPTIC ? 'optic' : RFD ? 'rfd' : RFAPP ? 'rf' : 'ray';
export const PAGE_FORMAT = { ray: FORMAT, optic: OPTIC_FORMAT, rf: RF_FORMAT, rfd: RFD_FORMAT }[PAGE_MODE];
export const PAGE_FORMATS = [FORMAT, OPTIC_FORMAT, RF_FORMAT, RFD_FORMAT];
/* the page's query, kept in the address when a link's hash is taken off */
export const PAGE_QUERY = { ray: '', optic: '?optic', rf: '?rf', rfd: '?rfd' }[PAGE_MODE];
export const appStoreKey = k => (PAGE_MODE === 'ray' ? k : k + '-' + PAGE_MODE);
export const STORE_KEY = appStoreKey('jek-raytracer-session-v1');
export const VERSION = 1;
export const TRACE_BUDGET = 4e6;  // ray–element interactions per redraw, keeps the page responsive
export const FAR = 2e4;          // mm: how far an escaping ray is drawn
export const BEAM_Z = 75;        // mm: the beam's height above the breadboard, where parts sit unless moved
export const EPS = 1e-6;         // mm
export const STL_KEEP = 40000;   // triangles kept with the bench from a .stl or STEP file (core/stl.js, core/step.js; JEKion shares it)

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ZOOM_MAX = 1e5;          // px per mm: 10 nm a pixel, enough to see a standing wave's fringes

/* A canvas to draw into off screen: in the worker, an OffscreenCanvas */
export function mkCanvas(w, h) {
  w = Math.max(1, Math.round(w || 1)); h = Math.max(1, Math.round(h || 1));
  if (IN_WORKER) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
