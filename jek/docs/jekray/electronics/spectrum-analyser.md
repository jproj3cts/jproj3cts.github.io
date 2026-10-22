---
layout: docs
title: Spectrum analyser
permalink: /jek/docs/jekray/electronics/spectrum-analyser/
redirect_from: /jek/docs/jekray2d/electronics/spectrum-analyser/
description: "The JEKray spectrum analyser: each tone at its rms level in dBV over the noise in the resolution bandwidth."
element: { palette: Electronics, type: elec, kind: spec }
---

<p class="dx-lead">An electrical spectrum analyser. It shows the signal reaching it against frequency: each tone as a peak at its rms level, over the noise floor in its resolution bandwidth.</p>

## Ports

One input, **in**. It has no outputs.

## The model

Each tone of amplitude $$\lvert c\rvert$$ shows as a peak at its rms level, in dB of a volt (or an amp, for a current):

$$
L_\text{tone} = 20\log_{10}\frac{\lvert c\rvert}{\sqrt2}\ \text{dBV}.
$$

The noise shows as its density times the resolution bandwidth $$b$$:

$$
L_\text{noise}(f) = 10\log_{10}\big(S(f)\, b\big)\ \text{dBV}.
$$

So narrowing the resolution bandwidth lowers the noise floor and leaves the tones where they are, as on a real analyser. The frequency axis is log or linear, between two frequencies set or, at 0, automatic. The vertical axis runs down from a top level, at so many dB a division, or automatic.

## Settings

{% include jekray_params.html group="elec" key="spec" %}

## Readouts

Its panel draws the spectrum, which can be saved as a picture (PNG) or as its numbers (CSV) with a free account.

## Assumptions

<div class="dx-warn" markdown="1">
- An ideal analyser: no noise floor of its own, no spurs, and no input attenuator to set.
- Tones are drawn as peaks at their frequencies, not swept through the filter's shape.
</div>

## Related

- [Oscilloscope](/jek/docs/jekray/electronics/oscilloscope/).
- [Optical spectrum analyser](/jek/docs/jekray/fibre/osa/), for the light.
