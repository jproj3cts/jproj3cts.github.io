---
layout: docs
title: Crystal
permalink: /jek/docs/jekray2d/free-space/crystal/
description: The JEKray2D birefringent crystal, a beam displacer, Wollaston prism or Glan–Taylor polariser in calcite, YVO₄ or α-BBO.
element: { palette: Free space, type: crystal }
---

<p class="dx-lead">A birefringent crystal, where s and p see different indices and go their own ways. It can be a beam displacer, a Wollaston prism or a Glan–Taylor polariser, cut from calcite, YVO₄ or α-BBO.</p>

## The model

### Two indices

A uniaxial crystal has an ordinary index $$n_o$$ and an extraordinary index $$n_e$$, each from its own dispersion formula:

- calcite: Ghosh, 1999;
- YVO₄: Shi et al., 2001;
- α-BBO: Eimerl et al., 1987.

Light polarised across the optic axis sees $$n_o$$. Light polarised in the plane of the optic axis sees an index between $$n_o$$ and $$n_e$$, set by the angle $$\theta$$ between its wave normal and the axis:

$$
\frac{1}{n^2(\theta)} = \frac{\cos^2\theta}{n_o^2} + \frac{\sin^2\theta}{n_e^2}.
$$

A ray entering the crystal splits into its s and p parts, and each is traced with its own index from there on. The beam tree splits the same way.

### Beam displacer

The optic axis lies in the bench plane, tilted by $$\theta$$ from the faces. So p is the extraordinary ray: its energy walks off sideways from its wave normal by

$$
\tan\rho = \frac{(n_o^2 - n_e^2)\sin\theta\cos\theta}{n_e^2\cos^2\theta + n_o^2\sin^2\theta},
$$

while s goes straight. The two leave parallel, side by side, a distance $$L\tan\rho$$ apart for a crystal of length $$L$$.

### Wollaston prism

Two wedges with their optic axes crossed: across the beam in the plane in the first, and out of the plane in the second. At the join, s and p swap between the ordinary and extraordinary index, so they refract opposite ways and leave diverging. The angle between them grows with the wedge angle and with $$\lvert n_e - n_o\rvert$$.

### Glan–Taylor polariser

Two prisms with an air gap cut between them, at an angle between the two critical angles $$\arcsin(1/n_o)$$ and $$\arcsin(1/n_e)$$. The polarisation with the higher index is totally reflected out of the side, and the other passes. So it is a polariser with a very high extinction ratio, and its rejected light leaves as a beam of its own.

### Tipped and rolled

With the experimental 3D view on, a crystal can be tipped or rolled out of the plane, and its optic axis $$\hat c$$ turns with it. The light entering is then split along the crystal's own two polarisations, not s and p:

- the ordinary one along $$\hat k \times \hat c$$, across the axis and the wave normal $$\hat k$$;
- the extraordinary one at right angles to it and to $$\hat k$$.

The extraordinary index is taken at the wave normal's own angle to the axis, $$n(\theta)$$ above, and its energy walks off by $$\rho$$ in the plane of $$\hat k$$ and $$\hat c$$. Rolled $$90°$$, a beam displacer walks its beam up instead of across, and a Wollaston prism splits up and down. Rolled $$45°$$, a Wollaston prism splits p light into two equal beams on the diagonal. The faces split the light by their Fresnel coefficients in their own planes of incidence, as an isotropic face would.

## Settings

{% include jekray2d_params.html group="free" key="crystal" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Unturned, the optic axis lies in the bench plane, or straight out of it. Tipping or rolling the crystal turns it out of the plane; crystals cut with other axes are not modelled.
- The Glan–Taylor's gap is cut for 633 nm. Far from it, both polarisations may pass or both reflect.
- The faces are uncoated: each reflects by its Fresnel coefficients for its own index.
</div>

## Related

- [Beam splitter](/jek/docs/jekray2d/free-space/cube/), a polarising cube with a set leakage.
- [Polariser](/jek/docs/jekray2d/free-space/polariser/), an ideal thin polariser.
