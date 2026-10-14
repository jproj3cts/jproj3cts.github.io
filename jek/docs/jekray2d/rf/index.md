---
layout: docs
title: RF and millimetre waves
permalink: /jek/docs/jekray2d/rf/
description: Quasi-optics from 1 GHz to 3 THz in JEKray2D. Feed horns launch and receive Gaussian beams, and lenses of RF dielectrics, mirrors, wire grids and absorbers shape them. Units are GHz and dBm.
---

<p class="dx-lead">At millimetre and sub-millimetre wavelengths a beam is only a few wavelengths across. It is guided by lenses and mirrors as light is, but it spreads by diffraction within the bench, and it is sent and taken in by horns. The RF tab has the parts of such a bench. Its beams are Gaussian beams, traced as any other is.</p>

RF is an experimental feature. Switch it on under **Help › Experimental features**. A bench with RF parts opens and runs with it off; only the RF tab of parts is hidden.

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

### Its shape

A horn is drawn as it would be built. Its flare is the cone whose slant length $$L$$ runs from the apex to the aperture's rim, so its half-angle is $$\arcsin(a/L)$$. The flare narrows to a waveguide sized for one mode at the horn's frequency. A circular guide's TE₁₁ mode cuts off at $$\lambda = 3.41\,r$$ and TM₀₁ at $$2.61\,r$$, so a radius $$r = 0.36\,\lambda$$ carries TE₁₁ alone. Behind it are two wavelengths of guide and a flange. A corrugated horn's bore is grooved a quarter-wave deep, three grooves to the wavelength, inside a thick wall. A diagonal horn, its guide and its flange are square across. A receiving horn is drawn for the frequency of the RF beam on the bench.

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

so a beam through a thickness $$t$$ keeps $$e^{-\alpha t}$$ of its power. The loss tangent is at a reference frequency (150 GHz, 100 GHz for nylon) and grows as $$f^\beta$$ with it: $$\beta = 1$$ for the polymers, whose absorption goes as $$f^2$$, 0 for high-resistivity silicon, $$\tfrac12$$ for fused quartz, so a polymer lens is four times as lossy at twice the frequency. Polypropylene ($$n = 1.502$$) is among the dielectrics. A plain face reflects as any dielectric face does, $$((n-1)/(n+1))^2$$ at normal incidence, which is 4.3% for HDPE. Real lenses are often grooved or coated to cut this: set a face's coating to **Matching layer**, a quarter wave of index $$\sqrt n$$ at the bench's frequency, which the thin-film model then follows across the band (the matching is a band, not a point: the receiver's frequency sweep shows it), or to reflect nothing.

They are the materials of an **RF lens**, a part of its own on the RF tab, drawn white as these plastics are. Its material menu lists only them, with their index at the bench's frequency: for example, "PTFE (Teflon), n = 1.44 at 150 GHz". An optical lens's menu keeps to glasses.

## The parts

| Part | What it is |
|---|---|
| Feed horn | Launches the horn's Gaussian beam at a frequency and power. |
| Receiving horn | Takes in the overlap with its mode, read by a detector. |
| RF lens | A plano-convex HDPE lens, 100 mm across, $$f = R/(n-1) = 150$$ mm, in any of the dielectrics above. |
| Flat mirror | A metal mirror, 100 mm. |
| Focusing mirror | A concave metal mirror, $$R = 300$$ mm. |
| Wire grid | A polariser of real wires: it reflects the field along its wires and passes the field across them, each by its pitch and wire size (below). |
| Film beam splitter | A dielectric sheet, reflecting by its two faces' interference (below). |
| Mesh filter | A metal mesh: inductive, capacitive or resonant, passing a band of frequencies and reflecting the rest (below). |
| Absorber load | A screen that takes in what reaches it, to see the beam. |

Each part is the same as its optical counterpart, with the sizes and materials of a millimetre-wave bench. Lenses, mirrors and the rest from the other tabs work on an RF beam too. The metal mirrors carry a **metal** (aluminium, copper, gold, brass, stainless steel, or a perfect conductor) and lose $$4 R_s / Z_0$$ a reflection to its surface resistance $$R_s = \sqrt{\pi f \mu_0 / \sigma}$$: 0.14% for aluminium at 150 GHz, 0.7% for stainless steel.

## Wire grids

A grid of round wires of radius $$a$$ at pitch $$g$$ is, to a wave with $$g < \lambda$$, a sheet across the line. The field **along the wires** sees them as a shunt inductance, normalised to free space,

$$X = \frac{g}{\lambda}\,X_n\!\left(\frac{2a}{g}\right), \qquad X_n \simeq 0.51 - 1.19\,u + 0.53\,u^2 + 0.11\,u^3, \quad u = \ln\frac{2\pi a}{g},$$

and is reflected with $$R_\parallel = 1/(1 + 4X^2)$$, the rest leaking through. $$X_n$$ is the quasi-static inductance of the grid as a function of its filling $$2a/g$$, an interpolation of full-wave simulations (Chuss et al., *Appl. Opt.* 51, 197, 2012) that agrees with Marcuvitz's $$\ln(g/2\pi a)$$ for sparse grids and holds up to $$2a/g = 1$$, where Marcuvitz's form fails. For a 25 µm pitch and 10 µm wires at 150 GHz the leak is −44 dB.

The field **across the wires** sees a small shunt capacitance, $$B = 4 (g/\lambda) \ln\sec(\pi w / 2g)$$ with $$w = 4a$$ the wires' width as strips (Marcuvitz's capacitive strips, by Babinet), and is reflected $$R_\perp = B^2/(4 + B^2)$$: −31 dB for the same grid. Met at an angle $$\theta$$, a sheet's reactance seen by the wave scales with the wave impedance: by $$\cos\theta$$ for wires across the plane of incidence (upright wires on the bench), $$1/\cos\theta$$ for wires lying in it. The grid is lossless; its wires' ohmic loss, a few parts in a thousand at most, is left out. Past $$g = \lambda$$ it diffracts as a grating, which the model does not follow, and the panel says so.

The grid's **Wires** are upright (across the bench, reflecting s) or in the bench plane (reflecting p). Its panel reads what it reflects and leaks at the bench's frequency.

## Film beam splitters

A dielectric sheet of index $$n$$ and thickness $$t$$ (Mylar is 1.73): its two faces interfere, so it reflects

$$r = \frac{r_{12}\,(1 - e^{-2i\delta})}{1 - r_{12}^2\, e^{-2i\delta}}, \qquad \delta = \frac{2\pi n t \cos\theta_t}{\lambda},$$

with Fresnel's $$r_{12}$$ for s and p at the angle of incidence: what it reflects goes with the thickness over the wavelength, the angle and the polarisation, as a real film's does. A quarter-wave film reflects $$((n^2-1)/(n^2+1))^2$$, 25% for Mylar. Lossless.

## Mesh filters

In the non-diffracting region ($$g < \lambda$$) a metal mesh of period $$g$$ with lines, or gaps, of width $$2a$$ is a lumped element across the line (Ulrich, *Infrared Phys.* 7, 37, 1967), in the normalised frequency $$\omega = g/\lambda$$:

- an **inductive** mesh (a grid of square holes) a shunt inductance $$L = \ln\csc(\pi a/g)$$, passing $$|t|^2 = 1/(1 + 1/4\omega^2L^2)$$: the long waves are reflected (a high-pass);
- a **capacitive** mesh (free-standing squares) a shunt capacitance $$C = 4\ln\csc(\pi a/g)$$, passing $$|t|^2 = 1/(1 + \omega^2C^2/4)$$: the short waves are reflected (a low-pass);
- a **resonant** mesh (crosses, or cross-shaped slots) a tuned circuit about a centre $$f_0$$ with a quality factor $$Q$$, passing $$|t|^2 = 1/(1 + Q^2(f/f_0 - f_0/f)^2)$$ for the band-pass (cross slots) and one less that for the band-stop (crosses). Its centre and $$Q$$ come from the cross's size and arms; set them from the maker's curve.

What a mesh does not pass it reflects, but for its **loss** in dB. Past $$g = \lambda$$ an inductive or capacitive mesh diffracts, which the model does not follow.

## Frequency sweep and link budget

A receiving horn's panel has a **Frequency sweep**: every feed horn on the bench is taken through a band about its frequency (each in proportion to its own, when there are several), the bench is traced again at each step, and what the receiver takes in is read there. The plot is $$S_{21}$$, the power into the receiver's mode over the power launched, in dB against frequency, with the bench's own frequency marked, and saves as CSV. Everything on the way is at its value for that frequency: a dielectric's index and loss, a mesh's transmission, a grid's leak, a film's interference, the horns' own beams, and so the coupling between them. The span and the number of points are the receiver's; the sweep takes one trace a point.

Below it, the **link budget**: down the strongest beam that reaches the receiver, from its horn, what each part did to the power in dB (a reflection, a transmission, a dielectric's absorption in the step after it), then the coupling into the receiver's mode, and the whole, in dB and dBm.

## Assumptions

<div class="dx-warn" markdown="1">
- Beams are Gaussian beams, as quasi-optics takes them. A horn's sidelobes are left out, and a beam only a wavelength or two across is less accurate, as the paraxial approximation fails.
- A dielectric's index is constant with frequency (true to a few parts in a thousand for these over 50 GHz to 1 THz); its loss tangent goes as $$f^\beta$$ from a reference frequency, with $$\beta = 1$$ for the polymers, 0 for silicon and $$\tfrac12$$ for fused quartz.
- The bench is in the far field of nothing: there are no near-field antennas, wires or circuits here. Waveguides and circuit-level RF belong to the [electronics](/jek/docs/jekray2d/electronics/).
</div>

## Related

- [Free-space optics: Gaussian beams](/jek/docs/jekray2d/free-space/#gaussian-beams), the model the beams follow.
- [Photodetector](/jek/docs/jekray2d/free-space/detector/), which the receiver's detector follows.
