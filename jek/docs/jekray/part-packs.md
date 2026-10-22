---
layout: docs
title: Part packs
permalink: /jek/docs/jekray/part-packs/
redirect_from: /jek/docs/jekray2d/part-packs/
description: Sets of parts and glasses made by others (a maker's catalogue, a course's kit), installed from a file or a link. How to install one, how to make and sign one, what Verified means, and the file format.
---

<p class="dx-lead">A part pack is a set of ready-made parts and glasses in one file: a maker's catalogue of lenses, a course's kit of benches-in-a-box, a lab's own mounts and assemblies. Anyone with a free account can make one and share it as a file or a link. A pack made in JEKray is signed with its maker's account, so whoever installs it can see who made it. Packs hold parts and data only, never code.</p>

## Installing a pack

Choose **File › Part packs and modules…**, then **Install a pack/module from a file…** or **Install a pack/module from a link…**, or drop a `.jekpack` file onto the bench. Before anything is installed, JEKray shows what is in the pack: its name, who made it, its version and licence, how many parts and glasses it has, and anything in it that could not be used (which is left out). Choose **Install** to keep it, or **Cancel**.

Once installed, a pack's parts are under **+ Add part › Packs**, grouped as the pack groups them, and they turn up in the search there too. Click one to add it in the middle of the view, or drag it onto the bench. A pack's glasses appear in every lens's **Material** menu, marked with the pack's name.

A link to JEKray with `?pack=` and the address of a pack, as

```
https://jeksys.net/jek/tools/jekray.html?pack=https://example.com/acme.jekpack
```

offers that pack when the page opens. It is never installed without you choosing **Install**. A pack read from a link must be served by a site that lets other pages read it (with an `Access-Control-Allow-Origin` header); most file hosts and code hosts do.

Installed packs are kept in this browser. **File › Part packs and modules…** lists them, each with its standing (below), and **Remove** takes one away. Installing a newer version of a pack, with the same id, from the same maker updates it.

## Verified, Unverified and Revoked

When a pack is installed, and once a day after, JEKray says where it stands:

| Label | What it means |
|---|---|
| **✓ Verified: made by *name*** | Signed with the JEKray account of the person named, and not changed since. The name is the one that account gives itself. |
| **✓ Verified: *organisation* (*domain*)** | Signed by an organisation's team, whose web domain JEK Systems has checked belongs to it. |
| **Unverified** | Not signed (made by hand, or before signing began). Its own `author` is shown as "By *name* (unverified)": anyone can write any name there. |
| **Unverified: changed after it was signed** | It was signed, then edited. It may be the maker's own change; it may not. |
| **Unverified: its signature does not check out** | Its signature is not one of ours, or not this pack's. |
| **Revoked: *reason*** | JEK Systems has taken it down (below). |

A parts pack installs whether it is verified or not; an unverified one says so before you choose **Install**. A [module](/jek/docs/jekray/modules/), which runs code, installs only when it is verified.

### A pack's id is its maker's

A pack's `id` belongs to whoever first signs a pack with it. After that, only they (the same account, or the same organisation) can sign a pack with that id. So with a pack installed, a pack with the same id is offered as an **Update** only when it is signed by the same maker (or, when the installed one is unsigned, by the id's owner). Anything else is refused, saying a different maker's pack uses that id: remove the installed one first if you want the other instead.

Ids starting `jek.` are JEKray's own: only JEK Systems can sign them.

### Taken down, and reporting a pack

JEK Systems can revoke a pack's signature: one version of it, every pack with its id, or every pack an account has signed, with a reason. A revoked pack cannot be installed, and one already installed is labelled **Revoked** when it is next checked (once a day, when you are online): a revoked module is turned off. Parts already placed on your benches are never changed.

JEKray asks whether a pack has been revoked as it is installed. If it cannot ask (you are offline, or the service is down), a parts pack still installs, with a note that it could not be checked; a module waits until it can.

To report a pack (one that is harmful, misleading, or not its maker's to share), use **Report this pack** in the install prompt or the list of packs, or email [support@jeksys.net](mailto:support@jeksys.net) with its id and where you found it.

### A part on the bench stands on its own

A part placed from a pack is copied onto the bench whole, with the data of its glasses written into it. A bench made with parts from packs opens, saves, shares and runs anywhere, including for someone who never installed the pack, and removing or updating a pack never changes a bench already made with it.

## Making a pack

The easiest way is from a bench:

1. Set up each part as it should be: a lens's radii, glass and diameter, a laser's wavelength and power. A part can be several elements: group them (select them, then **Group**) and the group becomes one part of the pack, its fibres included.
2. Select everything to go in the pack.
3. Choose **File › Part packs and modules… › Make a pack from the selection…**. Give it a name, an id and a version, then **Make and sign**. Making a pack needs a free account (sign in, top right); installing one needs none.

The pack is signed with your account: its maker is your account's name, and its id is yours from then on. JEKray saves it as a `.jekpack` file (JSON text, like a `.jekray` bench), with each part centred, a small picture of it, and any measured glasses it uses written once at the top. Share the file, or put it online and share its link.

To add a description, a licence, a home page, part names and summaries, and groups, open the file in any text editor. Any edit leaves it **Unverified: changed after it was signed**, so sign it again afterwards: **File › Part packs and modules… › Sign a pack file…**. A new version is made the same way, with the same id and a new version.

If JEKray cannot reach its service to sign the pack, it offers to save it unsigned: it then installs labelled Unverified.

### Signing as an organisation

A team on JEKrayPro can sign packs as the organisation, shown as **✓ Verified: *team name* (*domain*)**, once JEK Systems has checked that the team's web domain is theirs: email [support@jeksys.net](mailto:support@jeksys.net) from an address at that domain (normally the team owner's). The team's owner and admins then choose it under **Signed as** when they make or sign a pack. Ids the team signs are the team's, not any one member's.

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
| `id` | The pack's own name, 2 to 64 lower-case letters, digits, dots, dashes or underscores. By custom, the maker then the pack: `acme.optics`. It belongs to whoever first signs it; a pack installed with the same id from the same maker updates it. |
| `name`, `description` | Shown when it is installed and in the Packs tab. |
| `author` | Who made it, as it says itself: shown as "By *name* (unverified)" when it is not signed. A signed pack's maker is its signer. |
| `sig` | Its signature, written by JEKray when it is signed; leave it alone. It covers everything else in the file. |
| `packVersion` | Your own version of the pack, any text: `"1.2"`. |
| `licence`, `homepage` | Optional. The home page must start `https://`. |
| `glasses` | Optional. Each has a `glass` name and either a `table` of the refractive index `n` (and, optionally, the extinction `k`) at wavelengths `wl` in µm, or `nd` and `vd`, its index at 587.6 nm and its Abbe number. |
| `parts` | Each has a `name`, an optional `summary` (shown under its name) and `group` (a heading in the Packs tab), an optional `icon` (a PNG as a `data:` address, at most 32 KB; without one its picture is drawn), its `elements`, and optionally the `fibres` joining them. |

**Elements** are written as in a saved bench (a `.jekray` file): the simplest way to get one right is to set it up on a bench, save the bench, and copy it from the file, or to make the pack from the selection as above. Their positions are relative: the part is placed with the middle of its elements where it is dropped. A material naming one of the pack's glasses (`{ "glass": "ACME-HI" }`) has that glass's data written into it as the pack is read.

Everything in a pack goes through the same checks as a bench opened from a file. An element of a type JEKray does not have, a glass with no data, or a fibre joining parts that are not in the same part is left out, and listed when the pack is installed. A pack can be at most 8 MB, with at most 500 parts and 200 glasses.

### Packs and code

A version 1 pack is data. Nothing in it runs, and JEKray refuses one with a `code` or `scripts` entry. A pack that brings new kinds of part with code of their own is a version 2 pack, a [module](/jek/docs/jekray/modules/), whose code runs in a sandbox apart from the page.
