---
layout: docs
title: Optical chopper
permalink: /jek/docs/jekray2d/free-space/chopper/
description: The JEKray2D optical chopper, a slotted wheel that chops the beam on and off, with a reference output for a lock-in.
element: { palette: Free space, type: chopper }
---

<p class="dx-lead">An optical chopper is a slotted wheel across the beam: open for part of each cycle, shut for the rest. Photodetectors behind it see the chopped light, and its reference output drives a lock-in amplifier.</p>

## The model

The chopper is a stop across the beam that is either fully open or fully shut, with sharp edges. It opens for a share $$D$$ of each cycle (the duty) at frequency $$f$$, starting at a phase $$\phi$$ into the cycle. The bench draws it open, and traces it open.

The light through it is a square wave. A photodiode behind it reads its light when open and nothing from it when shut. In the electronics, its power is the Fourier series of that square wave, a DC level $$D\,P$$ and harmonics:

$$
P(t) = P\left[D + \sum_{n\ge 1} \frac{2\sin(n\pi D)}{n\pi}\cos\!\left(n(2\pi f t - \phi) - n\pi D\right)\right].
$$

The chopper's **reference output** is a TTL square wave at $$f$$, in step with the wheel. A lock-in amplifier referenced to it picks out the chopped light's component at $$f$$ and rejects what the chopper does not chop, such as room light or a detector's offset.

The phase matters only against something else on the same clock, such as another chopper or a generator's drive. A lock-in referenced to this chopper's own output sees no change, since its reference shifts with it.

## Settings

{% include jekray2d_params.html group="free" key="chopper" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The edges are sharp: the wheel's blades cross the beam instantly, however large the beam.
- Rays and the diffracted field on the bench are drawn with the chopper open. Only the electronics see it chopped.
</div>

## Related

- [Electronics: the lock-in amplifier](/jek/docs/jekray2d/electronics/#the-lock-in-amplifier).
- [Photodetector](/jek/docs/jekray2d/free-space/detector/).
