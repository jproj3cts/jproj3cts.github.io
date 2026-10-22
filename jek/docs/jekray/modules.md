---
layout: docs
title: Modules
permalink: /jek/docs/jekray/modules/
redirect_from: /jek/docs/jekray2d/modules/
description: Parts whose behaviour is code, written by anyone and run in a sandbox. New plates, polarisation plates, fibre components, electronics blocks and readouts. How modules are kept safe, how to install one, and how to write one.
---

<p class="dx-lead">A module is a part pack that carries code. Its code defines new parts: a plate with any amplitude and phase across its face, a polarisation plate, a fibre component, an electronics block, or a readout for screens and detectors. Anyone can write one and share it as a file or a link.</p>

Modules are an experimental feature: sign in to use it (a free account is enough). Switch them on under **Help › Experimental features…**.

## How modules are kept safe

A module's code never runs on the JEKray page. It runs in a Web Worker inside a hidden frame of its own:

- The frame has an opaque origin. The code cannot reach your account, your cookies or storage, your cloud benches, your files or the page.
- The frame's content security policy blocks every request: no fetches, no images, no scripts from elsewhere. The network functions are also removed from the worker before the module's code starts.
- The code is only asked for numbers: a plate's transmission, a component's matrix at a wavelength, a block's response, a readout's figures. Every answer is checked for its shape and size before it is used, and anything else it sends ends its worker.
- A call that runs for more than 20 seconds is stopped, and the part reads as not working, with the reason in its panel.

What a module is given is only the settings of its own parts and what it is asked to work out: for a readout, what the screen or detector reads.

## Installing a module

A module is a `.jekpack` file, installed as any [part pack](/jek/docs/jekray/part-packs/) is, from **File › Part packs and modules…**, a link, or by dropping it on the bench.

A module installs only when it is **signed and unchanged**: signed with its maker's JEKray account (shown as **✓ Signed by the JEKray account ‘*name*’**) or a verified organisation's (**✓ Verified: *organisation* (*domain*)**), unchanged since, and not revoked. A signature says which account made it, not who is behind that account: install a module only from a maker you trust. An unsigned module, or one changed after it was signed, is refused, from a file, a link or a bench, before any of its code runs. JEKray also checks that it has not been revoked, so a module installs only when you are online. A module installed before signing began keeps working, labelled **Unverified**; one that is revoked is turned off. See [Signed, Verified, Unverified and Revoked](/jek/docs/jekray/part-packs/#signed-verified-unverified-and-revoked).

Before it is installed, you see who made it, what it defines, its size and where it came from. To list what it defines, its code is run once in the sandbox. Its parts then appear under **+ Add part › Packs**, and its readouts as a **Modules** tab on screens and a section on detectors.

### Benches carry their modules

A bench with a module's parts saves the module's code with it, as its maker signed it, so a file, a share link or a QR code opens complete. Opening such a bench never installs or runs its modules: you are offered each one not installed here, with the same prompt and the same checks (a module the bench carries unsigned is refused). Until you install it, its parts stand in. A plate passes no light, and a component, block or readout gives nothing, and each panel says why.

## Writing a module

A module is a version 2 part pack with a `code` entry:

```json
{
  "format": "jekpack",
  "version": 2,
  "id": "acme.flat-optics",
  "name": "Acme flat optics",
  "author": "Acme Photonics",
  "packVersion": "1.0",
  "licence": "CC-BY-4.0",
  "description": "Metalenses and a ring resonator.",
  "code": "jek.element('lens', { ... });"
}
```

Then sign it: **File › Part packs and modules… › Sign a pack file…** (with a free account). Signing sets its `author` to your account's name, claims its `id` for you, and adds its `sig`. Sign it again after every change: an edited module will not install until it is.

The code is a script of at most 512 KB. It defines its parts by calling `jek.element`, `jek.plate`, `jek.component`, `jek.block` and `jek.readout`, each with a key (letters, digits, dashes and underscores) and a definition. Every definition can have:

| Key | What it is |
|---|---|
| `name`, `summary` | Shown in the parts picker, the install prompt and the part's panel. |
| `params` | Its settings: `[{ "key": "f", "label": "Focal length (mm)", "value": 100, "min": 1 }]`, or with `options: [["a", "A"], ["b", "B"]]` for a choice. They appear in the part's panel, can be swept, and are passed to its functions as `p`. |
| `colour` | One of `grey`, `blue`, `green`, `yellow`, `orange`, `red`, `purple`, `white`. |
| `tag` | Up to 8 characters shown on a component's or block's box. |

The pack's `parts` may place its definitions as parts, with an element naming one: `{ "mod": { "def": "lens", "p": { "f": 50 } }, "x": 0, "y": 0 }`. A definition no part uses gets one of its own.

Modules return numbers only. They cannot draw, and they cannot read anything but what they are given.

### A plate: `jek.element`

A thin plate with an amplitude and a delay across its face, at each wavelength. It works as a [mask](/jek/docs/jekray/free-space/mask/) does: rays take its amplitude and bend by its delay's slope, the beam takes the lens its curvature makes, and the diffracted field takes it sample by sample.

```js
jek.element('lens', {
  name: 'Flat lens', aperture: 20, samples: 256,
  params: [{ key: 'f', label: 'Focal length (mm)', value: 100 }],
  transmit(x, y, nm, p) {
    return [1, -(x * x + y * y) / (2 * p.f * nm * 1e-6)];   // [amplitude, delay in waves]
  },
});
```

`transmit(x, y, nm, p)` gives the amplitude and the delay $$d$$ in waves at a point of the face, in mm. `x` runs across the beam in the bench plane, and `y` runs up. The light is multiplied by $$A\,e^{-2\pi i d}$$, so a delay that falls away from the axis converges.

The plate is sampled on a `samples` × `samples` grid across its aperture (16 to 512, 256 by default), once for each wavelength the light has. Between the samples it is read by a cubic (Catmull-Rom), which is exact for a quadratic:

- **A delay given whole**, like a lens's (hundreds of waves at the edge), is read as it is.
- **A delay given wrapped into one wave**, like a metasurface's or a kinoform's, is read across its wraps. It must then change by less than half a wave between samples, as any sampled phase must.

`aperture` sets the plate's default size in mm.

### A polarisation plate: `jek.plate`

One Jones matrix across the face, at each wavelength:

```js
jek.plate('hwp', { name: 'Half-wave plate', jones(nm, p) { return [[1, 0], [0, -1]]; } });
```

`jones(nm, p)` returns `[[Jxx, Jxy], [Jyx, Jyy]]` in the beam's frame. x is across the beam in the bench plane (p), and y is up (s). Each entry is a number or a complex number `[re, im]`. Light going either way meets the matrix as written, as it meets a waveplate.

### A fibre component: `jek.component`

A component with ports, joined by fibres:

```js
jek.component('att', {
  name: 'Attenuator', ports: ['a', 'b'], params: [{ key: 'db', label: 'Loss (dB)', value: 3 }],
  S(nm, p) { const t = Math.pow(10, -p.db / 20); return [[0, 1, t], [1, 0, t]]; },
});
```

`ports` names its ports, 1 to 8 of them. The first half are on the left of its box and the rest on the right.

`S(nm, p)` returns the entries of its scattering matrix at a wavelength: `[from, to, value]`, where `from` and `to` are port numbers from 0. `value` is one of:
- a number;
- a complex number `[re, im]`, the same for both polarisations;
- a Jones matrix `[[ss, sp], [ps, pp]]` in the fibre's (s, p) basis.

Pairs it leaves out pass nothing.

### An electronics block: `jek.block`

A linear block on the Electronics tab:

```js
jek.block('lp', {
  name: 'Low-pass', ins: ['in'], outs: ['out'], fmin: 0.01, fmax: 1e9, perDecade: 40,
  params: [{ key: 'fc', label: 'Corner (Hz)', value: 1000 }],
  H(f, p) { const d = 1 + (f / p.fc) ** 2; return [1 / d, -(f / p.fc) / d]; },
  noise(f, p) { return 1e-9; },                    // optional: V/√Hz added at its output
});
```

`H(f, p)` is its response at frequency f in Hz, as a complex number. With more than one input or output (up to 4 of each), it is a matrix, `H[out][in]`. `noise(f, p)` is optional: the noise each output adds, in V/√Hz.

Each output is the sum of its inputs, each through its H, as tones and noise. The response is sampled at f = 0 and from `fmin` to `fmax` at `perDecade` points a decade (5 to 400), and read between them in log f. A resonance narrower than the grid needs a finer grid.

### A readout: `jek.readout`

Figures for screens, detectors, or both (`for: ['screen', 'detector']`), shown in a **Modules** tab on a screen and a section on a detector:

```js
jek.readout('peak', {
  name: 'Peak', for: ['screen'],
  compute(d, p) { return { rows: [['Peak', Math.max(...d.map.I)]] }; },
});
```

`compute(d, p)` is given what the part reads:
- **For a screen**, its diffracted intensity map: `d.map.I`, an n × n array (row by row), over `d.map.u0` to `u1` across and `v0` to `v1` up, in mm. Also its wavelength `d.nm`, power `d.power`, widths `d.wx` and `d.wy`, `d.fwhm`, `d.strehl`, and its Stokes parameters.
- **For a detector**, `d.mw`, `d.mA`, `d.V` and `d.noiseV` (the noise, volts rms; for a receiving horn's mixer `d.V` is the IF tone's peak).

It returns:
- `rows`, a list of `[label, value]`;
- `series`, up to 4 of `{ name, x, y, xLabel, yLabel, log }`, which the tool plots.

## An example

The [example module](/jek/tools/modules/example.jekpack) has one part of each kind: a metalens (a wrapped phase), a spiral phase plate, a quarter-wave plate, a ring resonator, a lead-lag network, and a D4σ beam-width readout. Open it in a text editor to read its code. The example **A module: vortex through a metalens** (under **Examples**, with modules on) uses it.

## Limits

<div class="dx-warn" markdown="1">
- A polarisation plate has one Jones matrix across its face. A plate that changes the polarisation from point to point (a q-plate) is not yet possible.
- New sources, and parts drawn in their own way, are not yet possible: a module's parts are drawn as plates and boxes.
- A module's answers are kept by its settings and the wavelength or frequency asked. Changing a setting asks again.
- A runaway loop is stopped after 20 seconds. Code that allocates a great deal of memory can still slow or stop the tab, as any page can.
</div>

## Related

- [Part packs](/jek/docs/jekray/part-packs/), the data-only packs modules build on.
- [Mask](/jek/docs/jekray/free-space/mask/), the formula-based plate a module's plate works like.
