---
layout: docs
title: Terminator
permalink: /jek/docs/jekray/fibre/terminator/
redirect_from: /jek/docs/jekray2d/fibre/terminator/
description: "The JEKray fibre terminator: absorbs what arrives, sending back only its return loss."
element: { palette: Fibre, type: fcomp, kind: term }
---

<p class="dx-lead">A terminator ends a fibre cleanly. It absorbs the light that arrives and sends back only what its return loss lets through. It closes an unused port of a coupler.</p>

## Ports

One port, **in**.

## The model

For a return loss $$\mathrm{RL}$$ (dB), the light reflected back is

$$
\mathbf S_{11} = 10^{-\mathrm{RL}/20}\,\mathbf I,
$$

$$10^{-\mathrm{RL}/10}$$ of the power. At the default 60 dB that is a millionth.

A port left open, with no fibre and no terminator, also takes in what reaches it and reflects nothing. A terminator is the way to give it a reflection, or to show on the bench that the port is ended.

## Settings

{% include jekray_params.html group="fibre" key="term" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Its reflection is flat in wavelength and the same for both polarisations.
</div>

## Related

- [Fibre optics: along a fibre](/jek/docs/jekray/fibre/#along-a-fibre), for the reflections of a fibre's own ends.
- [Attenuator](/jek/docs/jekray/fibre/attenuator/).
