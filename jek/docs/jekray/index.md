---
layout: docs
title: Introduction
permalink: /jek/docs/jekray/
redirect_from: /jek/docs/jekray2d/
description: How JEKray models light, fibre, electronics and photonic chips, with the equations behind each part.
---

<p class="dx-lead">JEKray is an optical bench simulator that runs in the browser. You lay out sources, optics, fibres, electronics and chips on a bench, and it works out what the light does: rays, beams, interference, cavities, and the signals your detectors would read.</p>

These pages explain how it works. The four modelling pages set out the physics and the approximations behind each kind of model, and every element has a page of its own with its model, its equations and its settings. The [lens design](/jek/docs/jekray/lens-design/), [RF](/jek/docs/jekray/rf/) and [coating design](/jek/docs/jekray/coating-design/) pages cover the three design workspaces built on top.

<div class="dx-tip" markdown="1">
[Open JEKray](/jek/tools/jekray.html) in another tab and try each effect on a bench as you read. The **Examples** gallery has a working bench for most of them.
</div>

## What it models

Four kinds of model share one bench, joined where light and signals pass from one to another:

<ul class="dx-cards dx-two">
  <li><a class="free" href="/jek/docs/jekray/free-space/"><b>Free-space optics</b><small>Exact ray tracing, Gaussian beams, the diffracted field, interference, cavities and pulses.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/"><b>Fibre optics</b><small>Single-mode networks solved path by path, with phase, delay, polarisation and coherence.</small></a></li>
  <li><a class="elec" href="/jek/docs/jekray/electronics/"><b>Electronics</b><small>Steady-state signals as tones and noise, through amplifiers, filters, mixers and instruments.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/"><b>Photonic chips</b><small>Compact scattering-matrix models of couplers, rings and phase shifters, solved as one linear system.</small></a></li>
</ul>

## How the models fit together

1. **The tracer** follows rays through the free-space optics with exact geometry, real glass, polarisation and optical path. Along the way it builds the *beam tree*: every branch a Gaussian beam takes at splitters, surfaces and round trips in cavities.
2. **The field engine** propagates each source's diffracted field along that tree, adds the branches of one laser as fields, and solves cavities in their steady state.
3. **The fibre network** takes in the light reaching fibre tips by mode overlap, follows every path through couplers, circulators and amplifiers, and sends light back out of tips into free space.
4. **The chip solver** treats each photonic chip as one part of the fibre network, with a scattering matrix found by solving its circuit at each wavelength.
5. **The electronics** read photodiodes and drive lasers and modulators. Light is worked out quasi-statically against the slow electrical signals.

## What it leaves out

Every free-space part has all six degrees of freedom: x and y on the bench, z above it (0 to 2 m), facing, tip and roll. The light is followed in three dimensions through all of them, and the 3D view shows it (see [Heights](/jek/docs/jekray/free-space/#heights)). The limits:

- Fibre, electronic and chip parts lie in the plane, and the 3D view leaves them out.
- The lens designer's fields lie in the bench plane (the tangential section); sagittal and skew rays are traced, but a field cannot be set out of the plane.
- There are no mechanics and no heating: mounts, forces on optics and thermal lensing are not modelled. The exceptions are the lens designer's thermal analysis and the forces on atoms and particles in an optical trap.

Each modelling page ends with the limits of its own models, and each element page lists the assumptions its model makes.

## Conventions

Lengths are in millimetres unless a unit is given, angles in degrees, wavelengths in nanometres. The bench's x is to the right and y is up. **s** polarisation is out of the bench plane and **p** is in it. Fields go as $$e^{-ikz}$$ (Siegman's convention), so a Gaussian beam is $$\exp(-ikr^2/2q)$$ with $$q = z + i z_R$$. [Concepts](/jek/docs/jekray/concepts/) sets these out in full.

## Checking the models

The [validation page](/jek/tools/jekray-validation.html) compares JEKray with analytic results and published data, case by case, and runs in your browser. Element pages link to the cases that test them, and the design pages list what each feature was checked against.
