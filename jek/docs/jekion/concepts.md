---
layout: docs
docs: jekion
title: Concepts and units
permalink: /jek/docs/jekion/concepts/
description: The units, coordinates and symmetries JEKion works in, and the ideas (superposition, the array, splats) every page relies on.
---

<p class="dx-lead">The few conventions every other page relies on.</p>

## Units

| Quantity | Unit | Notes |
|---|---|---|
| Length | mm | positions, sizes, the grid spacing |
| Time | µs | a speed is mm/µs, which is km/s |
| Potential | V | an RF amplitude is the swing's amplitude, not peak to peak |
| Energy | eV | kinetic energies and their spreads |
| Mass | u | the electron is 5.486 × 10⁻⁴ u; the species list has common ions |
| Charge | e | negative for electrons and anions |
| Magnetic field | gauss | 10⁴ gauss = 1 T |
| Frequency | MHz | RF, secular and cyclotron frequencies |
| Pressure, temperature | Pa, K | the background gas; 1 Pa = 7.5 mTorr |
| Cross-section | Å² | the hard-sphere collision cross-section |

## Coordinates and symmetry

The bench is x across, y up and z out of the page. The array is a box of nodes a spacing *h* apart in one of three symmetries:

- **Planar**: the x–y plane, and everything is the same along z without end. An electrode's z size is ignored; a rod with its axis along z is an infinitely long rod, the cross-section of a quadrupole. Ions fly in three dimensions still, but the field has no z component.
- **Cylindrical**: the x axis is an axis of symmetry and y is the radius r, so a tube lens or a Paul trap is solved in two dimensions, exactly, and every electrode is a body of revolution about the x axis with its centre on it. The bench draws the x–r half plane whole, mirrored across the axis. Ions fly in three dimensions, their radial field from the array's (x, r).
- **Three dimensions**: everything, at the cost of the cube of the spacing. This is what a CAD import needs.

## Superposition

The potential is linear in the voltages, so each electrode's potential is solved once with it at 1 V and the rest at 0, and the bench's potential is the sum of those scaled by the voltages. Changing a voltage therefore flies the ions again at once; moving or reshaping an electrode, or changing the array, solves again. An RF electrode's swing is a cosine in time multiplied by its own solved potential; electrodes sharing a frequency and phase are summed into one array for speed.

## What ends a flight

A particle **splats** when it enters an electrode (tested against the shape itself, or a CAD body's voxels, with the crossing placed between the last two points); it **leaves** when it crosses the array's edge; a detector set to stop it **catches** it; and the time limit **times it out**. Each is counted and coloured on the bench: red for a splat, blue for a detector, grey for leaving, amber for the time limit.
