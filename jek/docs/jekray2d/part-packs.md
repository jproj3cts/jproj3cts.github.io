---
layout: docs
title: Part packs
permalink: /jek/docs/jekray2d/part-packs/
description: Sets of parts and glasses made by others (a maker's catalogue, a course's kit), installed from a file or a link. How to install one, how to make one, and the file format.
---

<p class="dx-lead">A part pack is a set of ready-made parts and glasses in one file: a maker's catalogue of lenses, a course's kit of benches-in-a-box, a lab's own mounts and assemblies. Anyone can make one and share it as a file or a link. Packs hold parts and data only, never code.</p>

## Installing a pack

Choose **File › Part packs…**, then **Install from a file…** or **Install from a link…**, or drop a `.jekpack` file onto the bench. Before anything is installed, JEKray2D shows what is in the pack: its name, who made it, its version and licence, how many parts and glasses it has, and anything in it that could not be used (which is left out). Choose **Install** to keep it, or **Cancel**.

Once installed, a pack's parts are under **+ Add part › Packs**, grouped as the pack groups them, and they turn up in the search there too. Click one to add it in the middle of the view, or drag it onto the bench. A pack's glasses appear in every lens's **Material** menu, marked with the pack's name.

A link to JEKray2D with `?pack=` and the address of a pack, as

```
https://jeksys.net/jek/tools/jekray2d.html?pack=https://example.com/acme.jekpack
```

offers that pack when the page opens. It is never installed without you choosing **Install**. A pack read from a link must be served by a site that lets other pages read it (with an `Access-Control-Allow-Origin` header); most file hosts and code hosts do.

Installed packs are kept in this browser. **File › Part packs…** lists them, and **Remove** takes one away. Installing a pack with the same id again updates it.

### A part on the bench stands on its own

A part placed from a pack is copied onto the bench whole, with the data of its glasses written into it. A bench made with parts from packs opens, saves, shares and runs anywhere, including for someone who never installed the pack, and removing or updating a pack never changes a bench already made with it.

## Making a pack

The easiest way is from a bench:

1. Set up each part as it should be: a lens's radii, glass and diameter, a laser's wavelength and power. A part can be several elements: group them (select them, then **Group**) and the group becomes one part of the pack, its fibres included.
2. Select everything to go in the pack.
3. Choose **File › Part packs… › Make a pack from the selection…**, and give it a name and its maker.

JEKray2D saves it as a `.jekpack` file (JSON text, like a `.jekray` bench), with each part centred, a small picture of it, and any measured glasses it uses written once at the top. Open the file in any text editor to add a description, a licence, a home page, part names and summaries, and groups. Then share the file, or put it online and share its link.

## The format

A pack is a `.jekpack` file, which is JSON text:

```json
{
  "format": "jekpack",
  "version": 1,
  "id": "acme.optics",
  "name": "Acme optics catalogue",
  "author": "Acme Optics Ltd",
  "packVersion": "1.2",
  "description": "Singlets in Acme glasses and a fibre test kit.",
  "licence": "CC-BY-4.0",
  "homepage": "https://example.com/acme",
  "glasses": [
    { "glass": "ACME-HI", "table": { "wl": [0.4, 0.6, 0.8, 1.0], "n": [1.835, 1.805, 1.795, 1.79] } },
    { "glass": "ACME-LO", "nd": 1.487, "vd": 70.4 }
  ],
  "parts": [
    {
      "name": "AC-25-50",
      "summary": "f = 50 mm, ACME-HI",
      "group": "Lenses",
      "elements": [
        { "type": "lens", "id": "a", "name": "AC50", "x": 0, "y": 0, "angle": 0, "diameter": 25.4,
          "surfaces": [{ "R": 41 }, { "R": -41 }], "gaps": [4], "materials": [{ "glass": "ACME-HI" }] }
      ]
    },
    {
      "name": "Fibre test kit",
      "group": "Fibre",
      "elements": [
        { "type": "fcomp", "kind": "laser", "id": "FL", "name": "FL", "x": -20, "y": 0, "wavelength": 1550 },
        { "type": "fcomp", "kind": "pd", "id": "PD", "name": "PD", "x": 20, "y": 0 }
      ],
      "fibres": [{ "a": ["FL", 0], "b": ["PD", 0] }]
    }
  ]
}
```

| Key | What it is |
|---|---|
| `format` | Always `"jekpack"`. |
| `version` | The version of this format: `1`. |
| `id` | The pack's own name, 2 to 64 lower-case letters, digits, dots, dashes or underscores. By custom, the maker then the pack: `acme.optics`. A pack installed with the same id replaces it. |
| `name`, `author`, `description` | Shown when it is installed and in the Packs tab. |
| `packVersion` | Your own version of the pack, any text: `"1.2"`. |
| `licence`, `homepage` | Optional. The home page must start `https://`. |
| `glasses` | Optional. Each has a `glass` name and either a `table` of the refractive index `n` (and, optionally, the extinction `k`) at wavelengths `wl` in µm, or `nd` and `vd`, its index at 587.6 nm and its Abbe number. |
| `parts` | Each has a `name`, an optional `summary` (shown under its name) and `group` (a heading in the Packs tab), an optional `icon` (a PNG as a `data:` address, at most 32 KB; without one its picture is drawn), its `elements`, and optionally the `fibres` joining them. |

**Elements** are written as in a saved bench (a `.jekray` file): the simplest way to get one right is to set it up on a bench, save the bench, and copy it from the file, or to make the pack from the selection as above. Their positions are relative: the part is placed with the middle of its elements where it is dropped. A material naming one of the pack's glasses (`{ "glass": "ACME-HI" }`) has that glass's data written into it as the pack is read.

Everything in a pack goes through the same checks as a bench opened from a file. An element of a type JEKray2D does not have, a glass with no data, or a fibre joining parts that are not in the same part is left out, and listed when the pack is installed. A pack can be at most 8 MB, with at most 500 parts and 200 glasses.

### Packs and code

A version 1 pack is data. Nothing in it runs, and JEKray2D refuses one with a `code` or `scripts` entry. A pack that brings new kinds of part with code of their own is a version 2 pack, a [mod](/jek/docs/jekray2d/mods/), whose code runs in a sandbox apart from the page.
