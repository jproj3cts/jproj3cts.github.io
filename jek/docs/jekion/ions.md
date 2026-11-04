---
layout: docs
docs: jekion
title: Ion groups
permalink: /jek/docs/jekion/ions/
description: "A group of particles started together: species, energy and its spread, where they start and how they spread, their direction and cone, their timing, and what they stand for with space charge."
---

<p class="dx-lead">An ion group is a bunch of particles started together, flown through the fields.</p>

**What flies.** A species from the list (electron, proton, He⁺, N₂⁺, Ar⁺, Ca⁺, Rb⁺, Sr⁺, Cs⁺, Yb⁺, Hg⁺ …) or a custom mass (u) and charge (e). **Count** is how many are flown, up to 5000. **Energy** is the kinetic energy, eV, with a Gaussian spread of the given FWHM.

**Where from.** A point, and a spread about it: a **disc** (across the direction, of the radius given), a **ball**, a **line** across the direction (half-length), a **Gaussian cloud** (σ), or **evenly along a line**, which puts the count at equal steps across it, for a clean fan through a lens. The **direction** is an angle in the x–y plane from +x and, in a three-dimensional array, an elevation out of the plane; the **cone half-angle** spreads the directions uniformly over that solid angle. The **start time** and a uniform **start spread** stagger the starts, so a time-of-flight spectrum shows its source's width.

**Space charge.** With space charge on (Bench settings › Flying), every particle stands for the group's **real charges a particle** and every one feels the Coulomb field of the others; the [flying page](/jek/docs/jekion/flying/) has the details.

The starting points, directions, energies and times are drawn from a seeded random generator (the seed is a bench setting), so the same bench flies the same particles every time; change the seed for another sample. The group's panel shows the last flight's ends, energy and time histograms.
