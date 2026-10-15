---
layout: docs
title: Vapour cell
permalink: /jek/docs/jekray/free-space/cell/
redirect_from: /jek/docs/jekray2d/free-space/cell/
description: The JEKray atomic vapour cell, Rb, Cs or K on the D1 or D2 line, with Doppler-broadened hyperfine absorption and dispersion, saturation, saturated absorption between beams and the Zeeman effect.
element: { palette: Free space, type: cell }
---

<p class="dx-lead">A glass cell of alkali vapour: rubidium, caesium or potassium, on the D1 or D2 line. It absorbs and delays light near the atoms' lines, as the vapour does at its temperature. A strong beam saturates it, and a weak beam crossing a strong one sees the Lamb dips and crossovers of saturated absorption. A magnetic field along it splits the lines.</p>

## The model

### Absorption and dispersion

Each hyperfine transition of the D line absorbs with its own Voigt profile: the Doppler spread of the vapour at its temperature, convolved with the natural width of the excited state. Each is weighted by the ground level's share of the atoms and the transition's relative strength. The number density follows the vapour pressure at the cell's temperature (Alcock, Itkin and Horrigan, 1984).

Through a cell of length $$L$$ the field is multiplied by

$$
t = \exp\!\left(-\frac{\alpha L}{2}\right)\, e^{-i k (n - 1) L},
$$

where the absorption coefficient $$\alpha$$ and the refractive index $$n$$ of the same lines both come from the Faddeeva function $$w(z)$$, whose real and imaginary parts carry absorption and dispersion together. The atomic data, the lines' frequencies, hyperfine splittings, strengths and widths, are from Steck's Rubidium and Cesium D Line Data, and Tiecke's Properties of Potassium.

### Saturation, slice by slice

The cell is worked out slice by slice along its length, and point by point across each beam:

- **The light's own beam** saturates the lines it is on. For a Doppler-broadened line the absorption falls as $$\alpha/\sqrt{1 + s}$$, $$s$$ the saturation parameter, and less as the beam is absorbed on the way through. Its real profile is used, so a vortex pump leaves its dark core unsaturated.
- **Every other beam crossing the cell** burns a hole in the velocity class it talks to. With an angle $$\vartheta$$ between the two, the hole sits at

  $$
  \nu - \nu_a = \cos\vartheta\,(\nu_p - \nu_b),
  $$

  power broadened (a Lorentzian), and smeared by the atoms moving across the pump (a Gaussian, so together a Voigt). Head on, that gives the Lamb dip and the crossovers. Side by side, it gives a broad dip with no sub-Doppler feature. The hole's depth follows the other beam's intensity where the light is in that slice, so beams crossing at an angle meet over part of the cell only.

### At an angle

Light crossing the cell at an angle $$\theta$$ to its axis, the cell turned in the bench plane or tipped out of it, goes $$L/\cos\theta$$ through the vapour, so each slice's absorption and dispersion count for $$1/\cos\theta$$ more.

### A magnetic field

A field $$B$$ along the cell's axis splits each line into its Zeeman components. Each level's hyperfine and Zeeman Hamiltonian,

$$
H = A\,\mathbf I\cdot\mathbf J + \mu_B B\,(g_J m_J + g_I m_I) \;(+\,\text{the quadrupole term for } J' = 3/2),
$$

is diagonalised in the uncoupled basis $$\lvert m_I\, m_J\rangle$$, one block of $$m_F$$ at a time. So it holds from the weak field through the Paschen–Back regime, as ElecSus does. Light along the field drives $$\sigma^+$$ and $$\sigma^-$$ transitions only, so left and right circular light see different lines. That makes circular dichroism, for a DAVLL lock, and Faraday rotation, for a Faraday filter.

## Settings

{% include jekray_params.html group="free" key="cell" %}

Set the source's wavelength to the line in vacuum nanometres: Rb D2 780.24 nm, Cs D2 852.35 nm.

## Assumptions

<div class="dx-warn" markdown="1">
- Saturation uses rate equations for each transition alone, with no optical pumping between levels. Where the dips are and how wide is right; how deep, crossovers above all, only roughly.
- The field, if any, is along the cell's axis.
- Collisions with a buffer gas, and the cell walls, are not modelled.
</div>

## Related

- [Source](/jek/docs/jekray/free-space/source/), split into a pump and a probe for saturated absorption.
- The [validation page](/jek/tools/jekray-validation.html) compares the cell with ElecSus.
