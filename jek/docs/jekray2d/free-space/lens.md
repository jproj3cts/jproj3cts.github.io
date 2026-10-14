---
layout: docs
title: Lens
permalink: /jek/docs/jekray2d/free-space/lens/
description: The JEKray2D lens, any number of surfaces in real glass, with conic, aspheric and odd terms and coatings; singlets, doublets, aspheres, cylinders and axicons.
element: { palette: Free space, type: lens }
---

<p class="dx-lead">A lens is any number of refracting surfaces in real glass: a singlet, a cemented doublet or triplet, an asphere, a cylindrical lens or an axicon. Rays are traced through each surface exactly, and a beam takes the phase the real surfaces give it.</p>

## The model

### Prescription

A lens of $$N$$ surfaces has $$N - 1$$ gaps (the centre thicknesses between surfaces) and $$N - 1$$ materials, one for each gap. Each surface has:

- a radius $$R$$ (blank for flat);
- a conic constant $$k$$;
- aspheric coefficients $$A_j$$ on $$y^4, y^6, \ldots$$;
- odd coefficients;
- a coating.

Its sag is the general surface of [Concepts](/jek/docs/jekray2d/concepts/#surfaces):

$$
\mathrm{sag}(y) = \frac{c\,y^2}{1 + \sqrt{1 - (1+k)\,c^2 y^2}} + a_2 y^2 + \sum_{j \ge 1} A_j\, y^{2j+2} + \sum_{j \ge 1} \alpha_j\, \vert y\vert ^{j}, \qquad c = 1/R.
$$

Signs follow the usual optical convention along the lens's axis: $$R > 0$$ has its centre of curvature downstream. A biconvex lens is $$R_1 > 0,\ R_2 < 0$$. Light travelling along the lens's angle meets surface 1 first.

The presets build on this:

- **Asphere:** a conic surface with $$k \ne 0$$.
- **Axicon:** a flat surface with a first odd term $$\alpha_1 = \tan\beta$$, a cone of half-angle $$\beta$$.
- **Cylindrical lens:** a lens with power in only one direction, either in the bench plane or out of it. Power out of the plane is flat to the rays, which stay in the plane, but rides along for the beam, the field and cavity matrices.

### Refraction

At each surface rays refract by Snell's law at the exact point and normal, with the index of the glass either side at the ray's own wavelength (see [Free-space optics](/jek/docs/jekray2d/free-space/#rays)):

$$
n^2(\lambda) - 1 = \sum_{i=1}^{3} \frac{B_i\,\lambda^2}{\lambda^2 - C_i}.
$$

So chromatic aberration, spherical aberration and the rest come out of the trace rather than being added. Each surface reflects by its Fresnel coefficients or its coating, and the reflection becomes a branch of its own when weak reflections are followed. Light that reaches a surface beyond the critical angle is totally internally reflected.

The lens's edges are faces too. A ray that leaves through its rim, outside the clear aperture, is stopped there.

### Paraxial readouts

The panel gives the effective and back focal lengths at each source's wavelengths, from a paraxial trace of a ray at unit height. At each surface,

$$
n_2 u_2 = n_1 u_1 - (n_2 - n_1)\,c\,y, \qquad y \leftarrow y + t\,u_2,
$$

so that after the last surface

$$
\mathrm{EFL} = -\frac{1}{u}, \qquad \mathrm{BFL} = -\frac{y}{u}.
$$

These are read-outs only. The trace itself is exact.

### Beams and the field

A Gaussian beam goes through each surface by the ray-transfer matrix of its local curvature, in the plane and out of it. The diffracted field takes each surface as a phase screen: rays traced through it in three dimensions give the real surface's phase, aberrations included (see [Free-space optics: surfaces as phase screens](/jek/docs/jekray2d/free-space/#surfaces-as-phase-screens)).

## Settings

{% include jekray2d_params.html group="free" key="lens" %}

Each surface in `surfaces` takes `R` (mm, or `null` for flat), `k`, `A` (a list of aspheric coefficients from $$y^4$$), `odd` and `coat`. A material is a glass from the catalogue, such as `{"glass": "N-BK7"}`, a fixed index, `{"glass": "custom", "n": 1.52}`, or a table of $$n$$ and $$k$$ against wavelength.

## Importing a catalogue lens

**File › Import a lens (.zmx)** reads the Zemax files Thorlabs, Edmund and other makers publish into a lens on the bench, with its surfaces and glasses: singlets, achromats and triplets, even aspheres with their conic and polynomial terms, cylindrical lenses (a toroidal surface with no curvature the other way), windows and beam splitter cubes. A .zar archive is read too: the .zmx inside it is taken, and the glass catalogue the archive carries supplies the dispersion of any glass the tool does not know. The file's primary wavelength is kept as the lens's design wavelength. Where the part number names a standard coating (Thorlabs' -A, -B and -C AR bands), or the file names one (Edmund's EO_VIS0, VIS-NIR, NIR I and II, SWIR, UV-AR and MgF₂ codes), the surfaces are given its band. A moulded asphere's file often ends with the laser diode's cover glass; that window is left out, and the note says so.

The glasses are the makers' own: Schott, Ohara, Hoya, CDGM and Sumita catalogues, some 1,200 glasses by their catalogue formulas, plus the crystals and the optical plastics (PMMA, polycarbonate, Zeonex E48R, polystyrene) and Schott's B 270, Borofloat and Zerodur. Names are read as the files spell them (N-BK7, NBK7, N-BK7_SCHOTT, H-K9L, S-LAH64, M-TAF1, K-VC89), and the moulded glasses of Thorlabs' aspheres (D-ZK3M, D-ZLAF52LAM, H-LAK54M) carry their moulded index. Under **Material**, **Search the glass catalogues…** finds any of them by name.

When the import has to assume something (a coating from the part number, a fold it cannot follow, a glass it does not know), the part's panel opens with a red note listing each assumption, and the part carries a ringed red ! on the bench. **Dismiss** clears the notes once you have checked them. A glass with no index stays flagged until you choose it under **Material**.

A part kept in **My parts** comes onto the bench under the name it is kept as, so renaming it there renames what you add.

## Exporting a lens

**File › Export a lens (.zmx)** writes the lenses you have selected as a sequential .zmx prescription, which lens-design programs open. It holds:

- every face's radius, conic and aspheric terms (even or odd), its glass and its semi-diameter;
- the wavelengths of the bench's sources, the first as the primary;
- an object at infinity, the stop on the first face, and the image at the paraxial back focus at the primary wavelength.

Several lenses and [windows](/jek/docs/jekray2d/free-space/prism/) on one axis are written as one system, with the air between them. The faces are written in the order the light meets them, going away from a source on the axis; with no source there, the way most of the parts face. A lens turned round is written with its faces reversed. A single mirror can be exported too.

A catalogue glass is written by its catalogue name. Any other material, such as a fixed index, a measured table or an RF dielectric, is written as a model glass, by its index and Abbe number at the d line. A lens designer may want to replace those with the real glass.

Coatings, tilts and decentres are not written. Cylindrical lenses, lenses that are not on one axis, and other parts are refused, with the reason.

The .zmx format is plain text. Reading or writing it needs no licence. Zemax and OpticStudio are trademarks of Ansys, Inc. JEKray2D is not affiliated with or endorsed by Ansys.

## Assumptions

<div class="dx-warn" markdown="1">
- Every surface is a figure of revolution about the lens's axis, which lies in the bench plane: no decentred or tilted surfaces within one lens. Tilt or move the whole lens instead.
- A catalogue glass is described by its maker's dispersion formula (Sellmeier, or Hoya's and Sumita's polynomial). A glass the tool does not know takes its formula from the catalogue in a .zar archive, or else the $$n_d$$ and $$V_d$$ the file gives for it. With none of those, it falls back to $$n = 1.5$$, and the import report and the lens's panel both say so: choose the glass, or its equivalent, under **Material**.
- Non-sequential files (prisms and some mirrors are published that way) are not read: they fold the light in ways a sequential prescription cannot hold. Build the prism from the [prism](/jek/docs/jekray2d/free-space/prism/) part instead.
- No thermal effects, stress birefringence or surface errors.
</div>

## Related

- [Mirror](/jek/docs/jekray2d/free-space/mirror/), for reflecting surfaces.
- [Free-space optics: coatings](/jek/docs/jekray2d/free-space/#coatings), for AR coatings and thin-film stacks on lens surfaces.
