---
layout: docs
title: Fibre stretcher
permalink: /jek/docs/jekray/fibre/stretcher/
redirect_from: /jek/docs/jekray2d/fibre/stretcher/
description: "The JEKray piezo fibre stretcher: a phase, set and driven by a voltage, π radians per Vπ."
element: { palette: Fibre, type: fcomp, kind: stretch }
---

<p class="dx-lead">A piezo fibre stretcher, fibre wound on a piezoelectric cylinder. A voltage stretches the fibre and shifts the phase of the light through it. It is the actuator of a fibre interferometer's lock.</p>

## Ports

Ports **1** and **2**, one each side, and an electrical input, **drive**.

## The model

The stretcher adds a phase $$\phi$$, set, and $$\pi$$ radians more for each $$V_\pi$$ volts on its drive $$v$$:

$$
\mathbf S_{12} = \mathbf S_{21} = a\, e^{-i\left(\phi + \pi v/V_\pi\right)}\;\mathbf I,
$$

with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). The phase shows only where the light interferes, as in one arm of a Mach–Zehnder.

### A drive

Wired to the [electronics](/jek/docs/jekray/electronics/), the drive sets the phase through time, worked out quasi-statically (see [Electronics: drives](/jek/docs/jekray/electronics/#drives)). A sine on the drive of an interferometer's arm makes its output swing between the fringes.

## Settings

{% include jekray_params.html group="fibre" key="stretch" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Only the phase changes: the stretch is too small to change the delay the network keeps.
- The response is linear in the voltage and immediate, with no piezo resonance or hysteresis.
</div>

## Related

- [Variable delay line](/jek/docs/jekray/fibre/delay/).
- [Fibre EOM](/jek/docs/jekray/fibre/eom/), for a fast phase.
