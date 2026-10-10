---
layout: docs
title: Attenuator
permalink: /jek/docs/jekray2d/fibre/attenuator/
description: "The JEKray2D fibre attenuator: a set loss in dB, the same both ways."
element: { palette: Fibre, type: fcomp, kind: voa }
---

<p class="dx-lead">A fibre attenuator takes a set share of the light, the same both ways. It brings a laser down to what a photodiode can take, or balances two arms.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

For an attenuation $$A$$ (dB),

$$
\mathbf S_{12} = \mathbf S_{21} = 10^{-A/20}\,\mathbf I,
$$

so the power through is $$10^{-A/10}$$ of what came in. The attenuation can be swept, as any setting can.

## Settings

{% include jekray2d_params.html group="fibre" key="voa" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The loss is flat in wavelength and the same for both polarisations, and adds no phase or reflection.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/).
- [Terminator](/jek/docs/jekray2d/fibre/terminator/).
