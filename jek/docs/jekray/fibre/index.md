---
layout: docs
title: Fibre optics
permalink: /jek/docs/jekray/fibre/
redirect_from: /jek/docs/jekray2d/fibre/
description: "How JEKray solves single-mode fibre networks path by path, with phase, delay, polarisation, coherence, amplifiers and the coupling between fibre and free space."
---

<p class="dx-lead">Fibre components sit on the bench as boxes with ports, and fibres join port to port. The network is solved by following the light along every path, keeping each wave's phase, polarisation and delay, so interference, rings, reflections and a laser's coherence come out exactly.</p>

## What travels in a fibre

A single-mode fibre carries one spatial mode, so the light in it is two complex amplitudes, s and p: a Jones vector $$\mathbf{E} = (E_s, E_p)$$. Where a fibre tip meets free space, s is out of the bench plane. Amplitudes are in units of the laser's own amplitude, so $$\vert \mathbf E\vert ^2$$ is a share of that laser's power.

Fibres drawn on the bench are splines for clarity. Their lengths are settings, not what the drawing shows.

## Along a fibre

A fibre of length $$L$$ and loss $$\alpha$$ (dB/km) takes a wave from one end to the other as

$$
\mathbf{E}_\text{out} = 10^{-\alpha L/20}\; e^{-i k_0 n L}\; \mathbf{J}_\text{fibre}\, \mathbf{E}_\text{in},
\qquad \tau = \frac{n_g L}{c},
$$

with phase index $$n = 1.468$$, group index $$n_g = 1.468$$, and $$\tau$$ the wave's group delay. $$\mathbf J_\text{fibre}$$ is what the fibre does to polarisation. It is reciprocal: the matrix back is the transpose of the matrix forward.

- **Standard (polarisation-keeping):** the identity, as polarisation-maintaining fibre, or standard fibre held still, behaves.
- **As laid:** two waveplates at angles and retardances drawn from the fibre's seed. The retardance scales with length and wavelength (a beat length of 10 m), so the state that comes out drifts as the laser tunes.
- **PM:** the slow axis at the key angle from s, the two axes a retardance $$L/L_b$$ apart at 1550 nm (scaled for the wavelength), and a coupling between them of amplitude $$10^{-\mathrm{PER}/20}$$.
- **Multimode:** as laid, far stronger.

Each end of a fibre can be a splice (no reflection), a PC or APC connector (45 or 65 dB return loss), or a flat cleave (4 %).

### Dispersion and self-phase modulation

A pulse in fibre sees the fibre's dispersion $$D$$ (ps/(nm km)), which sets $$\beta_2 = -\lambda^2 D / 2\pi c$$. A pulse strong enough for a nonlinear phase is propagated by the nonlinear Schrödinger equation, split-step Fourier and symmetric:

$$
\frac{\partial A}{\partial z} = -\frac{\alpha}{2}A + i\left(\frac{\beta_2}{2}\omega^2 + \frac{\beta_3}{6}\omega^3\right)A + i\gamma \vert A\vert ^2 A,
$$

with the dispersion applied in frequency and the Kerr term in time. Below about 0.01 rad of nonlinear phase the linear model is used.

## Components

Each component scatters the waves arriving at its ports out of its ports. For each pair of ports it has a 2 × 2 Jones matrix, and the set of them is its scattering matrix. A 2 × 2 coupler with a share $$\kappa$$ of the power crossing over, and excess loss $$a$$ in amplitude, is

$$
\mathbf{S}_{13} = \mathbf{S}_{24} = a\sqrt{1-\kappa}\;\mathbf{I}, \qquad \mathbf{S}_{14} = \mathbf{S}_{23} = i\,a\sqrt{\kappa}\;\mathbf{I},
$$

symmetric in both directions. The quarter-wave on the light crossing over is what lets two equal arms recombine wholly into one port, as in a real coupler. Each component's page gives its matrices.

## Solving the network

The network is solved by following the light. Every wave leaving a port goes down its fibre (loss, phase, polarisation, delay) to the next component, which scatters it out of its ports. Waves meeting at one port with one delay add as fields. Loops (rings, reflections, circulators) are followed round until what is left is negligible.

Keeping each wave's delay makes coherence exact. What reaches a photodiode is a set of waves $$\mathbf E_j$$ with delays $$\tau_j$$. Its power adds them pairwise, each pair weighted by the laser's coherence at the difference in their delays:

$$
P = \sum_j \sum_k \operatorname{Re}\!\left(\mathbf E_j \cdot \mathbf E_k^*\right)\, \gamma\!\left(c\,(\tau_j - \tau_k)\right).
$$

Two arms of an interferometer within the laser's coherence length interfere fully; arms much further apart add as powers.

### Broadband light

A broadband source (an LED, a superluminescent diode, an amplifier's spontaneous emission) is followed in spectral slices: 21 or more across $$\pm 3\sigma$$ of its Gaussian spectrum. There are enough that the narrowest filter in the network (a tunable filter, Bragg grating or WDM band) spans twelve, up to 801 slices. Each slice is itself a Gaussian line 1.5 slices wide, so a comb of them shows no false coherence revivals. Together they rebuild the source's spectrum, so filters and gratings shape it as they should, and an optical spectrum analyser shows the result.

## Amplifiers

A fibre amplifier has a small-signal gain $$G_0$$ (dB) across a flat-topped band:

$$
G_0(\lambda) = 10^{\,g_0 / \left(10\,(1 + u^6)\right)}, \qquad u = \frac{\lambda - \lambda_c}{\Delta\lambda/2}.
$$

It saturates on the total power reaching it. At the band centre,

$$
G = \frac{G_0}{1 + G\,P_\text{in}/P_\text{sat}},
$$

solved for $$G$$, with $$P_\text{sat}$$ its saturated output power. The ratio $$\ln G / \ln G_0$$ then scales the gain across the whole band. The network is solved, each amplifier's gain set from what reached it, and solved again, until the gains settle. The amplifier adds spontaneous emission in each polarisation, each way:

$$
P_\text{ASE} = n_\text{sp}\, h\nu\, (G - 1)\, B, \qquad n_\text{sp} = \mathrm{NF}/2,
$$

in slices across its band, so a filter after it takes its share. Photodiodes after an amplifier see signal–ASE and ASE–ASE beat noise as well as shot noise.

## Between fibre and free space

### Into a fibre

Light arriving at a fibre tip from free space is taken in by its overlap with the tip's own mode, for each polarisation:

$$
\eta = \frac{\left\lvert \int E\, M^*\, \mathrm dA\right\rvert ^2}{\int \vert E\vert ^2\, \mathrm dA\, \int \vert M\vert ^2\, \mathrm dA}.
$$

The arriving field $$E$$ is rebuilt on the face from the Gaussian beams that reach it. Each beam's $$q$$, in the plane and out of it, is where it lands, with its tilt and optical path. Beams of one launch are added as fields first. The mode $$M$$ is the step-index fundamental mode by Marcuse's fit, with its $$1/e^2$$ radius

$$
w = a\left(0.65 + \frac{1.619}{V^{3/2}} + \frac{2.879}{V^6}\right), \qquad V = \frac{2\pi a\,\mathrm{NA}}{\lambda},
$$

so offset, tilt, a mismatched waist and a wrong focus all cost what they should. A multimode fibre takes in the share of each beam on its core inside its acceptance cone, $$\pm\mathrm{NA}$$.

### Out of a fibre

Light the network sends to a tip leaves it into free space as a source *split from* the same laser, so it interferes with the rest of that laser's light. It is not taken back into the fibres a second time: a loop that runs fibre, free space, fibre is followed one way round.

## Limits

<div class="dx-warn" markdown="1">
- Fibres are single-mode, except where a fibre is marked multimode. Modes of a few-mode fibre are not followed one by one.
- Nonlinearity is self-phase modulation of pulses only. Four-wave mixing between channels, Brillouin and Raman scattering are not modelled.
- Loops are followed until what is left is negligible, so a ring of extremely high finesse takes many passes. Photonic chips are solved directly instead (see [Photonic chips](/jek/docs/jekray/chips/)).
</div>

## Elements

### Sources

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/laser/"><b>Fibre laser</b><small>A laser into fibre: polarisation, linewidth or band, pulses, modulation inputs; and the fibre-coupled LED.</small></a></li>
</ul>

### Splitting and routing

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/coupler/"><b>2×2 coupler</b><small>A fused coupler: any split ratio, with the quarter-wave on the light crossing over.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/splitter/"><b>Splitter and combiner</b><small>1 × N or N × 1, each branch 1/N, in phase.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/star/"><b>Star coupler</b><small>M × N, a corner of a discrete Fourier transform.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/switch/"><b>Optical switch</b><small>Bar or cross, with crosstalk.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/circulator/"><b>Circulator</b><small>1 to 2, 2 to 3, and isolation backwards.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/isolator/"><b>Isolator</b><small>One way only.</small></a></li>
</ul>

### Polarisation

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/polarisation-controller/"><b>Polarisation controller</b><small>Three paddles: any state in to any state out.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/polariser/"><b>In-line polariser</b><small>Along its axis through, the crossed one to its extinction.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/pbs/"><b>Polarisation beam splitter</b><small>Along and across to two ports; backwards a combiner.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/depolariser/"><b>Depolariser</b><small>A Lyot depolariser for broadband light.</small></a></li>
</ul>

### Filters and spectra

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/wdm/"><b>WDM</b><small>A flat-topped band to one port, the rest to the other.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/bragg-grating/"><b>Fibre Bragg grating</b><small>A narrow band reflected, the rest passed.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/tunable-filter/"><b>Tunable filter</b><small>A Gaussian pass band.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/attenuator/"><b>Attenuator</b><small>A set loss, both ways.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/delay/"><b>Variable delay line</b><small>A delay, its path and its phase.</small></a></li>
</ul>

### Amplifiers and modulators

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/amplifier/"><b>Fibre amplifier</b><small>EDFA or SOA: gain, saturation and ASE.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/aom/"><b>Fibre AOM</b><small>A frequency shift by the drive, set by an RF level.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/eom/"><b>Fibre EOM</b><small>Phase sidebands or Mach–Zehnder amplitude modulation.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/stretcher/"><b>Fibre stretcher</b><small>A piezo phase, driven by a voltage.</small></a></li>
</ul>

### Detection

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/fibre/photodetector/"><b>Fibre photodetector</b><small>Single, balanced or a bare diode: beat notes, noise with ASE, demodulation.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/osa/"><b>Optical spectrum analyser</b><small>The spectrum through a resolution bandwidth.</small></a></li>
</ul>

### Ends and links

<ul class="dx-cards">
  <li><a class="fibre" href="/jek/docs/jekray/free-space/fibre-tip/#collimator"><b>Collimator</b><small>Out of the fibre as a collimated beam, and back in.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/mirror/"><b>Fibre mirror</b><small>A partly reflecting mirror in the fibre.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/faraday-mirror/"><b>Faraday mirror</b><small>Back orthogonal, whatever the fibre did.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/terminator/"><b>Terminator</b><small>Absorbs, sending back its return loss.</small></a></li>
  <li><a class="fibre" href="/jek/docs/jekray/fibre/feedthrough/"><b>Feedthrough</b><small>A fibre from one tab to another.</small></a></li>
</ul>
