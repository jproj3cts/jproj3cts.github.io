---
layout: docs
title: Modelling in 3D
permalink: /jek/docs/jekray/free-space/model/
description: Make a part in JEKray's 3D view as in a CAD program, from a parametric sketch on a flat face, extruded or revolved, added to a part or cut from it; a beam block that keeps how it was made.
---

<p class="dx-lead">The <b>Model</b> palette makes a part on the bench itself, as a CAD program does: pick a flat face, sketch on it, held by constraints and sized by dimensions, then extrude or revolve the regions you choose. A baffle with its hole on the beam, a mount for a lens, a slotted plate bolted to the table's holes. The part is an <a href="/jek/docs/jekray/free-space/stl/">STL object</a>, an opaque beam block, that keeps how it was made: change a dimension, and it is made again.</p>

Open the 3D view, then choose **Model** from the parts bar's switcher (the button after **+ Add** that names the mode: Parts, Draw, Model). It is there only in 3D, as Draw is only in 2D. The features are on the bar, after the switcher: **Sketch**, **Extrude** and **Revolve**. Under it, as in a CAD program, a toolbar holds the tools of the one in hand (the planes as you start, the sketch's tools as you sketch, the extrude's settings as you extrude), as icons with their names and keys on hover, some with a menu (▾); under it a strip with what the moment needs. While the Model tools are out the bench's parts are not selected or moved: clicking one does nothing, and no arrows show. Its × (or Esc), Parts on the switcher, or leaving 3D puts it away.

## Picking a plane

Click a flat face to sketch on: **the table top**, **a face of a part** (a modelled part's, or an STL or STEP object's), or **empty space**, for the plane level with the beam there. Or choose one from **Plane ▾**: Table top, Beam plane, Front (along x and up) or Side (along y and up), through the point the view looks at. **Offset** moves the plane that far off, along its normal. The view turns to look square on, the plane's y up the screen, and stays so while you sketch: the right button (or a trackpad's drag) moves it and the wheel zooms, but it does not turn. It turns again in Extrude and Revolve, to see the solid.

## Sketching

| Tool | Click |
|---|---|
| **Line** (L) | each point in turn; its first again closes it; Esc ends it |
| **Arc ▾** (A) | 3-point (start, end, a point on it); centre-point (centre, start, end); tangent (from a line's end, then its end) |
| **Rectangle ▾** (R) | corner (two corners); centre (its centre, then a corner) |
| **Circle** (C) | its centre, then its edge |
| **Slot** (O) | its two ends, then its width |
| **Polygon ▾** (P) | its centre, then a corner; its sides from the menu |
| **Hole ▾** (H) | where it goes; its size from the menu (clearance and tapping drills, M2 to M8, 4-40, 8-32, ¼-20, or your own) |
| **Point** | where it goes: to constrain and dimension from |

**Snapping makes constraints**, as a CAD program infers them: a point dropped on a shape's end, centre or corner, or on the sketch's origin, is coincident with it; on a line, circle or arc, it stays on it; at a line's middle, at its midpoint; a line drawn level or upright is horizontal or vertical. Points also snap to **where the light crosses the plane** (red: each ray's crossing, and the beam's middle), to **the table's holes** (25 mm apart, for a hole or a circle's centre on the table top) and to the grid. Hold **Alt** to place a point with no snap. A rectangle is four lines, its corners coincident, two of its sides horizontal and two vertical.

Sizes can be typed as a shape is drawn (they show in the strip; type a number and Tab between them, Enter makes it): each becomes a dimension. A size can be in other units: `1in`, `0.25"`, `2.5cm`.

### Constraints

Select points and shapes (**Select**, Shift for more), then a constraint; or choose a constraint and click what it is between.

| Constraint | Between |
|---|---|
| **Coincident** | two points; a point and a curve (it stays on it); two circles (their centres) |
| **Concentric** | circles and arcs |
| **Parallel**, **Perpendicular** | lines |
| **Tangent** | a line and a circle or arc, or two of those |
| **Horizontal**, **Vertical** | lines, or two points |
| **Equal** | lines' lengths, or circles' and arcs' radii |
| **Midpoint** | a point and a line |
| **Fix** | points (or shapes), where they are |
| **Symmetric** | two points and a line |

Each shows as a small sign by its shape (H, V, ∥, ⊥, =, T, M, ◎, ⚓, ⇋); click one, then Delete, to take it off. A constraint that cannot hold with the others is refused.

### Dimensions

**Dimension** (D): click a line (its length), a circle (its diameter) or an arc (its radius), then empty space; or two points (the distance between them: aligned, or across or up only, chosen in the strip), a point and a line, or two lines (the angle between them, or the distance if they are parallel). Its value opens to type. **Double-click** a dimension at any time to change it: the sketch is solved again, moving as little as it can.

Shapes still free to move are blue; once nothing about them can move (every one of their sizes and places held by constraints, dimensions and the origin) they turn black, and the strip says **Fully defined**. Drag a point or a shape (Select) and it moves as far as its constraints let it.

### Changing the sketch

**Trim** (T) takes away the piece of a line, circle or arc you click, between where other shapes cross it. **Fillet** (F) rounds the corner you click where two lines meet (its radius in the strip): an arc tangent to both, its radius a dimension, the corner kept as a point so the lines' dimensions still measure to it. **Use edges** brings a part's edge into the sketch, or every edge in the plane. **Mirror** copies the selected shapes across a line; **Pattern ▾** repeats them in a line or round a centre. **Construction** shapes (dashed) guide (a revolve's axis, a mirror's line) and make no solid. Ctrl+Z undoes in the sketch.

## Extrude and revolve

The sketch's curves cut the plane into **regions**, wherever they cross, lines across shapes included. **Extrude** shows the solid the regions make, green to add or red to cut; **click a region to take it or leave it out** (as it starts, the closed shapes are taken, a shape inside another a hole in it, and the Hole tool's holes left out). Drag the arrow or type the **Distance** (negative, or **Flip**, for the other way); **Both ways** makes it as far each side of the sketch; a cut can go **Through all**. **Revolve** turns the regions about a line of the sketch (its axis: a construction line, as a rule) by an angle, up to a whole turn.

Its bar says what it makes (▾): **a new part**, or added to a modelled part on the bench, or cut from one. A sketch made on a modelled part's face adds to that part unless you choose otherwise. **OK** (or Enter) makes it; × goes back to the sketch.

## The part, after

A modelled part's panel lists how it was made, in order: each sketch, its dimensions under it to change there (the sketch solved again with the new size, and the part made again), and **Edit sketch…** to open it again in the 3D view; each extrude or revolve, with its distance or angle, **Add** or **Cut**, **Both ways** and **Through all**, how many regions it takes, and × to take it away. A sketch on a part's face stays on that face: made longer, the extrude under it carries it. The part keeps its place on the bench as it changes.

It is placed, turned, grouped and saved as any part, and it is a beam block as an STL object is: every ray and beam that meets it stops there (see [STL object](/jek/docs/jekray/free-space/stl/)). **Export .stl…** saves its triangles as a .stl file in millimetres, to 3D print or to send to a machinist (a free account).

The solids are made by [Manifold](https://github.com/elalish/manifold) (Apache-2.0), a WebAssembly library fetched the first time a part is made or changed. A bench with a modelled part keeps the part's triangles too, so it opens and traces without it.
