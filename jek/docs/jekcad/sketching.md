---
layout: docs
docs: jekcad
title: Sketching
permalink: /jek/docs/jekcad/sketching/
description: "JEKcad's sketcher: the drawing tools, constraints inferred and added, dimensions with units, expressions and variables, fully defined sketches, dragging, trim, fillet, offset, mirror and Use."
---

<p class="dx-lead">A sketch is a set of lines, arcs, circles and points on a plane, held by constraints and dimensions. Its closed regions are what extrudes, revolves, sweeps and lofts turn into solids.</p>

## Where a sketch goes

Click **Sketch**, then a plane or a flat face of a part. If a plane or flat face is already selected, the sketch goes on it straight away. Double-clicking a plane, in the view or in the feature list, starts a sketch on it too. On a face, the sketch's plane follows the face when the model changes.

To sketch at a distance from a plane, first make a **Plane** feature offset from it.

## Drawing

Line, rectangle, circle and arc each have several kinds. The button shows the kind last used, and the arrow beside it lists the others.

| Key | Tool | How |
|---|---|---|
| L | Line | Click each point. Lines chain end to end. Right-click, Esc or a double-click ends the chain, and clicking the chain's first point closes it. |
| | Centre line | A line drawn as construction: an axis to revolve about or to mirror in. |
| | Midpoint line | Its middle, then one end. The middle is held where you clicked. |
| R | Corner rectangle | Two opposite corners. |
| | Centre rectangle | The centre, then a corner. |
| C | Circle | The centre, then a point on it. |
| | 3-point circle | Three points on it. |
| A | 3-point arc | Its two ends, then a point on it. |
| T | Tangent arc | Start at the end of a line or arc, then click where it ends. |
| | Slot | The two centres, then its width. |
| G | Polygon | The centre, then a corner. The number of sides is in the bar. |
| P | Point | A click. Points mark holes. |
| Q | Construction | Turns the selected shapes into construction shapes, or back. With nothing selected, the next shapes drawn are construction. Construction shapes are dashed and make no regions. |

As you draw, JEKcad infers constraints and shows each one as a glyph by the pointer. **●** means coincident with a point, **M** the middle of a line, **⌒** on a curve, **H** horizontal and **V** vertical. A tangent arc is held tangent where it starts.

The same inference reaches the model. Move the pointer within a few pixels of a corner or an edge of a part and the point snaps to it. It also snaps to the middle of a straight edge (**M**) and the centre of a round one (**◎**). Click, and the point is held there: the edge comes into the sketch as a fixed construction line, circle or arc, and the point is constrained to it. A corner comes in as a fixed point. When the model changes and that edge or corner moves, the sketch moves with it.

A first point placed level with the origin, or straight above or below it, is held level or in line with it (**H** or **V** by the pointer). A polygon whose first corner is level with its centre is held that way up.

A line drawn to a circle or an arc, nearly touching it, ends where it touches and is held tangent (**T**). A point placed level with another point, or straight above or below one, is held so; a dashed line runs to the point it is level with. Hold **Shift** while you draw and nothing is inferred.

While you draw, the size of the shape shows by the pointer: a line's length, a rectangle's width and height, a circle's diameter.

## Constraints

Select shapes or points, then click a constraint in the sketch bar:

| Constraint | Select |
|---|---|
| Coincident | Two points, or a point and a curve |
| Horizontal, Vertical | Lines, or two points |
| Parallel, Perpendicular | Two lines |
| Tangent | A line or curve and a circle or arc |
| Equal | Lines (their lengths) or circles and arcs (their radii) |
| Midpoint | A point and a line |
| Concentric | Two circles or arcs |
| Symmetric | Two points and the line between them |
| Fix | Points or shapes, held where they are |

Each constraint shows as a glyph beside what it holds. Click a glyph to select it and press Delete to remove it. A constraint that cannot hold with the others is refused and taken back.

## Dimensions

The quickest dimension is typed as you draw. Click where a line starts, move the pointer the way it should go, type its length and press Enter. The line is made that long and dimensioned, and the next line of the chain starts from its end. A circle takes its diameter the same way. A rectangle takes its width, then Tab or Enter, then its height.

A number typed straight after a shape is drawn, before the pointer moves, dimensions that shape: a line's length, a circle's diameter, an arc's radius, a rectangle's width and then its height. With the select tool, double-click a line, circle or arc to dimension it.

For everything else press **D**, then click:

- a line, then anywhere off it, for its length;
- a circle for its diameter, or an arc for its radius;
- two points, for the distance between them (horizontal or vertical when they line up on screen);
- a point and a line, for the distance from the line;
- two lines, for the angle between them (or the distance, if they are parallel). Where the lines meet, it is the angle inside the corner.

The origin counts as a point. So do the corners of the model, and its straight and round edges count as lines and circles, so a hole can be dimensioned 10 mm from the edge of the part it is cut in.

Type the value in the box that appears and press Enter. Esc takes back a dimension you have just made. Double-click a dimension to change it. With the select tool, drag a dimension's value to move it clear of the drawing.

A value can be a number (millimetres, or degrees for an angle), a number with a unit (`0.5 in`, `2 cm`, `30 deg`, `1 rad`), an expression (`25.4 / 2 + 1`, `sqrt(2) * 10`), or use the **Variables** table (`#width * 5 / 8`). When the value names a variable, the dimension shows both the value and what you typed.

## Fully defined

Shapes that can still move are **blue**. Once their constraints and dimensions fix every number of a shape, it is drawn **in ink**. A fully defined sketch changes only when you change a dimension or a variable.

Select a free point or shape and drag it: the sketch is solved as it moves, keeping every constraint and dimension.

## Changing shapes

| Key | Tool | How |
|---|---|---|
| M | Trim | Click a piece of a shape between the places other shapes cross it, and the piece goes. |
| | Sketch fillet | Click a corner where two lines meet. The radius is in the bar. Anything that held or measured the corner now holds a construction point left where it was. |
| O | Offset | Select shapes, set the distance in the bar (negative for the other side), then click Offset. Copies of lines that met are joined. |
| | Mirror | Select shapes, click Mirror, then click the line to mirror them in. Each copy's points are held symmetric to the original. |
| U | Use | Click edges of the model to project them into the sketch, fixed where they are. A straight or round edge follows the model when it changes. |

Ctrl+C and Ctrl+V copy and paste shapes, with the constraints between them. Ctrl+Z and Ctrl+Shift+Z undo and redo inside the sketch.

Press **Enter**, or click **✓ Finish**, to finish. **Cancel** leaves the sketch as it was before you opened it.

## Regions

The plane is cut by every shape that is not construction. Each closed area this leaves is a region. A circle inside a rectangle makes two regions: the ring, and the disc inside it. Click regions to choose what a feature uses. By default an extrude takes the regions that are not holes in another, so for the ring and disc it takes only the ring.
