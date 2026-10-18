---
layout: docs
title: Fibre AOM
permalink: /jek/docs/jekray/fibre/aom/
redirect_from: /jek/docs/jekray2d/fibre/aom/
description: "The JEKray fibre-coupled acousto-optic modulator: the output fibre takes the shifted order, f higher or lower, and an RF input sets how much."
element: { palette: Fibre, type: fcomp, kind: aom }
---

<p class="dx-lead">A fibre-coupled acousto-optic modulator: a Bragg cell between two fibres. The output fibre takes the diffracted order, shifted in frequency by the drive. It makes a heterodyne interferometer's frequency offset, or a fast switch.</p>

## Ports

Ports **in** and **out**, and an electrical input, **rf**.

## The model

The sound in the cell, at the drive frequency $$f$$, makes a moving grating. The output fibre is aligned to take the order chosen, which is Doppler shifted:

$$
\nu_\text{out} = \nu_\text{in} \pm f,
$$

higher for order +1, lower for −1. The light that is not shifted (order 0) is dumped, and is part of the insertion loss. So

$$
\mathbf S_\text{in, out} = 10^{-\ell/20}\sqrt{\eta}\;\mathbf I, \qquad \text{shift } \pm f,
$$

with $$\ell$$ the insertion loss (dB) and $$\eta$$ the share of the full drive (1 with no RF input wired). Light going back from *out* to *in* is shifted the same way again, so a double pass, through the AOM to a mirror and back, is shifted by $$\pm 2f$$, as in a free-space double-pass AOM.

The shifted light makes no steady fringes with the unshifted light of its laser, but beats with it on a photodiode at $$f$$ (see [Fibre photodetector](/jek/docs/jekray/fibre/photodetector/)).

### A drive

Wired to the [electronics](/jek/docs/jekray/electronics/), the RF input sets the share diffracted through time:

$$
\eta = \sin^2\!\left(\frac{\pi}{2}\,\frac{v}{V_\text{full}}\right),
$$

with $$V_\text{full}$$ the RF level, in volts, for full efficiency (1 V to begin with). So 0 V passes nothing, and the AOM is an amplitude modulator or a switch.

## Settings

{% include jekray_params.html group="fibre" key="aom" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Only the chosen order reaches the output fibre; the coupling into it does not change with the drive frequency.
- There is no rise time: the drive acts at once on the light.
</div>

## Related

- [AOM](/jek/docs/jekray/free-space/aom/), the free-space Bragg cell.
- [Fibre EOM](/jek/docs/jekray/fibre/eom/).
