---
layout: docs
title: In-line polariser
permalink: /jek/docs/jekray2d/fibre/polariser/
description: "The JEKray2D in-line fibre polariser: the polarisation along its axis through, the crossed one weakened by its extinction."
element: { palette: Fibre, type: fcomp, kind: pol }
---

<p class="dx-lead">An in-line fibre polariser passes the polarisation along its axis and weakens the crossed one by its extinction.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

For an axis at $$\theta$$ from s and an extinction $$X$$ (dB),

$$
\mathbf M = a\,\mathbf R(\theta)\begin{pmatrix} 1 & 0 \\ 0 & \varepsilon \end{pmatrix}\mathbf R(-\theta),
\qquad \varepsilon = 10^{-X/20},\quad a = 10^{-\ell/20},
$$

with $$\ell$$ its insertion loss, $$\mathbf S_{12} = \mathbf M$$ and back $$\mathbf S_{21} = \mathbf M^{\mathsf T}$$. Being symmetric, $$\mathbf M$$ is its own transpose, so it is the same both ways. The crossed polarisation's power is passed at $$10^{-X/10}$$.

## Settings

{% include jekray2d_params.html group="fibre" key="pol" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The extinction and loss are flat in wavelength.
- The fibres either side are taken to hold polarisation; standard fibre as laid scrambles it (see [Fibre optics: along a fibre](/jek/docs/jekray2d/fibre/#along-a-fibre)).
</div>

## Related

- [Polarisation beam splitter](/jek/docs/jekray2d/fibre/pbs/).
- [Polarisation controller](/jek/docs/jekray2d/fibre/polarisation-controller/).
- [Polariser](/jek/docs/jekray2d/free-space/polariser/), the free-space polariser.
