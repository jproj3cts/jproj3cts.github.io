---
layout: docs
title: Fibre Bragg grating
permalink: /jek/docs/jekray/fibre/bragg-grating/
redirect_from: /jek/docs/jekray2d/fibre/bragg-grating/
description: "The JEKray fibre Bragg grating: a narrow band about its Bragg wavelength reflected back out of the port it came in by, the rest passed."
element: { palette: Fibre, type: fcomp, kind: fbg }
---

<p class="dx-lead">A fibre Bragg grating reflects a narrow band about its Bragg wavelength, back out of the port the light came in by, and passes the rest. With a circulator it picks one wavelength out of a spectrum; two make a fibre laser's cavity.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

The grating's power reflectance at wavelength $$\lambda$$ is a Gaussian band of peak $$R_\text{max}$$, centred on the Bragg wavelength $$\lambda_B$$, with a full width at half maximum $$w$$:

$$
R(\lambda) = R_\text{max}\exp\!\left(-4\ln 2\left(\frac{\lambda - \lambda_B}{w}\right)^{2}\right).
$$

It reflects the same from both sides and passes the rest, with no loss:

$$
\mathbf S_{11} = \mathbf S_{22} = \sqrt{R}\;\mathbf I, \qquad \mathbf S_{12} = \mathbf S_{21} = \sqrt{1 - R}\;\mathbf I.
$$

Broadband light is followed in slices fine enough to resolve the band (see [Fibre optics: broadband light](/jek/docs/jekray/fibre/#broadband-light)), so the grating's reflection of an LED or an amplifier's ASE has the grating's own spectrum.

## Settings

{% include jekray_params.html group="fibre" key="fbg" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The reflection band is Gaussian, with no side lobes and no phase across it: a real uniform grating has sinc-like side lobes, and a chirped one has dispersion.
- The grating is thin: it adds no delay of its own, and both polarisations see the same band.
</div>

## Related

- [Circulator](/jek/docs/jekray/fibre/circulator/).
- [Tunable filter](/jek/docs/jekray/fibre/tunable-filter/) and [WDM](/jek/docs/jekray/fibre/wdm/).
- [Fibre mirror](/jek/docs/jekray/fibre/mirror/), a broadband reflector.
