---
layout: docs
title: Phase shifter
permalink: /jek/docs/jekray2d/chips/phase-shifter/
description: "The JEKray2D on-chip phase shifter: a length of waveguide with a phase you set, to tune a Mach–Zehnder or a ring."
element: { palette: Photonic, type: pic, kind: ps }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">A phase shifter is a section of waveguide with a phase you set, as a heater or an electro-optic section gives. It tunes a Mach–Zehnder between its outputs, or a ring's resonance.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

The section is a waveguide of its length $$\ell$$, with the phase $$\phi$$ added:

$$
S_{12} = S_{21} = 10^{-\alpha\ell/20}\,\exp\!\left(-\frac{i 2\pi\, n_\text{eff}(\lambda)\,\ell}{\lambda}\right) e^{-i\phi},
$$

with the waveguide's loss $$\alpha$$ (dB/cm) and its effective index to first order in wavelength (see [Photonic chips: waveguides](/jek/docs/jekray2d/chips/#waveguides)). The phase is the same at every wavelength. Give it a sweep to swing a Mach–Zehnder through its fringes.

## Settings

{% include jekray2d_params.html group="pic" key="ps" %}

Also *wg*: `si`, `sin` or `custom`, the waveguide preset.

## Readouts

Its ports and what they join, and the powers where the fibre network reaches them.

## Assumptions

<div class="dx-warn" markdown="1">
- The phase is set directly: no heater power, no thermal crosstalk to its neighbours, and no loss that comes with a carrier-based shifter.
- It has no electrical input: the phase is a setting, swept rather than driven by the electronics.
</div>

## Related

- [Fibre stretcher](/jek/docs/jekray2d/fibre/stretcher/), its fibre counterpart, which can be driven.
- [2×2 MMI](/jek/docs/jekray2d/chips/mmi-2x2/) and [directional coupler](/jek/docs/jekray2d/chips/directional-coupler/).
