---
layout: docs
title: Fibre tip
permalink: /jek/docs/jekray/free-space/fibre-tip/
redirect_from: /jek/docs/jekray2d/free-space/fibre-tip/
description: The JEKray fibre tip, where free-space light is taken into a fibre by mode overlap and a fibre network's light is sent back out.
element: { palette: Free space, type: fibre }
---

<p class="dx-lead">A fibre tip joins free space to the fibre network. Light arriving on its face is taken in by its overlap with the fibre's mode. Light the network sends to it leaves into free space as a beam.</p>

## The model

### The fibre's mode

A single-mode fibre's fundamental mode is close to a Gaussian. Its $$1/e^2$$ radius comes from the core radius $$a$$ and the numerical aperture by Marcuse's fit:

$$
w = a\left(0.65 + \frac{1.619}{V^{3/2}} + \frac{2.879}{V^6}\right), \qquad V = \frac{2\pi a\,\mathrm{NA}}{\lambda}.
$$

### Light into the fibre

The field arriving on the face is rebuilt from the Gaussian beams that reach it: each beam's $$q$$ in the plane and out of it, where it lands, its tilt and its optical path. Beams of one launch add as fields first. The tip then takes in the overlap of that field with its mode, for each polarisation:

$$
\eta = \frac{\left\lvert\int E\, M^*\, \mathrm dA\right\rvert^2}{\int \lvert E\rvert^2\, \mathrm dA \int \lvert M\rvert^2\, \mathrm dA}.
$$

So offset, tilt, a mismatched waist and a wrong focus all cost what they should, out of the plane as in it: a tip raised, tipped or rolled takes the beam where and as it lands (see [heights](/jek/docs/jekray/free-space/#heights)). For two Gaussians of radii $$w_1$$ and $$w_2$$ meeting on axis at their waists, this is the familiar

$$
\eta = \left(\frac{2 w_1 w_2}{w_1^2 + w_2^2}\right)^2.
$$

The light taken in enters the fibre network with its own delay: its optical path, plus the path before its source's launch. Arrivals of one launch keep their own delays, so the network weighs them against each other by the laser's coherence (see [Fibre optics](/jek/docs/jekray/fibre/)).

A tip needs a Gaussian source to couple from: a ray fan has no field to overlap.

### Light out of the fibre

Light the network sends to the tip leaves into free space as the fibre's mode, its waist on the face. As a source has, the tip has two ticks for that light under **Light from the fibre network**: **Trace the ray fan** (with the number of rays and their pattern across the beam) and **Propagate a Gaussian beam along the axis** (with the field model and grid points); each can be off, for a picture of rays alone or a beam alone. It is a source *split from* the laser it came from, so it interferes with the rest of that laser's light. There is one such source for each launch, or for a laser with a line of its own, one for each group of delays within a fiftieth of its coherence length, up to six. The beam is drawn as its outline or as its diffracted field, with a fan of up to 51 rays.

### Collimator

A collimator is a single-mode tip with a lens on it, of focal length $$f$$ (**Collimating lens f**; 0 is a bare tip). It sends the network's light out collimated, as a Gaussian beam of $$1/e^2$$ radius

$$
w_c = \frac{\lambda f}{\pi w},
$$

$$w$$ the fibre's mode: about 0.6 mm at 1550 nm for $$f$$ = 11 mm and a 4.4 µm, NA 0.12 core. It takes light in by that same beam's mode, so a collimated beam of the right size couples fully, and a smaller or larger one, or one off centre or tilted, costs the overlap. Its face is then the lens's **clear aperture**. Add one from either palette as **Collimator**; it is a fibre tip with its lens already set.

### Multimode fibre

A multimode tip (cores of 50 or 62.5 µm, NA 0.22 or 0.275 are usual) takes in whatever lands on its core inside its acceptance cone. That is the share of each beam's power on the core, times the share of its angular spectrum inside $$\pm\mathrm{NA}$$ in each plane. It sends light out filling its core and NA, a beam of

$$
M^2 = \frac{\pi a\,\mathrm{NA}}{\lambda},
$$

capped at 30. Its polarisation and phase are scrambled, and the speckle a real one makes is averaged out.

## Settings

{% include jekray_params.html group="free" key="fibre" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The single-mode mode is a Gaussian of Marcuse's radius: close for a step-index fibre near its cut-off, rougher far from it.
- A collimator's lens is ideal and thin, with its beam's waist on the face; its beam's Rayleigh range (metres) is long against the lens, so a real collimator's waist a focal length on makes no difference. A multimode tip ignores the lens.
- The face is flat and square to the fibre, with no reflection of its own: set an angled or flat end on the fibre itself.
- Light leaving a tip is not taken back into the fibres a second time: a loop of fibre, free space and fibre is followed one way round.
</div>

## Related

- [Fibre optics](/jek/docs/jekray/fibre/), for what happens in the network.
- [Photodetector](/jek/docs/jekray/free-space/detector/), which takes in all of the light on its area instead.
