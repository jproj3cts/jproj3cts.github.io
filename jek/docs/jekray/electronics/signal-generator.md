---
layout: docs
title: Signal generator
permalink: /jek/docs/jekray/electronics/signal-generator/
redirect_from: /jek/docs/jekray2d/electronics/signal-generator/
description: "The JEKray signal generator: sine, square, triangle or pulse as a Fourier series, with an offset, a phase and a 0–5 V sync output."
element: { palette: Electronics, type: elec, kind: sig }
---

<p class="dx-lead">A signal generator, a function generator on the bench: a sine, square, triangle or pulse wave at a set frequency, amplitude and offset, and a sync output to reference a lock-in or a scope to.</p>

## Ports

Two outputs: **out**, the waveform, and **sync**, a 0–5 V square wave at the same frequency.

## The model

The waveform is its Fourier series, a DC level and tones at the harmonics of the frequency $$f$$, up to the 99th (and below 10 GHz). With amplitude $$A$$, duty $$D$$ (a share of the period) and $$\omega = 2\pi f$$:

| Waveform | Its series |
|---|---|
| Sine | $$A\sin\omega t$$ |
| Triangle | $$\dfrac{8A}{\pi^2}\displaystyle\sum_{n\ \text{odd}} \frac{(-1)^{(n-1)/2}}{n^2}\sin n\omega t$$, rising through zero as the sine does |
| Square, $$A$$ for the first $$D$$ of the period, $$-A$$ after | $$A(2D - 1) + \displaystyle\sum_{n\ge1} \frac{4A}{n\pi}\sin(n\pi D)\cos\!\big(n(\omega t - \pi D)\big)$$ |
| Pulse, $$A$$ for the first $$D$$, 0 after | $$AD + \displaystyle\sum_{n\ge1} \frac{2A}{n\pi}\sin(n\pi D)\cos\!\big(n(\omega t - \pi D)\big)$$ |

The duty applies to the square and the pulse. The offset adds to the DC level. A phase $$\phi$$ moves the whole waveform earlier by $$\phi/360°$$ of a period: each harmonic $$n$$ turns by $$n\phi$$.

The **sync** output is a square wave from 0 to 5 V, high for the first half of each period, moved by the same phase. It is a TTL reference: a lock-in locks to its fundamental.

Every generator's cycle starts at the same moment, $$t = 0$$, so two generators at one frequency have a fixed phase between them, as if they shared a clock. The oscilloscope's time starts there too.

## Settings

{% include jekray_params.html group="elec" key="sig" %}

## Readouts

The panel gives its output in the steady state: the DC level, the five strongest tones (each one's amplitude, rms and the phase of its cosine), and the noise, as a density at 1 kHz and in rms from 1 Hz to 1 GHz. Any notes, such as an input left unwired or an output past its limit, are listed under it.

## Assumptions

<div class="dx-warn" markdown="1">
- The waveform is exact up to its 99th harmonic and has nothing above it: a square's edges have a finite rise time, as a Gibbs overshoot on the scope shows.
- No noise, jitter or distortion; no output impedance.
</div>

## Related

- [Lock-in amplifier](/jek/docs/jekray/electronics/lock-in/), referenced to its sync.
- [Optical chopper](/jek/docs/jekray/free-space/chopper/), whose reference output is a square wave too.
- [Electronics: generators](/jek/docs/jekray/electronics/#generators).
