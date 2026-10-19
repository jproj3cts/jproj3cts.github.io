---
layout: docs
title: RF designer
permalink: /jek/docs/jekray/rf/designer/
description: "The RF designer: a feed horn's beam through a system of RF lenses and mirrors, designed as a whole, with its conditions, analyses, merit function, optimiser, tolerancing, report, and the made-to-order lens it designs."
---

<p class="dx-lead">A system of RF lenses and mirrors is designed as a whole in the RF designer: a feed horn's beam through the lenses to what it is for. It is the quasi-optical counterpart of the <a href="/jek/docs/jekray/lens-design/">Optical designer</a>, with the same workspace and the same engine underneath, and it ends in a lens that can be made.</p>

<p><strong>What needs JEKrayPro.</strong> Anyone can open the RF designer, design a lens from its specification, look at it through every analysis, check that it can be made, and send it for a quote. The optimiser, tolerancing, the PDF report and the lens drawings need <a href="/jek/tools/jekray.html#pro">JEKrayPro</a> (a personal, Academic or team plan, or a university licence), and carry a <strong>Pro</strong> mark until you sign in with a plan.</p>

## Opening it

Open it with **Design as an RF assembly…** in an RF lens's panel (the lens is made an assembly of its own first if it is not in one), by double-clicking an assembly of RF parts, with **File › Open a workspace › RF designer, of the selection**, or from **My benches › Open a workspace**, which makes a new cloud bench and opens it in the designer; **Keep as a part…** in its header saves the whole system in My parts or a team's parts. **File › Open a workspace › RF designer, new…** starts from a made-to-order lens for 24 GHz. **Optical designer** in its bar opens the same parts in the [Optical designer](/jek/docs/jekray/lens-design/), surface by surface; **RF designer** there comes back.

## Its conditions

- **Frequency**: the design frequency and the band either side of it, in GHz.
- **Feed horn**: its kind, aperture radius and slant length, its distance from its aperture to the first lens, and how far it stands **off the axis**. Off the axis it is aimed at the first lens's centre, and the beam leaves steered the other way: the figures then give the beam's direction (from the wavefront leaving, real rays), the beam deviation factor (its angle over the feed's) and the **scan loss** against the same system fed on the axis. The beam's centre is followed through the system beside the Gaussian beam, so the spillover and the aperture efficiency are those of a beam off each aperture's centre, and the phase error is that of the rays from where the feed stands: a scanned lens's coma.
- **Goal**: what comes after the last lens. **Collimate the beam** (an antenna); **Focus to a waist** of a given radius at a given distance; or **Into a receiving horn**, of a given kind and size, its aperture at a given distance.

**Take from the bench** reads the feed horn lighting the first lens and any receiving horn on the axis after the last. Those horns then follow the conditions: change the feed's distance or size here and the horn on the bench moves and changes with it. **Place on a bench**, for a new design, puts its feed horn on the bench, and at its goal a receiving horn or an absorber load.

## The beam

At millimetre waves a lens is tens of wavelengths across, so the designer follows the beam as a Gaussian beam rather than as rays. Its complex beam parameter $$q$$ is carried in reduced form, $$\hat q = q/n$$, through each part by its first-order matrix: a gap $$d$$ of index $$n$$ adds $$d/n$$; a face of paraxial curvature $$c$$ between indices $$n$$ and $$n'$$ takes $$1/\hat q$$ to $$1/\hat q - (n'-n)\,c$$; a mirror to $$1/\hat q + 2c$$. The beam's radius anywhere, in air or in the plastic, is then

$$
w^2 = \frac{\lambda\,|\hat q|^2}{\pi\,\operatorname{Im}\hat q},
$$

with $$\lambda$$ the wavelength in vacuum. The feed horn's beam is its own Gaussian (see [Feed horns](/jek/docs/jekray/rf/#feed-horns)), starting from its waist behind its aperture.

The layout draws the horns, the lenses and the beam's $$1/e^2$$ radius along the axis: filled at the design frequency, dashed at the band's edges. Over each lens is its **edge taper**, $$8.686\,(a/w)^2$$ dB.

## Its figures

To collimate, the beam leaving the last lens is measured by its **aperture efficiency**: its Gaussian field, with the phase radius $$R$$ it has there, over the lens's aperture $$a$$ against a uniform field,

$$
\eta_a = \frac{2\,\left|1 - e^{-t(1+i\psi)}\right|^2}{t\,\left|1+i\psi\right|^2}, \qquad t = \frac{a^2}{w^2},\quad \psi = \frac{\pi w^2}{\lambda R},
$$

at most 81.5% for a flat phase, at an edge taper of about 11 dB. The **gain** on the axis is then $$\eta\,(\pi D/\lambda)^2$$, with $$\eta$$ that efficiency times the losses before it. The beam's waist and its divergence are given too.

To focus or to couple, the beam is measured by its **coupling** to the Gaussian it should be at its goal, the target waist or the receiving horn's own beam:

$$
K = \frac{4}{\left(\frac{w_1}{w_2}+\frac{w_2}{w_1}\right)^2 + \left(\frac{\pi w_1 w_2}{\lambda}\right)^2\left(\frac{1}{R_1}-\frac{1}{R_2}\right)^2},
$$

with the waist it makes and the one wanted beside it.

The **efficiency** is all of it together, at the design frequency and over the band: the share of the feed's power in its Gaussian, each face's **reflection** (Fresnel's, or through its quarter-wave matching layer at each frequency, as a thin film), each lens's **absorption** (its plastic's loss tangent, through its thickness over the beam's profile), the **spillover** past each lens, $$e^{-2a^2/w^2}$$ (once for each lens; to collimate, the last lens's own is in its aperture efficiency), the **phase error**, and the coupling (with the receiving horn's own share) or the aperture efficiency.

The Gaussian beam follows the system to first order, so it can't see what a face's shape does beyond that: a sphere where a hyperbola is wanted. The **phase error** is found from real rays: traced exactly from the incoming beam's phase centre through every surface, their optical paths taken to the sphere about the outgoing beam's phase centre (or to a plane, for a beam that leaves flat), the piston and defocus taken out by a least-squares fit in $$h^2$$, and what is left measured as an RMS $$\sigma$$ over the beam's power, weighted by $$h\,e^{-2h^2/w^2}$$. Its loss is Ruze's, $$e^{-(2\pi\sigma/\lambda)^2}$$.

## The system and its parts

The system is listed down the left as the beam meets it: **Frequency**, **Feed horn**, each lens, **Add a lens** and **Goal**. The one chosen is edited beside the beam. A lens gives its material, diameter, centre thickness, each face's radius and conic, whether its faces have matching layers, whether it is cut in zones, and the air after it; **Remove** takes it out (a system keeps at least one lens). **Add a lens** puts a made-to-order lens after the last part and opens **Design this lens** on it. A change is made on the part on the bench, and can be undone. The steps for the whole system are tabs below: **Element data**, **Optimise**, **Analyses**, **Tolerance** and **Make it**.

## Element data

Every surface of the system in one table, as the optical designer's element data: the feed horn first (its distance to the first surface is the first thickness), then each face with its radius, conic (a mirror's as its part has them, positive concave, and an offset reflector's offset beside its material), the thickness after it (a lens's centre, or the air to the next part), the material after it and its clear radius, and the goal last. A lens's radii, conics, centre thickness and material and the air after each part are typed here and change the part on the bench, which Undo takes back; a graded-index disc shows its focal length, a mirror its radius as the bench has it. The **V** beside a value marks it as a variable for **Optimise**: orange when it is one. To start, each lens's two radii and its front conic are variables.

## Configurations

The **Configurations** tab holds the system in several states: a second band for a dual-band antenna, a switched feed (another horn, or the same horn moved off the axis), another goal. **Make configurations** gives two, the design as it is and a copy; **Add a configuration** copies the one shown. Each has a name, a weight in the merit, and its own conditions: design frequency and band, feed horn and its distance and offset, goal and its distance. Everything else is shared, unless you make an Element data value **its own in each** (a lens's centre thickness, a face's radius, the air after a part): it then has a column of its own, starting from the value it has now.

- **The one shown** is the bench's: its conditions are the design's and its values the parts'. **Show** another and that one's conditions and values go onto the bench (the feed horn there is moved and set as it says); the picker in the header does the same.
- **The merit** adds every configuration up, each by its weight (a term can be set for one configuration alone with the select beside it); **Optimise** varies a shared value once for all of them and a value that differs separately in each, the feed's distance always.
- **Analyses**, **Tolerance** and **Make it** work on the configuration shown.

## Analyses

- **Over the band**: the gain (to collimate) or the coupling (the system's S21) across the band and a tenth beyond each edge, with what each loss takes beneath it, in dB: reflections, absorption, spillover, phase error and the aperture efficiency.
- **Far-field pattern** (to collimate): the far field of the last lens's aperture, its Gaussian field with the phase radius it has there over the round aperture,
$$
E(\theta) \propto \frac{1+\cos\theta}{2}\int_0^a e^{-r^2/w^2 - i\pi r^2/(\lambda R)}\,J_0(kr\sin\theta)\,r\,dr,
$$
at the band's edges and centre, with its half-power beamwidth and first sidelobe.
- **Scan**: the feed moved across the axis in steps, aimed at the first lens, out to 25° or four beamwidths: at each place the beam's direction, the deviation factor, the scan loss and the phase error, against the beam's angle and the feed's. The bench's lens panel finds the same loss from its field; here it comes from the designer's beam and rays, so it can be designed against.
- **Phase map**: the wavefront error over the beam, in waves, from real rays taken through to the reference after the last face (a sphere about the beam's phase centre, or a plane), less the constant, tilt and defocus. Its RMS over the beam's power is the phase error figure.
- **Cross-polar**: the polarisation followed ray by ray from a balanced horn's field (Ludwig's third definition). At each face the field is split across and in the plane of incidence and each part passed by its own Fresnel amplitude (matching layers counted), or turned back by a metal face as a perfect conductor turns it, $$\mathbf{E}' = 2(\mathbf{n}\cdot\mathbf{E})\mathbf{n} - \mathbf{E}$$. It gives the share of the power cross-polar after the last face, for the feed polarised in the bench's plane and out of it, and a map of the cross-polar field over the beam: a lens's comes from its faces' s and p transmissions differing off the axis, an offset reflector's from the geometry of its section (the four-lobed pattern it is known for; a paraboloid fed on its axis makes none). The horn's own cross-polar peak is given beside it.
- **Beam to the goal**: the Gaussian beam past the last face, its 1/e² radius along the axis at the band's edges and centre, where its waist falls and how wide it is, with the goal's plane and the waist wanted marked.
- **Apertures**: at each face, the beam's radius at the band's edges and centre, the clear radius, the edge taper and the share spilled.
- **Reflections**: each lens as a slab, its faces with their layers and the plastic between, worked out coherently by the characteristic matrices, so the ripple a plain lens shows across a band appears.
- **Loss budget**: each factor the efficiency is the product of, at the design frequency, in per cent and dB; to collimate, the gain against a uniform aperture of the same diameter.
- **Temperature**: the design at other temperatures against its own at 20 °C. Each lens grows by its plastic's linear expansion (radii, aspheric terms, thickness and clear radius), each metal mirror by its metal's, and the air between parts, the feed's distance and the goal's by the housing's (aluminium, steel, brass, titanium or Invar). It gives the figure for the goal at each temperature, the same with the feed refocused, the phase error and the waist, and the figure's drift per kelvin. The plastics' permittivity is taken as constant: its measured change is a few parts in ten thousand per kelvin, within the spread between grades and small beside the expansion.

## Merit

What **Optimise** works toward. Each term is a figure of the system with a **target**, a **sense** (at least, at most, or equal to) and a **weight**: the efficiency, gain or coupling; the edge taper at the last lens; the phase error; the spillover and the reflections in dB; the first sidelobe and the half-power beamwidth (to collimate); the beam steered and the scan loss at the feed's offset; the waist made (to focus or couple); the thickest lens's centre thickness; the feed's distance and the length to the last face. A term is measured at one frequency (the design's, the band's edges or one of your own) or at each of five across the band. Its residual is the weight times its shortfall in the figure's own scale (an efficiency in hundredths, a decibel, a tenth of a degree, a hundredth of a wave, a millimetre), and the merit is the root of the sum of the squares, with the flatness term's and the boundaries'. The table gives each term's value now and its share of the merit, so the term that drives the design is plain. With no terms, the efficiency at each of the five frequencies is made as high as it can be, as before.

Under it, the **boundaries** every design keeps to: how **flat** the efficiency should be across the band, the **thinnest edge** a lens may have and the **thickest centre**; each lens's edge, the air between parts and the feed's distance are kept open always.

## Optimise

**Optimise** changes the values marked **V** in Element data (each lens's face radii and conics, its centre thickness, a disc's focal length, a mirror's radius and conic and an offset reflector's offset, the air after each part, the feed's distance) for the least merit: with no terms given, the efficiency as high as it can be at five frequencies across the band (to collimate that is the gain at the lens's diameter). Every loss counts, the phase error from real rays among them, so a face's conic is found for what it does to the wavefront, not only to the lens's thickness. You can ask for the efficiency to be **flat across the band** as well, and set the **thinnest edge** a lens may have and the **thickest centre**. Each lens keeps that edge and the air between parts stays open.

The search is quasi-Newton (BFGS) on the merit (the terms' residuals, the flatness term and the bounds, squared and summed), each variable in its own scale, its gradient by central differences, each step shortened until the merit falls enough. The efficiency can't reach 1, so a least-squares step, which assumes the merit's least is nought, would stall; this one doesn't. It runs a step at a time with the page live; **Stop** keeps what it has. The result goes into the design as one change, which **Undo** takes back.

## Tolerance

A printed lens is not made exactly, nor mounted exactly where it was designed. **Tolerance** takes each error within limits you set:

| Error | On | Default |
|---|---|---|
| Permittivity | each lens's plastic, its index by $$\sqrt{1 + v/100}$$ | ± 5 % |
| Centre thickness | each lens | ± 0.2 mm |
| Face curvature | each curved face | ± 1 % |
| Air gap | after each part | ± 0.5 mm |
| Feed distance | the feed horn | ± 1 mm |
| Lens decentre | each lens, moved across the axis in the bench plane | ± 0.5 mm |
| Lens tilt | each lens, turned about its front vertex, its back face carried with it | ± 0.5° |
| Feed across the axis | the feed horn moved across, pointed as it was | ± 1 mm |

A printed plastic's permittivity is known to a few per cent until tiles of it are measured, and the printer's flow moves it the same way, so it is usually the error that matters most. The figure is the gain (to collimate) or the efficiency, with every loss and the phase error from real rays.

- **Sensitivity**: each error alone at its limit, either way, and what it does to the figure at the design frequency, the worst first.
- **Monte Carlo**: builds with every error drawn at once, evenly within its limits or normally with its limit at two standard deviations, from a fixed seed so a run can be repeated. For each build, its figure at the design frequency and its worst over the band; the mean, the figure nine builds in ten reach, the worst build, and a histogram.
- **Yield**: give a specification (the figure at least so much across the whole band) and the share of builds that meet it, with its 95 % interval (Wilson's).

Errors across the axis move the beam's centre off the faces (the spillover and the aperture efficiency of a beam off centre) and are traced by real rays through the moved faces (the phase error of a lens met off its axis); the beam's direction turns a little too, and **Beam moves** in the sensitivity table says how far, since a lens decentred mostly steers the beam rather than spoiling it. **Refocus the feed for each build** is the compensator: as on the bench, each built system's feed distance is refocused (within 15 % of the design's, by golden section) for the most of its figure before it is read, so a thickness or permittivity error that only moves the focus costs what remains after refocusing. The nominal is then refocused too.

## The report

**Report (PDF)**, at the top of the workspace, writes the whole design as one PDF to hand on: A4 pages of its conditions and figures, the layout with the beam and where the power goes; its Element data (the feed, every surface and the goal), the optimiser's variables and merit, and its configurations; its analyses (over the band, the far-field pattern or the beam to the goal, the wavefront map, the cross-polar field, the scan and the design over temperature); its tolerances with the sensitivity of each error and the Monte Carlo if it was run on the design as it is; what can be made of each lens; and, last, each lens's drawing. Everything in it is drawn as vectors.

## Make it

**Make it** checks each lens against what can be made to order: a made-to-order plastic (PLA, ABS, PETG, ASA or polypropylene); up to 210 mm across, flange included, and 260 mm thick; nowhere thinner than 0.45 mm; and matching layers that can be printed and hold, by the design rule, to the top of the band. It gives the lens's centre and edge thickness, its weight and its outside diameter, and notes a lens only a few wavelengths across or with a low edge taper. Beside them the lens turns in 3D as it would be made, flange and bolt holes with it. A lens that passes has the orange **Quote now** and **Add to quote cart** buttons, as in its panel: the request carries the lens's figures (each face's radius, conic and aspheric terms, so the shape is in the request itself), what the system does over the band, and a link that opens the whole system in the RF designer as it was left. See [Custom RF Lenses](/jek/products/signal-processing/custom-rf-lenses/).

Each lens's design drawing can be saved as **Drawing (PDF)** or **Drawing (SVG)**: the lens on an A4 sheet in section to a standard scale, with its flange, its diameters, centre and edge thickness, each face's radius, conic and clear aperture, the plastic's permittivity and loss tangent at the design frequency, and each face's matching layer. Tolerances come from the Tolerance tab's settings; each face also has a profile tolerance $$t$$, the width of the zone it must lie within, chosen so that $$t\,(n-1) \le \lambda/8$$ at the top of the band and never more than 0.5 mm. The drawing describes the lens as designed. It is not a file to make it from: how it is made is ours to work out when you order it.

## Design this lens

**Design this lens…**, on a lens's own page, makes a lens to suit the beam that reaches it and the goal after it, as millimetre-wave lenses are designed. Each curved face is a hyperbola of eccentricity $$n$$ (conic $$-n^2$$, vertex radius $$(n-1)F$$), which turns a point at its focus $$F$$ into a plane wave in the plastic, or a plane wave in the plastic into a point in air. The point is the beam's phase centre: $$F$$ is the phase radius of the beam reaching the lens, and on the far side the phase radius the beam must leave with to make its waist where it is wanted,

$$
F_2 = \frac{d_2^2 + z_R^2}{d_2}, \qquad z_R = \frac{\pi w_t^2}{\lambda},
$$

for a target waist $$w_t$$ a distance $$d_2$$ beyond the lens. So the faces suit the Gaussian beam, not only its rays, and inside the lens the beam is flat, so the thickness changes nothing but the loss.

- **Hyperbolic, flat back**: one hyperbolic face toward the feed. It collimates exactly; to focus as well, its curvature is solved so the beam leaving the flat back, through the lens's own thickness, has the phase radius wanted.
- **Two hyperbolic faces**: the beam focused from one phase centre to the other.
- **Plano-convex, spherical**: a sphere and a flat, the simplest to make.

You give the **material**, **diameter**, **edge thickness** and whether its faces get **matching layers**, and **where it stands**: where it is; where the feed's beam has the **edge taper** asked for (the first lens); or, to focus or couple, where the beam's width there matches the width the target's beam has at the lens, the coupling's best. The centre thickness follows from the edge thickness and the faces' sags. **Use this lens** puts it in, and the feed horn moves to its distance.

- **Graded-index disc (flat)**: a flat disc, solid at its centre and less dense toward its edge (below).

Designing a lens as a disc makes that part a graded-index disc in the same place, and designing a disc as one of the lens kinds makes it a lens again.

## Graded-index discs

A graded-index disc on the bench (the RF tab's **GRIN lens**) can be part of a system: select it and press **Design as an RF assembly…**, or design any lens of the system as one. To the RF designer it is a slab between two flat faces, as thick as the whole disc with its matching layers, of the plastic graded so that its optical path at radius $$r$$ is the disc's own:

$$
n(r) = n_0 - \frac{\mathrm{opd}(r)}{T}, \qquad \mathrm{opd}(r) = \sqrt{r^2 + f^2} - f,
$$

for a disc $$T$$ thick of focal length $$f$$, fitted over the disc as $$n_0 + g_2 r^2 + g_4 r^4 + g_6 r^6$$. So the Gaussian beam takes its power from its $$r^2$$ term (the graded slab's own matrix), real rays bend through it, and the phase error counts what the fit leaves. Its losses are its own: at each radius the index and loss of the density there, through its core and its layers, and its faces' reflection at that index (or through its layers at the frequency), each weighted over the beam.

**Design this disc…** makes one to suit the beam: its focal length starts as the thin lens's between the beam's phase centre before it and the one wanted after it, $$1/f = 1/F_1 + 1/F_2$$, and is then solved through the disc's own thickness and grading, because a thick disc's focus is nearer than its focal length. The density runs from the centre's (100 % by default) to the lowest asked for, raised if need be so that its least dense structure stays fine against the wavelength at the top of the band. On its own page its plastic, diameter, focal length, density range and matching layers can be set; **Optimise** can vary its focal length; **Tolerance** varies its plastic's permittivity, which scales every density's (its grading with it), and its thickness. **Make it** checks that its density can be graded, that it fits, and that it holds to the top of the band; its drawing gives its permittivity at five radii.

## Zones

A made-to-order lens can be **cut in zones** (a zoned, or Fresnel, lens): wherever it is thick, whole layers come out of its curved face, each

$$
\Delta z = \frac{\lambda_z}{n - 1}
$$

deep, a wave of path at its zone frequency $$\lambda_z$$. Its thickness at $$r$$ is the smooth lens's less $$k(r)\,\Delta z$$, $$k$$ the whole layers it is thicker there than at its thinnest, so it lies between its thinnest and that plus one step: much thinner and lighter for a large lens, and it absorbs less.

At the zone frequency the zoned lens bends the wave exactly as the smooth one does, since each step delays it by a whole wave. Away from it, each step delays it by $$k\lambda_z$$, not $$k\lambda$$: the phase slips by $$k(\lambda_z - \lambda)$$, a whole wave less, across the zones. The RF designer counts this from real rays, each ray's $$k$$ where it meets the cut face, in the phase error. The more zones, the narrower the band: **Analyses › Over the band** shows the phase error falling away either side of the zone frequency, and the gain with it.

On the bench a zoned lens is traced as it is cut: its curved face stepped back by the whole layers taken out, each step a sheer wall. A ray that runs into a wall is lost to the beam (the wall's shadow, a band inside each step as wide as the step is deep times the slope of the rays there), the diffracted field loses the same band, and the rays through each zone meet the smooth face moved back a step, so they are bent a little differently from the smooth lens's: a small defocus of its own. The RF designer traces the same cut face with its real rays: the share of the beam its walls shadow is a loss of its own (**Steps' shadow**), and the zones' defocus goes into the phase error with the slip away from the zone frequency, so at the zone frequency a zoned lens shows a small phase error where the smooth lens shows none. A lens's own page sets it zoned and its zone frequency, and gives its steps and its thickness as cut; **Design this lens** can cut the lens it makes; **Make it**, the 3D view, the drawing (the steps' depth and radii) and the quote all take the lens as cut.

## Worked examples

Two examples in the gallery's **RF and millimetre waves** group are designed in the RF designer; select a lens and press **Design as an RF assembly…** to open each.

- **Lens antenna, 24 GHz**: a 120 mm PLA lens on a corrugated horn, made with **Design this lens**: the feed 116 mm away for an 11 dB edge taper, its face to the feed a hyperbola, both faces matched. It gives 28.19 dBi at 24 GHz (27.3 to 28.9 dBi across 21.6 to 26.4 GHz) at 81.4 % aperture efficiency; PLA's loss takes about 0.5 dB. It has a flange, and a gain specification of 27 dBi set in **Tolerance** for the Monte Carlo.
- **Gaussian beam telescope, 150 GHz**: two plano-hyperbolic polypropylene lenses, 100 mm across, between two identical corrugated horns. Lens 1 is placed for a 20 dB edge taper (195 mm from the feed); lens 2 is its mirror image, 430 mm on, so the receiver sees the feed imaged on itself. It couples 94.9 % to 99.8 % of the beam across 135 to 165 GHz (98.3 % at 150 GHz), 75.8 % (−1.20 dB) all told: the four bare faces reflect 0.67 dB of it, since at 150 GHz a printed matching layer would be coarser than a quarter wave.

**Checked against.**

- a feed horn's beam through free space, and through a flat plate as a gap of $$d/n$$, against the Gaussian beam's own formula, to $$10^{-9}$$;
- the aperture efficiency at most 81.5% at an edge taper of 10.9 dB, as Goldsmith gives it, and lower for a curved phase;
- the coupling of a beam to itself, 1, and to one twice as wide, 16/25;
- a quarter-wave matching layer reflecting nothing at its own frequency, and Fresnel's reflection without it;
- a hyperbolic lens with its focus at the feed's phase centre leaving the beam's waist at its curved face;
- a horn's beam into an identical horn 300 mm on: a lens of two hyperbolic faces, matched to the goal, couples it completely (to five places); one hyperbolic face, and a plano-convex lens, each to within half a per cent.
- a hyperbolic face on the beam's phase centre adding no phase error (under $$10^{-9}\lambda$$), and a sphere of the same vertex radius adding over $$0.05\lambda$$;
- a nearly uniform aperture's pattern: its half-power beamwidth $$58.9\,\lambda/D$$ degrees and its first sidelobe at −17.6 dB, the Airy pattern's, to 1% and 0.1 dB; a tapered one wider, its sidelobes under −24 dB;
- a plain slab reflecting nothing when half a wave thick inside, and $$\left(\frac{n^2-1}{n^2+1}\right)^2$$ at a quarter;
- a lens given a sphere where its hyperbola was, optimised with its radius and conic free: its phase error back under $$0.01\lambda$$ and its gain the designed lens's, within 0.05 dB.
- a graded-index disc's fitted grading against its own path $$\sqrt{r^2+f^2}-f$$, within $$0.01\lambda$$ over its face; and a disc designed to collimate leaving the beam's waist at its far face (to $$10^{-6}$$ mm), with its least density raised to hold to the top of the band;
- a zoned lens: its steps a wave of path deep, its thickness as cut never outside its thinnest and that plus one step; at its zone frequency its aperture efficiency the smooth lens's and its phase error no more, absorbing less; away from it a phase error that grows either way, where the smooth lens has none;
- tolerancing a hyperbolic lens: its permittivity off by 5 % either way lowers the gain both ways and matters most, its centre thickness (the beam flat inside) all but nothing; an error of nothing changes nothing; the same seed gives the same builds; and Wilson's interval for 5 of 10 is 23.7 % to 76.3 %.

## Related

- [RF and millimetre waves](/jek/docs/jekray/rf/): the parts the designer works with, and the models behind them.
- [Optical designer](/jek/docs/jekray/lens-design/): the same workspace for a lens system, surface by surface.
- [Coating design](/jek/docs/jekray/coating-design/), where a matching layer is designed as a thin-film stack.
