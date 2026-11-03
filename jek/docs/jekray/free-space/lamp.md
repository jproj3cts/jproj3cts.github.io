---
layout: docs
title: Lamp
permalink: /jek/docs/jekray/free-space/lamp/
description: The JEKray lamp, a point that shines all round, its rays evenly spaced, for lighthouses, bulbs and anything lit from one point in every direction.
---

<p class="dx-lead">A lamp shines every way: a lighthouse's lamp, a bulb, a candle. Its rays leave in every direction, up and down as well as round, evenly spaced, and lenses, mirrors and detectors take what reaches them. For a quick 2D bench, the <strong>Circular lamp</strong> is a point shining round the bench plane only.</p>

## The model

A lamp has a **shape** and a **size**, and its light leaves from its surface. It is a **sphere** (its diameter) or a **cylinder** (its diameter and length), the cylinder's axis along the lamp's **direction** tipped up by **Axis tipped up**: 90° stands it on end, like a candle or a lighthouse's mantle, 0° lays it along its direction, like a strip light, and anything between tilts it. On the bench, seen from above, it is drawn as its outline: a circle, or the rectangle a tipped cylinder covers.

Its **rays in all** are spread evenly over the directions it shines in, and each leaves from the lamp's face as seen from that direction, from all across it in three dimensions: across a sphere's disc, across a cylinder's side and ends, so its light starts from all its heights too (from an even two-dimensional sequence, so neighbouring rays start far apart). A surface that glows evenly looks just that way from every side, an evenly bright disc (a Lambertian surface), so the lamp's size shows: a lens images it as a patch its size times the magnification, and a lighthouse's beam spreads by about the lamp's size over the lens's focal length, a 10 mm lamp's beam plainly wider than a 1 mm one's. A diameter of **0** makes it a point, its rays 360°/N apart, the first along its **direction**. A new lamp is a 1 mm sphere; one saved before lamps had a size opens as a point.

Its **body takes the light that comes back to it**: a mirror behind a bulb sends some of its light back into the bulb, lost, as in a real torch or headlight.

**Shines up and down to** (°) is how far above and below the bench plane its light goes: 90° (the default) is every way, a whole sphere of directions; less is a band about the plane, as a lighthouse's lamp needs only the light its lenses take. The rays are spread over the band in rings of latitude, each ring given rays in proportion to its share of the sphere (its cosine), every other ring turned half a step, so they pack as a honeycomb and a lens catches an even, round patch of them; **Rings each way** is worked out from the rays to space them about as far apart up as round, unless you set it. The total stays the rays you set, and so does the power. The 3D view shows the light's height: a lighthouse's beams as beams, not a sheet.

## The Circular lamp

**Add part › Circular lamp** is a point shining round the bench plane only, its rays $$360°/N$$ apart, the first along its direction: the plain fan of a 2D bench, traced quickly. It has a wavelength (and more, for white light), a power and its rays round it. A point lamp saved before lamps shone every way (no size, no light up and down) opens as one, so it traces as it did. In a file it is `{"type": "lamp2d"}`.

Its **power** is shared by all its rays, so a detector reads the share of the light that reaches it: a lens 70 mm across, 87.5 mm off, takes about 12 % (44° of 360). More points draw a fuller glow and catch finer detail; a lighthouse's lenses want 200 or so. It is one wavelength, or several (**More wavelengths**, for white light), each firing the same rays. The light is unpolarised, each ray carried as two halves. The panel says how many rays it sends in all.

## Settings

- **Shape**: sphere or cylinder; **Diameter** (mm, 0 a point); a cylinder's **Length** (mm) and **Axis tipped up** (°, 90 standing).
- **Wavelength** (nm), and **More wavelengths** for white light.
- **Power** (mW), shared by all its rays.
- **Rays in all** (1 to 501): spread round it, and over the rings when it has light up and down.
- **Shines up and down to** (°, 90 every way) and **Rings each way** (auto unless set).
- **Direction** (°): the way a cylinder lying down points, and where a point lamp's first ray goes.

## A lighthouse

Group the lamp with the lenses round it (select them all, Ctrl+G), then under **Turn the group** choose the lamp to turn about: its **Spin** (°) turns the lenses round it. A sweep of Spin from 0 to 360, played, spins the ring, and a detector far off sees a flash each time a lens faces it. [Fresnel lenses](/jek/docs/jekray/free-space/lens/#fresnel-lenses) make the ring light, as a real lighthouse's are.

In a bench file a lamp is `{"type": "lamp", "lampShape": "sphere", "lampD": 1, "wavelength": 580, "power": 1, "rays": 500, "elev": 90}` (`elev` 90 every way, the default; `rings` 0 or left out: worked out) (`lampShape` `"sphere"` or `"cylinder"`, `lampL` a cylinder's length, `lampTip` its axis tipped up, 90 standing; a `"tube"` saved before opens as a cylinder lying down), saved as a source with `"lamp": true`.

## Related

- [Source](/jek/docs/jekray/free-space/source/): a beam, a laser, a fan of rays, a source with an angular size (the sun).
- [Lens](/jek/docs/jekray/free-space/lens/), including Fresnel lenses.
