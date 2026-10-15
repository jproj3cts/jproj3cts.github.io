---
layout: docs
title: Circulator
permalink: /jek/docs/jekray/fibre/circulator/
redirect_from: /jek/docs/jekray2d/fibre/circulator/
description: "The JEKray fibre circulator: port 1 to 2 and 2 to 3, backwards only what its isolation lets through."
element: { palette: Fibre, type: fcomp, kind: circ }
---

<p class="dx-lead">A circulator passes light from port 1 to port 2, and from port 2 to port 3. It separates the light going out to something from what comes back, as when reading a Bragg grating's reflection.</p>

## Ports

Ports **1**, **2** and **3**.

## The model

Forward, round the circulator, the light has an amplitude $$t = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). Backwards, it leaks at the isolation $$X$$ (dB):

$$
\mathbf S_{12} = \mathbf S_{23} = t\,\mathbf I, \qquad \mathbf S_{21} = \mathbf S_{32} = 10^{-X/20}\,\mathbf I.
$$

Nothing passes between ports 3 and 1, either way: it is a three-port circulator, not a closed ring. Both polarisations are treated alike, as in a polarisation-insensitive circulator.

## Settings

{% include jekray_params.html group="fibre" key="circ" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Its loss and isolation are flat in wavelength and the same for both polarisations, with no polarisation-mode dispersion.
- Light into port 3 does not go on round to port 1.
</div>

## Related

- [Isolator](/jek/docs/jekray/fibre/isolator/).
- [Fibre Bragg grating](/jek/docs/jekray/fibre/bragg-grating/).
