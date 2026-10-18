---
layout: docs
title: DC source
permalink: /jek/docs/jekray/electronics/dc-source/
redirect_from: /jek/docs/jekray2d/electronics/dc-source/
description: "The JEKray DC source: a steady voltage, for a bias, an offset or a set point."
element: { palette: Electronics, type: elec, kind: dc }
---

<p class="dx-lead">A DC source gives a steady voltage: a bias for a modulator, an offset to add to a signal, or a set point to hold a laser's power at.</p>

## Ports

One output, **out**.

## The model

Its output is a DC level and nothing else:

$$
v(t) = V_0,
$$

with no tones and no noise. Like every signal, it is worked out in the steady state (see [Electronics: signals](/jek/docs/jekray/electronics/#signals)).

Wired to a laser's **mod** input it scales the laser's power, $$P = P_0(1 + m V_0)$$; to its **fm** input it tunes the laser's frequency; to an EOM, a fibre EOM, a fibre stretcher or a chip's phase shifter it adds a phase or moves the bias. As a parameter it can be swept, to step the light through its response.

## Settings

{% include jekray_params.html group="elec" key="dc" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired or an output past its limit, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- The source is ideal: no noise, no drift and no output impedance.
</div>

## Related

- [Signal generator](/jek/docs/jekray/electronics/signal-generator/).
- [Bias tee](/jek/docs/jekray/electronics/bias-tee/), to add it to an RF signal.
- [Electronics: drives](/jek/docs/jekray/electronics/#drives).
