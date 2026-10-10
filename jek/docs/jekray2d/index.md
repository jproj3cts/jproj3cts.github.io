---
layout: docs
title: Introduction
permalink: /jek/docs/jekray2d/
description: How JEKray2D models light, fibre, electronics and photonic chips, with the equations behind each part.
---

<p class="dx-lead">JEKray2D is an optical bench simulator that runs in the browser. You lay out sources, optics, fibres, electronics and chips on a 2D bench, and it works out what the light does: rays, beams, interference, cavities, and the signals your detectors would read.</p>

These pages explain how it works. The free-space, fibre, electronics and chip pages set out the physics and the approximations behind each kind of model. Each element then has a page of its own, with its model, its equations, and the settings you can give it.

<div class="dx-tip" markdown="1">
[Open JEKray2D](/jek/tools/jekray2d.html) in another tab and try each effect on a bench as you read. The **Examples** gallery has a working bench for most of them.
</div>

## What it models

JEKray2D brings four kinds of model together on one bench, joined where light and signals pass from one to another:

<ul class="dx-cards dx-two">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/"><b>Free-space optics</b><small>Exact ray tracing, Gaussian beams, the diffracted field, interference, cavities and pulses.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray2d/fibre/"><b>Fibre optics</b><small>Single-mode networks solved path by path, with phase, delay, polarisation and coherence.</small></a></li>
  <li><a class="elec" href="/jek/docs/jekray2d/electronics/"><b>Electronics</b><small>Steady-state signals as tones and noise, through amplifiers, filters, mixers and instruments.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray2d/chips/"><b>Photonic chips</b><small>Compact scattering-matrix models of couplers, rings and phase shifters, solved as one linear system.</small></a></li>
</ul>

## What it does not model

JEKray2D is two-dimensional. Everything lies in the plane of the bench and is seen from above. Some consequences:

- There are no skew rays and no tilts out of the plane. A periscope, or a beam sent up into a vertical microscope, has to be unfolded into the plane.
- Each element is treated as a figure of revolution about its own axis, which lies in the plane. The diffracted field uses that to work in two dimensions where it can (see [Free-space optics](/jek/docs/jekray2d/free-space/)).
- There are no mechanics and no heating: mounts, forces on optics and thermal lensing are not modelled. Optical forces on atoms and small particles in a trap are the exception.

Each modelling page ends with the limits of its own models, and each element page lists the assumptions its model makes.

## How the models fit together

1. **The tracer** follows rays through the free-space optics, with exact geometry, real glass, polarisation and optical path. Along the way it builds the *beam tree*: every branch a Gaussian beam takes at splitters, surfaces and round trips in cavities.
2. **The field engine** propagates each source's diffracted field along that tree, adds the branches of one laser as fields, and solves cavities in their steady state.
3. **The fibre network** takes in the light that reaches fibre tips by mode overlap, follows every path through couplers, circulators and amplifiers, and sends light back out of tips into free space.
4. **The chip solver** treats each photonic chip as one part of the fibre network, with a scattering matrix found by solving its circuit at each wavelength.
5. **The electronics** read photodiodes and drive lasers and modulators. Light is worked out quasi-statically against the slow electrical signals.

## Conventions in these pages

Lengths are in millimetres unless a unit is given, angles in degrees, wavelengths in nanometres. The bench's x is to the right and y is up. **s** polarisation is out of the bench plane and **p** is in it. Fields go as $$e^{-ikz}$$ (Siegman's convention), so a Gaussian beam is $$\exp(-ikr^2/2q)$$ with $$q = z + i z_R$$. The [Concepts](/jek/docs/jekray2d/concepts/) page sets these out in full.

## Checking the models

The [validation page](/jek/tools/jekray2d-validation.html) compares JEKray2D with analytic results and published data, case by case, and runs in your browser. Element pages link to the cases that test them.
