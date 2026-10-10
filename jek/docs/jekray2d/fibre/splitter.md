---
layout: docs
title: Splitter and combiner
permalink: /jek/docs/jekray2d/fibre/splitter/
description: "The JEKray2D fibre splitter (1×N) and combiner (N×1): each branch takes 1/N of the power, in phase, and unrelated inputs combine with a loss of 10 log N."
element: { palette: Fibre, type: fcomp, kind: split }
---

<p class="dx-lead">A 1 × N splitter shares the light from its common port equally among N branches. Turned round, the same part is an N × 1 combiner. Light into any branch reaches the common port.</p>

## Ports

Port **common**, then the branches **1** to **N** (2 to 64). The splitter has its common port on the left and branches on the right; the combiner is drawn the other way round.

## The model

Each branch is joined to the common port by the same matrix, both ways:

$$
\mathbf S_{0k} = \mathbf S_{k0} = \frac{a}{\sqrt N}\,\mathbf I, \qquad k = 1, \dots, N,
$$

with $$a = 10^{-\ell/20}$$ for an excess loss $$\ell$$ (dB). So each branch carries $$1/N$$ of the power, in phase, $$10\log_{10}N + \ell$$ dB down. The branches are not joined to each other.

### As a combiner

Light from unrelated sources on its inputs each reaches the output $$10\log_{10}N + \ell$$ dB down. That is what a single-mode combiner does: its output keeps one mode, and the rest of each input's power is lost. Light of one laser on several inputs adds as fields, so when it arrives in phase on all $$N$$ inputs, all of it can come through:

$$
E_0 = \frac{a}{\sqrt N}\sum_{k=1}^{N} E_k = a\sqrt N\,E \quad\text{for } E_k = E.
$$

## Settings

{% include jekray2d_params.html group="fibre" key="split" %}

Also *combine*: true turns it round, as an N × 1 combiner. Fewer branches takes the fibres off the branches that go.

## Assumptions

<div class="dx-warn" markdown="1">
- The split is equal, flat in wavelength and the same for both polarisations.
- The branches leave in phase, and no light passes from one branch to another.
</div>

## Related

- [2×2 coupler](/jek/docs/jekray2d/fibre/coupler/), for an unequal split and four ports.
- [Star coupler](/jek/docs/jekray2d/fibre/star/), M × N.
