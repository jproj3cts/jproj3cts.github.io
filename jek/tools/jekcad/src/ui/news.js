import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   The version, and what is new in it (Help › What’s new)
   ========================================================================== */
export const APP_VERSION = '0.1.0';
export const NEWS = [
  { v: '0.1.0', date: '10 Nov 2026', items: [
    'The first JEKcad: a Part Studio with a feature list you can roll back, reorder, suppress and edit.',
    'Sketches with lines, rectangles, circles, arcs, slots, polygons and points; constraints inferred as you draw and added from the bar; dimensions typed in place, with units, expressions and #variables.',
    'Extrude, revolve, sweep, loft, fillet, chamfer, shell, hole, linear and circular patterns, mirror, booleans and offset planes, on OpenCascade running in your browser.',
    'STEP in and out, STL out, .jekcad files, autosave, and Part Studios kept in the cloud and listed in JEKspace.',
  ] },
];
export function wireNews() {
  const v = document.getElementById('appVersion'); if (v) v.textContent = APP_VERSION;
  const btn = document.getElementById('btnNews'), dlg = document.getElementById('newsDialog');
  if (!btn || !dlg) return;
  btn.addEventListener('click', () => {
    document.getElementById('newsBody').replaceChildren(...NEWS.map(n => h('section', null, h('h3', null, 'JEKcad ' + n.v + ' · ' + n.date), h('ul', null, ...n.items.map(t => h('li', null, t))))));
    dlg.showModal();
  });
  document.getElementById('newsClose').addEventListener('click', () => dlg.close());
}
