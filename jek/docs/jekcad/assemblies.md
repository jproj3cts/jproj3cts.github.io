---
layout: docs
docs: jekcad
title: Tabs and assemblies
permalink: /jek/docs/jekcad/assemblies/
description: "A JEKcad document's tabs: several Part Studios and Assemblies in one file. Inserting parts into an assembly, moving them, and the five mates."
---

<p class="dx-lead">A document holds tabs at the foot of the view, as a JEKray bench does. Each tab is a Part Studio, where parts are made, or an Assembly, where parts are put together.</p>

## Tabs

Click **+** at the end of the tabs to add a Part Studio or an Assembly. Click a tab to open it and double-click it to rename it in place. Drag a tab along the strip to reorder it. The **×** on the open tab deletes it, and a right-click duplicates or deletes.

A document keeps at least one Part Studio. Deleting a Part Studio takes its parts out of every assembly that used them. Undo brings a deleted tab back.

A document with one Part Studio and nothing else is saved as it always was. With more tabs the `.jekcad` file holds them all, and so do a cloud part studio and a share link.

## Putting parts in an assembly

Open an Assembly tab and click **Insert**. The dialog lists the parts of every Part Studio in the document. Click a part to put it in, as many times as you want copies of it.

The first part put in is fixed where its Part Studio has it. The others are set down beside what is there.

| To | Do this |
|---|---|
| Move a part | Drag it in the view. It moves across the screen. |
| Turn a part | Hold Ctrl and drag it. It turns about the line of sight. |
| Place a part by numbers | Click it, then type X, Y, Z and the three turns in the panel under the list. |
| Fix a part, or let it move | Click the pin on its row. |
| Hide a part | Click the eye on its row. |
| Rename a part in the assembly | Double-click its row. |
| Take a part out | Click the bin on its row, or select it and press Delete. |

A part in an assembly is the part in its Part Studio. Change the Part Studio and every assembly that uses the part shows the change.

## Mates

A mate joins a face of one part to a face of another. Click a mate in the bar, click a face on the part that should move, then a face on the part it goes to, and click **✓ Mate**.

A flat face gives a point at its middle and its normal. A round face, such as the wall of a hole or the side of a pin, gives its axis.

| Mate | What it leaves free |
|---|---|
| Fastened | Nothing |
| Revolute | Turning about the axis |
| Slider | Sliding along the axis |
| Cylindrical | Turning about the axis and sliding along it |
| Planar | Sliding on the face and turning on it |

Two flat faces meet face to face. Two round faces line up with their axes the same way. **Flip** turns the part the other way round.

Mates are solved again whenever a part moves, so a dragged part goes only where its mates let it. A mate that cannot hold with the others is refused and nothing changes.

Each mate has a row in the list, with buttons to flip it, suppress it and delete it. A mate remembers its faces: when the part changes in its Part Studio, the mate follows the face.

## What an assembly does not do yet

- Parts are exported from their Part Studio. An assembly has no STEP or STL export.
- Measuring is done in the Part Studio.
- A connector is the middle of a flat face or the axis of a round one. Edges and corners cannot be picked for a mate.
- There are no mate limits, no offsets on a mate, and no check for parts running into each other.
