---
layout: docs
title: Electronics
permalink: /jek/docs/jekray2d/electronics/
description: How JEKray2D models the electronics of an experiment, as steady-state tones and noise through amplifiers, filters, mixers and instruments, and how they meet the light.
---

<p class="dx-lead">The electronics of an experiment are drawn as a block diagram and joined by wires: generators, amplifiers, filters, mixers, and the instruments that read them. Signals are worked out in the steady state, as a DC level, a set of tones and a noise spectrum.</p>

## Signals

A signal is what a block hands on. It has three parts:

- a DC level;
- tones, each a frequency $$f_j$$ and a complex amplitude $$c_j$$;
- noise, as a one-sided power spectral density $$S(f)$$ on a logarithmic grid of frequencies, in V²/Hz (or A²/Hz for a current).

Together:

$$
v(t) = v_\text{DC} + \sum_j \operatorname{Re}\!\left(c_j\, e^{i 2\pi f_j t}\right) + n(t), \qquad \langle n^2 \rangle = \int S(f)\, \mathrm df.
$$

Each block is directional: inputs on its left, outputs on its right. A wire runs from one output to one input, and an output may feed any number of inputs.

## Linear blocks

A linear block with transfer function $$H(f)$$ multiplies each tone by $$H(f_j)$$, and the noise density by $$\vert H(f)\vert ^2$$.

An amplifier of gain $$G$$ and bandwidth $$B$$ is a single pole. It adds its own input noise $$e_n$$ (V/√Hz), referred to its input:

$$
H(f) = \frac{G}{1 + i f / B}, \qquad S_\text{out}(f) = \vert H(f)\vert ^2 \left(S_\text{in}(f) + e_n^2\right).
$$

A transimpedance amplifier turns a current into a voltage the same way. Its gain $$G$$ is in V/A, and its noise is the input current noise $$i_n$$ plus the feedback resistor's own, $$4kT/G$$.

Filters are Butterworth, of order 1 to 4. With $$s = i f / f_c$$, the low-pass is

$$
H(s) = \prod_{k=1}^{n} \frac{-p_k}{s - p_k}, \qquad p_k = \exp\!\left(i\pi\,\frac{2k + n - 1}{2n}\right).
$$

The high-pass maps $$s \to 1/s$$. The band-pass maps $$s \to (s^2 + 1)/(b\,s)$$, with $$s = i f / f_0$$ and $$b$$ the bandwidth over the centre frequency.

When a block's output would pass its output limit, it is flagged as clipping. The signal itself is not clipped.

## The mixer

A mixer multiplies its two inputs, with a gain $$k$$ (1/V). Tone by tone,

$$
k\operatorname{Re}\!\left(a e^{i\omega_1 t}\right)\operatorname{Re}\!\left(b e^{i\omega_2 t}\right) = \frac{k}{2}\operatorname{Re}\!\left(ab\, e^{i(\omega_1 + \omega_2)t}\right) + \frac{k}{2}\operatorname{Re}\!\left(a b^*\, e^{i(\omega_1 - \omega_2)t}\right),
$$

and each input's DC carries the other's tones through. The noise on one input is moved by the other's tones. That is how a lock-in turns the noise beside its reference into noise at DC.

## Generators

A signal generator's waveform (sine, square, triangle or pulse, with a duty cycle) is its Fourier series, up to the 99th harmonic. Its sync output is a 0–5 V square wave at its frequency, as a TTL reference. A noise source is white up to its bandwidth.

## Non-linear blocks

- **Comparator.** For a periodic input, the crossings over one period are found and the output's Fourier series is worked out from them exactly, since the output is piecewise constant.
- **DAQ.** The input is sampled at $$f_s$$. Each tone lands at its alias in $$0$$ to $$f_s/2$$. The noise, with the quantisation's own $$\Delta^2/12$$ for a step $$\Delta$$, folds into that band.

## The lock-in amplifier

A lock-in locks to its reference's fundamental, times the harmonic asked for. Zero phase is where that fundamental rises through zero, as a bench lock-in sets it from a TTL edge. The signal is multiplied by $$\sqrt2\cos(\omega t + \theta)$$ and by $$\sqrt2\cos(\omega t + \theta + 90°)$$, then filtered by $$n$$ poles of time constant $$\tau$$. What is left at DC is X and Y, in rms units, so a sine of amplitude $$A$$ in phase reads $$X = A/\sqrt2$$. Their noise is the density beside the reference times the filter's equivalent noise bandwidth:

| Roll-off | ENBW |
|---|---|
| 6 dB/oct | 1/(4τ) |
| 12 dB/oct | 1/(8τ) |
| 18 dB/oct | 3/(32τ) |
| 24 dB/oct | 5/(64τ) |

## Instruments

- **The oscilloscope** rebuilds each channel's waveform from its tones over its time span, with a band of ±1σ for the noise up to its 100 MHz bandwidth.
- **The spectrum analyser** shows each tone as a peak at its rms level in dBV, over the noise in its resolution bandwidth.

## Solving the network

Every output is worked out in the order the wires need: a block once all that feeds it is. An input left open reads nothing. A loop is reported, and its blocks read nothing, since a steady-state solve has no way to follow feedback. Noise from one source reaching a block by two paths is added as if unrelated.

## Where light meets the electronics

Optical parts carry electrical ports too:

- a photodetector's output;
- a laser's modulation and frequency inputs;
- an AOM's RF level input and an EOM's modulation input;
- an optical chopper's reference output.

### Photodiodes

A photodiode's signal is its DC and the beat notes in its light. Light of one laser at two frequency offsets $$f_a$$ and $$f_b$$ beats at $$f_b - f_a$$:

$$
P(t) \ni 2\operatorname{Re}\!\left(\mathbf E_a\cdot\mathbf E_b^*\, e^{i2\pi(f_b - f_a)t}\right),
$$

with $$\mathbf E$$ the fields summed over the diode, and each pair of paths weighted by the laser's coherence at their delay. Two different lasers beat at the difference of their frequencies, but with a wandering phase and a line as wide as both of theirs, so those beats are listed as such. The photocurrent is $$I = \mathcal R P$$, and its noise is shot noise on the photocurrent and dark current, the gain resistor's Johnson noise and the amplifier's input current noise:

$$
\overline{i_n^2} = 2q\left(I + I_\text{dark}\right)B + \frac{4kTB}{R} + i_a^2 B.
$$

### Drives

The light is worked out *quasi-statically*: the electronics are far slower than light crossing the bench. Each drive is set at levels across its swing, the bench traced again at each, and each photodiode's power read. The power then follows the drive through time by that table. With several drives, each is taken alone with the others at their mean, and their effects multiply, as they do for parts in series on one beam.

## Limits

<div class="dx-warn" markdown="1">
- Steady state only: there are no transients, start-up or settling times.
- Linear blocks are linear. Clipping and saturation are flagged, not modelled.
- Feedback loops (a PID round a laser lock, say) are not solved.
- Noise reaching one block by two paths is taken as uncorrelated.
</div>
