---
layout: docs
title: Oscilloscope
permalink: /jek/docs/jekray/electronics/oscilloscope/
redirect_from: /jek/docs/jekray2d/electronics/oscilloscope/
description: "The JEKray oscilloscope: two channels rebuilt from their tones, with a band for the noise, in Normal or Roll mode."
element: { palette: Electronics, type: elec, kind: scope }
---

<p class="dx-lead">A two-channel oscilloscope. It shows the waveforms reaching its inputs over a time span, with a band for their noise, or, in Roll mode, how a level changes as a sweep plays.</p>

## Ports

Two inputs, **ch1** (red) and **ch2** (blue). It has no outputs.

## The model

### Normal

Each channel is rebuilt from its DC and tones over the time span,

$$
v(t) = v_\text{DC} + \sum_j \operatorname{Re}\!\left(c_j\, e^{i 2\pi f_j t}\right),
$$

from $$t = 0$$, where every generator's cycle starts. Round it is a band of $$\pm 1\sigma$$ for the noise, the rms of the noise density up to the scope's 100 MHz bandwidth. A tone too fast to draw over the span fills a lighter band as wide as its swing, as on a real scope. On auto the span is three periods of the slowest tone.

### Roll

Roll shows the level recorded as a parameter sweep plays, over the last span of the sweep's clock (10 s on auto). Slow changes, a mirror scanning or a laser tuning, show as they happen. When nothing changes the trace is flat, with the same bands.

### Scales

Each channel has its own vertical scale, channel 1's on the left and channel 2's down the right, on eight divisions. Each is set as so much a division about an offset (the level at the centre line), or left at 0 for auto.

## Settings

{% include jekray_params.html group="elec" key="scope" %}

## Readouts

Its panel draws the traces, which can be saved as a picture (PNG) or as their numbers (CSV).

## Assumptions

<div class="dx-warn" markdown="1">
- The steady state only: the trace is what the circuit settles to, not a transient after a change.
- Noise is drawn as a band, not as a random trace.
- Its inputs do not load the circuit.
</div>

## Related

- [Spectrum analyser](/jek/docs/jekray/electronics/spectrum-analyser/).
- [Photodetector](/jek/docs/jekray/free-space/detector/), whose Signal views share this scope.
