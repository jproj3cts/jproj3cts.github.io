---
layout: docs
title: Lens design
permalink: /jek/docs/jekray/lens-design/
description: Assemblies and lens design in JEKray. Lenses and stops on one axis are made one assembly, designed together in the lens design workspace (conditions, layout, lens data, solves, pickups, Seidel sums), then used on the bench as the parts they are.
---

<p class="dx-lead">An assembly is a set of lenses and stops on one axis that are designed together: a doublet, a triplet, an objective. Its parts stay the bench's own parts, traced as they always are, so making one changes nothing the light does. What it adds is the view a lens designer works in: the parts read as one sequence of surfaces, with the conditions the design is for.</p>

## Making an assembly

Select the lenses and stops (Shift- or Ctrl-click, or drag a box round them), then **Make an assembly** in their panel or from the right-click menu. They must be:

- lenses round about their axes (not cylindrical), round irises, or windows;
- on one axis: facing along it (a lens either way round), on it to within a micrometre, at one height and upright;
- not overlapping.

If they are not, the panel says which part is in the way and why. The light is taken to run away from a source on the axis; with none on it, the way most of the lenses face.

An assembly is picked and moved as one, drawn with a dashed outline and its name. Ctrl-click one of its parts to edit that part alone; if a part is then moved off the axis, the outline turns red and the panel says so. **Split into parts** gives back the separate lenses and stops, where they are.

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

## The lens engine

A lens designer traces many rays through one fixed list of surfaces, again and again. The bench's tracer follows light through everything on a bench (splits, coatings, beams, fields); the lens engine follows rays through a prescription alone, as fast as it can, and is what the design work below is built on.

**Coordinates.** z runs along the axis from the first surface's vertex, y across it in the bench plane (the meridional section, where the fields lie) and x out of it (sagittal). The object is at infinity; a field is the angle of the incoming light in the y-z plane.

**Surfaces.** Each is $$z = z_i + \text{sag}(\rho)$$, $$\rho$$ the distance from the axis, with the bench's own sag:

$$\text{sag}(\rho) = \frac{c\rho^2}{1+\sqrt{1-(1+k)c^2\rho^2}} + a_2\rho^2 + \sum_j A_{4+2j}\,\rho^{4+2j} + \sum_q o_q\,\rho^q$$

A ray meets a surface where Newton's method finds the root along the ray, and is refracted by Snell's law in vector form,

$$\mathbf{d}' = \mu\,\mathbf{d} + \left(\sqrt{1-\mu^2(1-\cos^2 i)} - \mu\cos i\right)\hat{\mathbf{n}}, \qquad \mu = n/n',$$

in three dimensions, so skew rays are traced as exactly as meridional ones. A ray landing outside a surface's clear radius is vignetted there; one that cannot refract is lost.

**First order.** Paraxial (y-nu) traces give the focal length and back focus, and the chief ray, aimed at the stop's centre, places the entrance and exit pupils. The aperture is the stop's own opening, or an entrance pupil diameter set for the design, the stop then floating to suit.

**Ray aiming.** Each ray is found that crosses the stop at the pupil point asked for, by Newton's method on where it starts, so the stop is filled exactly whatever the pupil aberrations of the lenses before it. Rays start on a plane square to the incoming light through the entrance pupil's centre, so every ray of a field starts on one wavefront.

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

The left column holds the conditions the design is for: the aperture (an entrance pupil diameter or an F-number), the fields (angle and weight, up to 12) and the wavelengths (nm and weight, one primary, up to 12; **Visible (F, d, C)** sets the usual three). The stop opens to suit the entrance pupil these set, and its opening on the bench follows.

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
| Glass | inside a lens, any glass in the catalogue by name; air between parts |
| Clear radius | a lens surface's own; set larger than its lens, the lens is made larger. The stop's is set by the aperture |
| Conic | the conic constant k |

Beside each radius, thickness and conic:

- **V** marks it a variable: what an optimiser may change. It is kept with the design; the optimiser comes with the next stage.
- **…** sets a **solve** or a **pickup**, shown as **S** or **P**, its value then worked out and shown in grey:
  - *Paraxial focus* (the image distance): the image plane where the marginal ray of the primary wavelength crosses the axis, the back focal distance. A new design has it.
  - *F-number* (a radius): the curvature that gives the system the working F-number asked for, with the entrance pupil as set. The system's power is affine in one surface's curvature, so two paraxial traces give it exactly.
  - *Edge thickness* (a thickness): the centre thickness that leaves the edge, at the smaller clear radius of its two surfaces, as thick as asked: $$t = e - \text{sag}_2(h) + \text{sag}_1(h)$$.
  - *Pickup*: the value follows another surface's same quantity, times a scale plus an offset (a radius picked up times −1 makes a lens symmetric).

  Pickups are worked out, then the solves, then the pickups again, twice over so a chain settles, then the image distance.

Click a row to select it. **Insert a surface** puts a flat surface after it: inside a lens it splits the glass in two (a cemented doublet); after a lens's back it adds 2 mm of the same glass behind. **Insert a singlet** puts a flat N-BK7 singlet 2 mm thick in the air after the selected part (with the Object row selected, in front of the first surface; with nothing selected, at the end), pushing the rest back only if there is no room. **Remove** takes a surface out, or a lens of two surfaces whole. Every other surface keeps its place along the axis, and marks, solves and pickups stay with the surfaces they belong to.

### Analyses

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

**File › Import a lens (.zmx)** reads a file of several lenses (air between them), or one with a stop of its own, as an assembly of its parts, with the file's aperture, fields and wavelengths as its conditions. **Export as a lens file** from an assembly's panel writes its prescription with the stop where it is, and its conditions. Coatings, tilts and decentres are not written.

## In a .jekray file

Assemblies are listed under `"assemblies"`: each `{"id", "name", "ref", "rev", "cond", "design"}`, its parts carrying its `id` as their `"group"`. `ref` is the part whose facing sets the axis and `rev` is true when the light runs against it. `design`, when it has one, holds the image distance (`"image"`), the variables (`"vars"`), the solves (`"solves"`) and the pickups (`"pickups"`), each value named by a key: `"R:<part id>.<surface>"` (a radius), `"k:…"` (a conic), `"t:…"` (the gap after that surface) or `"t:image"`.
