---
layout: docs
title: Depolariser
permalink: /jek/docs/jekray2d/fibre/depolariser/
description: "The JEKray2D Lyot depolariser: two birefringent sections that split any polarisation into four delayed parts, which add as powers for broadband light."
element: { palette: Fibre, type: fcomp, kind: depol }
---

<p class="dx-lead">A Lyot depolariser makes broadband light unpolarised. Any polarisation in leaves as four parts, each a delay apart. For light whose coherence length is shorter than the delay, the parts add as powers.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

The depolariser is two birefringent sections. The first has its axes at ±45° to s and a delay $$\tau$$ between them (its differential group delay, DGD). The second has its axes along s and p and is twice as long, $$2\tau$$. So the light leaves as four parts, one for each pair of axes it travelled, delayed by

$$
0,\quad \tau,\quad 2\tau,\quad 3\tau.
$$

Each part is the light projected onto one axis of each section:

$$
\mathbf S_{12} = a\sum_{i=0}^{1}\sum_{j=0}^{1} \mathbf P_j^{(2)}\,\mathbf P_i^{(1)}\; e^{-i k\,(i + 2j)\,c\tau},
$$

with $$\mathbf P$$ the projectors onto each section's axes, $$k = 2\pi/\lambda$$, and each part carrying its own delay $$(i + 2j)\,\tau$$ into the network. Backwards the order of the sections is reversed. $$a$$ is the insertion loss.

### When it depolarises

The network weighs the parts against each other by the light's coherence at their delays (see [Fibre optics: solving the network](/jek/docs/jekray2d/fibre/#solving-the-network)). For light with a coherence length well under $$c\tau$$ (an LED, an amplifier's ASE, a superluminescent diode) the four parts add as powers, and the light is unpolarised. Light narrower in its line, which is most lasers, stays polarised, as through a real one. The default DGD of 5 ps is a path of 1.5 mm.

## Settings

{% include jekray2d_params.html group="fibre" key="depol" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The sections' axes and lengths are exact, and their DGD does not change with wavelength.
- The phase across each section's axes is $$k$$ times its delay in path, as for a birefringence of no dispersion.
</div>

## Related

- [Fibre laser](/jek/docs/jekray2d/fibre/laser/), for broadband and LED sources.
- [Polarisation controller](/jek/docs/jekray2d/fibre/polarisation-controller/).
