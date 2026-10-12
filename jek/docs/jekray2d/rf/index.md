---
layout: docs
title: RF and millimetre waves
permalink: /jek/docs/jekray2d/rf/
description: Quasi-optics from 1 GHz to 3 THz in JEKray2D. Feed horns launch and receive Gaussian beams, and lenses of RF dielectrics, mirrors, wire grids and absorbers shape them. Units are GHz and dBm.
---

<p class="dx-lead">At millimetre and sub-millimetre wavelengths a beam is only a few wavelengths across. It is guided by lenses and mirrors as light is, but it spreads by diffraction within the bench, and it is sent and taken in by horns. The RF tab has the parts of such a bench. Its beams are Gaussian beams, traced as any other is.</p>

## Frequency and wavelength

An RF part is set by its frequency $$f$$, in GHz, and its power, in dBm. The bench still works in wavelength, $$\lambda = c/f$$:

| Frequency | Wavelength |
|---|---|
| 30 GHz | 10 mm |
| 100 GHz | 3.00 mm |
| 150 GHz | 2.00 mm |
| 300 GHz | 1.00 mm |
| 1 THz | 0.300 mm |

$$
P_\text{dBm} = 10 \log_{10} \frac{P}{1\ \text{mW}}.
$$

A horn goes from 1 GHz to 3 THz. Optical sources stop at 1 mm (300 GHz), so a beam longer than that comes from a horn.

## Feed horns

A horn's aperture field is close to a Gaussian. The Gaussian that fits it best has radius $$w_a = k\,a$$ at the aperture, where $$a$$ is the aperture's radius (half its side, for a diagonal horn). Its phase front is curved with radius $$R = L$$, the horn's slant length. The share $$g$$ of the horn's power in that Gaussian is its *Gaussicity*. The rest goes into sidelobes, which are left out.

| Horn | Beam width over aperture | Gaussicity |
|---|---|---|
| Corrugated conical | 0.6435 | 0.98 |
| Smooth-wall conical | 0.765 | 0.91 |
| Diagonal | 0.86 | 0.84 |
| Ideal Gaussian | 0.6435 | 1 |

The beam is traced back from the aperture to its waist. With

$$
x = \frac{\pi w_a^2}{\lambda L},
$$

the waist radius is $$w_0$$, a distance $$\Delta z$$ behind the aperture:

$$
w_0 = \frac{w_a}{\sqrt{1 + x^2}}, \qquad \Delta z = \frac{L}{1 + 1/x^2}.
$$

The horn launches that Gaussian with power $$g\,P$$. Its panel gives the waist, the Rayleigh range $$z_R = \pi w_0^2/\lambda$$, the divergence $$\theta = \lambda/(\pi w_0)$$, and the gain on the axis in the far field:

$$
G = g\,\frac{8 \pi^2 w_0^2}{\lambda^2}.
$$

A horn also traces a small fan of rays along its beam, so lenses and mirrors show their focus as rays do.

## Receiving horns

A receiving horn takes in the overlap of the field arriving on its aperture with its own mode. Its mode is the beam it would launch, sent backwards: a Gaussian of radius $$w_a$$ whose phase converges on the horn's apex, $$L$$ behind the aperture. For each polarisation, with the beams of one launch added as fields first,

$$
P_\text{in} = g \, \left| \iint E(u, v)\, M^*(u, v)\, \mathrm du\, \mathrm dv \right|^2 .
$$

So a wrong beam size, a wrong focus, an offset or a tilt each cost what they should. Two identical horns facing each other a distance $$D$$ apart have their waists $$d = D + 2\Delta z$$ apart, and couple

$$
\frac{P_\text{in}}{P} = \frac{g^2}{1 + d^2 / (4 z_R^2)}.
$$

The power taken in is read by a detector of fixed responsivity, in A/W, with an amplifier, as a [photodetector](/jek/docs/jekray2d/free-space/detector/) is. Its readout gives the power arriving and the power taken in, in dBm, and the share taken in.

## Dielectrics

Lenses and windows at these frequencies are made of plastics and low-loss crystals. Each has an index $$n$$ and a loss tangent $$\tan\delta$$, taken as constant over the band (near 100 to 300 GHz):

| Material | Index | Loss tangent |
|---|---|---|
| HDPE (polyethylene) | 1.526 | 3.1 × 10⁻⁴ |
| PTFE (Teflon) | 1.44 | 3 × 10⁻⁴ |
| Rexolite (polystyrene) | 1.59 | 6.6 × 10⁻⁴ |
| TPX (polymethylpentene) | 1.46 | 6 × 10⁻⁴ |
| High-resistivity silicon | 3.4175 | 1 × 10⁻⁵ |
| Fused quartz | 1.952 | 1 × 10⁻⁴ |
| Alumina | 3.13 | 2 × 10⁻⁴ |
| Nylon | 1.73 | 1.1 × 10⁻² |

The power absorbed per unit length is

$$
\alpha = \frac{2 \pi n \tan\delta}{\lambda},
$$

so a beam through a thickness $$t$$ keeps $$e^{-\alpha t}$$ of its power. A plain face reflects as any dielectric face does, $$((n-1)/(n+1))^2$$ at normal incidence, which is 4.3% for HDPE. Real lenses are often grooved to cut this. To model that, set a face's coating to reflect nothing.

A lens's material menu lists them with their index at the bench's frequency: for example, "PTFE (Teflon), n = 1.44 at 150 GHz".

## The parts

| Part | What it is |
|---|---|
| Feed horn | Launches the horn's Gaussian beam at a frequency and power. |
| Receiving horn | Takes in the overlap with its mode, read by a detector. |
| HDPE lens | A plano-convex lens, 100 mm across, $$f = R/(n-1) = 150$$ mm. |
| Flat mirror | A metal mirror, 100 mm. |
| Focusing mirror | A concave metal mirror, $$R = 300$$ mm. |
| Wire grid | A polariser: it passes one polarisation and stops the other. |
| Film beam splitter | Splits the beam 50:50. |
| Absorber load | A screen that takes in what reaches it, to see the beam. |

Each part is the same as its optical counterpart, with the sizes and materials of a millimetre-wave bench. Lenses, mirrors and the rest from the other tabs work on an RF beam too.

## Assumptions

<div class="dx-warn" markdown="1">
- Beams are Gaussian beams, as quasi-optics takes them. A horn's sidelobes are left out, and a beam only a wavelength or two across is less accurate, as the paraxial approximation fails.
- A dielectric's index and loss tangent are constant with frequency.
- The bench is in the far field of nothing: there are no near-field antennas, wires or circuits here. Waveguides and circuit-level RF belong to the [electronics](/jek/docs/jekray2d/electronics/).
</div>

## Related

- [Free-space optics: Gaussian beams](/jek/docs/jekray2d/free-space/#gaussian-beams), the model the beams follow.
- [Photodetector](/jek/docs/jekray2d/free-space/detector/), which the receiver's detector follows.
