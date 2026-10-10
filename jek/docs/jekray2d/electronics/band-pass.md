---
layout: docs
title: Band-pass filter
permalink: /jek/docs/jekray2d/electronics/band-pass/
description: "The JEKray2D band-pass filter: a Butterworth band of set centre and width, of order 1 to 4."
element: { palette: Electronics, type: elec, kind: bpf }
---

<p class="dx-lead">A band-pass filter passes a band about its centre frequency and cuts what is either side. It picks one beat note or harmonic out of a signal.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

The filter is the Butterworth low-pass of order $$n$$ with $$s$$ turned into

$$
s \;\to\; \frac{s^2 + 1}{b\,s}, \qquad s = \frac{i f}{f_0}, \quad b = \frac{\Delta f}{f_0},
$$

for a centre $$f_0$$ and a bandwidth $$\Delta f$$. Its gain is 1 at the centre, and 3 dB down at two frequencies $$f_1$$ and $$f_2$$ with

$$
f_2 - f_1 = \Delta f, \qquad f_1 f_2 = f_0^2,
$$

so the band is symmetric about $$f_0$$ on a log axis. Outside it, the gain falls at $$6n$$ dB an octave of the mapped frequency: an order-$$n$$ band-pass has $$2n$$ poles. DC is blocked.

## Settings

{% include jekray2d_params.html group="elec" key="bpf" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- An ideal Butterworth response, with no noise or loss of its own.
</div>

## Related

- [Low-pass filter](/jek/docs/jekray2d/electronics/low-pass/) and [high-pass filter](/jek/docs/jekray2d/electronics/high-pass/).
- [Lock-in amplifier](/jek/docs/jekray2d/electronics/lock-in/), a far narrower band about its reference.
