---
layout: docs
title: Fibre photodetector
permalink: /jek/docs/jekray2d/fibre/photodetector/
description: "The JEKray2D fibre photodetector, balanced photodetector and bare photodiode: responsivity, amplifier, beat notes, noise with amplifier ASE, and demodulation."
element: { palette: Fibre, type: fcomp, kind: pd }
---

<p class="dx-lead">A fibre-coupled photodetector: a photodiode with an amplifier, reading the power that arrives, its beat notes and its noise. It also comes as a balanced photodetector, two diodes with the second's current taken from the first's, and as a bare photodiode with no amplifier.</p>

## Ports

One optical port, **in**, and an electrical output, **out**. A balanced detector has two optical inputs, **in +** and **in −**.

## The model

### The light it reads

The detector reads the power arriving, the paths of one laser added as fields and weighted by its coherence, and different lasers as powers (see [Fibre optics: solving the network](/jek/docs/jekray2d/fibre/#solving-the-network)). Its photocurrent is

$$
I = \mathcal R\,P,
$$

with the responsivity $$\mathcal R$$ (A/W) from a typical curve for its material (silicon, InGaAs or germanium) at the wavelength of the strongest light reaching it, or set to a fixed value.

### The amplifier

A transimpedance amplifier of gain $$G$$ (V/A) and bandwidth $$B$$ turns the current into a voltage, $$V = G I$$, up to its output limit. A beat note at frequency $$f$$ passes through a single-pole response:

$$
H(f) = \frac{1}{\sqrt{1 + (f/B)^2}}, \qquad \arg H = -\arctan(f/B).
$$

A **bare photodiode** has no amplifier: its output is the photocurrent itself, in amps, for a transimpedance amplifier or a scope in the [electronics](/jek/docs/jekray2d/electronics/).

### Beat notes

Light of one laser at two frequency offsets, from an AOM or an EOM, beats at their difference; two different lasers beat at the difference of their frequencies, with no fixed phase (see [Electronics: photodiodes](/jek/docs/jekray2d/electronics/#photodiodes)).

### Noise

The noise current, in the detector's bandwidth $$B$$, is the sum of

$$
\overline{i_n^2} = 2q\left(I + I_\text{dark}\right)B + \frac{4kTB}{G} + i_a^2 B + \sigma^2_{s\text{-}\mathrm{ASE}} + \sigma^2_{\mathrm{ASE}\text{-}\mathrm{ASE}},
$$

shot noise on all the light and the dark current, the gain resistor's Johnson noise at 295 K, and the amplifier's input current noise $$i_a$$ (pA/√Hz). A bare photodiode has only the shot noise. Where broadband light arrives (an amplifier's ASE, an LED, a source set incoherent), it beats with the signal and with itself:

$$
\sigma^2_{s\text{-}\mathrm{ASE}} = 2\mathcal R^2 P_s\,S(\lambda_s)\,B, \qquad
\sigma^2_{\mathrm{ASE}\text{-}\mathrm{ASE}} = \mathcal R^2 B \sum_j \frac{P_j^2}{B_j},
$$

with $$P_s$$ the signal's power, $$S(\lambda_s)$$ the broadband light's power per hertz at the signal's wavelength, and $$P_j$$ the power in each slice of it, $$B_j$$ wide in frequency. The panel gives the noise in volts (or amps, for a bare photodiode), which part of it is largest, and the electrical signal-to-noise ratio of the DC signal.

### Balanced detection

A balanced detector's current is the difference of its two diodes', $$I = \mathcal R\,(P_+ - P_-)$$. What is the same on both, such as an amplifier's ASE beating with itself, cancels to the common-mode rejection: the beat noise is multiplied by $$10^{-\mathrm{CMRR}/10}$$. What differs, such as the interference between a coupler's two outputs, which is opposite in them, doubles. Shot noise from both diodes adds.

### Demodulation

Set a demodulation frequency $$f_d$$ and phase $$\phi_d$$, and the output is mixed down: the detector reports

$$
V_\text{mix} = \sum_{f = f_d} \tfrac12 V_f \cos(\phi_f - \phi_d)
$$

over the beat notes at $$f_d$$. With an EOM on the light going to a fibre cavity, this is a Pound–Drever–Hall error signal (see [Photodetector: demodulation](/jek/docs/jekray2d/free-space/detector/#demodulation)).

## Settings

{% include jekray2d_params.html group="fibre" key="pd" %}

Also *material*: `si`, `ingaas`, `ge`, or `custom` for the fixed responsivity above; *balanced*, with *cmrr* (dB, 30 to begin with); and *diode*, for a bare photodiode.

## Readouts

The optical power, the photocurrent, the output (held at its limit, and flagged, when it would go past it), the broadband light reaching it, the noise and signal-to-noise ratio, the beat notes and the mixer's output. Its Signal views show the output on an oscilloscope and a spectrum analyser.

## Assumptions

<div class="dx-warn" markdown="1">
- The responsivity curves are typical ones for each material, not a particular part's, read at one wavelength: the strongest light's.
- The amplifier is a single pole and linear up to its output limit. Its readout stops at the limit, but the signal the electronics take is not clipped there.
- Noise from two broadband sources reaching one detector is taken as uncorrelated.
</div>

## Related

- [Photodetector](/jek/docs/jekray2d/free-space/detector/), the free-space one, which shares this model.
- [Electronics](/jek/docs/jekray2d/electronics/), for what its output drives.
- [Fibre amplifier](/jek/docs/jekray2d/fibre/amplifier/), whose ASE sets the beat noise.
