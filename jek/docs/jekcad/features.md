---
layout: docs
docs: jekcad
title: Features
permalink: /jek/docs/jekcad/features/
description: "JEKcad's features: extrude, revolve, sweep, loft, fillet, chamfer, shell, hole, linear and circular patterns, mirror, boolean and offset plane, and the Variables table."
---

<p class="dx-lead">Each feature has a dialog with its settings and the things it uses. Click a selection box to make it active, then click the regions, faces, edges or parts it takes in the view. The feature's result is drawn over the model while you edit it: green where it adds material, red where it cuts.</p>

Every number takes units, expressions and `#variables`, as in a sketch's dimensions. **✓ OK**, or Enter, puts the feature in the list at the rollback bar. **Cancel**, or Esc, leaves the list as it was.

## Making solids

**Extrude** pushes sketch regions along their plane's normal.

- **New** makes new parts. **Add** joins them to the parts they touch, **Remove** cuts them away, and **Intersect** keeps only what they share. For Add, Remove and Intersect you can name the parts to change; otherwise every part is.
- **End:** Blind (a depth), Symmetric (half each way), Up to face, or Through all. Remove goes against the sketch's normal unless you choose Opposite direction, so a cut sketched on a part's face goes into the part.
- **Second end position** extrudes the other way as well, with its own end.
- **Draft angle** tapers the sides.

**Revolve** turns regions about a line of the same sketch: Full, One direction (an angle) or Symmetric. Draw the axis as a construction line.

**Sweep** carries a profile's regions along a path, which is another sketch whose shapes join end to end.

**Loft** makes a solid through two or more profiles, in the order you click them. Each profile is a region of a different sketch, usually on parallel planes. **Ruled** joins them with straight sides.

## Changing solids

**Fillet** rounds edges and **Chamfer** bevels them. Choosing a face takes all its edges. The rounding follows on along edges that meet tangentially, so a fillet chosen on one edge of a rounded outline runs all the way round.

**Shell** hollows a part. Choose the faces to remove and the wall thickness, inward unless you choose Thicken outward.

**Hole** puts a hole at each point of a sketch, drilled against the sketch's normal: Simple, Counterbore or Countersink, blind or through all. A blind hole can end in a 118° drill tip.

## Patterns and copies

**Linear pattern** repeats features or parts along x, y, z or an edge. Set the number of instances, the original included, and the spacing.

**Circular pattern** repeats them about x, y, z or an edge, which can be straight or round (its axis). Set the instances and the angle; 360° spaces them equally round.

**Mirror** copies features or parts across a plane or a flat face.

You can pattern or mirror extrudes, revolves, sweeps, lofts and holes as features. Each copy does what the original did (adds, cuts), so a pattern of a hole is a row of holes. A fillet or chamfer cannot be patterned on its own; pattern the part instead.

**Boolean** joins parts (Union), cuts tools from parts (Subtract), or keeps what they share (Intersect). Keep the tools leaves the tool parts in place after a subtract or intersect.

**Plane** makes a plane offset from a standard plane, another Plane or a flat face, for sketches and mirrors.

## The Variables table

**Edit › Variables** lists the variables: each has a name, an expression and a kind (length, angle or number). A variable can use the ones above it. Use one anywhere as `#name`. When you change it, every dimension and field that uses it follows, and the part is rebuilt.

## When the model changes

Faces carry names from the feature that made them: an extrude's sides are named after the sketch shapes they came from, and its ends are start and end. The names are carried through every later feature. A fillet's edge is remembered as the two faces it lies between, so edits lower in the list keep the right edges. If a face or edge a feature used is gone, the feature fails and says so. Edit it and choose again.

## Parts

Each solid is a part, listed under the features. Double-click a part's name to rename it. Its swatch sets its colour, and its material sets its density, from which the measure box gives its mass. A part's **⋯** exports it alone as STEP or STL.
