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

## Dimensions

**Overall sizes** adds the width and height of the front view, the depth on the top view and the width of the right view.

**Dimension** (D) adds one by hand:

1. Click a corner of a view.
2. Click a second corner in the same view.
3. Click where the dimension goes. Above or below the two corners it measures across. Beside them it measures up. Hold Shift to measure along the line between them.

Click a circle's rim in a view that looks straight at it for its diameter.

Drag a dimension to move it. Click it and press Delete to remove it. The panel lists every dimension with a bin beside it.

A dimension holds to the model's own corners and round edges. Change the part in its Part Studio and the drawing's dimensions read the new sizes. A dimension whose corner is no longer on the model is listed as lost.

Dimensions cannot be put on the isometric view.

## Title block

The title, drawn by, material, drawing number and a note are typed in the panel. The date, the scale and the sheet are filled in.

## Export

**Export PDF** writes the sheet at its true size, with lines as lines, so it prints to scale. It needs a free account, as every export does.

## What a drawing does not do yet

- There are no section views, detail views or broken views.
- Dimensions are lengths between corners and diameters. There are no angle or radius dimensions, tolerances, or centre lines.
- The sketch's dimensions are not brought onto the sheet for you.
- There is no DXF or DWG export, and one sheet per drawing.
- Smooth edges, such as where a fillet meets a face, are not drawn.
