---
layout: docs
title: Lock-in amplifier
permalink: /jek/docs/jekray/electronics/lock-in/
redirect_from: /jek/docs/jekray2d/electronics/lock-in/
description: "The JEKray lock-in amplifier: demodulation at its reference (or a harmonic) into X and Y in rms, through a low-pass of set time constant and slope, with its noise and settling time."
element: { palette: Electronics, type: elec, kind: lockin }
---

<p class="dx-lead">A lock-in amplifier picks out the part of a signal at its reference frequency and rejects the rest. It reads a weak, chopped or modulated signal out of noise far larger than it.</p>

## Ports

Two inputs, **signal** and **ref**, and two outputs, **x** and **y**.

## The model

### The reference

The lock-in locks to its reference's fundamental: the lowest tone within a tenth of the strongest. A square TTL reference, a generator's sync or a chopper's, locks to its first harmonic. Set a harmonic $$h$$ and it detects at $$h$$ times the fundamental. Zero phase is where the fundamental rises through zero, as a bench lock-in sets it from a TTL edge; at harmonic $$h$$ it is a sine $$h$$ times as fast rising through zero at that same edge. The phase setting $$\theta$$ adds to it.

### Demodulation

The signal is multiplied by two references in quadrature, then low-pass filtered:

$$
X = \Big\langle v(t)\,\sqrt2\cos(\omega t + \theta)\Big\rangle_\text{LP}, \qquad
Y = \Big\langle v(t)\,\sqrt2\cos(\omega t + \theta + 90^\circ)\Big\rangle_\text{LP},
$$

with $$\omega = 2\pi h f_\text{ref}$$. A signal $$A\cos(\omega t + \phi)$$ gives

$$
X = \frac{A}{\sqrt2}\cos(\phi - \theta), \qquad Y = \frac{A}{\sqrt2}\sin(\phi - \theta), \qquad R = \sqrt{X^2 + Y^2},
$$

in rms units, as a bench lock-in reads them. So a sine of amplitude $$A$$ in phase reads $$X = A/\sqrt2$$, and $$\arctan(Y/X)$$ is how far the signal leads the reference.

### The filter

The low-pass is $$n$$ poles (6, 12, 18 or 24 dB an octave) of time constant $$\tau$$:

$$
H(f) = \frac{1}{\left(1 + i 2\pi f\tau\right)^{n}}.
$$

What it does not remove of the mixer's other products is left on X as ripple, and the lock-in says when that is large: lengthen the time constant or steepen the slope. It settles to 99 % in about 5, 7, 9 or 10 time constants for 1 to 4 poles.

### Noise

The noise on X and Y is the noise density beside the reference, moved to DC by the mixer (see [Mixer: noise](/jek/docs/jekray/electronics/mixer/#noise)), times the filter's equivalent noise bandwidth:

$$
\sigma_X = \sqrt{S_\text{mix}(0)\,\mathrm{ENBW}}, \qquad
\mathrm{ENBW} = \frac{1}{4\tau},\ \frac{1}{8\tau},\ \frac{3}{32\tau},\ \frac{5}{64\tau}
$$

for 1 to 4 poles. A longer time constant narrows it, at the cost of a slower response.

### Outputs

The **x** and **y** outputs carry X and Y on, as signals: their DC level, the ripple and the noise. Wire them to a scope, a DAQ or a summing junction.

## Settings

{% include jekray_params.html group="elec" key="lockin" %}

## Readouts

The reference frequency (and the harmonic detected), X, Y, R and θ, the noise on X and Y with its noise bandwidth and the ratio R/σ, the settling time, and any ripple the filter leaves. It notes when the reference carries no tone, or the signal has nothing at the detection frequency.

## Assumptions

<div class="dx-warn" markdown="1">
- The steady state: X and Y are what the filter settles to. Its settling time is reported, not simulated.
- An ideal, analogue lock-in: no reserve to overload, and no harmonics of its own reference.
</div>

## Related

- [Electronics: the lock-in amplifier](/jek/docs/jekray/electronics/#the-lock-in-amplifier).
- [Optical chopper](/jek/docs/jekray/free-space/chopper/) and [signal generator](/jek/docs/jekray/electronics/signal-generator/), for its reference.
- [Mixer](/jek/docs/jekray/electronics/mixer/).
