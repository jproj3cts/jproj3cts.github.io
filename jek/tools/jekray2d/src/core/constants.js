/* ==========================================================================
   Constants
   ========================================================================== */

export const STORE_KEY = 'jek-raytracer-session-v1';
let cloud = null, cloudOpening = false;       // the cloud bench this one is linked to (see Cloud benches)
// This same script also runs as the field worker (see "The field worker" near the end): there
// it has no page, and runs the way the tests do, without timers or drawing
export const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
export const APP_SRC = !IN_WORKER && document.currentScript ? document.currentScript.textContent : null;
export const TEST_MODE = IN_WORKER || /(^|[#?&])test\b/.test(location.hash + location.search);
// ?embed: the bench alone, for a web page to show in a frame; it keeps nothing in this browser
export const EMBED = !IN_WORKER && !TEST_MODE && /(^|[?&])embed\b/.test(location.search);
export const FORMAT = 'jekray';
export const VERSION = 1;
export const TRACE_BUDGET = 4e6;  // ray–element interactions per redraw, keeps the page responsive
export const FAR = 2e4;          // mm: how far an escaping ray is drawn
export const EPS = 1e-6;         // mm

