---
layout: docs
title: Faraday mirror
permalink: /jek/docs/jekray2d/fibre/faraday-mirror/
description: "The JEKray2D Faraday mirror: a 45° Faraday rotator and a mirror, which send light back orthogonal to how it arrived, whatever the fibre did to it."
element: { palette: Fibre, type: fcomp, kind: fm }
---

<p class="dx-lead">A Faraday mirror is a 45° Faraday rotator in front of a mirror. Light comes back orthogonal to how it arrived, whatever the fibre did to its polarisation on the way. So a fibre Michelson made with two keeps full fringe contrast however its fibres are bent.</p>

## Ports

One port, **in**.

## The model

The light is reflected back out of its port by

$$
\mathbf S_{11} = r\begin{pmatrix} 0 & 1 \\ -1 & 0 \end{pmatrix} = r\,\mathbf J,
\qquad r = 10^{-\ell/20}\sqrt R,
$$

with $$R$$ its reflectance and $$\ell$$ an extra loss (dB). $$\mathbf J$$ turns any Jones vector into the one orthogonal to it.

### Why the fibre does not matter

Light that goes through a length of fibre $$\mathbf M$$ to the mirror comes back through its transpose, $$\mathbf M^{\mathsf T}$$, since fibre birefringence is reciprocal. The round trip is

$$
\mathbf M^{\mathsf T}\,\mathbf J\,\mathbf M = \det(\mathbf M)\;\mathbf J,
$$

for any 2 × 2 matrix $$\mathbf M$$. For a lossless fibre $$\det\mathbf M$$ is a phase. So what comes back is orthogonal to what went in, with only a common phase from the fibre, however the fibre is laid. Two arms of a Michelson both ending in Faraday mirrors return the same state, and interfere fully. That holds in JEKray2D for fibre set to *as laid* too.

## Settings

{% include jekray2d_params.html group="fibre" key="fm" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The rotation is exactly 45° each way, at every wavelength.
- The mirror adds no delay of its own.
</div>

## Related

- [Fibre mirror](/jek/docs/jekray2d/fibre/mirror/), a plain mirror.
- [Polarisation controller](/jek/docs/jekray2d/fibre/polarisation-controller/).
- [Faraday rotator](/jek/docs/jekray2d/free-space/faraday/), in free space.
