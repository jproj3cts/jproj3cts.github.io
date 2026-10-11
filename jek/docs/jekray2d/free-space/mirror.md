---
layout: docs
title: Mirror
permalink: /jek/docs/jekray2d/free-space/mirror/
description: The JEKray2D mirror, plane, spherical, conic or off-axis, partly transmitting and chirped, and how it is modelled.
element: { palette: Free space, type: mirror }
---

<p class="dx-lead">A mirror reflects from its coated face. It can be plane, spherical or any conic, cut off-axis from its parent surface, partly transmitting, and chirped, adding a group delay dispersion to each reflection.</p>

## The model

### Shape

The mirror is a surface in its own frame (see [Concepts](/jek/docs/jekray2d/concepts/#surfaces)). Its working face points along the mirror's angle, and its sag is the conic

$$
\mathrm{sag}(y) = \frac{c\,(y + y_0)^2}{1 + \sqrt{1 - (1+k)\,c^2 (y + y_0)^2}} - \mathrm{sag}(y_0), \qquad c = \frac{1}{R},
$$

over $$\vert y\vert $$ up to half its length. $$y_0$$ is the off-axis offset: the aperture slides that far along the parent curve, which is how an off-axis parabola is made ($$k = -1$$). $$R$$ is positive when the mirror is concave towards the light it faces, so its focal length is $$R/2$$. Leave $$R$$ blank for a plane mirror.

### Reflection

Rays and beams reflect by the law of reflection, $$\hat d_r = \hat d - 2(\hat d\cdot\hat n)\hat n$$, at the exact point and normal on the surface. A mirror reflects a share $$R_m$$ of the power (the *reflectance*, %) in amplitude $$\pm\sqrt{R_m}$$, both polarisations alike.

The sign matters for interference. From its coated face a mirror turns the field over, half a wave. From behind, a partly transmitting mirror reflects the other way up, as a lossless one must by the Stokes relations:

$$
t\,t' - r\,r' = 1, \qquad r' = -r.
$$

With the same sign both ways a cavity would not conserve energy, and its reflected light would not cancel on resonance. The rest of the power, $$1 - R_m$$, is transmitted as a branch of its own. A mirror reflecting 100 % absorbs light reaching its back.

For a beam, the reflection is a ray-transfer matrix in the plane, with the surface's local curvature, and one out of it, found from rays traced through the real surface in three dimensions. Off-axis incidence then gives the tangential and sagittal focal lengths

$$
f_t = \frac{R\cos\theta}{2}, \qquad f_s = \frac{R}{2\cos\theta},
$$

so a curved mirror used off axis makes a beam astigmatic, as it does in the lab.

### Tip

A mirror (as any free-space part) can be tipped out of the bench plane by its **Tip** $$\tau$$ (degrees, up positive; shown while the experimental 3D view is on, or when a part has one), as the vertical knob of a kinematic mount tips it. Its normal is then

$$
\hat n = (\cos\phi\cos\tau,\ \sin\phi\cos\tau,\ \sin\tau),
$$

with $$\phi$$ its **Facing**. Rays meet it in 3D, within its round aperture, and reflect by $$\hat d' = \hat d - 2(\hat d\cdot\hat n)\,\hat n$$. Square on, a tip $$\tau$$ sends the light back rising at $$2\tau$$. A tipped 45° fold also turns the polarisation, as a real one does: s and p are taken from the tipped plane of incidence (see [heights](/jek/docs/jekray2d/free-space/#heights)). Two mirrors tipped $$45°$$ one over the other, the upper at its own height and tipped $$-45°$$, make a periscope.

### Chirped mirrors

A mirror can add a group delay dispersion $$\mathrm{GDD}$$ (fs²) to each reflection: a spectral phase $$\tfrac12\,\mathrm{GDD}\,(\omega - \omega_0)^2$$ on the light reflected from its face. A negative GDD compresses a positively chirped pulse. See [Short pulses](/jek/docs/jekray2d/free-space/#short-pulses).

## Settings

{% include jekray2d_params.html group="free" key="mirror" %}

## Readouts

A mirror reads the light arriving at its face as a screen does. Its panel has tabs for:

- the **Rays** that arrive;
- the **Diffraction** pattern: the irradiance map, point spread function, MTF and Strehl ratio of the field;
- the **Pulse**, for a pulsed source.

The light that leaves after it is not changed by reading it.

## Assumptions

<div class="dx-warn" markdown="1">
- The reflectance is the same for s and p, and does not depend on wavelength or angle. For a coating that does, use a [lens](/jek/docs/jekray2d/free-space/lens/) surface with a thin-film stack, or a dichroic filter.
- The mirror has no thickness: transmitted light passes straight through, without a substrate's refraction.
- The surface is a perfect conic: no surface figure error or roughness.
</div>

## Related

- [Lens](/jek/docs/jekray2d/free-space/lens/), for refracting surfaces and thin-film coatings.
- [Free-space optics: cavities](/jek/docs/jekray2d/free-space/#cavities): two or more mirrors facing each other make a cavity, found and solved automatically.
