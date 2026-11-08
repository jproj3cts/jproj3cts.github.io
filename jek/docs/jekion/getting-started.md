---
layout: docs
docs: jekion
title: Getting started
permalink: /jek/docs/jekion/getting-started/
description: Your first bench in JEKion, the parts of the window, the 3D view, and saving your work.
---

<p class="dx-lead">A first bench (three tubes and a beam), then a tour of the window and how to keep what you make.</p>

## A first bench

1. Open [JEKion](/jek/tools/jekion.html). The first bench is an einzel lens: three tubes on an axis, a 2 keV argon beam through them, a screen beyond.
2. Click the middle tube. Its panel opens on the right: change **Voltage** from −1400 to −1000 V and watch the focus move out along the axis; the ions fly again as you type.
3. Drag a tube along the axis. The fields are solved again (a moment), then the ions fly.
4. Click the **Screen** for the spot the beam makes on it, its time-of-flight and energy spectra.
5. **+ Add › Ion group** puts a second beam on the bench; its panel sets the species, energy, place and direction.

<div class="dx-tip" markdown="1">
Every bench in the **Examples** gallery works. Open one, change it, and press **Ctrl+Z** to undo. Your own bench comes back with Undo after an example has replaced it.
</div>

## The window

**The bench** is the large area under the bar: a cut through the array, with the electrodes' sections, the potential as a colour map or equipotentials, the ion groups' starts, the detectors and the flown paths. Drag an electrode to move it (snapped to the grid spacing; Shift drags freely), scroll to zoom, right-drag or middle-drag to pan. Right-click for a menu of what you can do with what is under the pointer, including setting the **analysis point** for the trap analysis. The coordinates and the potential under the pointer show at the bottom.

In a **planar** or **cylindrical** array the cut is the array itself (the x–y plane, or the x–r plane drawn whole). In a **three-dimensional** array **View › Cut** chooses the x–y, x–z or y–z plane (keys **1**, **2**, **3**) and **Page up** / **Page down** move it a grid spacing at a time; the Bench panel's Display section types the position. A cut that would fall outside the array (a file saved on another plane) is moved to the analysis point, or the array's middle. The View menu holds what the bench shows: the cut, the potential as a map, equipotentials or both, the field strength |E| instead, the paths and what colours them (ion group, energy or time), the array's outline and nodes; the Display section has the numbers, how many equipotentials and the cut's position.

**The panel** on the right shows whatever is selected: an electrode, an ion group or a detector. With nothing selected it shows the whole bench: the array, the background gas, the magnetic field, the flying settings, the trap analysis, the display and the results of the last flight. The tab half way up the bench's right edge puts it away and brings it back.

**The bar** holds the menus, **File**, **Edit**, **View**, **Tools** and **Help**, then Undo, Redo, Fit and Fly, the bench's name, and **+ Add**, **Save**, Examples and your account at the right. The bar on the bench says what the simulation is doing (solving, flying, done) and stops a long flight.

**Flying** happens after every change (Tools › *Fly after every change*); for a heavy three-dimensional array turn that off and press **Fly** (or **Space**) when ready. **Esc** stops a flight.

## The 3D view

The **2D / 3D** switch at the bench's top right (or **View › 3D view**) shows the electrodes as solids, the array's box, the cut plane with its potential map or equipotentials as the View menu has them, the detectors, the ion groups' starts and the paths. Right-drag turns, middle-drag pans, the wheel zooms, **F** fits; click an electrode to select it. **PNG** saves the view as a picture (a free account).

## Keeping your work

The bench is autosaved in this browser as you work and comes back when you return. **Save** (Ctrl+S) writes a `.jekion` file, which **File › Open** or a drop on the bench reads back; a CAD file dropped on the bench becomes electrodes. Exports (pictures, data) need a free account; scripts and the richer exports are JEKrayPro's, the same account as [JEKray](/jek/tools/jekray.html)'s. [Files and examples](/jek/docs/jekion/files/) has the details.
