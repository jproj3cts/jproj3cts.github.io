---
layout: docs
title: Source
permalink: /jek/docs/jekray2d/free-space/source/
description: The JEKray2D light source, a ray fan and a Gaussian beam, with its wavelength, polarisation, coherence, beam quality, higher-order modes, pulses and fibre launch.
element: { palette: Free space, type: source }
---

<p class="dx-lead">A source launches light onto the bench in two ways: a fan of rays, and a Gaussian beam. It can be a laser of a single frequency, a laser with a line of its own, broadband light, a mode-locked laser of short pulses, or a launch from a fibre.</p>

## The model

### The ray fan

The fan is $$N$$ rays, spread evenly across a width $$W$$ and over a full angle $$\Theta$$ (the *divergence*). Ray $$i$$ starts at

$$
t_i = \frac{i}{N - 1} - \frac12, \qquad \text{position } t_i W \text{ across the source}, \qquad \text{direction } \theta_0 + t_i\,\Theta,
$$

where $$\theta_0$$ is the source's angle. A negative divergence makes a converging fan. Each ray carries an equal share of the source's power. Rays show geometry: where light goes, spots, aberrations and vignetting.

### Rays across the beam

The fan is a line across the source, in the bench plane. A source can lay its rays out across the whole beam instead, up and down as well as across, the same width (and divergence) both ways:

| Pattern | Rays, for $$N$$ |
|---|---|
| A line | $$N$$ across, as above |
| A cross | $$N$$ across, and $$N - 1$$ more up and down |
| A grid | an $$N \times N$$ square grid, trimmed to the round beam |
| Hexapolar | rings of 6, 12, 18, … about the middle, $$\operatorname{round}((N-1)/2)$$ of them, as a lens design program samples a pupil |

A ray $$s$$ of the width up starts that far above the source's height, rising at the angle $$s\,\Theta$$. A source with a **Tip** $$\tau$$ sends all of its light up at $$\tau$$ more (down, for a negative tip). Every ray is traced exactly in 3D (see [heights](/jek/docs/jekray2d/free-space/#heights)). A screen's **Rays** tab then has a spot diagram, across against up, with the aberrations as they are.

### The Gaussian beam

With **Propagate a Gaussian beam** on, one more ray, not drawn, goes down the axis carrying the beam parameter

$$
q_0 = -z_0 + i\,\frac{\pi w_0^2}{M^2 \lambda},
$$

for a waist of radius $$w_0$$ (at $$1/e^2$$) a distance $$z_0$$ ahead of the source. The fan and the beam describe the same light, so they are kept in step: the fan's width is the beam's diameter at the source, and its divergence the beam's wavefront there. Change one and the other follows.

The beam is what carries the diffracted field, interference, coupling into fibres and cavity modes (see [Free-space optics: Gaussian beams](/jek/docs/jekray2d/free-space/#gaussian-beams)). What is shown is set for the whole bench, under **Light** in the Bench panel, as three ticks: the rays, the beams' outline (**envelope**), and the **diffracted field** itself (on a linear or log scale). With the field and the envelope both on, the envelope marks the field's 1/e² edge. The field is worked out on a grid of 128 to 1024 points, set per source.

### Beam quality

A beam of $$M^2 > 1$$ is traced as its embedded Gaussian, $$1/M$$ the width of the real beam. It is carried as an incoherent sum of Hermite–Gauss modes weighted $$p_m = (1 - \kappa)\kappa^m$$, $$\kappa = (M^2 - 1)/(M^2 + 1)$$, which makes its beam quality exactly $$M^2$$. It spreads as if its wavelength were $$M^2$$ times longer.

### Higher-order modes

A source can launch a Hermite–Gauss mode $$\mathrm{HG}_{mn}$$ ($$m$$ nodes across the beam in the plane, $$n$$ out of it), or a Laguerre–Gauss mode $$\mathrm{LG}_{pl}$$ ($$p$$ rings, and a vortex of charge $$l$$). Either is built on a Gaussian of waist $$w_0$$ and carried as a coherent sum of Hermite–Gauss modes, each keeping its own Gouy phase, so mode converters work as in the lab. Its beam quality is

$$
M^2_x = 2m + 1, \quad M^2_y = 2n + 1 \quad (\mathrm{HG}_{mn}), \qquad M^2 = 2p + |l| + 1 \quad (\mathrm{LG}_{pl}).
$$

A higher-order mode uses the 2D field.

### Polarisation

A source is s (out of the plane), p (in it), linear at an angle from p, or unpolarised. An unpolarised source is two launches, s and p, of half the power each, which add as powers wherever they meet.

### Wavelengths

A source has a main wavelength and up to 12 more. Each wavelength is traced on its own, and wavelengths add as powers. A source's colour on the bench follows its wavelength, unless you set one.

### Coherence

A source's light is one of three kinds:

- **Single frequency**: every pair of paths interferes in full, however long.
- **A line of its own**: a coherence length $$L_c = c/\Delta\nu$$, with a Lorentzian or Gaussian line, so fringe contrast falls as two paths grow apart (see [Concepts](/jek/docs/jekray2d/concepts/#launches-and-coherence)).
- **Broadband**: a bandwidth $$\Delta\lambda$$ (FWHM), a Gaussian line of coherence length $$\lambda^2/\Delta\lambda$$, so only near-equal paths still make fringes.

### Split sources

A source can be *split from* another: two fibre launches off one coupler, say. The two are then one laser and their light interferes. The split source has its own power, place, beam and polarisation. It takes its wavelength and line from the laser, and it carries a phase $$\phi$$ against the source it is split from, and an extra length $$\ell$$ of fibre before its launch, counted at the fibre's group index $$n_g = 1.468$$:

$$
\Delta L = n_g\,\ell.
$$

That extra path is what sets how far the laser's line washes out their fringes.

### Short pulses

A source given a pulse duration $$\tau$$ (fs, the intensity FWHM at its transform limit) is a mode-locked laser. Its spectrum has the width the pulse shape's time–bandwidth product gives:

$$
\Delta\nu = \frac{K}{\tau}, \qquad K = 0.3148 \;(\mathrm{sech}^2), \quad 0.4413 \;(\text{Gaussian}),
$$

and that bandwidth sets its coherence length. Reference rays are traced at 33 wavelengths across the spectrum, out to 4 FWHM each side for a sech² pulse and 2.5 for a Gaussian one. Their optical paths are the pulse's spectral phase (see [Free-space optics: short pulses](/jek/docs/jekray2d/free-space/#short-pulses)). The pulse can leave the laser with a chirp, a GDD of its own. Its power is the average power, at the repetition rate given.

### Launch from a fibre

A source can be a launch from a single-mode fibre, given its core diameter and NA. Its beam is then the fibre's mode, with its waist on the tip, by Marcuse's fit (see [Fibre optics](/jek/docs/jekray2d/fibre/#into-a-fibre)).

## Settings

{% include jekray2d_params.html group="free" key="source" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The beam is a Gaussian beam, or a sum of Hermite–Gauss modes. Light with other profiles (a top hat, a multimode diode's stripe) can be shaped after the source with a [stop](/jek/docs/jekray2d/free-space/stop/) or a [mask](/jek/docs/jekray2d/free-space/mask/).
- Separate sources never interfere. Two sources that should, need one to be split from the other.
- The ray fan's rays carry equal power: a fan is a uniform pupil, not a Gaussian one.
</div>

## Related

- [Screen](/jek/docs/jekray2d/free-space/screen/), to see what arrives.
- [Concepts: launches and coherence](/jek/docs/jekray2d/concepts/#launches-and-coherence).
