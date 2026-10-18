---
layout: docs
title: EOM
permalink: /jek/docs/jekray/free-space/eom/
redirect_from: /jek/docs/jekray2d/free-space/eom/
description: The JEKray electro-optic modulator, writing phase sidebands of Bessel-function amplitude, or amplitude modulation through a biased Mach–Zehnder.
element: { palette: Free space, type: eom }
---

<p class="dx-lead">An electro-optic modulator writes a modulation onto the light: phase modulation, which puts sidebands either side of the carrier, or amplitude modulation, through a biased Mach–Zehnder. With a cavity and a demodulated photodiode it makes a Pound–Drever–Hall lock.</p>

## The model

### Phase modulation

A phase modulator driven at $$\Omega = 2\pi f_m$$ with depth $$\beta$$ (radians) multiplies the field by

$$
e^{i\beta\sin\Omega t} = \sum_{n=-\infty}^{\infty} J_n(\beta)\, e^{i n\Omega t},
$$

the Jacobi–Anger expansion. Each sideband $$n$$ leaves as a branch of its own, $$n f_m$$ from the light that came in, with field amplitude $$J_n(\beta)$$, a Bessel function. At $$\beta = 1.434$$ the carrier and each first sideband carry equal power; at $$\beta = 2.405$$ the carrier is gone.

### Amplitude modulation

An amplitude modulator is a Mach–Zehnder of two such arms driven in opposition, biased at $$\phi_0$$:

$$
E_\text{out} = E_\text{in}\,\cos\!\left(\frac{\phi_0}{2} + \frac{\beta}{2}\sin\Omega t\right),
$$

which expands the same way into sidebands of amplitude $$J_n(\beta/2)$$. At a bias of 90° it is at quadrature, where the power follows the drive most linearly.

### At an angle

Light crossing the modulator at an angle $$\theta$$, turned in the bench plane or tipped out of it, is modulated over a path $$1/\cos\theta$$ longer, so its modulation depth is $$\beta/\cos\theta$$.

### Beat notes and locking

Sidebands at different offsets make no steady fringes with each other, but they beat on a photodiode at multiples of $$f_m$$. Put a cavity after the EOM and a photodiode on the reflected light, demodulated at $$f_m$$ (see [Photodetector: demodulation](/jek/docs/jekray/free-space/detector/#demodulation)). Each sideband meets the cavity at its own detuning, and the demodulated signal is the Pound–Drever–Hall error signal.

### A drive

The EOM's modulation is also an electrical input. Wired to the [electronics](/jek/docs/jekray/electronics/), its drive sets the modulation through time.

## Settings

{% include jekray_params.html group="free" key="eom" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The modulation is pure: no residual amplitude modulation from a phase modulator, and no chirp from an amplitude modulator.
- The modulator is thin and does not deflect the light. Its loss is the insertion loss set.
</div>

## Related

- [AOM](/jek/docs/jekray/free-space/aom/), a frequency shifter.
- [Photodetector](/jek/docs/jekray/free-space/detector/).
- [Fibre EOM](/jek/docs/jekray/fibre/eom/), the fibre-coupled one.
