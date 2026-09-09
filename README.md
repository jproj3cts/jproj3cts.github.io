# jeksys.net

One repo, two sites that share nothing.

| | | |
|---|---|---|
| **JEK Systems** | `/jek/` | Instrumentation, custom design work, optics calculators |
| **μRPG** | `/urpg/` | The tabletop game, its catalogue, and its tools |

They have separate stylesheets, separate assets, separate navigation and
separate audiences. Nothing in `jek/` links into `urpg/` or vice versa, and
neither reads the other's files. Keep it that way — if something needs to be
shared, copy it rather than reaching across.

Served by GitHub Pages at the domain root (`CNAME` → `jeksys.net`).

---

## Layout

```
/
├── index.html              hands off to /jek/  (see "The domain root" below)
├── 404.html                not-found page; also forwards pre-restructure URLs
├── CNAME                   jeksys.net
├── _config.yml             keeps worker/ and this file out of the build
│
├── jek/
│   ├── index.html                 home + site search
│   ├── products.html
│   ├── custom-solutions.html
│   ├── bio.html
│   ├── contact.html
│   ├── cart.html                  quote cart
│   ├── search-results.html
│   ├── coming-soon.html
│   ├── assets/
│   │   ├── css/jek.css            the whole JEK side's styling
│   │   ├── js/cart.js             quote cart logic
│   │   ├── img/                   logos, photos, favicon
│   │   └── docs/                  datasheets, manuals, certificates (empty)
│   ├── calculators/
│   │   ├── index.html             the index of all 26
│   │   ├── *.html                 one file per calculator
│   │   └── img/                   diagrams
│   └── products/
│       ├── photodetectors/index.html          template
│       ├── signal-processing/index.html       template
│       └── lab-accessories/
│           ├── index.html                     template
│           └── cf40-sample-transport-rack/
│               ├── index.html
│               ├── documents/     datasheet, vacuum statement, CoC
│               └── drawings/
│
├── urpg/
│   ├── index.html                 about + FAQ (the μRPG home)
│   ├── catalogue.html
│   ├── makers.html
│   ├── donate.html
│   ├── thanks.html                Stripe post-payment landing
│   ├── assets/
│   │   ├── css/urpg.css           the whole μRPG side's styling
│   │   ├── img/                   covers, logo, favicon
│   │   └── downloads/             the free PDFs and the tetromino zip
│   ├── products/
│   │   └── terror-of-outpost-32.html
│   └── character-builder/
│       ├── index.html
│       └── assets/{body,eyes,hair,top,pant,background}/
│
└── worker/                 Cloudflare fulfilment worker — NOT part of the site
```

`worker/` backs the μRPG store: it listens for Stripe webhooks and emails the
purchased PDF. It is excluded from the published site in `_config.yml`. See
`worker/SETUP.md`.

---

## Conventions

**Links are root-relative.** Every internal reference starts with `/jek/` or
`/urpg/` — never `../../`. The practical effect is that the nav bar and footer
are byte-identical on every page no matter how deep it sits, so you can copy
one from any page into a new one and it just works. It also means moving a page
between directories doesn't break anything inside it.

This works because the repo is a GitHub *user* site, so it is served from the
domain root both at `jeksys.net` and at `jproj3cts.github.io`. It does **not**
work from `file://` — to preview locally, run a server from the repo root:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
```

**Directories with an `index.html` are linked as directories.** Write
`/jek/calculators/`, not `/jek/calculators/index.html`.

**Filenames are lowercase and hyphenated.** `custom-solutions.html`, not
`CustomSolutions.html`. GitHub Pages is case-sensitive, and mixed conventions
were the main source of dead links before.

**Each side owns its own copy of everything**, including the favicon. Two 4 KB
copies of an icon is a cheaper price than a shared folder that quietly couples
the two sites together.

---

## Adding things

**A calculator.** Drop the page in `jek/calculators/`, add a line to the
relevant `.link-section` in `jek/calculators/index.html`. Diagrams go in
`jek/calculators/img/`.

**A JEK product.** Copy one of the three template pages in `jek/products/`
into its own directory as `index.html`, fill in the description, part number
and the `data-*` attributes on the quote buttons, then link it from the right
`.subcat-panel-inner` in `jek/products.html`. Real photographs replace
`product-placeholder.svg`; documents go in `jek/assets/docs/` and are published
by uncommenting the matching line in the Technical Information panels.

**A page that site search should find.** Add it to `searchablePages` in
`jek/index.html`. The search fetches each listed page and does a substring
match, so a page not on that list is invisible to it.

**A μRPG product.** Cover art in `urpg/assets/img/`, free PDFs in
`urpg/assets/downloads/`, then a `.image-item` block in
`urpg/catalogue.html`. Paid items get a page in `urpg/products/` and an entry
in `worker/src/catalogue.js` keyed by Stripe *price* ID.

---

## The domain root

`index.html` at the root is a redirect to `/jek/`, so `jeksys.net` still lands
on JEK Systems as it always has. Neither side can occupy the root directly
without dragging its assets up with it and re-mixing the two.

If you'd rather the root were a door page naming both sides, replace that file;
nothing else depends on it.

---

## Outstanding

- **Update the Stripe Payment Link redirect** to
  `https://jeksys.net/urpg/thanks.html`. The old address (`/uRPG/thanks.html`,
  capital RPG) no longer exists. `404.html` forwards it in the meantime, but
  that leaves customers bouncing off a 404 status after paying.
- The three product pages under `jek/products/` are still templates —
  placeholder copy, placeholder prices, placeholder part numbers, and a
  placeholder photograph. All four "View →" links in `jek/products.html` point
  at them.
- No documents in `jek/assets/docs/`. The Technical Information panels say so
  rather than linking to files that aren't there.
- `urpg/assets/img/` holds several images nothing currently references:
  `basic-rules-alt.png`, `bunker-low-res.png`, and the three
  `terror-of-echo-station-*` files. Same on the JEK side for
  `jek-logo-black-bg.png`, `multifit.png` and `lasc-sensor-watch.png`. Kept
  in case they're wanted; delete freely.
- Two `<!-- CHECK -->` comments in `urpg/index.html` flag numbers in the skill
  fusion example and the d100 explanation that want verifying against the
  actual rules.

---

## Where everything went

Calculator pages kept their filenames and moved wholesale from `calculators/`
to `jek/calculators/`. Character builder sprites kept their filenames and layout
and moved from `charBuilder/assets/` to `urpg/character-builder/assets/`.
Everything else:

| Was | Is |
|---|---|
| `assets/jek.css` | `jek/assets/css/jek.css` |
| `assets/jekicon.png` | `jek/assets/img/favicon.png` |
| `media/JEKBlkBg.png` | `jek/assets/img/jek-logo-black-bg.png` |
| `jek.png` | `jek/assets/img/jek-logo.png` |
| `LaSc.png` | `jek/assets/img/lasc-sensor-watch.png` |
| `media/multifit.png` | `jek/assets/img/multifit.png` |
| `media/opticsMount.jpg` | `jek/assets/img/optics-mount.jpg` |
| `media/Profile.jpeg` | `jek/assets/img/profile.jpeg` |
| `media/QPD.jpg` | `jek/assets/img/qpd.jpg` |
| `assets/cart.js` | `jek/assets/js/cart.js` |
| `Bio.html` | `jek/bio.html` |
| `calculators/lensMakersEq.svg` | `jek/calculators/img/lens-makers-equation.svg` |
| `calculators/thinLensMag.svg` | `jek/calculators/img/thin-lens-magnification.svg` |
| `calculators/thinLens.svg` | `jek/calculators/img/thin-lens.svg` |
| `calculators/calculators.html` | `jek/calculators/index.html` |
| `cart.html` | `jek/cart.html` |
| `comingSoon.html` | `jek/coming-soon.html` |
| `Contact.html` | `jek/contact.html` |
| `CustomSolutions.html` | `jek/custom-solutions.html` |
| `index.html` | `jek/index.html` |
| `Products.html` | `jek/products.html` |
| `products/track3/documents/Certificate_of_conformity_CF40-STR-H-16.pdf` | `jek/products/lab-accessories/cf40-sample-transport-rack/documents/Certificate_of_conformity_CF40-STR-H-16.pdf` |
| `products/track3/documents/Statement_of_vacuum_compatibility_CF40-STR-H-16.pdf` | `jek/products/lab-accessories/cf40-sample-transport-rack/documents/Statement_of_vacuum_compatibility_CF40-STR-H-16.pdf` |
| `products/track3/documents/datasheet_CF40-STR-H-16.pdf` | `jek/products/lab-accessories/cf40-sample-transport-rack/documents/datasheet_CF40-STR-H-16.pdf` |
| `products/track3/drawings/CF40-STR-H-16_drawing.pdf` | `jek/products/lab-accessories/cf40-sample-transport-rack/drawings/CF40-STR-H-16_drawing.pdf` |
| `products/track3/CF40HydrophobicPVDSampleTransportRack.html` | `jek/products/lab-accessories/cf40-sample-transport-rack/index.html` |
| `products/track3/track3.html` | `jek/products/lab-accessories/index.html` |
| `products/track1/track1.html` | `jek/products/photodetectors/index.html` |
| `products/track2/track2.html` | `jek/products/signal-processing/index.html` |
| `results.html` | `jek/search-results.html` |
| `assets/urpg.css` | `urpg/assets/css/urpg.css` |
| `uRPG/assets/AlpineCryptids.pdf` | `urpg/assets/downloads/alpine-cryptids.pdf` |
| `assets/BasicRules.pdf` | `urpg/assets/downloads/basic-rules.pdf` |
| `assets/charSheet.pdf` | `urpg/assets/downloads/character-sheet.pdf` |
| `assets/Leviathan.pdf` | `urpg/assets/downloads/leviathan.pdf` |
| `uRPG/assets/stampPack.pdf` | `urpg/assets/downloads/stamp-pack.pdf` |
| `uRPG/assets/forMakers/Tetrominoes.zip` | `urpg/assets/downloads/tetrominoes.zip` |
| `uRPG/assets/AlpineCryptids.png` | `urpg/assets/img/alpine-cryptids.png` |
| `media/BasicRules.png` | `urpg/assets/img/basic-rules-alt.png` |
| `uRPG/assets/BasicRulesFC.png` | `urpg/assets/img/basic-rules.png` |
| `media/bunkerLowRes.png` | `urpg/assets/img/bunker-low-res.png` |
| `media/charSheet.png` | `urpg/assets/img/character-sheet.png` |
| `uRPG/assets/customStamps.png` | `urpg/assets/img/custom-stamps.png` |
| `media/Leviathan.png` | `urpg/assets/img/leviathan.png` |
| `uRPG/assets/PerkPackZero.png` | `urpg/assets/img/perk-pack-zero.png` |
| `uRPG/assets/stamps.png` | `urpg/assets/img/stamps.png` |
| `uRPG/assets/TerrorofEchoStation.png` | `urpg/assets/img/terror-of-echo-station-1.png` |
| `uRPG/assets/TerrorofEchoStation_slide2_PLACEHOLDER.png` | `urpg/assets/img/terror-of-echo-station-2-placeholder.png` |
| `uRPG/assets/TerrorofEchoStation_slide3_PLACEHOLDER.png` | `urpg/assets/img/terror-of-echo-station-3-placeholder.png` |
| `uRPG/assets/TerrorofOutpost32.png` | `urpg/assets/img/terror-of-outpost-32-1.png` |
| `uRPG/assets/TerrorofOutpost322.png` | `urpg/assets/img/terror-of-outpost-32-2.png` |
| `uRPG/assets/TerrorofOutpost323.png` | `urpg/assets/img/terror-of-outpost-32-3.png` |
| `uRPG/assets/forMakers/tetrominoFiles.png` | `urpg/assets/img/tetromino-files.png` |
| `media/uTTRPGlogo.png` | `urpg/assets/img/urpg-logo.png` |
| `ucatalogue.html` | `urpg/catalogue.html` |
| `charBuilder/char.html` | `urpg/character-builder/index.html` |
| `uRPG/uDonate.html` | `urpg/donate.html` |
| `uttrpg.html` | `urpg/index.html` |
| `uRPG/uMakers.html` | `urpg/makers.html` |
| `uRPG/TerrorofOutpost32ProductPage.html` | `urpg/products/terror-of-outpost-32.html` |
| `uRPG/thanks.html` | `urpg/thanks.html` |

Dropped: eight empty `p.txt` / `1.txt` / `placeholder.txt` git-keep files whose
directories now hold real content.

Added: `404.html`, `jek/assets/img/product-placeholder.svg`,
`jek/calculators/img/photon-diagram.svg` (the calculator referenced a diagram
that was never committed), and this file.
