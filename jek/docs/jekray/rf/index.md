---
layout: docs
title: RF and millimetre waves
permalink: /jek/docs/jekray/rf/
redirect_from: /jek/docs/jekray2d/rf/
description: Quasi-optics from 1 GHz to 3 THz in JEKray. Feed horns launch and receive Gaussian beams, and lenses of RF dielectrics, mirrors, wire grids and absorbers shape them. Units are GHz and dBm.
---

<p class="dx-lead">At millimetre and sub-millimetre wavelengths a beam is only a few wavelengths across. It is guided by lenses and mirrors as light is, but it spreads by diffraction within the bench, and it is sent and taken in by horns. The RF tab has the parts of such a bench. Its beams are Gaussian beams, traced as any other is.</p>

The RF parts are on the **RF** tab of parts, in yellow, beside Free space, Fibre and Electronics.

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

A lens that is manufacturable can be ordered: its panel's orange **Quote now** button puts it in the JEK Systems quote cart with its figures and a link to its design and opens the cart in a new tab, ready to send; **Add to quote cart** puts it there to send with others. **Cart**, at the top of JEKray, opens the cart with its count. See [Custom RF Lenses](/jek/products/signal-processing/custom-rf-lenses/).

The examples **PLA lens, 10 GHz** and **ABS lens, 24 GHz radar** show both bands. At 10 GHz a lens that can be made is under seven wavelengths across, so the horn sits close and the lens is fast; at 24 GHz it is ten or more, where printed lenses work best.

### Matching layers

A plain plastic face reflects some of the beam, about 6% for solid PLA, and the two faces of a lens together can ripple its response with frequency. A graded-index lens's **Faces** can be **Matching layers**: on each face a layer a quarter wave thick at the centre, of index $$\sqrt{n}$$ of the core behind it, printed less dense. At the design frequency the faces then reflect nothing where the layer can be made at that index; towards the edge, where $$\sqrt{n}$$ would need a density lower than the frequency allows, the layer stays at that least density and the match is partial (the panel says from what radius). The layers carry a little of the lens's phase themselves, so the core is graded to make up the rest and the focal length is kept. Away from the design frequency the reflection returns, as a single-layer coating's does, which the receiver's frequency sweep shows. A solid lens's faces can take the same as their **Matching layer** coating: made to order, each is printed as a skin of the lens's own plastic at the density that gives $$\sqrt{n}$$, which can be made while that density is no lower than the frequency allows. **Design…** beside **Matching layers** in the RF designer opens the [coating workspace](/jek/docs/jekray/coating-design/) on the lens's faces, to make a matching stack of more layers or judge one over the band and the beam's angles.

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

Its panel gives the thickness, the index and density from centre to edge, the loss at the centre and at the edge, its weight, and whether it is manufacturable; below them, the beam at the lens and its edge taper, as for an RF lens. On the bench it is traced as what it is: a slab of the plastic between two flat faces, graded from the axis so its optical path is the design's, with each part's loss at its own density and each face's matching layer at the radius the ray meets it. Its rays curve through the slab as they do through any graded glass, so its focus is where a disc of that thickness puts it, and the bench, the RF designer and the lens engine take the same slab; a disc thick against its focal length, over 0.3 of it, focuses a little short of its design focal length from its centre, and the panel says so.

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

## The RF designer

A system of RF lenses and mirrors is designed as a whole in the **RF designer**: a feed horn's beam through the lenses to what it is for. Open it with **Design the RF system…** in an RF lens's panel (the lens is made an assembly of its own first if it is not in one), by double-clicking an assembly of RF parts, with **File › Open a workspace › RF design of the selection**, or from **My benches › Open a workspace**, which makes a new cloud bench and opens it in the designer; **Keep as a part…** in its header saves the whole system in My parts or a team's parts. **File › Open a workspace › RF design, new…** starts from a made-to-order lens for 24 GHz. **Optical designer** in its bar opens the same parts in the [lens design workspace](/jek/docs/jekray/lens-design/), surface by surface; **RF designer** there comes back.

### Its conditions

- **Frequency**: the design frequency and the band either side of it, in GHz.
- **Feed horn**: its kind, aperture radius and slant length, its distance from its aperture to the first lens, and how far it stands **off the axis**. Off the axis it is aimed at the first lens's centre, and the beam leaves steered the other way: the figures then give the beam's direction (from the wavefront leaving, real rays), the beam deviation factor (its angle over the feed's) and the **scan loss** against the same system fed on the axis. The beam's centre is followed through the system beside the Gaussian beam, so the spillover and the aperture efficiency are those of a beam off each aperture's centre, and the phase error is that of the rays from where the feed stands: a scanned lens's coma.
- **Goal**: what comes after the last lens. **Collimate the beam** (an antenna); **Focus to a waist** of a given radius at a given distance; or **Into a receiving horn**, of a given kind and size, its aperture at a given distance.

**Take from the bench** reads the feed horn lighting the first lens and any receiving horn on the axis after the last. Those horns then follow the conditions: change the feed's distance or size here and the horn on the bench moves and changes with it. **Place on a bench**, for a new design, puts its feed horn on the bench, and at its goal a receiving horn or an absorber load.

### The beam

At millimetre waves a lens is tens of wavelengths across, so the designer follows the beam as a Gaussian beam rather than as rays. Its complex beam parameter $$q$$ is carried in reduced form, $$\hat q = q/n$$, through each part by its first-order matrix: a gap $$d$$ of index $$n$$ adds $$d/n$$; a face of paraxial curvature $$c$$ between indices $$n$$ and $$n'$$ takes $$1/\hat q$$ to $$1/\hat q - (n'-n)\,c$$; a mirror to $$1/\hat q + 2c$$. The beam's radius anywhere, in air or in the plastic, is then

$$
w^2 = \frac{\lambda\,|\hat q|^2}{\pi\,\operatorname{Im}\hat q},
$$

with $$\lambda$$ the wavelength in vacuum. The feed horn's beam is its own Gaussian (see [Feed horns](#feed-horns)), starting from its waist behind its aperture.

The layout draws the horns, the lenses and the beam's $$1/e^2$$ radius along the axis: filled at the design frequency, dashed at the band's edges. Over each lens is its **edge taper**, $$8.686\,(a/w)^2$$ dB.

### Its figures

To collimate, the beam leaving the last lens is measured by its **aperture efficiency**: its Gaussian field, with the phase radius $$R$$ it has there, over the lens's aperture $$a$$ against a uniform field,

$$
\eta_a = \frac{2\,\left|1 - e^{-t(1+i\psi)}\right|^2}{t\,\left|1+i\psi\right|^2}, \qquad t = \frac{a^2}{w^2},\quad \psi = \frac{\pi w^2}{\lambda R},
$$

at most 81.5% for a flat phase, at an edge taper of about 11 dB. The **gain** on the axis is then $$\eta\,(\pi D/\lambda)^2$$, with $$\eta$$ that efficiency times the losses before it. The beam's waist and its divergence are given too.

To focus or to couple, the beam is measured by its **coupling** to the Gaussian it should be at its goal, the target waist or the receiving horn's own beam:

$$
K = \frac{4}{\left(\frac{w_1}{w_2}+\frac{w_2}{w_1}\right)^2 + \left(\frac{\pi w_1 w_2}{\lambda}\right)^2\left(\frac{1}{R_1}-\frac{1}{R_2}\right)^2},
$$

with the waist it makes and the one wanted beside it.

The **efficiency** is all of it together, at the design frequency and over the band: the share of the feed's power in its Gaussian, each face's **reflection** (Fresnel's, or through its quarter-wave matching layer at each frequency, as a thin film), each lens's **absorption** (its plastic's loss tangent, through its thickness over the beam's profile), the **spillover** past each lens, $$e^{-2a^2/w^2}$$ (once for each lens; to collimate, the last lens's own is in its aperture efficiency), the **phase error**, and the coupling (with the receiving horn's own share) or the aperture efficiency.

The Gaussian beam follows the system to first order, so it can't see what a face's shape does beyond that: a sphere where a hyperbola is wanted. The **phase error** is found from real rays: traced exactly from the incoming beam's phase centre through every surface, their optical paths taken to the sphere about the outgoing beam's phase centre (or to a plane, for a beam that leaves flat), the piston and defocus taken out by a least-squares fit in $$h^2$$, and what is left measured as an RMS $$\sigma$$ over the beam's power, weighted by $$h\,e^{-2h^2/w^2}$$. Its loss is Ruze's, $$e^{-(2\pi\sigma/\lambda)^2}$$.

### The system and its parts

The system is listed down the left as the beam meets it: **Frequency**, **Feed horn**, each lens, **Add a lens** and **Goal**. The one chosen is edited beside the beam. A lens gives its material, diameter, centre thickness, each face's radius and conic, whether its faces have matching layers, whether it is cut in zones, and the air after it; **Remove** takes it out (a system keeps at least one lens). **Add a lens** puts a made-to-order lens after the last part and opens **Design this lens** on it. A change is made on the part on the bench, and can be undone. The steps for the whole system are tabs below: **Element data**, **Optimise**, **Analyses**, **Tolerance** and **Make it**.

### Element data

Every surface of the system in one table, as the optical designer's element data: the feed horn first (its distance to the first surface is the first thickness), then each face with its radius, conic, the thickness after it (a lens's centre, or the air to the next part), the material after it and its clear radius, and the goal last. A lens's radii, conics, centre thickness and material and the air after each part are typed here and change the part on the bench, which Undo takes back; a graded-index disc shows its focal length, a mirror its radius as the bench has it. The **V** beside a value marks it as a variable for **Optimise**: orange when it is one. To start, each lens's two radii and its front conic are variables.

### Analyses

- **Over the band**: the gain (to collimate) or the coupling (the system's S21, from the feed's Gaussian to the goal's) across the band and a tenth beyond each edge, and beneath it what each loss takes, in dB: reflections, absorption, spillover, phase error and the aperture efficiency.
- **Far-field pattern** (to collimate): the far field of the last lens's aperture, its Gaussian field with the phase radius it has there over the round aperture,
$$
E(\theta) \propto \frac{1+\cos\theta}{2}\int_0^a e^{-r^2/w^2 - i\pi r^2/(\lambda R)}\,J_0(kr\sin\theta)\,r\,dr,
$$
at the band's edges and its centre, with its half-power beamwidth and first sidelobe.
- **Scan**: the feed moved across the axis in steps, aimed at the first lens, out to 25° or four beamwidths: at each place the beam's direction, the deviation factor, the scan loss and the phase error, plotted against the beam's angle and the feed's. The same loss the bench's lens panel works out by its field, here from the designer's beam and rays, so it can be designed against.
- **Apertures**: at each face, the beam's radius at the band's edges and its centre, the clear radius, the edge taper and the share spilled.
- **Reflections**: each lens as a slab, its two faces with their layers and the plastic between, its reflection worked out coherently by the characteristic matrices, so the ripple a plain lens shows across a band appears.
- **Loss budget**: each factor the efficiency is the product of, at the design frequency, in per cent and dB; to collimate, the gain against a uniform aperture of the same diameter.

### Optimise

**Optimise** changes the values marked **V** in Element data (each lens's face radii and conics, its centre thickness, a disc's focal length, the air after each part, the feed's distance) to make the efficiency as high as it can be at five frequencies across the band; to collimate that is the gain at the lens's diameter. Every loss counts, the phase error from real rays among them, so a face's conic is found for what it does to the wavefront, not only to the lens's thickness. You can ask for the efficiency to be **flat across the band** as well, and set the **thinnest edge** a lens may have and the **thickest centre**. Each lens keeps that edge and the air between parts stays open.

The search is quasi-Newton (BFGS) on the sum of the squares of the efficiency's shortfall at each frequency (and its spread, and the bounds), each variable in its own scale, its gradient by central differences, each step shortened until the merit falls enough. The efficiency can't reach 1, so a least-squares step, which assumes the merit's least is nought, would stall; this one doesn't. It runs a step at a time with the page live; **Stop** keeps what it has. The result goes into the design as one change, which **Undo** takes back.

### Tolerance

A printed lens is not made exactly, nor mounted exactly where it was designed. **Tolerance** takes each error within limits you set:

| Error | On | Default |
|---|---|---|
| Permittivity | each lens's plastic, its index by $$\sqrt{1 + v/100}$$ | ± 5 % |
| Centre thickness | each lens | ± 0.2 mm |
| Face curvature | each curved face | ± 1 % |
| Air gap | after each part | ± 0.5 mm |
| Feed distance | the feed horn | ± 1 mm |
| Lens decentre | each lens, moved across the axis in the bench plane | ± 0.5 mm |
| Lens tilt | each lens, turned about its front vertex, its back face carried with it | ± 0.5° |
| Feed across the axis | the feed horn moved across, pointed as it was | ± 1 mm |

A printed plastic's permittivity is known to a few per cent until tiles of it are measured, and the printer's flow moves it the same way, so it is usually the error that matters most. The figure is the gain (to collimate) or the efficiency, with every loss and the phase error from real rays.

- **Sensitivity**: each error alone at its limit, either way, and what it does to the figure at the design frequency, the worst first.
- **Monte Carlo**: builds with every error drawn at once, evenly within its limits or normally with its limit at two standard deviations, from a fixed seed so a run can be repeated. For each build, its figure at the design frequency and its worst over the band; the mean, the figure nine builds in ten reach, the worst build, and a histogram.
- **Yield**: give a specification (the figure at least so much across the whole band) and the share of builds that meet it, with its 95 % interval (Wilson's).

Errors across the axis move the beam's centre off the faces (the spillover and the aperture efficiency of a beam off centre) and are traced by real rays through the moved faces (the phase error of a lens met off its axis); the beam's direction turns a little too, and **Beam moves** in the sensitivity table says how far, since a lens decentred mostly steers the beam rather than spoiling it. **Refocus the feed for each build** is the compensator: as on the bench, each built system's feed distance is refocused (within 15 % of the design's, by golden section) for the most of its figure before it is read, so a thickness or permittivity error that only moves the focus costs what remains after refocusing. The nominal is then refocused too.

### Make it

**Make it** checks each lens against what can be made to order:

- a made-to-order plastic (PLA, ABS, PETG, ASA or polypropylene);
- up to 210 mm across (with its flange) and 260 mm thick;
- nowhere thinner than 0.45 mm;
- matching layers that can be printed, and that hold, by the design rule, to the top of the band.

It gives the lens's centre and edge thickness, its weight and its outside diameter, and notes a lens only a few wavelengths across or one whose edge taper is low. Beside them the lens turns in 3D as it would be made, its flange and bolt holes with it; drag to turn it by hand. Its **Mounting** can be a flange with bolt holes, as on the bench. A lens that passes has the orange **Quote now** and **Add to quote cart** buttons, as in its panel: the request goes into the quote cart named for the design frequency, with the lens's figures (each face's radius with its conic and any aspheric terms, so the shape is in the request itself), what the system does (its gain or coupling over the band), and a link that opens the whole system in the RF designer as it was left. See [Custom RF Lenses](/jek/products/signal-processing/custom-rf-lenses/).

Each lens's design drawing can be saved for your own records and mechanical design, as **Drawing (PDF)** or **Drawing (SVG)**: the lens on an A4 sheet, in section to a standard scale, with its flange. The sheet gives its diameters and centre and edge thickness, and each face's radius, conic and clear aperture. It also gives the plastic's permittivity at the design frequency and its loss tangent, and each face's matching layer (its permittivity and thickness, laid over the face drawn). Tolerances come from the Tolerance tab's settings: thickness, face curvature as a share of the radius, and permittivity. Each face has a profile tolerance $$t$$, the width of the zone it must lie within. $$t$$ is chosen so that $$t\,(n-1) \le \lambda/8$$ at the top of the band, and it is never more than 0.5 mm.

The drawing describes the lens as designed. It is not a file to make it from: how it is made is ours to work out when you order it.

### Design this lens

**Design this lens…**, on a lens's own page, makes a lens to suit the beam that reaches it and the goal after it, as millimetre-wave lenses are designed. Each curved face is a hyperbola of eccentricity $$n$$ (conic $$-n^2$$, vertex radius $$(n-1)F$$), which turns a point at its focus $$F$$ into a plane wave in the plastic, or a plane wave in the plastic into a point in air. The point is the beam's phase centre: $$F$$ is the phase radius of the beam reaching the lens, and on the far side the phase radius the beam must leave with to make its waist where it is wanted,

$$
F_2 = \frac{d_2^2 + z_R^2}{d_2}, \qquad z_R = \frac{\pi w_t^2}{\lambda},
$$

for a target waist $$w_t$$ a distance $$d_2$$ beyond the lens. So the faces suit the Gaussian beam, not only its rays, and inside the lens the beam is flat, so the thickness changes nothing but the loss.

- **Hyperbolic, flat back**: one hyperbolic face toward the feed. It collimates exactly; to focus as well, its curvature is solved so the beam leaving the flat back, through the lens's own thickness, has the phase radius wanted.
- **Two hyperbolic faces**: the beam focused from one phase centre to the other.
- **Plano-convex, spherical**: a sphere and a flat, the simplest to make.

You give the **material**, **diameter**, **edge thickness** and whether its faces get **matching layers**, and **where it stands**: where it is; where the feed's beam has the **edge taper** asked for (the first lens); or, to focus or couple, where the beam's width there matches the width the target's beam has at the lens, the coupling's best. The centre thickness follows from the edge thickness and the faces' sags. **Use this lens** puts it in, and the feed horn moves to its distance.

- **Graded-index disc (flat)**: a flat disc, solid at its centre and less dense toward its edge (below).

Designing a lens as a disc makes that part a graded-index disc in the same place, and designing a disc as one of the lens kinds makes it a lens again.

### Graded-index discs

A graded-index disc on the bench (the RF tab's **GRIN lens**) can be part of a system: select it and press **Design the RF system…**, or design any lens of the system as one. To the RF designer it is a slab between two flat faces, as thick as the whole disc with its matching layers, of the plastic graded so that its optical path at radius $$r$$ is the disc's own:

$$
n(r) = n_0 - \frac{\mathrm{opd}(r)}{T}, \qquad \mathrm{opd}(r) = \sqrt{r^2 + f^2} - f,
$$

for a disc $$T$$ thick of focal length $$f$$, fitted over the disc as $$n_0 + g_2 r^2 + g_4 r^4 + g_6 r^6$$. So the Gaussian beam takes its power from its $$r^2$$ term (the graded slab's own matrix), real rays bend through it, and the phase error counts what the fit leaves. Its losses are its own: at each radius the index and loss of the density there, through its core and its layers, and its faces' reflection at that index (or through its layers at the frequency), each weighted over the beam.

**Design this disc…** makes one to suit the beam: its focal length starts as the thin lens's between the beam's phase centre before it and the one wanted after it, $$1/f = 1/F_1 + 1/F_2$$, and is then solved through the disc's own thickness and grading, because a thick disc's focus is nearer than its focal length. The density runs from the centre's (100 % by default) to the lowest asked for, raised if need be so that its least dense structure stays fine against the wavelength at the top of the band. On its own page its plastic, diameter, focal length, density range and matching layers can be set; **Optimise** can vary its focal length; **Tolerance** varies its plastic's permittivity, which scales every density's (its grading with it), and its thickness. **Make it** checks that its density can be graded, that it fits, and that it holds to the top of the band; its drawing gives its permittivity at five radii.

### Zones

A made-to-order lens can be **cut in zones** (a zoned, or Fresnel, lens): wherever it is thick, whole layers come out of its curved face, each

$$
\Delta z = \frac{\lambda_z}{n - 1}
$$

deep, a wave of path at its zone frequency $$\lambda_z$$. Its thickness at $$r$$ is the smooth lens's less $$k(r)\,\Delta z$$, $$k$$ the whole layers it is thicker there than at its thinnest, so it lies between its thinnest and that plus one step: much thinner and lighter for a large lens, and it absorbs less.

At the zone frequency the zoned lens bends the wave exactly as the smooth one does, since each step delays it by a whole wave. Away from it, each step delays it by $$k\lambda_z$$, not $$k\lambda$$: the phase slips by $$k(\lambda_z - \lambda)$$, a whole wave less, across the zones. The RF designer counts this from real rays, each ray's $$k$$ where it meets the cut face, in the phase error. The more zones, the narrower the band: **Analyses › Over the band** shows the phase error falling away either side of the zone frequency, and the gain with it.

On the bench a zoned lens is traced as it is cut: its curved face stepped back by the whole layers taken out, each step a sheer wall. A ray that runs into a wall is lost to the beam (the wall's shadow, a band inside each step as wide as the step is deep times the slope of the rays there), the diffracted field loses the same band, and the rays through each zone meet the smooth face moved back a step, so they are bent a little differently from the smooth lens's: a small defocus of its own. The RF designer traces the same cut face with its real rays: the share of the beam its walls shadow is a loss of its own (**Steps' shadow**), and the zones' defocus goes into the phase error with the slip away from the zone frequency, so at the zone frequency a zoned lens shows a small phase error where the smooth lens shows none. A lens's own page sets it zoned and its zone frequency, and gives its steps and its thickness as cut; **Design this lens** can cut the lens it makes; **Make it**, the 3D view, the drawing (the steps' depth and radii) and the quote all take the lens as cut.

### Worked examples

Two examples in the gallery's **RF and millimetre waves** group are designed in the RF designer; select a lens and press **Design the RF system…** to open each.

- **Lens antenna, 24 GHz**: a 120 mm PLA lens on a corrugated horn, made with **Design this lens**: the feed 116 mm away for an 11 dB edge taper, its face to the feed a hyperbola, both faces matched. It gives 28.19 dBi at 24 GHz (27.3 to 28.9 dBi across 21.6 to 26.4 GHz) at 81.4 % aperture efficiency; PLA's loss takes about 0.5 dB. It has a flange, and a gain specification of 27 dBi set in **Tolerance** for the Monte Carlo.
- **Gaussian beam telescope, 150 GHz**: two plano-hyperbolic polypropylene lenses, 100 mm across, between two identical corrugated horns. Lens 1 is placed for a 20 dB edge taper (195 mm from the feed); lens 2 is its mirror image, 430 mm on, so the receiver sees the feed imaged on itself. It couples 94.9 % to 99.8 % of the beam across 135 to 165 GHz (98.3 % at 150 GHz), 75.8 % (−1.20 dB) all told: the four bare faces reflect 0.67 dB of it, since at 150 GHz a printed matching layer would be coarser than a quarter wave.

**Checked against.**

- a feed horn's beam through free space, and through a flat plate as a gap of $$d/n$$, against the Gaussian beam's own formula, to $$10^{-9}$$;
- the aperture efficiency at most 81.5% at an edge taper of 10.9 dB, as Goldsmith gives it, and lower for a curved phase;
- the coupling of a beam to itself, 1, and to one twice as wide, 16/25;
- a quarter-wave matching layer reflecting nothing at its own frequency, and Fresnel's reflection without it;
- a hyperbolic lens with its focus at the feed's phase centre leaving the beam's waist at its curved face;
- a horn's beam into an identical horn 300 mm on: a lens of two hyperbolic faces, matched to the goal, couples it completely (to five places); one hyperbolic face, and a plano-convex lens, each to within half a per cent.
- a hyperbolic face on the beam's phase centre adding no phase error (under $$10^{-9}\lambda$$), and a sphere of the same vertex radius adding over $$0.05\lambda$$;
- a nearly uniform aperture's pattern: its half-power beamwidth $$58.9\,\lambda/D$$ degrees and its first sidelobe at −17.6 dB, the Airy pattern's, to 1% and 0.1 dB; a tapered one wider, its sidelobes under −24 dB;
- a plain slab reflecting nothing when half a wave thick inside, and $$\left(\frac{n^2-1}{n^2+1}\right)^2$$ at a quarter;
- a lens given a sphere where its hyperbola was, optimised with its radius and conic free: its phase error back under $$0.01\lambda$$ and its gain the designed lens's, within 0.05 dB.
- a graded-index disc's fitted grading against its own path $$\sqrt{r^2+f^2}-f$$, within $$0.01\lambda$$ over its face; and a disc designed to collimate leaving the beam's waist at its far face (to $$10^{-6}$$ mm), with its least density raised to hold to the top of the band;
- a zoned lens: its steps a wave of path deep, its thickness as cut never outside its thinnest and that plus one step; at its zone frequency its aperture efficiency the smooth lens's and its phase error no more, absorbing less; away from it a phase error that grows either way, where the smooth lens has none;
- tolerancing a hyperbolic lens: its permittivity off by 5 % either way lowers the gain both ways and matters most, its centre thickness (the beam flat inside) all but nothing; an error of nothing changes nothing; the same seed gives the same builds; and Wilson's interval for 5 of 10 is 23.7 % to 76.3 %.

## The parts

| Part | What it is |
|---|---|
| Feed horn | Launches the horn's Gaussian beam at a frequency and power. |
| Receiving horn | Takes in the overlap with its mode, read by a detector. |
| RF lens | A plano-convex HDPE lens, 100 mm across, $$f = R/(n-1) = 150$$ mm, in any of the dielectrics above. |
| Flat mirror | A metal mirror, 100 mm. |
| Focusing mirror | A concave metal mirror, $$R = 300$$ mm. |
| Offset reflector | A section of a paraboloid of focal length 150 mm cut 120 mm off its axis, 160 mm across, aluminium (below). |
| Radome | A flat sheet of HDPE 3 mm thick and 150 mm across, for the beam to pass through (below). |
| Wire grid | A polariser of real wires: it reflects the field along its wires and passes the field across them, each by its pitch and wire size (below). |
| Film beam splitter | A dielectric sheet, reflecting by its two faces' interference (below). |
| Mesh filter | A metal mesh: inductive, capacitive or resonant, passing a band of frequencies and reflecting the rest (below). |
| Absorber load | A screen that takes in what reaches it, to see the beam. |

Each part is the same as its optical counterpart, with the sizes and materials of a millimetre-wave bench. Lenses, mirrors and the rest from the other tabs work on an RF beam too. The metal mirrors carry a **metal** (aluminium, copper, gold, brass, stainless steel, or a perfect conductor) and lose $$4 R_s / Z_0$$ a reflection to its surface resistance $$R_s = \sqrt{\pi f \mu_0 / \sigma}$$: 0.14% for aluminium at 150 GHz, 0.7% for stainless steel.

## Offset reflectors

A **mirror** with a parent radius $$R$$, a conic of $$-1$$ and an **off-axis offset** $$h$$ is a section of the paraboloid of focal length $$f = R/2$$ cut $$h$$ off its axis: the part's centre sits on the parent at height $$h$$, and the parent's focus lies $$f$$ along the parent axis from the parent vertex, which is $$h$$ across and the parent's sag $$h^2/4f$$ behind the centre. A feed at the focus sends a beam that leaves the section collimated along the parent axis, turned by $$2\arctan(h/2f)$$ from its way in, so the feed sits clear of the beam it sends out: no blockage, which is why offset reflectors are used. The mirror's panel gives the focal length, the turn, and the focus on the bench, so the horn can be put there. The bench traces the section exactly (rays and the diffracted field); a mirror on its own axis also gives its figures as an antenna, as a lens does. The RF designer takes an offset reflector as its parent paraboloid on the axis, fed from the focus: its focal length, aperture and the metal's loss, without the section's own distortion.

## Radomes

A **radome** is a sheet of dielectric the beam passes through: a lens of two flat faces in an RF material, as thick as the sheet. Its two faces interfere, so what it reflects goes with its thickness over the wavelength in it and with the angle: a sheet a whole number of half-waves thick in the material, $$t = m\,\lambda / 2n$$ at the beam's angle, reflects nothing and loses only what it absorbs, $$2\pi n \tan\delta\, t / \lambda$$ nepers. The panel gives what the sheet passes square on and at the traced beam's own angle, for s and p (the sheet as one stack: core/face-pol.js), and the half-wave thickness at the bench's frequency. Curved radomes are the same lens with both radii set alike; a sandwich is a lens of more layers.

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
