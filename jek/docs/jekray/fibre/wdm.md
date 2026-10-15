---
layout: docs
title: WDM
permalink: /jek/docs/jekray/fibre/wdm/
redirect_from: /jek/docs/jekray2d/fibre/wdm/
description: "The JEKray wavelength-division multiplexer: a flat-topped pass band between the common and pass ports, everything else to the rest port."
element: { palette: Fibre, type: fcomp, kind: wdm }
---

<p class="dx-lead">A wavelength-division multiplexer sorts light by wavelength. Its pass band goes between the common port and the pass port, everything else between the common port and the rest port. It combines a pump with a signal in an amplifier, or separates channels.</p>

## Ports

Port **common** on one side; ports **pass** and **rest** on the other.

## The model

The pass band is flat-topped, a super-Gaussian of order six about the centre $$\lambda_c$$, with a full width at half maximum $$w$$:

$$
T(\lambda) = \exp\!\left(-\ln 2\left(\frac{2\,\lvert\lambda - \lambda_c\rvert}{w}\right)^{6}\right).
$$

What it passes goes one way and the rest the other, both ways:

$$
\mathbf S_\text{common, pass} = a\sqrt{T}\;\mathbf I, \qquad \mathbf S_\text{common, rest} = a\sqrt{1 - T}\;\mathbf I,
$$

with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). Without loss it is lossless at every wavelength: what does not take one port takes the other.

## Settings

{% include jekray_params.html group="fibre" key="wdm" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The band edges are the super-Gaussian's, adding no phase across the band, and the same for both polarisations.
- No light passes between the pass and rest ports.
</div>

## Related

- [Tunable filter](/jek/docs/jekray/fibre/tunable-filter/) and [fibre Bragg grating](/jek/docs/jekray/fibre/bragg-grating/).
- [Fibre amplifier](/jek/docs/jekray/fibre/amplifier/).
