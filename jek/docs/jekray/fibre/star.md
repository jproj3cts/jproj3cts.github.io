---
layout: docs
title: Star coupler
permalink: /jek/docs/jekray/fibre/star/
redirect_from: /jek/docs/jekray2d/fibre/star/
description: "The JEKray star coupler: M inputs to N outputs, as a corner of a discrete Fourier transform, lossless when square."
element: { palette: Fibre, type: fcomp, kind: star }
---

<p class="dx-lead">A star coupler joins each of M inputs to each of N outputs. With as many inputs as outputs it is lossless, and each output takes 1/N of each input.</p>

## Ports

Inputs **in 1** to **in M** on one side, outputs **out 1** to **out N** on the other (each 1 to 32).

## The model

The coupler is the $$M \times N$$ corner of a $$K$$-point discrete Fourier transform, with $$K = \max(M, N)$$. From input $$i$$ to output $$j$$, counting from zero,

$$
\mathbf S_{ij} = \frac{a}{\sqrt K}\, e^{\,i 2\pi\, i j / K}\;\mathbf I,
$$

with $$a = 10^{-\ell/20}$$ for an excess loss $$\ell$$ (dB), the same both ways.

- With $$M = N$$, the matrix is unitary when $$a = 1$$. Each output takes $$1/N$$ of each input's power, and none is lost. A 2 × 2 star coupler is a 50:50 coupler, with a phase convention of its own.
- With fewer inputs than outputs, each input is still shared equally among all $$N$$ outputs.
- With more inputs than outputs, each input reaches the outputs with only $$N/M$$ of its power in all.

The DFT's phases are what make the outputs of one input interfere as they should: light of one laser into all the inputs, with the right phases, can be steered into a single output.

## Settings

{% include jekray_params.html group="fibre" key="star" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The split is ideal and flat in wavelength and polarisation, with the DFT's phases exactly.
- No light passes between inputs, or between outputs.
</div>

## Related

- [Splitter and combiner](/jek/docs/jekray/fibre/splitter/), 1 × N.
- [2×2 coupler](/jek/docs/jekray/fibre/coupler/).
