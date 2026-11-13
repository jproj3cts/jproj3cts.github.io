---
layout: docs
title: Scattering by a particle
permalink: /jek/docs/jekray/free-space/scattering/
description: The JEKray Particle part, one small sphere, rod or spheroid on the bench. How its scattered light is worked out by Lorenz–Mie theory or the discrete dipole approximation, and how that light reaches the lenses, detectors and fibres that can see it.
element: { palette: Free space, type: particle }
---

<p class="dx-lead">A <b>Particle</b> is one small sphere, rod or spheroid at a point of the bench. Its <b>Scattering</b> tab gives its cross-sections and the power it scatters in the light that reaches it. The scattered light goes on to the parts that can see the particle, as light of the laser that drives it.</p>

## The particle

Add a Particle from the parts list (Active and atomic) and put it where the light is, usually at a focus. The light passes it untouched: it is a point, with no surface for a ray or a beam to meet. Its **Particle** tab has:

- **Shape**: a sphere, a rod with flat ends (a cylinder), a rod with round ends (a capsule) or a spheroid.
- **Material**: a glass from JEKray's list, or gold, silver or aluminium. The glasses are taken as lossless. The metals use their measured complex index, so they absorb.
- **Diameter**, and for a rod or spheroid its **Length** along its axis. A capsule's length includes its round ends. A spheroid shorter than its diameter is oblate.
- The part's **Angle** is the direction of a rod's or spheroid's axis in the bench plane, and **Axis tilt** its tilt up out of the plane. A tilt of 90° stands the rod upright.
- **Medium**: the bench's where the light is, vacuum, air or water.
- **Send its scattered light to the parts** and **Draw the scattered light in every direction**, described [below](#scattered-light-on-the-bench).

The Scattering tab has the **Model** (Auto, Rayleigh, Mie or Dipole array), **Where it is** (where the part is, or where the Trap tab finds the particle held) with three offsets across the beam, up and along it, and the **Collecting NA** and **Collected from** of the Collected figure.

On the bench the particle is drawn as a sign 16 pixels long, and in the 3D view 36 pixels long, in its shape and at its orientation however far the view is zoomed. At its true size it would not show on a bench measured in millimetres.

The **Trap** tab reads the optical trap the same light makes for the particle, as a [screen's Trap tab](/jek/docs/jekray/free-space/screen/) does. It takes a shape that is not a sphere as the sphere of the same volume.

A bench saved when a screen could hold a particle opens with that particle on a Particle part of its own, where the screen's beam met it, with the same Trap and Scattering figures.

## The light on the particle

Every Gaussian beam that passes within three of its radii of the particle counts (within 20 µm for a beam narrower than that), whichever way it goes. Beams of one laser add as fields, so two counter-propagating beams light the particle with a standing wave. A beam sent back by a mirror counts again on its way back, as a beam of its own: in a steep focus each pass is taken from the pupil of the lens that focuses it. On a detector, the scattered light interferes with every beam of the same laser that lands there, each with its own phase. Separate lasers add as powers. A beam that rises or descends out of the bench plane (after a tipped laser, a tipped mirror or a periscope) counts too, taken in its own frame: along it, across it and up from it. A gentle beam tipped up 30° gives the level beam's cross-sections, scattered power, extinction and collected share to 1 part in 10¹⁵, and a detector beyond the particle the same reading. A steep focus through a tipped lens, or a beam folded straight up by a mirror at 45° into a real asphere facing up, agrees with the level one to 0.07% or better.

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

In a script, `JEKray.scatter(name)` returns the same numbers, the two cuts, the map and the far field's complex amplitude over the sphere of directions. `JEKray.scattered(name)` returns the Caught by rows: each part's name, share and power, and what is not collected. `JEKray.detector(name)` gives a detector's `X` and `Y` (right less left, top less bottom, mW) and the scattered light on it. `JEKray.mie(x, mr, mi, angles)` gives the Mie efficiencies and $$S_1$$, $$S_2$$ of any sphere.

## Scattered light on the bench

With **Send its scattered light to the parts** ticked, the far field the models give is launched from the particle as rays, in two steps.

### Which parts catch it

A fan of 132 rays over the whole sphere of directions is traced one step, to the first thing each ray meets. A coarse fan can miss a small part, so each part of the bench is also looked at on its own with 17 rays over the cone it fills as seen from the particle. A part that some ray reaches first has a clear line to the particle. The answer is kept while the parts and the particle stay where they are, so a change of power or wavelength does not probe again. A part hidden behind another is reached through it: a detector behind a lens gets the light the lens passes on.

### The cones

Each part with a clear line is sent a cone of 8 × 24 rays that fills its aperture as seen from the particle. Along the direction $$\hat r$$ of a ray the far field is $$\mathbf F(\hat r)$$, and the ray stands for a solid angle $$\Delta\Omega$$. It carries the power

$$
p = \frac{|\mathbf F(\hat r)|^2}{2Z}\,\Delta\Omega,
$$

with $$Z$$ the medium's impedance, and its two polarisation amplitudes are the components of $$\mathbf F$$ across the ray, with their phases. A ray that meets another part first is stopped there and counted for neither, so no direction is counted twice. The ten cones that carry most power are traced on through the bench like any other rays.

Where the driving beam goes on into a cone and fills only a small part of it, a second cone of 8 × 24 rays three far-field radii of the beam wide covers that part, and the first leaves it out.

The Scattering tab's readout has a **Caught by** row for each part with a clear line: the share of the scattered power that enters its aperture, and the power. **Not collected** is everything else.

### What a detector reads

A photodetector adds the power of the scattered rays that land on it. Scattered light is also light of the laser that drives the particle, so it interferes with that laser's beams on the same detector. A cone's rays are a grid of rings and spokes. How the landing points change from ring to ring and from spoke to spoke gives the area $$\Delta A$$ of each ray's tube on the detector, and the ray is then a field of amplitude $$\sqrt{p/\Delta A}$$ there, with its polarisation and the phase of its optical path. The interference with a Gaussian beam $$\mathbf E_b$$ of the same laser is the sum over the rays

$$
P_\times = 2\operatorname{Re}\sum_i \mathbf E_b^*(u_i, v_i)\cdot\hat{\mathbf e}_i\,\sqrt{p_i\,\Delta A_i}\;e^{i\phi_i}.
$$

The phase of the scattered field is held against the driving beam's own phase at the particle, and the beam's Gouy phase from the particle to the detector is counted as it builds up along the way.

**In a tight focus** the unscattered beam is not a Gaussian beam to the accuracy this needs. There the interference is taken from the focus's own plane waves. Wave $$o$$, with field $$\mathbf E_o$$ and direction $$\hat d_o$$, goes on from the particle along the same ray as the scattered light in that direction, and the two interfere by

$$
P_o = -\frac{4\pi}{k}\,\frac{\operatorname{Im}\left(\mathbf E_o^*\cdot\mathbf F(\hat d_o)\right)}{2Z}.
$$

This is the optical theorem one wave at a time: the sum of $$P_o$$ over the pupil is $$-P_\text{ext}$$. The waves are gathered into 12 × 12 bins across the pupil, each bin is traced as one ray, and its $$P_o$$ is added where the ray lands. A detector that takes in the whole beam therefore reads the incident power less the extinction, plus the scattered power that lands on it.

**Two cones on one detector** add as fields with each other when the same laser drives them: a particle seen directly and in a mirror, or two particles in one beam. The field of one cone is evaluated at the other's rays, and the interference is the sum

$$
P_{12} = 2\operatorname{Re}\sum_{i\in 1} \mathbf E_2^*(u_i, v_i)\cdot\hat{\mathbf e}_i\,\sqrt{p_i\,\Delta A_i}\;e^{i\phi_i}.
$$

Cones driven by different lasers add as powers.

A [photodetector](/jek/docs/jekray/free-space/detector/) set to **Split in four** also reads right less left and top less bottom. Behind a collection lens these follow a particle moved across the focus, the signal a levitation experiment reads its particle's position from.

A [fibre tip](/jek/docs/jekray/free-space/fibre-tip/) takes in the overlap of the scattered field with its mode. Where the cone comes to a focus on the tip, the overlap is taken 30 Rayleigh ranges of the mode back from the tip, where the rays are apart.

### The picture

**Draw the scattered light in every direction** shows the fan: 48 rays in the bench plane, and in the 3D view 84 more above and below it. Each is as bright as the pattern is along it, so the forward and back lobes show, and light polarised in the bench plane shows the gap along its polarisation. The fan is a picture. No reading uses it.

The cones are drawn as rays. With **Draw light by its power** on they are drawn at the faintest step that shows, because by power they would not show beside the beam at all. The 2D bench draws the two spokes of each cone nearest the bench plane, and the 3D view draws every ray.

## Validation

The [validation page](/jek/tools/jekray-validation.html) runs the Mie sphere against an independent calculation, and the dipole array's rod against an independent dipole calculation on a finer lattice. A dipole-array sphere agrees with Mie to about 1% at the default lattice for silica at 1550 nm.

Three more cases check the light on the bench against a Mie calculation that has no rays in it: the change in a detector's reading when a sphere is put in a wide beam, for silica and for gold; the slope of a split detector's signal as a sphere crosses a focus; and the share of the scattered power a lens of NA 0.5 collects ahead of the particle and at 90°. The position signal's slope also agrees with the closed form of Gittes and Schmidt for a Rayleigh sphere (*Optics Letters* 23, 7, 1998) to 1.1%.

A fourth case checks the split detector's slope in the NA 0.8 focus of the example bench. Its reference sums the focus as plane waves from the field on the lens's plane, scatters each wave by Mie theory and integrates the interference over each half of the collected cone. JEKray agrees with it to 0.6% for light polarised out of the bench plane and 0.5% for light polarised in it. The same script gives 4% to 6% more for an energy-keeping thin lens or an aplanatic lens in place of the bench's thin mask, so which ideal lens is meant matters more at this aperture than anything in the scattering.

A fifth case puts the sphere at the focus of a real lens, a plano-convex asphere in N-BK7 whose curved face is a hyperboloid (conic constant −n², 4 mm from its vertex to the focus, clear to NA 0.5). JEKray takes this focus from rays traced through the lens's two faces. The reference traces the same prescription itself and sums the focus as plane waves. With faces that reflect nothing, the focus's width, its peak irradiance, its field along the axis, the scattered power and the share a like lens collects agree to 0.2% or better, and the split detector's slope to 0.12%. With bare faces each traced ray takes its own Fresnel loss, and the peak falls by the factor the reference gives to 0.001%. With bare faces the beam behind both lenses keeps 0.829 of the coated bench's power against the reference's 0.834.

A sixth case is a retro-reflected focus. A lens focuses the beam onto the sphere, a like lens recollimates it and a flat mirror that reflects half sends it back to refocus on the sphere. Moving the mirror over half a wavelength moves the standing wave across the sphere. The reference sums the two foci as plane waves and scatters both by Mie theory. At NA 0.8 the irradiance, the scattered power and the extinction agree with it to 0.3% of their largest value at every step, the change on a detector behind the mirror and on one on a 50/50 plate's return port to 0.6%, and both split detectors' slopes to 3%. At a gentle focus the Gaussian beam agrees to 2%, and the slopes to 3.5%.

## Assumptions

<div class="dx-warn" markdown="1">
- The particle and every part are in each other's far field. A part within a few wavelengths of the particle is not treated correctly.
- When the beam comes back on itself (a retro-reflector: a lens and a mirror behind the particle), the particle's own scattered light comes back the same way and is scattered again. The optics that return the beam return the scattered light: each direction of it comes back along the opposite direction, its field multiplied by the ratio of the returning beam's field to the going beam's at the focus, and it arrives at the image of the particle in the focus. The particle is driven by the beams and by that light, and this is repeated until the returned light changes by less than 1 part in 10⁷ (3 or 4 passes in the validation case). The far field, the scattered power, the extinction and the light on the bench all include it. Only the Mie model does this.
- Scattering inside a cavity is not modelled. When the light comes back to the particle more than once (between two mirrors facing each other, or when returned light goes on past the particle again), the Scattering tab says so, and the readings take the scattered light back once only. Two arms of one laser sent in from either side are not a return.
- Two particles do not light each other: each scatters the bench's beams alone.
- The beam that drives the particle is not made weaker by what was scattered. A detector that takes in the beam reads the loss through the interference above.
- Forces and torques come from the Trap tab's dipole, not from these models.
- The scattered light is launched as if the particle were in air or vacuum. A particle inside a block of glass or water still gets its cross-sections, but its cones are not refracted out of the block correctly.
- Scattered light that has passed through a focus on its way (after a retro-reflector, or the image of the particle) takes the Gouy phase of each focus it passed. This is read from how the cone's spread across its rays has turned over between the particle and the face, so two line foci of the same way one after the other are taken as none.
- Where a cone meets a beam on a detector at an angle, each ray stands for its whole tube and the fringes across it are summed with it, so steep fringes add to nothing.
- A cone that lands on a detector only in part is added up over the face, with each ray's field carried a little past the cone's rim.
- A ray's field on a detector is geometric. It is right where the cone is many wavelengths wide on the face, as it is after a collimating lens or straight from the particle, and not at a focus.
- Between its rays a cone's field is the nearest ray's, with its phase carried on to second order. A cone that reaches a detector much smaller than its footprint has few rays on it, and its power there is then that of the nearest rays' tubes.
- With a gentle beam (NA up to 0.3) the interference uses the bench's Gaussian beam. Its phase is good to about the square of the beam's divergence, and the extinction is a small difference of large terms: for a particle off the waist of a focus of NA 0.15 it was 8% out in our tests, and for a collimated beam 0.1%.
- A Gaussian beam's transmission through a refracting face is its footprint's, each part of it at its own angle to the face and each polarisation shared out. Through two bare faces in a row it is the product of each face's average, where the light at one height meets both faces at related angles: behind the two bare aspheres of the validation case 0.6% low.
- A face's weak reflection reaches the particle only with **Follow weak reflections (ghosts)** on. It is then added to the light on the particle as a field. A collection lens whose flat face looks back at the particle through its own focus sends 4% of the beam back onto it, and the light on the particle is then a standing wave. Behind the bare asphere of the validation case it went from 0.68 to 1.41 times its value without reflections as that lens was moved by 0.1 µm steps, as a reflection of about 3.5% of the power predicts.
- A screen does not record scattered rays, and the diffracted field does not hold them. Read them with a photodetector.
- Scattered light coupled into a fibre tip is read at the tip. It does not travel on into a fibre network.
- The glasses are lossless. Only the metals absorb.
- The dipole array is good to a few per cent while $$|m|kd$$ stays below about 0.5 and at least 10 dipoles span the smallest dimension. The tab says when a lattice is coarser than that. It converges slowly for metals and other indices far from the medium's, where its error can reach tens of per cent.
- A focus's plane waves are those of its pupil seen from the particle. This holds while the particle and its offset from the focus are much smaller than the distance to the pupil.
- A beam below NA 0.3 is one plane wave at the particle. That is rough when the beam's waist is not much wider than the particle.
- With the medium set to something other than the bench's, the wavelength in the medium is the one set but the focus is still the bench's.
- A dipole array runs in the background. Until it has finished, the bench shows the scattered light of the last run, moved with the particle.
</div>

## Settings

{% include jekray_params.html group="free" key="particle" %}

## Related

- [Photodetector](/jek/docs/jekray/free-space/detector/), which reads the scattered light and a particle's position.
- [Screen](/jek/docs/jekray/free-space/screen/), whose Trap tab also reads a trap for atoms.
- [Free-space optics: steep foci](/jek/docs/jekray/free-space/#steep-foci), for the vector field at a focus.
