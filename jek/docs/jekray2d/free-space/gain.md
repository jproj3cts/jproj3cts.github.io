---
layout: docs
title: Gain medium
permalink: /jek/docs/jekray2d/free-space/gain/
description: The JEKray2D gain medium, a thin saturable gain sheet with a Lorentzian line, which makes a cavity a laser.
element: { palette: Free space, type: gain }
---

<p class="dx-lead">A thin sheet of gain with a Lorentzian line. Put it in a cavity: if its gain beats the round-trip loss the cavity lases, and above threshold it settles at the power where the saturated gain balances the loss, and its output leaves each partly transmitting mirror as a beam.</p>

## The model

### Small-signal gain

The sheet amplifies the power of light crossing it by its single-pass gain, $$g_0$$ at the line centre $$\lambda_c$$, falling to 1 off the line with a Lorentzian of width $$\Delta\lambda$$:

$$
G_0(\lambda) = 1 + \frac{g_0 - 1}{1 + u^2}, \qquad u = \frac{2(\lambda - \lambda_c)}{\Delta\lambda}.
$$

The pump sets $$g_0$$. The sheet multiplies each ray's field by $$\sqrt{G}$$.

### In a cavity

The cavity is found from the light's own path (see [Free-space optics: cavities](/jek/docs/jekray2d/free-space/#cavities)). Its round-trip passive loss is what a pilot beam lost round the loop, less what the gain gave it. The small-signal gain against that loss says whether it lases. A weak seed source at the lasing wavelength, aimed along the cavity, is what lets the cavity be found.

### Saturation

Above threshold, each gain sheet saturates as a homogeneous medium does with every pass at once (Rigrod, 1965). Through it $$I_+ I_-$$ is constant, so every pass sees the same gain $$G$$:

$$
\ln G = \ln G_0 - \frac{(G - 1)\,S}{P_\text{sat}}, \qquad P_\text{sat} = \frac{I_\text{sat}\,\pi w^2}{2},
$$

with $$S$$ the power entering it summed over its passes, and $$w$$ the cavity mode's radius at the sheet. Walking the loop with the mirrors' reflectances gives $$S$$ for a power $$X$$ on the output coupler, and $$X$$ is where the round trip is one. The saturated gain then applies across the whole line, as the log of the small-signal gain scaled down: a homogeneous line.

What leaves each partly transmitting mirror is the power arriving there times its transmission. It leaves as a beam, with the cavity's own mode.

The saturation intensity is a property of the medium: 2.9 kW/cm² for Nd:YAG, about 10 for Yb:YAG, about 200 for Ti:sapphire. Set it to 0 for gain that does not saturate.

## Settings

{% include jekray2d_params.html group="free" key="gain" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The gain is a thin sheet: no thermal lens, no gain guiding, and no spatial hole burning along a standing wave.
- The line is homogeneous, so a laser runs on one line. Inhomogeneous broadening and multi-line competition are not modelled.
- The laser's output is its steady state: no relaxation oscillations, Q-switching or mode locking from the gain itself.
</div>

## Related

- [Mirror](/jek/docs/jekray2d/free-space/mirror/), for the cavity's mirrors and output coupler.
- [Free-space optics: gain](/jek/docs/jekray2d/free-space/#gain).
