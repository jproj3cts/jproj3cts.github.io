---
layout: docs
title: Waveplate
permalink: /jek/docs/jekray2d/free-space/waveplate/
description: The JEKray2D waveplate, a thin retarder of any retardance and fast-axis angle, as a Jones matrix.
element: { palette: Free space, type: waveplate }
---

<p class="dx-lead">A waveplate delays one polarisation against the other: a quarter-wave plate turns linear light circular, and a half-wave plate rotates linear light. Rays pass straight through it; only their polarisation changes.</p>

## The model

A waveplate is a thin plane across the beam. It retards the polarisation along its slow axis by $$\Gamma$$ waves against the polarisation along its fast axis. With its fast axis at $$\theta$$ from p, on the Jones vector $$(E_p, E_s)$$ it is

$$
J(\theta, \Gamma) = \begin{pmatrix} \cos^2\theta + e^{i2\pi\Gamma}\sin^2\theta & \left(1 - e^{i2\pi\Gamma}\right)\cos\theta\sin\theta \\ \left(1 - e^{i2\pi\Gamma}\right)\cos\theta\sin\theta & \sin^2\theta + e^{i2\pi\Gamma}\cos^2\theta \end{pmatrix}.
$$

- A **quarter-wave plate** ($$\Gamma = 1/4$$) at 45° turns linear light circular, and circular light linear.
- A **half-wave plate** ($$\Gamma = 1/2$$) at $$\theta$$ rotates linear light by $$2\theta$$.
- Any other retardance gives elliptical light.

The matrix acts on each ray, and on each sample of the diffracted field, so a waveplate changes what interferes with what, and how a polarising beam splitter after it divides the light.

With the experimental 3D view on, a waveplate rolled about its normal by its **Roll** $$\rho$$ turns its axis with it. The roll is counted right-handed about the part's normal, the opposite way to $$\theta$$, so for light along its normal a plate at $$\theta$$ rolled $$\rho$$ acts as one at $$\theta - \rho$$. A plate rolled with a rolled source keeps the same angle to its light.

## Settings

{% include jekray2d_params.html group="free" key="waveplate" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The retardance is taken as given at every wavelength: a zero-order, achromatic plate. A real multi-order plate's retardance changes with wavelength.
- The plate has no thickness, so it adds no optical path and no refraction.
- The retardance does not change with the angle of incidence.
</div>

## Related

- [Polariser](/jek/docs/jekray2d/free-space/polariser/).
- [Beam splitter](/jek/docs/jekray2d/free-space/cube/): a half-wave plate before a polarising cube makes a variable splitter.
- [Free-space optics: polarisation along a ray](/jek/docs/jekray2d/free-space/#polarisation-along-a-ray).
