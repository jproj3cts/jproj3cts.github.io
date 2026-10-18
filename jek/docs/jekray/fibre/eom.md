---
layout: docs
title: Fibre EOM
permalink: /jek/docs/jekray/fibre/eom/
redirect_from: /jek/docs/jekray2d/fibre/eom/
description: "The JEKray fibre-coupled electro-optic modulator: phase sidebands of Bessel amplitude J_n(β), or a Mach–Zehnder amplitude modulator at its bias."
element: { palette: Fibre, type: fcomp, kind: eom }
---

<p class="dx-lead">A fibre-coupled lithium niobate modulator. As a phase modulator it puts sidebands either side of the carrier, at multiples of its drive; as a Mach–Zehnder it modulates the amplitude. With a fibre cavity and a demodulated photodetector it makes a Pound–Drever–Hall lock.</p>

## Ports

Ports **in** and **out**, and an electrical input, **mod**.

## The model

### Phase modulation

Driven at $$f_m$$ with depth $$\beta$$ (rad), the modulator multiplies the field by

$$
e^{i\beta\sin 2\pi f_m t} = \sum_{n} J_n(\beta)\, e^{i 2\pi n f_m t},
$$

so each sideband $$n$$ leaves with amplitude $$a\,J_n(\beta)$$, shifted by $$n f_m$$, with $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$. The default depth, $$\beta = 1.08$$, is where a Pound–Drever–Hall error signal is steepest. Pure phase modulation makes no beat on a photodiode by itself: the sidebands' beats with the carrier cancel in pairs. Something that treats them differently, a cavity, a filter or a dispersive fibre, turns it into amplitude modulation.

### Amplitude modulation

A Mach–Zehnder of two arms driven in opposition, at bias $$\phi_0$$:

$$
E_\text{out} = a\,E_\text{in}\cos\!\left(\frac{\phi_0}{2} + \frac{\beta}{2}\sin 2\pi f_m t\right),
$$

so the sidebands have amplitude

$$
c_n = a\,J_n\!\left(\tfrac{\beta}{2}\right)\cos\tfrac{\phi_0}{2} \quad (n \text{ even}), \qquad
c_n = i\,a\,J_n\!\left(\tfrac{\beta}{2}\right)\sin\tfrac{\phi_0}{2} \quad (n \text{ odd}).
$$

At 0° it transmits fully; at 90° it is at quadrature, where the power follows the drive most linearly.

The sidebands are the same going backwards through it.

### A drive

Wired to the [electronics](/jek/docs/jekray/electronics/), the mod input is a slow drive $$v$$ on top of the RF. In phase mode it adds a phase $$\pi v/V_\pi$$; in amplitude mode it adds to the bias, $$V_\pi$$ moving it 180°. $$V_\pi$$ is 5 V to begin with.

## Settings

{% include jekray_params.html group="fibre" key="eom" %}

Also *emode*: `phase` or `amplitude`.

## Assumptions

<div class="dx-warn" markdown="1">
- The modulation is pure: no residual amplitude modulation from the phase modulator, no chirp from the amplitude modulator.
- Its response is flat to any drive frequency, and the same both ways and for both polarisations.
</div>

## Related

- [EOM](/jek/docs/jekray/free-space/eom/), the free-space modulator.
- [Fibre photodetector](/jek/docs/jekray/fibre/photodetector/), for demodulation.
- [Fibre AOM](/jek/docs/jekray/fibre/aom/).
