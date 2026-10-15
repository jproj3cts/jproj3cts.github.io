---
layout: docs
title: Comparator
permalink: /jek/docs/jekray/electronics/comparator/
redirect_from: /jek/docs/jekray2d/electronics/comparator/
description: "The JEKray comparator: one level above its threshold and another below, its output worked out exactly from the crossings."
element: { palette: Electronics, type: elec, kind: comp }
---

<p class="dx-lead">A comparator switches its output between two levels as its input crosses a threshold. It turns a sine into a square wave, or a photodiode's signal into a digital edge.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

The output is $$V_\text{hi}$$ while the input is above the threshold $$V_\text{th}$$ and $$V_\text{lo}$$ while it is below.

For a periodic input, whose tones are all harmonics of the lowest, $$f_0$$, the input is rebuilt over one period on a fine grid, its crossings found and placed by interpolation. The output is piecewise constant between them, so its Fourier series follows exactly. Over a segment from phase $$a$$ to $$b$$ at level $$y$$, it adds

$$
\frac{y\,(b - a)}{2\pi} \text{ to the DC}, \qquad
\frac{i y}{n\pi}\left(e^{-inb} - e^{-ina}\right) \text{ to harmonic } n,
$$

up to the 99th harmonic. An input with no tones gives $$V_\text{hi}$$ or $$V_\text{lo}$$ by its DC.

An input whose tones share no period is worked out from its DC and its strongest tone alone, and the comparator says so.

## Settings

{% include jekray_params.html group="elec" key="comp" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- No hysteresis and no delay: the output switches the moment the input crosses.
- Noise on the input, which would make the edges jitter, is not carried to the output. The comparator notes when there is enough to matter.
</div>

## Related

- [Electronics: non-linear blocks](/jek/docs/jekray/electronics/#non-linear-blocks).
- [DAQ](/jek/docs/jekray/electronics/daq/).
