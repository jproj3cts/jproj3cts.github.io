---
layout: docs
docs: jekion
title: CAD import
permalink: /jek/docs/jekion/cad-import/
description: "Bringing electrodes in from a STEP or STL file: each body an electrode, how they are placed, scaled and painted, and what to check."
---

<p class="dx-lead">A trap, a lens stack or an ion guide designed in CAD comes in whole: each body of a STEP file becomes an electrode of its own, named from the file's parts; an STL file becomes one electrode.</p>

**File › Import electrodes (.step, .stl)**, **Insert › CAD body**, or drop the file on the bench. A STEP file is read by OpenCascade (the same reader JEKray uses, fetched once, 7 MB), which tessellates each solid into triangles, more coarsely if the whole comes to more than 30 000; the file's units are read from it (millimetres, centimetres, metres or inches). Each body is placed as it is in the file, or, dropped on the bench, the whole is centred where it was dropped. The array is made three-dimensional if it was not, and **Fit the array round the electrodes** runs. Each body's triangles are kept with the bench (16-bit steps across its box, a tenth of a micron on a 6 mm part).

Then set each electrode's **voltage** (and RF), add an ion group and fly. The bodies are painted into the array row by row from where their triangles cross each row (a watertight solid is needed, as CAD exports are), and the bench's cut shows their voxels and the cut through their triangles; the 3D view shows them as they are.

**What to check.** The spacing: a CAD trap's gaps and edges want several nodes across them, and a three-dimensional array of 150³ nodes solves in a second or two an electrode; the node count is in the Bench panel. Two bodies that touch in the file are two electrodes that touch here: give them the same voltage, or fix the model. A body too thin for the grid paints nothing and the panel says so.
