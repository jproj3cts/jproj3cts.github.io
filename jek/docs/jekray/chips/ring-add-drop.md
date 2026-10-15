---
layout: docs
title: Ring, add-drop
permalink: /jek/docs/jekray/chips/ring-add-drop/
redirect_from: /jek/docs/jekray2d/chips/ring-add-drop/
description: "The JEKray add-drop ring resonator: a ring between two bus waveguides, dropping each resonance to its drop port."
element: { palette: Photonic, type: pic, kind: ringad }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">An add-drop ring resonator sits between two bus waveguides. On resonance the light goes round the ring and out of the drop port; off it, straight through. It is a channel filter for a wavelength-division multiplexed chip.</p>

## Ports

**in** and **through** on one bus; **add** and **drop** on the other.

## The model

Two directional couplers, with shares $$\kappa_1$$ (on the input bus) and $$\kappa_2$$ (on the drop bus) crossing over, joined by two halves of the ring's waveguide, each of length $$\pi R$$. With $$t_{1,2} = \sqrt{1 - \kappa_{1,2}}$$, the round-trip amplitude $$a$$ and phase $$\varphi$$ as for the [all-pass ring](/jek/docs/jekray/chips/ring/),

$$
T_\text{through} = \frac{t_2^2 a^2 - 2t_1 t_2 a\cos\varphi + t_1^2}{1 - 2t_1 t_2 a\cos\varphi + (t_1 t_2 a)^2},
\qquad
T_\text{drop} = \frac{(1 - t_1^2)(1 - t_2^2)\,a}{1 - 2t_1 t_2 a\cos\varphi + (t_1 t_2 a)^2}.
$$

At resonance the drop port peaks, fully when the ring is lossless and symmetric, $$t_1 = t_2$$, $$a = 1$$. Light put in at the add port goes to the drop port off resonance and to the through port on it.

Its free spectral range, finesse and Q are the all-pass ring's with $$x = t_1 t_2 a$$:

$$
\mathrm{FSR} = \frac{\lambda^2}{n_g L}, \qquad F = \frac{\pi\sqrt{x}}{1 - x}, \qquad Q = \frac{\lambda F}{\mathrm{FSR}}.
$$

The chip solves the ring as a network of its two couplers and two half-rings, not by these closed forms, which the validation page checks it against.

## Settings

{% include jekray_params.html group="pic" key="ringad" %}

Also *wg*: `si`, `sin` or `custom`, the waveguide preset.

## Readouts

The free spectral range, the round trip's length and loss, and the loaded finesse, line width and Q. The chip's spectrum between any two ports is drawn below it, with each line found and measured.

## Assumptions

<div class="dx-warn" markdown="1">
- One mode, TE, and no backscatter between the ring's two directions.
- Bend loss is the waveguide's own loss, whatever the radius.
</div>

## Related

- [Ring, all-pass](/jek/docs/jekray/chips/ring/).
- [WDM](/jek/docs/jekray/fibre/wdm/), the fibre network's channel filter.
