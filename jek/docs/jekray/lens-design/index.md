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
