---
layout: docs
title: Lens design
permalink: /jek/docs/jekray/lens-design/
description: Assemblies and lens design in JEKray. Lenses, mirrors and stops on one axis are made one assembly, designed together in the lens design workspace (conditions, layout, lens data, solves, pickups, merit, optimisation, analyses, tolerancing, drawings and a PDF report), then used on the bench as the parts they are.
---

<p class="dx-lead">An assembly is a set of lenses, mirrors and stops on one axis that are designed together: a doublet, a triplet, an objective, a folded telescope. Its parts stay the bench's own parts, traced as they always are, so making one changes nothing the light does. What it adds is the view a lens designer works in: the parts read as one sequence of surfaces, with the conditions the design is for.</p>

## Making an assembly

**One part.** A lens, mirror or window on its own has **Design as a lens…** in its panel (and its right-click menu): it is made an assembly of one and opened in the design workspace at once, to design, optimise and add to (Insert a singlet, Insert a surface) there.

**Several parts.**
Select the lenses, mirrors and stops (Shift- or Ctrl-click, or drag a box round them), then **Make an assembly** in their panel or from the right-click menu. They must be:

- lenses round about their axes (not cylindrical), round irises, windows, or mirrors (flat or curved, whole: not off-axis segments or film beam splitters);
- on one axis, which each mirror folds: each part the next one along it, within its own half-width of it, at one height and upright;
- facing along it, a lens either way round, tilted from it by up to 30°; a mirror facing the light it reflects, at any angle;
- not overlapping.

A lens off the axis by less than its half-width is *decentred*, one turned from it *tilted*: both are part of the design, traced as they stand (below).

If they are not, the panel says which part is in the way and why. The light is taken to run away from a source on the axis; with none on it, the way most of the lenses face.

An assembly is picked and moved as one, drawn with a dashed outline (one round each straight run of a folded one) and its name. Its panel places it on the bench by its own **X** and **Y** (its first vertex, where its axis meets its first surface), **Angle** (the way its axis runs from there) and **Height z** (of all its parts): set, they move or turn every part together about that vertex, so the design itself is unchanged. Ctrl-click one of its parts to edit that part alone; if a part is then moved off the axis, the outline turns red and the panel says so. **Split into parts** gives back the separate lenses and stops, where they are.

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

**Out of the plane.** A lens or a window may also be tilted and decentred out of the plane of the fields, up or down on the bench. In the lens data these are the column's second pair, **° up** and **mm up**, typed, varied, solved or picked up like the first. On the bench they are the part's **Tip** and its height (**z**) from the assembly's axis. The axis has a height of its own, the assembly's **Height z** in its panel, which moves every part up or down together. A part may sit off the axis by less than its own half-width, and a lens or window may be tipped by up to 30°, as it may be turned across. A mirror folds in the bench's plane only, so it is not tipped.

The optimiser may then tilt a lens to balance an off-axis aberration (a field to one side only gives it a reason to), or decentre one to centre an image. Note that a tilt with a decentre turns a lens about a point off its vertex; about the centre of a surface's sphere that surface does not change at all, so a plano-convex lens can be turned about its sphere's centre almost for free. Give such a pair a reason to be one value or the other (a pickup, a boundary of the merit, or only one of them varied).

**Checked against.**
- A lens tilted 3° and moved 0.4 mm in the prescription, written to the bench and read back: every surface's tilt and decentre and every gap the same to 10⁻⁹.
- The same out of the plane (2.5° up, 0.35 mm up, with −1° across): its tip and height on the bench as set (the height the decentre plus half its thickness times the sine of the tip), and read back the same.
- A fold mirror turned 5°: the axis after it 10° round.
- A lens knocked 0.3 mm across and 2° round, or 0.25 mm up and 1.5° out of the plane, its tilt, decentre and image distance varied on the axis: its spot as small as the centred lens's at its best focus.
- Two lenses tipped and raised (or lowered, one facing back): each of the bench's own rays meets the sensor where the lens engine's ray does, with the same optical path, to 10⁻⁹ mm.

The lens engine walks the axis from the first vertex, each surface in its own frame: its vertex, and its axes turned by its tilt from the axis there, which a mirror reflects for all after it. A ray is taken into each surface's frame, met and refracted (or reflected) there, and taken back. The image plane is square to the axis after the last surface, and every analysis is read in its frame. First-order figures and Seidel sums are those of the system unfolded: a mirror reflects a paraxial ray as $$u' = u + 2cy$$, and after each mirror the sense of the index, the curvatures and the gaps turns over, so the sums keep their usual signs.

A folded or tilted assembly is drawn folded in the layout, as on the bench. Its parts are written back to the bench along the folded axis, each mirror turned to keep the fold. A mirror cannot be removed in the lens data (split the assembly to take it out); its radius, conic and aspheric terms can be set, varied, solved and picked up as a lens surface's can. A mirror's aspheric terms (A4 to A16, **Add aspheric terms** in its panel or **+ A** in the lens data) add to its conic's sag with its radius's sign, so in the prescription, where its radius is read the other way, they take the other sign too; a lens file of a mirror alone writes them as an even asphere and reads them back.

**Checked against.** A concave sphere at f/2.5 (radius 200 mm), its A4 to A8 varied: its spot on the axis a hundredth of the sphere's, as a paraboloid's, and its A4 within 2% of the paraboloid's sag less the sphere's, $$-1/(8R^3)$$; a concave fold mirror with a conic and A4 and A6 between two lenses: each of the bench's own rays meets the sensor where the lens engine's ray does, to 10⁻⁹ mm.

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
- **Terms added to it,** each with a target and a weight (the term is $$\sqrt{w}\,(v - t)$$):
  - first order, paraxial: the focal length, the back focal length, the image distance (of a finite object), the magnification, the working F-number, the NA in image space, the exit pupil's distance before the image, the total track;
  - from real rays at a field picked beside the term: the chief ray's height on the image, the chief ray's angle at the image (0 for an image-space telecentric design), and the height on the image of the ray through a point of the pupil's y diameter ($$-1$$ to $$1$$);
  - the diffraction **MTF** at a field and a frequency (cycles/mm) set beside the term: tangential, sagittal, or the mean of the two, over the wavelengths as the MTF view weights them (its target 1, to raise it). It is worked out from 32 points across the pupil at the two whole shifts of the pupil function either side of the frequency, so it costs a few hundred rays a wavelength;
  - the distortion at the largest field (from the real chief ray, %), and any Seidel sum.
  A ray that can't be traced counts as 1000 off its target.
- **Boundaries** every design keeps to: glass at least (and, if set, at most) so thick at its centre and so thick at its edge, and air between lenses at least so wide at the centre and the edge. Each counts only while it is broken, as ten times its overshoot in mm, so it overrides the rest. A stop may sit against a lens. Two more hold a lens's aspheric terms to what can be made: their **departure** (the sag they add to the surface, anywhere over its clear radius; 0.5 mm unless set, 0 for none), counted against the limit itself so a few micrometres hold as well as a millimetre; and the departure's **slope** in degrees (no limit unless set).

**Checked against.** Each term's value against the lens engine's own; the MTF term against the MTF view's curve (to 10⁻⁹) and, for a perfect paraboloid, the round pupil's $$\tfrac{2}{\pi}(\arccos v - v\sqrt{1-v^2})$$ to 0.003; a singlet at f/2.6 asked for the most MTF at 20 cycles/mm, its image distance free, raising it from 0.17 at the paraxial focus to 0.37, 0.38 mm nearer the lens, where a little either way is worse; a singlet made telecentric in image space (the chief ray's angle at the image at 0, the stop's distance varied) puts its stop 47.51 mm before the lens, at its front focal point (47.54 mm, from its focal length and front principal plane; the real chief ray at 1° bends a little more than the paraxial one).

The merit is $$\sqrt{\sum r_i^2 / W}$$, $$W$$ one for the image plus the added terms' weights. The table gives each term's value now and its share of the merit. Rays are traced through every surface whatever its clear radius, as the lenses are sized to the light afterwards.

### Configurations

The **Configurations** tab holds one design in several states: a zoom lens at each of its focal lengths, a lens refocused for nearer objects, a relay at two magnifications. **Make configurations** gives two, the design as it is and a copy; **Add a configuration** copies the one shown. Each has a name and a weight in the merit function.

Choose the values that differ between them in the list under the table and **Make it differ**: any radius, thickness or air space, conic, aspheric term, tilt or decentre, or the image distance. Each configuration starts from the value it has now and keeps its own; everything else is shared. With the object at a distance (in the design conditions), each configuration also has its own object distance. The **×** beside a value makes it shared again, at the value shown.

One configuration is shown at a time, chosen in the workspace's header or with **Show** in the table. It is the one on the bench, in the layout and lens data (where a value that differs is marked at its left edge), and in the analyses, drawings, tolerancing and the lens file export. Showing another puts its values on the bench and its object distance in the conditions. The table also gives each configuration's focal length, working F-number, image height and total track.

- **Solves** are worked out in each configuration: an image distance solved for the paraxial focus is each configuration's own focus.
- **The merit function** is the weighted mean of each configuration's: its image term, its boundaries, and the terms added in the Merit tab. Each added term is measured **in every configuration** unless it is set for one (a zoom's focal length target in each position).
- **The optimiser** varies a value marked V once for all the configurations if it is shared, and separately in each if it differs. A zoom's moving spacings are found for each position while its radii serve them all.
- **Tolerancing** is of the configuration shown.

**Checked against.**
- Two identical configurations measure exactly as the design alone.
- A singlet refocused for objects at 200 and 1000 mm holds each configuration's image at its own paraxial focus, which is checked against a separate paraxial trace.
- Two singlets 100 mm in focal length, their spacing differing between two configurations: one optimisation reaches 60 mm and 75 mm focal length (each within 0.05 mm), the wider spacing giving the longer focal length, with the radii unchanged.

### Optimise the design

Mark the values the optimiser may change with **V** in the lens data: radii, thicknesses, conics and glasses. Solves and pickups are worked out again at every step, so a radius solved for an F-number keeps the focal length while the others change.

- **Damped least squares** goes downhill from where the design is to the nearest minimum. Each cycle finds how every term changes with every variable (by finite differences), and takes the step $$(J^\mathsf{T}J + \lambda\,\mathrm{diag}\,J^\mathsf{T}J)\,\delta = -J^\mathsf{T}r$$, a radius worked in its curvature so it can pass through flat. A step is shortened if it would take any variable further than its reach (a sixth of a radius's curvature, 30% of a thickness, 0.5 of a conic, 0.02 in a glass's nd or 3 in its Vd), and that reach and $$\lambda$$ shrink while steps fail and grow back when they help. It stops when no step makes the merit smaller.
- **Global search** looks for a better minimum than the nearest: it starts again and again from the best design so far, each variable shaken (radii by about 30% of their curvature, thicknesses by about 30%, conics by 0.3, glasses along nd and Vd), takes each start downhill, and keeps what is better. It carries on until stopped.

Both run in the page's background worker, a few cycles or trials at a time, and the design (and its parts on the bench) changes as they go. **Undo** takes it all back. Changing the design by hand stops a run.

**Limits on the variables.** Under **Limits on the variables** in the Optimise tab, each value marked V has a least and a greatest the optimiser may take it to, either or both, in the units the lens data shows (radii, thicknesses, gaps, the image distance and decentres in mm, tilts in degrees, a conic, a model glass's nd and Vd). Every method keeps to them: a step that would go past one stops at it, a global search's shaken starts are brought back inside, and a design started outside is brought to the nearest limit first. A value sitting on a limit is marked in the table. A radius is varied as its curvature, so a radius limited keeps the sign of its limits: between two of one sign, or one alone on its own side of flat (at least 20: from 20 out to flat; at most -20: from -20 out to flat); two of opposite signs are refused, since a radius between them passes through flat. Aspheric, freeform, phase and gradient terms, and values each configuration has its own of, take no limits. The limits are saved with the design.

**Designs kept.** A global search keeps the ten best distinct designs it reaches, best first, not only the best: a design a little worse may be easier to make, or better where the merit function does not look. Two designs are the same when every variable is within a part in 10³ (an optimiser reaching one minimum twice, not quite to its bottom, keeps it once). They are listed under **Designs kept**, each with its merit when kept, where it came from and its first values, and are saved with the design. **Use** puts one back, its variables' values as they were and the rest of the design as it is now; Undo takes them out again. **Keep this design** adds the design as it is now (to come back to after trying something), and **Remove** and **Clear the list** tidy it. A design's merit is the one it had when kept, under the merit function then; one kept with other variables than now puts back those that still are.

**Checked against.**
- a singlet bent for least spherical aberration: the shape the third-order closed form gives, $$(R_2+R_1)/(R_2-R_1) = 2(n^2-1)/(n+2)$$, and the bottom of a fine scan of its merit;
- a Cooke triplet with its radii spoilt by up to 30%: optimised back to at least as good as the published design, its focal length kept;
- a cemented doublet of one glass: its two glasses varied make it an achromat, crown in front of flint;
- a singlet whose best bending is out of bounds: optimised, its front radius ends exactly on its limit, the focal length still met, and nothing a little further inside does better; a global search's designs all inside their limits;
- a global search on a triplet: the designs it keeps are distinct, the best is its result, and each put back has the merit it was kept with, to 10⁻⁹; they come back from a saved file.

### Aspheric surfaces

An **asphere**'s surface may carry even aspheric terms on top of its conic (a plain lens's surfaces are spheres: only an asphere, from the parts as **Asphere**, has a conic and aspheric terms, in its panel and in the lens data; a lens from an older file that has them is an asphere), its sag

$$z(r) = \frac{c r^2}{1 + \sqrt{1 - (1 + k) c^2 r^2}} + A_4 r^4 + A_6 r^6 + \dots + A_{16} r^{16}.$$

**+ A** beside a lens surface's name opens a row of its terms under it: A4 first, **Add A6** and so on to A16, **Remove** taking the last off. Each is typed (in mm to the power of one less than its order), marked **V** for the optimiser, or picked up from the same term of another surface; a surface's terms set on the bench (a lens's panel, Add aspheric terms) show here too, and the other way round.

The optimiser varies each term as the sag it adds at the surface's clear radius, $$A_n h^n$$ in mm, so terms whose raw values differ by many orders of magnitude take steps of a like size. Keep the departure and slope boundaries in the merit function (above) to keep what it finds makeable; use as few terms as do the job, starting from A4.

The Seidel sums carry a surface's fourth-order term (its $$A_4$$ and its conic) as a third-order aberration; the higher terms are in the real rays, and so in every analysis. Its drawing gives the terms in its notes and the departure at its clear aperture; a lens file writes them as an even asphere.

**Checked against.**
- a plano-convex N-BK7 lens of 50 mm at f/2, its curved side to the light: A4 to A10 on that side, optimised, take its RMS spot from 497 µm to 0.01 µm, against an Airy radius of 1.4 µm;
- the same with the departure kept within 20 µm: kept;
- a coefficient set, read back and moved with a copy of the assembly by its key.

### Freeform surfaces

An asphere's surface, or a mirror, can also be a **freeform**: XY polynomial terms added to its sag,

$$z \mathrel{+}= \sum c_{mn}\, x^m y^n,$$

with x up, out of the plane of the fields, and y across it in that plane. Only even powers of x are allowed: the surface stays mirror-symmetric about the bench's plane, so light in the plane stays in it. The fourteen terms run from second to sixth order: x², y², x²y, y³, x⁴, x²y², y⁴, x⁴y, x²y³, y⁵, x⁶, x⁴y², x²y⁴, y⁶.

**+ XY** beside an asphere's or a mirror's surface in the lens data opens its freeform row. Terms are added from its list and taken off with their **×**, and each is typed, marked **V**, solved or picked up like any other value. The optimiser varies each one as the sag it adds at the clear radius. On the bench, the part's panel lists its terms under **Add a freeform term…**. Unequal x² and y² terms make a toroid; odd powers of y tilt and bend the surface across the plane. The bench's trace and the lens engine both trace a freeform exactly, out of the plane as well as in it.

Some things don't see a freeform: the paraxial figures and Seidel sums (only its y² term counts there, as curvature in the plane of the fields), the lens file export (which warns), the 3D view of a lens (drawn round, from its profile in the plane), and its drawing (a section in the plane, with a note). Like a tilt, a freeform's effect is not paraxial, so an image distance solved at the paraxial focus doesn't follow it: leave the image distance free, marked **V**, when optimising one.

**Checked against.**
- A ray through a freeform face: met where the sag says, and refracted by Snell's law about the surface's normal from the terms' slope, to 10⁻¹².
- A freeform asphere facing the light and facing back, and a freeform concave fold mirror: each of the bench's own rays, in the plane and out of it, meets the sensor where the lens engine's ray does, with the same optical path, to 10⁻⁹ mm.
- A concave mirror (radius 400 mm, f/10) turned 10° from its axis: its spot at best focus 0.110 mm, mostly astigmatism. With its x² and y² terms varied (a toroid), the spot falls to 0.018 mm. That is the coma left, near θf/(16N²) = 0.022 mm, which a toroid cannot take out.

### Cylindrical lenses

A cylindrical lens can be part of an assembly, curved in the plane of the fields or out of it as its **Shape** sets. In the lens data its surfaces are marked **cyl ⟂** (curved in the plane) or **cyl ↕** (curved out of it). Its radius is the radius of that curve, and like any value it can be typed, varied, solved or picked up. A cylinder rolled about its own axis, so that its power lies between the two, can't be in an assembly.

The trace of a cylinder is exact in both directions. The first-order figures, the Seidel sums, the layout and the drawings are of the plane of the fields. There, a cylinder curved out of the plane is flat and has no power, so a design's focal length is its focal length in the plane. For a toroid, curved one way in the plane and another out of it, give an asphere or a mirror unequal x² and y² freeform terms.

**Checked against.**
- A cylinder curved in the plane has the same focal length there as the round lens of its radii; one curved out of the plane has none.
- Two crossed cylinders whose line foci meet (focal lengths about 100 and 50 mm, the weaker 50 mm in front) bring a beam to a point, with a spot under a twentieth of the line focus that one alone gives.
- Cylinders curved in the plane and out of it, facing the light and facing back: each of the bench's own rays, in the plane and out of it, meets the sensor where the lens engine's ray does, to 10⁻⁹ mm.

### Diffractive surfaces

A **diffractive lens** (from the lens presets under **Add part**) can carry a phase written on any of its faces: a kinoform, its zones blazed so the light goes into one order. The phase is

$$\phi(\rho) = c_1\rho^2 + c_2\rho^4 + c_3\rho^6 + c_4\rho^8$$

in radians, with ρ the height on the face in mm. In its order m the face adds $$m\lambda\phi/2\pi$$ of optical path, and bends a ray as a grating of that local pitch would: along the face, $$n'\mathbf{d}'_t = n\mathbf{d}_t + (m\lambda/2\pi)\nabla\phi$$, the rest of the direction made up on the far side. All the light is taken to go into order m; a blaze's efficiency in the other orders isn't modelled.

Its power, $$-m\lambda c_1/\pi$$, grows with the wavelength: the focal length of a diffractive lens goes as 1/λ. That is the other way to glass (an Abbe number of −3.45 over the F, d and C lines), so a weak diffractive face can cancel a refracting lens's colour. The preset is such a hybrid achromat: a plano-convex N-BK7 lens, f = 50 mm, whose flat face carries the phase that brings the F and C lines to one focus.

**+ φ** beside a diffractive lens's surface in the lens data opens its phase row: ρ², then ρ⁴, ρ⁶ and ρ⁸ as they are added, each typed, marked **V**, solved or picked up like any other value. The optimiser varies each one as the waves it adds at the clear radius. On the bench the lens's panel has **Diffraction order** and, under each surface, its phase terms and **Add a diffractive phase**. A diffractive face is drawn on the bench as a broken line along its substrate.

The bench's trace, the diffracted field and the lens engine all trace a diffractive face exactly, in the plane and out of it, in its order. The paraxial figures take its power at each wavelength. The Seidel sums take it as a layer of no thickness and very high index whose shape carries the phase (the Sweatt model), so its spherical aberration and its axial and lateral colour are counted. The lens drawing gives the phase, the number of zones to the clear radius and the width of the last; the lens file export leaves the phase out, and warns.

**Checked against.**
- A flat plate whose face carries $$c_1 = -\pi/(\lambda f)$$: its focal length is f = 100 mm exactly, f/2 in order 2, and f × 587.56/λ at the F and C lines.
- Its spherical aberration at f/5: the traced path from the pupil's edge to its centre, at the paraxial focus, is −SI/8 to within 1 %. With the fourth-order term of a perfect lens's phase, $$c_2 = \pi/(4\lambda f^3)$$, SI is 0 and the path left is a hundredth.
- A plano-convex N-BK7 singlet (f = 50 mm, F and C foci 0.76 mm apart) with its flat face's ρ² term varied to take Seidel's axial colour out: the F and C foci then meet, and the term is the one found on its own by bisection on those two foci, to 0.01.
- Two diffractive lenses, one facing the light and facing back, the other tipped 2° and raised, in orders 1 and 2: each of the bench's own rays, in the plane and out of it, meets the sensor where the lens engine's ray does, with the same optical path, to 10⁻⁹ mm.

### Graded glass

A **graded lens** (the GRIN rod lens among the lens presets, or any lens made graded) can have glass whose index changes with the distance from its axis:

$$n(r) = n_g(\lambda) + g_2 r^2 + g_4 r^4 + g_6 r^6,$$

with $$n_g$$ the glass's own index and r in mm. A ray in it curves toward the higher index, along $$\mathrm{d}(n\,\mathbf{t})/\mathrm{d}s = \nabla n$$. It is traced by the fourth-order Runge–Kutta method in short steps (an eightieth of the part's diameter, 0.1 mm at most), with its optical path summed as it goes. At each face of the glass, Snell's law takes the index where the ray meets it. A rod whose index falls as a parabola, $$n_0(1 - Ar^2/2)$$, has $$g_2 = -n_0A/2$$: a ray in it swings about the axis with the pitch $$2\pi/\sqrt{A}$$. The preset is a quarter of its pitch long, so it brings a collimated beam to a point on its back face.

**+ n(r)** beside a graded lens's surface in the lens data opens a row for the glass after it: r², then r⁴ and r⁶ as they are added, each typed, marked **V**, solved or picked up like any other value. The optimiser varies each one as the index it adds at the clear radius. On the bench the lens's panel lists each glass's terms under **Grade this glass**.

The bench's rays, the lens engine's and the diffracted field all take the gradient. The field goes through the glass a slab at a time, each slab plain glass followed by a thin plate carrying the path the grading adds over it (the split-step method). The paraxial figures take the r² term's exact matrix. The Seidel sums carry their two rays through that matrix but leave out the third-order aberration the gradient itself adds, so for a graded design the traced spot, wavefront and MTF are the ones to trust. The lens file export writes the glass on its axis, and warns.

**Checked against.**
- Rods 4.82, 3 and 2 mm long, focusing ($$g_2 = -0.08545$$) and spreading ($$g_2 = 0.03$$): their focal lengths and back focal distances are the closed forms of the r² matrix, to 10⁻⁹.
- The GRIN rod lens preset brings rays from up to 0.2 mm off its axis to within a micron of it on its back face.
- With its r² term varied for a focal length of 2.5 mm, a 3 mm rod's term is the one bisection finds on the closed form, to 10⁻⁶ mm⁻².
- A curved graded lens (r² and r⁴ terms) facing the light and facing back, and a GRIN rod tipped 2° and raised: each of the bench's own rays, curving through the glass by the same steps in both, meets the sensor where the lens engine's ray does, with the same optical path, to 10⁻⁹ mm.
- A Gaussian beam (w₀ = 0.3 mm, its waist on the face) through the quarter-pitch rod: its field 5 mm past the back face is as wide as the rod's matrix says, to 1 %.

### Model glass

Marking a glass **V** turns it into a *model glass*: its nd and Vd alone, its index from a two-term Cauchy fit through them, $$n(\lambda) = A + B/\lambda^2$$. A model glass can also be typed into the lens data as nd/Vd (1.62/60). While optimising, a model glass is kept on the glass map, within reach of a real glass (0.01 in nd counting as much as 1 in Vd). **Replace model glasses with the nearest real ones** puts the nearest catalogue glass from the glass makers in place of each; optimise again after to settle the design on them. **Substitute glasses**, below, does better: it tries the real glasses round each one, optimising with each.

### Substitute glasses

A model glass says what glass would suit; **Substitute glasses**, the third method in **Optimise the design**, finds the real one. Each glass marked **V** is tried as the catalogue glasses nearest it on the glass map (0.01 in nd counting as much as 1 in Vd), from the makers ticked (Schott, Ohara, Hoya, CDGM, Sumita), as many as asked (12 unless set), each one that transmits at every wavelength of the design. With each candidate in its place, the rest of the design's variables are optimised again from where they are (twelve cycles of damped least squares), and its merit taken. When every candidate has been tried, the best goes in if it is better than the glass already there; a model glass is always replaced. The glasses are taken one after another, and the passes repeat (three at most) until one changes nothing, so a glass can walk across the map toward the glass that suits the design best. A table says what each glass was, what it is now, the merit and the best few tried. It runs in the background, and Undo takes the design back to where it started.

**Checked against.**
- an air-spaced doublet whose second glass is a model near F2, aimed at f 100 mm and no axial colour: the glass put in is the one that, tried on its own from the same start, optimises to the lowest merit, and it is a flint; the merit falls more than tenfold;
- a glass none of its candidates betters is kept.

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
| Surface wedge | arcmin | each lens surface tilted on its own about its vertex, about x and about y, off unless turned on: its lens's two faces no longer square to one axis, as a lens comes out wedged. Unlike a lens tilt, the rest of the lens stays where it was |

A decentred, tilted or wedged lens is traced exactly: the lens engine carries each of its surfaces in its own moved frame, the ray taken into that frame, met and refracted there, and taken back.

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
- Monte Carlo's mean square criterion over a thousand builds against the sensitivities' estimate, within four standard errors;
- a plano-convex lens with its flat back wedged by α: the image of a point on the axis moves by $$(n-1)\,\alpha\,\mathrm{BFL}$$, a thin prism's deviation, across the plane of the tilt and not along it, to 1%;
- a triplet's wedges out of the plane of its fields worsen its image alike either way; in that plane (its fields on one side) one way is better and the other worse, as a linear term makes them.

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
- **Ghosts:** light reflected by one surface and sent on again by an earlier one, below.

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

#### Ghosts

Every surface sends a little of the light back: bare glass about 4% (Fresnel's $$((n-n')/(n+n'))^2$$), a coating as much as it reflects (its stack worked out square to the surface, or the reflectance it is given). Light sent back by surface $$a$$ and on again by an earlier surface $$b$$ reaches the image as a ghost, carrying $$R_a R_b$$ of the light and focused somewhere else. **Ghosts** lists every such pair at the field chosen and the primary wavelength:

- **Reflects:** the two surfaces' reflectances;
- **Reaching the image:** $$R_a R_b$$ times the share of the pupil's rays that get through every clear radius on the ghost's way;
- **Focus:** where its paraxial marginal ray crosses the axis after its last surface, from the image plane;
- **RMS on the image:** its real rays' RMS radius there;
- **Against the image:** its irradiance on the image over the image's own, each its light spread evenly over a disc (the ghost's of radius $$\sqrt2$$ times its RMS radius; the image's the same, or the Airy disc if that is larger). For a point of light on the axis this is how bright the ghost's haze is against the point; for an extended scene it overstates the image's own irradiance, so read it as a ranking;
- **Focus inside:** where the ghost comes to a focus within the design (its paraxial marginal ray crossing the axis between two surfaces after the first reflection), and how far from the nearest surface, marked when it is within a millimetre. Light focused there, on a coating, a cement or in the glass, is concentrated: in a laser system it can damage it.

Choose a ghost and its rays are drawn in the layout, in magenta, and its spot on the image beside the image's own. The list saves as CSV.

Each ghost is traced as a design of its own, unfolded: forward to surface $$a$$, which reflects; back through the surfaces between, each met from behind (its sag the other way in the frame the light now runs in); $$b$$ reflects from behind; then on to the image as the design goes. The lens engine traces it exactly, each ray started where the design's own ray for that pupil point starts, so the stop, the aim and the vignetting are the design's. Ghosts are followed in a centred design without mirrors, tilts or decentres. Light that reflects more than twice, or goes through a lens's rim, is left to the bench: tick **Follow weak reflections (ghosts)** in the bench settings and the bench follows every reflection, any number of times and in any order.

**Checked against.**
- a singlet's one ghost: its focus and its height on the image against its paraxial matrices written out by hand (refraction, the gap, the back face as a mirror in the glass, the gap, the front face as a mirror met from behind, the gap, refraction out), to 10⁻⁹; its strength the product of the two faces' Fresnel reflectances, or a coating's reflectance in its place;
- the bench's own rays, in the triplet with ghosts followed on the bench: every ray of every ghost the lens engine traces to the sensor lands where the bench's twice-reflected ray from the same start does, to 10⁻¹² mm, on the axis and 6° off it. The few bench rays reflected twice that the engine has no ghost for (3% of them) went through a lens's rim.

### On the bench

**Locked as designed.** Leaving the design workspace locks its parts: their panels show their fields but don't take changes, so a careful design isn't changed by a stray click or keystroke. The padlock beside the part's name opens it (and closes it again); **Open lens design…** in the panel, or in the right-click menu, goes back to the design, where everything can be changed as before. Moving the assembly as a whole, from its own panel, is not locked.

An assembly's panel compares the light the bench sends it with its design conditions. Used outside them (a field beyond its largest, a wavelength outside its range, or a beam wider than its entrance pupil), it says so and how; within them, it says that too.

## Lens files

**File › Import a lens (.zmx)** reads a file of several lenses (air between them), or one with a stop of its own, as an assembly of its parts, with the file's aperture, fields and wavelengths as its conditions. **Export as a lens file** from an assembly's panel writes its prescription with the stop where it is, and its conditions (an object at a finite distance as the object surface's thickness, its fields as object heights, its aperture as the entrance pupil it gives); a file with a finite object reads back the same way. A folded assembly, or one with a part tilted or decentred, is not written (it would need coordinate breaks): the export says so. Coatings are not written.

## In a .jekray file

Assemblies are listed under `"assemblies"`: each `{"id", "name", "ref", "rev", "cond", "design"}`, its parts carrying its `id` as their `"group"`. `ref` is the part whose facing sets the axis and `rev` is true when the light runs against it. `design`, when it has one, holds the image distance (`"image"`), the variables (`"vars"`), the solves (`"solves"`), the pickups (`"pickups"`), the merit function (`"merit"`: `"crit"`, `"rings"`, `"arms"`, `"bounds"` and the added terms `"ops"`, each `{"op", "target", "weight"}` with a field index `"f"`, a pupil point `"p"` and a frequency `"v"` where the term needs them, and a configuration index `"c"` when it is measured in one configuration only) and the tolerances (`"tol"`: each kind `"rad"`, `"thk"`, `"dec"`, `"tilt"`, `"ind"`, `"abbe"`, `"irr"` as `{"on", "v"}`, with `"comp"`, `"dist"`, `"trials"` and `"seed"`), each value named by a key: `"R:<part id>.<surface>"` (a radius), `"k:…"` (a conic), `"t:…"` (the gap after that surface), `"g:…"` (the glass after it), `"a4:…"` to `"a16:…"` (its aspheric terms), `"f20:…"` to `"f06:…"` (its freeform terms), `"p2:…"` to `"p8:…"` (a diffractive face's phase terms, on ρ² to ρ⁸), `"n2:…"` to `"n6:…"` (a graded glass's terms on r² to r⁶, the glass after that surface), `"T:…"` and `"D:…"` (a part's tilt and decentre, on its first surface) or `"t:image"`. The merit's `"bounds"` are `"glassMin"`, `"glassMax"`, `"edgeMin"`, `"airMin"`, `"aspMax"` and `"slopeMax"`. A model glass is a material `{"glass": "Model", "nd", "vd"}`. A design with configurations has `"mc"`: `{"keys", "configs", "active"}`. `keys` lists the values that differ, and each configuration is `{"name", "w", "v", "obj"}`: its weight, its own value for each key, and, for an object at a distance, that distance. The parts on the bench hold the active configuration's values.
