# JEKray2D: a guide for AI assistants

This file teaches you, an AI assistant, how to write projects for **JEKray2D**, a free optical bench simulator that runs in the browser (https://jeksys.net/jek/tools/jekray2d.html). A person has given it to you so that you can design an optical system for them, or rebuild one from a paper or thesis, as a `.jekray` file they can open. It describes file format version 1.

Read all of it before writing a file. The parts that matter most are **Coordinates and angles** and the **Checklist**.

## What JEKray2D is

- A 2D optical bench: everything lies in one plane, the bench, seen from above. x is to the right, y is up, lengths are in millimetres and angles in degrees, anticlockwise from +x.
- It traces rays exactly through real surfaces and glass, with polarisation (s is out of the bench plane, p is in it), optical path, Fresnel losses and coatings.
- A source can also be a Gaussian beam. Its diffracted field is propagated through the system by physical optics, so interference, diffraction, cavities (found and solved automatically), fibre coupling and photodiode signals come out as on a real bench.
- Fibre subsystems (fibre lasers, couplers, circulators, AOMs, EOMs, photodiodes and more) sit on the bench too, joined port to port by fibres.
- A project can have several tabs (benches), joined by pairs of link planes or fibre feedthroughs.

What it cannot do: anything out of the plane. There are no skew rays, no out-of-plane tilts and no mechanics (no forces on particles, no thermal effects). A real setup that leaves the plane, such as a periscope or a beam sent up into a vertical microscope, has to be unfolded into the plane. Say how you did it in the project's notes.

## How to work

1. **Understand the system.** List every source, optic and detector with its numbers: wavelengths, powers, focal lengths, beam sizes, distances, reflectivities, frequencies. If you are rebuilding a published setup, take the numbers from the text, the figures, the methods and the supplementary material, and write down which you had to assume.
2. **Lay it out on paper first.** Choose the optical axis, place elements in order along it with their real spacings, and work out every angle from the rules below. Keep folds at 45 degrees where the real setup has them. Leave room between elements; nothing may sit on top of another.
3. **Write the file.** Use only the types, fields and values in the reference. Leave out any field whose default is right.
4. **Record your assumptions.** Put in "notes" what the bench is, its source (a citation), each assumption and simplification, and any catalogue part numbers the person should check.
5. **Hand it over.** Give the whole file in one fenced `json` block. Tell the person to open JEKray2D and either click **Paste text** and paste it, or save it as `name.jekray` and use **Open .jekray**.
6. **Fix what the tool reports.** When a file opens with changes, the tool lists them in an import report. If the person pastes that report back to you, correct every line and give the whole file again.

## The file

A `.jekray` file is one JSON object:

```json
{
  "format": "jekray",
  "version": 1,
  "name": "Short title of the bench",
  "notes": "What it is, where it comes from, what was assumed.",
  "elements": [ ... ],
  "fibres": [ ... ]
}
```

| field | meaning |
|---|---|
| format | always "jekray" |
| version | {{VERSION}} |
| name | the project's title |
| notes | free text shown on the Bench panel: purpose, citation, assumptions, parts to check |
| elements | the elements (see the reference) |
| fibres | optional: fibres between ports, each {"a": [element id, port], "b": [element id, port], "len": metres, "loss": dB/km, "path": [{"x", "y"}, ...]} |
| benches | optional, for several tabs: [{"id": "b1", "name": "Laser table"}, ...]; then give each element "bench": its tab's id |
| maxBounces | optional: interactions per ray (default 200). Raise it for high-finesse cavities |
| minPower | optional: rays weaker than this % of their source are dropped (default 0.1). Lower it (to 1e-4) for cavities and faint ports |
| view | optional: {"cx", "cy", "scale"}. Leave it out and the tool fits the view |

Give every element a unique "id" (short words like "laser" or "m1" are best) and a clear "name". Fibres and split sources refer to elements by id; a name also works.

## Coordinates and angles

This is where most mistakes happen. "angle" means different things for different elements:

| elements | "angle" is |
|---|---|
| source | the direction the light leaves in |
| mirror, grating | the direction the reflecting face points: its normal, towards the light |
| screen, detector, fibre tip | the direction the face points: towards the light arriving |
| lens | the direction of its axis; light travelling that way meets surfaces[0] first |
| stop, waveplate, polariser, mask, filter, gain, aom, eom, link | the plane's normal: 0 (or 180) for a beam travelling along x, 90 for one along y |
| isolator | its forward direction: light travelling along it passes |
| cube | turns the diagonal: at 0 it runs like "/" |

Rules for folding a beam:

- **Mirror:** to turn light travelling in direction a (degrees) into direction b, give the mirror angle (a + 180 + b) / 2, and add 180 if the result points away from the incoming light. For example, a beam travelling +x (a = 0) sent up to +y (b = 90) needs a mirror at 135; sent down to −y (b = 270, or −90) it needs 225 (or −135). A mirror sending light straight back along −x faces 180.
- **Cube at angle 0** ("/"): light travelling +x is split into +x (transmitted) and +y (reflected); travelling −x into −x and −y; travelling +y into +y and +x. **At angle 90** ("\"): +x reflects to −y.
- **Screens and detectors** face the light: a beam travelling +x is caught by a screen at angle 180.
- **Plane elements** (waveplates, polarisers and so on) at angle 0 sit across a beam travelling along x.

Signs:

- **Mirror "R"** is positive when concave towards the light it faces (focal length R/2) and negative when convex.
- **Lens surfaces** follow the usual optical convention along the lens axis: R > 0 has its centre downstream. A biconvex lens is [{"R": 51.5}, {"R": −51.5}]; a plano-convex lens with its curved side first is [{"R": 51.5}, {"R": null}].
- A source's **"z0"** is how far ahead of the source its waist is.

## Building blocks

- **Lens from a catalogue:** a singlet is two surfaces, one gap and one material. Thorlabs LA1509 (N-BK7, f = 100 mm, Ø25.4 mm) is {"type": "lens", "diameter": 25.4, "surfaces": [{"R": 51.5}, {"R": null}], "gaps": [3.6], "materials": [{"glass": "N-BK7"}]}. Take R, the centre thickness, the glass and the diameter from the catalogue, put the part number in the name, and list parts you are unsure of in the notes. An achromatic doublet is three surfaces, two gaps and two materials.
- **Ideal lens or microscope objective:** when the prescription is unknown, use a mask with a perfect-lens delay: {"type": "mask", "name": "Objective, f 3 mm, NA 0.8", "length": 2 × f × tan(asin(NA)), "delay": "-(sqrt(r^2+9)-3)/lambda"}. Here 9 is f² and 3 is f, in mm; the length is the entrance pupil's diameter. It focuses without aberration, and a screen at its focus shows the vector focal field.
- **Gaussian laser:** {"type": "source", "gauss": true, "w0": waist radius mm, "z0": mm to the waist, "wavelength": nm, "power": mW, "pol": "s", "rays": 1, "width": 2 × w0, "beamView": "field"}. Use "beamView": "field" to see the diffracted beam, and a few rays (1 to 5) with gauss.
- **Collimated launch from a fibre:** a fibre tip ("fibre") joined to a fibre network, facing a lens one focal length away.
- **Two beams from one laser:** give the second source "splitFrom": the first's id. They then interfere, with "splitPhase" (degrees) and "splitPath" (mm of extra fibre) between them, and fringes wash out over the laser's "coh".
- **Beam dump:** a small screen facing the beam. A closed stop masks the field, but the thin guide line of a Gaussian beam still passes it.
- **Cavity:** two or more mirrors facing each other. The tool finds it, reports finesse, FSR, modes and stability, and solves the steady state. Set "maxBounces" to about 40 and "minPower" to 1e-4.
- **Photodiode signals:** a "detector" (free space) or an fcomp "pd" (fibre) reads DC and beat notes. "demodF" in MHz mixes the output down: with an EOM at the same frequency on the light going to a cavity, the reflected light gives a Pound–Drever–Hall error signal.
- **Several tabs:** give "benches" and each element's "bench". Join tabs with two "link" elements sharing a "pair" name (free space), or two fibre feedthroughs (fcomp "thru") sharing a "pair" (fibre).

## Checklist

Before you answer, check each of these:

- [ ] Every element's "type" and every field is in the reference below, spelt exactly, with values in range and the listed options for strings.
- [ ] Every "id" is unique; every fibre end and "splitFrom" names an existing element; every fibre uses a port that exists, and no port twice.
- [ ] Every angle follows the rules above. Trace the main beam by hand, element by element, and check where it goes after each one.
- [ ] Mirrors face the light they reflect, and screens and detectors face the light they catch.
- [ ] Distances and focal lengths match the source material, and lenses sit at the right distance from foci and waists.
- [ ] No two elements share a position; elements are not inside each other.
- [ ] "notes" records the source, every assumption, anything simplified to fit the plane, and parts to check.
- [ ] The output is a single valid JSON object: no comments, no trailing commas.

## The import report

When a file is opened, JEKray2D lists anything it could not use as written: an unknown type or field, a value out of range, an unknown glass (which falls back to n = 1.5), a fibre that could not be joined, a link plane without a partner, two elements in one place. The person can copy this report back to you. Fix every item and give the whole corrected file again.

## Element reference

Every element has "type", "id" (any unique string), "name", "x", "y" (mm) and "angle" (degrees), and "bench" (a tab id) when there are several tabs. The other fields are listed with the value the tool uses if you leave them out. Leave out anything you do not need to change.

### "source": Source

A light source: a fan of rays and, with "gauss": true, a Gaussian beam whose diffracted field can be shown.

**angle:** the direction the light leaves in (0 = travelling +x).

| field | default | meaning |
|---|---|---|
| wavelength | `633` | nm, 100 to 20000. |
| width | `4` | mm: the full width of the ray fan (follows the beam when gauss is true). |
| divergence | `0` | degrees, full angle of the fan; negative converges. |
| gauss | `false` | true for a Gaussian beam: then set w0 and z0. |
| w0 | `0.35` | mm: the 1/e² waist radius. |
| z0 | `0` | mm: how far ahead of the source the waist is (negative: behind it). |
| beamView | `"envelope"` | "envelope" (outline of the beam) or "field" (the diffracted field, computed by physical optics). |
| beamScale | `"lin"` | "lin" or "log" for the field view. |
| popN | `256` | grid points for the field: 128, 256, 512 or 1024. |
| popModel | `"auto"` | "auto" (round when it can be) or "2d". |
| traceRays | `true` | false hides the ray fan. |
| pol | `"unpolarised"` | "unpolarised", "s" (out of the bench plane), "p" (in the plane) or "linear" (then polAngle). |
| polAngle | `45` | degrees from p, for pol "linear". |
| lines | `[]` | extra wavelengths in nm, up to 12. |
| rays | `11` | number of rays in the fan, 1 to 501 (use 1 to 11 with gauss). |
| power | `1` | mW. |
| coh | `0` | coherence length in mm; 0 for a single frequency. |
| splitFrom | `null` | id of another source this one is split from (same laser, so they interfere); null for a laser of its own. |
| splitPhase | `0` | degrees of phase against the source it is split from. |
| splitPath | `0` | mm of extra fibre before this launch, against the other. |
| lineshape | `"lorentz"` | "lorentz" or "gauss": the laser line’s shape, with coh. |
| m2 | `1` | beam quality M² ≥ 1. |
| fibre | (none) | optional {"core": µm, "na": NA}: a launch from a single-mode fibre, which sets w0 and z0 itself. |

### "mirror": Mirror

A mirror, flat or curved (spherical or conic), partly transmitting if reflect < 100.

**angle:** the direction its reflecting face points (its normal, towards the light it reflects).

| field | default | meaning |
|---|---|---|
| length | `25` | mm: the mirror’s width across the bench. |
| reflect | `100` | % reflected, 0 to 100 (the rest is transmitted). |
| offset | `0` | mm: an off-axis segment of the parent surface, this far from its vertex. |
| k | `0` | conic constant (0 sphere, −1 paraboloid). |
| R | `null` | mm radius of curvature, null for flat. Positive: concave towards the light it faces (focuses, f = R/2); negative: convex. |

### "lens": Lens

A lens of any number of surfaces (singlet, doublet, asphere, cylinder, axicon) in real glass.

**angle:** the direction of its optical axis. Surface 1 is on the side the axis points away from: at angle 0 light travelling +x meets surfaces[0] first.

| field | default | meaning |
|---|---|---|
| diameter | `25.4` | mm. |
| surfaces | two flat surfaces | list of surfaces in the order the light meets them at angle 0, each {"R": mm or null for flat, "k": conic, "A": [aspheric a4, a6, …], "coat": coating}. Standard sign convention: R > 0 has its centre of curvature on the far side (downstream). |
| gaps | `[3]` | mm: centre thicknesses between successive surfaces (one fewer than surfaces). |
| materials | `[{"glass":"N-BK7"}]` | one material per gap, e.g. {"glass": "N-BK7"}. |
| cyl | (none) | optional: "plane" for a cylindrical lens with power in the bench plane, "out" for power out of it. |

### "screen": Screen

A screen: records the rays and the field arriving on its face, and gives spot size, profile, PSF, MTF, Strehl and more.

**angle:** the direction its face points: towards the light it records.

| field | default | meaning |
|---|---|---|
| length | `25` | mm: the width of its face. |
| R | `null` | mm: a curved screen; negative puts its centre of curvature on the side the light comes from (like a retina); null for flat. |
| binWidth | `0` | mm for the binned intensity; 0 chooses. |
| binInterp | `true` | true interpolates the rays into the bins. |
| mapScale | `"lin"` | "lin" or "log" irradiance map. |
| vectorFocus | `"auto"` | "auto", "on" or "off": the vector focus model for steep beams. |
| mtfFreq | `50` | lp/mm at which the MTF is quoted. |

### "stop": Stop

An aperture: iris, slit, double slit, slit comb, knife edge or beam block.

**angle:** its normal: 0 for a beam travelling ±x (the blades then lie along y).

| field | default | meaning |
|---|---|---|
| aperture | `5` | mm: the opening (an iris’s diameter, a slit’s width). |
| outer | `25.4` | mm: the outer size (a beam block’s diameter). |
| shape | `"round"` | one of the stop shapes below. |
| sep | `0.5` | mm: a double slit’s centre-to-centre separation. |
| pitch | `0.2` | mm: a slit comb’s pitch. |
| count | `5` | a comb’s number of slits, 2 to 400. |
| offset | `0` | mm: the opening’s centre along the stop. |
| height | `0` | mm: a slit’s height out of the plane (0 unlimited). |
| side | `1` | 1 or −1: which side a knife edge covers. |

### "cube": Beam splitter cube

A beam-splitter cube: non-polarising ("npbs", reflect %) or polarising ("pbs", reflectS/reflectP %).

**angle:** turns its internal diagonal. At 0 the diagonal runs like "/": light travelling +x reflects to +y, travelling −x reflects to −y, and it transmits straight on. At 90 the diagonal is "\": +x reflects to −y.

| field | default | meaning |
|---|---|---|
| size | `12.7` | mm edge length. |
| mode | `"npbs"` | "npbs" or "pbs". |
| reflect | `50` | % reflected, for "npbs". |
| reflectS | `99` | % of s reflected, for "pbs". |
| reflectP | `1` | % of p reflected, for "pbs". |
| material | `{"glass":"N-BK7","abs":0}` | e.g. {"glass": "N-BK7"}. |
| coat | `{"mode":"bare","R":4}` | coating on its outer faces (see Coatings). |

### "prism": Prism

A glass prism or window.

**angle:** rotates the prism about its centre; check the result on the bench.

| field | default | meaning |
|---|---|---|
| shape | `"right"` | one of the prism shapes below. |
| size | `20` | mm. |
| thickness | `5` | mm (for a window). |
| material | `{"glass":"N-BK7","abs":0}` | e.g. {"glass": "N-BK7"}. |
| coat | `{"mode":"bare","R":4}` | coating on its faces. |

### "waveplate": Waveplate

A waveplate (retardance in waves).

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `25.4` | mm aperture. |
| retard | `0.25` | retardance in waves (0.25 quarter-wave, 0.5 half-wave, or any value). |
| axis | `45` | degrees: the fast axis from p. |

### "polariser": Polariser

A linear polariser.

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `25.4` | mm aperture. |
| axis | `0` | degrees: the transmission axis from p (0 passes p, 90 passes s). |

### "mask": Mask

A thin mask with an amplitude and a delay (in waves) written as formulas: also the way to model an ideal lens or objective.

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `25.4` | mm aperture. |
| amp | `"1"` | amplitude transmission as a formula in x (mm along the mask), y (mm out of the plane), r, theta, lambda (mm) and pi; e.g. "1" or "circ(r/2)". |
| delay | `"0"` | delay in waves as a formula in the same variables. An ideal lens of focal length f mm: "-(sqrt(r^2+f^2)-f)/lambda" (write f as a number). |
| preset | `"custom"` | leave "custom". |

### "grating": Grating

A diffraction grating, reflecting or transmitting.

**angle:** the direction its ruled face points (like a mirror for mode "reflect").

| field | default | meaning |
|---|---|---|
| length | `25` | mm. |
| lpmm | `600` | lines per mm. |
| mode | `"reflect"` | "reflect" or "transmit". |
| blaze | `500` | nm blaze wavelength. |
| eff | `80` | % into the first order at the blaze. |

### "fibre": Fibre

A fibre tip: takes free-space light into a fibre by mode overlap, and sends a fibre network’s light out.

**angle:** the direction its face points: towards the light it takes in, and the way it sends light out. Its fibre port is on the back.

| field | default | meaning |
|---|---|---|
| length | `2.5` | mm: the ferrule face width. |
| core | `4.4` | µm core diameter (mode field set from core and NA). |
| na | `0.12` | numerical aperture. |
| emitView | `"envelope"` | "envelope" or "field": how the light it sends out is shown. |
| emitRays | `5` | rays in the fan it sends out, 0 to 51. |

### "detector": Photodetector

A free-space photodiode with an amplifier: DC, beat notes, RF spectrum, oscilloscope trace and a mixer output.

**angle:** the direction its face points: towards the light.

| field | default | meaning |
|---|---|---|
| length | `3.6` | mm: the active area’s diameter. |
| material | `"si"` | one of the detector materials below. |
| resp | `0.5` | A/W, used when material is "custom". |
| gain | `10000` | V/A transimpedance. |
| bandwidth | `1000000` | Hz. |
| dark | `1` | nA dark current. |
| ampNoise | `2` | pA/√Hz input noise. |
| vmax | `10` | V output limit. |
| demodF | `0` | MHz: mix the output down at this frequency (0: no mixer). With an EOM at fm, this gives a PDH error signal. |
| demodPhase | `0` | degrees: the mixer’s phase. |

### "faraday": Faraday rotator

A Faraday rotator (non-reciprocal).

**angle:** its normal, and the direction of its magnetic field: the sense of rotation depends on the direction of travel against it.

| field | default | meaning |
|---|---|---|
| length | `5` | mm aperture. |
| rotation | `45` | degrees of rotation. |

### "isolator": Optical isolator

An optical isolator (polariser, 45° Faraday rotator, polariser).

**angle:** its forward direction: light travelling along the angle passes, light travelling against it is blocked.

| field | default | meaning |
|---|---|---|
| length | `5` | mm aperture. |
| axis | `0` | degrees: the input polariser from p. |
| extinction | `40` | dB, 0 to 80. |

### "crystal": Crystal

A birefringent crystal: beam displacer, Wollaston prism or Glan–Taylor polariser.

**angle:** the direction of its entrance face’s normal (0 for light travelling ±x).

| field | default | meaning |
|---|---|---|
| shape | `"displacer"` | one of the crystal shapes below. |
| crystal | `"calcite"` | one of the crystals below. |
| size | `10` | mm aperture. |
| length | `10` | mm length along the beam. |
| axisAngle | `45` | degrees: the optic axis from the normal, for a displacer. |
| wedge | `30` | degrees: the wedge angle, for Wollaston and Glan–Taylor. |

### "filter": Filter

A filter: long-pass, short-pass, band-pass or neutral density, optionally reflecting what it rejects (a dichroic).

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `25` | mm aperture. |
| ftype | `"longpass"` | one of the filter types below. |
| edge | `600` | nm: the edge of a long- or short-pass. |
| slope | `10` | nm: the 10–90% width of the edge. |
| centre | `550` | nm: a band-pass centre. |
| fwhm | `10` | nm: a band-pass width. |
| od | `1` | optical density of an "nd" filter: it transmits 10^−od. |
| tmax | `95` | % peak transmission. |
| reflect | `false` | true: what it rejects is reflected (a dichroic) rather than absorbed. |

### "gain": Gain medium

A thin gain medium with a Lorentzian gain line, so a cavity shows whether it is above threshold.

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `6` | mm along the beam. |
| g0 | `1.2` | single-pass power gain at the line centre (×). |
| centre | `1064` | nm line centre. |
| fwhm | `30` | nm line width. |

### "link": Link plane

One of a pair of link planes joining two tabs: the pair is one plane seen from two benches.

**angle:** its normal. Light crossing one plane of a pair leaves its partner (on another tab) the same way relative to that plane.

| field | default | meaning |
|---|---|---|
| length | `25` | mm width. |
| pair | `"Link 1"` | the pair’s name: exactly two link planes share it, one on each tab. |

### "aom": Acousto-optic modulator

A free-space acousto-optic modulator: shifts the diffracted order by the drive frequency.

**angle:** its normal: 0 for a beam travelling ±x. Order +1 turns the beam anticlockwise by asin(λ·rf/v); order −1 clockwise.

| field | default | meaning |
|---|---|---|
| length | `4` | mm aperture. |
| rf | `80` | MHz drive: the order is shifted by this. |
| v | `4200` | m/s sound speed (4200 for TeO₂ shear is typical of fibre AOMs; 650 slow shear). |
| eff | `80` | % into the order. |
| order | `1` | +1 or −1. |

### "eom": Electro-optic modulator

A free-space electro-optic modulator: phase (sidebands) or amplitude modulation.

**angle:** its normal: 0 for a beam travelling ±x.

| field | default | meaning |
|---|---|---|
| length | `4` | mm aperture. |
| fm | `20` | MHz drive. |
| beta | `1.08` | modulation depth in radians. |
| emode | `"phase"` | "phase" (sidebands) or "amplitude". |
| bias | `90` | degrees, for "amplitude". |
| loss | `0` | dB insertion loss. |

## Fibre components ("type": "fcomp")

Fibre components sit on the bench like any element (x, y, angle, name, id) and are joined by fibres from port to port. Give "kind" and its parameters; each port takes one fibre. At angle 0 the ports on the left are inputs and those on the right outputs, numbered from 0 in the order listed.

### kind "laser": Fibre laser

**ports:** 0 = out

| field | default | meaning |
|---|---|---|
| wavelength | `1550` | Wavelength (nm) |
| power | `1` | Power (mW) |
| coh | `0` | Coherence length (mm) |
| polAngle | `0` | Polarisation (° from s) |
| lineshape | `"lorentz"` | "lorentz" or "gauss" |

### kind "coupler": 2×2 coupler

**ports:** 0 = 1, 1 = 2, 2 = 3, 3 = 4

| field | default | meaning |
|---|---|---|
| ratio | `50` | Coupled across (%) |
| loss | `0` | Excess loss (dB) |

### kind "wdm": WDM

**ports:** 0 = common, 1 = pass, 2 = rest

| field | default | meaning |
|---|---|---|
| centre | `1550` | Pass band centre (nm) |
| fwhm | `20` | Pass band width (nm) |
| loss | `0.3` | Insertion loss (dB) |

### kind "circ": Circulator

**ports:** 0 = 1, 1 = 2, 2 = 3

| field | default | meaning |
|---|---|---|
| loss | `0.8` | Insertion loss (dB) |
| iso | `40` | Isolation (dB) |

### kind "iso": Isolator

**ports:** 0 = in, 1 = out

| field | default | meaning |
|---|---|---|
| loss | `0.5` | Insertion loss (dB) |
| iso | `40` | Isolation (dB) |

### kind "voa": Attenuator

**ports:** 0 = 1, 1 = 2

| field | default | meaning |
|---|---|---|
| att | `3` | Attenuation (dB) |

### kind "pc": Polarisation controller

**ports:** 0 = 1, 1 = 2

| field | default | meaning |
|---|---|---|
| a1 | `0` | Paddle 1, λ/4 (°) |
| a2 | `0` | Paddle 2, λ/2 (°) |
| a3 | `0` | Paddle 3, λ/4 (°) |

### kind "pol": In-line polariser

**ports:** 0 = 1, 1 = 2

| field | default | meaning |
|---|---|---|
| axis | `0` | Axis (° from s) |
| extinction | `30` | Extinction (dB) |
| loss | `0.5` | Insertion loss (dB) |

### kind "fm": Faraday mirror

**ports:** 0 = in

| field | default | meaning |
|---|---|---|
| rmax | `99` | Reflectance (%) |
| loss | `0` | Extra loss (dB) |

### kind "fbg": Fibre Bragg grating

**ports:** 0 = 1, 1 = 2

| field | default | meaning |
|---|---|---|
| centre | `1550` | Bragg wavelength (nm) |
| fwhm | `0.5` | Bandwidth (nm) |
| rmax | `90` | Peak reflectance (%) |

### kind "term": Terminator

**ports:** 0 = in

| field | default | meaning |
|---|---|---|
| rl | `60` | Return loss (dB) |

### kind "pd": Fibre photodiode

**ports:** 0 = in

| field | default | meaning |
|---|---|---|
| resp | `1` | Responsivity (A/W) |
| gain | `10000` | Gain (V/A) |
| vmax | `10` | Output limit (V) |
| bandwidth | `1000000000` | Bandwidth (Hz) |
| demodF | `0` | Demod. at (MHz) |
| demodPhase | `0` | Demod. phase (°) |

### kind "thru": Feedthrough

**ports:** 0 = port. Also "pair": a name shared by exactly two feedthroughs on different tabs, which then join as if by one fibre.

### kind "aom": Fibre AOM

**ports:** 0 = in, 1 = out

| field | default | meaning |
|---|---|---|
| rf | `80` | Drive (MHz) |
| order | `1` | Order (+1 or −1) |
| loss | `2.5` | Insertion loss (dB) |

### kind "eom": Fibre EOM

**ports:** 0 = in, 1 = out

| field | default | meaning |
|---|---|---|
| fm | `1000` | Drive (MHz) |
| beta | `1.08` | Depth β (rad) |
| bias | `90` | Bias (°, amplitude mode) |
| loss | `3` | Insertion loss (dB) |
| emode | `"phase"` | "phase" or "amplitude" |

## Catalogues

**Glasses** ("material": {"glass": name}): N-BK7, Fused silica, CaF2, N-F2, N-LAK22, N-SF6, N-SF10, N-SF11, S-LAH64, N-FK51A, N-PK51, N-BAK1, N-BAK4, N-BAF10, N-KZFS4, N-LAK10, N-LASF9, N-SF2, N-SF5, N-SF8, N-SF57, F2, SF2, SF5, SF10, SF11, Sapphire, MgF2, ZnSe, Silicon, Germanium. Also "AIR"; {"glass": "custom", "n": 1.52} for a fixed index; {"glass": name, "nd": 1.52, "vd": 64} from catalogue nd and Vd. Common aliases (BK7, UVFS, F_SILICA, CAF2) are understood.

**Crystals** ("crystal"): "calcite" (Calcite), "yvo4" (YVO₄), "abbo" (α-BBO).

**Crystal shapes** ("shape" of a crystal): "displacer" (Beam displacer), "wollaston" (Wollaston prism), "glan" (Glan–Taylor polariser).

**Prism shapes**: "right" (Right-angle prism), "equilateral" (Equilateral prism), "window" (Window).

**Stop shapes**: "round" (Iris), "slit" (Slit), "double" (Double slit), "comb" (Slit comb), "knife" (Knife edge), "disc" (Beam block).

**Filter types** ("ftype"): "longpass" (Long-pass), "shortpass" (Short-pass), "bandpass" (Band-pass), "nd" (Neutral density).

**Detector materials**: "si" (Silicon), "ingaas" (InGaAs), "ge" (Germanium), "custom" (Fixed responsivity).

**Coatings** ("coat", on lens surfaces, cubes and prisms): {"mode": "bare"} (Fresnel), {"mode": "ar", "R": 0.5} (% reflected), {"mode": "custom", "R": %}, {"mode": "band", "R": %, "lo": nm, "hi": nm} (coated over a band, bare outside), {"mode": "stack", "design": nm, "layers": [{"n": 1.38, "d": nm}, …]}.

## Examples

Four complete projects from the tool’s own examples, shortened to what differs from the defaults. Each opens as it is.

### Michelson interferometer

A laser, a 50/50 cube, two arms and two screens. Note the cube at angle 0 sends the reflected arm up (+y), the mirrors face back along their arms, and the screens face the light.

```json
{
  "format": "jekray",
  "version": 1,
  "name": "Michelson interferometer",
  "maxBounces": 40,
  "minPower": 0.001,
  "elements": [
    {"type":"source","id":"laser","name":"Laser","x":-60,"y":0,"angle":0,"width":2,"gauss":true,"w0":1,"z0":60,"beamView":"field","popN":128,"pol":"s","rays":3},
    {"type":"cube","id":"50-50-cube","name":"50/50 cube","x":0,"y":0,"angle":0,"coat":{"mode":"custom","R":0}},
    {"type":"mirror","id":"moving-mirror","name":"Moving mirror","x":50,"y":0,"angle":180},
    {"type":"mirror","id":"fixed-mirror","name":"Fixed mirror","x":0,"y":50,"angle":-90},
    {"type":"screen","id":"output-port","name":"Output port","x":0,"y":-45,"angle":90,"length":20},
    {"type":"screen","id":"input-port","name":"Input port","x":-30,"y":0,"angle":0,"length":20}
  ]
}
```

### Fabry-Perot cavity

A linear cavity. The end mirror’s R = 500 mm is concave towards the cavity (it faces −x at angle 180), so with the flat input coupler 250 mm away the cavity is stable. The tool finds the cavity itself and solves its steady state.

```json
{
  "format": "jekray",
  "version": 1,
  "name": "Fabry-Perot cavity",
  "maxBounces": 40,
  "minPower": 0.001,
  "elements": [
    {"type":"source","id":"laser","name":"Laser","x":-50,"y":0,"angle":0,"width":0.5,"gauss":true,"w0":0.3,"z0":50,"beamView":"field","pol":"s","rays":1},
    {"type":"mirror","id":"input-coupler","name":"Input coupler","x":0,"y":0,"angle":0,"reflect":99},
    {"type":"mirror","id":"end-mirror","name":"End mirror","x":250,"y":0,"angle":180,"reflect":99.9,"R":500},
    {"type":"screen","id":"transmitted","name":"Transmitted","x":300,"y":0,"angle":180,"length":20},
    {"type":"screen","id":"reflected","name":"Reflected","x":-20,"y":0,"angle":0,"length":20}
  ]
}
```

### Pound-Drever-Hall lock

Pound–Drever–Hall: an EOM’s 20 MHz sidebands, a pick-off cube sending the cavity’s reflection to a detector demodulated at 20 MHz. Its mixer output is the error signal.

```json
{
  "format": "jekray",
  "version": 1,
  "name": "Pound-Drever-Hall lock",
  "maxBounces": 40,
  "minPower": 0.0001,
  "elements": [
    {"type":"source","id":"laser","name":"Laser","x":-130,"y":0,"angle":0,"wavelength":1064,"width":0.5,"gauss":true,"w0":0.3,"z0":130,"beamView":"field","pol":"s","rays":1},
    {"type":"eom","id":"eom-20-mhz","name":"EOM, 20 MHz","x":-100,"y":0,"angle":0},
    {"type":"cube","id":"pick-off","name":"Pick-off","x":-50,"y":0,"angle":0,"coat":{"mode":"custom","R":0}},
    {"type":"mirror","id":"input-coupler","name":"Input coupler","x":0,"y":0,"angle":0,"reflect":99},
    {"type":"mirror","id":"end-mirror","name":"End mirror","x":250,"y":0,"angle":180,"reflect":99.9,"R":500},
    {"type":"screen","id":"beam-dump","name":"Beam dump","x":-50,"y":35,"angle":-90,"length":10},
    {"type":"detector","id":"pdh-photodiode","name":"PDH photodiode","x":-50,"y":-40,"angle":90,"length":10,"material":"custom","resp":1,"gain":1000,"bandwidth":1000000000,"demodF":20},
    {"type":"screen","id":"transmitted","name":"Transmitted","x":300,"y":0,"angle":180,"length":20}
  ]
}
```

### Two launches from one laser

A fibre network on the bench: a fibre laser, a coupler and two fibre tips, each launching through a collimating lens (each tip 50.6 mm behind a biconvex N-BK7 lens of f ≈ 50 mm at 1550 nm). Fibres join [id, port] to [id, port]; "len" is in metres. The two launches are one laser, so they interfere on the cube.

```json
{
  "format": "jekray",
  "version": 1,
  "name": "Two launches from one laser",
  "minPower": 0.0001,
  "elements": [
    {"type":"fcomp","kind":"laser","id":"laser","name":"Laser","x":-190,"y":125,"angle":0,"coh":3000},
    {"type":"fcomp","kind":"coupler","id":"splitter","name":"Splitter","x":-140,"y":125,"angle":0},
    {"type":"fibre","id":"launch-a","name":"Launch A","x":-110.6,"y":0,"angle":0,"core":9,"na":0.14},
    {"type":"lens","id":"collimator-a","name":"Collimator A","x":-60,"y":0,"angle":0,"surfaces":[{"R":51.5},{"R":-51.5}],"gaps":[3.6],"materials":[{"glass":"N-BK7"}]},
    {"type":"fibre","id":"launch-b","name":"Launch B","x":0,"y":110.6,"angle":-90,"core":9,"na":0.14},
    {"type":"lens","id":"collimator-b","name":"Collimator B","x":0,"y":60,"angle":-90,"surfaces":[{"R":51.5},{"R":-51.5}],"gaps":[3.6],"materials":[{"glass":"N-BK7"}]},
    {"type":"cube","id":"50-50-cube","name":"50/50 cube","x":0,"y":0,"angle":0,"coat":{"mode":"custom","R":0}},
    {"type":"detector","id":"photodiode","name":"Photodiode","x":0,"y":-50,"angle":90,"length":10,"material":"custom","resp":1,"gain":1000},
    {"type":"screen","id":"other-port","name":"Other port","x":60,"y":0,"angle":180,"length":20}
  ],
  "fibres": [
    {"a":["laser",0],"b":["splitter",0],"len":1},
    {"a":["splitter",3],"b":["launch-a",0],"len":1,"path":[{"x":-150,"y":40}]},
    {"a":["splitter",2],"b":["launch-b",0],"len":1.5,"path":[{"x":-40,"y":140}]}
  ]
}
```
