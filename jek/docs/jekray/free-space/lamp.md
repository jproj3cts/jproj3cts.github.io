---
layout: docs
title: Lamp
permalink: /jek/docs/jekray/free-space/lamp/
description: The JEKray lamp, a point that shines all round, its rays evenly spaced, for lighthouses, bulbs and anything lit from one point in every direction.
---

<p class="dx-lead">A lamp is a point that shines all round: a lighthouse's lamp, a bulb, a candle seen from above. Its rays leave in every direction across the bench, evenly spaced, and lenses, mirrors and detectors take what reaches them.</p>

## The model

A lamp of $$N$$ rays sends them $$360°/N$$ apart, the first along its **direction**, none on top of another. Its **power** is shared by them all, so a detector reads the share of the light that reaches it: a lens 70 mm across, 87.5 mm off, takes about 12 % of a full turn (44° of 360). More rays catch finer detail and draw a fuller glow; a lighthouse's lenses want 200 or so.

It is one wavelength, or several (**More wavelengths**, for white light), each firing the same rays, so a lens shows its colour. The light is unpolarised, each ray carried as two halves.

## Settings

- **Wavelength** (nm), and **More wavelengths** for white light.
- **Power** (mW), shared by all its rays.
- **Rays all round**, 1 to 501.
- **Direction** (°): where its first ray goes. It matters little, unless the rays are few.

## A lighthouse

Group the lamp with the lenses round it (select them all, Ctrl+G), then under **Turn the group** choose the lamp to turn about: its **Spin** (°) turns the lenses round it. A sweep of Spin from 0 to 360, played, spins the ring, and a detector far off sees a flash each time a lens faces it. [Fresnel lenses](/jek/docs/jekray/free-space/lens/#fresnel-lenses) make the ring light, as a real lighthouse's are.

In a bench file a lamp is `{"type": "lamp", "wavelength": 580, "power": 1, "rays": 240}`, saved as a source with `"lamp": true`.

## Related

- [Source](/jek/docs/jekray/free-space/source/): a beam, a laser, a fan of rays, a source with an angular size (the sun).
- [Lens](/jek/docs/jekray/free-space/lens/), including Fresnel lenses.
