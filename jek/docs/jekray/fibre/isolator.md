---
layout: docs
title: Isolator
permalink: /jek/docs/jekray/fibre/isolator/
redirect_from: /jek/docs/jekray2d/fibre/isolator/
description: "The JEKray fibre isolator: forward at its insertion loss, backward only what its isolation lets through."
element: { palette: Fibre, type: fcomp, kind: iso }
---

<p class="dx-lead">A fibre isolator lets light through one way only. It keeps reflections out of a laser and stops an amplifier's light running backwards.</p>

## Ports

Ports **in** and **out**. The tag on the bench shows the way it passes.

## The model

$$
\mathbf S_\text{in, out} = 10^{-\ell/20}\,\mathbf I, \qquad \mathbf S_\text{out, in} = 10^{-X/20}\,\mathbf I,
$$

with $$\ell$$ its insertion loss and $$X$$ its isolation, in dB. Both polarisations are treated alike, as in a polarisation-insensitive isolator.

## Settings

{% include jekray_params.html group="fibre" key="iso" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The loss and isolation are flat in wavelength and the same for both polarisations.
- It adds no delay or phase of its own.
</div>

## Related

- [Circulator](/jek/docs/jekray/fibre/circulator/).
- [Isolator](/jek/docs/jekray/free-space/isolator/), the free-space one, modelled from its polarisers and Faraday rotator.
