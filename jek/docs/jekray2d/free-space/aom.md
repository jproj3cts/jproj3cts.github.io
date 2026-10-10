---
layout: docs
title: AOM
permalink: /jek/docs/jekray2d/free-space/aom/
description: The JEKray2D acousto-optic modulator, a Bragg cell that deflects a share of the light into one order and shifts its frequency by the drive.
element: { palette: Free space, type: aom }
---

<p class="dx-lead">An acousto-optic modulator is a Bragg cell: sound at the drive frequency makes a moving grating in a crystal. A share of the light goes into one diffracted order, turned by a small angle and shifted in frequency by the drive. The rest goes straight through, unshifted.</p>

## The model

### The grating

Sound of speed $$v$$ at the drive frequency $$f$$ makes a grating of period $$\Lambda = v/f$$. The chosen order, +1 or −1, takes a share $$\eta$$ of the light (the efficiency), turned from the straight-through beam by

$$
\sin\theta = \pm\frac{\lambda f}{v},
$$

anticlockwise for order +1 and clockwise for −1. The rest, $$1 - \eta$$, carries on in order 0. Both are branches of their own. Tellurium dioxide carries sound at about 4200 m/s, fused silica at 5960 m/s.

### The frequency shift

Because the grating moves, the diffracted light is Doppler shifted by the drive:

$$
\nu_{\pm 1} = \nu \pm f.
$$

Light at a different frequency offset from its laser makes no steady fringes with the rest of the laser's light: it is a different launch as far as adding fields goes. On a photodiode, though, it beats with the unshifted light at the drive frequency, $$f$$. That is how a heterodyne interferometer or an optical frequency shifter works.

### A drive

The AOM's RF level is also an electrical input. Wired to a signal from the [electronics](/jek/docs/jekray2d/electronics/), it sets the efficiency, and so the power in the order, through time, as an amplitude modulator.

## Settings

{% include jekray2d_params.html group="free" key="aom" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Only one diffracted order: a Bragg cell, not a Raman–Nath one, so there are no higher orders.
- The efficiency is set, not worked out from the RF power and the Bragg angle. The cell diffracts its share whatever the angle the light meets it at.
- The diffracted beam keeps the incident beam's shape.
</div>

## Related

- [EOM](/jek/docs/jekray2d/free-space/eom/), for phase and amplitude modulation without deflection.
- [Photodetector](/jek/docs/jekray2d/free-space/detector/), which reads the beat notes.
- [Grating](/jek/docs/jekray2d/free-space/grating/).
- [Fibre AOM](/jek/docs/jekray2d/fibre/aom/), the fibre-coupled one.
