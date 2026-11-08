---
layout: docs
docs: jekion
title: Files and examples
permalink: /jek/docs/jekion/files/
description: "The .jekion file, autosave, the examples, pictures, the cloud, and what needs an account."
---

<p class="dx-lead">A bench is a `.jekion` file: JSON, readable, with the electrodes, ion groups, detectors and every setting in it.</p>

**Save** (Ctrl+S) writes the file; **File › Open** or a drop on the bench reads one back. A file from any version loads: every field is checked and given its default, so a hand-written or program-written file works too (an unknown shape becomes a box, a bad number its default). The bench is autosaved in this browser as you work and comes back on the next visit.

**Examples** (the gallery button, or File › Open an example) hold a working bench for each kind of instrument: an einzel lens, a quadrupole deflector, a linear time-of-flight, a reflectron, a quadrupole mass filter, a Paul trap and a Penning trap, each described in the gallery. A link `jekion.html?demo=paul-trap` opens one.

**Share links.** **Share** (or File › Copy a share link) copies a short link, `jeksys.net/i/` and ten capitals, that opens the bench as it is now for anyone, signed in or not; a copy of the bench is kept with your account until you delete it, from the links listed in the Share dialog. Making links is JEKrayPro's; a free account keeps three at once. Without an account the link carries the bench itself after `#p=`, which is long. The same account and links serve JEKray.

**Pictures.** File › Export the view as PNG saves the bench as drawn; the 3D view's PNG button saves it; each plot has its own PNG. **Data** is [its own page](/jek/docs/jekion/data-export/).

**The cloud.** With a JEKray account, **File › Save to cloud** puts the bench in your cloud benches (or a team's), where it saves itself as you work, at most every 30 seconds and when the page is hidden, and keeps its history: a version on each Save to cloud, every 10 minutes or so while you work, and before a restore. **File › My benches** opens the home of every bench, JEKion's with JEKray's: JEKray's My benches page, in the JEKray tab, with your places and folders, each bench as a card with its picture, its history (open a copy of any version, restore one), forks, the bin (deleted benches stay 30 days), parts and links. A JEKion bench chosen there opens back here, in this tab. **File › Fork this bench** carries on in a new bench, leaving this one as it is. A bench saved somewhere else since you opened it is not overwritten: you choose the newer one, a copy of yours, or yours over it. Whoever has a bench open to edit holds it; opening one someone else is editing shows who, to look, take over or work on a copy. The same workspaces hold both tools' benches, each marked with its tool there. A link `jekion.html#cloud=<id>` opens a cloud bench here; `#benches` opens the home page. Saving to the cloud needs JEKrayPro; a free account opens and reads.

**Accounts.** Saving the file needs no account. Exports (pictures, data as CSV or JSON one kind at a time) need a free account; scripts and the richer exports (Excel, NumPy, MATLAB, several kinds at once) are JEKrayPro's. JEKion shares JEKray's accounts: sign in with the same Google or Microsoft account, and subscribe, if you wish, from JEKray's account menu.
