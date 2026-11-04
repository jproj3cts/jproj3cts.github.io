---
layout: docs
docs: jekion
title: Flying
permalink: /jek/docs/jekion/flying/
description: "How the particles are integrated: the relativistic equations of motion, the adaptive Runge–Kutta step and its limits, the magnetic field, the background gas's collisions, space charge, and what ends a flight."
---

<p class="dx-lead">Each particle is a point charge in the fields, integrated step by step.</p>

## The equations

The state is the position **x** (mm) and the proper velocity **u** = γ**v** (mm/µs), so the motion is relativistic without special cases:

$$\frac{d\mathbf{x}}{dt} = \frac{\mathbf{u}}{\gamma}, \qquad \frac{d\mathbf{u}}{dt} = \frac{q}{m}\left(\mathbf{E} + \frac{\mathbf{u}}{\gamma} \times \mathbf{B}\right), \qquad \gamma = \sqrt{1 + u^2/c^2}.$$

**E** is the field at the point and time, the node-centred gradient interpolated within the cell ([the array](/jek/docs/jekion/array/)) (the static array and each RF group's array times its cosine); **B** is the uniform field set under Bench settings. An electron at 100 keV moves at 0.55 c and comes out right.

## The step

Dormand–Prince's embedded 5(4) Runge–Kutta step: the difference between its fifth- and fourth-order positions is the error estimate, kept under 10⁻⁴ of a grid spacing; the step shrinks where the field changes quickly and grows where it does not. It is never longer than the **step** setting (a fraction of a grid spacing, 0.5 by default, so a particle sees every cell it crosses) nor a fortieth of the fastest RF period. The **time limit** ends a flight that has not ended otherwise. Each path keeps up to **points kept a path** samples, thinned as it grows.

## The background gas

With a gas on, at each step a gas molecule is drawn from the Maxwell distribution at the gas temperature, and the chance of a collision in the step is 1 − exp(−nσv_rel dt) with n the number density P/kT, σ the hard-sphere cross-section and v_rel the relative speed. A collision is elastic and isotropic in the centre-of-mass frame, as in the hard-sphere model of SIMION's HS1: the particle leaves with v′ = V_cm + (m_g/(m + m_g)) v_rel n̂ for a random unit vector n̂. Helium at a pascal cools an ion in a trap within milliseconds; the group's panel counts the collisions.

## Space charge

With space charge on, every particle flies on one clock and the field at each is the array's plus the Coulomb field of the others, each standing for its group's weight in real charges, softened within half a grid spacing so two that meet do not blow up. The cost grows as the square of the count, so a few hundred particles at most.

## What ends a flight

A splat on an electrode (the crossing placed by bisection between the last two points, so the impact position and energy are right), leaving the array, a detector that stops, or the time limit ([Concepts](/jek/docs/jekion/concepts/)). The bench's results section counts each, with a bar, and which electrodes were hit.
