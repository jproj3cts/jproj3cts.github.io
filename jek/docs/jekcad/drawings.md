---
layout: docs
docs: jekcad
title: Drawings
permalink: /jek/docs/jekcad/drawings/
description: "A Drawing tab in JEKcad: views of a Part Studio or an Assembly on a sheet with hidden lines removed, dimensions that follow the model, a title block, and PDF export."
---

<p class="dx-lead">A Drawing is a tab that shows a Part Studio's parts, or an Assembly, as views on a sheet of paper, with dimensions and a title block.</p>

## Making a drawing

Open the Part Studio or the Assembly to draw, click **+** at the end of the tabs and choose **New Drawing**. The drawing starts with a front, a top, a right and an isometric view on an A4 sheet, at the largest usual scale that fits.

The views are third angle: the top view sits above the front view and the right view beside it. Hidden lines are taken out. Tick **Show hidden lines, dashed** to draw them.

The panel on the left sets what the drawing is of, which part of a Part Studio it shows, the sheet (A4, A3 or A2), the scale, and which views are on it. Back, left and bottom views can be added there.

| To | Do this |
|---|---|
| Move a view | Drag it on the sheet. |
| Move about the sheet | Right-drag or middle-drag to pan, and use the wheel to zoom. **F** fits the sheet. |
| Change the scale | Pick one in the panel. **To fit** chooses it for you. Changing the scale or the sheet lays the views out again. |

## Sections and details

**Section** cuts a view along a line. Click in the front, top or right view (or any other square-on view) where the cut goes. It runs up the view, or across it with Shift held, and it holds to a hole's centre or a corner within a few pixels. The section view appears beside it, seen in the direction of the arrows, with the cut faces hatched. The parent view shows the cut line and its letters.

**Detail** draws part of a view larger. Click the middle of what to enlarge, then click again to set how far round it. The detail view is twice the view's scale to start with; change it in the panel's list of views. The parent view shows the detail's circle and letter.

Each section and detail is listed in the panel under Views. There a section can be flipped to look from the other side, a detail's scale changed, and either taken off the sheet. Taking a view off the sheet takes its sections, details and dimensions with it.

## Dimensions

**Overall sizes** adds the width and height of the front view, the depth on the top view and the width of the right view.

**Dimension** (D) adds one by hand:

1. Click a corner of a view.
2. Click a second corner in the same view.
3. Click where the dimension goes. Above or below the two corners it measures across. Beside them it measures up. Hold Shift to measure along the line between them.

Click a circle's rim in a view that looks straight at it for its diameter, or an arc's for its radius. A tapped hole's rim gives its thread (M6×1).

**Angle** takes two straight lines of a view, each ending at corners of the model, then a click where the arc goes. It measures the angle between them and follows the model.

Drag a dimension to move it. Click it and press Delete to remove it. The panel lists every dimension with a bin beside it.

A dimension holds to the model's own corners and round edges. Change the part in its Part Studio and the drawing's dimensions read the new sizes. A dimension whose corner is no longer on the model is listed as lost.

Dimensions cannot be put on the isometric view.

With **Centre marks** ticked in the panel (as it is to start with), every hole and round edge seen end on gets a centre mark. Threads are drawn as ISO 6410 shows them: a thin three-quarter circle seen down the thread, and thin lines along it from the side, dashed while they are hidden.

## Title block

The title, drawn by, material, drawing number and a note are typed in the panel. The date, the scale and the sheet are filled in.

## Export

**Export PDF** writes the sheet at its true size, with lines as lines, so it prints to scale. **Export DXF** writes it for other CAD programs: AutoCAD R12, in millimetres, on layers for visible, thin, hidden and centre lines, dimensions and text. Both need a free account, as every export does.

## What a drawing does not do yet

- There are no broken views, auxiliary views or section views along a line that bends.
- There are no tolerances, ordinate dimensions or notes with leaders.
- The sketch's dimensions are not brought onto the sheet for you.
- There is no DWG export, and one sheet per drawing.
- Smooth edges, such as where a fillet meets a face, are not drawn.
