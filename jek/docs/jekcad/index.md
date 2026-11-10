---
layout: docs
docs: jekcad
title: Getting started
permalink: /jek/docs/jekcad/
description: "JEKcad, a parametric Part Studio in the browser: the window, a first part from a sketch, the feature list and its rollback bar, the view and the mouse."
---

<p class="dx-lead">JEKcad models parts the way most parametric CAD programs do. You sketch on a plane, constrain and dimension the sketch, and turn it into a solid with a feature. Every feature stays in a list you can edit, and the part is made again from the list each time something changes.</p>

JEKcad is in development. Its geometry comes from [Open CASCADE Technology](https://dev.opencascade.org/), which runs in your browser in a worker of its own. The page stays responsive while the model is rebuilt.

## The window

- **The feature bar**, across the top: Sketch, then the features that make and change solids, then Variables. The selection filter at its right end limits what a click in the view picks.
- **The feature list**, on the left: the origin and the Top, Front and Right planes, then each feature in order. The orange **rollback bar** follows the last feature applied. The tab on the list's right edge closes it, so the view has the whole window, and opens it again.
- **The parts list**, under it: each solid the features make, with its name, colour and material.
- **The view**, with the view cube at the top right and the measurements of what is selected at the bottom right.

## A first part

1. Click **Sketch**, then the **Top** plane, in the view or in the feature list. The view turns to look straight down on it.
2. Press **R** for the rectangle tool. Click on the origin, then click again up and to the right. The first corner snaps to the origin, and JEKcad adds the constraints a rectangle needs.
3. Press **D** for the dimension tool. Click the bottom line twice, type `40` and press Enter. Do the same on the right-hand side with `20`. The rectangle turns from blue to ink, which means it is fully defined.
4. Click **✓ Finish**. The sketch joins the feature list.
5. Click **Extrude**. Its region is already chosen. Type `10 mm` for the depth and click **✓ OK**. You have a 40 × 20 × 10 mm block of 8000 mm³.
6. Click **Fillet**, click one of the block's vertical edges, set the radius to `2` and click **✓ OK**.

Now double-click the sketch in the feature list, double-click its `40` and type `60`. When you finish the sketch, the extrude and the fillet are rebuilt on the longer block. The fillet stays on the same edge.

## The feature list

- **Double-click** a feature to edit it. Its dialog opens and the model is shown as it was before the feature, with the feature's result drawn over it.
- **Right-click** a feature, or use its **⋯**, to rename, suppress, roll to, move up or down, hide (a sketch or plane), or delete it.
- **Click** a sketch, or a feature made from one, and the sketch's dimensions show on the model. Double-click a dimension there, type a new value and press Enter: the part follows, and the sketch stays closed. **View › Sketch dimensions on the model** shows them for every visible sketch.
- **Click** any feature and the faces it made are tinted orange in the view. Click it again, click on nothing or press Esc to clear it.
- **The eye** on a row shows or hides what the row is: the origin, a plane or a sketch. On a feature that made parts it shows or hides those parts. On a feature that changes a part, such as a fillet or a cut, it suppresses the feature, so you see the part without it.
- **Drag** a feature to reorder it. A feature cannot move above anything it uses, such as its sketch or the part it changes.
- **Drag the rollback bar** to see the part as it was at that point. New features go in at the bar.
- A feature that fails is shown **in red** with its reason, for example a fillet radius too big for its edges. The features after it are still rebuilt where they can be.

## Looking at the part

| Do | To |
|---|---|
| Right-drag | Orbit about the screen's axes, through the middle of the part; in a sketch too (N looks straight at the sketch again) |
| Double-click a sketch | Edit it |
| Middle-drag, or Shift and right-drag | Pan |
| Wheel | Zoom about the pointer |
| F, or double-click on nothing | Zoom to fit |
| N | Look straight at the flat face, plane or sketch chosen |
| 1 to 7 | Front, back, left, right, top, bottom, isometric |
| Click a face of the view cube | Look at that side. A strip along one of its sides looks along that edge, and a corner looks from the corner |
| The arrows round the view cube | Turn the view 15° |
| The curved arrows above the view cube | Roll the view 15° about the line of sight |
| The bird in the bar | Fly through the model, full screen |
| Double-click a face | Edit the feature that made it |

**Fly** moves a camera through the model: W A S D or the arrow keys move, the mouse looks round, Space and Ctrl go up and down, Shift is four times as fast and the wheel sets the speed. Esc lands, and the view carries on from where you stopped.

**View** also has the display modes (shaded with edges, shaded, hidden edges drawn dashed, and edges only), the **section view**, which cuts the parts with the Top, Front or Right plane at a distance you set, and the theme.

## Choosing things

A click picks a vertex, edge or face of a part, or a sketch region or plane. The item under the pointer is lit before you click. Each click adds what it picks to the selection, a click on something already chosen takes it out, and a click on nothing empties the selection. A drag from empty space selects by a box. The **Select** list limits picks to faces, edges, vertices, parts, sketch regions or planes.

Whatever is selected when you start a feature goes into it. Select a sketch region and click Extrude, or select edges and click Fillet.

With one or two items selected, the box at the bottom right gives their measurements: a face's area, an edge's length and radius, the distance and angle between two items, and a part's volume, surface area, mass and centre of mass. The mass comes from the material chosen in the parts list.
