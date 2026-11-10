---
layout: docs
title: Matching layers
permalink: /jek/docs/jekray/coating-design/
description: "Design an RF lens's matching layer in JEKray: a printed skin a quarter wave thick, judged over the system's band, its thickness and density optimised, and put on the lens's faces. Optical coatings are designed in JEKfilm."
---

<p class="dx-lead">An RF lens's faces can carry a matching layer: a skin of the lens's own plastic printed less dense, a quarter wave thick at the design frequency. The matching-layer workspace shows what the faces reflect across the band and against the angle, and optimises the layer. Optical coatings (anti-reflection, reflectors, splitters, edges) are designed in <a href="/jek/docs/jekray/jekfilm/">JEKfilm</a>, which sends them back to the face.</p>

## Opening it

- **From the RF designer.** Beside a lens's **Matching layers**, **Design…** opens the workspace on its faces, at the system's frequency and over its band; **Use this coating** puts the layer on both faces.
- **From an RF face.** An RF lens face's **Coating** setting offers **Design a matching layer…** at the bottom of its list.

**Back to the bench** (or Esc) leaves without writing anything.

An optical face's **Design a coating in JEKfilm…**, the lens designer's face table and **Tools › Coating design in JEKfilm…** open [JEKfilm](/jek/docs/jekray/jekfilm/) in its own tab. Started from a face, JEKfilm begins on that face's glass at the bench's wavelength with the face's stack, and saving the coating to the cloud (in the bench's folder, chosen for you) puts it on the face, linked.

## The layer

The workspace takes the frequency in GHz and the band as a share either side, the lens's plastic as the substrate, and the largest angle of incidence. The layer table gives each layer's density (which sets its index, by the mixing rule for the printed plastic), its index, its thickness in mm and that thickness in quarter waves at the design frequency. **Optimise thicknesses** searches the thicknesses from where they stand. A single layer named Matching layer is what the quote and the manufacturable check look for; a stack of more is traced as given.

## What is traced

The reflectance is the stack's power reflectance from the characteristic matrices of its layers, the same calculation the bench's rays, the diffracted field, the lens designer's polarisation trace and the RF designer's reflections take for a coating given as a stack (see [Coatings](/jek/docs/jekray/free-space/#coatings)). A coating written to a face is a stack (`mode: 'stack'`, its design wavelength and its layers' indices and thicknesses), so a face carries the design itself, not a reflectance that stands for it, and meets it at every angle and wavelength the light has. The indices are taken as constant across the band.

A coating kept by name in this browser before JEKfilm still appears at the bottom of every face's Coating list (★); JEKfilm's **File › Coatings kept in JEKray…** opens each one there, to save to the cloud. Choosing it writes its stack to the face, and the bench then carries the stack.

**Checked against.**
- a quarter-wave MgF₂ layer on N-BK7 at 550 nm square on: $$((n_s - n_c^2)/(n_s + n_c^2))^2$$, 1.26%, to 10⁻⁹, and the same number the bench reads from that stack on a face, to 10⁻¹²;
- the optimiser brings a three-layer stack on N-BK7 from a poor start to under 0.5% mean reflectance over 450 to 650 nm out to 20°, a three-layer splitter to 50% ± 2% at 550 nm, and an RF matching layer of index $$\sqrt{n}$$ on PLA from half its thickness to a quarter wave, reflecting under 10⁻⁴ at 24 GHz;
- an eight-pair quarter-wave stack set as an edge reflects over 95% at its design wavelength and under half of the light well away from it, s and p alike square on;
