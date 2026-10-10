---
layout: docs
title: Optical spectrum analyser
permalink: /jek/docs/jekray2d/fibre/osa/
description: "The JEKray2D optical spectrum analyser: the light reaching it against wavelength, each line seen through the analyser's resolution bandwidth."
element: { palette: Fibre, type: fcomp, kind: osa }
---

<p class="dx-lead">An optical spectrum analyser shows the light reaching it against wavelength, in dBm, as a bench instrument does. It absorbs what it measures.</p>

## Ports

One port, **in**.

## The model

Every launch reaching the analyser (a laser, an LED's or an amplifier's slice of spectrum, a sideband or a shifted order) is a line at its wavelength $$\lambda_L$$, of power $$P_L$$, as wide as its own line:

$$
w_L = \frac{\lambda_L^2}{L_c},
$$

with $$L_c$$ its coherence length (zero width for a single-frequency laser). The analyser sees each line through its resolution bandwidth $$b$$, a Gaussian filter, so the trace is

$$
S(\lambda) = \sum_L P_L\,\frac{b}{W_L}\,\exp\!\left(-4\ln 2\left(\frac{\lambda - \lambda_L}{W_L}\right)^{2}\right),
\qquad W_L = \sqrt{w_L^2 + b^2}.
$$

So a line narrower than the resolution peaks at its power, and broadband light shows its power in a resolution bandwidth, as on a real analyser. Narrowing the resolution lowers the level of broadband light but not of a laser line.

### The display

The trace is in dBm, ten divisions down from a top level set in dBm, at a set number of dB per division. Its span runs between two wavelengths set, or, left at 0, covers every line with three of its widths either side, at least 40 resolution bandwidths across.

## Settings

{% include jekray2d_params.html group="fibre" key="osa" %}

## Readouts

Its panel draws the spectrum, which can be saved as a picture (PNG) or as its numbers (CSV).

## Assumptions

<div class="dx-warn" markdown="1">
- The analyser's filter is Gaussian, with no noise floor, no sensitivity limit and no ghost lines.
- A line's shape is drawn as Gaussian, whatever the laser's line shape.
- It reads the light's power in each polarisation together.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray2d/fibre/photodetector/).
- [Fibre amplifier](/jek/docs/jekray2d/fibre/amplifier/), whose spontaneous emission it shows.
