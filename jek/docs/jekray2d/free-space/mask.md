---
layout: docs
title: Mask
permalink: /jek/docs/jekray2d/free-space/mask/
description: The JEKray2D mask, a thin element with any amplitude and delay written as a formula, for apodisers, SLM patterns, vortex plates, gratings and ideal lenses.
element: { palette: Free space, type: mask }
---

<p class="dx-lead">A mask is a thin plane with an amplitude transmission and a delay you write as formulas. It models apodisers, pinholes, spiral phase plates, fork holograms, blazed and binary gratings, a spatial light modulator's pattern, and an ideal lens or objective.</p>

## The model

### What it does to the field

A mask multiplies the field by its transmission:

$$
E_\text{out}(x, y) = A(x, y)\; e^{-i 2\pi D(x, y)}\; E_\text{in}(x, y),
$$

with $$A$$ the amplitude and $$D$$ the delay, in waves. The variables are:

- $$x$$: along the mask, in the bench plane, mm;
- $$y$$: out of the plane, mm;
- $$r = \sqrt{x^2 + y^2}$$ and $$\theta = \operatorname{atan2}(y, x)$$;
- $$\lambda$$: the light's wavelength, in mm.

A mask that is round about the beam keeps the field round. Anything else makes it a 2D field.

### What it does to rays

Rays take $$A$$ and $$D$$ where they cross. They also bend by the slope of the delay in the plane, as a grating or a lens would bend them:

$$
\Delta(\sin\vartheta) = \lambda\,\frac{\partial D}{\partial x}.
$$

So a phase lens focuses rays, and a grating's slope steers them. The Gaussian beam's pilot takes the lens the delay's curvature makes, in the plane and out of it. A jump in the delay, a binary grating's step, has no slope and bends nothing. A jump of whole waves, a blazed grating's or a kinoform's reset, is no jump at all.

### Formulas

A formula can use `+ - * / ^` (a power, which binds tighter than a leading minus), the numbers `pi` and `e`, and these functions:

| Functions | |
|---|---|
| `sin cos tan asin acos atan atan2` | trigonometry |
| `exp log sqrt abs pow` | |
| `min max floor ceil round sign hypot` | |
| `mod(a, b)` | $$a$$ modulo $$b$$, always positive |
| `step(v)` | 1 where $$v \ge 0$$, else 0 |
| `rect(v)` | 1 where $$\lvert v\rvert \le 1/2$$ |
| `circ(v)` | 1 where $$v \le 1$$ |
| `sinc(v)` | $$\sin(\pi v)/(\pi v)$$ |
| `gauss(v)` | $$e^{-v^2}$$ |

Formulas are parsed into a tree and compiled. Only these names exist in them, so a mask cannot run any other code, whoever wrote the bench.

### Presets

| Preset | Amplitude | Delay |
|---|---|---|
| Gaussian apodiser | `exp(-(r/2)^2)` | 0 |
| Pinhole, 1 mm | `circ(r/0.5)` | 0 |
| Annulus | `step(r-1)*step(2-r)` | 0 |
| Phase lens, f = 100 mm | 1 | `-r^2/(2*100)/lambda` |
| Axicon, 10 mrad | 1 | `-0.01*r/lambda` |
| Vortex, charge 1 | 1 | `theta/(2*pi)` |
| Fork hologram, 0.1 mm | 1 | `mod(x/0.1 + theta/(2*pi), 1)` |
| Blazed grating, 0.1 mm | 1 | `mod(x/0.1, 1)` |
| π step (TEM₀₀ to HG₁₀) | 1 | `0.5*step(x)` |
| Binary phase grating, 0.2 mm | 1 | `0.5*step(sin(2*pi*x/0.2))` |
| Amplitude grating, 0.2 mm | `step(sin(2*pi*x/0.2))` | 0 |

An **ideal lens** of focal length $$f$$ has the delay of a perfect converging sphere, `-(sqrt(r^2+f^2)-f)/lambda`, with $$f$$ written as a number in mm. It focuses without aberration at any numerical aperture, so it stands in for a microscope objective whose prescription you don't have.

### Sampling

Where the formula jumps inside a grid sample, the sample takes the mean transmission over its footprint, amplitude and phase alike, not the value at its centre. A hard edge is then anti-aliased, as a stop's edge is. A mask whose detail is finer than about four samples is flagged rather than quietly smoothed: raise the source's grid (`popN`) to resolve it.

## Settings

{% include jekray2d_params.html group="free" key="mask" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The mask is thin: it multiplies the field in one plane, with no thickness and no angle dependence.
- A delay is in waves at the light's own wavelength, as an SLM writes it. A real glass phase plate's delay scales with $$1/\lambda$$; write the formula with `lambda` to model that.
</div>

## Related

- [Stop](/jek/docs/jekray2d/free-space/stop/), for plain openings.
- [Source: higher-order modes](/jek/docs/jekray2d/free-space/source/#higher-order-modes), for beams a mask can make.
