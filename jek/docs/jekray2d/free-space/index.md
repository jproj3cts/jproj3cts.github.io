---
layout: docs
title: Free-space optics
permalink: /jek/docs/jekray2d/free-space/
description: How JEKray2D traces rays, propagates Gaussian beams and the diffracted field, adds interfering light, and solves cavities.
---

<p class="dx-lead">Free-space light is worked out three ways, each building on the one before: exact rays, Gaussian beams carried along the rays, and the diffracted field propagated along the beams. This page sets out each model and its equations.</p>

## Rays

### Geometry

Every element has its own frame. Its surfaces are sag curves in that frame (see [Concepts](/jek/docs/jekray2d/concepts/#surfaces)): conics with aspheric and odd terms, cut to their apertures. A ray is a point and a direction. The tracer finds where it meets each surface exactly: in closed form for a plane or a conic, and by iterating on the sag for aspheres. There is no paraxial approximation in the geometry.

### Refraction and reflection

At a surface with unit normal $$\hat n$$ between media of index $$n_1$$ and $$n_2$$, a ray with unit direction $$\hat d$$ refracts by the vector form of Snell's law. With $$\eta = n_1/n_2$$ and $$\cos\theta_i = -\hat d\cdot\hat n$$:

$$
\hat d_t = \eta\,\hat d + \left(\eta\cos\theta_i - \cos\theta_t\right)\hat n, \qquad
\cos\theta_t = \sqrt{1 - \eta^2\left(1 - \cos^2\theta_i\right)}
$$

Where the root is imaginary the light is totally internally reflected, $$\hat d_r = \hat d + 2\cos\theta_i\,\hat n$$, and both polarisations keep their power with the phases the Fresnel coefficients give.

### Fresnel coefficients

A bare surface reflects the amplitudes

$$
r_s = \frac{n_1\cos\theta_i - n_2\cos\theta_t}{n_1\cos\theta_i + n_2\cos\theta_t}, \qquad
r_p = \frac{n_1\cos\theta_t - n_2\cos\theta_i}{n_2\cos\theta_i + n_1\cos\theta_t}
$$

in the parity convention for p (see [Concepts](/jek/docs/jekray2d/concepts/#polarisation)). The reflected light becomes a branch of its own, so ghosts and back-reflections can be followed (**Follow weak reflections** on the Bench panel). Its loss always counts against the transmitted light.

### Coatings

A surface can carry:

- an AR coating or a set reflectance $$R$$, reflecting $$\sqrt{R}$$ in amplitude;
- a coating over a band of wavelengths, bare glass outside it;
- a thin-film stack, worked out by the characteristic-matrix method.

For the stack, each layer of index $$n_j$$ and thickness $$d_j$$ contributes

$$
M_j = \begin{pmatrix} \cos\delta_j & i\sin\delta_j/\eta_j \\ i\,\eta_j\sin\delta_j & \cos\delta_j \end{pmatrix}, \qquad
\delta_j = \frac{2\pi n_j d_j \cos\theta_j}{\lambda},
$$

with $$\eta_j = n_j\cos\theta_j$$ for s and $$n_j/\cos\theta_j$$ for p, and $$n_j\sin\theta_j$$ the same in every layer. With $$M = \prod_j M_j$$ and $$(B, C)^T = M\,(1, \eta_\text{sub})^T$$, the stack reflects

$$
r = \frac{\eta_0 B - C}{\eta_0 B + C}.
$$

The phase of $$r$$ is kept, so a coated mirror in an interferometer or cavity shifts the fringes as a real one does.

### Glass

Indices come from catalogue Sellmeier coefficients:

$$
n^2(\lambda) - 1 = \sum_{i=1}^{3} \frac{B_i\,\lambda^2}{\lambda^2 - C_i}, \qquad \lambda \text{ in µm}.
$$

The group index $$n_g = n - \lambda\,\mathrm{d}n/\mathrm{d}\lambda$$ sets group paths: pulse delays, and how a laser's line washes out fringes. A material can also carry absorption, and a table of $$n$$ and $$k$$ against wavelength.

### Polarisation along a ray

Each ray carries a Jones vector. Every surface multiplies it by its coefficients, and thin polarisation elements by their matrices. Written in the basis $$(E_p, E_s)$$, a waveplate of retardance $$\Gamma$$ waves with its fast axis at $$\theta$$ from p is

$$
J(\theta, \Gamma) = \begin{pmatrix} \cos^2\theta + e^{i2\pi\Gamma}\sin^2\theta & \left(1 - e^{i2\pi\Gamma}\right)\cos\theta\sin\theta \\ \left(1 - e^{i2\pi\Gamma}\right)\cos\theta\sin\theta & \sin^2\theta + e^{i2\pi\Gamma}\cos^2\theta \end{pmatrix},
$$

and an ideal polariser is the projector onto its axis. A Faraday rotator turns the field the same way *in the lab* whichever way light crosses it. In the ray's own basis that is $$+\beta$$ or $$-\beta$$, by the direction of travel against the field and the parity of the ray's p axis. That makes it non-reciprocal, as it should be.

### Optical path

Each ray accumulates its optical path $$L = \sum n_i \ell_i$$, plus any phase a surface adds: a coating's, a chirped mirror's group delay dispersion, a mask's delay. Rays of one source, one wavelength and one path make up a sampled wavefront. At a screen, rays arriving from one launch add as fields:

$$
E = \sum_k a_k\, e^{i k_0 L_k}, \qquad I = \vert E\vert ^2,
$$

with each cross term weighted by the source's coherence $$\gamma(\Delta L)$$ (see [Concepts](/jek/docs/jekray2d/concepts/#launches-and-coherence)). Before the fields are added, each beam is laid onto the screen's bins, which stops fringes aliasing against the spacing of the rays.

## Gaussian beams

### The beam parameter

A Gaussian source launches one reference ray down its axis, carrying the complex beam parameter

$$
\frac{1}{q} = \frac{1}{R} - i\,\frac{\lambda}{\pi n w^2}, \qquad q = z + i z_R, \qquad z_R = \frac{\pi n w_0^2}{\lambda}.
$$

At each surface the tracer works out the local ray-transfer matrix in the bench plane, and the beam parameter follows

$$
q' = \frac{A q + B}{C q + D}.
$$

Out of the plane the matching sagittal matrices carry a second $$q$$, so a beam through tilted optics or a cylindrical lens becomes astigmatic as a real one does. The beam's radius is $$w(z) = w_0\sqrt{1 + (z/z_R)^2}$$, and its Gouy phase is $$\arctan(z/z_R)$$.

### Branches

Wherever the reference ray splits, the beam branches. A beam wider than the element it meets is also split there: the part that lands on the element goes through it, and the part that misses carries on past. Each part keeps its share of the power as the Gaussian lands, so a half-blocked beam is half-blocked.

### Beam quality and higher-order modes

A beam with $$M^2 > 1$$ is a Gaussian Schell-model beam: an incoherent sum of the Hermite–Gauss modes of its embedded Gaussian, whose width is $$1/M$$ of the real beam's. The modes are weighted

$$
p_m = (1 - \kappa)\,\kappa^m, \qquad \kappa = \frac{M^2 - 1}{M^2 + 1},
$$

in each direction, which makes the beam's $$M^2$$ exactly the one set.

A source can instead launch a Hermite–Gauss mode $$\mathrm{HG}_{mn}$$ or a Laguerre–Gauss mode $$\mathrm{LG}_{pl}$$. Either is carried as a *coherent* sum of Hermite–Gauss modes, each with its own Gouy phase $$(m + n + 1)\arctan(z/z_R)$$, so a cylindrical-lens mode converter turns LG into HG as it does in the lab.

## The diffracted field

The diffracted field is worked out by *physical optics propagation*: a sampled field travels along each branch of the beam tree, with a pilot Gaussian beam (the branch's own $$q$$) travelling alongside to carry the fast-varying part analytically.

### Round fields

Most benches are slices through round systems, so a beam on axis is a figure of revolution, a radial profile $$E(r)$$. Its diffraction is a Hankel transform, done with the quasi-discrete Hankel transform (Guizar-Sicairos and Gutiérrez-Vega, JOSA A 21, 53, 2004).

- **Within the pilot's Rayleigh range**, the field is held against a plane and moved by the angular spectrum:

  $$
  E(r, z) = \int_0^\infty \tilde E(\rho)\, e^{-i z\sqrt{k^2 - (2\pi\rho)^2}}\, J_0(2\pi\rho r)\, 2\pi\rho\, \mathrm{d}\rho.
  $$

- **Outside it**, the field is held against a sphere centred on the pilot's waist and moved through the waist with one Fresnel transform, which rescales the grid:

  $$
  E(r_2, z) \propto \int_0^\infty E(r_1)\, \exp\!\left(-\frac{i k (r_1^2 + r_2^2)}{2z}\right) J_0\!\left(\frac{k r_1 r_2}{z}\right) r_1\, \mathrm{d}r_1.
  $$

Only the residual phase against the reference is sampled. A tight focus and a long collimated leg then both fit on a few hundred points.

### Surfaces as phase screens

At a surface, the field takes the phase the *real* surface adds. Rays are traced through it in three dimensions, along the pilot wavefront's normals. That is possible because every element is a figure of revolution about an axis in the plane. Their optical paths between a plane before the surface and one after it form a phase screen, and where they land sets the aperture. The paraxial part of that phase is handed to the pilot through the surface's ABCD matrix. What is left is the aberration, sampled on the new grid.

### Two-dimensional fields

Where tilts or decentres break the round symmetry, the field is sampled on a 2D grid instead. The Fresnel kernel is separable, so each axis keeps its own pilot, waist and grid. An astigmatic beam can then focus in x and y at different places without the grid blowing up. In 2D, each sample carries its own polarisation through its own Fresnel, coating or waveplate matrix.

### Steep foci

Near a focus reached at high numerical aperture, the paraxial step fails twice over. Its quadratic phase is not the sphere the light converges on, and it has no field along the axis. There the field is summed directly by the Rayleigh–Sommerfeld integral, from the pupil to each point on the screen:

$$
E(P) = \frac{i}{\lambda} \sum_Q U(Q)\, e^{-ik(r - \rho)}\, \frac{z}{r}\, \frac{1}{r}\, \Delta A,
$$

where $$r$$ is the distance from the pupil point $$Q$$ to $$P$$, $$\rho$$ its distance to the focus, and $$U$$ the full vector field at $$Q$$ with the converging sphere taken off. This is the integral Richards and Wolf simplify, without their approximations, so aberrated and tilted foci come out too.

### Where branches meet

Branches of one launch share a source, a wavelength and a polarisation, so where they overlap their fields add:

$$
\mathbf{E} = \sum_b u_b(x, y)\, \mathbf{J}_b,
$$

with $$u_b$$ the branch's spatial profile (unit power, every propagation phase in it) and $$\mathbf J_b$$ its Jones vector from the tracer, conjugated to the field's convention. Zoomed in below about 50 µm, the bench samples the field on every pixel, so standing waves and crossing-beam fringes show.

## What a screen reads

A screen records the rays and the field arriving on its face. From the field it gives an irradiance map, the point spread function and the MTF:

- **For a round pupil**, the Hankel transform, which is the true 2D PSF;
- **Otherwise**, the tangential line spread function.

The Strehl ratio is the classic one: the peak against the peak a perfect wave from the same amplitude at the last surface would reach, $$\left(\int \vert E\vert \,\mathrm{d}A / \lambda d\right)^2$$.

Fibre tips and photodiodes read the same arriving field: a fibre by its overlap with its own mode, a photodiode by $$\vert E\vert ^2$$ over its area. See their element pages.

## Cavities

A cavity is found from the light's own path. Along the reference ray's branches, the events are listed (which surface, reflected or transmitted, from which side). A loop is the shortest run of them that repeats twice. Each loop gets its own axis, the ray that closes on itself, and round-trip matrices in and out of the plane, $$\begin{pmatrix} A & B \\ C & D \end{pmatrix}$$. The cavity is stable when $$\left\lvert \tfrac{A + D}{2}\right\rvert  \le 1$$. Its mode is the beam that reproduces itself, $$q = (Aq + B)/(Cq + D)$$. Its free spectral range is $$c / L_\text{rt}$$ for a round-trip optical path $$L_\text{rt}$$.

The field engine solves the steady state rather than adding round trips one by one. With $$T$$ the round trip as one linear operator on one grid, and $$b$$ the injected field, the circulating field satisfies

$$
\left(1 - e^{i\delta}\,T\right) x = b
$$

at round-trip detuning $$\delta$$. That is solved in a Krylov space built from $$b$$, for every detuning a scan needs at once. The same space holds the cavity's own leading modes: its Ritz values are their round-trip losses and frequencies. For a cavity cut by its mirrors' edges, this is Fox and Li's iteration done all at once.

A laser with a line of its own drives the cavity with its line, and the circulating power is averaged over it.

### Gain

A gain medium in a loop makes a laser. Its small-signal gain against the round-trip loss says whether it lases. Above threshold, each gain sheet saturates as a homogeneous medium does with every pass at once (Rigrod 1965):

$$
\ln G = \ln G_0 - \frac{(G - 1)\,S}{P_\text{sat}}, \qquad P_\text{sat} = \frac{I_\text{sat}\,\pi w^2}{2},
$$

where $$S$$ is the power entering it summed over its passes, and $$w$$ the cavity mode's radius there. The power settles where the round trip is one, and leaves each partly transmitting mirror as a beam.

## Short pulses

A source given a pulse duration $$\tau$$ is a spectrum with a spectral phase. Reference rays are traced at 33 wavelengths across that spectrum. Their optical paths through glass, prisms, gratings, chirped mirrors and fibre form the pulse's spectral phase $$\varphi(\omega)$$, which a polynomial fit expands about the carrier:

$$
\varphi(\omega) = \varphi_0 + \tau_g\,(\omega - \omega_0) + \frac{\mathrm{GDD}}{2}(\omega - \omega_0)^2 + \frac{\mathrm{TOD}}{6}(\omega - \omega_0)^3.
$$

The pulse that arrives is the spectrum with that phase, transformed to time. Its duration, group delay, GDD and TOD are read out, along with its spatial chirp and pulse-front tilt. So prism and grating compressors, stretchers and delay lines need no formulas: they come out of the geometry.

## Heights

Every part sits at the beam height, 75 mm above the breadboard, unless it is given a height of its own (the 3D view's arrow, or **Height** in its panel, while the 3D view is turned on as an experimental feature). Each ray then carries its height $$z$$ and its slope $$u = \mathrm dz/\mathrm ds$$ along the bench, so its direction in 3D is

$$
\hat d = \frac{(d_x, d_y, u)}{\sqrt{1 + u^2}},
$$

and it is traced exactly in three dimensions.

**Missing a part.** A part takes only the light that lands inside its aperture once the height is counted: inside a circle of its semi-aperture $$a$$ for a lens, a mirror or a plate, at a point $$y$$ across it and $$h = z - z_\text{part}$$ above its centre,

$$
y^2 + h^2 \le a^2,
$$

and inside a band as tall as it is wide for a screen, a cube or a block. Light passing above or below a part goes on as if it were not there.

**Meeting a surface.** A surface that is flat, or curved only in the bench plane (a cube's face, a prism, a cylinder with its power in the plane), stands straight up, so a ray meets it where its path in the plane does. A lens's or mirror's face is a figure of revolution about its axis, so off its centre its sag is that at the radius

$$
x = \text{sag}\!\left(\sqrt{(y + y_0)^2 + h^2}\right),
$$

with $$y_0$$ an off-axis segment's offset from its parent's axis. A cylinder curved out of the plane has $$x = \text{sag}(h)$$. The ray is followed to where it meets that surface in 3D (in closed form for a conic, by iterating otherwise), and its normal $$\hat n$$ there is taken in 3D too.

**Bending.** Snell's law and the law of reflection, as vectors:

$$
\hat d_\text{r} = \hat d - 2(\hat d\cdot\hat n)\,\hat n, \qquad
\hat d_\text{t} = \eta\,\hat d + \left(\eta\cos\theta_i - \cos\theta_t\right)\hat n,
$$

with $$\eta = n_1/n_2$$, $$\cos\theta_i = -\hat d\cdot\hat n$$ and $$\cos\theta_t = \sqrt{1 - \eta^2(1-\cos^2\theta_i)}$$. A grating keeps the component along its grooves (straight up), so light arriving at a rise leaves on a cone; a mask bends the light by the gradient of its delay both ways.

**Polarisation.** A ray's $$s$$ direction is the one across it nearest straight up, so in the bench plane $$s$$ is out of the plane as ever. Off it, a surface's plane of incidence is tilted, and its own $$s$$ lies along $$\hat n\times\hat d$$. The ray's amplitudes are turned into that frame for the surface's Fresnel coefficients or coating, and each ray leaving is turned back into its own frame. So a ray high on a lens, polarised across the bench, is $$s$$ to the lens there, as it should be.

So a lens set 2 mm high bends a level beam up as one moved 2 mm across bends it sideways, aberrations included, and a photodiode or fibre tip off the beam's height reads, or couples, only what overlaps it. A link plane carries the light to the same place against its partner, at the partner's height. A mirror can also be tipped out of the plane (its **Tip**; see [Mirror](/jek/docs/jekray2d/free-space/mirror/#tip)): its normal leaves the plane, and the same 3D trace follows the light off it. With every part at the beam height and upright, and every source a line, none of this runs, and the bench traces exactly as it did.

## Limits

<div class="dx-warn" markdown="1">
- Parts sit at heights; mirrors can be tipped, other parts not yet. A ray sent straight up or down (a periscope's vertical leg) leaves the bench and is not followed. Rays out of the plane are traced exactly; a crystal's faces keep the ray's own polarisation frame, and the Gaussian beam's matrices and the diffracted field take the beam as centred out of the plane.
- A cavity's mode, the diffracted field and a screen's views take the beam as centred out of the plane; an iris's opening is not narrowed by a beam passing above or below its centre.
- The round field assumes a figure of revolution about the axis. Off-axis and tilted cases use the 2D field, which is paraxial in free space and slower.
- Rays and fields agree at the beam's centre by construction. Far from it, the Gaussian beam's paraxial model and the exact rays can differ, as they should.
- Light from separate sources never interferes. Two paths of one launch interfere as far as the source's coherence allows.
</div>

## Elements

### Sources and detectors

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/source/"><b>Source</b><small>A ray fan and a Gaussian beam: coherence, M², higher-order modes, pulses, fibre launch.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/detector/"><b>Photodetector</b><small>A photodiode and amplifier: DC, beat notes, noise and demodulation.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/screen/"><b>Screen</b><small>Spots, profiles, PSF and MTF, aberrations, pulses and optical traps.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/fibre-tip/"><b>Fibre tip</b><small>Into a fibre by mode overlap, and back out as a beam.</small></a></li>
</ul>

### Mirrors and lenses

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/mirror/"><b>Mirror</b><small>Plane, spherical or conic; partly transmitting; chirped.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/lens/"><b>Lens</b><small>Any number of surfaces in real glass: singlets, doublets, aspheres, cylinders, axicons.</small></a></li>
</ul>

### Splitting and polarisation

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/cube/"><b>Beam splitter</b><small>Non-polarising or polarising, with a coated diagonal.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/waveplate/"><b>Waveplate</b><small>A retarder of any retardance and fast axis.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/polariser/"><b>Polariser</b><small>An ideal linear polariser.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/crystal/"><b>Crystal</b><small>Beam displacer, Wollaston prism or Glan–Taylor polariser.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/faraday/"><b>Faraday rotator</b><small>A non-reciprocal rotator.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/isolator/"><b>Isolator</b><small>Polariser, 45° rotator, polariser.</small></a></li>
</ul>

### Shaping and filtering

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/stop/"><b>Stop</b><small>Iris, slit, double slit, comb, knife edge or beam block.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/mask/"><b>Mask</b><small>Any amplitude and delay as a formula: SLM patterns, vortex plates, ideal lenses.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/filter/"><b>Filter</b><small>Long-pass, short-pass, band-pass, ND, or a dichroic.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/grating/"><b>Grating</b><small>Reflecting or transmitting, each order a branch.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/prism/"><b>Prism</b><small>Right-angle, equilateral, or a window.</small></a></li>
</ul>

### Active and atomic

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/gain/"><b>Gain medium</b><small>A saturable gain sheet that makes a cavity lase.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/cell/"><b>Vapour cell</b><small>Rb, Cs or K: absorption, saturation, Zeeman.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/nlc/"><b>Nonlinear crystal</b><small>Second-harmonic generation in PPLN or PPKTP.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/aom/"><b>AOM</b><small>A Bragg cell: deflection and a frequency shift.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/eom/"><b>EOM</b><small>Phase sidebands, or amplitude modulation.</small></a></li>
  <li><a class="free" href="/jek/docs/jekray2d/free-space/chopper/"><b>Optical chopper</b><small>A slotted wheel, with a reference for a lock-in.</small></a></li>
</ul>

### Tabs

<ul class="dx-cards">
  <li><a class="free" href="/jek/docs/jekray2d/free-space/link/"><b>Link plane</b><small>Joins two tabs: one plane seen from two benches.</small></a></li>
</ul>
