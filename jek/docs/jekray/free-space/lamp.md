---
layout: docs
title: Lamp
permalink: /jek/docs/jekray/free-space/lamp/
description: The JEKray lamp, a point that shines all round, its rays evenly spaced, for lighthouses, bulbs and anything lit from one point in every direction.
---

<p class="dx-lead">A lamp is a point that shines all round: a lighthouse's lamp, a bulb, a candle seen from above. Its rays leave in every direction across the bench, evenly spaced, and lenses, mirrors and detectors take what reaches them.</p>

## The model

A lamp has a **shape** and a **size**, and its light leaves from its surface:

| Shape | Seen from above | Its size |
|---|---|---|
| Sphere | a circle | its diameter |
| Cylinder, standing up | a circle | its diameter, and its height (in the 3D view) |
| Tube, lying along its direction | a rectangle | its diameter and its length |

Its **rays in all** are spread evenly over the directions it shines in, and each leaves from the lamp's face as seen from that direction, from all across it (in steps of the golden ratio, so neighbouring rays start far apart). A surface that glows evenly looks just that way from every side, an evenly bright disc (a Lambertian surface), so the lamp's size shows: a lens images it as a patch its size times the magnification, and a lighthouse's beam spreads by about the lamp's size over the lens's focal length, a 10 mm lamp's beam plainly wider than a 1 mm one's. A diameter of **0** makes it a point, its rays 360°/N apart, the first along its **direction**. A new lamp is a 1 mm sphere; one saved before lamps had a size opens as a point.

Its **body takes the light that comes back to it**: a mirror behind a bulb sends some of its light back into the bulb, lost, as in a real torch or headlight.

**Rays up and down** (°) spreads the rays over a band of directions above and below the bench plane: rings of latitude at $$k/R$$ of that angle, $$R$$ **rings each way**, each ring given rays in proportion to its share of the sphere (its cosine), and every other ring turned half a step, so the directions pack as a honeycomb rather than a grid and a lens catches an even, round patch of them. The total stays the rays you set, and so does the power. A lens above or below the lamp catches what reaches it, and the 3D view shows the light's height: a lighthouse's beams as beams, not a sheet. At 0 (the default) every ray is in the plane, as before.

Its **power** is shared by all its rays, so a detector reads the share of the light that reaches it: a lens 70 mm across, 87.5 mm off, takes about 12 % (44° of 360). More points draw a fuller glow and catch finer detail; a lighthouse's lenses want 200 or so. It is one wavelength, or several (**More wavelengths**, for white light), each firing the same rays. The light is unpolarised, each ray carried as two halves. The panel says how many rays it sends in all.

## Settings

- **Shape**: sphere, cylinder standing up, or tube lying along its direction; **Diameter** (mm, 0 a point) and **Height** or **Length** (mm).
- **Wavelength** (nm), and **More wavelengths** for white light.
- **Power** (mW), shared by all its rays.
- **Rays in all** (1 to 501): spread round it, and over the rings when it has light up and down.
- **Rays up and down** (°) and **Rings each way** (1 to 10).
- **Direction** (°): where its outline starts (a tube's length lies along it).

## A lighthouse

Group the lamp with the lenses round it (select them all, Ctrl+G), then under **Turn the group** choose the lamp to turn about: its **Spin** (°) turns the lenses round it. A sweep of Spin from 0 to 360, played, spins the ring, and a detector far off sees a flash each time a lens faces it. [Fresnel lenses](/jek/docs/jekray/free-space/lens/#fresnel-lenses) make the ring light, as a real lighthouse's are.

In a bench file a lamp is `{"type": "lamp", "lampShape": "sphere", "lampD": 1, "wavelength": 580, "power": 1, "rays": 240, "elev": 20, "rings": 3}` (`lampShape` `"sphere"`, `"cylinder"` or `"tube"`, `lampL` a cylinder's height or a tube's length), saved as a source with `"lamp": true`.

## Related

- [Source](/jek/docs/jekray/free-space/source/): a beam, a laser, a fan of rays, a source with an angular size (the sun).
- [Lens](/jek/docs/jekray/free-space/lens/), including Fresnel lenses.
