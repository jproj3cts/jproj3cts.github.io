---
layout: docs
title: Grating
permalink: /jek/docs/jekray2d/free-space/grating/
description: The JEKray2D diffraction grating, reflecting or transmitting, with each order a branch of its own and its power set by the blaze.
element: { palette: Free space, type: grating }
---

<p class="dx-lead">A diffraction grating sends light into its orders, each at the angle the grating equation gives. It can reflect or transmit. Each order is a branch of its own, carrying the share of the power the blaze sends it.</p>

## The model

### Directions

A grating of $$G$$ lines per mm has period $$d = 1/G$$. Along the grating, light of wavelength $$\lambda$$ leaves in order $$m$$ with its direction sine changed by $$m\lambda/d$$, the grating equation:

$$
\sin\theta_m = \sin\theta_i + \frac{m\lambda}{d}.
$$

An order with $$\lvert\sin\theta_m\rvert \ge 1$$ cannot propagate and carries nothing away. A reflecting grating sends its orders back off its ruled face. A transmitting grating sends them on through it.

A grating can be rolled about its normal by its **Roll** $$\rho$$, which turns its grooves. The grating equation then holds along the direction across the turned grooves, and the light's direction along them is kept, so the orders fan out along a line turned by $$\rho$$: rolled $$90°$$, they go up and down instead of across. A tipped grating is met in its own tipped frame the same way.

### Power

The grooves are a thin sawtooth blazed for the blaze wavelength $$\lambda_B$$ in order +1. Such a grating puts the share

$$
\eta_m = \eta_0\;\mathrm{sinc}^2\!\left(m - \frac{\lambda_B}{\lambda}\right), \qquad \mathrm{sinc}(x) = \frac{\sin \pi x}{\pi x},
$$

into order $$m$$, where $$\eta_0$$ is the peak efficiency: what the real surface absorbs and scatters takes the rest. At the blaze wavelength nearly all of it goes into order +1, and it falls off either side. Orders below $$10^{-4}$$ are dropped.

### Rays, beams and pulses

Each ray leaves in every order that can propagate, each carrying its share of the power. The Gaussian beam branches the same way, so the diffracted field follows each order. A different wavelength leaves at a different angle, so a grating disperses a broadband source or a pulse's spectrum. Two parallel gratings make a pulse compressor or stretcher, and the pulse's spectral phase comes out of the geometry (see [Free-space optics: short pulses](/jek/docs/jekray2d/free-space/#short-pulses)).

## Settings

{% include jekray2d_params.html group="free" key="grating" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The efficiency is the scalar thin-grating one: it does not depend on polarisation, and it does not include the resonances (Wood's anomalies) of a real grating near the cut-off of an order.
- The grating is flat and its grooves straight and evenly spaced.
</div>

## Related

- [Mirror](/jek/docs/jekray2d/free-space/mirror/).
- [AOM](/jek/docs/jekray2d/free-space/aom/), a grating made by sound, which also shifts the light's frequency.
