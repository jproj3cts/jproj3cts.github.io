---
layout: docs
title: Summing junction
permalink: /jek/docs/jekray2d/electronics/summing-junction/
description: "The JEKray2D summing junction: two inputs added with a gain on each, for subtracting, offsetting or closing an error signal."
element: { palette: Electronics, type: elec, kind: sum }
---

<p class="dx-lead">A summing junction adds two signals, each with a gain of its own. A gain of −1 on one input subtracts it: an error signal from a measurement and a set point, or a balanced pair.</p>

## Ports

Two inputs, **a** and **b**, and one output, **out**.

## The model

$$
v_\text{out} = g_a v_a + g_b v_b,
$$

for the DC and for each tone, tones at one frequency adding as complex amplitudes. The noise adds as powers:

$$
S_\text{out}(f) = g_a^2 S_a(f) + g_b^2 S_b(f),
$$

the two taken as unrelated, even when they come from one source by two paths. Two inputs of one unit (both volts, or both amps) keep it; otherwise the output is in volts.

## Settings

{% include jekray2d_params.html group="elec" key="sum" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- Ideal and noiseless, at every frequency.
- Noise reaching both inputs from one source adds as powers, not as fields: correlated noise does not cancel when subtracted.
</div>

## Related

- [Bias tee](/jek/docs/jekray2d/electronics/bias-tee/).
- [Mixer](/jek/docs/jekray2d/electronics/mixer/), which multiplies.
