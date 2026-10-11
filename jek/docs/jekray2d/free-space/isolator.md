---
layout: docs
title: Isolator
permalink: /jek/docs/jekray2d/free-space/isolator/
description: The JEKray2D optical isolator, a polariser, a 45° Faraday rotator and a second polariser, passing light one way only.
element: { palette: Free space, type: isolator }
---

<p class="dx-lead">An optical isolator passes light travelling one way and blocks light travelling back. It is a polariser, a 45° Faraday rotator and a second polariser at 45° to the first, met in the order the light meets them.</p>

## The model

The isolator's angle is its forward direction. With its input polariser at $$\theta$$ from p, its parts are, in the light's frame:

- an input polariser $$P_1$$ along $$\theta$$;
- a Faraday rotator $$R(\pm 45°)$$, non-reciprocal (see [Faraday rotator](/jek/docs/jekray2d/free-space/faraday/));
- an output polariser $$P_2$$ along $$\theta + 45°$$.

Forwards, light meets them in that order:

$$
J_\text{fwd} = P_2\, R(45°)\, P_1.
$$

Light polarised along the input polariser turns by 45° onto the output polariser's axis, and passes. Backwards, the light meets the parts in the opposite order: $$P_2$$, then the rotator, then $$P_1$$. The rotator turns the light a further 45° the same way in the lab, rather than turning it back, so the light arrives at 90° to the input polariser, which blocks it. In the returning light's own frame, the rotation and the polarisers' angles all change sign, which is how the tracer works it out.

The polarisers are not perfect. Each leaks the field across its axis in amplitude

$$
\epsilon = 10^{-X/20},
$$

for an extinction of $$X$$ dB, so the isolation is finite, as in a real one.

An isolator rolled about its axis by its **Roll** turns both its polarisers with it, as a rolled [polariser](/jek/docs/jekray2d/free-space/polariser/) does. The rotation in between is the same however it is rolled.

## Settings

{% include jekray2d_params.html group="free" key="isolator" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The rotation is exactly 45° at every wavelength.
- The isolator is polarisation-dependent: unpolarised light loses half its power forwards. A polarisation-independent isolator (with walk-off crystals) is not modelled as one part.
- It is thin, and has no insertion loss beyond its polarisers.
</div>

## Related

- [Faraday rotator](/jek/docs/jekray2d/free-space/faraday/).
- The [fibre isolator](/jek/docs/jekray2d/fibre/isolator/), the same idea in a fibre network.
