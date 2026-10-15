---
layout: docs
title: Photonic chips
permalink: /jek/docs/jekray/chips/
redirect_from: /jek/docs/jekray2d/chips/
description: How JEKray models photonic integrated circuits with compact scattering-matrix models, solved directly as one linear system at each wavelength.
---

<p class="dx-lead">A photonic chip is drawn as a schematic: grating couplers, directional couplers, MMIs, rings, phase shifters and photodiodes, joined port to port by waveguides. Each part is a compact model, a small scattering matrix that depends on the wavelength, and the chip is solved directly at each wavelength.</p>

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

## Waveguides

The chip's waveguides are single-mode, TE only, near 1550 nm. A waveguide of length $$L$$ transmits the field

$$
t(\lambda) = 10^{-\alpha L / 20}\; \exp\!\left(-\frac{i 2\pi\, n_\text{eff}(\lambda)\, L}{\lambda}\right),
$$

with $$\alpha$$ its loss in dB/cm. Its effective index follows its group index to first order about $$\lambda_0 = 1550$$ nm:

$$
n_\text{eff}(\lambda) = n_\text{eff}(\lambda_0) - \left(n_g - n_\text{eff}(\lambda_0)\right)\frac{\lambda - \lambda_0}{\lambda_0},
$$

which gives the group delay $$n_g L / c$$ and a ring's free spectral range $$\lambda^2 / n_g L$$. The field convention is the fibre network's, $$e^{-ikz}$$.

## Compact models

Each part has ports and a scattering matrix $$S(\lambda)$$ over them. Light leaving a part is $$\mathbf b = S\,\mathbf a$$ for the light $$\mathbf a$$ entering it.

**Directional coupler.** A share $$\kappa(\lambda) = \kappa_0 + \kappa'(\lambda - \lambda_0)$$ of the power crosses over, picking up $$+i$$, as in the fibre coupler:

$$
S = a\begin{pmatrix} 0 & 0 & t & i x \\ 0 & 0 & i x & t \\ t & i x & 0 & 0 \\ i x & t & 0 & 0 \end{pmatrix}, \qquad t = \sqrt{1 - \kappa}, \quad x = \sqrt{\kappa},
$$

with $$a$$ the excess loss in amplitude. A 2 × 2 MMI is the same with $$\kappa = 1/2$$. A 1 × 2 MMI splits its input equally and in phase, $$a/\sqrt2$$ to each output.

**Grating coupler.** The coupling between the fibre and the chip falls off quadratically in decibels about its centre:

$$
T_\text{dB}(\lambda) = T_\text{peak} - \left(\frac{\lambda - \lambda_c}{\Delta\lambda_{1\,\text{dB}}/2}\right)^2,
$$

so it is 1 dB down at the edges of its 1 dB band. It couples one polarisation of the fibre, at the angle set from s.

**Phase shifter.** A waveguide of its length, with an added phase $$e^{-i\phi}$$.

**Ring resonator.** A ring is a small network of its own: one coupler (all-pass) or two (add-drop), and the ring's waveguide of length $$L = 2\pi R$$, solved like the chip. For an all-pass ring with a lossless coupler and round-trip transmission $$A = a\,e^{-i\varphi}$$, $$\varphi = 2\pi n_\text{eff} L/\lambda$$, the through port carries

$$
T = \frac{t - A}{1 - t A}.
$$

It dips at resonance, where $$\varphi$$ is a whole number of turns, by the most where $$t = a$$: critical coupling.

**Photodiode.** A sink that takes in what arrives at its port, read as a fibre photodiode is.

## Solving the chip

The chip's parts are joined into one network. Let $$\mathbf a$$ be the light entering every port of every part and $$\mathbf b = S\,\mathbf a$$ what leaves. Each waveguide link takes what leaves one port into the port at its far end with its transmission $$t$$, written as a connection matrix $$C$$. With external light $$\mathbf e$$ put in at the chip's grating couplers,

$$
\left(I - C S\right)\mathbf a = \mathbf e.
$$

That is solved directly, as one linear system, at each wavelength. So a ring of high Q costs no more than a straight waveguide: there are no round trips to follow. The system is sparse, a handful of entries a row however large the chip. It is factorised by a sparse LU, with an elimination order (minimum degree) found once from its pattern and reused across a wavelength sweep. A wavelength where a pivot comes out too small falls back to a dense solve.

To the fibre network, the whole chip is one part. Its matrix between its grating couplers' fibre sides, and the light each photodiode takes in, is that solution, with each as a 2 × 2 on the fibre's (s, p). The chip also reports the extra group delay it adds, which is long near a ring's resonance where the light goes round many times.

## Spectra and lines

A chip's spectrum between two ports is solved across a band, and the lines in it are found and measured: dips (notches) or peaks (pass bands), whichever stand out more. Each line is measured against its own surroundings, so a slope under it, such as a grating coupler's band, does not count. Then it is refined at wavelengths of its own: where it is, how deep, its width at half depth, its Q, and the mean spacing between neighbours.

## Limits

<div class="dx-warn" markdown="1">
- TE only, one mode, near 1550 nm: dispersion is first order in the effective index.
- Compact models describe each part by its ports. Field profiles inside the chip, mode mismatch at junctions, and bend loss beyond the waveguide's own loss are not modelled.
- No thermal or carrier effects: a phase shifter's phase is set, or driven by the electronics, directly.
</div>

## Elements

### Couplers

<ul class="dx-cards">
  <li><a class="pic" href="/jek/docs/jekray/chips/grating-coupler/"><b>Grating coupler</b><small>Fibre to chip: one polarisation, a band about its centre.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/directional-coupler/"><b>Directional coupler</b><small>Any split, changing with wavelength.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/mmi-1x2/"><b>1×2 MMI</b><small>Equal and in phase; a combiner backwards.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/mmi-2x2/"><b>2×2 MMI</b><small>A 50:50 coupler.</small></a></li>
</ul>

### Rings

<ul class="dx-cards">
  <li><a class="pic" href="/jek/docs/jekray/chips/ring/"><b>Ring, all-pass</b><small>Dips at each resonance; critical coupling.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/ring-add-drop/"><b>Ring, add-drop</b><small>Each resonance to the drop port.</small></a></li>
</ul>

### Control and detection

<ul class="dx-cards">
  <li><a class="pic" href="/jek/docs/jekray/chips/phase-shifter/"><b>Phase shifter</b><small>A phase you set, on a length of waveguide.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/photodiode/"><b>On-chip photodiode</b><small>Reads what reaches it, as a fibre photodiode does.</small></a></li>
</ul>
