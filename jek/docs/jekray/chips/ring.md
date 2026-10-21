---
layout: docs
title: Ring, all-pass
permalink: /jek/docs/jekray/chips/ring/
redirect_from: /jek/docs/jekray2d/chips/ring/
description: "The JEKray all-pass ring resonator: a ring beside one bus waveguide, dipping at each resonance, deepest at critical coupling."
element: { palette: Photonic, type: pic, kind: ring }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature: sign in to use it (a free account is enough). Switch them on under **Help › Experimental features…**.
</div>

<p class="dx-lead">An all-pass ring resonator is a ring of waveguide beside one bus waveguide. Its through port dips at every resonance of the ring, as deep as the coupling matches the ring's loss. It filters, senses, and makes a notch.</p>

## Ports

**in** and **through**, the two ends of the bus.

## The model

The ring is a small network of its own: a [directional coupler](/jek/docs/jekray/chips/directional-coupler/) with a share $$\kappa$$ crossing over, and the ring's waveguide of length $$L = 2\pi R$$ from one of its ports back to the other, solved as the chip is. With $$t = \sqrt{1 - \kappa}$$ and the round trip

$$
A = a\,e^{-i\varphi}, \qquad a = 10^{-\alpha L/20}, \qquad \varphi = \frac{2\pi\, n_\text{eff}(\lambda)\, L}{\lambda},
$$

the through port carries

$$
T = \frac{\lvert t - A\rvert^2}{\lvert 1 - tA\rvert^2}
= \frac{a^2 - 2ta\cos\varphi + t^2}{1 - 2ta\cos\varphi + (ta)^2}.
$$

It dips where $$\varphi$$ is a whole number of turns.

- **Critical coupling**, $$t = a$$: the dips go to zero.
- **Under-coupled**, $$t > a$$: shallow dips, narrow lines.
- **Over-coupled**, $$t < a$$: shallow dips, broad lines.

### Line spacing and width

Its free spectral range, finesse and Q at 1550 nm are

$$
\mathrm{FSR} = \frac{\lambda^2}{n_g L}, \qquad
F = \frac{\pi\sqrt{x}}{1 - x}, \quad x = t a, \qquad
\delta\lambda = \frac{\mathrm{FSR}}{F}, \qquad Q = \frac{\lambda}{\delta\lambda},
$$

the loaded finesse and line width. Near a resonance the light goes round many times, so the ring delays it: the chip reports the extra group delay it adds.

### The waveguide

The ring's waveguide is a preset (silicon strip, 220 × 500 nm: $$n_\text{eff} = 2.44$$, $$n_g = 4.2$$, 2 dB/cm; or silicon nitride: 1.8, 2.0, 0.1 dB/cm) or set by hand, with dispersion to first order (see [Photonic chips: waveguides](/jek/docs/jekray/chips/#waveguides)).

## Settings

{% include jekray_params.html group="pic" key="ring" %}

Also *wg*: `si`, `sin` or `custom`, the waveguide preset.

## Readouts

The free spectral range (in nm and Hz), the round trip's length and loss, the loaded finesse, line width and Q, and whether it is critically, under- or over-coupled. The chip's spectrum between any two ports is drawn below it, with each line found and measured.

## Assumptions

<div class="dx-warn" markdown="1">
- One mode, TE, and no backscatter: the ring's clockwise and anticlockwise modes do not couple, so there is no line splitting.
- Bend loss is the waveguide's own loss: it does not grow as the radius shrinks.
- No thermal or nonlinear shift of the resonance with power.
</div>

## Related

- [Ring, add-drop](/jek/docs/jekray/chips/ring-add-drop/).
- [Phase shifter](/jek/docs/jekray/chips/phase-shifter/).
- [Fibre mirror](/jek/docs/jekray/fibre/mirror/), for a Fabry–Perot in fibre.
