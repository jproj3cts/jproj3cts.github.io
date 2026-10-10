---
layout: docs
title: Nonlinear crystal
permalink: /jek/docs/jekray2d/free-space/nlc/
description: The JEKray2D nonlinear crystal, periodically poled MgO:PPLN or PPKTP, doubling the frequency of a focused Gaussian beam by Boyd and Kleinman's theory.
element: { palette: Free space, type: nlc }
---

<p class="dx-lead">A periodically poled crystal, MgO:PPLN or PPKTP, that doubles the frequency of light polarised along its z axis. The second harmonic leaves as a beam of its own, its power from Boyd and Kleinman's theory for the focusing, the poling period and the temperature, and the fundamental leaves depleted.</p>

## The model

### Phase matching

The crystal is quasi-phase-matched, type 0: the fundamental and the harmonic are both polarised along the crystal's z axis, which lies out of the bench plane (s converts) or in it (p converts). Its extraordinary index against wavelength and temperature is from:

- MgO:LiNbO₃: Gayer et al., Appl. Phys. B 91, 343 (2008);
- KTiOPO₄: Kato and Takaoka, Appl. Opt. 41, 5040 (2002), with Emanueli and Arie's temperature terms, Appl. Opt. 42, 6661 (2003).

The poling period $$\Lambda$$ cancels the mismatch $$\Delta k = k_{2\omega} - 2k_\omega - 2\pi/\Lambda$$ at one wavelength and temperature. Leave the period at 0 and it is chosen for the beam through it. Set it, and the temperature tunes the phase matching.

### Conversion

A Gaussian beam's harmonic is Boyd and Kleinman's (J. Appl. Phys. 39, 3597, 1968):

$$
P_2 = \frac{16\pi^2 d_\text{eff}^2\, L\, h}{\varepsilon_0 c\,\lambda^3 n_1 n_2}\, P_1^2,
\qquad
h(\sigma, \xi, \mu) = \frac{1}{4\xi}\left\lvert\int e^{i\sigma\tau}\,\frac{\mathrm d\tau}{1 + i\tau}\right\rvert^2,
$$

with the integral over the crystal. Here:

- $$\xi = L/b$$ is the focusing, $$b$$ the confocal parameter inside the crystal;
- $$\sigma = b\,\Delta k/2$$ is the phase mismatch the poling leaves;
- $$\mu$$ is where the waist sits.

At best focusing, $$\xi = 2.84$$, $$h = 1.068$$: aim for a crystal about 2.84 confocal parameters long. $$d_\text{eff}$$ is 14 pm/V for MgO:PPLN and 9.5 pm/V for PPKTP.

The fundamental is used up as

$$
P_2 = P_1 \tanh^2\!\left(\sqrt{\eta P_1}\right),
$$

with $$\eta$$ the low-power efficiency above, so the conversion saturates and the fundamental leaves with what remains.

### The beams

The crystal is a block of index $$n$$ with two faces, anti-reflection coated (0.1 %) or bare, and a plane in its middle where the harmonic is made. The harmonic leaves as a beam of its own, at half the wavelength, from that plane. Separate it from the fundamental with a short-pass filter or a dichroic.

## Settings

{% include jekray2d_params.html group="free" key="nlc" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The crystal is thin to the rays: its index does not move the focus. A focus aimed at its middle in air lands further in, so aim $$L/(2n)$$ past its entrance face.
- The light's own absorption, walk-off and heating, and photorefractive damage, are left out.
- Only second-harmonic generation is modelled: no sum- or difference-frequency mixing, and no parametric oscillation.
</div>

## Related

- [Filter](/jek/docs/jekray2d/free-space/filter/), to separate the harmonic.
- [Lens](/jek/docs/jekray2d/free-space/lens/), to focus into the crystal.
