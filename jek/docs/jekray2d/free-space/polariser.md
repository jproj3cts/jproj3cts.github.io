---
layout: docs
title: Polariser
permalink: /jek/docs/jekray2d/free-space/polariser/
description: The JEKray2D linear polariser, an ideal projector onto its transmission axis.
element: { palette: Free space, type: polariser }
---

<p class="dx-lead">A linear polariser passes the light polarised along its transmission axis and absorbs the rest. Rays pass straight through; their power falls by Malus's law.</p>

## The model

A polariser is a thin plane across the beam. With its transmission axis at $$\theta$$ from p, it projects the Jones vector $$(E_p, E_s)$$ onto that axis:

$$
J(\theta) = \begin{pmatrix} \cos^2\theta & \cos\theta\sin\theta \\ \cos\theta\sin\theta & \sin^2\theta \end{pmatrix}.
$$

At 0° it passes p, and at 90° it passes s. Linear light at an angle $$\phi$$ to the axis keeps the share

$$
\frac{P_\text{out}}{P_\text{in}} = \cos^2\phi
$$

of its power (Malus's law). Unpolarised light, two launches s and p, keeps half.

The matrix acts on each ray and on each sample of the diffracted field.

A polariser rolled about its normal by its **Roll** $$\rho$$ turns its axis with it, as a [waveplate](/jek/docs/jekray2d/free-space/waveplate/) does: at $$\theta$$ rolled $$\rho$$, it acts as one at $$\theta - \rho$$ for light along its normal. Rolled $$90°$$, a polariser along p passes s. One rolled with a rolled source passes all of its light.

## Settings

{% include jekray2d_params.html group="free" key="polariser" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The polariser is ideal: it passes all of the light along its axis and none across it. For a finite extinction ratio, use a polarising [beam splitter](/jek/docs/jekray2d/free-space/cube/) with its leakage set, or a [crystal](/jek/docs/jekray2d/free-space/crystal/) polariser.
- It has no thickness, and works at every wavelength and angle alike.
</div>

## Related

- [Waveplate](/jek/docs/jekray2d/free-space/waveplate/).
- [Isolator](/jek/docs/jekray2d/free-space/isolator/), two polarisers round a Faraday rotator.
