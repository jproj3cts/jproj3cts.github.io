---
layout: docs
title: STL object
permalink: /jek/docs/jekray2d/free-space/stl/
description: An opaque object brought into JEKray2D from a .stl file (a mount, a housing, a baffle), placed and turned in 3D, that stops the light that meets it.
element: { palette: Free space, type: stl }
---

<p class="dx-lead">An STL object is any shape brought in from CAD as a .stl file: a mount, a post, a housing, a baffle. It is opaque: every ray that meets it stops there, as on a beam block.</p>

## Bringing one in

Choose **Open ▾ → Import an object (.stl)**, or drop the .stl file onto the bench (in 2D or 3D). The object lands where it was dropped, or in the middle of the view, resting on the breadboard. Binary and text .stl files are both read, up to 200,000 triangles.

An STL file carries no units. JEKray2D takes them as millimetres, as most CAD exports are; set **Units of the file** to centimetres, metres, inches or any scale if yours are not. The object is centred on its bounding box, and placed and turned as any part: by its x and y, its **Height** (of its centre), and its **Facing**, **Tip** and **Roll**, or with its arrows and rings in the 3D view. **Replace its shape** loads another file into the same place.

The triangles are kept with the bench, so a saved bench, a cloud bench or a share link carries the object. They are kept compactly: corners shared by triangles once, and each coordinate as one of 65 536 steps across the object (1.5 µm on a 100 mm part). A mesh of more than 40 000 triangles is simplified as it comes in, by merging the corners that fall in each cell of a grid just coarse enough, so that a bench with a CAD part in it still fits the cloud's 2 MB. The panel says when it was, and to what detail; since the object only stops light, its outline is what matters.

**★ Save to My parts** in its panel keeps it in your parts library (with JEKrayPro), to add to any bench from **+ Add part**. A part can be at most 256 KB, so a large mesh is simplified further for the part, if it must; the object on the bench keeps its detail.

## The model

A ray is taken into the object's own frame (its facing, then its tip, then its roll, as the 3D view draws it) and met against its triangles exactly (Möller and Trumbore's test), through a bounding-volume tree that keeps a mesh of many thousand triangles quick to trace. The nearest triangle it meets is where it stops. A Gaussian beam whose centre meets the object ends there, and its field with it.

On the 2D bench the object is drawn as its outline seen from above: the convex hull of its vertices, tipped and rolled as it is.

## Why not glass?

An STL file approximates every surface by flat triangles. A flat face is exact, but a curved one is not: a sphere of radius $$R$$ drawn with facets of width $$a$$ misses its true sag by about $$a^2/8R$$, and its normal jumps by about $$a/R$$ from one facet to the next. For imaging, a surface must be right to a fraction of a wavelength (say $$\lambda/10$$, 60 nm) and its slope to well under a milliradian. For a 25 mm lens of radius 50 mm that needs facets of about 0.15 mm, some 30,000 triangles a surface; CAD exports are usually far coarser (a chordal tolerance of 0.01 to 0.1 mm), which would scatter the rays by degrees. So an STL object is taken as opaque. For refracting optics, use JEKray2D's own lenses, prisms and windows, or import a lens's prescription from a .zmx file.

## Settings

{% include jekray2d_params.html group="free" key="stl" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Opaque and black: it neither reflects nor scatters what it stops.
- A beam that only grazes it, its centre passing by, is not cut by it; for a beam half-blocked by an edge, use a [stop](/jek/docs/jekray2d/free-space/stop/) (a knife edge or a beam block).
- The file's units are taken as millimetres unless set otherwise.
</div>

## Related

- [Stop](/jek/docs/jekray2d/free-space/stop/), for an iris, a slit, a knife edge or a beam block that cuts the field too.
- [Getting started: the 3D view](/jek/docs/jekray2d/getting-started/#the-3d-view), for placing it.
