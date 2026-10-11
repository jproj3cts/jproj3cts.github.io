---
layout: docs
title: FAQ
permalink: /jek/docs/jekray2d/faq/
description: Common questions about JEKray2D, its models and its limits.
---

<p class="dx-lead">Common questions about what JEKray2D does, how far to trust it, and how to get the most from it.</p>

## General

### Is JEKray2D free?

Yes. The simulator is free under the [JEKray2D Licence](/jek/tools/jekray2d-licence.html). JEKrayPro is an optional subscription that adds a cloud account: benches saved online with version history, forks, team workspaces and your own parts library.

### Does my bench leave my computer?

Not unless you choose to send it. The simulator runs in your browser and your bench is autosaved there. A share link carries the bench in the part of the address after #, which browsers never send to a server. Only benches you save to a JEKrayPro account are stored online.

### Which browsers does it run in?

Current Chrome, Edge, Firefox and Safari. It runs heavy work in background threads, so a recent computer helps with large benches and the diffracted field.

## Models

### How accurate is it?

The ray tracer is exact for the geometry it models: real surfaces, real glass (Sellmeier data), Fresnel coefficients and coatings. The Gaussian-beam and diffracted-field models are paraxial except where they say otherwise. Near a steep focus the field is summed directly by the Rayleigh–Sommerfeld integral. The [validation page](/jek/tools/jekray2d-validation.html) compares the results with analytic answers and published data, and runs in your browser.

### Why is everything in a plane?

A 2D bench is how most optical setups are drawn and planned, and it keeps the tool quick and clear. The diffracted field is still worked out properly. Each element is a figure of revolution about its axis in the plane, so a beam's field out of the plane follows from its field in the plane. Where tilts break that symmetry, a full 2D field is used. What cannot be done is anything that leaves the plane, such as a periscope or skew rays.

### Can I see my bench in 3D?

Yes, for a tab of free-space parts: use the **2D / 3D** switch at the bench's top right (see [Getting started: the 3D view](/jek/docs/jekray2d/getting-started/#the-3d-view)). It shows the same bench in three dimensions. Every free-space part can be raised, tipped and rolled, and the light follows exactly, rays, beams and the diffracted field alike: periscopes, misaligned cavities, rolled cylinders and Dove prisms (see [Free-space optics: heights](/jek/docs/jekray2d/free-space/#heights)). Parts are still placed by x and y on the bench, and fibre, electronic and chip parts stay on 2D tabs of their own.

### Why don't two of my lasers interfere?

Light from separate lasers adds as powers, never as fields, as it does in the lab: two free-running lasers have no steady phase between them. On a photodiode they still *beat* at the difference of their frequencies, and that beat is listed with the line width of both. To make two beams interfere, make the second source *split from* the first. They are then one launch.

### Why do my fringes fade?

Because the paths differ by more than the laser's coherence length. A source with a line of its own has a coherence length $$L_c = c/\Delta\nu$$, and fringe contrast falls with the path difference (see [Concepts](/jek/docs/jekray2d/concepts/#launches-and-coherence)). Set the source to a single frequency if you want fringes at any path difference.

### My cavity shows no resonance. What is wrong?

A cavity is found from the light's own path, so the light has to make at least two round trips before the tracer stops following it. Raise **Interactions per ray** (on the Bench panel) to about 40, and lower **Power floor** to about 1e-4 so faint round trips are kept. Then check that the mirrors face each other and the cavity is stable: the Bench panel's Cavity tab says so.

### What is the difference between rays and the beam?

A source can launch a *ray fan*, many rays across its width, and a *Gaussian beam*, one reference ray with a beam parameter. Ray fans show geometry: spots, aberrations, vignetting. The Gaussian beam carries the diffracted field: focus sizes, interference, coupling into fibres and cavity modes. You can have both at once.

## Using it

### How do I model a part from a catalogue?

Type in its prescription: radii, thicknesses, glass and diameter for a lens. Or import a Zemax file: **File › Import a lens (.zmx)** reads the files Thorlabs, Edmund and other makers publish. With JEKrayPro you can keep parts in **My parts** to use on any bench.

### Can an AI assistant build a bench for me?

Yes. Give it the [guide for AI assistants](/jek/tools/jekray2d-ai-guide.md), ask for a `.jekray` file, and paste its answer with **Ctrl+V** on the bench. Anything it got wrong is listed in an import report you can hand back to it.

### How do I cite JEKray2D?

**Help › Cite JEKray2D**, or **Cite** on the bar, gives a reference to copy, with the version you used, and a BibTeX entry.

### I found something wrong.

Please tell us at [support@jeksys.net](mailto:support@jeksys.net), or use **Help › Report a bug**. The same goes for anything wrong or unclear in these pages.
