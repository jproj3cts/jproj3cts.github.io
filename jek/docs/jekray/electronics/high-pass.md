---
layout: docs
title: High-pass filter
permalink: /jek/docs/jekray/electronics/high-pass/
redirect_from: /jek/docs/jekray2d/electronics/high-pass/
description: "The JEKray high-pass filter: a Butterworth response of order 1 to 4 below its corner frequency, blocking DC."
element: { palette: Electronics, type: elec, kind: hpf }
---

<p class="dx-lead">A high-pass filter passes what is above its corner frequency and cuts what is below, DC included. It takes the DC off a photodiode's signal to leave the modulation, as AC coupling does.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

The filter is the Butterworth low-pass of order $$n$$ with $$s$$ turned into $$1/s$$:

$$
H(s) = \prod_{k=1}^{n} \frac{-p_k}{1/s - p_k}, \qquad s = \frac{i f}{f_c},
$$

with the low-pass's poles $$p_k$$ (see [Low-pass filter](/jek/docs/jekray/electronics/low-pass/)). So

$$
\lvert H(f)\rvert = \frac{1}{\sqrt{1 + (f_c/f)^{2n}}},
$$

3 dB down at the corner, falling at $$6n$$ dB an octave below it, and zero at DC. Tones are multiplied by $$H(f)$$ and the noise density by $$\lvert H(f)\rvert^2$$.

## Settings

{% include jekray_params.html group="elec" key="hpf" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- An ideal Butterworth response, with no noise of its own.
- Steady state only: there is no settling after a step.
</div>

## Related

- [Low-pass filter](/jek/docs/jekray/electronics/low-pass/) and [band-pass filter](/jek/docs/jekray/electronics/band-pass/).
- [Bias tee](/jek/docs/jekray/electronics/bias-tee/), whose RF path is a first-order high-pass.
