---
layout: docs
title: Amplifier
permalink: /jek/docs/jekray/electronics/amplifier/
redirect_from: /jek/docs/jekray2d/electronics/amplifier/
description: "The JEKray voltage amplifier: a gain and a single-pole bandwidth, its input noise, and an output limit."
element: { palette: Electronics, type: elec, kind: amp }
---

<p class="dx-lead">A voltage amplifier: a gain, a bandwidth set by a single pole, the noise it adds at its input, and an output limit past which it would clip.</p>

## Ports

One input, **in**, and one output, **out**.

## The model

The amplifier is a single pole of gain $$G$$ and bandwidth $$B$$:

$$
H(f) = \frac{G}{1 + i f/B}, \qquad \lvert H(B) \rvert = \frac{G}{\sqrt2}.
$$

Each tone is multiplied by $$H(f)$$, so it is amplified and turned back in phase, by 45° at the bandwidth. The amplifier adds its own input noise $$e_n$$ (V/√Hz) before its gain:

$$
S_\text{out}(f) = \lvert H(f)\rvert^2\left(S_\text{in}(f) + e_n^2\right).
$$

When the output's peak would pass the output limit, the amplifier says so: it would clip. The signal it hands on is not clipped. An input that is a current (a bare photodiode's) is read as volts, and the amplifier notes it: a [transimpedance amplifier](/jek/docs/jekray/electronics/tia/) is the block for a current.

## Settings

{% include jekray_params.html group="elec" key="amp" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired or an output past its limit, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- One pole: no second pole, no peaking and no slew-rate limit.
- Linear up to its limit, and not clipped past it, only flagged.
- Its input noise is white: no 1/f corner.
</div>

## Related

- [Transimpedance amplifier](/jek/docs/jekray/electronics/tia/).
- [Electronics: linear blocks](/jek/docs/jekray/electronics/#linear-blocks).
