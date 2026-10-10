---
layout: docs
title: 2×2 MMI
permalink: /jek/docs/jekray2d/chips/mmi-2x2/
description: "The JEKray2D 2×2 multimode interference coupler: a 50:50 coupler with its own excess loss."
element: { palette: Photonic, type: pic, kind: mmi22 }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">A 2 × 2 multimode interference (MMI) coupler is a 50:50 coupler made as a wide multimode section. It is less sensitive to fabrication than a directional coupler, and is used for Mach–Zehnders.</p>

## Ports

Ports **1** and **2** on one side, **3** and **4** on the other, as for a [directional coupler](/jek/docs/jekray2d/chips/directional-coupler/).

## The model

The directional coupler's matrix at $$\kappa = 1/2$$:

$$
S = \frac{a}{\sqrt2}\begin{pmatrix} 0 & 0 & 1 & i \\ 0 & 0 & i & 1 \\ 1 & i & 0 & 0 \\ i & 1 & 0 & 0 \end{pmatrix},
$$

with $$a$$ its excess loss in amplitude, the cross ports leading by a quarter wave.

## Settings

{% include jekray2d_params.html group="pic" key="mmi22" %}

## Readouts

Its ports and what they join, and the powers where the fibre network reaches them.

## Assumptions

<div class="dx-warn" markdown="1">
- An exact 50:50 split at every wavelength, with no reflection.
</div>

## Related

- [Directional coupler](/jek/docs/jekray2d/chips/directional-coupler/) and [1×2 MMI](/jek/docs/jekray2d/chips/mmi-1x2/).
- [Phase shifter](/jek/docs/jekray2d/chips/phase-shifter/), for a Mach–Zehnder's arm.
