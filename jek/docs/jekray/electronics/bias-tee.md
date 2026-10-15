---
layout: docs
title: Bias tee
permalink: /jek/docs/jekray/electronics/bias-tee/
redirect_from: /jek/docs/jekray2d/electronics/bias-tee/
description: "The JEKray bias tee: an RF signal through a capacitor and a DC level through an inductor, added at one output."
element: { palette: Electronics, type: elec, kind: biastee }
---

<p class="dx-lead">A bias tee adds a DC level to an RF signal: the RF through a capacitor, the DC through an inductor, meeting at one output. It biases a modulator while driving it.</p>

## Ports

Two inputs, **rf** and **dc**, and one output, **rf+dc**.

## The model

The RF input passes through a first-order high-pass and the DC input through a first-order low-pass, both with the corner $$f_c$$, and the two are added:

$$
v_\text{out} = \frac{i f/f_c}{1 + i f/f_c}\,v_\text{rf} + \frac{1}{1 + i f/f_c}\,v_\text{dc}.
$$

So the RF port's own DC is blocked, and anything on the DC port above the corner is cut. The noise on each input passes through its own path, and the two add as powers.

## Settings

{% include jekray_params.html group="elec" key="biastee" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- Ideal first-order paths, with no loss and no leakage of one into the other's input.
</div>

## Related

- [DC source](/jek/docs/jekray/electronics/dc-source/) and [signal generator](/jek/docs/jekray/electronics/signal-generator/).
- [Summing junction](/jek/docs/jekray/electronics/summing-junction/), which adds at every frequency.
