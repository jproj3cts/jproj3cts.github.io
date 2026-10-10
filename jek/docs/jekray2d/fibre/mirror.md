---
layout: docs
title: Fibre mirror
permalink: /jek/docs/jekray2d/fibre/mirror/
description: "The JEKray2D in-line fibre mirror: a partly reflecting mirror inside the fibre, reflecting from both sides with opposite signs."
element: { palette: Fibre, type: fcomp, kind: fmir }
---

<p class="dx-lead">A partly reflecting mirror inside the fibre, such as a coated fibre end or a broadband reflector. It reflects a share of the light back from either side and passes the rest. Two of them make a fibre Fabry–Perot.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

With a reflectance $$R$$ and an excess loss $$\ell$$ (dB), $$a = 10^{-\ell/20}$$, the mirror reflects and transmits, for each polarisation alike,

$$
r = a\sqrt R, \qquad t = a\sqrt{1 - R},
$$

$$
\mathbf S_{11} = r\,\mathbf I, \qquad \mathbf S_{22} = -r\,\mathbf I, \qquad \mathbf S_{12} = \mathbf S_{21} = t\,\mathbf I.
$$

The reflection from the second side has the opposite sign, as a lossless mirror's must for its matrix to be unitary. That sign is what puts a Fabry–Perot's transmission peaks where they should be.

### In a cavity

Two fibre mirrors a fibre apart are a Fabry–Perot. The network follows the light round between them until what is left is negligible (see [Fibre optics: solving the network](/jek/docs/jekray2d/fibre/#solving-the-network)), so the transmission shows its free spectral range $$c/(2 n_g L)$$ and its finesse.

## Settings

{% include jekray2d_params.html group="fibre" key="fmir" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The reflectance is flat in wavelength and the same for both polarisations. For a narrow band, use a Bragg grating.
- The mirror is thin: it adds no delay of its own.
</div>

## Related

- [Fibre Bragg grating](/jek/docs/jekray2d/fibre/bragg-grating/), a mirror for a narrow band.
- [Faraday mirror](/jek/docs/jekray2d/fibre/faraday-mirror/).
- [Mirror](/jek/docs/jekray2d/free-space/mirror/), the free-space mirror.
