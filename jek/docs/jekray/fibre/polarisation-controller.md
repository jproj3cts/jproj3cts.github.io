---
layout: docs
title: Polarisation controller
permalink: /jek/docs/jekray/fibre/polarisation-controller/
redirect_from: /jek/docs/jekray2d/fibre/polarisation-controller/
description: "The JEKray three-paddle polarisation controller: a quarter-wave, a half-wave and a quarter-wave, each turned about the fibre, and the transpose back."
element: { palette: Fibre, type: fcomp, kind: pc }
---

<p class="dx-lead">A three-paddle polarisation controller: loops of fibre that act as a quarter-wave, a half-wave and a quarter-wave plate, each turned about the fibre. Together they take any polarisation in to any polarisation out.</p>

## Ports

Ports **1** and **2**, one each side.

## The model

A waveplate of retardance $$\Gamma$$ with its fast axis at $$\theta$$ from s is

$$
\mathbf W(\theta, \Gamma) = \mathbf R(\theta)\begin{pmatrix} 1 & 0 \\ 0 & e^{i\Gamma} \end{pmatrix}\mathbf R(-\theta),
$$

with $$\mathbf R$$ the rotation matrix. The controller is three of them, the paddles' angles $$\theta_1, \theta_2, \theta_3$$:

$$
\mathbf M = \mathbf W\!\left(\theta_3, \tfrac{\pi}{2}\right)\mathbf W\!\left(\theta_2, \pi\right)\mathbf W\!\left(\theta_1, \tfrac{\pi}{2}\right),
\qquad \mathbf S_{12} = \mathbf M, \qquad \mathbf S_{21} = \mathbf M^{\mathsf T}.
$$

Light going back through it sees the transpose, as in a real fibre: fibre birefringence is reciprocal. So a controller followed by a plain mirror sends back light whose polarisation depends on the paddles; followed by a Faraday mirror, it does not.

With the paddles at 0° the controller does nothing to s or p. Setting them is the job of a person at a real bench: the tool does not search for the angles, but each can be swept.

## Settings

{% include jekray_params.html group="fibre" key="pc" %}

## Assumptions

<div class="dx-warn" markdown="1">
- Each paddle's retardance is exact and flat in wavelength; it adds no loss.
</div>

## Related

- [Faraday mirror](/jek/docs/jekray/fibre/faraday-mirror/).
- [In-line polariser](/jek/docs/jekray/fibre/polariser/) and [polarisation beam splitter](/jek/docs/jekray/fibre/pbs/).
- [Waveplate](/jek/docs/jekray/free-space/waveplate/), the free-space waveplate.
