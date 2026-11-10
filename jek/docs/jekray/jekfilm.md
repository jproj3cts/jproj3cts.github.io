---
layout: docs
title: JEKfilm
permalink: /jek/docs/jekray/jekfilm/
description: "JEKfilm, the JEK coating designer: a thin-film stack on a substrate, judged over a band of wavelengths and a range of angles, its thicknesses optimised, kept as a .jekfilm file or in the cloud beside your benches."
---

<p class="dx-lead">JEKfilm designs one thin-film coating at a time: a stack of layers on a substrate, what it is for, what it reflects across the band and against the angle, and the thicknesses that do it best. It uses the thin-film model JEKray traces with, so a coating designed in JEKfilm behaves the same on a JEKray bench.</p>

Open it at [jeksys.net/jek/tools/jekfilm.html](/jek/tools/jekfilm.html), from [JEKsuite](/jek/docs/jekray/jeksuite/) (**New › JEKfilm coating**, or **JEKfilm** at the top of its left-hand list), or from JEKray: **Tools › Coating design in JEKfilm…**, or a face's **Design a coating in JEKfilm…**. It opens in a tab of its own, reused each time.

**File › Open an example…** opens one of six coatings to start from: a V-coat for 1064 nm, a broadband AR over 420–680 nm, a 1064 nm HR mirror, a long-pass edge at 600 nm, a 45° plate beam splitter and protected silver. A link to `jekfilm.html?demo=hr-1064` (or any of `vcoat-1064`, `bbar-visible`, `longpass-600`, `splitter-45`, `protected-silver`) opens one directly.

## The design

The **Design** table on the left says what the stack is for and the light it is judged in:

- **Target**: anti-reflection (nothing reflected), a high reflector (everything reflected), a beam splitter (with the reflectance wanted), or a dichroic edge (with the wavelength it turns at and which side passes).
- **Reference λ₀**: the design wavelength, where quarter waves are counted. **Band from** and **Band to**: the wavelengths the stack is judged over. **Angles**: either **Up to** a largest angle of incidence (from square on), or **A band** of angles, from one to another (a beam splitter at 40° to 50°, say). **Polarisation**: s, p or their mean.
- **Incident medium n**: the index in front (1 for air, about 1.33 for water).
- **Substrate**: N-BK7, fused silica, B270, the flints, CaF2, MgF2, sapphire, and ZnSe, silicon and germanium for the infrared, each with its dispersion (its index at λ₀ is shown), or an index of your own. JEKfilm says when the substrate is not transparent at λ₀.

## Reflectance

The reflectance against wavelength (at the smallest angle judged, at the largest, and the target dashed), and against the angle of incidence at λ₀, s and p. Move the pointer over a plot to read its values.

Under the plots, the figures: the mean and largest reflectance over the band at the smallest angle judged, and at the largest when they differ; the reflectance at λ₀; the bare substrate's; and the merit, the mean square of the reflectance against its target over the band and the angles.

## Layers

The table lists the stack from the incident medium down to the substrate: each layer's material (MgF2, SiO2, Al2O3, a mid index, ZrO2, Ta2O5, TiO2, an index of your own, or a metal: silver, aluminium or gold), its index, its physical thickness in nanometres and its optical thickness in quarter waves at λ₀, with the total thickness underneath. **λ/4** makes a layer a quarter wave and **✕** removes it; **All quarter waves** does every layer; **Add layer** adds one; **Preset…** puts in a single MgF2 layer, a two-layer V-coat, a three-layer broadband AR, a three-layer 50:50 splitter or a six-pair high reflector, each for λ₀, or a metal mirror: protected silver or aluminium (a half-wave SiO2 overcoat), enhanced aluminium (a quarter-wave pair on it) or bare gold.

**Metal layers** absorb. Each takes its complex index n − ik at every wavelength from measured data: silver and gold from Johnson and Christy (Phys. Rev. B 6, 4370, 1972, to 1.94 µm), aluminium from Rakić (Appl. Opt. 34, 4755, 1995, to 20 µm), through the refractiveindex.info database. The table shows a metal's n − ik at λ₀ in place of its index, and no quarter waves; the optimiser works its thickness in nanometres. A thick film reflects as the bulk metal does, and what a stack neither reflects nor passes is absorbed, on a JEKray face too.

**Optimise thicknesses** searches the thicknesses from where they stand (Nelder–Mead, with restarts), keeping each layer's material. Choose the materials and a starting stack, then let the thicknesses settle. Undo (Ctrl+Z) takes it back.

**Add layers (needle)** grows the stack where it helps. At each round a 2 nm layer of each material is tried at every place in the stack (between layers, and inside each layer, splitting it), the one that lowers the merit most is put in, the thicknesses are settled, and any layer thinner than 1 nm is taken out (its neighbours joined if they are the same material). It stops when no layer helps, or at ten layers more than it started with. Its materials are those already in the stack, or SiO2 and Ta2O5 if it has fewer than two.

**Choose materials** tries each layer as each material of the list, keeping its optical thickness so a quarter wave stays one, and keeps the change that helps most, layer by layer, for up to three passes; then the thicknesses are settled. Both leave a metal layer as it is, and both are one step of Undo.

## Tolerance

How the coating fares as made. Give each layer's thickness error σ, as a share of the layer or in nanometres, and the number of runs, then **Run**: each run puts a normal error of that σ on every layer, the same runs each time (a fixed seed). The table gives the merit and the band's mean and largest reflectance as designed (nominal), in the middle run (median) and in the run nine in ten do better than (90th percentile); the plot draws the reflectance as designed, the median, and the 5th and 95th percentiles at each wavelength. The settings are kept with the coating. Tolerancing is JEKrayPro's.

## Files and the cloud

The coating you are working on is kept in this browser as you go. With [JEKrayPro](/jek/products/design-software/jekray/), **File › Save as .jekfilm** (Ctrl+S) saves it as a file and **File › Save to the cloud…** keeps it in the cloud with your benches. Choose the workspace and the folder: put it in the folder of the benches it is for. Once in the cloud it saves itself as you work, Ctrl+S keeps a version, and JEKsuite shows it with its history, forks and the Bin, like any bench. Opening a .jekfilm file and exporting the curves (**File › Export the curves (CSV)**, with a free account) need no plan; optimising does.

## On a JEKray bench

**Designing for a face.** A face's **Design a coating in JEKfilm…** (or the lens designer's face table) opens JEKfilm on that face's glass, at the bench's wavelength, with the face's stack, and a line along the top says which face it is for. **Save to the cloud…** then starts in the bench's own workspace and folder, and once saved the coating goes onto that face in JEKray, linked to it. Saving to the cloud is JEKrayPro's.

**Coatings kept in JEKray.** Coatings kept by name with JEKray's earlier coating designer are listed in **File › Coatings kept in JEKray…**: open one, then save it to the cloud to keep it with your benches.


A coating face's **Coating** list (a lens or window face, a beamsplitter cube, a prism) offers the JEKfilm coatings kept in the same cloud folder as the bench, each marked ◆, and **A JEKfilm coating from a file…** for a .jekfilm on your computer. Choosing one puts its layers on the face at its design wavelength; the face keeps its own glass as the substrate.

The face keeps a copy of the stack, so the bench traces, shares and opens offline as it always did. A coating from the cloud stays linked to it: the face says which coating and which version it has, with **Open in JEKfilm**. When the coating is saved again in JEKfilm, the bench offers to update its faces when it is next opened (or straight away, if it is open in another tab). Nothing changes until you choose **Update the faces**, and Undo takes it back. To edit a linked face's layers on the bench instead, choose **Thin-film stack**: the face keeps the layers as its own, no longer linked.

A .jekfilm file is JSON: the coating's name, what it is for (`spec`), and its `layers`, each an index `n` and a thickness `d` in nanometres, from the outside in.
