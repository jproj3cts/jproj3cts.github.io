---
layout: docs
docs: jekion
title: FAQ
permalink: /jek/docs/jekion/faq/
description: Answers to the questions people ask about JEKion.
---

**Is it SIMION?** No. JEKion is JEK Systems' own simulator, written for the browser, with the same job: electrostatic fields on a grid, superposed per electrode, and particles flown through them. It does not read SIMION's files. Its numbers are checked against closed forms in its [tests](/jek/tools/jekion-tests.html); for anything that gets built or published, check against an established package.

**Why do the ions fly again when I change a voltage but the page pauses when I move an electrode?** A voltage only scales a solved potential; a move changes the geometry, so every electrode's potential is solved again ([the array](/jek/docs/jekion/array/)).

**The potential looks wrong near a curved electrode.** It is a staircase a node high: halve the spacing and see what moves. Two electrodes that nearly touch need several nodes between them.

**My array floats at one voltage.** With one electrode and every edge open the whole array is at its voltage: there is nothing else for the potential to go to. Ground an edge, or add the other electrode.

**How fine a spacing can I use?** The browser holds four million nodes: 2000 × 2000 planar or cylindrical, or about 158³ in three dimensions. Solving takes a few tens of milliseconds for a small array and a second or two an electrode for a large three-dimensional one; turn off *Fly after every change* while you edit a heavy one.

**Does it do magnetic sectors?** A uniform field over the whole array only, for now: a Penning trap, a cyclotron orbit, a Wien filter with crossed fields. Shaped magnetic fields are not modelled.

**Where is the Python?** Scripts are JavaScript in this version. The data export reads straight into NumPy (`.npz`) and pandas.

**Can I share a bench as a link?** Yes: **Share** copies a short link that opens the bench as it is now ([files](/jek/docs/jekion/files/)). Or save the `.jekion` file and send it; a dropped file opens on the bench.
