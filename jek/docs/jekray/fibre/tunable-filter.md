---
layout: docs
title: Tunable filter
permalink: /jek/docs/jekray/fibre/tunable-filter/
redirect_from: /jek/docs/jekray2d/fibre/tunable-filter/
description: "The JEKray tunable band-pass filter: a Gaussian pass band about a set centre, what it does not pass lost."
element: { palette: Fibre, type: fcomp, kind: tbf }
---

<p class="dx-lead">A tunable band-pass filter passes a Gaussian band about its centre wavelength. What it does not pass is lost. Put it after an amplifier to cut its spontaneous emission, or sweep it across a spectrum.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

The filter's power transmission at wavelength $$\lambda$$, for a centre $$\lambda_c$$ and a full width at half maximum $$w$$, is

$$
T(\lambda) = \exp\!\left(-4\ln 2\,\left(\frac{\lambda - \lambda_c}{w}\right)^{2}\right),
$$

and its matrix, both ways, is

$$
\mathbf S_{12} = \mathbf S_{21} = a\sqrt{T(\lambda)}\;\mathbf I,
$$

with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). Broadband light is followed in slices fine enough to resolve the filter (see [Fibre optics: broadband light](/jek/docs/jekray/fibre/#broadband-light)), so the filter shapes its spectrum, and a photodiode after it sees only the band it passes.

## Settings

{% include jekray_params.html group="fibre" key="tbf" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The pass band is Gaussian, adds no phase across it (no dispersion) and is the same for both polarisations.
- What is not passed is lost, not reflected. For a filter that sends the rest on, use a WDM; for one that reflects its band, a Bragg grating.
</div>

## Related

- [WDM](/jek/docs/jekray/fibre/wdm/) and [fibre Bragg grating](/jek/docs/jekray/fibre/bragg-grating/).
- [Optical spectrum analyser](/jek/docs/jekray/fibre/osa/).
- [Filter](/jek/docs/jekray/free-space/filter/), the free-space filter.
