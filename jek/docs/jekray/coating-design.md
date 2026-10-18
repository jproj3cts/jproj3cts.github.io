---
layout: docs
title: Coating design
permalink: /jek/docs/jekray/coating-design/
description: "Design a thin-film coating in JEKray: an anti-reflection stack, a high reflector, a beam splitter, a dichroic edge or an RF matching layer, judged over a band of wavelengths and a range of angles, its thicknesses optimised, and put straight on a face."
---

<p class="dx-lead">A face's coating need not be one of the few offered. The coating workspace takes a stack of layers on a substrate, says what it is for, shows what it reflects across the band and against the angle, and optimises the thicknesses. What it designs is written to the face it came from, or kept by name for every face's Coating list. It uses the one thin-film model the bench, the lens designer and the RF designer trace with, so what is designed is what is traced.</p>

## Opening it

The workspace opens in four ways:

- **From a face.** Any coated face's **Coating** setting (a lens face, a window, a beamsplitter cube, a mirror) offers **Design a coating…** at the bottom of its list. The workspace opens on that face, with its glass as the substrate and its coating as the starting stack, and **Use this coating** writes the stack back.
- **From the lens designer.** On the **Polarisation** analysis, each face's coating can be chosen in the table; **Design a coating…** opens the workspace on that face.
- **From the RF designer.** Beside a lens's **Matching layers**, **Design…** opens the workspace on its faces, as an RF matching layer on its plastic, at the system's frequency and over its band; **Use this coating** puts the stack on both faces.
- **On its own.** **File › Open a workspace › Coating design** opens it with nothing to write to, on N-BK7 at 550 nm. **Keep as a coating…** then saves the stack by name.

**Back to the bench** (or Esc) leaves without writing anything.

## The coating

The left card says what the coating is for and what it is judged over:

| Setting | What it is |
|---|---|
| **For** | Anti-reflection (nothing reflected), High reflector (everything), Beam splitter (a chosen reflectance), Dichroic edge (reflects one side of a wavelength, passes the other) or Matching layer (RF; a lens face passing everything at its frequency). |
| **On** | The substrate: a common glass, an RF plastic, or an index of your own. From a face, it is that face's glass. |
| **Band** | The wavelengths it is judged over, in nm. For RF, the frequency in GHz and the band as a share either side. |
| **Design wavelength** | Where its quarter waves are counted. The band's middle unless set. |
| **Largest angle** | The coating is judged square on and out to this angle of incidence, in degrees. |
| **Polarisation** | Judged as the mean of s and p, or s or p alone. |
| **Reflectance** | For a splitter, what it should reflect, in %. |
| **Edge** | For a dichroic, the wavelength it turns at and which side passes. |

The figures above the plots give the mean and worst reflectance over the band, square on and at the largest angle, the reflectance at the design wavelength, and the bare substrate's for comparison. Two plots give the reflectance across the band (square on, at the largest angle, and the target) and against the angle at the design wavelength, s and p.

## The layers

The layers are listed from the outside in, each with its material (or, for an RF skin, its density, which gives its index), its index, its thickness in nm (mm for RF) and that thickness in quarter waves at the design wavelength. **λ/4** sets a layer to a quarter wave; **Remove** takes it out; **Add a layer** adds one on the inside; **All quarter waves** sets every layer to a quarter wave. The presets start a stack: a single MgF₂ layer, a two-layer V-coat, a three-layer broadband AR (λ/4, λ/2, λ/4 of low, high and middle indices), a three-layer 50:50 splitter, a six-pair high-reflector stack, or an RF matching layer of index $$\sqrt{n}$$.

**Optimise thicknesses** searches the thicknesses from where they stand (Nelder–Mead, each held between a hundredth of a quarter wave and four waves of optical thickness, three rounds from the best found) for the least mean square of the reflectance against the target over the band and the angles, with the polarisation chosen. The materials are yours to pick; the optimiser moves thicknesses only. A toast gives the merit before and after and how many stacks it tried.

## What is traced

The reflectance is the stack's power reflectance from the characteristic matrices of its layers, the same calculation the bench's rays, the diffracted field, the lens designer's polarisation trace and the RF designer's reflections take for a coating given as a stack (see [Coatings](/jek/docs/jekray/free-space/#coatings)). A coating written to a face is a stack (`mode: 'stack'`, its design wavelength and its layers' indices and thicknesses), so a face carries the design itself, not a reflectance that stands for it, and meets it at every angle and wavelength the light has. The indices are taken as constant across the band.

A kept coating lives in this browser (it is not part of a bench) and appears at the bottom of every face's Coating list by its name; choosing it writes its stack to the face, and the bench then carries the stack.

**Checked against.**
- a quarter-wave MgF₂ layer on N-BK7 at 550 nm square on: $$((n_s - n_c^2)/(n_s + n_c^2))^2$$, 1.26%, to 10⁻⁹, and the same number the bench reads from that stack on a face, to 10⁻¹²;
- the optimiser brings a three-layer stack on N-BK7 from a poor start to under 0.5% mean reflectance over 450 to 650 nm out to 20°, a three-layer splitter to 50% ± 2% at 550 nm, and an RF matching layer of index $$\sqrt{n}$$ on PLA from half its thickness to a quarter wave, reflecting under 10⁻⁴ at 24 GHz;
- an eight-pair quarter-wave stack set as an edge reflects over 95% at its design wavelength and under half of the light well away from it, s and p alike square on;
- in the page, the workspace opened from a lens face, set to 450–650 nm out to 20° and started from the broadband preset, comes under 0.5% mean reflectance when optimised, and **Use this coating** leaves a three-layer stack on that face, which the bench then traces.
