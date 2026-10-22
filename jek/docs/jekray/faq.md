---
layout: docs
title: FAQ
permalink: /jek/docs/jekray/faq/
redirect_from: /jek/docs/jekray2d/faq/
description: Common questions about JEKray, its models and its limits.
---

<p class="dx-lead">Common questions about what JEKray does, how far to trust it, and how to get the most from it.</p>

## General

### Is JEKray free?

The simulator is free under the [JEKray Licence](/jek/tools/jekray-licence.html), and so is the coating designer. The Optical and RF designers are free to open, build and analyse designs in, and an RF lens can be taken to a quote. JEKrayPro is a subscription that adds the designers' design work (the optimiser, tolerancing, design reports, lens drawings and exporting a design), short share links with embeds and QR codes, and a cloud account: benches saved online with version history, forks, team workspaces, and your own parts library. Exporting images and data (the layout, the 3D view, plots, a screen's numbers, .zmx and CAD files) and the experimental features under the Help menu need only an account: a free one is enough. Saving the bench as a .jekray file needs none. Universities can cover everyone with one licence.

### What does a free account give?

Exporting images and data: **File › Export layout** (PNG, SVG or PDF), the 3D view's **PNG**, every plot's **PNG** and **CSV**, a screen's **Export data (CSV)**, **File › Export an element (.zmx)** and an assembly's CAD files (.step, .stl). The experimental features under **Help › Experimental features…**. And a place in a team workspace when someone invites you (a seat paid for by the team gives you JEKrayPro). If your university has a JEKray licence, signing in with your university email gives you JEKrayPro at no cost; if it has none, a university email gets you the academic price. Saving to the cloud, short share links and My parts need JEKrayPro. The first time you sign in, with Google, Microsoft or a code emailed to your address, makes the account; the account menu, top right (**⋯** on a phone), has the ways in. Without an account your benches stay in this browser alone: save a .jekray file to keep one safe (that needs no account). In the menus and panels, a **Free account** badge marks what needs one and a **Pro** badge what needs JEKrayPro, each shown only until you have it.

### Does my bench leave my computer?

Not unless you choose to send it. Your bench is autosaved in this browser, and nothing is sent anywhere until you save it to the cloud, share it or export it. A share link, which JEKrayPro makes, keeps a copy of the bench with your account until you delete the link; anyone with the link can open it. Only benches you save to a JEKrayPro account, and the share links you make, are stored online.

### Does JEKray collect anything about how I use it?

Only anonymous counts: which parts are added (by type), which designers, analyses, examples and tours are opened, what is exported (by format), how long a visit lasts, the screen size class and browser family, and JEKray's own errors. They carry nothing that says who you are, are not linked to your account, and never include your benches, their names, file names or anything you type. None are sent from an embedded bench or when your browser sends Do Not Track or Global Privacy Control. Turn them off with **Share anonymous usage counts** in the account menu (top right) or on the [Your account](/jek/account.html) page. The [Privacy Policy](/jek/privacy.html#usage) has the details.

### Which browsers does it run in?

Current Chrome, Edge, Firefox and Safari. A recent computer helps with large benches and the diffracted field.

## Models

### How accurate is it?

The ray tracer is exact for the geometry it models: real surfaces, real glass (Sellmeier data), Fresnel coefficients and coatings. The Gaussian-beam and diffracted-field models are paraxial except where they say otherwise; near a steep focus the field is summed directly by the Rayleigh–Sommerfeld integral. The [validation page](/jek/tools/jekray-validation.html) compares the results with analytic answers and published data, live, each time it is opened.

### Is the bench two-dimensional?

The bench is drawn from above, as optical setups are planned, but the light is traced in three dimensions. Every free-space part can be raised, tipped and rolled, and rays, beams and the diffracted field all follow: periscopes, misaligned cavities, rolled cylinders and Dove prisms work (see [Heights](/jek/docs/jekray/free-space/#heights)). With everything in the plane, each part is a figure of revolution about its axis, so a beam's field out of the plane follows from its field in it; where a tilt breaks that symmetry a full 2D field is used. Fibre, electronic and chip parts stay in the plane.

### Can I see my bench in 3D?

Yes: the **2D / 3D** switch at the bench's top right, or **View › 3D view** (see [Getting started](/jek/docs/jekray/getting-started/#the-3d-view)). It shows the same bench in three dimensions, with the light as the trace has it, and parts can be moved and turned there with arrows and rings.

### Why don't two of my lasers interfere?

Light from separate lasers adds as powers, never as fields, as in the lab: two free-running lasers have no steady phase between them. On a photodiode they still *beat* at the difference of their frequencies, with the line width of both. To make two beams interfere, make the second source *split from* the first: they are then one launch.

### Why do my fringes fade?

Because the paths differ by more than the laser's coherence length. A source with a line width has a coherence length $$L_c = c/\Delta\nu$$, and fringe contrast falls with the path difference (see [Concepts](/jek/docs/jekray/concepts/#launches-and-coherence)). Set the source to a single frequency for fringes at any path difference.

### My cavity shows no resonance. What is wrong?

A cavity is found from the light's own path, so the light has to make at least two round trips before the tracer stops following it. In the Bench panel (the gear at the bench's bottom right) raise **Interactions per ray** to about 40 and lower **Power floor** to about 1e-4, so faint round trips are kept. Then check that the mirrors face each other and the cavity is stable: the Bench panel's Cavity tab says so.

### What is the difference between rays and the beam?

A source can launch a *ray fan*, many rays across its width, and a *Gaussian beam*, one reference ray with a beam parameter. Ray fans show geometry: spots, aberrations, vignetting. The Gaussian beam carries the diffracted field: focus sizes, interference, coupling into fibres and cavity modes. You can have both at once.

## Using it

### How do I model a part from a catalogue?

Type in its prescription: radii, thicknesses, glass and diameter for a lens. Or import a lens file: **File › Import an element (.zmx)…** reads the files lens makers publish. **File › Export an element (.zmx)** goes the other way, writing the selected lenses as a prescription that lens-design programs open (see [Lens](/jek/docs/jekray/free-space/lens/#exporting-a-lens)). With JEKrayPro you can keep parts in **My parts** to use on any bench.

### Can an AI assistant build a bench for me?

Yes. Give it the [guide for AI assistants](/jek/tools/jekray-ai-guide.md), ask for a `.jekray` file, and paste its answer with **Ctrl+V** on the bench. Anything it got wrong is listed in an import report you can hand back to it.

### How do I cite JEKray?

**Help › Cite JEKray**, or **Cite** on the bar, gives a reference to copy with the version you used, and a BibTeX entry.

### I found something wrong.

Please tell us at [support@jeksys.net](mailto:support@jeksys.net), or use **Help › Report a bug**. The same goes for anything wrong or unclear in these pages.
