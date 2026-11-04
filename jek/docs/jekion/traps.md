---
layout: docs
docs: jekion
title: Traps and the trap analysis
permalink: /jek/docs/jekion/traps/
description: "A Paul trap, a quadrupole mass filter and a Penning trap in JEKion, and the trap analysis: Mathieu a and q, stability, secular frequencies, and the Penning frequencies, from the field's curvature at a point."
---

<p class="dx-lead">Tools › Trap analysis (or the Bench panel's section) reads the field's curvature at the analysis point and gives what a trap does to an ion there.</p>

## The analysis point and the species

The analysis is done at the **analysis point**, set with the right-click menu on the bench (the array's centre until one is set), and for the **species** set under Bench settings › Trap analysis, which need not be one of the groups flown. The potentials' second derivatives along each axis are taken by a five-point difference at the node nearest the point.

## Paul traps and mass filters

With RF on any electrode, the Mathieu equation along each axis i,

$$\frac{d^2x_i}{d\tau^2} + (a_i - 2 q_i \cos 2\tau)\, x_i = 0, \qquad \tau = \Omega t / 2,$$

has

$$a_i = \frac{4 q}{m \Omega^2}\,\frac{\partial^2 \phi_{dc}}{\partial x_i^2}, \qquad q_i = -\frac{2 q}{m \Omega^2}\,\frac{\partial^2 \phi_{rf}}{\partial x_i^2},$$

with φ_dc the static potential and φ_rf the RF amplitude's. The motion is stable in the first region while 0 < β_i < 1, with β_i ≈ √(a_i + q_i²/2) (good while a and q are small, as traps are run), and |q_i| < 0.908 when a = 0; the secular frequency is β_iΩ/2. In an ideal Paul trap the two transverse *q* are equal and the axial one twice as large with the opposite sign; the hyperbolic ring and endcaps give that within the staircase ([the array](/jek/docs/jekion/array/)). The Paul trap example holds a Ca⁺ at q_z = 0.73; raise the RF to 200 V and q_z passes 0.908, so it is lost. The quadrupole mass filter example sets the DC and RF so one mass sits in the tip of the stability region.

## Penning traps

With a magnetic field and no RF, the cyclotron frequency ω_c = qB/m, the axial frequency ω_z² = (q/m) ∂²φ/∂z² along the field, and the modified cyclotron and magnetron frequencies ω± = ω_c/2 ± √(ω_c²/4 − ω_z²/2); the trap holds while ω_c² > 2ω_z². The Penning trap example is Ca⁺ in 1 T.

## Without either

The static potential's curvature along each axis gives the harmonic frequency where it confines and says *anti-trapping* where it does not: Earnshaw's theorem says at least one axis is.

## Checking it against a flight

The trap analysis is a local approximation; the flight is the full motion, micromotion and all. The Paul trap example's browser check counts the ion's axial crossings and finds the secular frequency the analysis predicted within 15%; a buffer gas cools the motion down until the two agree closely. Export the path ([data export](/jek/docs/jekion/data-export/)) to take its spectrum yourself.
