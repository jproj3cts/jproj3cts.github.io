---
layout: docs
title: STL object
permalink: /jek/docs/jekray/free-space/stl/
redirect_from: /jek/docs/jekray2d/free-space/stl/
description: An opaque object brought into JEKray from a .stl or STEP file (a mount, a housing, a baffle), placed and turned in 3D, that stops the light that meets it.
element: { palette: Free space, type: stl }
---

<p class="dx-lead">An STL object is any shape brought in from CAD as a .stl or STEP file: a mount, a post, a housing, a baffle. It is opaque: every ray that meets it stops there, as on a beam block.</p>

## Bringing one in

Choose **File › Import an object (.stl, .step)…**, or drop the .stl, .step or .stp file onto the bench (in 2D or 3D). The object lands where it was dropped, or in the middle of the view, resting on the breadboard. Binary and text .stl files are both read, up to 200,000 triangles.

An STL file carries no units. JEKray takes them as millimetres, as most CAD exports are; set **Units of the file** to centimetres, metres, inches or any scale if yours are not. The object is centred on its bounding box, and placed and turned as any part: by its x and y, its **Height** (of its centre), and its **Facing**, **Tip** and **Roll**, or with its arrows and rings in the 3D view. **Replace its shape** loads another file into the same place.

## From a STEP file

A STEP file (.step or .stp, ISO 10303-21, as every CAD program and most makers' download pages offer) describes its solids exactly, by their faces, and is turned into triangles as it comes in. The reading is done by [OpenCascade](https://github.com/Open-Cascade-SAS/OCCT), through [occt-import-js](https://github.com/kovacsv/occt-import-js): a 7.6 MB program fetched the first time you bring in a STEP file (the message says how far its download has come) and kept by your browser after that, run in the background so the bench never waits on it. It needs a connection the first time; offline, the import says so.

**Units.** A STEP file says what unit it is in, and JEKray reads it in that unit: millimetres, centimetres, metres or inches (a file in feet is read in inches), set as the object's **Units of the file**, so nothing needs setting. A file that declares none is read in millimetres.

**Several parts.** An assembly (a mount and its screws, a post and its holder) holds several solids. JEKray asks how to bring them in:

- **Separate parts**: an object for each solid, named from the file's parts ("bolt", "nut (2)"; "*file* part 3" where the file names none), coloured as the file colours them, placed where the file has them and grouped, so they are picked and moved as one; Ctrl+click picks one of them, and **Ungroup** in their panel lets them go.
- **One object**: every solid merged into a single object.

The choice you make is kept as the default for the next file. A file of one solid comes in as one object without asking.

**How finely.** Each solid is tessellated to a chord of a thousandth of the model's size (0.1 mm on a 100 mm mount) and at most 20° a facet round a curve, which brings a typical mount in at a few thousand triangles. A model that comes to more than 30,000 triangles is tessellated again, more coarsely, up to three times; only if it is still over 40,000 is it simplified as an STL file is (below). The separate parts share those 40,000 between them by size.

## Kept with the bench

The triangles are kept with the bench, so a saved bench, a cloud bench or a share link carries the object. They are kept compactly: corners shared by triangles once, and each coordinate as one of 65 536 steps across the object (1.5 µm on a 100 mm part). A mesh of more than 40 000 triangles is simplified as it comes in, by merging the corners that fall in each cell of a grid just coarse enough, so that a bench with a CAD part in it still fits the cloud's 2 MB. The panel says when it was, and to what detail; since the object only stops light, its outline is what matters.

**★ Save to My parts** in its panel keeps it in your parts library (with JEKrayPro), to add to any bench from **+ Add part**. A part can be at most 256 KB, so a large mesh is simplified further for the part, if it must; the object on the bench keeps its detail.

## The model

A ray is taken into the object's own frame (its facing, then its tip, then its roll, as the 3D view draws it) and met against its triangles exactly (Möller and Trumbore's test), through a bounding-volume tree that keeps a mesh of many thousand triangles quick to trace. The nearest triangle it meets is where it stops. A Gaussian beam whose centre meets the object ends there, and its field with it.

On the 2D bench the object is drawn as its outline seen from above: the convex hull of its vertices, tipped and rolled as it is.

## Why not glass?

An STL file approximates every surface by flat triangles. A flat face is exact, but a curved one is not: a sphere of radius $$R$$ drawn with facets of width $$a$$ misses its true sag by about $$a^2/8R$$, and its normal jumps by about $$a/R$$ from one facet to the next. For imaging, a surface must be right to a fraction of a wavelength (say $$\lambda/10$$, 60 nm) and its slope to well under a milliradian. For a 25 mm lens of radius 50 mm that needs facets of about 0.15 mm, some 30,000 triangles a surface; CAD exports are usually far coarser (a chordal tolerance of 0.01 to 0.1 mm), which would scatter the rays by degrees. So an STL object is taken as opaque. For refracting optics, use JEKray's own lenses, prisms and windows, or import a lens's prescription from a .zmx file.

## Settings

{% include jekray_params.html group="free" key="stl" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Opaque and black: it neither reflects nor scatters what it stops.
- A beam that only grazes it, its centre passing by, is not cut by it; for a beam half-blocked by an edge, use a [stop](/jek/docs/jekray/free-space/stop/) (a knife edge or a beam block).
- An STL file's units are taken as millimetres unless set otherwise; a STEP file's are its own.
- A STEP file's solids are kept as triangles: their exact faces are not, and its curved faces are flat facets to the chord above.
</div>

## Related

- [Stop](/jek/docs/jekray/free-space/stop/), for an iris, a slit, a knife edge or a beam block that cuts the field too.
- [Getting started: the 3D view](/jek/docs/jekray/getting-started/#the-3d-view), for placing it.
