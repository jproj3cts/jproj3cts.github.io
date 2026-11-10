import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   The version, and what is new in it (Help › What’s new)
   ========================================================================== */
export const APP_VERSION = '0.2.0';
export const NEWS = [
  { v: '0.2.0', date: '10 Nov 2026', items: [
    '<b>Sketches lock onto the model</b>: a point drawn near a corner or an edge of a part snaps to it and is held there, and the dimension tool measures from the model’s edges and corners and from the origin. A shape held to an edge follows that edge when the model changes.',
    '<b>Sizes as you draw</b>: the length, width and height or diameter shows by the pointer; type a number straight after a line, circle, arc or rectangle to dimension it. Double-click a line, circle or arc to dimension it; right-click ends a chain of lines.',
    '<b>Dimensions on the model</b>: click a sketch, or the feature made from it, in the list and its dimensions show on the part; double-click one to change it without opening the sketch. Double-click a face to edit the feature that made it.',
    'The view fills the window, and the feature list closes and opens from the tab on its edge. Every row of the list has an eye: the origin, each plane, each sketch and each feature’s parts.',
    '<b>Fly</b> (the bird in the bar): through the model, full screen, with W A S D and the mouse.',
    'Fixed: Sketch on a face selected beforehand; a cut losing its region when its sketch changed; choosing parts in Mirror and the patterns; a chain of lines that closes on the origin now ends.',
  ] },
  { v: '0.1.0', date: '10 Nov 2026', items: [
    'The first JEKcad: a Part Studio with a feature list you can roll back, reorder, suppress and edit.',
    'Sketches with lines, rectangles, circles, arcs, slots, polygons and points; constraints inferred as you draw and added from the bar; dimensions typed in place, with units, expressions and #variables.',
    'Extrude, revolve, sweep, loft, fillet, chamfer, shell, hole, linear and circular patterns, mirror, booleans and offset planes, on OpenCascade running in your browser.',
    'STEP in and out, STL out, .jekcad files, autosave, and Part Studios kept in the cloud and listed in JEKsuite.',
  ] },
];
export function wireNews() {
  const v = document.getElementById('appVersion'); if (v) v.textContent = APP_VERSION;
  const btn = document.getElementById('btnNews'), dlg = document.getElementById('newsDialog');
  if (!btn || !dlg) return;
  btn.addEventListener('click', () => {
    document.getElementById('newsBody').replaceChildren(...NEWS.map(n => h('section', null, h('h3', null, 'JEKcad ' + n.v + ' · ' + n.date), h('ul', null, ...n.items.map(t => (() => { const li = h('li'); li.innerHTML = t; return li; })())))));
    dlg.showModal();
  });
  document.getElementById('newsClose').addEventListener('click', () => dlg.close());
}
