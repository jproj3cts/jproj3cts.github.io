---
layout: docs
title: Prism
permalink: /jek/docs/jekray/free-space/prism/
redirect_from: /jek/docs/jekray2d/free-space/prism/
description: The JEKray prism, a right-angle prism, an equilateral prism, a window or a Dove prism, in real glass.
element: { palette: Free space, type: prism }
---

<p class="dx-lead">A block of glass with flat faces: a right-angle prism, an equilateral prism, a window or a Dove prism. Rays refract at each face by Snell's law in real glass, reflect by Fresnel or total internal reflection, and disperse by the glass's index against wavelength.</p>

## The model

### Shapes

In the prism's own frame, with its size $$a$$:

| Shape | Faces |
|---|---|
| Right-angle prism | an isosceles right triangle, legs $$a$$, the right angle at the lower left |
| Equilateral prism | an equilateral triangle of side $$a$$, its apex pointing along the prism's angle |
| Window | a plate of thickness $$t$$ and height $$a$$ |
| Dove prism | a trapezoid of height $$a$$ and length $$4.224\,a$$ (as catalogue N-BK7 ones are), its base below and its ends cut at $$45°$$ |
| Pentaprism | the five-sided prism of a camera's viewfinder, faces $$a$$ to $$1.08\,a$$: light in through one face leaves through the next at $$90°$$, whatever the prism's tilt, after two reflections off its two silvered faces (faces 1 and 3, counting from 0) |
| Amici roof prism | drawn as the right-angle prism (the roof is a pair of faces across the bench, which the plane view cannot show): it turns light through $$90°$$ as the right-angle prism does; the roof's extra flip, side to side, is not traced |
| Pellin–Broca prism | a four-sided prism of side $$a$$, angles $$90°$$, $$75°$$, $$135°$$ and $$60°$$: one wavelength, coming in near Brewster's angle, leaves at $$90°$$ after a total internal reflection, the angle set by turning the prism |
| Polygon | the corners you give, in mm in the prism's own frame (x, y pairs, 3 to 16, in order round the shape) |

**Apex.** An equilateral prism's apex points along its angle (+x in its own frame), its base behind: at angle 0 a beam travelling +x meets the base side and the light leaves bent away from the apex, towards the base. Turn it by 180° for the apex the other way. Any shape's faces can be **silvered** (the faces by number, the first face 0, round the shape), as a pentaprism's two reflecting faces come.

A Pellin–Broca prism sends light at exactly $$90°$$ only for the wavelength that crosses it at minimum deviation, at the angle where it meets the first face near Brewster's angle; for N-BK7 at 633 nm, light along +x, that is with the prism turned about $$50°$$. Turning it tunes which wavelength leaves at $$90°$$, as the prism is used to pick one line from a laser.

The prism turns about its centre.

A Dove prism sends light along it in at one end, turns it back up by total internal reflection off its base and out of the other end, so the image leaves upside down across the base. Rolled about the beam by $$\rho$$ (its **Roll**), it turns the image by $$2\rho$$: a ray that went in at $$\mathbf v$$ from the axis leaves at

$$
\mathbf v' = 2(\mathbf v\cdot\hat m)\,\hat m - \mathbf v, \qquad \hat m = (-\sin\rho,\ \cos\rho),
$$

across and up, a mirror image about a line rolled $$\rho$$ from straight up. Its s and p are taken from each face's own plane of incidence, so it turns the polarisation too, as a real one does.

### At each face

Each face is a flat surface between the glass and the air. Rays refract by Snell's law, with the glass's index at their own wavelength from its Sellmeier coefficients:

$$
n_1 \sin\theta_1 = n_2 \sin\theta_2.
$$

Each face reflects by its Fresnel coefficients or its coating, and the reflections become branches of their own when weak reflections are followed. Beyond the critical angle, $$\sin\theta_c = 1/n$$, the light is totally internally reflected. That is how a right-angle prism folds or retro-reflects a beam.

### Dispersion

The angle a prism deviates light by depends on the wavelength, through $$n(\lambda)$$. At minimum deviation an equilateral prism of apex angle $$A = 60°$$ deviates light by $$D$$, where

$$
n = \frac{\sin\!\left(\frac{A + D}{2}\right)}{\sin\!\left(\frac{A}{2}\right)}.
$$

JEKray does not use this formula: it traces each wavelength through the real faces, so the formula comes out of the trace. For a short pulse, the optical path through the glass, at 33 wavelengths across its spectrum, gives its dispersion. Two prisms make a prism compressor.

## Settings

{% include jekray_params.html group="free" key="prism" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The faces are perfectly flat, the corners sharp, and the glass homogeneous.
- Light leaves only through the faces. It is not scattered at the corners.
</div>

## Related

- [Lens](/jek/docs/jekray/free-space/lens/), for curved surfaces in glass.
- [Free-space optics: short pulses](/jek/docs/jekray/free-space/#short-pulses), for prism compressors.
