---
layout: docs
title: Getting started
permalink: /jek/docs/jekray2d/getting-started/
description: Your first bench in JEKray2D, the parts of the window, and saving and sharing your work.
---

<p class="dx-lead">This page takes you through a first bench: a laser, a lens and a screen. It then tours the window, and shows how to keep and share what you make.</p>

## A first bench

1. Open [JEKray2D](/jek/tools/jekray2d.html). A new bench is empty. If it isn't, choose **File › New bench**.
2. Click **+ Add part** (or press **A**), choose **Source**, and click the bench to place it. A fan of rays leaves it to the right.
3. Add a **Lens** about 50 mm to the right of the source, and a **Screen** beyond it, facing back towards the light.
4. Drag the screen along the beam. Its panel on the right shows the spot it records. The spot is smallest at the lens's focus.

<div class="dx-tip" markdown="1">
Every example in the **Examples** gallery is a working bench. Open one, change it, and press **Ctrl+Z** to undo. Your own bench comes back with Undo after an example has replaced it.
</div>

## The window

**The bench** is the large dark area. Drag an element to move it, drag its round handle to turn it, and scroll to zoom. Drag on empty bench to select several elements with a box. Right-click for a menu of what you can do with what is under the pointer.

**The parts rail** runs down the left edge of the bench. Its coloured buttons choose a palette of parts:

- **Free** (orange): free-space optics;
- **Fibre** (red): fibre components;
- **Elec** (amber): electronics;
- **Draw** (purple): drawing tools for figures.

The buttons below the palette open groups of parts.

**The panel** on the right shows whatever is selected. With nothing selected, it shows the whole bench: its parts, notes and settings. With an element selected, it shows that element's settings and readouts.

**The bar** along the top holds the File menu (under the bench's name), **+ Add part**, Undo and Redo, and the View, Sweeps and Help menus.

## The 3D view

<div class="dx-note" markdown="1">
The 3D view is an experimental feature while it is being built. Switch it on under **Help › Experimental features**.
</div>

The **2D / 3D** switch at the bench's top right (or **View › 3D view**) shows the tab in three dimensions. Every part sits at the beam height, 75 mm above a breadboard, and is made from its own numbers: a lens from its surfaces, a mirror from its curvature. The light is drawn as the trace has it: rays as lines, and Gaussian beams as tubes as wide as the beam is, in the bench plane and out of it.

| Mouse (Onshape, the default) | Trackpad |
|---|---|
| Right-drag: turn | Drag: turn |
| Middle-drag, or Ctrl+right-drag: pan | Shift-drag, right-drag or two-finger scroll: pan |
| Scroll: zoom about the pointer | Pinch, or Ctrl+scroll: zoom |
| Click: select (Shift adds) | Click: select (Shift adds) |
| Drag a part: move it | Drag a part: move it |
| Drag its arrow: raise or lower it | Drag its arrow: raise or lower it |
| Right-click: the bench's menu | Right-click: the bench's menu |

Choose between them with the **Mouse** menu on the 3D view's bar. On a touch screen, one finger turns, two pan and pinch to zoom. **F** fits the view to the parts, **Z** zooms to the selection, and **Shift+1** to **Shift+7** give the front, back, left, right, top, bottom and isometric views, as in Onshape. Click a face, edge or corner of the view cube to look from there. **PNG** saves the view as a picture.

**Arranging parts in 3D.** Drag a part to slide it across the table: it snaps to the grid as on the 2D bench, and a selection of several moves together. Right-click a part, or the bench, for the same menu as in 2D: duplicate, copy and paste, rotate, lock, move to another tab and the rest. A part added from **+ Add part** lands where the view is looking, and one dragged from the parts rail lands where it is dropped. Undo and redo work as ever.

**Moving a part along x, y and up.** Click a part and three arrows appear on it: red along the bench's x, green along its y, blue straight up. Drag an arrow to move the part along it alone, snapped to the grid (up in 0.5 mm steps, Shift: 0.1 mm), or type it in **X**, **Y** and **Height** in its panel. The light follows a part's height: a part above or below the beam is missed, and a lens or curved mirror met off its centre turns the beam up or down (see [Free-space optics: heights](/jek/docs/jekray2d/free-space/#heights)). On the 2D bench, a part not at the beam height shows by how much under its name.

**Turning a part about its three axes.** Click the part again and the arrows give way to three rings, each the colour of the axis it turns about, with a knob showing where the part is turned to:

- the blue ring, flat round the part, turns it to face another way (its **Facing**);
- the green ring, upright through the way it faces, tips it up or down about its own across axis, as the vertical knob of a kinematic mount does (its **Tip**);
- the red ring, square to the way it faces, rolls it about its own axis, right-handed (its **Roll**): a cylindrical lens at 45°, a Dove prism turning the image, a waveplate's axis.

Drag a ring (or its knob) round: Shift turns in 15° steps, and Alt a tenth as fast, for fine alignment. Click the part a third time for its arrows again. Two mirrors tipped against each other walk a beam up and leave it level, as on a real bench; two tipped 45°, one over the other, make a periscope. A tipped source sends its light up at that angle. A tipped or rolled part shows by how much under its name on the 2D bench.

The 3D view is a view of the same bench: select a part and its panel opens as usual, and anything you change there shows at once. For now it is for tabs of free-space parts only. A tab with fibre, electronic or chip parts stays 2D; move those parts to a tab of their own, joined by link planes or feedthroughs. Drawings show in 2D only.

## Settings and sweeps

Every number in a panel can be typed or dragged. Beside most is **Sweep**: it moves the value back and forth over a range, and the bench follows as it plays. That is the quickest way to see how a system depends on one thing. The **Sweeps** menu also holds an optimiser and a tolerance study.

## Saving and sharing

- **Autosave.** Your bench is kept in this browser as you work, so closing the tab loses nothing.
- **File › Save as .jekray** saves a file you can open again anywhere.
- **Share link** puts the whole bench in a link. Anyone who opens it sees your bench, and nothing is stored on a server.
- **File › Export layout** saves a PNG, SVG or PDF of the bench for a paper or a talk. **Export layout (current view)** saves just what is on screen.
- With JEKrayPro, benches can be saved to your account, with version history, forks and team workspaces.

## Where to go next

- [Concepts](/jek/docs/jekray2d/concepts/): coordinates, units and the ideas the rest of these pages use.
- [Free-space optics](/jek/docs/jekray2d/free-space/): how rays, beams and fields are worked out.
- The [FAQ](/jek/docs/jekray2d/faq/), for common questions.
