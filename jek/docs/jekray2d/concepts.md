---
layout: docs
title: Concepts
permalink: /jek/docs/jekray2d/concepts/
description: Units, coordinates, angles, polarisation, sign conventions, launches and coherence in JEKray2D.
---

<p class="dx-lead">The ideas the rest of these pages build on: where things are, which way they face, how fields are written, and when light from two paths interferes.</p>

## Units

| Quantity | Unit |
|---|---|
| Lengths and positions on the bench | mm |
| Angles | degrees, anticlockwise from +x |
| Wavelength | nm, in vacuum |
| Optical power | mW (sources), dBm (fibre amplifiers) |
| Fibre length | m; fibre loss in dB/km |
| Frequencies | Hz in the electronics, MHz for modulators |
| Pulse duration | fs; group delay dispersion in fs² |

## Coordinates and angles

The bench is the plane seen from above: x to the right, y up. Every element has a position (x, y) and an angle, and that angle sets its own frame. The element's local +x points along the angle, and local +y is 90° anticlockwise from it.

What the angle *means* depends on the element:

| Element | Its angle is |
|---|---|
| Source | the direction the light leaves in |
| Mirror, grating | the direction its working face points (its normal, towards the light) |
| Screen, photodetector, fibre tip | the direction its face points, towards the light arriving |
| Lens | the direction of its optical axis; light travelling that way meets surface 1 first |
| Plane elements (stop, waveplate, polariser, mask, filter, …) | their normal: 0 or 180 for a beam travelling along x |
| Isolator | its forward direction |

To fold a beam travelling in direction $$a$$ into direction $$b$$, a plane mirror faces $$(a + 180° + b)/2$$. For example, a beam travelling +x (0°) sent up to +y (90°) needs a mirror at 135°.

## Surfaces

Every surface is a curve in its element's frame, $$x = z_0 + \mathrm{sag}(y)$$, over $$\vert y\vert $$ up to its semi-aperture. The sag of a conic with aspheric terms is

$$
\mathrm{sag}(y) = \frac{c\,y^2}{1 + \sqrt{1 - (1+k)\,c^2 y^2}} + a_2 y^2 + \sum_{j \ge 1} A_j\, y^{2j+2} + \sum_{j \ge 1} \alpha_j\, \vert y\vert ^{j}
$$

with curvature $$c = 1/R$$ and conic constant $$k$$: 0 for a sphere, −1 for a paraboloid. The last sum holds odd terms. Its first term, a cone, is how an axicon is made.

## Polarisation

Light carries two complex amplitudes:

- **s**, perpendicular to the bench plane;
- **p**, in the plane, perpendicular to the ray.

Together they form a Jones vector $$(E_s, E_p)$$. A polarisation element is a 2 × 2 Jones matrix on that vector.

The p direction follows a *parity* convention. It is the in-plane normal to the ray, and it reverses at each reflection. A mirror then turns s and p over alike, and at normal incidence $$r_p = r_s$$, as it must when s and p cannot be told apart.

## Fields and phase

The ray tracer accumulates phase as $$e^{+ikL}$$ along each ray's optical path $$L = \sum n_i \ell_i$$. The field engine writes fields as $$e^{-ikz}$$, following Siegman. In that convention a Gaussian beam is

$$
E(r, z) \propto \exp\!\left(-\frac{i k r^2}{2 q(z)}\right), \qquad q(z) = z + i z_R, \qquad z_R = \frac{\pi w_0^2}{\lambda}.
$$

The two meet where the field engine takes in the tracer's Jones vectors, which enter conjugated.

## Launches and coherence

Light from one laser is one **launch**. Wherever two paths of a launch meet, on a screen, a photodiode or in a fibre, their fields add. Separate lasers add as powers, never as fields.

A source can be *split from* another, like two fibre launches off one coupler. The two are then one launch with a phase and an extra length of fibre between them, so their light interferes.

A laser's linewidth $$\Delta\nu$$ sets its coherence length $$L_c = c/\Delta\nu$$. Two paths of one launch whose optical paths differ by $$\Delta L$$ interfere with the fringe contrast

$$
\vert \gamma(\Delta L)\vert  =
\begin{cases}
\exp\left(-\pi \vert \Delta L\vert  / L_c\right) & \text{Lorentzian line (a laser)}\\[4pt]
\exp\left(-\dfrac{(\pi \Delta L / L_c)^2}{4 \ln 2}\right) & \text{Gaussian line (an LED, a Doppler-broadened line)}
\end{cases}
$$

and the cross term of each pair of fields is weighted by it. $$\Delta L$$ is the difference in *group* paths, so glass counts by its group index. A coherence length of 0 means a single frequency: every pair counts in full.

A broadband source is given by its bandwidth $$\Delta\lambda$$. Its coherence length is $$\lambda^2/\Delta\lambda$$, a few wavelengths, so only near-equal paths still make fringes: white-light fringes.

## The beam tree

The tracer sends one reference ray down the middle of each Gaussian source. Wherever that ray splits, at a beam splitter, a partly reflecting surface, a grating order or each round trip of a cavity, the beam *branches*. The branches form a tree. Every Gaussian-beam result is worked out along this tree: beam sizes, the diffracted field, cavity modes, and what reaches fibres and photodiodes.

## Tabs and link planes

A project can hold several benches, each on a tab. Light keeps to its own bench. Two **link planes** that share a pair name are one plane seen from two benches: light crossing one leaves the other, and beams, fields and cavities carry across. In fibre, two **feedthroughs** do the same.

## Sweeps

Any number in a panel can be swept: it moves back and forth over a range on a shared clock, and the bench is worked out again at each step. The **Sweeps** menu also has:

- an **optimiser**: a golden-section search for one parameter, or Nelder–Mead from a Latin hypercube start for several;
- a **tolerance study**: Monte Carlo over the swept ranges.
