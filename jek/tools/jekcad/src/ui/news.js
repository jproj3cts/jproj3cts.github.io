import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   The version, and what is new in it (Help › What’s new)
   ========================================================================== */
export const APP_VERSION = '0.4.0';
export const NEWS = [
  { v: '0.4.0', date: '10 Nov 2026', items: [
    '<b>Delete part</b>, in a part’s ⋯ menu (or Delete with parts selected): a feature in the list, so it can be undone, suppressed or edited.',
    '<b>Share a link</b> (File): the Part Studio as it is now, written into the link itself. Anyone opens it to look, turn and measure.',
    '<b>Changing a Part Studio needs a free account</b>: sketching, features, dimensions. Looking at one, opening a file or a shared link and measuring need none.',
    'The <b>view cube</b> has nine parts to a face: its middle looks at the face, a strip along a side looks along that edge, a corner looks from the corner. The arrows round it turn the view 15° at a time.',
    '<b>Right-drag</b> turns the part about the screen’s own axes, through the middle of the part.',
    '<b>Double-click a row</b> of the feature list to edit it (the first click no longer got in the way). A feature opened to edit has its regions ready to click, so a hole can be clicked in to be filled.',
    'A <b>cut</b> takes in the model’s holes that lie in what it cuts, so no thin tube is left standing round a hole. An added boss still leaves them open.',
  ] },
  { v: '0.3.0', date: '10 Nov 2026', items: [
    'The line, rectangle, circle and arc tools each have an arrow beside them listing their kinds. New among them: a <b>centre line</b> (a construction line), a <b>midpoint line</b> (its middle, then an end) and a <b>3-point circle</b>.',
    '<b>Type sizes as you draw</b>: with a line, circle or rectangle under the pointer, type a number and press Enter. The line is that long the way the pointer goes; a rectangle takes its width, then its height. Each is dimensioned as it is made.',
    'What is inferred is what the pointer shows: a line that comes to a circle nearly touching it is made <b>tangent</b> (T), and a point level with, or straight above, another is held so (a dashed line to it). The perpendicular that used to be added without a sign is gone. Hold <b>Shift</b> to draw with nothing inferred.',
    '<b>Double-click a plane</b>, in the view or the list, to start a sketch on it. A plane is picked anywhere inside it.',
    '<b>Clicks add to the selection</b>: each click adds what it picks or, if it is chosen already, takes it out; a click on nothing empties it. So several regions of a sketch can be clicked, then extruded.',
    '<b>Extrude</b> adds to the part it meets (a new part where it meets none), and a depth below 0 goes the other way, so Opposite direction is only for Through all and Up to face.',
    '<b>Extrude and Revolve</b> open with their regions ready to click: click a region in the view to take it out or put it in.',
    'A dimension typed moves the shape it measures and <b>leaves the rest where it is</b>: a loose shape the line touches no longer shifts. An <b>angle</b> is drawn as an arc between its two lines.',
    '<b>Mirror</b> in a sketch has a small panel: click the shapes into it, then the mirror line, then Mirror.',
    'A <b>hole of the face</b> you sketch on that lies inside what you draw is brought into the sketch when you finish, so an extrude leaves it open.',
    '<b>Right-drag</b> turns the part about its own upright axis, its middle staying where it is on the screen. <b>Double-click a sketch</b> in the view to edit it. The material list in a part’s row stays open.',
    'Fixed: <b>shapes drawn over each other</b> (slots laid end on end, a circle on a line’s end) gave regions that cut nothing, or the whole part. Regions are now made the same way on the page and in the kernel, shapes a hair apart are treated as touching, and regions that touch are pushed as one.',
    'Shapes that only <b>touch</b> (a circle against a side, two circles kissing) now divide the regions either side of the touch, and a slot drawn from a hole’s centre or another slot’s end is held to it.',
    'Fixed: a sketch held to a corner or an edge beside a <b>fillet</b> could jump to another corner when the Part Studio was opened again. A fillet’s faces are now named after the edges they round.',
    'A sketch point locks onto the <b>middle of a straight edge</b> of the model and the <b>centre of a round one</b>, as it does onto the model’s corners and edges.',
  ] },
  { v: '0.2.0', date: '10 Nov 2026', items: [
    '<b>Sketches lock onto the model</b>: a point drawn near a corner or an edge of a part snaps to it and is held there, and the dimension tool measures from the model’s edges and corners and from the origin. A shape held to an edge follows that edge when the model changes.',
    '<b>Sizes as you draw</b>: the length, width and height or diameter shows by the pointer; type a number straight after a line, circle, arc or rectangle to dimension it. Double-click a line, circle or arc to dimension it; right-click ends a chain of lines.',
    '<b>Dimensions on the model</b>: click a sketch, or the feature made from it, in the list and its dimensions show on the part; double-click one to change it without opening the sketch. Double-click a face to edit the feature that made it.',
    'The view fills the window, and the feature list closes and opens from the tab on its edge. Every row of the list has an eye: the origin, each plane, each sketch and each feature’s parts.',
    '<b>Fly</b> (the bird in the bar): through the model, full screen, with W A S D and the mouse.',
    'Closer to how you would expect a sketch to behave: right-drag orbits in a sketch too (N looks straight at it again); a dimension’s value drags to where you want it; an angle is the one inside the corner; a point started level with the origin, or a polygon drawn level, is held so; a corner of the model a sketch is locked to follows the model, as an edge does.',
    'Loft and Sweep start with the sketches nothing has used yet; a round part shows no seam line along it.',
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
