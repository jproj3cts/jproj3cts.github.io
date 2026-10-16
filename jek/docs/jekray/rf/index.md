---
layout: docs
title: RF and millimetre waves
permalink: /jek/docs/jekray/rf/
redirect_from: /jek/docs/jekray2d/rf/
description: Quasi-optics from 1 GHz to 3 THz in JEKray. Feed horns launch and receive Gaussian beams, and lenses of RF dielectrics, mirrors, wire grids and absorbers shape them. Units are GHz and dBm.
---

<p class="dx-lead">At millimetre and sub-millimetre wavelengths a beam is only a few wavelengths across. It is guided by lenses and mirrors as light is, but it spreads by diffraction within the bench, and it is sent and taken in by horns. The RF tab has the parts of such a bench. Its beams are Gaussian beams, traced as any other is.</p>

The RF parts are on the **RF** tab of parts, in yellow, beside Free, Fibre and Elec.

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

A horn launches the field its waveguide mode leaves across the aperture, on a phase front centred on the horn's apex, a distance $$L$$ (the slant length) behind it:

| Horn | Aperture field | Beam width over aperture | Gaussicity | Cross-polar |
|---|---|---|---|---|
| Corrugated conical | HE₁₁, $$J_0(2.405\,r/a)$$ | 0.6435 | 0.98 | none |
| Smooth-wall conical | TE₁₁, $$J_0(\rho) - J_2(\rho)\cos 2\phi$$ along the field, $$J_2(\rho)\sin 2\phi$$ across it, $$\rho = 1.841\,r/a$$ | 0.765 | 0.91 of the co-polar power | 4% of the power |
| Diagonal | TE₁₀ + TE₀₁ of a square guide of side $$2a$$, polarised along a diagonal | 0.86 | 0.84 | 9% |
| Ideal Gaussian | $$e^{-r^2/w_a^2}$$ | 0.6435 | 1 | none |

The Gaussian that fits each best has radius $$w_a = k\,a$$ at the aperture ($$a$$ the aperture's radius, or half its side for a diagonal horn; Goldsmith, table 7.1), and the share of the power in it is the horn's *Gaussicity*. The field is carried as a coherent sum of Hermite–Gauss modes of that Gaussian, found once by overlap on the aperture: the fundamental, and the modes up to order 12 that make the sidelobes. The sum stops short of the sharp edge of the field at the wall (which is what a smooth-wall horn's field has in its E-plane), so a smooth-wall horn carries 94% of its power and a diagonal horn 88%; the rest, with the cross-polar field, is left out and counted in the panel. Each mode then keeps its own Gouy phase through the bench, so the beam's sidelobes and the horn's $$M^2$$ (1.09 for a corrugated horn, 1.2 by 1.5 for a smooth-wall one) go through lenses and mirrors as they should.

The beam is traced back from the aperture to its waist. With

$$
x = \frac{\pi w_a^2}{\lambda L},
$$

the waist radius is $$w_0$$, a distance $$\Delta z$$ behind the aperture:

$$
w_0 = \frac{w_a}{\sqrt{1 + x^2}}, \qquad \Delta z = \frac{L}{1 + 1/x^2}.
$$

The panel gives the waist, the Rayleigh range $$z_R = \pi w_0^2/\lambda$$, the divergence $$\theta = \lambda/(\pi w_0)$$ and the Gaussicity, and under **Far-field pattern** the pattern itself: the Fourier transform of the aperture field (the horn's type, size and slant length at the frequency), cut along the field (E-plane), across it (H-plane) and the cross-polar field in the plane between, in dB against the angle from the axis, with the directivity in dBi, the half-power widths, the first sidelobes and the cross-polar peak. It saves as CSV.

A horn also traces a small fan of rays along its beam, so lenses and mirrors show their focus as rays do.

### Its shape

A horn is drawn as it would be built. Its flare is the cone whose slant length $$L$$ runs from the apex to the aperture's rim, so its half-angle is $$\arcsin(a/L)$$. The flare narrows to a waveguide sized for one mode at the horn's frequency. A circular guide's TE₁₁ mode cuts off at $$\lambda = 3.41\,r$$ and TM₀₁ at $$2.61\,r$$, so a radius $$r = 0.36\,\lambda$$ carries TE₁₁ alone. Behind it are two wavelengths of guide and a flange. A corrugated horn's bore is grooved a quarter-wave deep, three grooves to the wavelength, inside a thick wall. A diagonal horn, its guide and its flange are square across. A receiving horn is drawn for the frequency of the RF beam on the bench.

## Receiving horns

A receiving horn takes in the overlap of the field arriving on its aperture with its own mode: the field its horn would launch, sent backwards, on a phase front converging on the apex, $$L$$ behind the aperture. With the beams of one launch added as fields first, and launches added as powers,

$$
P_\text{in} = \left| \iint \mathbf E(u, v) \cdot \mathbf M^*(u, v)\, \mathrm du\, \mathrm dv \right|^2 .
$$

So a wrong beam size, a wrong focus, an offset or a tilt each cost what they should. The mode has one polarisation, set under **Takes in**: $$s$$ (out of the bench plane) or $$p$$, with the horn's cross-polar field across it, so a smooth-wall horn takes in a little of the other polarisation and a corrugated horn none. Set to **both** it takes each polarisation by its co-polar field, as a dual-polarisation horn or one feeding a bolometer does. Two identical ideal Gaussian horns facing each other a distance $$D$$ apart have their waists $$d = D + 2\Delta z$$ apart, and couple

$$
\frac{P_\text{in}}{P} = \frac{1}{1 + d^2 / (4 z_R^2)}.
$$

Its readout gives the power arriving and the power taken in, in dBm, and the share taken in.

### Front end

What reads the power is the horn's **Front end**:

- A **video detector** (a square-law diode) puts out its responsivity, in V/W, times the power taken in, with its noise-equivalent power as noise ($$\text{NEP}\sqrt{B}$$ over its video bandwidth $$B$$) and an output limit. The readout gives the volts, the noise, the signal to noise and the NEP in dBm over the band.
- A **mixer** puts out the IF. Each feed horn's carrier comes down to $$|f - f_\text{LO}|$$ at the power taken in less the conversion loss, as a tone of $$\sqrt{2 R P}$$ volts peak across $$R = 50\ \Omega$$, with the phase of the field at the horn, so two paths to one receiver beat as they should. The noise is $$k (T_\text{ant} + T_\text{rx}) R$$ in V²/Hz, less the conversion loss too: the receiver's noise temperature, referred to its input, and the temperature of what it looks into. The readout gives each IF, its power, the system temperature, the noise floor in dBm/Hz and the minimum detectable power in the IF bandwidth, and the signal to noise in that band.

## Electronics

A horn joins the [electronics](/jek/docs/jekray/electronics/) at its connector, as a photodetector does. A receiving horn's **out** port carries its video detector's volts, or its mixer's IF, to an amplifier, a spectrum analyser or a lock-in. A feed horn under **external control** has the modulation inputs a laser has, for its power and its frequency (in GHz per volt). Set as an **upconverter** it has an **IF in** port instead: the carrier it sends is the voltage into its 50 Ω port, squared, less its conversion loss, so a tone into it goes up and, through a receiver's mixer, comes down again as the same tone times the link's loss: a transmission line through the air. The bench is traced at the horn's nominal power, and the electronics scale the link by what comes in. A video detector behind an upconverter reads the mean carrier power; a mixer reads the IF voltage itself, with the drive's noise on it. The IF has to be below the electronics' 10 GHz.

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

For lenses made to order there are common plastics. Their values are typical, from published measurements at 10 to 40 GHz, and taken as flat over that band. A plastic's index and loss vary with its brand, colour and moisture, so treat these as a guide:

| Plastic | Index | Loss tangent |
|---|---|---|
| PLA | 1.643 | 1.0 × 10⁻² |
| ABS | 1.581 | 6 × 10⁻³ |
| PETG | 1.612 | 1.3 × 10⁻² |
| ASA | 1.628 | 9 × 10⁻³ |
| Polypropylene (PP) | 1.483 | 8 × 10⁻⁴ |

The power absorbed per unit length is

$$
\alpha = \frac{2 \pi n \tan\delta}{\lambda},
$$

so a beam through a thickness $$t$$ keeps $$e^{-\alpha t}$$ of its power. The loss tangent is at a reference frequency (150 GHz, 100 GHz for nylon) and grows as $$f^\beta$$ with it: $$\beta = 1$$ for the polymers, whose absorption goes as $$f^2$$, 0 for high-resistivity silicon, $$\tfrac12$$ for fused quartz, so a polymer lens is four times as lossy at twice the frequency. Polypropylene ($$n = 1.502$$) is among the dielectrics. A plain face reflects as any dielectric face does, $$((n-1)/(n+1))^2$$ at normal incidence, which is 4.3% for HDPE. Real lenses are often grooved or coated to cut this: set a face's coating to **Matching layer**, a quarter wave of index $$\sqrt n$$ at the bench's frequency, which the thin-film model then follows across the band (the matching is a band, not a point: the receiver's frequency sweep shows it), or to reflect nothing.

They are the materials of an **RF lens**, a part of its own on the RF tab, drawn white as these plastics are. Its material menu lists only them, with their index at the bench's frequency: for example, "PTFE (Teflon), n = 1.44 at 150 GHz". An optical lens's menu keeps to glasses.

## Made-to-order RF lenses

An RF lens's panel reads, at the first RF frequency on the bench:

- **Loss through the centre**: what its material absorbs along the axis, $$4.34\,\alpha t$$ dB, and what its plain faces reflect, $$\left(\frac{n-1}{n+1}\right)^2$$ at each.
- **Across**: its diameter in wavelengths. Under five, the Gaussian-beam picture is rough, and the panel says so.
- **Beam radius at the lens**, from the traced beam, and the **edge taper**, $$8.686\,(a/w)^2$$ dB for a lens of radius $$a$$, with the share of the power that passes outside it, $$e^{-2a^2/w^2}$$. Under 20 dB the panel warns: the light past the edge is lost, and the edge diffracts in ways the model leaves out. A lens four beam radii across, 35 dB, keeps both small.
- For these plastics, whether it is **manufacturable**: up to 210 mm across and 260 mm thick can be made, with no point thinner than 0.45 mm.

A lens that is manufacturable can be ordered: its panel's orange **Request a quote for this lens** button puts it in the JEK Systems quote cart with its figures and a link to its design, and the request is sent from the cart. See [Custom RF Lenses](/jek/products/signal-processing/custom-rf-lenses/).

The examples **PLA lens, 10 GHz** and **ABS lens, 24 GHz radar** show both bands. At 10 GHz a lens that can be made is under seven wavelengths across, so the horn sits close and the lens is fast; at 24 GHz it is ten or more, where printed lenses work best.

### Matching layers

A plain plastic face reflects some of the beam, about 6% for solid PLA, and the two faces of a lens together can ripple its response with frequency. A graded-index lens's **Faces** can be **Matching layers**: on each face a layer a quarter wave thick at the centre, of index $$\sqrt{n}$$ of the core behind it, printed less dense. At the design frequency the faces then reflect nothing where the layer can be made at that index; towards the edge, where $$\sqrt{n}$$ would need a density lower than the frequency allows, the layer stays at that least density and the match is partial (the panel says from what radius). The layers carry a little of the lens's phase themselves, so the core is graded to make up the rest and the focal length is kept. Away from the design frequency the reflection returns, as a single-layer coating's does, which the receiver's frequency sweep shows. A solid lens's faces can take the same as their **Matching layer** coating: made to order, each is printed as a skin of the lens's own plastic at the density that gives $$\sqrt{n}$$, which can be made while that density is no lower than the frequency allows.

### Mounting

A made-to-order lens can have a **flange** round its rim, under **Mounting** in its panel: its width out from the rim, its thickness along the axis, and a number of bolt holes of a given diameter on the circle through its middle (4 holes of 3.4 mm, for M3 bolts, by default). The flange is printed solid with the lens, counts towards what can be made (the outside diameter, flange and all, must be 210 mm or less) and its plastic towards the weight. It lies outside the lens, so the beam is not traced through it: any light that passes the rim would pass through it.

## Graded-index lenses

A **graded-index lens** (GRIN lens, on the RF tab under Lenses and mirrors) is a flat disc, solid at its centre and less dense towards its edge. Plastic and air mixed finer than the wavelength act as one material whose permittivity is their mean by volume,

$$
\varepsilon = 1 + \rho\,(\varepsilon_m - 1),
$$

for a density $$\rho$$ (1 when solid) and the material's own $$\varepsilon_m = n_m^2$$. Its loss is the plastic's share, $$\varepsilon'' = \rho\,\varepsilon_m \tan\delta$$. So the index falls from the centre to the edge, and the flat disc bends the beam as a curved lens would.

You set its **focal length**, **diameter**, **material**, the **density at the centre** and the **lowest density**, the **design frequency** and the **profile**. The ideal-lens profile gives the disc the optical path of a perfect lens, $$\sqrt{r^2 + f^2} - f$$ less at radius $$r$$ than at the centre, with no spherical aberration for a collimated beam; the parabolic one, $$r^2/2f$$. The disc's thickness is what that fall in path needs between its highest and lowest index:

$$
t = \frac{\text{path at the edge}}{n_\text{centre} - n_\text{edge}}.
$$

At a given frequency the lowest density is raised, if need be, so that its structure stays fine against the wavelength: at 24 GHz, to about 24%; at 10 GHz, 15% stands.

Its panel gives the thickness, the index and density from centre to edge, the loss at the centre and at the edge, its weight, and whether it is manufacturable; below them, the beam at the lens and its edge taper, as for an RF lens. On the bench it is a thin plate with that delay and the transmission its loss and its faces leave; a disc thick against its focal length, over 0.3 of it, is only roughly placed, and the panel says so.

The example **Graded-index lens, 24 GHz** shows one 120 mm across on a 24 GHz horn.

## A lens as an antenna

An RF lens fed by a horn is a lens antenna. Its panel's **As an antenna** section gives it as one, from the bench's own diffracted field: the field engine carries the horn's field (its modes as launched) through the lens, each face by its traced phase, a graded-index lens by its own delay and loss, the rim cutting it, just as the bench's diffraction view shows it. Just past the lens's last face that field $$E(x, y)$$ is the antenna's aperture field, and its far field follows from it,

$$F(\theta) = \iint E(x,y)\, e^{ikx\sin\theta}\,dx\,dy, \qquad G(\theta) = \frac{4\pi}{\lambda^2}\,|F(\theta)|^2\left(\frac{1+\cos\theta}{2}\right)^2 \Big/ P_\text{feed},$$

with $$x$$ across the beam in the bench plane (and $$y$$ for the cut across it). $$P_\text{feed}$$ is all the horn launched, so the gain $$G$$ holds what passed outside the lens (spillover) and what the lens absorbed and reflected. Against the power just past the lens instead, the same peak gives the directivity, and against a uniformly lit aperture's $$4\pi^2 a^2/\lambda^2$$ the **aperture efficiency**: the taper efficiency (how evenly the beam lights the lens) times the phase efficiency (how flat the wavefront leaves it). The pattern is drawn in the bench plane and, dashed, across it, beside the horn's own; from it the half-power beamwidth and the highest sidelobe. The peak is the beam's direction, beside the beam the bench follows.

A lens that brings the beam to a waist nearer than its far field (about $$2D^2/\lambda$$, metres for a lens of ten wavelengths) works there as a focusing lens: these are still its figures far away, and the readout says so. The field is worked out in the background and the figures follow a moment after the bench changes.

### Steering

A horn moved off the lens's axis steers the beam: the readout gives the beam's direction against the lens's axis, the horn's (the line from it to the lens's centre), their ratio (the **beam deviation**, a little under 1), and the **scan loss**, the gain against the same horn on the axis as far away, the bench traced again with it there. All of it comes from the field past the lens, as above, so the lens's coma, the horn's own pattern and the rim are all in it. **Work out the scan** moves the horn round the lens in steps, as far away and aimed at its centre, traces the bench again at each place and plots the scan loss against the beam's direction (a few seconds). A lens slow against its size (a focal length long against its diameter) scans further for the same loss.

### How closely it must be made

A printed plastic's permittivity is known to a few percent until tiles of it are measured, and the printer's flow moves it the same way. The readout traces the bench again with the lens's plastic 5% higher and 5% lower, the horn left where it is: the lens keeps its shape (a graded-index lens its densities and thickness), and its plate or its index follows the plastic. It gives the gain each way from the field, the move in the lens's focal length, the power each receiving horn on the bench then takes in, and, from the parabola through the three gains, how far the permittivity may go each way before the gain falls 1 dB.

### The highest frequency: a design rule

This one is a rule, not a simulation. The bench takes a printed part as an even material of the permittivity its density gives; that holds only while its printed lines are fine against the wavelength: lines 0.45 mm wide at density $$F$$ lie about $$0.45/F$$ mm apart, and that is kept to a quarter of the wavelength in the plastic or less. Its least dense part sets the highest frequency it holds to,

$$f_\text{max} = \frac{c\,F_\text{min}}{4\,n_\text{plastic} \times 0.45\ \text{mm}},$$

which its panel gives, with the band over which its matching layers reflect under 1%. Above $$f_\text{max}$$ the structure scatters, which the bench does not model, and the readout says its figures no longer hold. A quarter wave is the usual margin for an effective medium; the measured coupon is the check. A lens designed at a frequency raises its least density to suit, so it holds to its design frequency at least.

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
- Beams are paraxial Gaussian beams and their Hermite–Gauss modes, as quasi-optics takes them. A horn's field is carried to order 12; its cross-polar field is not launched; a beam only a wavelength or two across is less accurate.
- A mixer and an upconverter are ideal, apart from their conversion loss and noise temperature: no image, no harmonics, no LO leakage, and a carrier moved by a modulation input puts the square root of its power on the IF, linearised about the mean.
- A dielectric's index is constant with frequency (true to a few parts in a thousand for these over 50 GHz to 1 THz); its loss tangent goes as $$f^\beta$$ from a reference frequency, with $$\beta = 1$$ for the polymers, 0 for silicon and $$\tfrac12$$ for fused quartz.
- The bench is in the far field of nothing: there are no near-field antennas, wires or circuits here. Waveguides and circuit-level RF belong to the [electronics](/jek/docs/jekray/electronics/).
</div>

## Related

- [Free-space optics: Gaussian beams](/jek/docs/jekray/free-space/#gaussian-beams), the model the beams follow.
- [Electronics](/jek/docs/jekray/electronics/), where a horn's IF and video outputs go, and where an upconverter's drive comes from.
