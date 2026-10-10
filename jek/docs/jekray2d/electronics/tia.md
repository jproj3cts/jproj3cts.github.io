---
layout: docs
title: Transimpedance amplifier
permalink: /jek/docs/jekray2d/electronics/tia/
description: "The JEKray2D transimpedance amplifier: a photocurrent into a voltage, with its bandwidth, input current noise and the feedback resistor's Johnson noise."
element: { palette: Electronics, type: elec, kind: tia }
---

<p class="dx-lead">A transimpedance amplifier (TIA) turns a current into a voltage: the amplifier a bare photodiode needs. Its gain is the feedback resistance, in V/A.</p>

## Ports

One input, **in**, a current, and one output, **out**, a voltage.

## The model

Like the voltage amplifier it is a single pole, of gain $$G$$ (V/A) and bandwidth $$B$$:

$$
H(f) = \frac{G}{1 + i f/B}, \qquad V = G\,I \text{ at low frequency}.
$$

Its noise, referred to its input as a current, is the amplifier's input current noise $$i_n$$ and the Johnson noise of the feedback resistor $$R = G$$ at 295 K:

$$
S_\text{out}(f) = \lvert H(f)\rvert^2\left(S_\text{in}(f) + i_n^2 + \frac{4kT}{G}\right).
$$

A larger gain lowers the resistor's noise current, $$\sqrt{4kT/G}$$, which is why sensitive photodetectors use a large one, and pay for it in bandwidth.

Wire a [photodetector](/jek/docs/jekray2d/free-space/detector/) set to a bare photodiode into it. Its input should be a current: a voltage is read as amps, and the TIA notes it. Past its output limit, it says it would clip.

## Settings

{% include jekray2d_params.html group="elec" key="tia" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired or an output past its limit, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- One pole: the photodiode's capacitance does not shape the bandwidth or raise the noise at high frequency (no $$e_n C$$ noise).
- Linear up to its limit, and flagged, not clipped, past it.
</div>

## Related

- [Amplifier](/jek/docs/jekray2d/electronics/amplifier/).
- [Photodetector](/jek/docs/jekray2d/free-space/detector/) and [fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/), which have one built in.
