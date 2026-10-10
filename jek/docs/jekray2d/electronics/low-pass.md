---
layout: docs
title: Low-pass filter
permalink: /jek/docs/jekray2d/electronics/low-pass/
description: "The JEKray2D low-pass filter: a Butterworth response of order 1 to 4 above its corner frequency."
element: { palette: Electronics, type: elec, kind: lpf }
---

<p class="dx-lead">A low-pass filter passes what is below its corner frequency and cuts what is above. It smooths a demodulated signal, takes the carrier off a mixer's output, or limits the noise bandwidth.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

The filter is a Butterworth low-pass of order $$n$$ (1 to 4), with corner $$f_c$$. With $$s = i f/f_c$$,

$$
H(s) = \prod_{k=1}^{n} \frac{-p_k}{s - p_k}, \qquad p_k = \exp\!\left(i\pi\,\frac{2k + n - 1}{2n}\right),
$$

the poles evenly spaced on the left half of the unit circle. Its gain is maximally flat in the pass band:

$$
\lvert H(f)\rvert = \frac{1}{\sqrt{1 + (f/f_c)^{2n}}},
$$

3 dB down at the corner, and falling at $$6n$$ dB an octave ($$20n$$ dB a decade) above it. At the corner each order turns the phase back by 45°, 90°, 135° or 180°. Tones are multiplied by $$H(f)$$ and the noise density by $$\lvert H(f)\rvert^2$$. It passes volts or amps alike.

## Settings

{% include jekray2d_params.html group="elec" key="lpf" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- An ideal Butterworth response: no component tolerances, no loss in the pass band and no noise of its own.
</div>

## Related

- [High-pass filter](/jek/docs/jekray2d/electronics/high-pass/) and [band-pass filter](/jek/docs/jekray2d/electronics/band-pass/).
- [Mixer](/jek/docs/jekray2d/electronics/mixer/).
- [Electronics: linear blocks](/jek/docs/jekray2d/electronics/#linear-blocks).
