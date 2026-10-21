---
layout: docs
title: Grating coupler
permalink: /jek/docs/jekray/chips/grating-coupler/
redirect_from: /jek/docs/jekray2d/chips/grating-coupler/
description: "The JEKray grating coupler: the chip's TE mode to a fibre above it, one polarisation, with a band quadratic in dB about its centre."
element: { palette: Photonic, type: pic, kind: gc }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature: sign in to use it (a free account is enough). Switch them on under **Help › Experimental features…**.
</div>

<p class="dx-lead">A grating coupler joins the chip to a fibre above it. Light from the fibre network enters the chip here and leaves it here. It takes one polarisation of the fibre's light, over a band about its centre wavelength.</p>

## Ports

Two: **chip**, joined to the chip's waveguides, and **fibre** (yellow), joined to a fibre.

## The model

The coupling between fibre and chip, in dB, falls off quadratically about the centre $$\lambda_c$$:

$$
T_\text{dB}(\lambda) = T_\text{peak} - \left(\frac{\lambda - \lambda_c}{\Delta\lambda_{1\,\text{dB}}/2}\right)^2,
$$

1 dB down at the edges of its 1 dB band. Its field transmission, the same both ways, is

$$
t(\lambda) = 10^{\,T_\text{dB}(\lambda)/20}.
$$

### Polarisation

The chip carries one mode, TE. From the fibre, the coupler takes the light polarised at its angle $$\theta$$ from s and loses the rest, as a real one does:

$$
E_\text{chip} = t\,(\cos\theta\, E_s + \sin\theta\, E_p),
$$

and light leaving the chip goes into the fibre polarised at $$\theta$$. Put a polarisation controller before it to match the fibre's light to it. To the fibre network, each coupler's fibre side is a port of the chip, with a 2 × 2 Jones matrix on the fibre's (s, p) (see [Photonic chips: solving the chip](/jek/docs/jekray/chips/#solving-the-chip)).

## Settings

{% include jekray_params.html group="pic" key="gc" %}

## Readouts

Its ports and what they join, and the coupling in dB at each laser's wavelength that reaches the chip.

## Assumptions

<div class="dx-warn" markdown="1">
- No back-reflection into the fibre or the chip.
- The band's shape is a parabola in dB at every wavelength, so far from the centre it falls without limit.
- The fibre's angle and position over the grating are not modelled: the peak coupling stands for the best alignment.
</div>

## Related

- [Polarisation controller](/jek/docs/jekray/fibre/polarisation-controller/).
- [Fibre tip](/jek/docs/jekray/free-space/fibre-tip/), how free-space light enters a fibre.
