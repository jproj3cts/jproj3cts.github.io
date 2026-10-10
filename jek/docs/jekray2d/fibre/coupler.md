---
layout: docs
title: 2×2 coupler
permalink: /jek/docs/jekray2d/fibre/coupler/
description: "The JEKray2D fused fibre coupler, its scattering matrix, and why the light crossing over picks up a quarter-wave."
element: { palette: Fibre, type: fcomp, kind: coupler }
---

<p class="dx-lead">A 2 × 2 fused fibre coupler: light into either port on one side leaves by both ports on the other, in a set ratio. It is the fibre network's beam splitter, and the building block of fibre interferometers.</p>

## Ports

Ports 1 and 2 are on one side, 3 and 4 on the other. Port 1 goes straight through to 3 and across to 4; port 2 goes straight through to 4 and across to 3. It works the same way backwards.

## The model

A share $$\kappa$$ of the power crosses over (the *coupled across* ratio, %). With an excess loss $$\ell$$ (dB), the amplitude through is $$a = 10^{-\ell/20}$$, and the coupler's scattering matrix, for each polarisation alike, is

$$
\begin{pmatrix} E_3 \\ E_4 \end{pmatrix} =
a \begin{pmatrix} \sqrt{1-\kappa} & i\sqrt{\kappa} \\ i\sqrt{\kappa} & \sqrt{1-\kappa} \end{pmatrix}
\begin{pmatrix} E_1 \\ E_2 \end{pmatrix},
$$

and the same matrix from ports 3 and 4 back to 1 and 2. Each block is a multiple of the 2 × 2 identity on the Jones vector, so the coupler does not change polarisation.

### The quarter-wave on the cross-over

The factor $$i$$ on the light crossing over is what makes a lossless coupler conserve energy: the matrix is unitary when $$a = 1$$. It is also what makes a Mach–Zehnder or Sagnac work. Two equal arms recombined at a 50:50 coupler put all their light into one output port:

$$
E_3 = \tfrac12\left(E e^{-i\phi_1} - E e^{-i\phi_2}\right), \qquad
E_4 = \tfrac{i}{2}\left(E e^{-i\phi_1} + E e^{-i\phi_2}\right),
$$

so with $$\phi_1 = \phi_2$$ port 3 is dark and port 4 carries everything. Without the quarter-wave, power would not be conserved.

### In the network

The coupler scatters every wave that reaches it, with that wave's own phase and delay. Waves meeting at one port with one delay add as fields, so the coupler is where interference happens in fibre (see [Fibre optics: solving the network](/jek/docs/jekray2d/fibre/#solving-the-network)). What reaches a photodiode after it is weighted by the laser's coherence at the delay between the two paths.

## Settings

{% include jekray2d_params.html group="fibre" key="coupler" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The split ratio does not depend on wavelength or polarisation. For a coupler that separates wavelengths, use a WDM.
- No back-reflection inside the coupler: what a connector or a cleave at a port reflects is set on the fibre's end.
</div>

## Related

- [Fibre optics](/jek/docs/jekray2d/fibre/), for how the network is solved.
- The [splitter](/jek/docs/jekray2d/fibre/splitter/) (1 × N) and [star coupler](/jek/docs/jekray2d/fibre/star/) (M × N) are the same idea with more ports.
- [WDM](/jek/docs/jekray2d/fibre/wdm/), for a coupler that separates wavelengths.
