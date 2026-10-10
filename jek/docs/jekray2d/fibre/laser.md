---
layout: docs
title: Fibre laser
permalink: /jek/docs/jekray2d/fibre/laser/
description: "The JEKray2D fibre laser and fibre-coupled LED: wavelength, power, polarisation, linewidth or band, pulses, and its modulation inputs."
element: { palette: Fibre, type: fcomp, kind: laser }
---

<p class="dx-lead">A laser coupled straight into fibre, the start of most fibre networks. It launches its light into the fibre on its one port. The same part, as a fibre-coupled LED, launches broadband, incoherent light instead.</p>

## Ports

One port, **out**. Light arriving back at it is absorbed: the laser has no cavity of its own for it to disturb. Put an isolator after it to model one that would.

## The model

### The field it launches

The laser launches a Jones vector $$\mathbf E = (E_s, E_p)$$ of power $$P$$ into its fibre. In fibre, *s* and *p* are labels for two orthogonal axes. They become out of the bench plane and in it where a fibre tip meets free space. The polarisation is one of

| Polarisation | $$\mathbf E / \sqrt P$$ |
|---|---|
| s | $$(1, 0)$$ |
| p | $$(0, 1)$$ |
| linear at $$\theta$$ from s | $$(\cos\theta, \sin\theta)$$ |
| circular, right-handed | $$\tfrac{1}{\sqrt2}(1, -i)$$ |
| circular, left-handed | $$\tfrac{1}{\sqrt2}(1, i)$$ |
| unpolarised | s and p halves of $$P/2$$, which never interfere |

Right- and left-handed are as the screens' Stokes $$S_3$$ counts them.

### Its spectrum

A laser is one of three kinds of source.

- **Single frequency.** Every path of its light interferes with every other in full, however long the difference.
- **A line**, with a coherence length $$L_c$$: a linewidth $$\Delta\nu = c/L_c$$, or $$\Delta\lambda = \lambda^2/L_c$$, Lorentzian (a laser's own line) or Gaussian (Doppler, many modes).
- **Incoherent, broadband.** A Gaussian spectrum of a set width. It is followed through the network in slices (see [Fibre optics: broadband light](/jek/docs/jekray2d/fibre/#broadband-light)), so filters, WDMs and Bragg gratings shape it.

Two paths of a line's light a distance $$\Delta L$$ apart interfere with a fringe contrast

$$
\gamma(\Delta L) = e^{-\pi\lvert\Delta L\rvert/L_c} \;\;\text{(Lorentzian)}, \qquad
\gamma(\Delta L) = \exp\!\left(-\frac{(\pi\,\Delta L/L_c)^2}{4\ln 2}\right) \;\;\text{(Gaussian)}.
$$

The network weighs every pair of paths by $$\gamma$$ at their delay (see [Fibre optics: solving the network](/jek/docs/jekray2d/fibre/#solving-the-network)). Separate lasers never interfere, though they beat on a photodiode.

### Pulses

Give the laser a pulse duration $$\tau$$ (FWHM, fs) and it is mode-locked. Its pulses are sech² or Gaussian, at a repetition rate $$f_\text{rep}$$, with an average power $$P$$ and a chirp (GDD) at the laser. Its spectrum is then the pulse's, and its coherence length follows from it. Each fibre's dispersion chirps the pulse on its way, and a pulse strong enough undergoes self-phase modulation (see [Fibre optics: dispersion and self-phase modulation](/jek/docs/jekray2d/fibre/#dispersion-and-self-phase-modulation)).

### A fibre-coupled LED

The LED is the same part as broadband light: spontaneous emission, unpolarised to start with (it can be set otherwise), never pulsed. Its band is a width in nm, 40 nm to begin with. Its power is the power into the fibre.

### External control

Tick *External control* and the laser gets two electrical inputs:

- **mod**, which sets its power: $$P = P_0\,(1 + m v)$$, never below zero, with $$m$$ in % per volt;
- **fm**, which tunes its frequency: $$\Delta\nu = k v$$, with $$k$$ in GHz per volt. Its wavelength shortens as the frequency rises.

So a vapour cell's line, a cavity or a filter turns the frequency drive into a change in power (see [Electronics: drives](/jek/docs/jekray2d/electronics/#drives)).

## Settings

{% include jekray2d_params.html group="fibre" key="laser" %}

Also: the polarisation, *pol* (above); the spectrum, *cmode*: `single`, `line` or `broad`; the line shape, `lorentz` or `gauss`; the band, *bw* (nm), for broadband light; the pulse shape, *pshape*: `sech2` or `gauss`; and *led*, which makes it a fibre-coupled LED.

## Readouts

The panel gives its linewidth or band, its coherence length, and for a pulse its bandwidth, energy and peak power at the transform limit, and, with a chirp, how long it leaves. Its port row gives the power it sends out and any that comes back.

## Assumptions

<div class="dx-warn" markdown="1">
- Light coming back into the laser does not disturb it: no feedback, no injection locking. Use an isolator to make that explicit.
- Its power and wavelength are what are set: there is no threshold, no relaxation oscillation and no intensity noise of its own.
- A pulse's spectrum is a smooth sech² or Gaussian, without the structure of a real mode-locked spectrum.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/) and [optical spectrum analyser](/jek/docs/jekray2d/fibre/osa/), to see what it sends.
- [Source](/jek/docs/jekray2d/free-space/source/), the free-space laser, which shares its coherence and pulse models.
- [Isolator](/jek/docs/jekray2d/fibre/isolator/).
