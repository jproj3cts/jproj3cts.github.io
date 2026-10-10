---
layout: docs
title: Link plane
permalink: /jek/docs/jekray2d/free-space/link/
description: The JEKray2D link plane, one of a pair joining two tabs, so light, beams, fields and cavities carry from one bench to another.
element: { palette: Free space, type: link }
---

<p class="dx-lead">A pair of link planes joins two tabs. The pair is one plane seen from two benches: light crossing one leaves its partner on the other tab, so a large setup can be split across tabs and still be traced as one.</p>

## The model

A project can hold several benches, each on a tab, traced as one scene. A ray keeps to the bench it is on. Two link planes that share a pair name, one on each tab, are the same plane. Light crossing one of them leaves the other, on the partner's tab, at the same place along the plane, going the same way relative to it.

Formally, a ray reaching the first plane at a distance $$s$$ along it, at an angle $$\phi$$ to its normal, leaves the second plane at the same $$s$$ and the same $$\phi$$, measured in the second plane's own frame. Its optical path, polarisation and phase carry across unchanged, as does its Gaussian beam parameter. So the beam tree, the diffracted field and cavities all carry across too. A cavity can be split across two tabs.

On the bench, each plane shows where it leads: its partner's name, or its tab's.

## Settings

{% include jekray2d_params.html group="free" key="link" %}

A pair name is shared by exactly two planes. A plane whose name no other plane shares has no partner, and says so. Light that reaches it stops there.

## Assumptions

<div class="dx-warn" markdown="1">
- A link plane is ideal: no loss, no aperture beyond its width, no reflection.
- Exactly two planes share a name. A third is not joined.
</div>

## Related

- The [fibre feedthrough](/jek/docs/jekray2d/fibre/feedthrough/), which does the same for a fibre network.
- [Concepts: tabs and link planes](/jek/docs/jekray2d/concepts/#tabs-and-link-planes).
