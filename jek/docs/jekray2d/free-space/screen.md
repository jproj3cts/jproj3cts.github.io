---
layout: docs
title: Screen
permalink: /jek/docs/jekray2d/free-space/screen/
description: The JEKray2D screen, which records the rays and the field arriving on its face, and reads out spots, profiles, the PSF and MTF, aberrations, pulses and optical traps.
element: { palette: Free space, type: screen }
---

<p class="dx-lead">A screen records what arrives on its face: the rays and the diffracted field. Its panel reads them out as a spot and a profile, a point spread function and MTF, aberrations across the field, the pulse that arrives, and an optical trap at its focus.</p>

## The model

A screen is a line across the bench, flat or curved, facing the light it records. By default it stops the light it records. Untick **Stop the rays it records** and it samples the light without stopping it, so a screen can sit in the middle of a system. A curved screen's centre of curvature can be on either side. A negative radius puts it on the side the light comes from, like a retina.

### Rays

Each ray that lands is recorded with where it lands, its power, its direction, its optical path and its polarisation. From the rays the screen gives:

- the spot's power, its centroid $$\bar y$$ and its RMS radius about the centroid, weighted by power:

  $$
  \sigma_y = \sqrt{\frac{\sum_k P_k\,(y_k - \bar y)^2}{\sum_k P_k}};
  $$

- the binned intensity, rays of one launch added as fields bin by bin, which shows interference fringes;
- the wavefront: each ray's optical path to a reference sphere centred on the centroid, as an RMS and peak-to-valley error.

With interpolation on (the default, `binInterp`), each beam of rays is laid onto the bins as a sampled wavefront before the fields are added, which stops fringes aliasing against the ray spacing.

### The diffracted field

The **Diffraction** tab shows the field that arrives from every Gaussian beam and every ray fan:

- **Gaussian beams**, from the field engine;
- **Ray fans**, taken as uniform pupils of their width and curvature.

From the strongest arrival it gives the irradiance map, the point spread function, the MTF (quoted at a spatial frequency you set), enclosed energy, and the Strehl ratio. Strehl is the peak against the peak a perfect wave from the same amplitude at the last surface would reach, which makes defocus against the screen count.

Near a steep focus the vector focal field is used (**Vector focus**: auto, on or off), so a screen at the focus of a high-NA objective shows the field along the axis too (see [Free-space optics: steep foci](/jek/docs/jekray2d/free-space/#steep-foci)).

The map is placed where the light lands on the face, above or below its centre too, and on a screen tipped or rolled out of the plane it is the pattern on the face itself, stretched up it where the light meets it at a slope.

**Along the beam** shows the light across a plane before the screen, square to it: slide **Back from it** anywhere back to the last part the light arrives from. It is worked out as if the screen stood at that plane, so it gives all the screen's figures there, and its map and peak are in W/cm² for the power of the strongest beam's laser, with a colour key under the map. Use it as a beam profiler: to find a waist, to see how far an aperture's rings reach, or to read the irradiance a sample would see at any point along a beam.

**Show its diffraction pattern on its face (3D view)** paints the map onto the screen's face in the 3D view, where the light lands, in the same colours and scale as the tab (linear or log). It updates as the field is worked out again.

### Aberrations

The **Aberrations** tab sweeps a fan source across the field:

- a collimated source by a field angle;
- a diverging source (a point object) by an object height.

The fan is traced again at each field. Where an aperture stop lies further along, each field's chief ray is aimed through the stop's centre. At each field the screen gives the chief ray (so the distortion), the spot, the best focus along the screen's normal (the tangential field curvature), and the wavefront, carried back to a sphere about where the chief ray lands. The wavefront is fitted with Zernike polynomials along the meridian, and across the fields with Seidel's terms $$W_{040}, W_{131}, W_{222}, W_{311}$$.

The bench is two-dimensional, so this is the tangential (meridional) section only: astigmatism shows as a focus that moves with the field.

### Pulses

For a pulsed source, the **Pulse** tab shows the pulse that arrives: its duration, group delay, GDD and TOD, from a polynomial fit to its spectral phase, with its spatial chirp and pulse-front tilt. Branches of one laser add as fields, separate lasers and the two polarisations as powers.

### Optical traps

The **Trap** tab reads an optical trap near the screen, for an atom (rubidium, caesium, potassium or sodium) or a dielectric sphere. Every beam through the screen's region is taken as its full vector field near the focus. Beams of one laser add as fields, so two counter-propagating beams make a standing-wave trap.

**For an atom**, the polarisability comes from its D lines, with the counter-rotating terms that matter far from resonance:

$$
\frac{\alpha}{\varepsilon_0} = \sum_i 6\pi c^3 f_i\,\frac{\Gamma_i/\omega_i^2}{\omega_i^2 - \omega^2 - i(\omega^3/\omega_i^2)\Gamma_i},
\qquad U = -\frac{\operatorname{Re}(\alpha)\, I}{2\varepsilon_0 c},
$$

with the scattering rate $$\operatorname{Im}(\alpha)\,I/(\hbar\varepsilon_0 c)$$, plus the ion core's own polarisability.

**For a sphere** smaller than the wavelength, the polarisability is the Clausius–Mossotti one with radiation reaction. With $$m = n_p/n_m$$ and $$k = 2\pi n_m/\lambda$$, the force is $$\mathbf F = \tfrac12\operatorname{Re}\!\left(\alpha \sum_j E_j \nabla E_j^*\right)$$, where

$$
\alpha_0 = 4\pi\varepsilon_0 n_m^2 a^3\,\frac{m^2 - 1}{m^2 + 2}, \qquad
\alpha = \frac{\alpha_0}{1 - i k^3 \alpha_0/(6\pi\varepsilon_0 n_m^2)}.
$$

From the brightest point, Newton's method on the force finds where it is zero. The stiffness there gives the trap frequencies each way. The tab also gives the depth (in kelvin, and in units of $$kT$$), the scattering rate and recoil heating, and for a sphere the damping by the gas around it.

## Settings

{% include jekray2d_params.html group="free" key="screen" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Aberrations are the tangential section only, as the bench is two-dimensional.
- The PSF and MTF are the true 2D ones for a round pupil, and the tangential line spread function otherwise.
- A trap's atoms are taken as two-level lines from their ground state. The excited states' hyperfine structure, the vector light shift of circular light and higher transitions are left out.
</div>

## Related

- [Source](/jek/docs/jekray2d/free-space/source/), for what launches the light.
- [Photodetector](/jek/docs/jekray2d/free-space/detector/), for an electrical signal from the light.
