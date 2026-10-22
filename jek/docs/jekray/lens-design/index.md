---
layout: docs
title: Optical designer
permalink: /jek/docs/jekray/lens-design/
description: Assemblies and the Optical designer in JEKray. Lenses, mirrors and stops on one axis are made one assembly and designed together in the Optical designer (conditions, element data, solves, pickups, merit, optimisation, analyses, tolerancing, drawings and a PDF report), then used on the bench as the parts they are.
---

<p class="dx-lead">An assembly is a set of lenses, mirrors and stops on one axis that are designed together: a doublet, a triplet, an objective, a folded telescope. Its parts stay the bench's own parts, traced as they always are, so making one changes nothing the light does. What it adds is the view a lens designer works in: the parts read as one sequence of surfaces, with the conditions the design is for.</p>

<p><strong>What needs JEKrayPro.</strong> Anyone can open the Optical designer, build and edit a design, and look at it through every analysis. The design work needs <a href="/jek/tools/jekray.html#pro">JEKrayPro</a> (a personal, Academic or team plan, or a university licence): the optimiser with its global search and glass substitution, tolerancing, the PDF report, lens drawings, and exporting the design as a lens file. Those buttons carry a <strong>Pro</strong> badge until you sign in with a plan. Saving a plot as PNG or CSV and the CAD export (.step, .stl) need only a free account, as every export does; they carry a <strong>Free account</strong> badge until you sign in. See the <a href="/jek/tools/jekray-licence.html">JEKray Licence</a>, section 3.</p>

## Making an assembly

**One part.** A lens, mirror or window on its own has **Design as an assembly…** in its panel, just under its name (and in its right-click menu). It is made an assembly of one and opened in the design workspace, where surfaces and singlets can be added to it.

**Several parts.** Select the lenses, mirrors and stops (Shift- or Ctrl-click, or drag a box round them), then **Make an assembly** in their panel or the right-click menu. They must be:

- lenses round about their axes (not cylindrical), round irises, windows, or whole mirrors (flat or curved; not off-axis segments or film beam splitters);
- on one axis, which each mirror folds: each part within its own half-width of it, at one height and upright;
- facing along it, a lens either way round and tilted from it by up to 30°, a mirror facing the light it reflects;
- not overlapping.

A lens off the axis by less than its half-width is *decentred*, one turned from it *tilted*: both are part of the design and traced as they stand. If the parts don't qualify, the panel says which is in the way and why. The light is taken to run away from a source on the axis, or, with none, the way most of the lenses face.

An assembly is picked and moved as one, drawn with a dashed outline and its name. Its panel places it by its **X** and **Y** (its first vertex), **Angle** (the way its axis runs) and **Height z**: these move or turn every part together, leaving the design unchanged. Ctrl-click a part to edit it alone; a part moved off the axis turns the outline red. **Split into parts** gives back the separate lenses and stops where they are.

**Starting from nothing.** **File › Open a workspace › Optical designer, new…** puts a starting assembly on the bench (a 10 mm stop and a biconvex N-BK7 singlet of about 50 mm focal length, designed for the F, d and C lines) and opens it in the workspace. **Optical designer, of the selection** opens the selected lenses and stops as one design, making them an assembly if they are not one already. The same menu opens the [RF designer](/jek/docs/jekray/rf/designer/) and the [coating workspace](/jek/docs/jekray/coating-design/). On **My benches**, **Open a workspace** makes a new cloud bench straight in the designer chosen. In the workspace, **Keep as a part…** saves the whole design by name in **My parts** or a team's **Team parts**.

## The prescription

Along the light, from the first surface's vertex, an assembly reads as a list of surfaces, each with:

| | |
|---|---|
| shape | radius R (or flat), conic k, the even terms a₂ r², A₄ r⁴, A₆ r⁶ …, and odd terms for an axicon-like surface |
| clear radius | the surface's own, else its lens's |
| gap to the next | the lens's thickness inside a part, the air between parts |
| material in that gap | the lens's glass, or air |

The stop is a flat surface in air with the iris's radius. A lens turned against the light is read face for face the other way round, each sag with the other sign. Changes to the prescription are written back to the parts: each shape to its surface, each gap to a lens's thickness or to the parts' places along the axis (the first surface stays put). A prescription written back unchanged moves nothing.

The panel gives the paraxial focal length and back focal distance at the primary wavelength, the number of surfaces, where the stop is, and the length from first to last surface.

## Folds, tilts and decentres

**Surfaces with holes, stacked surfaces and mirror coatings.** A lens surface has, beside its radius and conic, a **clear radius** (how far out it reaches; the lens's own radius unless typed) and a **hole radius** (inside it the surface is not there), and a **coating**: bare glass, an AR coating, a **mirror** (ideal, or aluminium, silver or gold with the metal's reflectance at each wavelength), a dielectric high reflector or the coating designer's. Light meeting a mirror coating reflects wholly and stays in the glass it came from. A surface given a thickness of **0** is **stacked** on the one before it: the two share a vertex and make one face, each applying between its hole and its clear radius, so a face can be a mirror-coated spot in the middle of a plain flat, or a mirror-coated annulus round a plain centre. A Mangin mirror is a lens whose back is mirror coated; a solid telescope is a block whose front is a flat with a hole and a mirror-coated spot stacked in it, and whose back is a concave mirror coat with a hole and a flat stacked in it. **Stack a surface** in the element data puts a flat, bare surface on the one selected, taking the centre of its face (half way out across it), the selected one holed to where it reaches.

For such a lens the designer works out the path the light takes (in through the annulus, off the back, off the spot, out through the centre), the paraxial way, and shows two tables. The **Surfaces** table lists each surface of each part once, in the part's own order (*Block 1*, *Block 2 (on 1)* for one stacked on the first), with its radius, thickness (*stacked* for a gap of 0), glass, coating, clear radius, hole and conic: all typed, varied, solved and picked up as usual, and written back to the part on the bench. A surface the light never meets (a spot the design's rays go round, or a layer behind a mirror coat when the light comes from the front) is listed as such, in grey, edited on the bench. Stacked surfaces of the same clear radius and hole are layers, met one after another (see [the lens](/jek/docs/jekray/free-space/lens/#holes-stacked-surfaces-and-mirror-coatings)). **The light's path** below it lists each meeting in the order the light makes them: what it meets, whether it refracts or reflects, how far it goes and in what, and what is clear and blocked at that meeting (the clear radius and the hole of the surface met, so the rays the real face would turn away are vignetted where it turns them). A face met more than once is listed again, its later rows linked to its first: edited there, it follows, of the other sign when met from the other side. An odd number of reflections sends the light back out the way it came, and the lens folds the axis as a mirror does. A lens saved before surfaces had holes and stacks (with a *Mirrored* zone on a face) opens as the surfaces the zone stood for, stacked.

**Mirrors.** A mirror is one reflecting surface, its glass **Mirror**. Its radius is read as the light meets it (a mirror concave to the light has a negative radius), and the axis folds where it meets the mirror. The gaps run on along the folded axis, counted surface to surface as if unfolded. A mirror's tilt is half the angle it turns the light through (45° for a right-angle fold); changing it turns the axis after it by twice as much, and the parts after it go round with it. A mirror cannot be removed in the element data (split the assembly instead), but its radius, conic and aspheric terms (A4 to A16) can be set, varied, solved and picked up like a lens surface's. A mirror folds in the bench plane only, so it is not tipped.

**Tilted and decentred lenses.** A lens or window carries its tilt (degrees, in the plane of the fields) and decentre (mm, across the axis) on its first surface, about its first vertex; its other surfaces turn with it. The element data shows a **Tilt, decentre** column whenever a design has either (**Tilts and decentres** shows it always). Each is typed there or set on the bench by turning or moving the part, and can be marked **V**, solved or picked up like any other value. A lens may also be tilted and decentred *out* of the plane, the column's second pair, **° up** and **mm up**: on the bench they are the part's **Tip** and its height from the assembly's axis. A part may sit off the axis by less than its half-width and be turned by up to 30° either way.

The optimiser may tilt a lens to balance an off-axis aberration, or decentre one to centre an image. A tilt with a decentre turns a lens about a point off its vertex, and about the centre of a surface's sphere that surface does not change at all, so give such a pair a reason to be one value or the other: a pickup, a boundary, or only one of them varied.

**How it is traced.** The lens engine walks the axis from the first vertex, each surface in its own frame (its vertex, and its axes turned by its tilt), which a mirror reflects for all after it. A ray is taken into each frame, met and refracted or reflected, and taken back. The image plane is square to the axis after the last surface. First-order figures and Seidel sums are those of the system unfolded: a mirror reflects a paraxial ray as $$u' = u + 2cy$$, and after each mirror the sense of the index, curvatures and gaps turns over, so the sums keep their usual signs. The layout draws the design folded, as on the bench. In tolerancing a mirror's tilt turns its face alone, as a mirror made a little out does: the axis after it stays where it was designed and the image moves by twice the tilt times the throw.

**Checked against.** Tilts, decentres, tips and heights written to the bench and read back to 10⁻⁹; a fold mirror turned 5° turning the axis 10°; a singlet with a 45° fold giving the same focal length, spots and wavefronts as unfolded; a concave sphere focusing at half its radius, a paraboloid and a Newtonian imaging a star to a point; a spherical mirror's $$S_I = 2y^4/|R|^3$$ from the Seidel sum and the real rays; a concave sphere at f/2.5 with A4 to A8 varied reaching a paraboloid's spot, its A4 within 2% of $$-1/(8R^3)$$; and, for lenses tilted, tipped and raised, with and without folds, every one of the bench's own rays meeting the sensor where the lens engine's does with the same optical path, to 10⁻⁹ mm.

## The lens engine

The bench's tracer follows light through everything on a bench; the lens engine follows rays through a prescription alone, as fast as it can (some 10⁵ aimed rays a second, in a background worker where the work is long). The design work below is built on it.

**Coordinates.** z runs along the axis from the first vertex, y across it in the bench plane (the meridional section, where the fields lie) and x out of it (sagittal). A field is the angle of the incoming light in the y–z plane, or, for an object at a distance, the height of a point on it.

**Surfaces.** Each is $$z = z_i + \text{sag}(\rho)$$, $$\rho$$ the distance from the axis, with the bench's own sag:

$$\text{sag}(\rho) = \frac{c\rho^2}{1+\sqrt{1-(1+k)c^2\rho^2}} + a_2\rho^2 + \sum_j A_{4+2j}\,\rho^{4+2j} + \sum_q o_q\,\rho^q$$

A ray meets a surface where Newton's method finds the root along it, and is refracted by Snell's law in vector form,

$$\mathbf{d}' = \mu\,\mathbf{d} + \left(\sqrt{1-\mu^2(1-\cos^2 i)} - \mu\cos i\right)\hat{\mathbf{n}}, \qquad \mu = n/n',$$

in three dimensions, so skew rays are traced as exactly as meridional ones. A ray landing outside a surface's clear radius is vignetted there; one that cannot refract is lost.

**First order.** Paraxial (y-nu) traces give the focal length and back focus, and the chief ray places the pupils; for a finite object, the image distance and magnification too. The aperture is the stop's own opening, or an entrance pupil diameter set for the design, the stop then opening to suit.

**Ray aiming.** Each ray is found that crosses the stop at the pupil point asked for, by Newton's method on where it starts, so the stop is filled exactly whatever the pupil aberrations before it. From infinity, rays start on a plane square to the incoming light through the entrance pupil's centre, so every ray of a field starts on one wavefront; from a finite object, at the object point.

**Wavefront error.** Each ray's optical path is measured to the reference sphere centred on the chief ray's image point and passing through where the chief ray crosses the exit pupil; its difference from the chief ray's, in waves, is the wavefront error. Pupils are sampled by rings at Gauss–Legendre radii with arms, or by a square grid.

**Checked against.** The bench's own tracer (the same rays land in the same place with the same path, to 10⁻⁹ mm); an ellipsoid of eccentricity 1/n, which images collimated light into glass perfectly (no spot, no wavefront error); a single sphere, where geometry gives the exact answer; makers' lens files (the focal lengths and back focal distances their pages state); and the symmetry of a round system.

## The design workspace

**Design…** in an assembly's panel, or a double-click on it, opens it on a page of its own. The bar names the bench and the assembly (its name can be edited there); **Back to the bench** (or Esc) returns. Nothing is copied: every change is written to the parts on the bench as it is made, so the bench is always the design, and Undo and Redo work in both places. A design started from nothing has **Place on a bench** instead: it adds a source for each field (collimated, as wide as the entrance pupil) and a screen at the image, then returns.

**File › Import an element (.zmx)…** with **Open it in the Optical designer** ticked reads a lens file as an assembly and opens it here.

### Design conditions

The left column holds what the design is for: the object, the aperture, the fields (up to 12, each with a weight) and the wavelengths (nm and weight, one primary, up to 12; **Visible (F, d, C)** sets the usual three). The stop opens to suit the entrance pupil these set, and its opening on the bench follows.

**The object** is at infinity (the fields are angles, in degrees) or **at a distance** before the first surface (the fields are heights on the object, in mm). Switching turns the fields from angles into heights at that distance, and back. For a finite object the aperture may be given as the **NA at the object**; the **working F-number** is always $$1/(2\,\mathrm{NA}')$$ in image space, from the paraxial marginal ray. The conditions show the paraxial magnification and image distance. Rays from a finite object start at their object point and are aimed through the stop as from infinity, their optical path counted from that point, so a perfect image has no wavefront error; the Seidel sums and the focus solve start from the object's points too.

**Take conditions from the bench** reads the light arriving at the assembly in the bench's last trace: each source whose rays cross a plane just before the first surface, going forward and inside its clear radius, gives a field (the rays' mean angle, with the axis always included) and its wavelengths, and the widest beam there becomes the entrance pupil. When every source's rays come from a point at much the same distance, the object is put there: each point's height a field, the widest cone the NA. A design lit on the bench by the other kind of object says so in its panel.

**Checked against.** A thick lens with an object 150 mm before it: image distance and magnification from its principal planes and Newton's equation, to 10⁻⁹ mm. An ellipsoidal mirror imaging one focus on the other, and a sphere imaging its centre on itself: no spot, no wavefront error. A doublet lit by a point source 3 mm off the axis: the conditions taken from it, and each of the bench's rays meeting the sensor where the lens engine's does, to 10⁻¹² mm.

### The layout

A section through the design in the plane of the fields: lenses, stop, image plane, and five rays from each field across the pupil, each in its field's colour. Under it are the first-order figures at the primary wavelength: focal length, back focal distance, working F-number, the entrance pupil's size and place, the paraxial image height at the largest field, and the total track.

### Element data

One row a surface, from the object to the image:

| column | |
|---|---|
| Radius | in mm; Flat (or empty) for a plane surface |
| Thickness | the gap to the next surface: a lens's centre thickness inside it, the air between parts (negative puts the next part behind this one; after a mirror the distance runs along the turned light, so it is positive); on the last surface, the image distance |
| Glass | inside a lens, any catalogue glass by name, or a model glass as nd/Vd; air between parts |
| Clear radius | a lens surface's own (set larger than its lens, the lens grows); the stop's is set by the aperture |
| Conic | the conic constant k |

Beside each radius, thickness and conic:

- **V** marks a variable for the optimiser. A glass's V makes it a model glass.
- **…** sets a **solve** or a **pickup**, shown as **S** or **P**, its value then worked out and shown in grey:
  - *Paraxial focus* (the image distance): the image plane where the primary wavelength's marginal ray crosses the axis. A new design has it. Typing a distance in its cell places the image plane there instead, and the solve is dropped.
  - *Image plane held still* (the image distance): the image plane kept a set distance from the first surface along the axis. The image distance takes up whatever the gaps before it change, whether typed or moved by the optimiser, so the plane stays where it is. Typing a distance in its cell moves the plane and holds it there.
  - *F-number* (a radius): the curvature that gives the working F-number asked for. The system's power is affine in one curvature, so two paraxial traces give it exactly.
  - *Edge thickness* (a thickness): the centre thickness that leaves the edge as thick as asked, $$t = e - \text{sag}_2(h) + \text{sag}_1(h)$$ at the smaller clear radius.
  - *Pickup*: the value follows another surface's, times a scale plus an offset (a radius picked up times −1 makes a lens symmetric).

  Pickups are worked out, then solves, then pickups again, twice over so a chain settles, then the image distance.

Click a row to select it. **Insert a surface** opens a list of kinds (flat, spherical, conic, freeform, diffractive, graded glass) and puts one after the selected surface: inside a lens it splits the glass (a cemented doublet); after a lens's back it adds 2 mm of the same glass. **Duplicate surface type** puts a surface of the selected one's kind after it. **Insert an element** offers a flat N-BK7 singlet 2 mm thick, or the bench's asphere, diffractive lens, GRIN rod lens or cylindrical lens, after the selected part (in front with the Object row selected, at the end with nothing selected), pushing the rest back only if there is no room. **Remove** takes out a surface, or a two-surface lens whole. Every other surface keeps its place, and marks, solves and pickups stay with their surfaces.

### Merit

The **Merit** tab sets what the optimiser makes small: a sum of squared terms.

- **The image.** For every field, wavelength and pupil point, weighted by the field's and wavelength's weights and the point's quadrature weight: the ray's miss on the image plane from the field's centroid (*RMS spot about the centroid*), its miss from the primary wavelength's chief ray (*about the chief ray*), or its wavefront error less the mean (*RMS wavefront error*, in waves). The pupil is sampled by 1 to 4 rings at Gauss–Legendre radii, each with 4 to 12 arms. Together these terms weigh 1, so their part of the merit is the RMS spot radius in mm (or wavefront error in waves).
- **Added terms,** each with a target and a weight (the term is $$\sqrt{w}\,(v - t)$$): paraxial figures (focal length, back focal length, image distance, magnification, working F-number, image-space NA, exit pupil distance, total track); real-ray figures at a chosen field (the chief ray's height and angle at the image, 0 for telecentric, and the height of the ray through a chosen pupil point); the diffraction **MTF** at a field and frequency, tangential, sagittal or mean (target 1 to raise it; a few hundred rays a wavelength); the distortion at the largest field; any Seidel sum; and the **light reaching the image** at a field, the share of an evenly lit entrance pupil whose rays get through every clear radius and hole (target 1 to let as much through as can be). A ray that can't be traced counts as 1000 off its target.
- **Boundaries** every design keeps to: glass at least (and at most) so thick at its centre and edge, air between lenses at least so wide at centre and edge. Each counts only while broken, as ten times its overshoot in mm. Two more hold aspheric terms to what can be made: their **departure** from the base surface (0.5 mm unless set) and its **slope** in degrees.

The merit is $$\sqrt{\sum r_i^2 / W}$$, $$W$$ one for the image plus the added terms' weights. The table gives each term's value and its share. Rays are traced through every surface whatever its clear radius, as the lenses are sized to the light afterwards; only the light reaching the image counts the clear radii and holes. It is found along twelve radii of the pupil, each where its rays start and stop getting through (halved to a ten-thousandth of the pupil), so it changes smoothly as a clear radius or a hole does.

**Clear radii and holes as variables.** A lens surface's clear radius and hole radius have their own **V** in the element data: with the light reaching the image in the merit, the optimiser sizes them for the light they let through, against what the image terms want of the radii and conics. A stacked surface's are its own, before its stack cuts it to the ring where it is met; varied, the rest of the stack follows (a solid telescope's spot made larger takes the ring round it out with it). A telescope's spot, the window in its primary and the radii together: the spot as large as the light coming back to it, the window as large as the cone going out.

**Checked against.** Each term against the lens engine's own figure; the light reaching the image against $$(a/r)^2$$ for a face cut to a clear radius $$a$$ on a pupil of radius $$r$$ (0.002), less $$(b/r)^2$$ for a hole $$b$$; the MTF term against the MTF view (10⁻⁹) and the round pupil's closed form (0.003); a singlet asked for the most MTF at 20 cycles/mm, its image distance free, raising it from 0.17 to 0.37 a little inside the paraxial focus; a singlet made telecentric placing its stop at the front focal point within 0.03 mm.

### Configurations

The **Configurations** tab holds one design in several states: a zoom lens at each focal length, a lens refocused for nearer objects, a relay at two magnifications. **Make configurations** gives two (the design and a copy); **Add a configuration** copies the one shown. Each has a name and a weight in the merit.

Choose the values that differ in the list under the table and **Make it differ**: any radius, thickness, conic, aspheric term, tilt or decentre, or the image distance. Each configuration starts from the value it has now and keeps its own; everything else is shared. With a finite object, each configuration has its own object distance. **×** beside a value makes it shared again.

One configuration is shown at a time, chosen in the header or with **Show**: it is the one on the bench, in the layout and element data (a value that differs is marked at its left edge), the analyses, drawings, tolerancing and lens file export. Solves are worked out in each configuration. The merit is the weighted mean of each configuration's, and an added term is measured in every configuration unless set for one (a zoom's focal length target in each position). The optimiser varies a shared value once for all and a differing one in each. Tolerancing is of the configuration shown.

**Checked against.** Two identical configurations measure as the design alone; a singlet refocused for 200 and 1000 mm holds each image at its own paraxial focus; two singlets with their spacing differing reach 60 and 75 mm focal length in one optimisation, within 0.05 mm, with the radii shared.

### Optimise the design

Mark the values the optimiser may change with **V**: radii, thicknesses, conics and glasses. Solves and pickups are worked out again at every step.

- **Damped least squares** goes downhill to the nearest minimum. Each cycle finds how every term changes with every variable by finite differences and takes the step $$(J^\mathsf{T}J + \lambda\,\mathrm{diag}\,J^\mathsf{T}J)\,\delta = -J^\mathsf{T}r$$, a radius worked in its curvature so it can pass through flat. A step is shortened past each variable's reach (a sixth of a curvature, 30% of a thickness, 0.5 of a conic, 0.02 in nd or 3 in Vd); reach and $$\lambda$$ shrink while steps fail and grow back when they help. It stops when no step makes the merit smaller.
- **Global search** starts again and again from the best design so far, each variable shaken (radii and thicknesses by about 30%, conics by 0.3, glasses along nd and Vd), takes each start downhill, and keeps what is better, until stopped.
- **Substitute glasses** finds real glasses for the model ones (below).

All run in a background worker, and the design and its parts on the bench change as they go. **Undo** takes it all back. Changing the design by hand stops a run.

**Limits on the variables.** Each value marked V can have a least and a greatest, in the element data's units. Every method keeps to them: a step stops at a limit, shaken starts are brought back inside, and a design started outside is brought to the nearest limit first. A value on a limit is marked. A radius is varied as its curvature, so its two limits must have one sign, or one alone lies on its own side of flat (at least 20: from 20 out to flat). Aspheric, freeform, phase and gradient terms, and values that differ between configurations, take no limits.

**Designs kept.** A global search keeps the ten best distinct designs it reaches (two are the same when every variable is within a part in 10³), listed under **Designs kept** with each one's merit, origin and first values, and saved with the design. **Use** puts one back; **Keep this design** adds the design as it stands, to come back to after trying something; **Remove** and **Clear the list** tidy it.

**Checked against.** A singlet bent for least spherical aberration reaching the third-order shape $$(R_2+R_1)/(R_2-R_1) = 2(n^2-1)/(n+2)$$; a Cooke triplet with its radii spoilt by 30% optimised back to at least the published design; a doublet of one glass made an achromat, crown in front of flint, by varying its glasses; a singlet whose best bending is out of bounds ending exactly on its limit with nothing just inside doing better; a global search's kept designs distinct, each put back with the merit it was kept with.

### Aspheric surfaces

An **asphere** (from the parts as **Asphere**; a plain lens's surfaces are spheres) may carry even terms on top of its conic:

$$z(r) = \frac{c r^2}{1 + \sqrt{1 - (1 + k) c^2 r^2}} + A_4 r^4 + A_6 r^6 + \dots + A_{16} r^{16}.$$

**+ A** beside a surface opens a row of its terms: A4 first, **Add A6** and so on to A16. Each is typed (in mm to the power of one less than its order), marked **V** or picked up; terms set on the bench (**Add aspheric terms** in the lens's panel) show here too. The optimiser varies each as the sag it adds at the clear radius, $$A_n h^n$$, so terms of very different size take like steps. Keep the departure and slope boundaries in the merit to keep what it finds makeable, and use as few terms as do the job. The Seidel sums carry the fourth-order term as a third-order aberration; the higher terms are in the real rays. A lens file writes them as an even asphere.

**Checked against.** A plano-convex N-BK7 lens of 50 mm at f/2 with A4 to A10 optimised: RMS spot from 497 µm to 0.01 µm against an Airy radius of 1.4 µm; the same held within 20 µm of departure: kept.

### Freeform surfaces

An asphere's surface, or a mirror, can also be a **freeform**: XY polynomial terms added to its sag, $$z \mathrel{+}= \sum c_{mn}\, x^m y^n$$, with x out of the plane of the fields and y in it. Only even powers of x are allowed, so the surface stays symmetric about the bench plane. The fourteen terms run from second to sixth order: x², y², x²y, y³, x⁴, x²y², y⁴, x⁴y, x²y³, y⁵, x⁶, x⁴y², x²y⁴, y⁶.

**+ XY** beside the surface opens its freeform row; on the bench the panel lists them under **Add a freeform term…**. Unequal x² and y² terms make a toroid; odd powers of y tilt and bend the surface. Both tracers trace a freeform exactly. The paraxial figures and Seidel sums see only its y² term, the lens file export warns and leaves it out, and the 3D view and drawing show the profile in the plane. Like a tilt, a freeform is not paraxial, so leave the image distance free (**V**) when optimising one.

**Checked against.** A ray through a freeform face met and refracted as the terms' slope says, to 10⁻¹²; the bench's rays meeting the sensor where the engine's do, to 10⁻⁹ mm; a concave f/10 mirror turned 10° whose astigmatic spot of 0.110 mm falls to 0.018 mm with a toroid, the coma left near θf/(16N²).

### Cylindrical lenses

A cylindrical lens can be part of an assembly, curved in the plane of the fields or out of it as its **Shape** sets; its surfaces are marked **cyl ⟂** or **cyl ↕** in the element data, and its radius is typed, varied, solved or picked up like any other. A cylinder rolled so its power lies between the two can't be in an assembly. The trace is exact both ways; the first-order figures, Seidel sums, layout and drawings are of the plane of the fields, where a cylinder curved out of the plane has no power. For a toroid, give an asphere or mirror unequal x² and y² freeform terms.

**Checked against.** A cylinder curved in the plane has the round lens's focal length there, one curved out of it none; two crossed cylinders bring a beam to a point under a twentieth of one alone's line focus; the bench's rays meet the sensor where the engine's do, to 10⁻⁹ mm.

### Diffractive surfaces

A **diffractive lens** (from the lens presets) can carry a phase on any face, a kinoform blazed into one order:

$$\phi(\rho) = c_1\rho^2 + c_2\rho^4 + c_3\rho^6 + c_4\rho^8$$

in radians, ρ in mm. In order m the face adds $$m\lambda\phi/2\pi$$ of path and bends a ray as a grating of that local pitch would: $$n'\mathbf{d}'_t = n\mathbf{d}_t + (m\lambda/2\pi)\nabla\phi$$ along the face. All the light is taken to go into order m. Its power, $$-m\lambda c_1/\pi$$, grows with the wavelength, the other way to glass (an Abbe number of −3.45), so a weak diffractive face can cancel a refracting lens's colour; the preset is such a hybrid achromat.

**+ φ** beside the surface opens its phase row (ρ², then ρ⁴, ρ⁶, ρ⁸), each typed, varied, solved or picked up; the optimiser varies each as the waves it adds at the clear radius. On the bench the panel has **Diffraction order** and **Add a diffractive phase**. The bench's trace, the diffracted field and the lens engine all trace it exactly, in its order. The paraxial figures take its power at each wavelength; the Seidel sums take it as a thin layer of very high index (the Sweatt model). The drawing gives the phase, the number of zones and the width of the last; the lens file export leaves the phase out, and warns.

**Checked against.** A flat plate with $$c_1 = -\pi/(\lambda f)$$: focal length f exactly, f/2 in order 2, scaling as 1/λ; its spherical aberration at f/5 within 1% of −SI/8, nil with the perfect lens's fourth-order term; a plano-convex singlet's ρ² term varied to take out Seidel's axial colour bringing the F and C foci together; the bench's rays meeting the sensor where the engine's do, in orders 1 and 2, tipped and raised, to 10⁻⁹ mm.

### Graded glass

A **graded lens** (the GRIN rod lens preset, or any lens made graded) has glass whose index changes with the distance from its axis, $$n(r) = n_g(\lambda) + g_2 r^2 + g_4 r^4 + g_6 r^6$$. A ray curves toward the higher index along $$\mathrm{d}(n\,\mathbf{t})/\mathrm{d}s = \nabla n$$, traced by fourth-order Runge–Kutta in short steps (an eightieth of the diameter, 0.1 mm at most), its path summed as it goes. A rod whose index falls as $$n_0(1 - Ar^2/2)$$ has $$g_2 = -n_0A/2$$ and a pitch $$2\pi/\sqrt{A}$$; the preset is a quarter pitch long, so it focuses a collimated beam on its back face.

**+ n(r)** beside a surface opens a row for the glass after it (r², then r⁴ and r⁶); on the bench, **Grade this glass** in the panel. The bench's rays, the lens engine and the diffracted field (slab by slab, the split-step method) all take the gradient. The paraxial figures take the r² term's exact matrix; the Seidel sums leave out the gradient's own third-order aberration, so for a graded design trust the traced spot, wavefront and MTF. The lens file export writes the glass on its axis, and warns.

**Checked against.** Rods of several lengths, focusing and spreading: focal lengths and back focal distances as the r² matrix's closed forms, to 10⁻⁹; the preset bringing rays from 0.2 mm off axis to within a micron on its back face; a Gaussian beam through the quarter-pitch rod as wide as the matrix says, to 1%; the bench's rays meeting the sensor where the engine's do, to 10⁻⁹ mm.

### Model glass

Marking a glass **V** makes it a *model glass*: nd and Vd alone, its index a two-term Cauchy fit, $$n(\lambda) = A + B/\lambda^2$$. A model glass can also be typed into the element data as nd/Vd (1.62/60). While optimising it is kept on the glass map, within reach of a real glass. **Replace model glasses with the nearest real ones** puts the nearest catalogue glass in place of each; optimise again after.

### Substitute glasses

**Substitute glasses**, the third method under Optimise, finds the real glass for each one marked **V**. It tries the catalogue glasses nearest it on the glass map (0.01 in nd counting as 1 in Vd) from the makers ticked (Schott, Ohara, Hoya, CDGM, Sumita), as many as asked (12 unless set), each transmitting at every wavelength of the design. With each candidate in place, the rest of the variables are optimised again (twelve cycles) and the merit taken; the best goes in if it beats the glass already there, and a model glass is always replaced. The glasses are taken in turn and the passes repeat (three at most) until one changes nothing, so a glass can walk across the map. A table gives what each glass was and is, the merit and the best few tried. Undo takes the design back to where it started.

**Checked against.** An air-spaced doublet whose second glass is a model near F2 gets the flint that, tried alone from the same start, optimises lowest, the merit falling more than tenfold; a glass none of its candidates betters is kept.

### Tolerance the design

The **Tolerance the design** tab asks how good the design will be as it is made. Each tolerance changes the nominal lens as a maker might, nothing re-solved but the compensators:

| tolerance | ± | what it changes |
|---|---|---|
| Radius | fringes | each surface's sag at its clear radius, by this many fringes at 632.8 nm (λ/2 each) |
| Thickness and air gaps | mm | every lens thickness and every gap between parts |
| Lens decentre | mm | each lens moved across the axis, in x and in y |
| Lens tilt | arcmin | each lens tilted about its mechanical reference (first vertex unless set, centre, or last vertex), about x and y |
| Glass index | Δn | each glass's index at every wavelength |
| Abbe number | % | each glass's dispersion about the d line |
| Surface irregularity | fringes | off unless on: each surface's form error beyond its radius, $$a(r^4 - h^2 r^2)$$, peak to valley the fringes' $$N\lambda/2$$ |
| Surface wedge | arcmin | off unless on: each surface tilted on its own about its vertex, as a lens comes out wedged; at a cemented interface, the cement wedged |
| Surface decentre | mm | off unless on: each surface moved across the axis on its own; in a cemented lens, its parts glued off axis |

A cemented lens is one part: lens decentre and tilt move it whole, and its interface takes surface wedge and decentre like any face. Every perturbed surface is traced exactly in its own moved frame.

**Criterion and compensators.** The criterion is the merit's image term: the RMS spot or wavefront error over every field and wavelength. Unless turned off, the **focus** is refocused for each build (the spot's square is a parabola in the focus, so three trials find it). **Add a compensator** adds what an assembler adjusts on each lens: an air gap, or a lens's decentre or tilt, each within a range. For each build, focus and compensators are set together to make the criterion as small as it can be, by damped least squares, each held within its range. A compensator the nominal would already push past its range is marked: widen it, or optimise the design with that value.

- **Sensitivity** sets each tolerance alone at its two limits and lists the change in the criterion, worst first, with the criterion expected over the builds: $$c^2 \approx c_0^2 + \sum_i k\,\tfrac12\left[(c_i^{+})^2 + (c_i^{-})^2 - 2c_0^2\right]$$, $$k = 1/3$$ for uniform tolerances, $$1/4$$ for normal ones with the limit at two deviations.
- **Monte Carlo** builds the lens again and again, every tolerance at random (uniform within its limits, or normal with the limit at two standard deviations, cut there), each build from its own seed so a run repeats. It gives the criterion's mean, deviation, best and worst, the values 50%, 80%, 90% and 98% of builds are at least as good as, a histogram, and how far each build was refocused and each compensator moved.
- **Yield** is the share of Monte Carlo's builds that meet a specification: the criterion no worse than a figure, and any of the merit's operands (a focal length, a distortion, an MTF…) within limits, each build as compensated. It comes with its 95% confidence range (the Wilson interval) and each part's own share, to say which part costs the yield. The builds keep their operands, so a changed specification is worked out again without building again.
- **Inverse sensitivity** turns the question round: for a worsening allowed (10% of the nominal criterion unless set, or an amount in µm or waves), it finds for each tolerance alone the limit at which the criterion is worse by that much, by bracketing and halving in the limit's logarithm to a part in a hundred. A tolerance that never worsens it that much within a thousand times its limit is reported as at least that. **Use these limits** sets each kind to its tightest item, rounded down. The limits are for each tolerance alone; together they add, as Sensitivity's estimate and Monte Carlo show.

Both runs work in the background, a batch at a time, and can be stopped. Tolerances, compensators and Monte Carlo's settings are kept with the design; results are kept while the workspace is open, and say when the design has changed since.

**Checked against.** A decentred surface against the centred one with the light moved across, to 10⁻¹²; a plate tilted 10° shifting an axial ray by $$t\sin\alpha\left(1 - \cos\alpha/\sqrt{n^2 - \sin^2\alpha}\right)$$; fringes against the sag they make, and an index change against the lensmaker's equation; the compensator against a fine scan of the focus; Monte Carlo's mean square over a thousand builds against the sensitivity estimate, within four standard errors; a wedged flat back moving the image by $$(n-1)\,\alpha\,\mathrm{BFL}$$ and a wedged cemented interface by $$(n_1-n_2)\,\alpha\,(t_2/n_2 + \mathrm{BFL})$$, to 1%; a ball lens tilted about its centre unchanged; the Wilson interval against its tables (5 of 10: 23.7% to 76.3%); a lens's own decentre as compensator setting it back exactly, or only as far as its range allows; inverse sensitivity's limits giving exactly the worsening allowed, and twice the worsening allowing between √2 and 2 times the limit.

### Stock lenses

The **Stock lenses** tab matches the lenses of a design against lens files you have (.zmx or .zar), such as the ones lens makers publish. **Add lens files…** reads them in the browser and keeps them there only; a file holding one singlet or cemented lens is kept, any other noted and left out. For each round lens of the design it gives its focal length, number of faces and beam diameter on its faces, and the stock lenses that could stand in: as many faces, a focal length of the same sign within 30%, a diameter at least the beam's, ranked by focal length and curvature and the best eight kept.

**Try them** puts each in the design in place of the lens, as its file has it and turned round, and optimises the air either side and the image distance for the design's own merit, showing the better way round and its merit against the design's own lens with the same air optimised. The stock lenses are taken as made, so the merit here leaves out the glass thickness, edge and departure boundaries. **Use** puts one in; **Undo** takes it back. A stock lens is only as its file describes it: check the maker's specification before buying.

**Checked against.** The design's own lens as a stock file matching with the same merit; a plano-convex lens better curved side to the collimated light, as third-order theory has it; lenses of the wrong sign, face count, size or focal length not offered.

### Drawings

The **Drawings** tab gives each lens and window a drawing on an A4 sheet in the manner of ISO 10110: the lens in section to a standard scale, light from the left, with its diameter, each glass's centre thickness and tolerance, its edge thickness (a reference dimension, in brackets) and each clear aperture marked where it is less than the diameter; and a table of its surfaces and glass:

| row | from |
|---|---|
| Radius R | the surface's radius, CX or CC as the glass sees it |
| tolerance | the radius's own, from the surface form: the spheres whose sags at the clear radius differ by $$N\lambda/2$$ |
| Clear aperture | the surface's clear diameter |
| Conic, Aspheric, Aspheric departure | where the surface has them; the terms in the notes |
| 3/ Surface form | $$3/A(B)$$: $$A$$ fringes of power, $$B$$ of irregularity, "-" where not set |
| 4/ Centring | the surface's tilt in arcminutes: the lens tilt tolerance plus the decentre tolerance over its radius |
| Material, Index nd, Abbe number Vd | the glass, with the index and Abbe number tolerances |
| Centre and edge thickness | the glass's, the edge from the two sags at the full diameter |

A glass under half a millimetre at its edge, or a sphere that does not reach the full diameter, is noted. A title block gives the lens, its assembly, the scale, the date and the bench. **Save as SVG**, **Save as PDF** and **All as one PDF** are vector: lines stay lines at any zoom.

**Checked against.** A biconvex lens's edge thickness by hand; CX and CC on biconvex, plano-concave and cemented lenses; the radius tolerance against the tolerancing's own change of radius for the same fringes.

### The design report

**Report (PDF)**, at the top of the workspace, writes the whole design as one PDF: its conditions and first-order figures; its layout, folded as on the bench, with the spot sizes at each field; its prescription, solves, variables, aspheric terms and Seidel sums; its spot diagrams, field curvature, distortion and MTF; its tolerance settings, with the last Sensitivity and Monte Carlo runs if made on the design as it now is; and each lens's drawing. Everything is drawn as vectors in the standard PDF fonts.

### The bench's own tools

**Optimise the bench** and **Tolerance the bench** (the Sweeps menu) work on the whole bench, its positions, alignment and coupling, over the swept values. A lens design is optimised in its workspace, against its own conditions.

### Analyses

The **Analyses** tab shows the design from each side a lens designer looks at it, chosen by a row of chips, each for a field (and a wavelength) picked beside it. Every view comes from the lens engine's real rays, aimed through the stop and stopped by the clear radii, and is worked out when shown. Every plot keeps one colour for each wavelength, draws tangential solid and sagittal dashed, carries a legend, reads out its values under the pointer, and saves its numbers as CSV.

- **Spot diagram:** where a square grid of rays across the pupil lands on the image plane, each field in a box of one scale, about the centroid of all the wavelengths; with the RMS and largest radius, and the Airy disc (radius $$1.22\,\lambda F$$).
- **Ray fans:** each ray's miss from the primary wavelength's chief ray along the pupil's y diameter (tangential) and x diameter (sagittal).
- **OPD fans:** the wavefront error along the same diameters, in waves, each wavelength about its own chief ray.
- **Field curvature and distortion:** where the tangential and sagittal foci lie along the axis for fields from the axis to the largest, and the distortion, $$100\,(y - y_p)/y_p$$, the real chief ray's height against the paraxial.
- **Longitudinal and colour:** where a ray from each pupil height crosses the axis, from the primary paraxial focus; and the paraxial focus over the wavelengths.
- **Wavefront:** the wavefront error over the pupil on a 48 × 48 grid, piston taken out, with its RMS and peak to valley and its first 16 fringe Zernike terms.
- **PSF:** the point spread function at one wavelength, the squared modulus of the Fourier transform of the pupil function (64 points across the pupil, padded four times); the **Strehl ratio** against the same pupil unaberrated; and the **encircled energy** beside the diffraction limit's. **Method › Huygens** sums wavelets instead (below).
- **MTF:** the diffraction MTF, tangential and sagittal, from the pupil function's autocorrelation, over the wavelengths weighted, with the diffraction limit of the same pupil.
- **Through-focus MTF, Relative illumination, Footprints, Seidel, Ghosts, Polarisation, Thermal, Image simulation:** below.

**Checked against.** A perfect lens (the ellipsoid imaging into glass): no spot, the round pupil's MTF $$\tfrac{2}{\pi}\left(\arccos v - v\sqrt{1-v^2}\right)$$ within 0.003, a Strehl ratio of 1, 83.8% of the energy within the first dark ring; that lens defocused by a twentieth of a wave RMS: the defocus Zernike term alone and Maréchal's Strehl $$e^{-(2\pi\sigma)^2}$$ within 0.001; a sphere with its stop at its centre: both foci on a sphere about the centre and no distortion; a singlet's longitudinal aberration four times as large at twice the pupil height.

#### Third-order (Seidel) sums

The Seidel aberrations, surface by surface and summed, from the paraxial marginal and chief rays. With $$A = n i$$ and $$\bar A = n \bar\imath$$ the refraction invariants, $$\Delta(u/n)$$ the change across the surface and $$H$$ the Lagrange invariant:

$$S_I = -A^2 y\,\Delta(u/n), \quad S_{II} = -A\bar A y\,\Delta(u/n), \quad S_{III} = -\bar A^2 y\,\Delta(u/n), \quad S_{IV} = -H^2 c\,\Delta(1/n),$$

$$S_V = -\bar A^3 y\,\Delta(1/n^2) + c\,\Delta(1/n)\,\bar A\bar y\,(\bar A y + H).$$

The colour terms are $$C_L = A y\,\Delta(\delta n/n)$$ and $$C_T = \bar A y\,\Delta(\delta n/n)$$, $$\delta n$$ the index at the shortest wavelength less that at the longest. An aspheric surface adds $$8(n'-n)G y^4$$ to $$S_I$$ ($$G$$ its fourth-order sag beyond its paraxial sphere) and the same times $$\bar y/y$$, $$(\bar y/y)^2$$ and $$(\bar y/y)^3$$ to $$S_{II}$$, $$S_{III}$$ and $$S_V$$. They are wavefront coefficients in mm, in the usual sign convention: an uncorrected positive singlet has $$S_I > 0$$.

**Checked against.** A published Cooke triplet typed in cell by cell: focal length and Seidel sums as an independent program's, to 10⁻¹⁰; the real rays in the third-order limit ($$S_I/8$$ the edge ray's wavefront error at a small pupil, $$S_V$$ the chief ray's distortion at a small field); the perfect ellipsoid's $$S_I = 0$$.

#### Huygens PSF

The FFT PSF takes the image square to the chief ray. The **Huygens** PSF instead sums wavelets on the design's own image plane: a 64 × 64 grid of rays is traced to the reference sphere, and each crossing $$Q_k$$ is a source with the phase of its optical path and the strength of its share of the light over its patch of sphere. Each image point sums

$$U(P) = \frac{n'}{i\lambda}\sum_k a_k\, e^{i k_0 (L_k + n' r_k)} \frac{\cos\chi_k}{r_k}$$

(Rayleigh–Sommerfeld), so a beam meeting the plane slantwise spreads over it as it does there. The image is sampled at $$\lambda F/4$$, up to 129 points across; several wavelengths add as irradiances, weighted; the Strehl ratio is the peak against the same rays all in phase. It is summed a few rows at a time, so the page stays live.

**Checked against.** The perfect lens at f/10 and f/2.6: the Airy pattern within 0.003 and 0.012 of its peak, Strehl 1; defocused, Strehl within 0.004 of $$\mathrm{sinc}^2(\pi W_{020})$$; a perfect wave meeting a plane at 30°: the Airy half-width across the slant and $$1/\cos 30°$$ wider along it, within 1%; the Cooke triplet at 14° within 1% of the FFT PSF, and at 20° 6% under the sum on the plane square to the chief ray, as the slant spreads it.

#### Relative illumination

How bright the image of an even object is across the field. The irradiance at an image point goes as the projected solid angle the exit pupil fills, seen from that point: $$E \propto \iint dL\,dM$$ over the direction cosines. For each field a 65 × 65 grid of rays is traced to the image, the directions from the chief ray's landing to each ray's crossing of the exit pupil plane give $$(L, M)$$, and the area they cover (over the grid's triangles whose corners all get through) is the solid angle. It is shown against the axis's, beside the share of the pupil that gets through (the vignetting) and $$\cos^4$$ of the chief ray's angle, the rule of thumb it can fall below or rise above.

**Checked against.** A stop and a singlet 15 mm behind it, at 20°, against each ray's own share of the image found the other way, within 1%, with the singlet wide enough to pass the pupil and narrowed to cut over 40% of it.

#### Footprints

Where the rays of every field cross each surface: a 15 × 15 grid across the pupil and a ring of 48 at its edge, every field and wavelength, each crossing in the surface's own frame. For each surface: the **beam** (the farthest any ray lands from its vertex), the **margin** (clear radius less the beam), **used** (beam over clear radius) and the share of rays it **stops**. The fullest surface is drawn first, the rays it stops as crosses; choose any other to draw it.

**Checked against.** A singlet at f/45: each surface's beam the paraxial marginal height, to 0.1%; at 15°, the footprint centred on the real chief ray, to 0.02 mm; a surface decentred by (0.3, 0.2) mm giving a footprint at (−0.3, −0.2) in its frame; a 45° fold mirror making a 10 mm beam land $$10\sqrt2$$ mm long.

#### Through-focus MTF

The diffraction MTF at a chosen frequency (a quarter of the cutoff by default), each field, as the image plane moves along the axis over a chosen range (eight $$\lambda F^2$$ either way by default), in 31 steps. It gives the **best focus** (where the mean MTF over the fields peaks, and each field's own) and the **depth of focus** (how far either side the mean stays above 80% of its peak), and points out a best focus at an end of the range.

**Checked against.** A paraboloid mirror at and either side of its focus against the round pupil's MTF, within 0.006; defocused by 1.5 waves, against the pure-defocus MTF by quadrature, within 0.01; a singlet's best focus where its Zernike defocus term is nil, within 10 µm.

#### Thermal

The design from one temperature to another (−20 to 60 °C by default), at a chosen pressure, in a housing of aluminium, stainless steel, brass, titanium or Invar. The design is taken to be at 20 °C and one atmosphere. Each glass's absolute index changes by its maker's formula with the makers' own coefficients (1,106 glasses); a few crystals and plastics by a single dn/dT; a glass with neither keeps its index and is listed. The air's index follows $$n_{\mathrm{air}} = 1 + (n_{\mathrm{ref}} - 1)\,p/(1 + 3.4785\times10^{-3}(T - 15))$$ with standard air's dispersion, and each glass's index in the design is its absolute index over the air's. Each lens grows with its glass (radii, aspheric terms, thicknesses, clear radii); the air gaps, stop, image distance and decentres grow with the housing. At nine temperatures it gives the focal length, where the paraxial focus lies against the detector, and each field's RMS spot, with the focus drift per kelvin: near zero, the design is athermal in that housing.

**Checked against.** Standard air's $$n - 1 = 2.7717\times10^{-4}$$ within 10⁻⁷; N-BK7's absolute index change against its data sheet within 0.06 × 10⁻⁶ per kelvin; a lens whose glass and housing grow alike scaling as a whole to 10⁻⁹; a thin singlet's focal length changing at its thermo-optic rate within 1%, and its focus drifting in aluminium within 2%.

#### Polarisation and coatings

Each ray of a 25 × 25 grid is traced with its polarisation, a 3 × 3 complex matrix built up face by face. At each face, with $$\hat s$$ square to the plane of incidence and $$\hat p$$, $$\hat p'$$ in it either side,

$$P = \tau_s\,\hat s\hat s^{\mathsf T} + \tau_p\,\hat p'\hat p^{\mathsf T} + \hat k'\hat k^{\mathsf T},$$

each $$\tau$$ the face's amplitude transmission, the same numbers the bench's rays take (see [Coatings](/jek/docs/jekray/free-space/#coatings)): Fresnel's for a bare face, the characteristic matrix for a stack (with its phase, so retardance as well as diattenuation), $$1 - R$$ alike for a coating known by its reflectance, $$\sqrt{R}$$ for a mirror. The glass between faces takes $$e^{-\alpha L}$$. The product is read as a Jones matrix in the double-pole basis and gives, for each ray, the **transmission** for the polarisation chosen, the **diattenuation** (from the eigenvalues of $$J^\dagger J$$), the **retardance** (from the unitary part of its polar decomposition) and the **polarisation out**. Skew rays come out turned a little even through faces that change nothing (skew aberration). A table gives each face's mean share passed, reflected and absorbed. A face's coating can be chosen there (bare, AR 0.5%, MgF₂ λ/4, a V-coat, or any coating kept by name), and **Design a coating…** opens the [coating workspace](/jek/docs/jekray/coating-design/) on it.

**Checked against.** A bare face square on, $$1 - ((n-1)/(n+1))^2$$, and at Brewster's angle, p passed whole and the diattenuation $$R_s/(2 - R_s)$$, to 10⁻⁹; a quarter-wave MgF₂ layer's $$1 - ((n_s - n_c^2)/(n_s + n_c^2))^2$$; every face, bare or coated, passing and reflecting to a total of 1 at 0°, 20° and 40°, to 10⁻⁹; a 50/50 stack at 35° giving the stack's own diattenuation and retardance; a singlet's pupil the same under a 90° turn, meridional rays' matrices the identity and skew rays' pure rotations.

#### Image simulation

A picture as the design would form it: a test chart or a picture of your own (which stays in the browser tab, never saved or sent). It is the object, placed so its paraxial image fills the field or makes a patch of 256 × 192 pixels at a chosen pitch about one of the fields. Each colour is formed at the nearest design wavelength (red 640, green 550, blue 460 nm), in linear light: each point is moved by the **distortion** of the real chief ray (sampled backwards, so no gaps), dimmed by the **relative illumination**, and **blurred** by the PSF at a grid of points over the image (4 × 4 over the field, 3 × 3 over a patch), each turned to its azimuth, convolved by FFT and blended between the grid's points. It works on a design round about its axis, and saves as PNG or as CSV in linear light.

A design with only a field on the axis has no field to fill, so its picture is a patch about the axis. In a telescope whose secondary blocks the centre of the pupil, the chief ray is traced through the obstruction as if it were not there, to find where each point lands and how bright it is.

**Checked against.** An even white picture reproducing the relative illumination within 0.01; a point landing in each colour where that colour's chief ray lands, within a tenth of a pixel, red and blue apart by the lateral colour; the perfect lens spreading a point as the Airy pattern; a defocused point at +y and then +x giving the same blur turned 90°, within 3%.

#### Ghosts

Light sent back by surface $$a$$ and on again by an earlier surface $$b$$ reaches the image as a ghost carrying $$R_a R_b$$ of the light, focused somewhere else. **Ghosts** lists every such pair at the chosen field and the primary wavelength: the two reflectances; the share **reaching the image** through every clear radius; its **focus** from the image plane; its **RMS on the image**; its irradiance **against the image**, each spread evenly over a disc of $$\sqrt2$$ times its RMS radius (read it as a ranking); and a **focus inside** the design, marked when within a millimetre of a surface, where concentrated light can damage a coating or cement. Choose a ghost and its rays are drawn in the layout in magenta, with its spot beside the image's own.

Each ghost is traced as a design of its own, unfolded: forward to $$a$$, back through the surfaces between (each met from behind), $$b$$ reflects, then on to the image, each ray started where the design's own ray for that pupil point starts, so the stop, aim and vignetting are the design's. Ghosts are followed in a centred design without mirrors, tilts or decentres. Light reflected more than twice, or through a lens's rim, is left to the bench: tick **Follow weak reflections (ghosts)** in the bench settings and the bench follows every reflection.

**Checked against.** A singlet's one ghost against its paraxial matrices written out by hand, to 10⁻⁹, with the product of its faces' reflectances; every ghost ray the engine traces in the triplet landing where the bench's twice-reflected ray from the same start does, to 10⁻¹² mm, on the axis and 6° off it.

### On the bench

**Locked as designed.** Leaving the workspace locks its parts: their panels show their values but don't take changes, so a careful design isn't changed by a stray click. The padlock beside the part's name opens it; **Open the assembly design…** goes back to the design. Moving the assembly as a whole is not locked.

An assembly's panel compares the light the bench sends it with its design conditions, and says when it is used outside them: a field beyond its largest, a wavelength outside its range, or a beam wider than its entrance pupil.

## Lens files

**File › Import an element (.zmx)…** reads a file of several lenses, or one with a stop of its own, as an assembly with the file's aperture, fields and wavelengths as its conditions. **Export as an element file** from an assembly's panel writes its prescription with the stop where it is and its conditions (a finite object as the object surface's thickness, its fields as object heights). A folded, tilted or decentred assembly is written with coordinate breaks, each surface in its own frame: the step along the current z is the previous thickness, then a break decentres along x and y and tilts about x, the new y and the new z, right-handed, in degrees. After an odd number of mirrors the light runs along −z, with negative thicknesses and sags of the other sign, as the format has it. Coatings are not written.

**Export for CAD (.step)** (with a free account) writes the parts as solids for mechanical design, in the design's own frame (first vertex at the origin, light along +z, folds and tilts as designed), to ISO 10303-21 and the AP214 protocol, in millimetres; **Export as a mesh (.stl)** writes the same solids in triangles. Each glass between two faces is a solid (a cemented doublet gives two), its faces run out to the diameter with a flat shoulder where a steep face cannot, and its edge a cylinder; a mirror is a disk with a flat back; a stop a washer 1 mm thick. A sphere is written as a sphere, a flat as a plane, and a conic or asphere as its profile turned about the axis, a cubic B-spline through 33 points. Cylindrical and freeform faces are left out, and the export says so.

**Checked against.** A lens, a 45° fold and a tilted, decentred lens, in the plane and out of it, read back by a sequential tracer of its own built from the file's coordinate breaks: ten rays over two fields within 10⁻⁷ mm of the lens engine's. A stop, a cemented doublet, a conic asphere, a fold mirror and a tilted lens exported as STEP: every solid valid in OpenCascade, each volume within 10⁻⁸ of its profile turned, each centre of mass within 10⁻⁸ mm, the true asphere within 3 × 10⁻¹⁰ mm of the solid; the STL closed and of the same volume to the facets' error.

## In a .jekray file

Assemblies are listed under `"assemblies"`: each `{"id", "name", "ref", "rev", "cond", "design"}`, its parts carrying its `id` as their `"group"`. `ref` is the part whose facing sets the axis and `rev` is true when the light runs against it. `design` holds the image distance (`"image"`), the variables (`"vars"`), the solves (`"solves"`), the pickups (`"pickups"`), the merit function (`"merit"`: `"crit"`, `"rings"`, `"arms"`, `"bounds"` and the added terms `"ops"`, each `{"op", "target", "weight"}` with a field index `"f"`, a pupil point `"p"`, a frequency `"v"` and a configuration index `"c"` where the term needs them) and the tolerances (`"tol"`: each kind `"rad"`, `"thk"`, `"dec"`, `"tilt"`, `"ind"`, `"abbe"`, `"irr"` as `{"on", "v"}`, with `"comp"`, `"dist"`, `"trials"` and `"seed"`). Each value is named by a key: `"R:<part id>.<surface>"` (a radius), `"k:…"` (a conic), `"t:…"` (the gap after that surface), `"g:…"` (the glass after it), `"a4:…"` to `"a16:…"` (aspheric terms), `"f20:…"` to `"f06:…"` (freeform terms), `"p2:…"` to `"p8:…"` (a diffractive face's phase terms), `"n2:…"` to `"n6:…"` (a graded glass's terms), `"T:…"` and `"D:…"` (a part's tilt and decentre) or `"t:image"`. The merit's `"bounds"` are `"glassMin"`, `"glassMax"`, `"edgeMin"`, `"airMin"`, `"aspMax"` and `"slopeMax"`. A model glass is a material `{"glass": "Model", "nd", "vd"}`. A design with configurations has `"mc"`: `{"keys", "configs", "active"}`, each configuration `{"name", "w", "v", "obj"}`; the parts on the bench hold the active configuration's values.
