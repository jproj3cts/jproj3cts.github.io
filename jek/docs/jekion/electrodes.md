---
layout: docs
docs: jekion
title: Electrodes
permalink: /jek/docs/jekion/electrodes/
description: "Every electrode shape JEKion has, its settings, its voltage and RF, and how the shapes are painted into the array."
---

<p class="dx-lead">An electrode is a conductor at a voltage. Its shape and place set the geometry; the solver works out the potential everywhere from all of them together.</p>

## Voltage and RF

**Voltage** is the static part. With **RF** on, an amplitude, frequency and phase add amp · cos(2πft + φ) to it: an electrode of a Paul trap, a quadrupole mass filter's rods (the opposite pair at phase 180°), an RF funnel. The voltage changes fly the ions again at once; the shape and place solve the array again.

## The shapes

Every shape but the box and a CAD body is a body of revolution about its own axis (x, y or z through its centre); in a cylindrical array the axis is x and the centre on it.

| Shape | Settings | Notes |
|---|---|---|
| Box / plate | sizes along x, y, z | aligned with the axes; a thin one is a plate |
| Rod | radius, length | a quadrupole or multipole rod, a wire |
| Tube | inner and outer radius, length | a drift tube, an einzel lens element |
| Aperture plate | hole radius, plate radius, thickness | an extraction or lens aperture, a skimmer |
| Cone | radius at the start and the end, length, wall (0 for solid) | a skimmer, a funnel element |
| Sphere | radius | |
| Hyperbolic ring | r₀, outer radius, height | a Paul trap's ring: its inner face r² − 2z² = r₀² about the trap's centre |
| Hyperbolic endcap | z₀, outer radius, height, side (+1 or −1) | its face 2z² − r² = 2z₀²; with r₀² = 2z₀² the trap is the ideal quadrupole |
| CAD body | brought in from a file | [CAD import](/jek/docs/jekion/cad-import/) |

**Transparent grid** makes an electrode a mesh of high transmission: it shapes the field as any electrode does, but particles pass through it, as the grids of a time-of-flight source or a reflectron's entrance do; the bench draws it faint and dashed. **Duplicate** and **Mirror in x** (Edit, or the panel) make the other half of a symmetric lens or trap. **In the array** unticked leaves an electrode out of the solution but keeps it in the file.

## How they are painted

Each node of the array inside a shape is fixed at the shape's voltage (the shape's own test, exact for the primitives), so a curved face comes out as a staircase a node high; a plate thinner than the spacing still paints the nodes it covers, and a plate that falls between nodes paints none, so the panel warns of an electrode the grid never touches. A CAD body is filled row by row from where its triangles cross each row. The [array page](/jek/docs/jekion/array/) says how to judge the staircase; the ions' splats are tested against the shape itself, not the staircase.
