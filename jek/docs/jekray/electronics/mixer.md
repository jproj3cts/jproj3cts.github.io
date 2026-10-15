---
layout: docs
title: Mixer
permalink: /jek/docs/jekray/electronics/mixer/
redirect_from: /jek/docs/jekray2d/electronics/mixer/
description: "The JEKray mixer: the product of its two inputs, tone by tone, with the noise moved by the other input's tones."
element: { palette: Electronics, type: elec, kind: mixer }
---

<p class="dx-lead">A mixer multiplies its two inputs. Fed a signal and a local oscillator at the same frequency, it demodulates: the product has a DC part set by their phase. It is the heart of a lock-in and of a Pound–Drever–Hall lock.</p>

## Ports

Two inputs, **a** and **b**, and one output, **out**.

## The model

The output is the product of the inputs times a gain $$k$$ (1/V):

$$
v_\text{out} = k\,v_a\,v_b.
$$

Taken part by part: each input's DC carries the other's tones through, and each pair of tones makes a sum and a difference:

$$
k\operatorname{Re}\!\left(a e^{i\omega_1 t}\right)\operatorname{Re}\!\left(b e^{i\omega_2 t}\right) = \frac{k}{2}\operatorname{Re}\!\left(ab\, e^{i(\omega_1 + \omega_2)t}\right) + \frac{k}{2}\operatorname{Re}\!\left(a b^*\, e^{i(\omega_1 - \omega_2)t}\right).
$$

Two tones at the same frequency give a DC level $$\tfrac{k}{2}\lvert a\rvert\lvert b\rvert\cos(\phi_a - \phi_b)$$, which is how a mixer reads phase.

### Noise

The noise on each input is moved by the other input's DC and tones. A tone of amplitude $$c$$ on one input moves the other's noise density to either side of it:

$$
S_\text{out}(f) = k^2\Big[v_{a,\text{DC}}^2 S_b(f) + v_{b,\text{DC}}^2 S_a(f) + \sum_{j}\frac{\lvert c_j\rvert^2}{4}\big(S(\lvert f - f_j\rvert) + S(f + f_j)\big)\Big],
$$

summed over each input's tones against the other's noise. So noise beside a reference frequency lands at DC after mixing, as in a lock-in. Noise times noise is left out, as are tones a million times weaker in power than the strongest.

## Settings

{% include jekray_params.html group="elec" key="mixer" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- An ideal multiplier: no leakage of either input to the output, no conversion loss beyond its gain, no harmonics of the local oscillator.
- Noise multiplied by noise is left out.
</div>

## Related

- [Low-pass filter](/jek/docs/jekray/electronics/low-pass/), to keep the DC part.
- [Lock-in amplifier](/jek/docs/jekray/electronics/lock-in/).
- [Electronics: the mixer](/jek/docs/jekray/electronics/#the-mixer).
