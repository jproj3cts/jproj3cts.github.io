---
layout: docs
title: Lens design
permalink: /jek/docs/jekray/lens-design/
description: Assemblies in JEKray. Lenses and stops on one axis are made one assembly, read as one prescription and designed together, then used on the bench as the parts they are.
---

<p class="dx-lead">An assembly is a set of lenses and stops on one axis that are designed together: a doublet, a triplet, an objective. Its parts stay the bench's own parts, traced as they always are, so making one changes nothing the light does. What it adds is the view a lens designer works in: the parts read as one sequence of surfaces, with the conditions the design is for.</p>

## Making an assembly

Select the lenses and stops (Shift- or Ctrl-click, or drag a box round them), then **Make an assembly** in their panel or from the right-click menu. They must be:

- lenses round about their axes (not cylindrical), round irises, or windows;
- on one axis: facing along it (a lens either way round), on it to within a micrometre, at one height and upright;
- not overlapping.

If they are not, the panel says which part is in the way and why. The light is taken to run away from a source on the axis; with none on it, the way most of the lenses face.

An assembly is picked and moved as one, drawn with a dashed outline and its name. Ctrl-click one of its parts to edit that part alone; if a part is then moved off the axis, the outline turns red and the panel says so. **Split into parts** gives back the separate lenses and stops, where they are.

**File › New lens design** puts a starting assembly on the bench: a stop 10 mm across and a biconvex N-BK7 singlet of about 50 mm focal length, designed for the F, d and C lines.

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

## Lens files

**File › Import a lens (.zmx)** reads a file of several lenses (air between them), or one with a stop of its own, as an assembly of its parts, with the file's aperture, fields and wavelengths as its conditions. **Export as a lens file** from an assembly's panel writes its prescription with the stop where it is, and its conditions. Coatings, tilts and decentres are not written.

## In a .jekray file

Assemblies are listed under `"assemblies"`: each `{"id", "name", "ref", "rev", "cond"}`, its parts carrying its `id` as their `"group"`. `ref` is the part whose facing sets the axis and `rev` is true when the light runs against it.
