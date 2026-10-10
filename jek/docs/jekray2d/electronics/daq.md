---
layout: docs
title: DAQ (ADC)
permalink: /jek/docs/jekray2d/electronics/daq/
description: "The JEKray2D DAQ: an analogue-to-digital converter that samples its input, folds tones above half its rate back as aliases, and adds quantisation noise."
element: { palette: Electronics, type: elec, kind: daq }
---

<p class="dx-lead">A DAQ, an analogue-to-digital converter, samples its input at a set rate with a set number of bits over a set range. It shows what a computer recording the signal would see: aliases, quantisation and clipping.</p>

## Ports

One input, **in**, and one output, **out**, the signal as it reads it.

## The model

### Sampling and aliases

Sampled at $$f_s$$, a tone at $$f$$ is read at its alias in $$0$$ to $$f_s/2$$:

$$
f_a = f \bmod f_s, \qquad f_a \to f_s - f_a \text{ if } f_a > f_s/2,
$$

with its phase reversed when it folds. A tone at a multiple of $$f_s$$ reads as DC. The DAQ lists the tones above half its rate and where they land.

### Quantisation and noise

$$b$$ bits over $$\pm V_r$$ give a step

$$
\Delta = \frac{2V_r}{2^{b}}, \qquad \sigma_q = \frac{\Delta}{\sqrt{12}}.
$$

All the input's noise, with the quantisation noise, folds into the band from 0 to $$f_s/2$$, taken as flat there:

$$
S_\text{out}(f) = \frac{\sigma_\text{in}^2 + \sigma_q^2}{f_s/2}, \qquad f \le f_s/2.
$$

### Range

When the input's peak passes the range, the DAQ says it would clip. The output is not clipped.

## Settings

{% include jekray2d_params.html group="elec" key="daq" %}

## Readouts

The sample rate and the band it covers, the bits, one step and its quantisation noise, the aliases, then the signal as read: DC, tones and noise.

## Assumptions

<div class="dx-warn" markdown="1">
- No anti-aliasing filter: put a low-pass before it, as a real setup would.
- Ideal sampling: no aperture jitter, no differential non-linearity, and the input noise folded as if flat.
- Clipping is flagged, not modelled.
</div>

## Related

- [Low-pass filter](/jek/docs/jekray2d/electronics/low-pass/), as an anti-aliasing filter.
- [Electronics: non-linear blocks](/jek/docs/jekray2d/electronics/#non-linear-blocks).
