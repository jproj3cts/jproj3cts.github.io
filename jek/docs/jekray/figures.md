---
layout: docs
title: Figures for papers, drawings and slides
permalink: /jek/docs/jekray/figures/
description: "File › Export figure: the bench as a journal figure (85 or 174 mm wide, white, line art, names in Helvetica at a size in points, lines at least 0.5 pt, a scale bar; PDF, SVG or 600 dpi PNG), a technical drawing on an A4 or A3 sheet (to a standard scale, the parts' centres dimensioned, numbered callouts, a parts list and a title block), or a 16:9 or 4:3 slide. And the Draw palette's lines, arrows, shapes and notes for marking a figure up."
---

<p class="dx-lead"><strong>File › Export figure…</strong> makes the bench into a figure for where it is going: a column of a journal, a drawing to build from, or a slide. Each kind is drawn afresh for its page, not shrunk from the screen, so its words and lines come out at the sizes asked for. A preview beside the choices shows the figure as it will come down.</p>

## Journal

White, with no breadboard holes, the parts as line art and the light in its own colour or in black (**Light**). It is cut to the parts, and made the width of a column: **Single column, 85 mm** or **Double column, 174 mm** (a figure taller than 230 mm is made narrower to fit a page). The parts' names are in Helvetica at the size chosen (6 to 10 pt, 8 pt as most journals ask) whatever the bench's size, and no line is thinner than 0.5 pt, so nothing vanishes in print. Every name is that one size, even one made larger or smaller on the bench. Each is set beside its part where it is clear of the other parts and the other names: under it, over it or at either side, and further out on a crowded bench, joined to its part by a thin line. The ports' names (in, out, 1, 2) are left out unless **Port names** is set to **Shown**.

On a crowded bench the names do not all fit beside their parts at a size that can be read. **Names** chooses what happens: **Beside the parts, numbered if crowded** (the default) switches to a number beside each part and a key under the figure when a name would lie on something or more than a fifth of them would have to be led out; **Beside the parts** and **Numbered, with a key** fix it either way; **None** leaves them out. The parts are numbered from left to right. A **scale bar** goes under it, a round length in mm.

The light is drawn as on the bench: by default as bright as the power it carries, so a weak ghost or a stray reflection is faint and light below a ten-thousandth of the brightest source is left out. For a figure of the paths alone, untick **Draw light by its power** under **Light** in the Bench panel first, and every beam is drawn at full strength.

It comes down as **PDF** or **SVG**, vector (the lines stay lines at any zoom; a diffracted field, a picture on the bench, stays a picture in it), or as a **PNG at 600 dpi**. A name that sits badly can be moved on the bench first (drag it with the select tool), and the figure keeps it there when that place is clear at the figure's size.

## Technical drawing

An **A4** or **A3** sheet, landscape, framed, with the bench drawn to a standard scale (1:1, 1:2, 1:2.5, 1:5, 1:10 and so on: the largest the sheet holds), and:

- **Dimensions** between the parts' centres: a chain below the drawing along the bench and one at its right across it, each step in mm.
- **Callouts**: a numbered balloon for each part, led to its centre, numbered from left to right; and a **parts list** beside the drawing, each part's number, name, kind, position (x, y in mm) and angle. Without callouts the parts carry their names instead.
- A **title block**: the title (the bench's name unless you give one), the tab, the scale, the units, the sheet, the date, who drew it (optional) and that it was drawn with JEKray.

The light is drawn in grey (or in its colour), the parts in black. PDF, SVG, or PNG at 300 dpi.

## Presentation

The bench as it looks on screen, in your theme, its holes and all, on a **16:9 (1920 × 1080)** or **4:3 (1600 × 1200)** slide: framed to fit, the names a size that reads from the back of a room, and a small credit line in the corner. PNG, SVG or PDF.

Exports need a free account, as the layout's do; **File › Export layout** still saves the bench just as it is on screen.

## Marking a figure up

**Draw** (from the switcher on the parts bar, in 2D) holds the drawing tools: Select, Node, Rectangle, Ellipse, **Line** (L), **Arrow** (W), Text (T) and the Pen. Drag with Line or Arrow for a straight line; hold Ctrl for steps of 15°. A line or any open path can end in an **arrowhead**, a **dot** or a **bar** at either end: its panel's Start and End. Right-click on empty bench for **Add a note here** (a text, ready to type) and **Add an arrow here**. Drawings are for figures: the light passes through them, and they come out in every export, figures included.
