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

## Tolerances

Click a dimension in the panel's list (or on the sheet) and **The dimension chosen** appears under the list. Choose a tolerance:

| Tolerance | Reads |
|---|---|
| ± one value | 40 ±0.1 |
| + and − values | 40 +0.2 -0.05 |
| Limits | 40.2/39.95, worked out from the plus and minus values |
| Fit | Ø6 H7 |

**Before it** and **After it** add text, such as 4× before a hole's diameter. Click **Apply**. A thread's label (M6×1) takes no tolerance.

## Notes and balloons

**Note** puts text on the sheet. Click a corner or a round edge of a view first, then where the text goes, for a note on a leader that follows the model. Or click an empty place for a note with no leader. Type `\n` in the text for a new line. Drag a note to move it, double-click it in the panel to change it, and select it and press Delete to take it off.

**Balloon** takes a corner or a round edge of a part in a view and puts a balloon with the part's item number in the bill of materials. The first balloon on a sheet shows the bill of materials above the title block; **Bill of materials on this sheet** in the panel takes it off or puts it back. Drag a balloon to move it.

## Sheets

A drawing can have up to 20 sheets. The **Sheet** list at the top of the panel moves between them. The buttons beside it add a sheet, rename this one and delete it. A new sheet has the front, top, right and isometric views on the same paper as the sheet open. Each sheet has its own paper, scale, views, dimensions, notes and balloons; the title block and what the drawing is of are shared.

## Title block

The title, drawn by, material, drawing number and a note are typed in the panel. The date, the scale and the sheet are filled in.

## Export

**Export PDF** writes each sheet as a page at its true size, with lines as lines, so it prints to scale. **Export DXF** writes the sheets side by side for other CAD programs: AutoCAD R12, in millimetres, on layers for visible, thin, hidden and centre lines, dimensions and text. Both need a free account, as every export does.

## What a drawing does not do yet

- There are no broken views, auxiliary views or section views along a line that bends.
- There are no ordinate dimensions or GD&T frames (a note can carry the text).
- The sketch's dimensions are not brought onto the sheet for you.
- There is no DWG export.
- Smooth edges, such as where a fillet meets a face, are not drawn.
