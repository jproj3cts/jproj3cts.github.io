---
layout: docs
title: Scattering by a particle
permalink: /jek/docs/jekray/free-space/scattering/
description: How JEKray works out the light one small particle scatters, a sphere by Lorenz–Mie theory and a rod or spheroid by the discrete dipole approximation, in a tight focus or a wide beam, with each model's limits.
---

<p class="dx-lead">A screen can hold one small particle: a sphere, a rod or a spheroid. Its <b>Scattering</b> tab gives the particle's cross-sections, the power it scatters in the light on the bench, and where that light goes.</p>

## The particle

The particle belongs to a [screen](/jek/docs/jekray/free-space/screen/). Put the screen where the particle is, usually at a focus, and untick **Stop the rays it records** so the light carries on. On the Scattering tab choose:

- **Particle**: a sphere, a rod with flat ends (a cylinder), a rod with round ends (a capsule) or a spheroid. The same particle is the one the Trap tab reads. The Trap tab takes a shape that is not a sphere as the sphere of the same volume.
- **Material**: a glass from JEKray's list, or gold, silver or aluminium. The glasses are taken as lossless. The metals use their measured complex index, so they absorb.
- **Diameter**, and for a rod or spheroid its **Length** along its axis. A capsule's length includes its round ends. A spheroid shorter than its diameter is oblate.
- **Axis direction** and **Axis tilt** for a rod or spheroid: the direction of its axis in the bench plane, as a part's angle, and its tilt up out of the plane. A tilt of 90° stands the rod upright.
- **Medium**: the bench's where the light is, vacuum, air or water.
- **Model**: Auto, Rayleigh, Mie or Dipole array (below).
- **Where it is**: where the strongest beam meets the screen, or where the Trap tab finds the particle held. Three offsets move it from there across the beam, up, and along the beam.
- **Collecting NA** and **Collected from**: the cone a lens or detector would gather, for the collected fraction.

In the 3D view the particle is drawn where the light meets the screen, in its shape and at its orientation, as a sign that stays the same size on the page however far the view is zoomed. At its true size it would not show on a bench measured in millimetres.

## The light on the particle

Every Gaussian beam through the screen's region counts, whichever way it goes, as on the Trap tab. Beams of one laser add as fields, so two counter-propagating beams light the particle with a standing wave. Separate lasers add as powers.

**A steep focus** (numerical aperture above 0.3) is taken as its full vector field. JEKray already sums that field from the light leaving the last surface, the pupil. Each sample of the pupil is a plane wave travelling towards the focus, with its own direction $$\hat d_o$$, its own polarisation and its own phase:

$$
\mathbf E(\mathbf r) = \sum_o \mathbf E_o\, e^{i k\,\hat d_o\cdot(\mathbf r-\mathbf r_c)},
$$

with $$\mathbf r_c$$ the particle's centre and $$k = 2\pi n_m/\lambda$$ the wave number in the medium. The phase of each wave at $$\mathbf r_c$$ is part of its $$\mathbf E_o$$, so the particle may sit anywhere near the focus. The sum of the $$\mathbf E_o$$ is the vector field the Diffraction tab shows there.

**A gentler beam** is one plane wave: the beam's own direction, with the field it has where the particle is. A note says so when the beam changes across the particle.

## The three models

### Lorenz–Mie, for a sphere

For a homogeneous sphere of radius $$a$$ and relative index $$m = n_p/n_m$$ in a plane wave the scattered field is known exactly (Bohren and Huffman, *Absorption and Scattering of Light by Small Particles*, 1983, chapter 4). With the size parameter $$x = ka$$, the coefficients are

$$
a_n = \frac{[D_n(mx)/m + n/x]\,\psi_n(x) - \psi_{n-1}(x)}{[D_n(mx)/m + n/x]\,\xi_n(x) - \xi_{n-1}(x)},\qquad
b_n = \frac{[m D_n(mx) + n/x]\,\psi_n(x) - \psi_{n-1}(x)}{[m D_n(mx) + n/x]\,\xi_n(x) - \xi_{n-1}(x)},
$$

summed to Wiscombe's cutoff, about $$x + 4x^{1/3} + 2$$ terms. The logarithmic derivative $$D_n$$ is found by downward recurrence. A complex $$m$$ gives an absorbing sphere. From them:

$$
Q_\text{ext} = \frac{2}{x^2}\sum_n (2n+1)\operatorname{Re}(a_n+b_n),\qquad
Q_\text{sca} = \frac{2}{x^2}\sum_n (2n+1)\left(|a_n|^2+|b_n|^2\right),
$$

and $$Q_\text{abs} = Q_\text{ext} - Q_\text{sca}$$. A cross-section is its efficiency times $$\pi a^2$$. The amplitude functions $$S_1(\theta)$$ and $$S_2(\theta)$$ give the far field of one plane wave, for light polarised square to the scattering plane and in it:

$$
\mathbf F(\hat r) = \frac{i}{k}\left[S_2\,(\mathbf E\cdot\hat e_{\parallel i})\,\hat e_{\parallel s} + S_1\,(\mathbf E\cdot\hat e_\perp)\,\hat e_\perp\right],
\qquad \mathbf E_\text{sca} = \mathbf F(\hat r)\,\frac{e^{ikr}}{r}.
$$

In a tight focus the sphere's far field is the sum of this over every plane wave of the focus, each turned to its own direction, added as fields. Nothing is approximated beyond the sampling of the pupil.

### A dipole array, for any shape

The discrete dipole approximation (Purcell and Pennypacker 1973; Draine 1988) replaces the particle by point dipoles on a cubic lattice of spacing $$d$$. Each dipole is driven by the incident field and by the field of every other dipole:

$$
\frac{\mathbf p_j}{\alpha} - \sum_{k\ne j} \mathbf G_{jk}\,\mathbf p_k = \mathbf E_\text{inc}(\mathbf r_j),
\qquad
\mathbf G\,\mathbf p = \frac{e^{ikr}}{r}\left[k^2(\hat r\times\mathbf p)\times\hat r + \frac{1-ikr}{r^2}\left(3\hat r(\hat r\cdot\mathbf p)-\mathbf p\right)\right].
$$

- **Polarisability.** $$\alpha$$ is that of the lattice dispersion relation (Draine and Goodman 1993): the Clausius–Mossotti value corrected to order $$(kd)^2$$, so that an infinite lattice carries a wave of the material's own index, with the radiative reaction.
- **Solver.** BiCGStab, to a residual of $$10^{-5}$$. Each product is the direct one, every pair of dipoles, so the time grows as the square of the number of dipoles.
- **Lattice.** The spacing is the smaller of $$0.5/(|m|k)$$ and a tenth of the particle's smallest dimension (set **Dipoles across** for more). The spacing is then adjusted so the dipoles hold the shape's true volume. A run has at most 12,000 dipoles, or 24,000 when you set the dipoles across.
- **Incident field.** In a tight focus each dipole is driven by the sum of the focus's plane waves at its own position.
- **Output.** The far field $$\mathbf F(\hat r) = k^2\sum_j \left(\mathbf p_j - \hat r(\hat r\cdot\mathbf p_j)\right)e^{-ik\hat r\cdot\mathbf r_j}$$, extinction from the optical theorem and absorption from the dipoles themselves.

The run happens in the background. The tab shows the solver's iterations as they go, and **Stop** ends it.

### Rayleigh, one dipole

A particle much smaller than the wavelength is a single dipole, $$\mathbf p = \alpha\,\mathbf E(\mathbf r_c)$$. For a sphere $$\alpha$$ is the Clausius–Mossotti polarisability with the radiation reaction, as on the Trap tab. A spheroid has one polarisability along its axis and another across it, from its depolarisation factors. A rod is taken as the spheroid of its volume and aspect. Rayleigh scatters as much back as forward.

### Auto

Auto takes Mie for a sphere and the dipole array for any other shape. It takes Rayleigh only when the particle is tiny: $$|m|k$$ times half its longest dimension below 0.1. The tab names the model used with its figures: the size parameter, the number of dipoles, their spacing and $$|m|kd$$.

## What the tab gives

- **Cross-sections**: scattering, extinction and absorption, with the **efficiencies** (each over $$\pi a^2$$, $$a$$ the radius of the sphere of the particle's volume), the **asymmetry** $$g = \langle\cos\theta\rangle$$ and the back-scattering efficiency. These are for a plane wave. For a shape that is not a sphere the wave runs along the strongest beam and is polarised as the light at the particle is.
- **In this light**: the power scattered and absorbed in the light as it is on the bench, with the forward and back shares of the scattered power.
- **Collected**: the share of the scattered power into a cone of the numerical aperture set (in the medium), about the direction chosen.
- **Rayleigh would give**: the single dipole's scattering cross-section beside the model's, so you can see how far Rayleigh is off.
- **Plots**: the scattered intensity (W/sr) as a polar plot in the bench plane, drawn with the bench's own angles, and in the plane out of it through the beam, on a linear or a 40 dB logarithmic scale. The dashed curve is the part polarised square to the plotted plane. **Every direction** maps the intensity against the angle from the beam and the angle round it. Each plot saves as PNG and CSV.

In a script, `JEKray.scatter(name)` returns the same numbers, the two cuts, the map and the far field's complex amplitude over the sphere of directions. `JEKray.mie(x, mr, mi, angles)` gives the Mie efficiencies and $$S_1$$, $$S_2$$ of any sphere.

## Validation

The [validation page](/jek/tools/jekray-validation.html) runs the Mie sphere against an independent calculation, and the dipole array's rod against an independent dipole calculation on a finer lattice. A dipole-array sphere agrees with Mie to about 1% at the default lattice for silica at 1550 nm.

## Assumptions

<div class="dx-warn" markdown="1">
- One particle, alone in a uniform medium. Nothing the scattered light meets afterwards is counted, and the scattered light is not put back on the bench as rays.
- Forces and torques come from the Trap tab's dipole, not from these models.
- The glasses are lossless. Only the metals absorb.
- The dipole array is good to a few per cent while $$|m|kd$$ stays below about 0.5 and at least 10 dipoles span the smallest dimension. The tab says when a lattice is coarser than that. It converges slowly for metals and other indices far from the medium's, where its error can reach tens of per cent.
- A focus's plane waves are those of its pupil seen from the particle. This holds while the particle and its offset from the focus are much smaller than the distance to the pupil.
- A beam below NA 0.3 is one plane wave at the particle. That is rough when the beam's waist is not much wider than the particle.
- With the medium set to something other than the bench's, the wavelength in the medium is the one set but the focus is still the bench's.
</div>

## Related

- [Screen](/jek/docs/jekray/free-space/screen/), which holds the particle and reads the trap.
- [Free-space optics: steep foci](/jek/docs/jekray/free-space/#steep-foci), for the vector field at a focus.
