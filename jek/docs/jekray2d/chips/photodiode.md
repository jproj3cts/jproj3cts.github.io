---
layout: docs
title: On-chip photodiode
permalink: /jek/docs/jekray2d/chips/photodiode/
description: "The JEKray2D on-chip photodiode: absorbs what reaches it and reads it as the fibre photodiodes do, DC, beat notes and demodulation."
element: { palette: Photonic, type: pic, kind: pd }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">An on-chip photodiode ends a waveguide and reads the light that reaches it, as a germanium detector on a silicon chip does.</p>

## Ports

One port, **in**, on the chip.

## The model

The photodiode is a sink: it absorbs everything that reaches its port and reflects nothing. The chip is solved for the light it takes in from each grating coupler (see [Photonic chips: solving the chip](/jek/docs/jekray2d/chips/#solving-the-chip)), and the photodiode reads it as a [fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/) does:

$$
I = \mathcal R\,P, \qquad V = G\,I,
$$

up to its output limit, with beat notes passed through a single pole of its bandwidth. Paths of one laser add as fields, weighted by its coherence; different lasers add as powers and beat. Its noise is shot noise and the gain resistor's Johnson noise. Set a demodulation frequency and phase and its output is mixed down, as for any photodetector (see [Photodetector: demodulation](/jek/docs/jekray2d/free-space/detector/#demodulation)).

## Settings

{% include jekray2d_params.html group="pic" key="pd" %}

## Readouts

The optical power, photocurrent and output (held at its limit, and flagged, when it would go past it), its ports, and its signal: DC, beat notes and the mixer's output, with a scope and spectrum analyser. The chip's spectrum to this photodiode is drawn below it.

## Assumptions

<div class="dx-warn" markdown="1">
- Its responsivity is fixed, not taken from a material's curve.
- It has no electrical output to wire to the electronics: read it on its own panel.
- No dark current or amplifier input noise.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/).
- [Grating coupler](/jek/docs/jekray2d/chips/grating-coupler/).
