---
layout: docs
title: Polarisation beam splitter
permalink: /jek/docs/jekray/fibre/pbs/
redirect_from: /jek/docs/jekray2d/fibre/pbs/
description: "The JEKray fibre polarisation beam splitter and combiner: light along its axis to one port, across it to the other, to its extinction."
element: { palette: Fibre, type: fcomp, kind: pbs }
---

<p class="dx-lead">A fibre polarisation beam splitter sends the light along its axis to one port and the light across it to the other. Run backwards it is a polarisation beam combiner.</p>

## Ports

Port **common** on one side; ports **along** and **across** on the other.

## The model

A polariser at angle $$\theta$$ from s, leaking a share $$\varepsilon^2$$ of the power of the crossed polarisation, is the Jones matrix

$$
\mathbf P(\theta, \varepsilon) = \mathbf R(\theta)\begin{pmatrix} 1 & 0 \\ 0 & \varepsilon \end{pmatrix}\mathbf R(-\theta),
\qquad \varepsilon = 10^{-X/20},
$$

for an extinction $$X$$ (dB), with $$\mathbf R$$ the rotation matrix. The splitter is two of them, at right angles:

$$
\mathbf S_\text{common, along} = a\,\mathbf P(\theta, \varepsilon), \qquad
\mathbf S_\text{common, across} = a\,\mathbf P(\theta + 90^\circ, \varepsilon),
$$

the same back, with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$. Each output port leaks the extinction of the polarisation meant for the other.

Backwards, light along the axis into *along* and light across it into *across* both leave by *common*: a polarisation beam combiner, which adds two lasers' powers into one fibre without loss.

## Settings

{% include jekray_params.html group="fibre" key="pbs" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The extinction and loss do not depend on wavelength.
- The fibres to its ports are taken to hold their polarisation. With standard fibre as laid, the state reaching it is scrambled: set the fibre to polarisation-maintaining, or put a polarisation controller before it.
</div>

## Related

- [In-line polariser](/jek/docs/jekray/fibre/polariser/).
- [Polarisation controller](/jek/docs/jekray/fibre/polarisation-controller/).
- [Beam splitter](/jek/docs/jekray/free-space/cube/), the free-space polarising cube.
