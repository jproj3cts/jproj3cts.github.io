---
layout: docs
title: Concepts
permalink: /jek/docs/jekray/concepts/
redirect_from: /jek/docs/jekray2d/concepts/
description: Units, coordinates, angles, polarisation, sign conventions, launches and coherence in JEKray.
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
| Frequencies | Hz in the electronics, MHz for modulators, GHz for RF parts |
| RF power | dBm |
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

**A screen's own across axis.** A screen (or photodetector) reads positions across its face along its own local +y, 90° anticlockwise from the way it faces. One facing −x (angle 180°) has its +y pointing down the bench, so a ray 2 mm above the axis reads y = −2 on it. A script that wants bench positions reads `bx`, `by` from `J.hitsOn` beside `y`.

**Out of the plane.** A free-space part also has a height **z** above the breadboard (75 mm is the beam height), a **Tip** about its own across axis and a **Roll** about its own axis. In the plane they are 75 mm, 0 and 0, and the light is traced in three dimensions through whatever they are set to (see [Heights](/jek/docs/jekray/free-space/#heights)).

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

A project can hold several benches, each on a tab. Light keeps to its own bench. Two **link planes** that share a pair name are one plane seen from two benches: light crossing one leaves the other, and beams, fields and cavities carry across. In fibre, two **feedthroughs** do the same, and two **electrical feedthroughs** carry signals between tabs.

## Sweeps

Any number in a panel can be swept: it moves back and forth over a range on a shared clock, and the bench is worked out again at each step. The **Sweeps** menu also has **Optimise the bench…** (a golden-section search for one parameter, or Nelder–Mead from a Latin hypercube start for several) and **Tolerance the bench…** (Monte Carlo over the swept ranges). A lens or RF design is optimised and toleranced in its own workspace instead, against its design conditions. A sweep with steps also solves each step's particle scattering ahead, with a bar of its own under the bench's (see [Scattering by a particle](/jek/docs/jekray/free-space/scattering/#speed-answers-kept-combined-and-solved-ahead)).

A sweep follows the bench's own Light settings. If the bench shows the diffracted field (**Light › Show the diffracted field**, or a screen's Diffraction tab open), the sweep works out the field for each of its steps; if it does not, no field is worked out. It plays at once with what is quick to draw: the parts moving, the rays, the beams' outlines, the readings and the plots. The slow layers are worked out meanwhile in the background, each with its own bar: the diffracted field, and a Particle's scattering for each step. None of a layer is shown until every step of it is ready, so no step shows it while another does not. Until then the bench draws the beams' outlines in place of the field, as it does with the field off, rather than the field from before Play, which would lie where the beams no longer go. When every step is ready the layer is added to the playing sweep in one go, the field and the scattered light (its light to the parts, its glow and its radiation pattern in 3D) each as soon as it is ready. Zoomed in to the close-up, or on a bench with modules, the field is worked out first and the sweep then plays, as before; if that is predicted to take longer than 30 seconds the bench stays as it is with only the bars moving until all of it is ready. **Pause** stops it at once. A bench saved with the old *Render the diffracted field* tick opens with its own Light setting deciding: the tick is no longer read. Every sweep plays on a fixed set of steps a cycle, the same ones its field is rendered at: its own **Steps**, or, with the box blank, an automatic count shown in the box (*auto (120)*), enough for about 30 steps a second at its rate (at least 48 and at most 600 a cycle), so it still looks like gliding. Each cycle comes back to the very same values, so each step's trace, its 3D light and a Particle's answer are worked out once and reused, and the rays always match the field. Dragging the sweep's slider, or a paused sweep, takes whatever value it is given; playing picks up from the nearest step. The frames it keeps are held within an eighth of the computer's memory, as the browser reports it (at most 1 GB). A 2D field over many segments can take a hundred megabytes a step, so a sweep whose whole cycle would not fit renders only one step in every few, evenly spread, and says so; each is shown until the next.

While a sweep plays, the trace of each step is kept: on its next cycle, and when it plays steps rendered ahead, the bench draws the kept trace without tracing again. This includes benches with fibres, circuits and particles. A step's trace is kept only when it is the same as tracing the bench afresh would give; the tests check this on every example. Benches whose trace starts from the one before (a laser's gain settling, a vapour cell) are traced every step as before. If the computer cannot draw as many steps a second as the sweep asks for, steps are skipped so that the cycle keeps its time, and the sweep's panel says so. While sweeps play, the rays are drawn at the screen's own resolution; they are drawn finer again when the sweeps stop.

Every progress bar has a light running along it while its work goes on, so a slow bar can be told from one that has stopped. With reduced motion set on the computer, the bar brightens and dims gently instead.
