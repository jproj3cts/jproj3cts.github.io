---
layout: docs
title: Noise source
permalink: /jek/docs/jekray2d/electronics/noise-source/
description: "The JEKray2D noise source: white noise of a set density up to a set bandwidth."
element: { palette: Electronics, type: elec, kind: noise }
---

<p class="dx-lead">A noise source gives white noise of a set density up to a set bandwidth. Add it to a signal to see how a filter, a lock-in or a comparator copes with it.</p>

## Ports

One output, **out**.

## The model

Its output is noise alone, a one-sided power spectral density flat up to the bandwidth $$B$$ and zero above:

$$
S(f) = e_n^2 \quad (f \le B), \qquad v_\text{rms} = e_n\sqrt{B},
$$

with $$e_n$$ the density in nV/√Hz. Noise is kept as a density through the network (see [Electronics: signals](/jek/docs/jekray2d/electronics/#signals)): a filter shapes it by $$\vert H(f)\vert^2$$, and a mixer moves it about the other input's tones.

## Settings

{% include jekray2d_params.html group="elec" key="noise" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired or an output past its limit, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- The noise is Gaussian, white and stationary, with a sharp edge at its bandwidth.
- Noise from one source that reaches a block by two paths is added as if the two were unrelated.
</div>

## Related

- [Summing junction](/jek/docs/jekray2d/electronics/summing-junction/), to add it to a signal.
- [Spectrum analyser](/jek/docs/jekray2d/electronics/spectrum-analyser/).
