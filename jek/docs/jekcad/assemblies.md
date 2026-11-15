---
layout: docs
docs: jekcad
title: Tabs and assemblies
permalink: /jek/docs/jekcad/assemblies/
description: "A JEKcad document's tabs: several Part Studios and Assemblies in one file. Inserting parts into an assembly, moving them, and the five mates."
---

<p class="dx-lead">A document holds tabs at the foot of the view, as a JEKray bench does. Each tab is a Part Studio, where parts are made, an Assembly, where parts are put together, or a [Drawing](/jek/docs/jekcad/drawings/).</p>

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
| Slide or turn a part along an axis | Click it and drag its handle. |
| Place a part by numbers | Click it, then type X, Y, Z and the three turns in the panel under the list. |
| Fix a part, or let it move | Click the pin on its row. |
| Hide a part | Click the eye on its row. |
| Rename a part in the assembly | Double-click its row. |
| Take a part out | Click the bin on its row, or select it and press Delete. |

A part in an assembly is the part in its Part Studio. Change the Part Studio and every assembly that uses the part shows the change.

## Mates

A mate joins a face, an edge or a corner of one part to one of another. Click a mate in the bar, click on the part that should move, then on the part it goes to, and click **✓ Mate**.

A flat face gives a point at its middle and its normal. A round face, such as the wall of a hole or the side of a pin, gives its axis. A straight edge gives its middle and its direction, a round edge its centre and its axis, and a corner gives the corner.

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

## Offsets and limits

A Fastened, Revolute or Planar mate takes an **Offset**: a gap between the two connectors, along the second one's axis. A negative offset sinks the part in.

A Slider or Cylindrical mate takes a least and a most distance along the axis. A Revolute mate takes a least and a most turn in degrees. Leave a limit empty for none. A part dragged past a limit stops at it.

Double-click a mate's row to open it again and change its kind, its faces, its offset or its limits.

## The handle on a part

Click a part that is not fixed and a handle appears at its middle. Drag an arrow to slide the part along that axis. Drag the dot on an arc to turn the part about the axis of the same colour. Red is X, green is Y and blue is Z.

## Measuring, interference and export

Select one or two parts, faces, edges or corners and the measure panel shows them where the assembly has them, with the distance between two.

**Interference** checks every pair of parts that show. Each pair that shares some volume is listed with that volume, and selected in the view. The list clears when the assembly changes.

**File › Export STEP** and **Export STL** write the assembly's parts, where they are placed, as one file. With parts selected only those are written. A hidden part is left out.

## What an assembly does not do yet

- A corner gives a point with no direction of its own, so a mate to a corner lines the part up with the part's own Z.
- There are no gear, rack or screw relations between mates, and no animation of a mate through its limits.
- An exported STEP file holds the parts as separate solids in one file, not as a named assembly tree.
