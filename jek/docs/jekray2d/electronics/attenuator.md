---
layout: docs
title: Attenuator
permalink: /jek/docs/jekray2d/electronics/attenuator/
description: "The JEKray2D electrical attenuator: a set loss in dB, flat in frequency."
element: { palette: Electronics, type: elec, kind: att }
---

<p class="dx-lead">An attenuator scales a signal down by a set number of decibels, at every frequency. It brings a generator's level down to what a modulator wants.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

For an attenuation $$A$$ (dB), every part of the signal is scaled by

$$
g = 10^{-A/20},
$$

the DC and each tone by $$g$$, and the noise density by $$g^2$$. It passes volts or amps alike.

## Settings

{% include jekray2d_params.html group="elec" key="att" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- Flat in frequency and noiseless: a real resistive attenuator adds the Johnson noise of its resistance.
</div>

## Related

- [Amplifier](/jek/docs/jekray2d/electronics/amplifier/).
- [Summing junction](/jek/docs/jekray2d/electronics/summing-junction/), whose gains can scale too.
