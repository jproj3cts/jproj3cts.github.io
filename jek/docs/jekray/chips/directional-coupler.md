---
layout: docs
title: Directional coupler
permalink: /jek/docs/jekray/chips/directional-coupler/
redirect_from: /jek/docs/jekray2d/chips/directional-coupler/
description: "The JEKray directional coupler: two waveguides close enough to couple, with a coupling that can change with wavelength."
element: { palette: Photonic, type: pic, kind: dc }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">A directional coupler is two waveguides run close enough together that light crosses from one to the other. It is the chip's beam splitter, and the coupler of a ring.</p>

## Ports

Ports **1** and **2** on one side, **3** and **4** on the other. Port 1 goes through to 3 and across to 4; port 2 goes through to 4 and across to 3.

## The model

A share $$\kappa$$ of the power crosses over. It can change linearly with wavelength, about $$\lambda_0 = 1550$$ nm:

$$
\kappa(\lambda) = \kappa_0 + \kappa'\,(\lambda - \lambda_0),
$$

clamped to 0 to 100 %. With $$t = \sqrt{1 - \kappa}$$, $$x = \sqrt{\kappa}$$ and an excess loss $$a$$ in amplitude,

$$
S = a\begin{pmatrix} 0 & 0 & t & i x \\ 0 & 0 & i x & t \\ t & i x & 0 & 0 \\ i x & t & 0 & 0 \end{pmatrix},
$$

the same both ways. The light crossing over leads by a quarter wave, as in the [fibre coupler](/jek/docs/jekray/fibre/coupler/), so two equal arms of a Mach–Zehnder recombine wholly into one port.

## Settings

{% include jekray_params.html group="pic" key="dc" %}

## Readouts

Its ports and what they join, and the powers where the fibre network reaches them. The chip's spectrum between any two of its ports is drawn below, with the lines in it measured (see [Photonic chips: spectra and lines](/jek/docs/jekray/chips/#spectra-and-lines)).

## Assumptions

<div class="dx-warn" markdown="1">
- The coupling is linear in wavelength, with no reflection and no phase of its own beyond the quarter wave.
- The coupler's own length adds no delay: put a waveguide either side for that.
</div>

## Related

- [2×2 MMI](/jek/docs/jekray/chips/mmi-2x2/), a 50:50 coupler made another way.
- [Ring, all-pass](/jek/docs/jekray/chips/ring/).
