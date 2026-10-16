---
layout: docs
title: Lens design
permalink: /jek/docs/jekray/lens-design/
description: Assemblies and lens design in JEKray. Lenses, mirrors and stops on one axis are made one assembly, designed together in the lens design workspace (conditions, layout, lens data, solves, pickups, merit, optimisation, analyses, tolerancing, drawings and a PDF report), then used on the bench as the parts they are.
---

<p class="dx-lead">An assembly is a set of lenses, mirrors and stops on one axis that are designed together: a doublet, a triplet, an objective, a folded telescope. Its parts stay the bench's own parts, traced as they always are, so making one changes nothing the light does. What it adds is the view a lens designer works in: the parts read as one sequence of surfaces, with the conditions the design is for.</p>

## Making an assembly

Select the lenses, mirrors and stops (Shift- or Ctrl-click, or drag a box round them), then **Make an assembly** in their panel or from the right-click menu. They must be:

- lenses round about their axes (not cylindrical), round irises, windows, or mirrors (flat or curved, whole: not off-axis segments or film beam splitters);
- on one axis, which each mirror folds: each part the next one along it, within its own half-width of it, at one height and upright;
- facing along it, a lens either way round, tilted from it by up to 30°; a mirror facing the light it reflects, at any angle;
- not overlapping.

A lens off the axis by less than its half-width is *decentred*, one turned from it *tilted*: both are part of the design, traced as they stand (below).

If they are not, the panel says which part is in the way and why. The light is taken to run away from a source on the axis; with none on it, the way most of the lenses face.

An assembly is picked and moved as one, drawn with a dashed outline (one round each straight run of a folded one) and its name. Ctrl-click one of its parts to edit that part alone; if a part is then moved off the axis, the outline turns red and the panel says so. **Split into parts** gives back the separate lenses and stops, where they are.

**File › New lens design…** puts a starting assembly on the bench, a stop 10 mm across and a biconvex N-BK7 singlet of about 50 mm focal length designed for the F, d and C lines, and opens it in the design workspace.

## The prescription

Along the light, from the first surface's vertex, an assembly reads as:

| for each surface | |
|---|---|
| shape | radius R (or flat), conic k, the even terms a₂ r² and A₄ r⁴, A₆ r⁶ …, the odd terms of an axicon-like surface |
| clear radius | the surface's own, else its lens's |
| gap to the next | the lens's own thickness inside a part, the air between parts |
| material in that gap | the lens's glass, or air |

The stop is a flat surface in air with the iris's radius. A lens turned against the light is read face for face the other way round, each sag of the other sign. Changes to the prescription are written back to the parts: each shape to the surface it came from, each gap to a lens's thickness or to the parts' places along the axis (the first surface stays where it is). A prescription written back unchanged moves nothing.

Its panel gives its paraxial focal length and back focal distance at its primary wavelength (the y-nu trace through the prescription), its number of surfaces and where the stop is, and its length from first to last surface.

## Folds, tilts and decentres

A mirror is one reflecting surface in the prescription, its glass **Mirror**. Its radius is read as the light meets it (positive with its centre beyond it along the light, so a mirror concave to the light has a negative radius), and the axis turns where it meets the mirror, about its normal. The gaps run on along the folded axis; the lens data still counts them from surface to surface, as if unfolded.

A tilted or decentred lens carries its tilt (degrees, in the plane of the fields) and decentre (mm, across the axis) on its first surface, about its first vertex; its other surfaces turn with it. A mirror's tilt is half the angle it turns the light through: 45° for a right-angle fold. The lens data shows a **Tilt, decentre** column whenever an assembly has either (**Tilts and decentres** shows it for any design): each part's tilt in degrees and, for a lens or window, its decentre in mm, on its first surface. Each is typed there or set on the bench by turning or moving the part, and like any other value it can be marked **V** for the optimiser or picked up from another part's. A part posed in the lens data is turned about its first vertex, its other surfaces carried round with it, and written to the bench where the prescription reads it back the same. A mirror's tilt is its fold: changed, the axis after it turns by twice as much, and the parts after it go round with it.

The optimiser may then tilt a lens to balance an off-axis aberration (a field to one side only gives it a reason to), or decentre one to centre an image. Note that a tilt with a decentre turns a lens about a point off its vertex; about the centre of a surface's sphere that surface does not change at all, so a plano-convex lens can be turned about its sphere's centre almost for free. Give such a pair a reason to be one value or the other (a pickup, a boundary of the merit, or only one of them varied).

**Checked against.** A lens tilted 3° and moved 0.4 mm in the prescription, written to the bench and read back: every surface's tilt and decentre and every gap the same to 10⁻⁹; a fold mirror turned 5°: the axis after it 10° round; a lens knocked 0.3 mm across and 2° round, its tilt, decentre and image distance varied on the axis: its spot as small as the centred lens's at its best focus.

The lens engine walks the axis from the first vertex, each surface in its own frame: its vertex, and its axes turned by its tilt from the axis there, which a mirror reflects for all after it. A ray is taken into each surface's frame, met and refracted (or reflected) there, and taken back. The image plane is square to the axis after the last surface, and every analysis is read in its frame. First-order figures and Seidel sums are those of the system unfolded: a mirror reflects a paraxial ray as $$u' = u + 2cy$$, and after each mirror the sense of the index, the curvatures and the gaps turns over, so the sums keep their usual signs.

A folded or tilted assembly is drawn folded in the layout, as on the bench. Its parts are written back to the bench along the folded axis, each mirror turned to keep the fold. A mirror cannot be removed in the lens data (split the assembly to take it out); its radius and conic can be set, varied, solved and picked up as a lens surface's can.

In tolerancing, a mirror's radius is toleranced as a lens surface's, and its tilt turns its face alone: the axis after it stays where it was designed, as the parts after a fold mirror stay put when the mirror is made a little out, so the image moves on the image plane by twice the tilt times the distance.

**Checked against.**
- a singlet with a flat mirror at 45° after it: the same focal length, spots and wavefronts as unfolded, its image across the bench;
- a concave sphere: its focus at half its radius; a paraboloid, and a Newtonian (the paraboloid with a flat at 45° before its focus): a star imaged with no spot at all;
- a spherical mirror's spherical aberration, $$S_I = 2y^4/|R|^3$$, from the Seidel sum and from the real rays;
- a lens, a fold mirror and a second lens tilted 2° and moved 0.3 mm across, made an assembly: each of the bench's own rays, in the bench plane and out of it, met where the lens engine's ray meets the sensor, with the same optical path, to 10⁻⁹ mm;
- a fold mirror made a minute of arc out: the image plane where it was, the image moved by twice the tilt times the throw.

## The lens engine

A lens designer traces many rays through one fixed list of surfaces, again and again. The bench's tracer follows light through everything on a bench (splits, coatings, beams, fields); the lens engine follows rays through a prescription alone, as fast as it can, and is what the design work below is built on.

**Coordinates.** z runs along the axis from the first surface's vertex, y across it in the bench plane (the meridional section, where the fields lie) and x out of it (sagittal). The object is at infinity; a field is the angle of the incoming light in the y-z plane.

**Surfaces.** Each is $$z = z_i + \text{sag}(\rho)$$, $$\rho$$ the distance from the axis, with the bench's own sag:

$$\text{sag}(\rho) = \frac{c\rho^2}{1+\sqrt{1-(1+k)c^2\rho^2}} + a_2\rho^2 + \sum_j A_{4+2j}\,\rho^{4+2j} + \sum_q o_q\,\rho^q$$

A ray meets a surface where Newton's method finds the root along the ray, and is refracted by Snell's law in vector form,

$$\mathbf{d}' = \mu\,\mathbf{d} + \left(\sqrt{1-\mu^2(1-\cos^2 i)} - \mu\cos i\right)\hat{\mathbf{n}}, \qquad \mu = n/n',$$

in three dimensions, so skew rays are traced as exactly as meridional ones. A ray landing outside a surface's clear radius is vignetted there; one that cannot refract is lost.

**First order.** Paraxial (y-nu) traces give the focal length and back focus, and the chief ray, aimed at the stop's centre, places the entrance and exit pupils; for an object at a finite distance, the image distance and magnification too (Design conditions, below). The aperture is the stop's own opening, or an entrance pupil diameter set for the design, the stop then floating to suit.

**Ray aiming.** Each ray is found that crosses the stop at the pupil point asked for, by Newton's method on where it starts, so the stop is filled exactly whatever the pupil aberrations of the lenses before it. From infinity, rays start on a plane square to the incoming light through the entrance pupil's centre, so every ray of a field starts on one wavefront; from a finite object, at the object point, aimed at a point on the entrance pupil's plane.

**Wavefront error.** Each ray's optical path is measured to the reference sphere centred on the chief ray's image point and passing through where the chief ray crosses the exit pupil's plane; its difference from the chief ray's, in waves, is the ray's wavefront error. Pupils are sampled by rings at Gauss–Legendre radii with arms, or by a square grid.

**Checked against.**
- the bench's own tracer: the same rays, in the bench plane and out of it, on the axis and off it, land in the same place with the same optical path, to 10⁻⁹ mm;
- an ellipsoid of eccentricity 1/n, which images collimated light into glass perfectly: no spot and no wavefront error;
- a single sphere, where geometry and Snell's law give the exact answer;
- makers' lens files: the focal lengths and back focal distances their pages state;
- the symmetry of a round system: a pupil point turned about the axis lands turned, and the wavefront is the same either side of the bench plane.

It traces some 10⁵ aimed rays a second, and runs in the page's background worker where the work is long.

## Design conditions

Each assembly carries the conditions it is designed for:

- **aperture:** an entrance pupil diameter in mm, or an F-number;
- **fields:** angles of the incoming light, in degrees, each with a weight;
- **wavelengths:** in nm, each with a weight, one of them primary.

A new assembly starts with its stop's opening as the entrance pupil, the axis alone as its field and the bench's wavelengths.

## The design workspace

**Design…** in an assembly's panel, or a double-click on it, opens it on a page of its own: the lens design workspace. The bar names the bench it is on and the assembly (its name can be edited there). **Back to the bench** (or Esc) returns. Nothing is copied: every change in the workspace is written to the assembly's parts on the bench as it is made, so the bench is always the design, and Undo and Redo work in both places.

A design started with File › New lens design has no light on the bench yet. Its button reads **Place on a bench**: it adds a source for each field (collimated, as wide as the entrance pupil, aimed through its centre, at the primary wavelength with the others as extra lines) and a screen at the image, then returns to the bench.

**File › Import a lens file (.zmx) as a design…** reads a lens file as an assembly and opens it here.

### Design conditions

The left column holds the conditions the design is for: the object, the aperture (an entrance pupil diameter or a working F-number), the fields (up to 12, each with a weight) and the wavelengths (nm and weight, one primary, up to 12; **Visible (F, d, C)** sets the usual three). The stop opens to suit the entrance pupil these set, and its opening on the bench follows.

**The object** is at infinity (a star, a distant scene: the fields are angles, in degrees) or **at a distance** before the first surface (a relay, a microscope objective, a camera close up: the fields are the heights of points on the object, in mm). Switching from one to the other turns the fields from angles into heights at that distance, and back. For a finite object the aperture may also be given as the **NA at the object**, $$\sin	heta$$ of the half-angle the entrance pupil subtends from the object's axial point; the **working F-number** is always $$1/(2\,\mathrm{NA}')$$ in image space, from the paraxial marginal ray (from infinity, the focal length over the pupil). The conditions show the paraxial magnification and image distance.

From a finite object every ray starts at its object point and is aimed, as from infinity, to cross the stop where asked; its optical path is counted from that point, so the wavefront error of a perfect image is nil. The paraxial traces add the ray from the axial object point (the image distance, and the magnification $$m = n\,u / (n' u')$$) and the chief ray from an object point of unit height (the paraxial image height, which distortion is measured against); the Seidel sums start their marginal and chief rays from the object's points, and the focus solve puts the image plane at the paraxial image of the object.

**Take conditions from the bench** reads the light arriving at the assembly in the bench's last trace: each source whose rays cross a plane just before its first surface, going forward and inside its clear radius, gives a field (the rays' mean angle to the axis, with the axis always included) and its wavelengths; the widest beam there, measured square to itself, becomes the entrance pupil. When every source's rays come from a point (where they cross, by least squares), at much the same distance, the object is put there: each point's height a field, the widest cone the NA. A design for one kind of object lit by the other on the bench says so in its panel.

**Checked against.**
- a thick lens with an object 150 mm before it: its image distance and magnification from its principal planes and Newton's equation, to 10⁻⁹ mm;
- an ellipsoidal mirror imaging one focus on the other: no spot and no wavefront error, magnification $$-d_2/d_1$$; a sphere imaging its centre back on itself, likewise;
- real rays at a small pupil landing at the paraxial height; the Seidel $$S_I$$ against the real rays' wavefront, to a part in 10⁶;
- a doublet lit by a point source 3 mm off the axis on the bench: the conditions taken from it (the object 120 mm away, fields 0 and 3 mm, its NA); and each of the bench's rays, from the point in its own direction, meeting the sensor where the lens engine's does with the same optical path, to 10⁻¹² mm.

**Take conditions from the bench** reads the light arriving at the assembly in the bench's last trace: each source whose rays cross a plane just before its first surface, going forward and inside its clear radius, gives a field (the rays' mean angle to the axis, with the axis always included) and its wavelengths; the widest beam there, measured square to itself, becomes the entrance pupil.

### The layout

A section through the design in the plane of the fields: its lenses cut through, its stop, its image plane, and five rays from each field across the pupil (−1, −½, 0, ½, 1 of its radius), each aimed through the stop and traced by the lens engine. Each field has its own colour, as in the conditions.

Under it are the design's first-order figures at the primary wavelength: focal length, back focal distance, working F-number (focal length over entrance pupil diameter), the entrance pupil's size and place, the paraxial image height at the largest field, and the total track from the first surface to the image.

### Lens data

One row a surface, as a lens designer lists them, from the object (at infinity) to the image:

| column | |
|---|---|
| Radius | in mm; type Flat (or leave it empty) for a plane surface |
| Thickness | the gap to the next surface: a lens's centre thickness inside it, the air between parts; on the last surface, the image distance |
| Glass | inside a lens, any glass in the catalogue by name, or a model glass as nd/Vd; air between parts |
| Clear radius | a lens surface's own; set larger than its lens, the lens is made larger. The stop's is set by the aperture |
| Conic | the conic constant k |

Beside each radius, thickness and conic:

- **V** marks it a variable: what the optimiser may change (below). A glass has a V too, which makes it a model glass.
- **…** sets a **solve** or a **pickup**, shown as **S** or **P**, its value then worked out and shown in grey:
  - *Paraxial focus* (the image distance): the image plane where the marginal ray of the primary wavelength crosses the axis, the back focal distance. A new design has it.
  - *F-number* (a radius): the curvature that gives the system the working F-number asked for, with the entrance pupil as set. The system's power is affine in one surface's curvature, so two paraxial traces give it exactly.
  - *Edge thickness* (a thickness): the centre thickness that leaves the edge, at the smaller clear radius of its two surfaces, as thick as asked: $$t = e - \text{sag}_2(h) + \text{sag}_1(h)$$.
  - *Pickup*: the value follows another surface's same quantity, times a scale plus an offset (a radius picked up times −1 makes a lens symmetric).

  Pickups are worked out, then the solves, then the pickups again, twice over so a chain settles, then the image distance.

Click a row to select it. **Insert a surface** puts a flat surface after it: inside a lens it splits the glass in two (a cemented doublet); after a lens's back it adds 2 mm of the same glass behind. **Insert a singlet** puts a flat N-BK7 singlet 2 mm thick in the air after the selected part (with the Object row selected, in front of the first surface; with nothing selected, at the end), pushing the rest back only if there is no room. **Remove** takes a surface out, or a lens of two surfaces whole. Every other surface keeps its place along the axis, and marks, solves and pickups stay with the surfaces they belong to.

### Merit

The **Merit** tab sets what the optimiser makes small: the merit function, a sum of squared terms.

- **The image.** For every field, wavelength and pupil point, each weighted by its field's and wavelength's weights and the point's quadrature weight, either the ray's miss on the image plane from the field's centroid over all the wavelengths (*RMS spot about the centroid*), its miss from the primary wavelength's chief ray (*about the chief ray*), or its wavefront error less the mean (*RMS wavefront error*, in waves). The pupil is sampled by 1 to 4 rings at Gauss–Legendre radii, each with 4 to 12 arms, so few rays stand in for the whole pupil. Together these terms weigh 1, so their part of the merit is the RMS spot radius in mm (or the RMS wavefront error in waves).
- **Terms added to it:** the focal length, the working F-number, the total track, the distortion at the largest field (from the real chief ray, %), or any Seidel sum, each with a target and a weight: the term is $$\sqrt{w}\,(v - t)$$.
- **Boundaries** every design keeps to: glass at least (and, if set, at most) so thick at its centre and so thick at its edge, and air between lenses at least so wide at the centre and the edge. Each counts only while it is broken, as ten times its overshoot in mm, so it overrides the rest. A stop may sit against a lens. Two more hold a lens's aspheric terms to what can be made: their **departure** (the sag they add to the surface, anywhere over its clear radius; 0.5 mm unless set, 0 for none), counted against the limit itself so a few micrometres hold as well as a millimetre; and the departure's **slope** in degrees (no limit unless set).

The merit is $$\sqrt{\sum r_i^2 / W}$$, $$W$$ one for the image plus the added terms' weights. The table gives each term's value now and its share of the merit. Rays are traced through every surface whatever its clear radius, as the lenses are sized to the light afterwards.

### Optimise the design

Mark the values the optimiser may change with **V** in the lens data: radii, thicknesses, conics and glasses. Solves and pickups are worked out again at every step, so a radius solved for an F-number keeps the focal length while the others change.

- **Damped least squares** goes downhill from where the design is to the nearest minimum. Each cycle finds how every term changes with every variable (by finite differences), and takes the step $$(J^\mathsf{T}J + \lambda\,\mathrm{diag}\,J^\mathsf{T}J)\,\delta = -J^\mathsf{T}r$$, a radius worked in its curvature so it can pass through flat. A step is shortened if it would take any variable further than its reach (a sixth of a radius's curvature, 30% of a thickness, 0.5 of a conic, 0.02 in a glass's nd or 3 in its Vd), and that reach and $$\lambda$$ shrink while steps fail and grow back when they help. It stops when no step makes the merit smaller.
- **Global search** looks for a better minimum than the nearest: it starts again and again from the best design so far, each variable shaken (radii by about 30% of their curvature, thicknesses by about 30%, conics by 0.3, glasses along nd and Vd), takes each start downhill, and keeps what is better. It carries on until stopped.

Both run in the page's background worker, a few cycles or trials at a time, and the design (and its parts on the bench) changes as they go. **Undo** takes it all back. Changing the design by hand stops a run.

**Checked against.**
- a singlet bent for least spherical aberration: the shape the third-order closed form gives, $$(R_2+R_1)/(R_2-R_1) = 2(n^2-1)/(n+2)$$, and the bottom of a fine scan of its merit;
- a Cooke triplet with its radii spoilt by up to 30%: optimised back to at least as good as the published design, its focal length kept;
- a cemented doublet of one glass: its two glasses varied make it an achromat, crown in front of flint.

### Aspheric surfaces

A lens surface may carry even aspheric terms on top of its conic, its sag

$$z(r) = \frac{c r^2}{1 + \sqrt{1 - (1 + k) c^2 r^2}} + A_4 r^4 + A_6 r^6 + \dots + A_{16} r^{16}.$$

**+ A** beside a lens surface's name opens a row of its terms under it: A4 first, **Add A6** and so on to A16, **Remove** taking the last off. Each is typed (in mm to the power of one less than its order), marked **V** for the optimiser, or picked up from the same term of another surface; a surface's terms set on the bench (a lens's panel, Add aspheric terms) show here too, and the other way round.

The optimiser varies each term as the sag it adds at the surface's clear radius, $$A_n h^n$$ in mm, so terms whose raw values differ by many orders of magnitude take steps of a like size. Keep the departure and slope boundaries in the merit function (above) to keep what it finds makeable; use as few terms as do the job, starting from A4.

The Seidel sums carry a surface's fourth-order term (its $$A_4$$ and its conic) as a third-order aberration; the higher terms are in the real rays, and so in every analysis. Its drawing gives the terms in its notes and the departure at its clear aperture; a lens file writes them as an even asphere.

**Checked against.**
- a plano-convex N-BK7 lens of 50 mm at f/2, its curved side to the light: A4 to A10 on that side, optimised, take its RMS spot from 497 µm to 0.01 µm, against an Airy radius of 1.4 µm;
- the same with the departure kept within 20 µm: kept;
- a coefficient set, read back and moved with a copy of the assembly by its key.

### Model glass

Marking a glass **V** turns it into a *model glass*: its nd and Vd alone, its index from a two-term Cauchy fit through them, $$n(\lambda) = A + B/\lambda^2$$. A model glass can also be typed into the lens data as nd/Vd (1.62/60). While optimising, a model glass is kept on the glass map, within reach of a real glass (0.01 in nd counting as much as 1 in Vd). **Replace model glasses with the nearest real ones** puts the nearest catalogue glass from the glass makers in place of each; optimise again after to settle the design on them.

### Tolerance the design

The **Tolerance the design** tab asks how good the design will be as it is made. The design as solved is the nominal lens; each tolerance changes it as a maker might, nothing re-solved but the compensator:

| tolerance | ± | what it changes |
|---|---|---|
| Radius | fringes | each lens surface's sag at its clear radius, by this many fringes at 632.8 nm (λ/2 each): the sphere with that sag, more or less curved |
| Thickness and air gaps | mm | every lens's thickness and every gap between parts |
| Lens decentre | mm | each lens moved across the axis, in x and in y |
| Lens tilt | arcmin | each lens tilted about its first vertex, about x and about y |
| Glass index | Δn | each glass's index at every wavelength |
| Abbe number | % | each glass's dispersion about the d line, divided by $$1 + \delta$$ |
| Surface irregularity | fringes | each lens surface's form error beyond its radius, off unless turned on: $$a(r^4 - h^2 r^2)$$, no sag at the clear radius $$h$$ or on the axis, its peak to valley $$a h^4/4$$ the fringes' $$N\lambda/2$$ |

A decentred or tilted lens is traced exactly: the lens engine carries each of its surfaces in its own moved frame, the ray taken into that frame, met and refracted there, and taken back.

The **criterion** is the merit function's image term: the RMS spot (or RMS wavefront error) over every field and wavelength, as set in Merit. The **compensator**, unless turned off, refocuses the image plane for each build: the spot's square is exactly a parabola in the focus, so three trials find the best focus, and once more about it settles it.

- **Sensitivity** sets each tolerance alone at its two limits and gives the change in the criterion from nominal, worst first, and the criterion expected over the builds, the tolerances' effects on its square added: $$c^2 \approx c_0^2 + \sum_i k\,\tfrac12\left[(c_i^{+})^2 + (c_i^{-})^2 - 2c_0^2\right]$$, $$k = 1/3$$ for tolerances uniform within their limits, $$1/4$$ for normal ones with the limit at two deviations.
- **Monte Carlo** builds the lens again and again, every tolerance at random (uniform within its limits, or normal with the limit at two standard deviations, cut there), each build from its own seed so a run repeats however it is cut up; and gives the spread of the criterion: its mean and deviation, its best and worst, the criterion 50%, 80%, 90% and 98% of builds are at least as good as, a histogram, and how far each build had to be refocused.

Both run in the background worker, a batch at a time, and can be stopped. The tolerances, the compensator and Monte Carlo's settings are kept with the design; the results are kept while the workspace is open, and say so when the design has changed since.

**Checked against.**
- a decentred surface traced in its own frame against the centred one with the light moved across: the same rays, to 10⁻¹²;
- a plate tilted 10°: a ray along the axis leaves parallel, shifted by $$t\sin\alpha\left(1 - \cos\alpha/\sqrt{n^2 - \sin^2\alpha}\right)$$;
- a radius's fringes against the sag they make, and an index change against the lensmaker's equation;
- the compensator against a fine scan of the focus;
- a round system's decentres and tilts alike in x and y and at either limit;
- Monte Carlo's mean square criterion over a thousand builds against the sensitivities' estimate, within four standard errors.

### Drawings

The **Drawings** tab gives each lens (and window) of the design a drawing on an A4 sheet, landscape, in the manner of ISO 10110: on the left the lens in section, to a standard scale, the light from the left, with its diameter, the centre thickness of each glass (with its tolerance) and its edge thickness at the full diameter (in brackets: a reference dimension), each surface's clear aperture marked where it is less than the diameter; on the right a table of its surfaces and its glass:

| row | from |
|---|---|
| Radius R | the surface's radius, CX or CC as the glass sees it (convex or concave) |
| tolerance | the radius's own, from the surface form: the spheres whose sags at the clear radius differ by the fringes' $$N\lambda/2$$, the larger change (about $$N\lambda R^2/h^2$$) |
| Clear aperture | the surface's clear diameter |
| Conic, Aspheric | where the surface has them; the aspheric terms in the notes |
| Aspheric departure | the aspheric terms' sag at the clear aperture, where the surface has them |
| 3/ Surface form | $$3/A(B)$$: $$A$$ fringes of power at 632.8 nm over the clear aperture (Radius in the tolerance settings), $$B$$ fringes of irregularity (Surface irregularity), each "-" where not set |
| 4/ Centring | the surface's tilt in arcminutes: the lens tilt tolerance plus the decentre tolerance over the surface's radius |
| Material, Index nd, Abbe number Vd | the glass, with the index and Abbe number tolerances |
| Centre and edge thickness | the glass's, the edge thickness from the two surfaces' sags at the full diameter |

A lens whose glass is less than half a millimetre thick at its edge, or a surface whose sphere does not reach the full diameter, is noted. A title block gives the lens's name and its assembly, the scale, the date and the bench. **Save as SVG** and **Save as PDF** save the drawing shown; **All as one PDF** saves every lens of the design, a sheet each. Both are vector: lines stay lines at any zoom, and the text is text.

**Checked against.** A biconvex lens's edge thickness against its sags worked by hand; each face's CX or CC for biconvex, plano-concave and cemented lenses; the radius tolerance against the tolerancing's own change of radius for the same fringes.

### The design report

**Report (PDF)**, at the top of the workspace, writes the whole design as one PDF to hand on: A4 pages of its design conditions and first-order figures, its layout (folded as on the bench) with the spot sizes at each field; its prescription, solves and variables, aspheric terms and Seidel sums surface by surface; its spot diagrams, field curvature, distortion and MTF; its tolerance settings, with the last Sensitivity and Monte Carlo runs if they were made on the design as it now is; and, last, each lens's drawing. Everything in it is drawn as vectors in the standard PDF fonts.

### The bench's own tools

**Optimise the bench** and **Tolerance the bench** (the Sweeps menu) work on the whole bench, its positions, alignment and coupling, over the swept values. A lens design is optimised in its workspace, against its own conditions.

### Analyses

The **Analyses** tab shows the design from each side a lens designer looks at it, chosen by a row of chips, each for a field (and a wavelength) picked beside it. Every view comes from the lens engine's real rays, aimed through the stop and stopped by the clear radii (so vignetting shows), and is worked out when shown. Every plot keeps one colour for each wavelength, in the order the conditions list them, draws tangential solid and sagittal dashed, carries a legend, reads out its values under the pointer, and saves its numbers as CSV.

- **Spot diagram:** where a square grid of rays across the pupil lands on the image plane, each wavelength in its colour, every field in a box of one scale, about the centroid of all the wavelengths; with the RMS radius and the largest radius about that centroid, and the Airy disc (radius $$1.22\,\lambda F$$, $$F = 1/(2\,\mathrm{NA})$$ the working F-number in image space).
- **Ray fans:** each ray's miss on the image plane from the primary wavelength's chief ray, along the pupil's y diameter (tangential, in the plane of the fields) and its x diameter (sagittal).
- **OPD fans:** the wavefront error along the same diameters, in waves, each wavelength about its own chief ray.
- **Field curvature and distortion:** for fields from the axis to the largest, where the tangential and sagittal foci lie along the axis, from the image plane, each found where rays a thousandth of the pupil either side of the chief ray cross it; and the distortion, the real chief ray's height against the paraxial chief ray's, $$100\,(y - y_p)/y_p$$ per cent.
- **Longitudinal and colour:** where a ray from each height in the pupil, on the axis, crosses the axis, from the primary wavelength's paraxial focus; and the paraxial focus over the wavelengths (10% below the shortest to 10% above the longest).
- **Wavefront:** the wavefront error over the pupil, on a 48 × 48 grid, its piston taken out, with its RMS and peak to valley, and its first 16 fringe Zernike terms fitted by least squares.
- **PSF:** the point spread function at one wavelength, the squared modulus of the Fourier transform of the pupil function $$A\,e^{2\pi i W}$$ (64 points across the pupil, padded four times), its pixel $$\lambda F \cdot 64/256$$; the **Strehl ratio**, its peak against that of the same pupil without aberration; and the **encircled energy** about its centroid beside the diffraction limit's. When the spot is large against the PSF's window the aberrations are too large for it, and it says so.
- **MTF:** the diffraction MTF, tangential and sagittal, from the pupil function's autocorrelation, $$\mathrm{OTF}(s) = \sum U(p)\,U^*(p - s) / \sum |U|^2$$, a shift of the whole diameter being the cutoff $$1/(\lambda F)$$; over the wavelengths, each one's OTF at the same frequency in cycles per mm, weighted; with the diffraction limit of the same pupil.
- **Seidel:** the third-order sums, below.

**Checked against.**
- a perfect lens (the ellipsoid that images into glass without aberration): no spot; its MTF the round pupil's $$\tfrac{2}{\pi}\left(\arccos v - v\sqrt{1-v^2}\right)$$ to within 0.003; a Strehl ratio of 1; 83.8% of the energy within the first dark ring;
- that lens out of focus by a twentieth of a wave RMS: the defocus Zernike term $$\delta\,\mathrm{NA}^2/(4n'\lambda)$$, every other term but piston and spherical nil, and a Strehl ratio within 0.001 of Maréchal's $$e^{-(2\pi\sigma)^2}$$;
- a sphere with its stop at its centre: its tangential and sagittal foci together on a sphere about the centre, $$(s' - R)(\cos\theta - 1)$$ from the image plane, and no distortion;
- a singlet: its longitudinal aberration four times as large at twice the pupil height, as third order has it, and its fans and spots as symmetric as a round system's are.

#### Third-order (Seidel) sums

The third-order (Seidel) aberrations, surface by surface and summed, from two paraxial rays: the marginal ray (height the entrance pupil's radius, parallel to the axis) and the chief ray (through the entrance pupil's centre at the largest field). At each surface, with $$A = n i$$ and $$\bar A = n \bar\imath$$ the two rays' refraction invariants, $$\Delta(u/n)$$ the change in $$u/n$$ across it and $$H$$ the Lagrange invariant:

$$S_I = -A^2 y\,\Delta(u/n), \quad S_{II} = -A\bar A y\,\Delta(u/n), \quad S_{III} = -\bar A^2 y\,\Delta(u/n), \quad S_{IV} = -H^2 c\,\Delta(1/n),$$

$$S_V = -\bar A^3 y\,\Delta(1/n^2) + c\,\Delta(1/n)\,\bar A\bar y\,(\bar A y + H),$$

the last the same as $$(\bar A/A)(S_{III}+S_{IV})$$ but defined where $$A = 0$$. The colour terms are $$C_L = A y\,\Delta(\delta n/n)$$ and $$C_T = \bar A y\,\Delta(\delta n/n)$$, $$\delta n$$ the index at the shortest wavelength less that at the longest. An aspheric surface adds $$8(n'-n)G y^4$$ to $$S_I$$, $$G$$ its fourth-order sag beyond the sphere of its paraxial curvature, and the same times $$\bar y/y$$, $$(\bar y/y)^2$$ and $$(\bar y/y)^3$$ to $$S_{II}$$, $$S_{III}$$ and $$S_V$$. They are wavefront coefficients in mm, in the usual sign convention: an uncorrected positive singlet has $$S_I > 0$$.

**Checked against.**
- a published Cooke triplet (f 50 mm, f/5, fields to 20°), typed into the lens data cell by cell: its focal length and Seidel sums agree with an independent program's to 10⁻¹⁰;
- the real rays in the third-order limit: $$S_I/8$$ is the edge ray's wavefront error at a small pupil, and $$S_V$$ the chief ray's distortion at a small field;
- the ellipsoid that images perfectly, whose $$S_I$$ is 0.

### On the bench

An assembly's panel compares the light the bench sends it with its design conditions. Used outside them (a field beyond its largest, a wavelength outside its range, or a beam wider than its entrance pupil), it says so and how; within them, it says that too.

## Lens files

**File › Import a lens (.zmx)** reads a file of several lenses (air between them), or one with a stop of its own, as an assembly of its parts, with the file's aperture, fields and wavelengths as its conditions. **Export as a lens file** from an assembly's panel writes its prescription with the stop where it is, and its conditions (an object at a finite distance as the object surface's thickness, its fields as object heights, its aperture as the entrance pupil it gives); a file with a finite object reads back the same way. A folded assembly, or one with a part tilted or decentred, is not written (it would need coordinate breaks): the export says so. Coatings are not written.

## In a .jekray file

Assemblies are listed under `"assemblies"`: each `{"id", "name", "ref", "rev", "cond", "design"}`, its parts carrying its `id` as their `"group"`. `ref` is the part whose facing sets the axis and `rev` is true when the light runs against it. `design`, when it has one, holds the image distance (`"image"`), the variables (`"vars"`), the solves (`"solves"`), the pickups (`"pickups"`), the merit function (`"merit"`: `"crit"`, `"rings"`, `"arms"`, `"bounds"` and the added terms `"ops"`) and the tolerances (`"tol"`: each kind `"rad"`, `"thk"`, `"dec"`, `"tilt"`, `"ind"`, `"abbe"`, `"irr"` as `{"on", "v"}`, with `"comp"`, `"dist"`, `"trials"` and `"seed"`), each value named by a key: `"R:<part id>.<surface>"` (a radius), `"k:…"` (a conic), `"t:…"` (the gap after that surface), `"g:…"` (the glass after it), `"a4:…"` to `"a16:…"` (its aspheric terms), `"T:…"` and `"D:…"` (a part's tilt and decentre, on its first surface) or `"t:image"`. The merit's `"bounds"` are `"glassMin"`, `"glassMax"`, `"edgeMin"`, `"airMin"`, `"aspMax"` and `"slopeMax"`. A model glass is a material `{"glass": "Model", "nd", "vd"}`.
