---
layout: docs
title: Faraday rotator
permalink: /jek/docs/jekray/free-space/faraday/
redirect_from: /jek/docs/jekray2d/free-space/faraday/
description: The JEKray Faraday rotator, a non-reciprocal polarisation rotator.
element: { palette: Free space, type: faraday }
---

<p class="dx-lead">A Faraday rotator turns linear polarisation by a set angle, the same way in the lab whichever way the light crosses it. Light that goes through and comes back is turned twice over, not undone: that is what makes isolators and Faraday mirrors work.</p>

## The model

A Faraday rotator is a thin plane across the beam, with a magnetic field along its normal. In the lab, it rotates the field by $$\beta$$ about the direction of the magnetic field, whichever way the light travels. In the light's own frame, that is a rotation of $$+\beta$$ or $$-\beta$$:

$$
R(\pm\beta) = \begin{pmatrix} \cos\beta & \mp\sin\beta \\ \pm\sin\beta & \cos\beta \end{pmatrix},
$$

with the sign set by the direction of travel against the field, and by the parity of the ray's p axis, which flips at each reflection (see [Concepts: polarisation](/jek/docs/jekray/concepts/#polarisation)).

So light that crosses a 45° rotator, reflects from a mirror and crosses back comes back turned by 90°, not by 0° as it would through a waveplate. A reciprocal element can't do that. The rotator is non-reciprocal, as it should be.

A rotation commutes with any other turn about the beam, so rolling a Faraday rotator about its normal changes nothing.

## Settings

{% include jekray_params.html group="free" key="faraday" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The rotation is the same at every wavelength. A real rotator's Verdet constant changes with wavelength.
- The rotator is thin and lossless.
</div>

## Related

- [Isolator](/jek/docs/jekray/free-space/isolator/), a rotator between two polarisers.
- The fibre Faraday mirror, a 45° rotator and a mirror, which undoes a fibre's birefringence on the way back.
