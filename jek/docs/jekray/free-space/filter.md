---
layout: docs
title: Filter
permalink: /jek/docs/jekray/free-space/filter/
redirect_from: /jek/docs/jekray2d/free-space/filter/
description: The JEKray filter, long-pass, short-pass, band-pass or neutral density, absorbing or reflecting what it rejects as a dichroic.
element: { palette: Free space, type: filter }
---

<p class="dx-lead">A filter passes some wavelengths and stops others: a long-pass, short-pass or band-pass filter, or a neutral density filter that cuts every wavelength alike. It can absorb what it rejects, or reflect it, as a dichroic mirror does.</p>

## The model

A filter is a thin plane across the beam with a power transmission $$T(\lambda)$$, peaking at $$T_\text{max}$$.

**Edges** are logistic, with a 10–90 % width $$s$$ (the *slope*) about the edge wavelength $$\lambda_e$$. With $$w = s/4.394$$:

$$
T_\text{long}(\lambda) = \frac{T_\text{max}}{1 + e^{-(\lambda - \lambda_e)/w}}, \qquad
T_\text{short}(\lambda) = \frac{T_\text{max}}{1 + e^{(\lambda - \lambda_e)/w}}.
$$

**A band** is flat-topped, an eighth-order Butterworth, with its FWHM $$\Delta\lambda$$ between the half points about its centre $$\lambda_0$$:

$$
T_\text{band}(\lambda) = \frac{T_\text{max}}{1 + u^8}, \qquad u = \frac{2(\lambda - \lambda_0)}{\Delta\lambda}.
$$

**A neutral density filter** of optical density $$D$$ transmits $$10^{-D}$$ at every wavelength.

Each ray and each wavelength of a source takes the filter's transmission at its own wavelength, in amplitude $$\sqrt{T}$$. A broadband source in fibre is filtered slice by slice (see [Fibre optics: broadband light](/jek/docs/jekray/fibre/#broadband-light)). In free space a broadband beam is traced at its centre wavelength, so the filter takes that.

### As a dichroic

With **Reflect what it blocks** on, what the filter rejects is reflected as a mirror reflects it, rather than absorbed: a dichroic mirror. The reflected share is $$1 - T(\lambda)$$, and it becomes a branch of its own. That is how two wavelengths are combined or separated, for example a frequency-doubled beam from its fundamental.

## Settings

{% include jekray_params.html group="free" key="filter" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The transmission does not depend on the angle of incidence or the polarisation: a tilted filter is the same as one square on. A neutral density filter transmits $$10^{-D}$$ at any angle (a real one's longer path through its glass takes a little more), and an edge or band stays where it is, where a real interference filter's moves to shorter wavelengths as it is tilted.
- The filter is thin: no substrate, no refraction and no added path.
</div>

## Related

- [Mirror](/jek/docs/jekray/free-space/mirror/), a partial reflector the same at every wavelength.
- [Nonlinear crystal](/jek/docs/jekray/free-space/nlc/), whose harmonic a short-pass filter separates.
