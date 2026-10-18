---
layout: docs
title: Variable delay line
permalink: /jek/docs/jekray/fibre/delay/
redirect_from: /jek/docs/jekray2d/fibre/delay/
description: "The JEKray variable delay line: a delay in picoseconds, the path it adds, and the phase that path gives."
element: { palette: Fibre, type: fcomp, kind: delay }
---

<p class="dx-lead">A variable delay line adds a set delay to the light: free space inside a fibre-coupled housing, so its group and phase delays are one. It sets the delay between two arms, to find white-light fringes or overlap pulses.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

A delay $$\tau$$ (ps) is a path $$L = c\tau$$ in air. The light through it is delayed by that path in the network and takes the phase it gives:

$$
\mathbf S_{12} = \mathbf S_{21} = a\, e^{-i 2\pi L/\lambda}\;\mathbf I,
$$

with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). The delay is kept with the light, so it changes how the network weighs two paths by the laser's coherence (see [Fibre optics: solving the network](/jek/docs/jekray/fibre/#solving-the-network)). Sweep it in an interferometer lit by broadband light and the fringes appear where the two arms are equal, within the source's coherence length.

## Settings

{% include jekray_params.html group="fibre" key="delay" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The path inside is air with no dispersion, so group and phase delay are the same.
- The loss does not change with the delay, as a real one's coupling would a little.
</div>

## Related

- [Fibre stretcher](/jek/docs/jekray/fibre/stretcher/), for a phase without a delay.
- [Fibre laser](/jek/docs/jekray/fibre/laser/), for the coherence that sets how far the fringes reach.
