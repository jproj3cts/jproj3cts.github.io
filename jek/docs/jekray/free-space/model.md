---
layout: docs
title: Modelling in 3D
permalink: /jek/docs/jekray/free-space/model/
description: Make a part in JEKray's 3D view as in a CAD program, sketched on a flat face and extruded or revolved, added to a part or cut from it; a beam block that keeps how it was made.
---

<p class="dx-lead">The 3D view's <b>Model</b> tools make a part on the bench itself: pick a flat face, sketch on it, then extrude or revolve the sketch into a solid. A baffle with its hole on the beam, a mount for a lens, a slotted plate bolted to the table's holes. The part is an <a href="/jek/docs/jekray/free-space/stl/">STL object</a>, an opaque beam block, that keeps how it was made: change a distance or a sketch, and it is made again.</p>

The Model tools are an **experimental feature**: switch on *3D modelling* under **Help › Experimental features…** (a free account), then open the 3D view; **Model** is on its bar.

## Picking a plane

With Model on, click a flat face to sketch on:

- **the table top**;
- **a face of a part**: a modelled part's, or an STL or STEP object's;
- **empty space**, for the plane level with the beam (its height where you click).

Or choose a plane of the bench's own from the card: **Table top**, **Beam plane**, **Front** (along x and up) or **Side** (along y and up), through the point the view looks at. **Offset** moves the plane that far off the face, along its normal: for a feature at a height. The view turns to look square on to the plane, its y up the screen.

## Sketching

| Tool | Click | Sizes to type |
|---|---|---|
| **Line** | each point in turn; click the first again to close it; Esc ends it | length, angle |
| **Arc** | its start, its end, then a point it passes through | |
| **Rectangle** | two corners | width, height |
| **Circle** | its centre, then its edge | diameter |
| **Slot** | its two ends, then its width | length, width |
| **Polygon** | its centre, then a corner (sides set in the card) | radius |
| **Hole** | where it goes (its size from the list) | |

While a shape is being drawn its sizes show in the card, following the pointer; type a number (it goes into the first) and Tab between them, and Enter makes the shape with those sizes. A size can be given in other units: `1in`, `0.25"`, `2.5cm`. **Construction** shapes (dashed) guide (a revolve's axis, a mirror's line) and make no solid.

**Snapping.** The pointer snaps to the shapes' ends, middles, centres and corners, to the sketch's origin, to **where the light crosses the plane** (each ray's crossing, red, and the beam's middle, a red target), to **the table's holes** (25 mm apart, for a hole or a circle's centre on the table top), and to the grid; a line or slot snaps level or upright with its last point. Hold **Alt** to place a point without snapping.

**Holes** come in the usual sizes: clearance and tapping drills for M2 to M8, 4-40, 8-32 and ¼-20 screws, or a diameter of your own. A hole is never material: in a shape it is a hole through it; on its own, in a cut, it drills.

**Select** a shape to change its sizes in the card (a rectangle's width, height, corner radius and angle; a circle's diameter and centre), drag it to move it, Delete to remove it. With shapes selected: **Mirror** (then click the line to mirror across), **Linear pattern** (copies and the step between them) and **Circular pattern** (copies round a centre you click, over an angle). **Use edges** brings a part's edge into the sketch (click it), or every edge lying in the plane at once (the outline of the face you are sketching on). Ctrl+Z undoes in the sketch.

The card counts the closed shapes: those are what is made into a solid. A shape inside another is a hole in it, and a shape inside that an island again.

## Extrude and revolve

**Extrude…** shows the solid the sketch makes, green to add or red to cut, with an arrow to drag its length, or type its **Distance** (negative, or **Flip**, for the other way). **Both ways** makes it as far each side of the sketch; a cut can go **Through all**. **Revolve…** turns the sketch about a line of it (its axis: a construction line, as a rule) by an angle, up to a whole turn: a tube, a ring, a lens cell.

What it makes: **a new part**, or added to a modelled part on the bench, or cut from one. A sketch made on a modelled part's face adds to that part unless you choose otherwise. **OK** (or Enter) makes it.

## The part, after

A modelled part's panel lists how it was made, in order: each sketch, with **Edit sketch…** to open it again in the 3D view (Finish makes the part again); each extrude or revolve, with its distance or angle, **Add** or **Cut**, **Both ways** and **Through all**, and × to take it away. A sketch on a part's face stays on that face: made longer, the extrude under it carries it. The part keeps its place on the bench as it changes, its base on the table if it stood on it.

It is placed, turned, grouped and saved as any part, and it is a beam block as an STL object is: every ray and beam that meets it stops there (see [STL object](/jek/docs/jekray/free-space/stl/)). **Export .stl…** saves its triangles as a .stl file in millimetres, to 3D print or to send to a machinist (a free account).

The solids are made by [Manifold](https://github.com/elalish/manifold) (Apache-2.0), a WebAssembly library fetched the first time a part is made or changed. A bench with a modelled part keeps the part's triangles too, so it opens and traces without it.
