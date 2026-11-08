---
layout: docs
docs: jekion
title: Introduction
permalink: /jek/docs/jekion/
description: "What JEKion models and how: electrostatic fields of any set of electrodes, solved on a grid, and ions and electrons flown through them and a magnetic field, with RF, a background gas, space charge and detectors."
---

<p class="dx-lead">JEKion is a charged-particle optics simulator used in a web browser, with nothing to install. You bring in the electrodes of a trap from a CAD file, set their voltages, start ions or electrons somewhere with an energy, and it solves the fields and flies the particles: lenses, deflectors, time-of-flight instruments, mass filters and ion traps. It sits beside <a href="/jek/docs/jekray/">JEKray</a>, the optical bench, and shares its accounts, its data export and its way of working.</p>

<div class="dx-tip" markdown="1">
[Open JEKion](/jek/tools/jekion.html) in another tab and try each thing on a bench as you read. The **Examples** gallery has a working bench for every kind of instrument here.
</div>

## How these pages are arranged

1. **Start here.** [Getting started](/jek/docs/jekion/getting-started/) is a first bench and a tour of the window. [Concepts and units](/jek/docs/jekion/concepts/) sets out the units, coordinates and ideas every other page relies on.
2. **The bench.** The [array and its solver](/jek/docs/jekion/array/), then a page each for [electrodes](/jek/docs/jekion/electrodes/), [ion groups](/jek/docs/jekion/ions/) and [detectors](/jek/docs/jekion/detectors/), how the particles are [flown](/jek/docs/jekion/flying/), and [traps](/jek/docs/jekion/traps/) with their analysis.
3. **In and out.** Bringing electrodes in from [CAD](/jek/docs/jekion/cad-import/), [files and examples](/jek/docs/jekion/files/), [exporting data](/jek/docs/jekion/data-export/) and [scripting](/jek/docs/jekion/scripting/).
4. **Help.** The [FAQ](/jek/docs/jekion/faq/).

## What it models

- **Fields.** The electrostatic potential of every electrode together, by finite differences on a grid in planar, cylindrical or three-dimensional symmetry, solved by geometric multigrid. Each electrode's potential is solved once at 1 V and scaled, so a voltage change is instant and an RF electrode swings at its frequency and phase. A uniform magnetic field can be added over the whole array.
- **Particles.** Ions and electrons of any mass and charge, relativistic, integrated by an adaptive Dormand–Prince Runge–Kutta step through the electric and magnetic fields; hard-sphere collisions on a background gas; Coulomb repulsion between the flying particles (space charge); splats on electrodes, detector planes that record each crossing, and the time, energy and position spectra that follow.
- **Traps.** From the field's curvature at a point: the Mathieu *a* and *q* of a Paul trap or a quadrupole mass filter, its stability and secular frequencies; the cyclotron, modified cyclotron, magnetron and axial frequencies of a Penning trap.
- **Geometry.** Boxes, rods, tubes, aperture plates, cones, spheres and a Paul trap's hyperbolic ring and endcaps, each a body of revolution about its axis; or the bodies of a STEP or STL file, each an electrode, so a trap designed in CAD is simulated as drawn.

## What it does not model

Magnetic fields other than a uniform one; induced charges and image forces on the electrodes; field emission, secondary electrons and surface physics; dielectrics; a gas that moves or heats. The grid's staircase on a curved electrode makes the field there a few per cent off at a coarse spacing: the [array page](/jek/docs/jekion/array/) says how to judge it. For anything that gets built, funded or published, reproduce the number in an established package first.
