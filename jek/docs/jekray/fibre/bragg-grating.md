---
layout: docs
title: Fibre Bragg grating
permalink: /jek/docs/jekray/fibre/bragg-grating/
redirect_from: /jek/docs/jekray2d/fibre/bragg-grating/
description: "The JEKray fibre Bragg grating by coupled-mode theory: its length, Bragg wavelength and index modulation give the reflection and transmission, with side lobes, delay and dispersion."
element: { palette: Fibre, type: fcomp, kind: fbg }
---

<p class="dx-lead">A fibre Bragg grating is a periodic change of index written along a few millimetres of a fibre's core. It reflects a narrow band about its Bragg wavelength back out of the port the light came in by, and passes the rest. With a circulator it picks one wavelength out of a spectrum; two make a fibre laser's cavity.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

The grating is solved by coupled-mode theory, following T. Erdogan, "Fiber grating spectra", *J. Lightwave Technol.* **15**, 1277 (1997). The core's index along the grating is

$$
n(z) = n_\text{eff} + v\,\delta n\,\cos\!\left(\frac{2\pi z}{\Lambda}\right),
$$

with period $$\Lambda$$, index modulation $$\delta n$$ and fringe visibility $$v$$. It couples the light going forward to the light coming back. The Bragg wavelength, the detuning from it and the coupling are

$$
\lambda_B = 2 n_\text{eff}\Lambda, \qquad
\hat\sigma = 2\pi n_\text{eff}\left(\frac{1}{\lambda} - \frac{1}{\lambda_B}\right), \qquad
\kappa = \frac{\pi v\,\delta n}{\lambda}.
$$

For a uniform grating of length $$L$$, with $$\gamma^2 = \kappa^2 - \hat\sigma^2$$, the amplitude reflection and transmission between its two ends are

$$
\rho = \frac{-\kappa \sinh\gamma L}{\hat\sigma \sinh\gamma L + i\gamma\cosh\gamma L},
\qquad
\tau = \frac{i\gamma}{\hat\sigma \sinh\gamma L + i\gamma\cosh\gamma L}.
$$

From these:

- The peak reflectance, at $$\lambda_B$$, is $$R = \tanh^2\kappa L$$.
- The first zeros either side are where $$\hat\sigma^2 = \kappa^2 + (\pi/L)^2$$. The band between them is $$\Delta\lambda = \lambda_B^2\sqrt{(\kappa L)^2 + \pi^2}\,/\,(\pi n_\text{eff} L)$$, and side lobes follow outside it.
- Nothing is lost: $$\lvert\rho\rvert^2 + \lvert\tau\rvert^2 = 1$$ at every wavelength.
- The phase of $$\rho$$ and $$\tau$$ changes across the band, so the grating delays the light. At $$\lambda_B$$ the reflected light is delayed by $$n_\text{eff}\tanh(\kappa L)/(\kappa c)$$: a weak grating reflects from all along its length, a strong one from its first part. The delay rises towards the band's edges, where the dispersion is largest.

Here $$n_\text{eff}$$ is the mean effective index in the grating, with the average index change of the writing included, so $$\lambda_B$$ is the wavelength reflected most. Erdogan counts the detuning from the design wavelength of the fibre before the grating was written; the two descriptions give the same $$\hat\sigma$$.

In the fibre network the grating is

$$
\mathbf S_{11} = \mathbf S_{22} = \rho\,\mathbf I, \qquad \mathbf S_{12} = \mathbf S_{21} = \tau\,\mathbf I,
$$

the same from both ends (it is symmetric about its middle), lossless and reciprocal. Each wave it sends on carries the grating's group delay, which the network counts with the fibres' when it weighs paths by the laser's coherence, and its group delay dispersion, which chirps a pulse. A modulator's sidebands meet the grating at their own frequencies. Far from the band the grating is a length $$L$$ of fibre.

Broadband light is followed in slices fine enough to resolve the band (see [Fibre optics: broadband light](/jek/docs/jekray/fibre/#broadband-light)), so the grating's reflection of an LED or an amplifier's ASE has the grating's own spectrum.

### Apodisation and chirp

An apodised or chirped grating is cut into 100 or more uniform sections, each with its own coupling and Bragg wavelength, and their transfer matrices are multiplied (the piecewise-uniform method of Erdogan's paper).

- **Apodisation** tapers the index modulation towards the ends, which takes the side lobes down. Gaussian: a full width at half maximum of half the length. Raised cosine: nothing at the ends. The peak reflectance is $$\tanh^2\!\int\kappa\,dz$$.
- **Chirp**, in nm per cm, is the change of the Bragg wavelength along the grating, from port 1 to port 2. It widens the band to about the chirp times the length, and each wavelength is reflected where the grating matches it, so the delay runs across the band. The two ends then reflect the same power with opposite slopes of delay.

### The readout

The panel shows $$\kappa L$$, the peak reflectance and its wavelength, the band between the first zeros (uniform gratings), the width at half the peak, the period $$\Lambda$$ and the delay of the reflected light at the peak.

### The simple band

**Model** can be set to a simple band instead: a Gaussian reflectance of peak $$R_\text{max}$$ and full width at half maximum $$w$$ about $$\lambda_B$$,

$$
R(\lambda) = R_\text{max}\exp\!\left(-4\ln 2\left(\frac{\lambda - \lambda_B}{w}\right)^{2}\right),
$$

with $$\sqrt{R}$$ reflected from both sides, $$\sqrt{1-R}$$ passed, and no phase, side lobes or delay. This was the whole model before the grating had a length. A bench saved then gives only the band's width and peak, so it opens with this model and reads as it did.

## Settings

{% include jekray_params.html group="fibre" key="fbg" %}

Two more are chosen from lists: `model`, `"cmt"` (the grating, the default) or `"band"`; and `apod`, `"none"`, `"gauss"` or `"cos"`.

## Assumptions

<div class="dx-warn" markdown="1">
- The index does not change with wavelength across the band, so the group index equals $$n_\text{eff}$$. A real fibre's group index is about 1% higher.
- The mean index is the same all along the grating, apodised or not.
- Both polarisations see the same grating. There is no cladding-mode loss on the short-wavelength side and no loss in the grating.
- The grating is a whole number of periods long and symmetric about its middle, which fixes the phase of its reflection at each end. Between two gratings that phase adds to the fibre's, as the fibre's own length does.
- A pulse is delayed and chirped by the grating's delay and dispersion at its centre wavelength. A pulse whose spectrum is wider than the band is not reshaped by it.
</div>

## Checked against

The [validation page](/jek/tools/jekray-validation.html) compares three gratings ($$\kappa L$$ = 0.5, 2 and 8) with a numerical integration of the coupled-mode equations: the reflection and transmission spectra, the band between the zeros and the delay.

## Related

- [Circulator](/jek/docs/jekray/fibre/circulator/).
- [Tunable filter](/jek/docs/jekray/fibre/tunable-filter/) and [WDM](/jek/docs/jekray/fibre/wdm/).
- [Fibre mirror](/jek/docs/jekray/fibre/mirror/), a broadband reflector.
