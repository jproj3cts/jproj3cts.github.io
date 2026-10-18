---
layout: docs
title: Stop
permalink: /jek/docs/jekray/free-space/stop/
redirect_from: /jek/docs/jekray2d/free-space/stop/
description: The JEKray stop, an iris, slit, double slit, slit comb, knife edge or beam block, acting on rays and on the diffracted field.
element: { palette: Free space, type: stop }
---

<p class="dx-lead">A stop is an opaque plate with an opening: an iris, a slit, a double slit, a comb of slits, a knife edge, or the reverse, a beam block. It cuts the rays and the diffracted field alike, so diffraction from a slit or an edge comes out of the field.</p>

## The model

### Shapes

The stop is a plate of its outer size, set across the beam. Its opening is one of:

| Shape | Opening |
|---|---|
| Iris | a round hole of the clear aperture's diameter |
| Slit | a slit of the given width, and optionally a height out of the plane |
| Double slit | two slits, a separation apart, centre to centre |
| Slit comb | $$N$$ slits a pitch apart |
| Knife edge | everything on one side of the edge |
| Beam block | an opaque disc, open round it |

An offset moves the opening, the slits, the edge or the block along the stop.

### Rays

A ray through an opening carries on untouched. A ray striking a blade stops there. The panel gives the power the stop removes, as a share of what its sources emit.

### The field

The diffracted field is multiplied by the stop's transmission, 1 in the opening and 0 on the blades:

$$
E_\text{out}(x, y) = t(x, y)\, E_\text{in}(x, y).
$$

The field after it then diffracts as it propagates, so a slit's far field is the familiar $$\mathrm{sinc}^2$$, a double slit's has its fringes, and a knife edge shows its Fresnel ripples. An iris on a round beam keeps the field round. A slit, a knife edge or anything off-centre needs the 2D field.

Where an edge falls inside a grid sample, the sample takes the mean transmission over its footprint rather than the value at its centre. A hard edge is then anti-aliased, and the grid does not ring.

A Gaussian beam's reference ray is not stopped by a blade: the beam's power is cut as the field is, and a beam that lands half on the stop is split there, the part that passes carrying on (see [Free-space optics: branches](/jek/docs/jekray/free-space/#branches)).

## Settings

{% include jekray_params.html group="free" key="stop" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The plate is infinitely thin and perfectly black: no edge diffraction from its thickness, no reflection from its blades.
- A slit's height out of the plane applies to the field; rays stay in the plane, so they see only its width.
</div>

## Related

- [Mask](/jek/docs/jekray/free-space/mask/), for any amplitude and phase written as a formula.
- [Screen](/jek/docs/jekray/free-space/screen/), to see the diffraction pattern.
