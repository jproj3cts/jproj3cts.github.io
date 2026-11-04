---
layout: docs
docs: jekion
title: Detectors
permalink: /jek/docs/jekion/detectors/
description: "A plane across an axis that records every particle crossing it: position, time, energy and direction; the spot, time-of-flight and energy spectra it gives."
---

<p class="dx-lead">A detector is a plane across one axis, square of a given half-width (0 for a plane without edges), recording every particle that crosses it.</p>

Each crossing is placed by interpolation between the two points of the step on either side of the plane and recorded with its position, time, energy and direction (the proper velocity's three components, mm/µs). A detector that **stops** the ions it catches is a screen or a multiplier's face; one that does not is a slice through the beam, a phase space at that plane, and the particles carry on.

The detector's panel shows, for the last flight, how many it caught, the mean time of flight and its spread, the mean energy and the rms radius of the spot, with the **spot** (a scatter of the crossings across the plane, coloured by group), the **time-of-flight** spectrum and the **energy** spectrum as histograms, each with PNG and CSV buttons (a free account). The [data export](/jek/docs/jekion/data-export/) writes every crossing as a table.
