---
layout: docs
title: Mates and groups in 3D
permalink: /jek/docs/jekray/free-space/mates/
redirect_from: /jek/docs/jekray/free-space/model/
description: Select several parts in JEKray's 3D view and move or turn them as one, group them, and mate a face of one imported object to another's (coincident, concentric, parallel, a distance or an angle).
---

<p class="dx-lead">In the 3D view you can pick several parts and move them as one, and hold two parts together by their faces: a lens mount flush on a post, a pin in a hole, a baffle a set distance from a plate. Objects come onto the bench by importing them (<a href="/jek/docs/jekray/free-space/stl/">STL objects</a>, from .stl or STEP files); mates work on those and on the other free-space parts' bodies.</p>

## Selecting several parts

- **Shift-click** (or Ctrl-click) a part to add it to the selection, or to take it out.
- **Drag across empty space** to select every part whose middle is inside the box. Hold Shift to add them to what is already selected. With the trackpad controls, where a drag turns the view, hold **Alt** and drag.
- A part in a group brings its group.

With several selected, the arrows and rings sit at the middle of their box. The arrows move them all together. Click the arrows (or a selected part) to get the rings: blue turns them about the vertical, green about the bench's y and orange about its x, all about that middle. Parts that can only turn on the table (the fibre, circuit and chip parts) take the blue ring only. Shift turns in 15° steps, and Alt turns ten times finer.

The panel for several parts has **Move and turn them together**. Type how far to move them along x, y and up, or how far to turn them about each axis, then press **Move them** or **Turn them**. Each is one step for Undo.

## Groups

**Group** (on the bar, in the right-click menu, or Ctrl+G) makes the selected parts one group: a click on any of them selects the lot, and they move together. **Ungroup** (Ctrl+Shift+G) frees them. An imported STEP file with several parts comes in as a group.

## Mates

**Mate** on the 3D view's bar starts the mate tool.

1. Click a face of the part that stays where it is. It is shaded orange. As you move the pointer, the face it would pick is shaded.
2. Click a face of the part to move. It is shaded blue.
3. Choose how they meet, set Flip, a distance or an angle if it has one, and press **Mate**.

The second part moves to meet the first, with its group and anything already mated to it. From then on the two move and turn together, as a group does, until the mate is deleted. Esc puts the tool away; right-drag still turns the view while it is out.

What a click picks:

| Under the pointer | What is picked |
|---|---|
| A flat face | The whole flat region round that point, its middle and its outward normal |
| A round face (a hole, a shaft, a lens's rim) | Its axis and radius, fitted to the triangles round it |
| Close to a sharp straight edge (a few pixels) | That edge, along as far as it runs straight |

Hold **Alt** to pick a face even next to an edge. A face that is curved but not round (a sphere, a lens's front) cannot be mated; the tool says so.

The kinds of mate:

| Mate | Two flat faces | A round face or edge and a flat face | Two round faces or edges |
|---|---|---|---|
| **Coincident** | Flush, facing each other | The axis or edge lies in the face | On one line |
| **Concentric** | (not offered) | (not offered) | On one axis |
| **Parallel** | Parallel, nothing moved along them | The axis parallel to the face | The axes parallel |
| **Distance** | Facing each other, this far apart | The axis this far from the face | Parallel, this far apart |
| **Angle** | Their normals at this angle | The axis at this angle to the normal | The axes at this angle |

**Flip** turns the second part's face the other way: two flat faces mated flush then face the same way, and a shaft put concentric goes in end for end. The second part is turned as little as it can be, about its picked face, then moved straight to meet the first; where it was across the face stays as it was.

A mate is kept with the bench (in the file, a share link and the cloud). Each part's panel lists its mates under **Mates**: change a distance, an angle or Flip there, and the part moves to match; × deletes the mate and leaves both parts where they are. A mate that cannot be met says why: a part locked in place, a part that would go below the table, a part that only turns on the table, or two parts already held together another way (a group, or another mate).

Typing a part's X, Y, Z, Angle, Tip or Roll in its panel moves what is mated to it too. Copying mated parts together copies their mate.

## Parts modelled in earlier versions

Earlier versions of JEKray had Model tools in the 3D view, for sketching parts and extruding them. They have been taken out. A bench with a part made that way opens with the part as a fixed STL object, its triangles as they were, in the same place and turned the same way. It traces as before, and it can be mated, but it can no longer be changed by its sketches.
