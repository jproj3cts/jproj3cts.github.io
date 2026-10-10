---
layout: docs
title: Getting started
permalink: /jek/docs/jekray2d/getting-started/
description: Your first bench in JEKray2D, the parts of the window, and saving and sharing your work.
---

<p class="dx-lead">This page takes you through a first bench: a laser, a lens and a screen. It then tours the window, and shows how to keep and share what you make.</p>

## A first bench

1. Open [JEKray2D](/jek/tools/jekray2d.html). A new bench is empty. If it isn't, choose **File › New bench**.
2. Click **+ Add part** (or press **A**), choose **Source**, and click the bench to place it. A fan of rays leaves it to the right.
3. Add a **Lens** about 50 mm to the right of the source, and a **Screen** beyond it, facing back towards the light.
4. Drag the screen along the beam. Its panel on the right shows the spot it records. The spot is smallest at the lens's focus.

<div class="dx-tip" markdown="1">
Every example in the **Examples** gallery is a working bench. Open one, change it, and press **Ctrl+Z** to undo. Your own bench comes back with Undo after an example has replaced it.
</div>

## The window

**The bench** is the large dark area. Drag an element to move it, drag its round handle to turn it, and scroll to zoom. Drag on empty bench to select several elements with a box. Right-click for a menu of what you can do with what is under the pointer.

**The parts rail** runs down the left edge of the bench. Its coloured buttons choose a palette of parts:

- **Free** (orange): free-space optics;
- **Fibre** (red): fibre components;
- **Elec** (amber): electronics;
- **Draw** (purple): drawing tools for figures.

The buttons below the palette open groups of parts.

**The panel** on the right shows whatever is selected. With nothing selected, it shows the whole bench: its parts, notes and settings. With an element selected, it shows that element's settings and readouts.

**The bar** along the top holds the File menu (under the bench's name), **+ Add part**, Undo and Redo, and the View, Sweeps and Help menus.

## Settings and sweeps

Every number in a panel can be typed or dragged. Beside most is **Sweep**: it moves the value back and forth over a range, and the bench follows as it plays. That is the quickest way to see how a system depends on one thing. The **Sweeps** menu also holds an optimiser and a tolerance study.

## Saving and sharing

- **Autosave.** Your bench is kept in this browser as you work, so closing the tab loses nothing.
- **File › Save as .jekray** saves a file you can open again anywhere.
- **Share link** puts the whole bench in a link. Anyone who opens it sees your bench, and nothing is stored on a server.
- **File › Export layout** saves a PNG, SVG or PDF of the bench for a paper or a talk. **Export layout (current view)** saves just what is on screen.
- With JEKrayPro, benches can be saved to your account, with version history, forks and team workspaces.

## Where to go next

- [Concepts](/jek/docs/jekray2d/concepts/): coordinates, units and the ideas the rest of these pages use.
- [Free-space optics](/jek/docs/jekray2d/free-space/): how rays, beams and fields are worked out.
- The [FAQ](/jek/docs/jekray2d/faq/), for common questions.
