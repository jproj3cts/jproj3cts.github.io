---
layout: docs
title: Fibre amplifier
permalink: /jek/docs/jekray/fibre/amplifier/
redirect_from: /jek/docs/jekray2d/fibre/amplifier/
description: "The JEKray fibre amplifier (EDFA) and semiconductor optical amplifier: gain across a band, saturation, and amplified spontaneous emission."
element: { palette: Fibre, type: fcomp, kind: amp }
---

<p class="dx-lead">A fibre amplifier, an erbium-doped one (EDFA) to begin with: gain across its band, saturating on the light it amplifies, and amplified spontaneous emission out of both ends. The same part, as a semiconductor optical amplifier (SOA), gains both ways and less for one polarisation.</p>

## Ports

Ports **in** and **out**.

## The model

### Gain

The small-signal gain $$g_0$$ (dB) is flat-topped across a band of width $$\Delta\lambda$$ about the centre $$\lambda_c$$:

$$
G_0(\lambda) = 10^{\,g_0/\left(10\,(1 + u^6)\right)}, \qquad u = \frac{\lambda - \lambda_c}{\Delta\lambda/2}.
$$

### Saturation

It saturates as a homogeneous amplifier does, on the total power $$P_\text{in}$$ reaching its input. At the band centre,

$$
G = G_0 \exp\!\left(-\frac{(G - 1)\,P_\text{in}}{P_s}\right), \qquad P_s = \frac{P_\text{sat}}{\ln G_0},
$$

solved for $$G$$ by Newton's method, with $$P_\text{sat}$$ its saturated output power. The power it adds, $$(G - 1)P_\text{in} = P_s \ln(G_0/G)$$, never exceeds $$P_\text{sat}$$, however hard it is driven. The ratio $$\ln G/\ln G_0$$ then scales the gain, in the log, across the whole band. The network is solved, each amplifier's gain set from what reached it, and solved again, until the gains settle (see [Fibre optics: amplifiers](/jek/docs/jekray/fibre/#amplifiers)).

### Spontaneous emission

The amplifier sends out amplified spontaneous emission (ASE) from both ends, in each polarisation:

$$
P_\text{ASE} = n_\text{sp}\,h\nu\,(G - 1)\,B, \qquad n_\text{sp} = \max\!\left(1, \tfrac{\mathrm{NF}}{2}\right),
$$

with NF the noise figure as a ratio. It is followed in 25 slices across 1.6 times the band, each its own broadband light, so a filter after it takes its share. It reaches photodiodes as broadband light and adds its beat noise to theirs (see [Fibre photodetector: noise](/jek/docs/jekray/fibre/photodetector/#noise)).

### Forward and back

An EDFA has an isolator inside: light going back from *out* to *in* is cut by its isolation, $$10^{-X/20}$$ in amplitude, and not amplified.

An **SOA** has no isolator. It gains both ways, and gains less for p than for s by its polarisation-dependent gain (PDG, dB):

$$
\mathbf S_\text{in, out} = \mathbf S_\text{out, in} = \sqrt{G}\begin{pmatrix} 1 & 0 \\ 0 & 10^{-\mathrm{PDG}/20} \end{pmatrix}.
$$

An SOA starts with 25 dB of gain, a 10 dBm saturated output, an 8 dB noise figure and a 60 nm band.

## Settings

{% include jekray_params.html group="fibre" key="amp" %}

Also *soa*: true for a semiconductor amplifier, with *pdg* (dB, 0.5 to begin with) in place of the isolation.

## Assumptions

<div class="dx-warn" markdown="1">
- The gain is flat-topped and set, not worked out from the pump and the dopant's cross-sections; the gain's shape does not change as it saturates.
- Saturation is on the average power, with no gain dynamics: no transients, and no pattern effects in an SOA.
- An SOA's gain adds no phase: no chirp or linewidth enhancement, and no four-wave mixing.
</div>

## Related

- [Fibre photodetector](/jek/docs/jekray/fibre/photodetector/), for the noise ASE brings.
- [Tunable filter](/jek/docs/jekray/fibre/tunable-filter/), to cut the ASE outside the signal's band.
- [Gain medium](/jek/docs/jekray/free-space/gain/), gain in free space.
