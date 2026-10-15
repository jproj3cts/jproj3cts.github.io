---
layout: docs
title: Optical switch
permalink: /jek/docs/jekray/fibre/switch/
redirect_from: /jek/docs/jekray2d/fibre/switch/
description: "The JEKray 2×2 optical switch: bar or cross, with insertion loss and the crosstalk leaking the other way."
element: { palette: Fibre, type: fcomp, kind: switch }
---

<p class="dx-lead">A 2 × 2 optical switch routes light bar (straight through) or cross (across), leaking a little the other way.</p>

## Ports

Ports **1** and **2** on one side, **3** and **4** on the other.

- *Bar*: 1 to 3, and 2 to 4.
- *Cross*: 1 to 4, and 2 to 3.

## The model

The path the switch is set to has an amplitude $$a = 10^{-\ell/20}$$ for an insertion loss $$\ell$$ (dB). The other path leaks at the crosstalk $$X$$ further down, $$10^{-(\ell + X)/20}$$:

$$
\text{bar:}\quad \mathbf S_{13} = \mathbf S_{24} = a\,\mathbf I,\quad \mathbf S_{14} = \mathbf S_{23} = a\,10^{-X/20}\,\mathbf I,
$$

and the other way round for cross. It is the same in both directions.

## Settings

{% include jekray_params.html group="fibre" key="switch" %}

The state is 0 for bar and 1 for cross. As a number it can be swept, to compare the two.

## Assumptions

<div class="dx-warn" markdown="1">
- The switch is in one state or the other: there is no switching time and no state in between.
- Its loss and crosstalk do not depend on wavelength or polarisation, and the leak adds no phase.
</div>

## Related

- [2×2 coupler](/jek/docs/jekray/fibre/coupler/).
