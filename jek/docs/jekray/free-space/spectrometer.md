---
layout: docs
title: Spectrometer
permalink: /jek/docs/jekray/free-space/spectrometer/
description: "The JEKray free-space spectrometer: the light through its slit or fibre entrance as counts against wavelength, with its resolution, throughput, saturation and signal-to-noise."
element: { palette: Free space, type: spectrometer }
---

<p class="dx-lead">A free-space spectrometer, the kind with a slit or a fibre entrance and a detector array. It shows the light through its entrance as counts against wavelength, and reads out the peak, its width, the resolution, how much light gets in and the signal-to-noise. It absorbs what reaches its face.</p>

## Kinds

**Kind** picks a typical instrument and sets everything else; change any setting other than the integration time and it becomes **Custom**.

| Kind | Range | Array | Entrance | Sensor |
|---|---|---|---|---|
| Compact, UV to near-infrared | 200 to 1100 nm | 2048 pixels, 14 µm | 25 µm slit, NA 0.13 | Silicon CCD |
| High resolution, visible | 550 to 650 nm | 3648 pixels, 8 µm | 10 µm slit, NA 0.1 | Silicon CCD |
| Fibre-coupled, visible | 350 to 1000 nm | 2048 pixels, 14 µm | 50 µm fibre core, NA 0.22 | Silicon CCD |
| Near-infrared | 900 to 1700 nm | 512 pixels, 25 µm | 25 µm slit, NA 0.22 | InGaAs |
| Short-wave infrared, extended | 1000 to 2500 nm | 256 pixels, 50 µm | 50 µm slit, NA 0.22 | Extended InGaAs |

To build a spectrometer from its parts instead (a slit, mirrors, a grating and a screen), see the **Czerny–Turner spectrometer** example, which has both side by side.

## The model

### The light it takes in

The entrance is a slit, of a width across the bench and a height, or a fibre's core, a disc. It takes in the light falling on the entrance that arrives within its NA. Gaussian beams are rebuilt on its face as fields (as on a [photodetector](/jek/docs/jekray/free-space/detector/)) and their $$\lvert E\rvert^2$$ is taken over the entrance, so a focus wider than the slit loses light; ray fans count ray by ray. The panel says how much gets through and what share of the light reaching its face that is.

### Lines

The light through the entrance is a set of lines, one for each source and wavelength (a source's extra lines included), each as wide as the source's own line:

$$
w_L = \frac{\lambda_L^2}{L_c},
$$

with $$L_c$$ its coherence length (zero for a single-frequency laser), or, for a pulse, its bandwidth at the transform limit.

### Resolution

The array spans the range $$\lambda_\text{max} - \lambda_\text{min}$$ over $$N$$ pixels of pitch $$p$$, so the dispersion is

$$
D = \frac{\lambda_\text{max} - \lambda_\text{min}}{N p}
$$

in nm per µm of the array. The entrance is imaged onto the array at its own width $$a$$ (the slit's width or the core's diameter), and a line needs about two pixels to be seen, so the resolution (FWHM) is

$$
R = D \sqrt{a^2 + (2p)^2}.
$$

Each line lands as a Gaussian of width $$\sqrt{w_L^2 + R^2}$$ centred on its wavelength, and each pixel takes the part that falls on it. A narrower slit sharpens the lines and lets in less light.

### Counts and noise

A pixel's photoelectrons over the integration time $$t$$ are

$$
n_e = \eta(\lambda)\,\frac{P_\text{pixel}\, t}{hc/\lambda},
$$

with $$\eta$$ the quantum efficiency of a typical sensor of its kind at the pixel's wavelength. A pixel holds no more than its full well; past it the array is saturated, and the panel says so. The noise on a pixel is shot noise, dark current $$i_d$$ (electrons per second) and read noise $$\sigma_r$$:

$$
\sigma = \sqrt{n_e + i_d t + \sigma_r^2},
$$

and the signal-to-noise at the peak is $$n_e/\sigma$$, given only when the array is not saturated.

### The readouts

- **Peak**: the strongest line's wavelength, from a Gaussian through the brightest pixel and its two neighbours, so it is found to well under a pixel.
- **Width (FWHM)**: measured from the spectrum itself; when it is close to the resolution the panel says that it is set by the resolution rather than by the light.
- **Lines through the entrance**, when more than one gets in.

The Spectrum tab plots counts against wavelength, on a linear or log scale, and saves it as a picture (PNG) or as its numbers (CSV): wavelength, counts, noise and power on each pixel (with a free account, as every export).

## Settings

{% include jekray_params.html group="free" key="spectrometer" %}

## Assumptions

<div class="dx-warn" markdown="1">
- The instrument's optics are ideal: the entrance is imaged onto the array at its own width, with no aberrations, stray light or second-order overlap.
- The dispersion is even across the array.
- Quantum efficiencies are typical curves for each sensor, not a particular instrument's.
- Light reaching the body other than through its face is not stopped by it.
</div>

## Related

- [Grating](/jek/docs/jekray/free-space/grating/), to build a spectrometer from parts.
- [Screen](/jek/docs/jekray/free-space/screen/), for where each colour lands.
- [Optical spectrum analyser](/jek/docs/jekray/fibre/osa/), the fibre instrument, in dBm.
