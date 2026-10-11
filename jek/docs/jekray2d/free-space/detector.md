---
layout: docs
title: Photodetector
permalink: /jek/docs/jekray2d/free-space/detector/
description: The JEKray2D free-space photodetector, a photodiode with a transimpedance amplifier, its DC level, beat notes, noise and demodulated output.
element: { palette: Free space, type: detector }
---

<p class="dx-lead">A free-space photodiode with a transimpedance amplifier. It takes in all of the light on its active area, and reads out the photocurrent, the output voltage, the beat notes in the light, the noise, and a demodulated signal such as a Pound–Drever–Hall error.</p>

## The model

### The light it takes in

A photodiode takes in $$\lvert E\rvert^2$$ over its active area, a disc of the diameter set. The Gaussian beams that reach it are rebuilt on its face as fields: each beam's $$q$$ in and out of the plane, where it lands, its tilt and its optical path. Beams of one launch add as fields, so a Michelson's output diode sees its fringe, and a beam larger than the diode is clipped. A beam landing above or below the centre, sloped, or on a diode tipped out of the plane is rebuilt where and as it lands (see [heights](/jek/docs/jekray2d/free-space/#heights)). Separate launches add as powers. Ray fans count ray by ray.

A diode can instead be read through its diffracted field, which is slower but right where rays are not: fringes, or a focus smaller than the diode's edges.

### Responsivity

The photocurrent is

$$
I = \mathcal R(\lambda)\, P,
$$

with the responsivity $$\mathcal R$$ (A/W) taken from a typical curve for the diode's material, silicon, InGaAs or germanium, at the light's wavelength, or set to a fixed value.

### The amplifier

A transimpedance amplifier of gain $$G$$ (V/A) turns the current into a voltage, $$V = G I$$, up to its output limit, where it saturates and says so. Its bandwidth $$B$$ is a single pole: a beat note at frequency $$f$$ passes with the factor $$1/(1 + i f/B)$$. Without the amplifier, a bare photodiode, the output is the current itself.

### Beat notes

Light of one laser at two frequency offsets $$f_a$$ and $$f_b$$ (after an AOM, or an EOM's sidebands) beats at $$f_b - f_a$$:

$$
P(t) = P_\text{DC} + \sum 2\operatorname{Re}\!\left(\mathbf E_a\cdot\mathbf E_b^*\, e^{i2\pi(f_b - f_a)t}\right),
$$

with $$\mathbf E$$ the fields summed over the diode, and each pair of paths weighted by the laser's coherence at their delay. Two different lasers beat at the difference of their frequencies, with a wandering phase and a line as wide as both of theirs. The diode's **Signal** section shows the output on an oscilloscope and a spectrum analyser.

### Noise

The noise is shot noise on the photocurrent and dark current, the gain resistor's Johnson noise, and the amplifier's input current noise, over the bandwidth:

$$
\overline{i_n^2} = 2q\left(I + I_\text{dark}\right)B + \frac{4kTB}{G} + i_a^2 B, \qquad T = 295\ \text{K},
$$

and the signal-to-noise ratio is $$20\log_{10}(I / i_n)$$.

### Demodulation

Set a demodulation frequency $$f_d$$, and the output is mixed down at it, with a phase $$\phi_d$$. A tone of amplitude $$V$$ and phase $$\phi$$ at $$f_d$$ gives the DC output

$$
V_\text{mix} = \tfrac12 V \cos(\phi - \phi_d).
$$

With an EOM at the same frequency on the light going to a cavity, the reflected light gives a Pound–Drever–Hall error signal. Sweep the laser, or the cavity's length, to trace it out.

### Electrical output

The diode's output is also an electrical port, which can be wired to the [electronics](/jek/docs/jekray2d/electronics/): amplifiers, filters, lock-ins and instruments.

## Settings

{% include jekray2d_params.html group="free" key="detector" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The responsivity curves are typical ones for each material, not a particular part's.
- The amplifier is linear up to its output limit, a single pole in frequency.
- The diode absorbs everything on its area; it does not reflect.
</div>

## Related

- [Electronics: where light meets the electronics](/jek/docs/jekray2d/electronics/#where-light-meets-the-electronics).
- [EOM](/jek/docs/jekray2d/free-space/eom/), for Pound–Drever–Hall locking.
- [Screen](/jek/docs/jekray2d/free-space/screen/), for the profile of the light rather than its total power.
- [Fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/), the fibre-coupled one, with balanced detection and noise from amplifier ASE.
