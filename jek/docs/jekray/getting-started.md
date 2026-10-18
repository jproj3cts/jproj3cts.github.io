---
layout: docs
title: Getting started
permalink: /jek/docs/jekray/getting-started/
redirect_from: /jek/docs/jekray2d/getting-started/
description: Your first bench in JEKray, the parts of the window, the 3D view, sweeps, and saving and sharing your work.
---

<p class="dx-lead">A first bench (a laser, a lens and a screen), then a tour of the window, the 3D view, sweeps, and how to keep and share what you make.</p>

## A first bench

1. Open [JEKray](/jek/tools/jekray.html). A new bench is empty; if it isn't, choose **File › New bench**.
2. Click **+ Add part** (or press **A**), choose **Source**, and click the bench to place it. A fan of rays leaves it to the right.
3. Add a **Lens** about 50 mm to the right of the source, and a **Screen** beyond it, facing back towards the light.
4. Drag the screen along the beam. Its panel on the right shows the spot it records, smallest at the lens's focus.

<div class="dx-tip" markdown="1">
Every bench in the **Examples** gallery works. Open one, change it, and press **Ctrl+Z** to undo. Your own bench comes back with Undo after an example has replaced it.
</div>

## The window

**The bench** is the large dark area. Drag a part to move it, drag its round handle to turn it, and scroll to zoom. Drag on empty bench to select several parts with a box. Right-click for a menu of what you can do with what is under the pointer.

**The parts rail** runs down the left edge. Its coloured buttons choose a palette: **Free space** (orange), **Fibre** (red), **Electronics** (amber), **RF** (yellow, millimetre-wave horns, lenses and mesh filters) and **Draw** (purple, drawing tools for figures). The buttons below open the palette's groups of parts.

**The panel** on the right shows whatever is selected. With nothing selected it shows the whole bench: its parts, notes and settings. A panel's sections fold under their headings, and the longer explanations sit under **About this part** at the foot. The pin at its top keeps it open while you select other things; **×** closes it (**View › Show the side panel** brings it back).

**The bar** along the top holds the File menu (under the bench's name), **+ Add part**, Undo and Redo, and the View, Sweeps and Help menus. **Save** shows a dot when the bench has changed since it was opened or saved. On a phone the bar is one row: the name, **+**, **Save** and **⋯**, a menu holding the rest.

**How the light is drawn** is set for the whole bench under **Light** in the Bench panel (the gear at the bench's bottom right): ticks for the rays, the Gaussian beams' envelope and their diffracted field. The field's intensity scale is linear, or logarithmic over 30 or 60 dB. With both on, the envelope marks the field's 1/e² edge. Rays and envelopes are drawn as bright as the power they carry.

## The 3D view

For a first go, take the tour under **Help › Build a periscope in 3D**: it builds a periscope step by step, tipping two mirrors with their rings.

The **2D / 3D** switch at the bench's top right (or **View › 3D view**) shows the tab in three dimensions. Every part sits at the beam height, 75 mm above a breadboard, and is built from its own numbers: a lens from its surfaces, a mirror from its curvature. The light is drawn as the trace has it: rays as lines, Gaussian beams as tubes as wide as the beam, in the bench plane and out of it. The diffracted field glows along each beam, each point showing the irradiance summed along that line of sight against the key at the bottom left; point at it to read the value. A tight focus is far brighter than its beam, so choose 60 dB to see both. On a slow computer, untick the field.

| Mouse (the default) | Trackpad |
|---|---|
| Right-drag: turn | Drag: turn |
| Middle-drag, or Ctrl+right-drag: pan | Shift-drag, right-drag or two-finger scroll: pan |
| Scroll: zoom about the pointer | Pinch, or Ctrl+scroll: zoom |
| Click: select (Shift adds); again: its rings | Click: select (Shift adds); again: its rings |
| Drag a part: move it | Drag a part: move it |
| Drag an arrow or a ring: move or turn it | Drag an arrow or a ring: move or turn it |
| Right-click: the bench's menu | Right-click: the bench's menu |

Choose between them with the **Mouse** menu on the 3D view's bar. On a touch screen one finger turns, two pan and pinch to zoom. **F** fits the view, **Z** zooms to the selection, and **Shift+1** to **Shift+7** give the front, back, left, right, top, bottom and isometric views, as does clicking a face, edge or corner of the view cube. **PNG** saves the view as a picture. The eye beside each part in the Bench panel's list hides it in 3D, to see past a housing; the light still meets it.

**Arranging parts.** Drag a part to slide it across the table, snapped to the grid as in 2D; a selection moves together. The right-click menu is the same as in 2D. A part added from **+ Add part** lands where the view is looking, one dragged from the rail where it is dropped. Mounts, posts and housings come in as .stl files: **File › Import an object (.stl)…**, or drop the file on the bench. Each is an opaque [STL object](/jek/docs/jekray/free-space/stl/) that stops the light.

**Moving a part along x, y and up.** Click a part and three double-ended arrows appear: orange along the bench's x, green along its y, blue straight up. Drag an arrow to move the part along it alone, snapped to the grid (up in 0.5 mm steps, Shift for 0.1 mm), or type **X**, **Y** and **z** in its panel, each sweepable. The light follows a part's height: a part above or below the beam is missed, and a lens or curved mirror met off its centre turns the beam up or down (see [Heights](/jek/docs/jekray/free-space/#heights)). On the 2D bench a part not at beam height shows by how much under its name.

**Turning a part about its three axes.** Click the part again for three rings, each the colour of the axis it turns about:

- the blue ring, flat round the part, turns it to face another way (**Facing**);
- the green ring tips it up or down about its own across axis, as a kinematic mount's vertical knob does (**Tip**);
- the orange ring rolls it about its own axis, right-handed (**Roll**): a cylindrical lens at 45°, a Dove prism, a waveplate's axis.

Drag a ring by its dot or anywhere on it; Shift turns in 15° steps and Alt a tenth as fast. Click the part a third time for its arrows again. Two mirrors tipped 45°, one over the other, make a periscope; a tipped source sends its light up at that angle. A tipped or rolled part shows by how much under its name in 2D.

The 3D view is a view of the same bench: select a part and its panel opens as usual, and anything changed there shows at once. Free-space parts are drawn in 3D; fibre, electronic and chip parts and drawings show in 2D only, though their light still leaves and reaches the free-space parts.

## Settings and sweeps

Every number in a panel can be typed or dragged. Beside most is the sweep button, **∿**: it moves the value back and forth over a range, and the bench follows as it plays. A swept number shows its sweep folded to one line with Play; click the line, or ∿, to edit it. That is the quickest way to see how a system depends on one thing. The **Sweeps** menu plays and pauses every sweep, and holds **Optimise the bench…** and **Tolerance the bench…**, an optimiser and a Monte Carlo study over the swept values.

## Saving and sharing

- **Autosave.** Your bench is kept in this browser as you work, so closing the tab loses nothing.
- **File › Save as .jekray** saves a file you can open again anywhere.
- **Share link** (on the bar, or **File › Copy a share link**) puts the whole bench in a link. Anyone who opens it sees your bench, and nothing is stored on a server.
- **File › Export layout** saves a PNG, SVG or PDF of the bench for a paper or a talk; **Export layout (current view)** saves just what is on screen.
- With JEKrayPro, benches can be saved to your account, with version history, forks and team workspaces.

## Where to go next

- [Concepts](/jek/docs/jekray/concepts/): coordinates, units and the ideas the rest of these pages use.
- [Free-space optics](/jek/docs/jekray/free-space/): how rays, beams and fields are worked out.
- [Lens design](/jek/docs/jekray/lens-design/) and [RF](/jek/docs/jekray/rf/): the two design workspaces.
- The [FAQ](/jek/docs/jekray/faq/), for common questions.
