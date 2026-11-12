---
layout: docs
title: Getting started
permalink: /jek/docs/jekray/getting-started/
redirect_from: /jek/docs/jekray2d/getting-started/
description: Your first bench in JEKray, the parts of the window, the 3D view, sweeps, and saving and sharing your work.
---

<p class="dx-lead">A first bench (a laser, a lens and a screen), then a tour of the window, the 3D view, sweeps, and how to keep and share what you make.</p>

## A first bench

1. Open [JEKray](/jek/tools/jekray.html). A new bench is empty; if it isn't, choose **File › New bench**.
2. Click **+ Add**, the top button of the parts rail on the bench's left (or press **A**), choose **Source**, and click the bench to place it. A fan of rays leaves it to the right.
3. Add a **Lens** about 50 mm to the right of the source, and a **Screen** beyond it, facing back towards the light.
4. Drag the screen along the beam. Its panel on the right shows the spot it records, smallest at the lens's focus.

<div class="dx-tip" markdown="1">
Every bench in the **Examples** gallery works. Open one, change it, and press **Ctrl+Z** to undo. Your own bench comes back with Undo after an example has replaced it.
</div>

## The window

**The bench** is the large area under the bar: warm paper in the Light theme, the dark anodised breadboard in Dark, where the whole page, its menus, panels, plots and designers, goes dark too (**View › Theme**, which also has *As the computer is set*; it is yours, kept in this browser, so a bench opens in your theme whoever made it). Drag a part to move it, drag its round handle to turn it, and scroll to zoom. A part dragged near another lines up with it, across or up, or with a beam's line, a faint guide showing it (hold Shift to drag freely). Drag on empty bench to select several parts with a box: their panel arranges them, and **Set them all** sets a shared setting (the height, the facing, a diameter, a wavelength) on every one. Right-click for a menu of what you can do with what is under the pointer.

**The parts rail** runs across the top of the bench, from its left. Its first button, **+ Add**, opens every part with a search (or press **A**): by name or by what it does (*focus*, *split*, *measure power*, *frequency doubling*). Then every palette's groups of parts, as small icons, a line between palettes and each in its palette's colour: **Free space** (sources and detectors, mirrors, lenses, and so on), **Fibre**, **Circuits** (sources, amplifiers, filters, scopes) and **RF** (millimetre-wave horns, lenses and mesh filters); click one for its parts. The switcher after **+ Add** changes the bar's mode: **Parts**, **Draw** in 2D (drawing tools for figures: lines, arrows, shapes, text; right-click empty bench to add a note or an arrow there) or **Model** in 3D; **+ Add**'s **Recent** tab has the parts you added lately. The bench's tabs are at its bottom left, **+** making another.

**The panel** on the right shows whatever is selected. With nothing selected it shows the whole bench: its parts, notes and settings. A panel's sections fold under their headings, and the longer explanations sit under **About this part** at the foot. The pin at its top keeps it open while you select other things; **×** closes it (**View › Show the side panel** brings it back).

**A part's colours.** Every part's panel has a **Colours** section, folded until you open it: a **Line colour** and a **Fill colour**. The line colour draws every line of the part, and the words in its body (a fibre component's "1550 nm"); the fill colour draws its body, as see-through as it was, so glass stays clear. **Default** takes a colour away and the part is drawn as before. With several parts selected the same two rows set them all. The colours are kept in the file and come out in every export of the bench (the layout and [Export figure](/jek/docs/jekray/figures/)). They do not change the part's name, its ports, the outline of a selected part or the light. In the 3D view the parts' bodies keep the tool's colours.

**The bar** along the top holds the menus, **File**, **Edit**, **View**, **Tools** (the Optical and RF designers, coating design in JEKfilm, Scripts and the bench's settings), **Sweeps** and **Help**, then icons for Undo, Redo, Fit view, Measure and Search (in 3D, and Fly, the mouse's way and a picture of the view), the bench's name in the middle (centred on the page when the bar is wide enough), and **Share**, **Save**, Examples, the quote cart and your account at the right. **Save** shows a dot when the bench has changed since it was opened or saved. **Ctrl+K** (or the magnifier) searches every command in the menus by its words, and the parts by their names and what they do: type *export*, *3D* or *measure power* and press Enter. The menus answer the keyboard too: Down opens one, Up and Down walk it, Left and Right move to the next menu. **File › Open recent** lists the files, examples and cloud benches opened lately. On a phone the bar is one row: the name, **+**, **Save** and **⋯**, a menu holding the rest.

**How the light is drawn** is set for the whole bench under **Light** in the Bench panel (the tab half way up the bench's left edge, or **Tools › Bench settings**): ticks for the rays, the Gaussian beams' envelope and their diffracted field. The field's intensity scale is linear, or logarithmic over 30 or 60 dB. With both on, the envelope marks the field's 1/e² edge. **Draw light by its power** (on for every bench) draws each ray and each envelope as bright as the power it carries, against the brightest source on the bench, on a log scale over four decades: a sixteenth of that power is still plain, a five-thousandth has all but gone, and below a ten-thousandth nothing is drawn. So light fades as a splitter, a filter, a polariser or a fibre's coupling takes it, and light made inside a part (a crystal's second harmonic, an amplifier's output) brightens and dims with the power the part makes. Untick it to draw every beam at full strength, each source's against its own brightest ray, for figures of the geometry alone. **View › How the rays look…** has the rest. **Fading trails** leaves where the rays were, fading a third with each change, while the light changes (a sweep playing, a part dragged): for recordings. Where rays of different colours cross, their colours add, as light does on the dark bench (red and green make yellow); on the light bench they are drawn over one another.

**Ray width** (Bench › Light) draws the rays 2, 3 or 4 pixels wide instead of the fine 1.2, at any zoom, and **Rays glow** gives each a soft halo: for recordings and for phones, and they make the faint ghost reflections easy to see.

**A group can turn.** Select a group (Ctrl+G groups what is selected) and, under **Turn the group**, choose the part it turns about: its **Spin** (°) turns the rest of the group round that part's centre, their angles with them. Give Spin a sweep from 0 to 360 and play it: a lighthouse's lenses round their lamp, a polygon scanner's mirrors, a disco ball.

**Names on the bench** grow and shrink with the zoom, as parts do, and stay a gap apart along a row. **View › Names a fixed size on screen** keeps them one size however far you zoom (the size is kept with the bench); a figure's export still sizes them for the figure.

## The 3D view

For a first go, take the tour under **Help › Build a periscope in 3D**: it builds a periscope step by step, tipping two mirrors with their rings. **Help › Exercises** has eleven short exercises on ready-made benches, from aiming a mirror to fixing a fibre's polarisation: each says what to reach, reads it as you go, has two hints, and lets you change only the settings it is about until you leave it. Under them, **Challenges** lists the puzzles from our Instagram reels, newest first (“Can you hit the pinhole?”): the same checks and hints, but no lesson, and kept apart so they do not get in the course's way.

A bench opens in **3D**; the **2D / 3D** switch at the bench's bottom right (or **View › 3D view**) changes between it and the bench from above, for each tab. Every part sits at the beam height, 75 mm above a breadboard, and is built from its own numbers: a lens from its surfaces, a mirror from its curvature. The light is drawn as the trace has it: rays as lines, Gaussian beams as tubes as wide as the beam, in the bench plane and out of it. The diffracted field glows along each beam, each point showing the irradiance summed along that line of sight against the key at the bottom left; point at it to read the value. A tight focus is far brighter than its beam, so choose 60 dB to see both. On a slow computer, untick the field.

| Mouse (the default) | Trackpad |
|---|---|
| Right-drag: turn | Drag: turn |
| Middle-drag, or Ctrl+right-drag: pan | Shift-drag, right-drag or two-finger scroll: pan |
| Scroll: zoom about the pointer | Pinch, or Ctrl+scroll: zoom |
| Click: select (Shift adds); again: its rings | Click: select (Shift adds); again: its rings |
| Drag a part: move it | Drag a part: move it |
| Drag an arrow or a ring: move or turn it | Drag an arrow or a ring: move or turn it |
| Right-click: the bench's menu | Right-click: the bench's menu |

Choose between them with the mouse icon in the bar (in 3D), pressed for a trackpad. On a touch screen one finger turns, two pan and pinch to zoom. **F** fits the view, **Z** zooms to the selection, and **Shift+1** to **Shift+7** give the front, back, left, right, top, bottom and isometric views, as does clicking a face, edge or corner of the view cube. The camera icon saves the view as a picture, and **View › Names in 3D** shows or hides the parts' names. The eye beside each part in the Bench panel's list hides it in 3D, to see past a housing; the light still meets it.

**Arranging parts.** Drag a part to slide it across the table, snapped to the grid as in 2D; a selection moves together. The right-click menu is the same as in 2D. A part added from **+ Add part** lands where the view is looking, one dragged from the rail where it is dropped. Mounts, posts and housings come in as .stl or STEP files: **File › Import an object (.stl, .step)…**, or drop the file on the bench. Each is an opaque [STL object](/jek/docs/jekray/free-space/stl/) that stops the light.

**Moving a part along x, y and up.** Click a part and three double-ended arrows appear: orange along the bench's x, green along its y, blue straight up. Drag an arrow to move the part along it alone, snapped to the grid (up in 0.5 mm steps, Shift for 0.1 mm), or type **X**, **Y** and **z** in its panel, each sweepable. The light follows a part's height: a part above or below the beam is missed, and a lens or curved mirror met off its centre turns the beam up or down (see [Heights](/jek/docs/jekray/free-space/#heights)). On the 2D bench a part not at beam height shows by how much under its name.

**Turning a part about its three axes.** Click the part again for three rings, each the colour of the axis it turns about:

- the blue ring, flat round the part, turns it to face another way (its **Angle**);
- the green ring tips it up or down about its own across axis, as a kinematic mount's vertical knob does (**Tip**);
- the orange ring rolls it about its own axis, right-handed (**Roll**): a cylindrical lens at 45°, a Dove prism, a waveplate's axis.

Drag a ring by its dot or anywhere on it; Shift turns in 15° steps and Alt a tenth as fast. Click the part a third time for its arrows again. Two mirrors tipped 45°, one over the other, make a periscope; a tipped source sends its light up at that angle. A tipped or rolled part shows by how much under its name in 2D.

The 3D view is a view of the same bench: select a part and its panel opens as usual, and anything changed there shows at once. Free-space parts are drawn at their height. Fibre components, circuit parts and chips stand on the table, each a box with its symbol from the bench on its top, a ferrule out of each fibre port and a pin out of each electrical one; their fibres (pink, glowing the colour of the light they carry), wires (yellow) and waveguides (green) follow their routes on the bench, lying on the table and rising to each port. Such a part moves across the table as any part does, but does not lift or tip. Drawings show in 2D only. The parts' names are off to start with: **View › Names in 3D** shows them.

## Settings and sweeps

Every number in a panel can be typed or dragged. Beside most is the sweep button, **∿**: it moves the value back and forth over a range, and the bench follows as it plays. A swept number shows its sweep folded to one line with Play; click the line, or ∿, to edit it. That is the quickest way to see how a system depends on one thing. The **Sweeps** menu plays and pauses every sweep, and holds **Optimise the bench…** and **Tolerance the bench…**, an optimiser and a Monte Carlo study over the swept values.

## Saving and sharing

- **Autosave.** With a free account, your bench is kept in this browser as you work, so closing the tab loses nothing. Signed out, nothing is kept: **Not kept** beside Save says so and turns to **Not saved** once you change the bench. Click it to sign in; the bench comes with you.
- **File › Save as .jekray** (or **Save** on the bar) saves a file you can open again anywhere. It needs a free account.
- **Share** (on the bar, or **File › Copy a share link**) makes a short link to the bench as it is now, and an embed code for a web page. A free account keeps three links at once; JEKrayPro any number. Anyone who opens the link sees your bench, with no account needed. The link is a snapshot: changing the bench afterwards does not change what it opens, so share again for a new one. A copy is kept with your account until you delete the link, from the same dialog or from **My links** on [JEKsuite](/jek/docs/jekray/jeksuite/), where your links are listed with how often each has been opened.
- **File › Export figure…** makes a [figure](/jek/docs/jekray/figures/) for a journal (85 or 174 mm, line art, set point sizes), a technical drawing (dimensions, callouts, parts list, title block) or a slide. **File › Export layout** saves a PNG, SVG or PDF of the bench as it looks; **Export layout (current view)** saves just what is on screen. Exports (these, the 3D view's picture, plots' PNG and CSV, a screen's data, .zmx and CAD files) need a free account; saving the bench as a .jekray file does not.
- With JEKrayPro, benches can be saved to your account, with version history, forks and team workspaces. They are all on [JEKsuite](/jek/docs/jekray/jeksuite/), with the benches of the other JEK apps, your account and your teams. The JEKsuite mark at the far left of the bar opens it in its own tab.

## Where to go next

- [Concepts](/jek/docs/jekray/concepts/): coordinates, units and the ideas the rest of these pages use.
- [Free-space optics](/jek/docs/jekray/free-space/): how rays, beams and fields are worked out.
- [RF and millimetre waves](/jek/docs/jekray/rf/): the same bench from 1 GHz to 3 THz, with horns and RF lenses.
- [Optical designer](/jek/docs/jekray/lens-design/) and [RF designer](/jek/docs/jekray/rf/designer/): the two design workspaces; coatings are designed in [JEKfilm](/jek/docs/jekray/jekfilm/).
- The [FAQ](/jek/docs/jekray/faq/), for common questions.
