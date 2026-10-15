---
layout: docs
title: On-chip photodiode
permalink: /jek/docs/jekray/chips/photodiode/
redirect_from: /jek/docs/jekray2d/chips/photodiode/
description: "The JEKray on-chip photodiode: absorbs what reaches it and reads it as the fibre photodiodes do, DC, beat notes and demodulation."
element: { palette: Photonic, type: pic, kind: pd }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">An on-chip photodiode ends a waveguide and reads the light that reaches it, as a germanium detector on a silicon chip does.</p>

## Ports

One optical port, **in**, on the chip, and an electrical output, **out**.

## The model

The photodiode is a sink: it absorbs everything that reaches its port and reflects nothing. The chip is solved for the light it takes in from each grating coupler (see [Photonic chips: solving the chip](/jek/docs/jekray/chips/#solving-the-chip)), and the photodiode reads it as a [fibre photodetector](/jek/docs/jekray/fibre/photodetector/) does:

$$
I = \mathcal R\,P, \qquad V = G\,I,
$$

up to its output limit, with beat notes passed through a single pole of its bandwidth. Paths of one laser add as fields, weighted by its coherence; different lasers add as powers and beat. Its noise is shot noise and the gain resistor's Johnson noise. Set a demodulation frequency and phase and its output is mixed down, as for any photodetector (see [Photodetector: demodulation](/jek/docs/jekray/free-space/detector/#demodulation)).

### Electrical output

Its **out** port carries what it reads to the [electronics](/jek/docs/jekray/electronics/): the amplifier's output in volts, or, set as a bare photodiode, its photocurrent in amps, for a [transimpedance amplifier](/jek/docs/jekray/electronics/tia/). Drives on the bench, a laser's modulation or a phase shifter's drive, move it as the light follows them.

## Settings

{% include jekray_params.html group="pic" key="pd" %}

Also *diode*: true for a bare photodiode, its output a current.

## Readouts

The optical power, photocurrent and output (held at its limit, and flagged, when it would go past it), its ports, and its signal: DC, beat notes and the mixer's output, with a scope and spectrum analyser. The chip's spectrum to this photodiode is drawn below it.

## Assumptions

<div class="dx-warn" markdown="1">
- Its responsivity is fixed, not taken from a material's curve.
- No dark current or amplifier input noise.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray/fibre/photodetector/).
- [Grating coupler](/jek/docs/jekray/chips/grating-coupler/).
