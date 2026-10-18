---
layout: docs
title: Introduction
permalink: /jek/docs/jekray/
redirect_from: /jek/docs/jekray2d/
description: "What JEKray models and how: free-space optics, fibre, electronics, photonic chips and RF quasi-optics on one bench, three design workspaces on top, and the equations behind each part."
---

<p class="dx-lead">JEKray is a bench simulator that runs in the browser. You lay out sources, optics, fibres, electronics, photonic chips and RF horns and lenses on a bench, and it works out what the light, or the millimetre-wave beam, does: rays, beams, diffraction, interference, cavities, and the signals your detectors would read. Three design workspaces sit on the same bench, for lens systems, RF lens systems and thin-film coatings.</p>

<div class="dx-tip" markdown="1">
[Open JEKray](/jek/tools/jekray.html) in another tab and try each effect on a bench as you read. The **Examples** gallery has a working bench for most of them.
</div>

## How these pages are arranged

The contents follow the order you would meet things in:

1. **Start here.** [Getting started](/jek/docs/jekray/getting-started/) is a first bench and a tour of the window. [Concepts](/jek/docs/jekray/concepts/) sets out the units, coordinates and ideas every other page relies on.
2. **The bench.** One page for each of the five kinds of model, with the physics and the approximations behind it, and under each a page for every part: its model, its equations and its settings.
3. **Designers.** The three workspaces that design a system as a whole rather than part by part.
4. **Extending and scripting.** Adding parts of your own, writing modules, and driving the engine from a script or the command line.
5. **Help.** The [FAQ](/jek/docs/jekray/faq/).

## What it models

Five kinds of model share one bench, joined where light and signals pass from one to another:

<ul class="dx-cards dx-two">
  <li><a class="free" href="/jek/docs/jekray/free-space/"><b>Free-space optics</b><small>Exact ray tracing, Gaussian beams, the diffracted field, interference, cavities and pulses.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/"><b>Fibre optics</b><small>Single-mode networks solved path by path, with phase, delay, polarisation and coherence.</small></a></li>
  <li><a class="elec" href="/jek/docs/jekray/electronics/"><b>Electronics</b><small>Steady-state signals as tones and noise, through amplifiers, filters, mixers and instruments.</small></a></li>
  <li><a class="pic" href="/jek/docs/jekray/chips/"><b>Photonic chips</b><small>Compact scattering-matrix models of couplers, rings and phase shifters, solved as one linear system.</small></a></li>
  <li><a class="rf" href="/jek/docs/jekray/rf/"><b>RF and millimetre waves</b><small>Quasi-optics from 1 GHz to 3 THz: horns launch and receive Gaussian beams, and RF lenses, mirrors, grids and meshes shape them.</small></a></li>
</ul>

The RF parts are not a separate program. A horn's beam is a Gaussian beam traced by the same tracer as a laser's, through lenses of RF dielectrics instead of glass; the only differences are the units, GHz and dBm, and the parts, which are the ones a quasi-optical bench has.

## The designers

<ul class="dx-cards dx-two">
  <li><a href="/jek/docs/jekray/lens-design/"><b>Optical designer</b><small>A lens system surface by surface: prescription, aberrations, spots, wavefront, MTF, optimisation, tolerancing, drawings and a report.</small></a></li>
  <li><a class="rf" href="/jek/docs/jekray/rf/designer/"><b>RF designer</b><small>A feed horn's beam through RF lenses and mirrors as an antenna: gain, sidelobes, cross-polar, scan, tolerancing, and a lens that can be made.</small></a></li>
  <li><a href="/jek/docs/jekray/coating-design/"><b>Coating design</b><small>A thin-film stack on a face, judged over a band and a range of angles, its thicknesses optimised, and put straight on the face.</small></a></li>
</ul>

Each opens from a part on the bench, works on the same data, and writes its result back to the bench, so what is designed is what is traced.

## How the models fit together

1. **The tracer** follows rays through the free-space and RF optics with exact geometry, real materials, polarisation and optical path. Along the way it builds the *beam tree*: every branch a Gaussian beam takes at splitters, surfaces and round trips in cavities.
2. **The field engine** propagates each source's diffracted field along that tree, adds the branches of one source as fields, and solves cavities in their steady state. A horn's aperture field is propagated the same way.
3. **The fibre network** takes in the light reaching fibre tips by mode overlap, follows every path through couplers, circulators and amplifiers, and sends light back out of tips into free space.
4. **The chip solver** treats each photonic chip as one part of the fibre network, with a scattering matrix found by solving its circuit at each wavelength.
5. **The electronics** read photodiodes and the IF and video outputs of receiving horns, and drive lasers, modulators and upconverting horns. Light and beams are worked out quasi-statically against the slow electrical signals.

## What it leaves out

Every free-space and RF part has all six degrees of freedom: x and y on the bench, z above it (0 to 2 m), facing, tip and roll. The beam is followed in three dimensions through all of them, and the 3D view shows it (see [Heights](/jek/docs/jekray/free-space/#heights)). The limits:

- Fibre, electronic and chip parts lie in the plane, and the 3D view leaves them out.
- The designers' fields lie in the bench plane (the tangential section); sagittal and skew rays are traced, but a field cannot be set out of the plane.
- There are no mechanics and no heating: mounts, forces on optics and thermal lensing are not modelled. The exceptions are the designers' thermal analyses and the forces on atoms and particles in an optical trap.
- An RF lens is traced as a smooth dielectric. Above the frequency at which its structure would scatter, which its panel gives, the figures no longer hold.

Each modelling page ends with the limits of its own models, and each part page lists the assumptions its model makes.

## Conventions

Lengths are in millimetres unless a unit is given, angles in degrees, wavelengths in nanometres; RF parts take frequency in GHz and power in dBm. The bench's x is to the right and y is up. **s** polarisation is out of the bench plane and **p** is in it. Fields go as $$e^{-ikz}$$ (Siegman's convention), so a Gaussian beam is $$\exp(-ikr^2/2q)$$ with $$q = z + i z_R$$. [Concepts](/jek/docs/jekray/concepts/) sets these out in full.

## Checking the models

The [validation page](/jek/tools/jekray-validation.html) compares JEKray with analytic results and published data, case by case, and runs in your browser. Part pages link to the cases that test them, and the design pages list what each feature was checked against.
