---
layout: docs
title: JEKfilm
permalink: /jek/docs/jekray/jekfilm/
description: "JEKfilm, the JEK coating designer: a thin-film stack on a substrate, judged over a band of wavelengths and a range of angles, its thicknesses optimised, kept as a .jekfilm file or in the cloud beside your benches."
---

<p class="dx-lead">JEKfilm designs one thin-film coating at a time: a stack of layers on a substrate, what it is for, what it reflects across the band and against the angle, and the thicknesses that do it best. It uses the thin-film model JEKray traces with, so a coating designed in JEKfilm behaves the same on a JEKray bench.</p>

Open it at [jeksys.net/jek/tools/jekfilm.html](/jek/tools/jekfilm.html), or from [JEKspace](/jek/docs/jekray/jekspace/): **New › JEKfilm coating**, or **JEKfilm** at the top of its left-hand list. It opens in a tab of its own, reused each time.

## The coating

The card on the left says what the stack is for and the light it is judged in:

- **For**: anti-reflection (nothing reflected), a high reflector (everything reflected), a beam splitter (the reflectance you give), or a dichroic edge (reflecting one side of a wavelength and passing the other).
- **On**: the substrate. N-BK7, fused silica, B270, the flints, CaF2, MgF2, sapphire, and ZnSe, silicon and germanium for the infrared, each with its dispersion, or an index of your own. JEKfilm says when the substrate is not transparent at the design wavelength.
- **Light comes from**: the index of the medium in front (1 for air, about 1.33 for water).
- **Band**, **Design wavelength**, **Angles up to** and **Polarisation**: the wavelengths and angles the stack is judged over, and whether s, p or their mean counts.

## The figures and the curves

Along the top: the mean and worst reflectance over the band square on, and at the largest angle when there is one; the reflectance at the design wavelength; the bare substrate's; and the merit, the mean square of the reflectance against its target over the band and the angles. The plots show the reflectance across the band (square on, at the largest angle, and the target dashed) and against the angle at the design wavelength, s and p. Move the pointer over a plot to read its values.

## The layers

The table lists the layers from the outside in: each one's material (MgF2, SiO2, Al2O3, a mid index, ZrO2, Ta2O5, TiO2, or an index of your own), its index, its thickness in nanometres and its optical thickness in quarter waves at the design wavelength. **λ/4** makes a layer a quarter wave; **All quarter waves** does every layer. **Start from a preset** puts in a single MgF2 layer, a two-layer V-coat, a three-layer broadband AR, a three-layer 50:50 splitter or a six-pair high reflector, each for the design wavelength.

**Optimise thicknesses** searches the thicknesses from where they stand (Nelder–Mead, with restarts), keeping each layer's material. Choose the materials and a starting stack, then let the thicknesses settle. Undo (Ctrl+Z) takes it back.

## Files and the cloud

The coating you are working on is kept in this browser as you go. With [JEKrayPro](/jek/products/design-software/jekray/), **File › Save as .jekfilm** (Ctrl+S) saves it as a file and **File › Save to the cloud…** keeps it in the cloud with your benches. Choose the workspace and the folder: put it in the folder of the benches it is for. Once in the cloud it saves itself as you work, Ctrl+S keeps a version, and JEKspace shows it with its history, forks and the Bin, like any bench. Opening a .jekfilm file and exporting the curves (**File › Export the curves (CSV)**, with a free account) need no plan; optimising does.

A .jekfilm file is JSON: the coating's name, what it is for (`spec`), and its `layers`, each an index `n` and a thickness `d` in nanometres, from the outside in.
