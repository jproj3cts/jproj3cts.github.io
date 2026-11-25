---
layout: docs
title: Mirror
permalink: /jek/docs/jekray/free-space/mirror/
redirect_from: /jek/docs/jekray2d/free-space/mirror/
description: The JEKray mirror, plane, spherical, conic or off-axis, partly transmitting and chirped, and how it is modelled.
element: { palette: Free space, type: mirror }
---

<p class="dx-lead">A mirror reflects from its coated face. It can be plane, spherical or any conic, cut off-axis from its parent surface, partly transmitting, and chirped, adding a group delay dispersion to each reflection.</p>

## The model

### Shape

The mirror is a surface in its own frame (see [Concepts](/jek/docs/jekray/concepts/#surfaces)). Its working face points along the mirror's angle, and its sag is the conic

$$
\mathrm{sag}(y) = \frac{c\,(y + y_0)^2}{1 + \sqrt{1 - (1+k)\,c^2 (y + y_0)^2}} - \mathrm{sag}(y_0), \qquad c = \frac{1}{R},
$$

over $$\vert y\vert $$ up to half its length. $$y_0$$ is the off-axis offset: the aperture slides that far along the parent curve, which is how an off-axis parabola is made ($$k = -1$$). $$R$$ is positive when the mirror is concave towards the light it faces, so its focal length is $$R/2$$. Leave $$R$$ blank for a plane mirror.

**Reflectance and what passes.** A mirror reflects its **Reflectance** and passes the rest, unless **Passes through** says otherwise: then what is neither reflected nor passed is absorbed. A black wall is a mirror of reflectance 5 that passes nothing; a mirror of 90 that passes 0 is a hot reflector, the 10 % lost as heat.

A mirror can have a **hole through it**: a round hole of that diameter at its middle (up to 95 % of its length), as a scraper or a pick-off mirror has. Light through the hole goes on as if the mirror were not there; the rest is reflected. The hole shows in the bench, the 3D view and the CAD export.

### Reflection

Rays and beams reflect by the law of reflection, $$\hat d_r = \hat d - 2(\hat d\cdot\hat n)\hat n$$, at the exact point and normal on the surface. A mirror reflects a share $$R_m$$ of the power (the *reflectance*, %) in amplitude $$\pm\sqrt{R_m}$$, both polarisations alike.

The sign matters for interference. From its coated face a mirror turns the field over, half a wave. From behind, a partly transmitting mirror reflects the other way up, as a lossless one must by the Stokes relations:

$$
t\,t' - r\,r' = 1, \qquad r' = -r.
$$

With the same sign both ways a cavity would not conserve energy, and its reflected light would not cancel on resonance. The rest of the power, $$1 - R_m$$, is transmitted as a branch of its own. A mirror reflecting 100 % absorbs light reaching its back.

For a beam, the reflection is a ray-transfer matrix in the plane, with the surface's local curvature, and one out of it, found from rays traced through the real surface in three dimensions. Off-axis incidence then gives the tangential and sagittal focal lengths

$$
f_t = \frac{R\cos\theta}{2}, \qquad f_s = \frac{R}{2\cos\theta},
$$

so a curved mirror used off axis makes a beam astigmatic, as it does in the lab.

### Tip

A mirror (as any free-space part) can be tipped out of the bench plane by its **Tip** $$\tau$$ (degrees, up positive), as the vertical knob of a kinematic mount tips it. Its normal is then

$$
\hat n = (\cos\phi\cos\tau,\ \sin\phi\cos\tau,\ \sin\tau),
$$

with $$\phi$$ its **Angle**. Rays meet it in 3D, within its round aperture, and reflect by $$\hat d' = \hat d - 2(\hat d\cdot\hat n)\,\hat n$$. Square on, a tip $$\tau$$ sends the light back rising at $$2\tau$$. A tipped 45° fold also turns the polarisation, as a real one does: s and p are taken from the tipped plane of incidence (see [heights](/jek/docs/jekray/free-space/#heights)). Two mirrors tipped $$45°$$ one over the other, the upper at its own height and tipped $$-45°$$, make a periscope.

### Chirped mirrors

A mirror can add a group delay dispersion $$\mathrm{GDD}$$ (fs²) to each reflection: a spectral phase $$\tfrac12\,\mathrm{GDD}\,(\omega - \omega_0)^2$$ on the light reflected from its face. A negative GDD compresses a positively chirped pulse. See [Short pulses](/jek/docs/jekray/free-space/#short-pulses).

### Steering mirrors

A mirror **steered by signals** (a galvo, a piezo mount) has two inputs for the [electronics](/jek/docs/jekray/electronics/): **turn** and **tip**. A voltage $$v$$ on turn turns the mirror in the bench plane about its centre by $$\theta = k\,v$$, and on tip tips it out of the plane by the same, with $$k$$ its **Turn** in degrees per volt. The reflected beam turns by $$2\theta$$. Its **Angle** and **Tip** are where it rests, at 0 V, and are what the file keeps.

The bench shows the mirror where its drive puts it. A DC level moves it and the beam with it, and the panel says how far it stands from rest. A drive with a tone of 5 Hz or slower is played: the bench is traced again as the mirror moves, at the page's own clock. A quicker drive is not drawn. The mirror then stands at the drive's mean, and the photodiodes follow the motion quasi-statically, as they follow every drive: the bench is traced at levels across the drive's swing and each photodiode's light goes with the drive by that table. So a beam scanned across a pinhole or a small photodiode gives the signal a real one would.

The mirror follows its drive at any frequency: a real one's resonance and settling time are not modelled. A photodiode's output wired back to a steering mirror is a loop through the light, which is not solved, so it reads nothing.

### Retroreflectors

A **retroreflector** is a hollow corner cube: three flat mirrors square to one another, meeting at a corner behind a round opening. It is traced as those three mirrors. A ray reflects off each in turn by the same law as off any mirror, and three reflections off three square faces reverse its direction whatever way it came, in the bench plane or out of it, and whichever way the retroreflector is turned or tipped. The ray leaves from the point opposite, across the corner, having gone as far as off a plane mirror set at the corner square to it.

The corner is $$d/\sqrt2$$ behind the middle of an opening of diameter $$d$$, where a cube corner's is under the circle its three faces just reach. The faces' normals stand $$54.7°$$ from the axis, $$120°$$ apart round it, one leaning straight up. Each face ends where it meets the other two, at the opening's plane, and at the cylinder behind the opening.

Because the mirrors are real, the rest follows as it does on the bench. Light far enough off the axis meets only one or two of them before it leaves, and goes elsewhere. **Each mirror reflects** sets one face's reflectance, so three faces at 90 % return 72.9 %, and what a face does not reflect is lost. The polarisation is carried through the three reflections in 3D, as through any tipped mirror: off ideal mirrors a linear polarisation comes back as it went in. The Gaussian beam and the diffracted field follow the three reflections too. A ray into the corner itself, or along the line where two faces meet, meets those faces one after another at that point. The backs of the mirrors absorb.

## In the parts list

The Mirrors group lists the plain mirror and the kinds most often wanted. Each is this same mirror begun with its kind's settings, so any of them can be made into any other in its panel.

| Entry | A new one is |
|---|---|
| Mirror | flat, fully reflecting, at 45° to fold a beam |
| Concave mirror | spherical, $$R = 200$$ mm, facing the beam: $$f = 100$$ mm |
| Convex mirror | spherical, $$R = -200$$ mm |
| Parabolic mirror | $$R = 200$$ mm, conic $$-1$$: no spherical aberration for a beam along its axis |
| Off-axis parabola | the 90° one: $$R = 50.8$$ mm, conic $$-1$$, offset $$50.8$$ mm, which turns a beam along its axis through a right angle to a focus $$50.8$$ mm away |
| Partial reflector | flat, reflecting 50 %, the rest passing: a plate beam splitter or an output coupler |
| Chirped mirror | flat, $$-50$$ fs² a reflection |
| Steering mirror | flat, steered by signals, 1° per volt |
| Retroreflector | a hollow corner cube with a 25.4 mm opening, facing the beam |

One more entry in the group is another part: the **Dichroic mirror** is a [filter](/jek/docs/jekray/free-space/filter/#as-a-dichroic) that reflects what it blocks.

## Settings

{% include jekray_params.html group="free" key="mirror" %}

## Readouts

A mirror reads the light arriving at its face as a screen does. Its panel has tabs for:

- the **Rays** that arrive;
- the **Diffraction** pattern: the irradiance map, point spread function, MTF and Strehl ratio of the field;
- the **Pulse**, for a pulsed source.

The light that leaves after it is not changed by reading it.

## Assumptions

<div class="dx-warn" markdown="1">
- The reflectance is the same for s and p, and does not depend on wavelength or angle. For a coating that does, use a [lens](/jek/docs/jekray/free-space/lens/) surface with a thin-film stack, or a dichroic filter.
- The mirror has no thickness: transmitted light passes straight through, without a substrate's refraction.
- The surface is a perfect conic: no surface figure error or roughness.
</div>

## Related

- [Lens](/jek/docs/jekray/free-space/lens/), for refracting surfaces and thin-film coatings.
- [Free-space optics: cavities](/jek/docs/jekray/free-space/#cavities): two or more mirrors facing each other make a cavity, found and solved automatically.
