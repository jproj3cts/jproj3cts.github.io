---
layout: docs
title: Beam splitter
permalink: /jek/docs/jekray2d/free-space/cube/
description: The JEKray2D beam splitter cube, non-polarising or polarising, with its coated diagonal and glass faces.
element: { palette: Free space, type: cube }
---

<p class="dx-lead">A beam splitter cube: two glass prisms with a coating on the diagonal between them. A non-polarising cube splits every polarisation in a set ratio. A polarising cube reflects s and passes p.</p>

## The model

### Geometry

The cube is a square of glass with its edge length as its size, and a coated diagonal from one corner to the opposite one. At an angle of 0 the diagonal runs like "/":

- light travelling +x transmits straight on and reflects up to +y;
- light travelling −x reflects down to −y.

At 90° the diagonal runs like "\\", so +x reflects to −y.

### The faces

Light enters and leaves through the four outer faces, refracting by Snell's law into and out of the glass at its own wavelength. Each face reflects by its Fresnel coefficients or by the coating set on the faces (bare glass by default, or an AR coating). See [Free-space optics: Fresnel coefficients](/jek/docs/jekray2d/free-space/#fresnel-coefficients).

### The diagonal

The coated diagonal reflects a share $$R_s$$ of s and $$R_p$$ of p in power. In amplitude, the reflected field leads the transmitted one by a quarter wave:

$$
r_s = i\sqrt{R_s}, \quad t_s = \sqrt{1 - R_s}, \qquad r_p = i\sqrt{R_p}, \quad t_p = \sqrt{1 - R_p}.
$$

That quarter wave conserves energy, as the coupler's does in fibre, and it is what makes a Michelson or Mach–Zehnder interferometer's two outputs complementary.

- **Non-polarising**: $$R_s = R_p = R$$, the *reflected* share, 50 % by default.
- **Polarising**: $$R_s$$ and $$R_p$$ set separately, 99 % and 1 % by default. The defaults leave a little leakage in each arm, which is what an extinction ratio means in practice.

Each part becomes a branch of its own, so both outputs carry on, and branches of one launch add as fields where they meet again.

## Settings

{% include jekray2d_params.html group="free" key="cube" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The diagonal's reflectances do not depend on wavelength or angle.
- The coating has no thickness and no absorption.
- The cube is square: a plate beam splitter is a partly reflecting [mirror](/jek/docs/jekray2d/free-space/mirror/), or a window with a coating.
</div>

## Related

- [Waveplate](/jek/docs/jekray2d/free-space/waveplate/), which with a polarising cube makes a variable splitter or an optical isolator.
- [Crystal](/jek/docs/jekray2d/free-space/crystal/), for Wollaston and Glan–Taylor polarisers.
