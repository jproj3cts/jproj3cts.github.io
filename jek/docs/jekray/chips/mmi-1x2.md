---
layout: docs
title: 1×2 MMI
permalink: /jek/docs/jekray/chips/mmi-1x2/
redirect_from: /jek/docs/jekray2d/chips/mmi-1x2/
description: "The JEKray 1×2 multimode interference splitter: equal and in phase to its two outputs, and a combiner backwards."
element: { palette: Photonic, type: pic, kind: mmi12 }
---

<div class="dx-note" markdown="1">
Photonic chips are an experimental feature. Switch them on under **Help › Experimental features**.
</div>

<p class="dx-lead">A 1 × 2 multimode interference (MMI) splitter divides its input equally between two outputs, in phase. It stands for a Y-branch too. Run backwards, it combines two waveguides into one.</p>

## Ports

**in** on one side; **out 1** and **out 2** on the other.

## The model

$$
S_{\text{in},1} = S_{\text{in},2} = S_{1,\text{in}} = S_{2,\text{in}} = \frac{a}{\sqrt2},
$$

with $$a$$ the excess loss in amplitude, and nothing between the two outputs. Backwards it adds its two inputs as fields, $$E_\text{in} = a(E_1 + E_2)/\sqrt2$$: light in phase on both comes through, and what is out of phase is sent off the chip, as in a real MMI or Y-branch.

## Settings

{% include jekray_params.html group="pic" key="mmi12" %}

## Readouts

Its ports and what they join, and the powers where the fibre network reaches them.

## Assumptions

<div class="dx-warn" markdown="1">
- Flat in wavelength, with no reflection: a real MMI's imbalance and its band are not modelled.
</div>

## Related

- [2×2 MMI](/jek/docs/jekray/chips/mmi-2x2/).
- [Splitter and combiner](/jek/docs/jekray/fibre/splitter/), the fibre one.
