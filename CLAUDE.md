# jeksys.net — working notes

The repo is the jeksys.net site (GitHub Pages) plus JEKray, a browser optics/photonics/RF simulator, JEKion, a
charged-particle optics simulator built the same way beside it, JEKfilm, a thin-film coating designer, JEKcad, a parametric CAD Part Studio, and their API. The root README has the site
conventions; `jek/tools/jekray/README.md` has the tool's module rules, `jek/tools/jekion/README.md` JEKion's.

## Working rules
Several people work on this repository, each with their own Claude sessions. The owner is jproj3cts.
- **Work on a branch and open a pull request into `main`.** `main` is protected: a pull request, an approving review
  and green CI are needed to merge, and every pull request needs the owner's review (`.github/CODEOWNERS`). Never try
  to push to `main` directly or to get round the protection. The owner may push to `main`, and in the owner's own
  sessions asks first every time (an earlier "yes" does not carry over).
- Before a pull request is merged, merge `origin/main` into the branch (never rebase or force-push a shared branch),
  rebuild, re-run the full suite, and report the counts in the pull request.
- CI (`.github/workflows/tests.yml`) runs the build/docs checks, the Node and browser suites and the API tests on pushes to
  `main` and `claude/**` and on every pull request (~7 min). Still run the suites locally before pushing.
- **Commit as the person whose session it is.** Before the first commit of a session, set `git config user.name` and
  `git config user.email` to that person's own GitHub name and noreply address (the owner's: `jproj3cts`,
  `114860885+jproj3cts@users.noreply.github.com`). Never commit under someone else's name. Commit messages carry no
  `Co-Authored-By`, `Claude-Session` or other assistant lines, session links or model names.
  (main's history was rewritten once, on 5 Nov 2026; it is never force-pushed again.)
- **Nothing secret goes in the repository**: API keys, Stripe and Cloudflare tokens, signing keys and the ops token
  live in Cloudflare and Stripe, and only the owner has them. The API (`jek-api/`) and the shop worker (`worker/`) are
  deployed by hand, by the owner only; a change there says in its pull request what the deploy needs (a migration, a
  secret). Do not change CI to use secrets or `pull_request_target`.

## Site writing (the JEK pages, not the tool's own copy)
The site should read as written by the people who build the things on it. Before changing a page's words:
- **Evidence over description.** A number, a photo, a part, a paper or a result says more than an adjective. Cut
  "precision", "cutting-edge", "solutions", "robust", "seamless", "hands-on expertise", "track record".
- **Only what is true and checked.** No placeholder text, prices or part numbers on a published page; a product not on
  sale says "in development". Specs come from the datasheet; when the datasheet and the page disagree, ask.
- **Plain sentences.** One claim each; "we", not "JEK Systems takes on…"; British spelling (fibre, colour).
- **None of these shapes:** "Not X, but Y" / "X, not just Y"; three-part lists and "from A to B to C"; opening with a
  general truth ("Not every measurement…"); a colon before a reveal; a triple of negatives ("no seats, no software,
  nothing to run"); taglines in pairs ("Designed together, built in-house").
- **Headings name the page** ("Contact", "The team"), sentence case. One heading and one short line under it, not a
  heading, tagline and lede stack. No small uppercase eyebrow above a heading unless it carries information (a
  breadcrumb such as "Products · Photonics", a plan's name).
- **Buttons say what happens** ("Email us about a project", not "Start a conversation").
- Keep the sand, orange and five-colour stripe: they are the JEK identity. Vary layouts by content (tables for specs and
  prices, a photo beside text for projects) rather than a grid of identical cards everywhere.
- Each page has a `<title>` "Page | JEK Systems", a `<meta name="description">` and Open Graph tags (`og:title`,
  `og:description`, `og:url`, `og:image`; `jek/assets/img/share-card.png` by default).

## Where things are
| Area | Path |
|---|---|
| The tool (source) | `jek/tools/jekray/src/` — built into `jek/tools/jekray.html` (committed) |
| Browser test suite | `jek/tools/jekray-tests.html` (`?dev=1` runs it on the unbuilt modules via `jekray-dev.html`) |
| Example benches | `jek/tools/demos/*.jekray` (+ `thumbs/`) |
| Physics validation against external references | `jek/tools/validation/` |
| Docs (Jekyll, `layout: docs`) | `jek/docs/jekray/**.md`; sidebar/prev-next from `_data/jekray_docs.yml` |
| Docs parameter tables / AI guide (generated) | `_data/jekray_params.json`, `jek/tools/jekray-ai-guide.md` |
| JEKion (source) | `jek/tools/jekion/src/` — built into `jek/tools/jekion.html` (committed); shares JEKray's modules by path in its `order.json`; tests `jek/tools/jekion/test/` + `jek/tools/jekion-tests.html`; demos `jek/tools/demos/*.jekion`; docs `jek/docs/jekion/` (`_data/jekion_docs.yml`, `docs: jekion` in front matter) |
| Site pages (HTML built by Jekyll; nav from `_includes/site-nav.html`) | `jek/*.html`, `jek/products/`, `jek/calculators/`, `index.html`, `404.html` (old-URL map) |
| The Optics designer (`.optic`, format `jekoptic`), JEKrf (`.jekrf`, `jekrf`) and its RF designer (`.rfd`, `jekrfd`); cloud tools of the same names | JEKray's own page opened with `?optic`, `?rf` or `?rfd` (`PAGE_MODE`, `OPTIC`, `RFAPP`, `RFD`, `DESIGNER` in `core/constants.js`; each mode's stores' keys end `-<mode>`, `appStoreKey`; its file `PAGE_FORMAT`). A designer is the lens workspace (`ui/lens-workspace.js`) or the RF one (`ui/rf-workspace.js`) as the whole page, the bar moved into its head (`barPiece`). JEKrf offers the RF and circuits palettes and RF examples; JEKray no longer offers RF (its old RF benches still open). Files, links and hand-overs in `io/designs.js`: a bench's assembly keeps `src { uid, id, v }`, follows its designer live on BroadcastChannel `jek-optic` / `jek-rfd` (an RF design's horns kept), is offered a newer cloud version; Design… opens the designer's tab at `#take`; Use on a bench opens the bench's tab at `#place-optic` / `#place-rfd`; test pages keep the designers on the bench (`opticTabs`). JEKrf and JEKion are experimental apps (`core/exp-list.js`, set in JEKsuite's account menu for every app; in JEKsuite only while switched on, and not on the site at all until they are ready to sell); docs `jek/docs/jekray/lens-design/`, `jek/docs/jekray/rf/` |
| JEKsuite, the JEK hub (the apps and every cloud bench, account, plans, teams) | `jek/tools/jeksuite/` — built into `jek/tools/jeksuite.html` (committed), as JEKion is; `README.md` there; the file system (folder tree, drag and drop, picking, the table, names in place) in `src/ui/home.js`, its arithmetic in `src/core/files.js`; the apps' colours there are JEKsuite's alone (`--app` in its `style.css`); tests `node test/run.mjs` (build, Node, a Playwright check against `test/fake-api.mjs`); docs `jek/docs/jekray/jeksuite.md` |
| JEKfilm, the coating designer (`.jekfilm`; a cloud bench with tool `jekfilm`) | `jek/tools/jekfilm/` — built into `jek/tools/jekfilm.html` (committed), as JEKsuite is; `README.md` there; shares JEKray's `core/coatings.js` and `core/coatdesign.js`; saving and optimising need a free account, the cloud Pro; tests `node test/run.mjs`; docs `jek/docs/jekray/jekfilm.md` |
| JEKcad, the Part Studio CAD app (`.jekcad`; a cloud bench with tool `jekcad`, also known by its content's format) | `jek/tools/jekcad/` — built into `jek/tools/jekcad.html` (committed), as JEKfilm is; `README.md` there; OpenCascade (replicad-opencascadejs, LGPL-2.1) vendored in `jek/assets/vendor/replicad-opencascadejs/<version>/`, run in a worker, loaded on first use; feature list, sketch solver and tools in `src/core/`; a document is tabs, Part Studios, Assemblies and Drawings (`normFile` in `core/doc.js`, mates in `core/assembly.js`, `ui/assembly.js`; views, dimensions and the PDF in `core/drawing.js`, `ui/drawing.js`); exports need a free account, the cloud Pro (as JEKion); share links short with an account (`io/share.js`, the API's `links.js` letters c and d, `/c/<id>` forwarded by `404.html`); tests `node test/run.mjs`; docs `jek/docs/jekcad/` (`_data/jekcad_docs.yml`); demo `jek/tools/demos/*.jekcad` |
| Accounts / benches / billing API (Cloudflare Worker) | `jek-api/` (routes in `src/index.js`, D1 migrations in `migrations/`) |
| Shop fulfilment worker | `worker/` (separate; products in `src/catalogue.js`) |
| Instagram post rules | `.claude/commands/instagram-conversion.md`; tag parsing `src/core/src-tag.js` |

### Inside `jek/tools/jekray/src/`
Layers (lint-enforced): `core/ state/ parts/ engines/ worker/` never import `ui/ io/ page/`; engines reach the page only
through `core/hooks.js`.
- A corner cube is a mirror with `retro: true`, traced as three real mirror faces (`retroSurfaces` in `core/stl.js`): each face a surface with its own tilt (`lf.a`, `ownTip`) and outline (`clip`), which the tracer meets as any tipped face (`intersectTip`; `tMin` lets a ray meet two faces at one point where they join).
- **Parts**: `parts/<type>.js` (fields: `norm` defaults/clamps, `guide` text, `make`, picker) + `ui/parts/<type>.js`
  (`draw`, `hit`, `panel`). Registries: `parts/registry.js` (`PARTS`; every palette's rows and groups are its parts' own
  `picker` and `groups`, `PALETTE_PARTS` / `PALETTE_GROUPS`: free space many parts, fibre `fcomp`, circuits `elec`, RF `rf`,
  photonic `pic`), `ui/parts/registry.js` (`PART_UI`).
- **Physics**: ray/beam tracing `engines/trace.js` (by part type); diffracted field `field.js`, `field2d.js`,
  `diffraction.js`; cavities `cavity.js`; fibre networks `fibre.js`, `fibre-face.js` (the Bragg grating's coupled-mode model in `core/fbg.js`); electronics `elec.js` (a steering mirror, `steer: true`, stands where its turn and tip inputs put it: posed for a trace by `steerOn`, its pose in the trace's key `steerKey`, rest in the file; slow drives played by `ui/steer.js`);
  photonic chips `pic.js`; RF `rf-design.js`, `rf-sweep.js`; lens design `lens-*.js`; one particle's scattering `scatter.js`
  (Mie `core/mie.js`, dipole array `core/dda.js`) and, for a Particle part (`parts/particle.js`), its scattered light on the bench
  `scatter-light.js` (a probe one step out, then a cone of rays to each part that sees it, launched at the end of `traceSceneOnce`
  as virtual sources with `vRays`; read as a field by `scatOnDisc` in `fibre-face.js`; the trace's key counts the answers kept,
  `scatRevNow`, and the page's worker supplies them, `scatterKeepUp` in `ui/scatter.js`); data in `core/` (glass,
  coatings, crystals, atoms in `cells.js`/`traps.js`/`zeeman.js`, horns, special functions).
- **UI**: bench `ui/render.js`, `pointer.js`, `actions.js` (toast, context menu, save); panel framework `ui/panel.js`
  (`param`, `numInput`, `selectField`), shared sections `ui/panels.js`, readouts `ui/readouts.js`, plots `ui/plots.js`,
  sweeps `ui/sweeps.js` (what a sweep keeps for its steps, traces, field frames, 3D volumes and light, particles' answers, is one
  store, `engines/sweep-store.js`: one run, a key per step, `stepInvalidate`; `J.sweepAudit()` checks kept against fresh), optimiser `ui/optimise.js`, 3D `ui/view3d.js`, Optical designer `ui/lens-*.js`, RF designer
  `ui/rf-workspace.js`, RF matching-layer workspace `ui/coat-workspace.js` (optical faces go to JEKfilm: `designInFilm` in `io/film-coats.js`), instruments `ui/instruments.js`, tours `ui/tours.js`,
  news/version `ui/news.js` (`APP_VERSION`; the notes themselves in `news.mjs`, see the checklist), experimental flags `ui/experimental.js`.
  Toolbar/menus/dialogs markup: `page.html`; wiring in each module's `wire…()`, called from `ui/boot.js`.
- **Files and sharing**: `io/open.js`, `io/autosave.js`, `io/share.js`, `.zmx/.zar` `io/zmx-import.js` /
  `io/zmx-export.js`, packs `io/packs.js`, mods `io/mods.js` + `engines/mods.js`, cloud `io/cloud.js`, JEKfilm coatings on faces `io/film-coats.js` (the cloud
  folder's `.jekfilm` coatings in a face's Coating list as ◆, a .jekfilm file; the face keeps a copy, `coat.src` `{ id, v }`
  links it, updates offered never forced; `coatFromFilm` in `core/coatdesign.js`; JEKfilm's saves heard on BroadcastChannel
  `jek-film`), usage counts
  `io/usage.js`, AI guide/docs tables `io/guide.js`.
  STEP import: `io/step.js` (blob worker, dialog, `importStep`) + `core/step.js` (units, tessellation passes, bodies);
  OpenCascade's occt-import-js vendored in `jek/assets/vendor/occt-import-js/<version>/` (LGPL-2.1, loaded on first use).
- **Data export** (File › Export data, `save()` in scripts; docs `jek/docs/jekray/data-export.md`): the writers, pure,
  no library, `core/datafiles.js` (`dfWrite(set, fmt)`: zip STORE/deflate-raw via CompressionStream, CSV RFC 4180 one
  heading row "name (unit)" + BOM, JSON by column, XLSX inline strings + About sheet, NPZ .npy 1.0 a column each as
  `table/key_unit` + `meta` JSON in a 0-d `<U`, MAT Level 5 structs/cells/char UTF-8; a set is `{ meta, items }` of
  tables/arrays/values; `dfItemsOf` turns a script's data into items); the bench's numbers `engines/data-export.js`
  (`gatherData(kinds)`: readouts, screens, beams, sweeps + `STUDIES`/`keepStudy` from `ui/tours.js`, bench; also
  headless `B.data`/`B.exportData`); the plots (the panels drawn out of sight via `panelInto`), dialog
  `#dataDialog`, `exportData`/`exportEverything` in `io/data-export.js`. Tests `datafiles.test.mjs` (read back by
  Python's numpy/scipy/openpyxl/pandas when installed: CI pip-installs them) and `data-export.test.mjs`.
- **Signed part packs**: signatures checked in `core/packsig.js` (canonical JSON, hash, Ed25519 verify with
  `PACK_PUBLIC_KEY`, the install decision `packDecide`, labels); install/make/sign dialogs, status checks and the daily
  re-check in `io/packs.js`; a bench carries a module as signed (`signed`, `engines/mods.js` `normCarried`). Labels
  (`packTrustLabel`): a person's account reads plainly "✓ Signed by the JEKray account ‘name’" (class `signed`, never
  green: the name is the account's own choice); the green "✓ Verified: org (domain)" only for a team with a verified
  domain. An id registered to a maker installs only that maker's signed packs, installed or not (`packDecide`). API side
  `jek-api/src/packs.js` + `src/packsig.js` (its own copy of the canonical form: `test/node/packsig.test.mjs` checks they
  agree), migration 0015; the private key is the `PACK_SIGNING_KEY` Worker secret (`scripts/pack-key.mjs`). Teams verify
  their domain themselves (owner/admin, active plan): `POST|DELETE /v1/teams/:id/domain`, `POST …/domain/verify`, a TXT
  record `_jekray-verify.<domain>` looked up over DNS-over-HTTPS (`DOH_URL`), re-checked on signing every 30 days; UI
  `teamSigningSection` in `io/account.js`. Ops (revoke, the reserved-ids flag for `jek`/`jekray`/`jeksys`, a team's
  domain by hand or freed, signing our own packs) `scripts/packs.mjs`. `PACK_PUBLIC_KEY` is the live key (set 22 Oct 2026); the
  TEST key (private half only in `jek-api/vitest.config.js`) is used in TEST_MODE, and on localhost only if passed. Modules install only verified; ids are claimed by their first signer.
- **Scripting**: `window.JEKray` in `ui/boot.js`; in-page scripts `ui/scripts.js` (`CALLS`, `makeJ`, `execScript`), in
  JavaScript or Python: Python is Pyodide (`ui/python.js`: the Python `J` and its glue, everything crossing as JSON text),
  vendored with NumPy's wheel in `jek/assets/vendor/pyodide/<version>/` (MPL-2.0; CPython PSF, NumPy BSD), loaded on first
  use, never from a CDN. Scripts run in the **script worker** (`page/script-worker.js` `scriptWorkerMain`; a module worker
  of the page's own script, `newAppWorker(true)`, as Pyodide needs one; the dev page's `worker/entry.js?script`): its own
  copy of the bench, J over `scriptCalls()` (`ui/script-calls.js`, which `window.JEKray` spreads too, so both answer
  alike), log lines streamed; Stop (`stopScript`) terminates it; at the end a changed bench comes back and `adoptBench`
  (`ui/tabs.js`) takes it up as one Undo step; select/showTab/sweepPause are done on the page then, sweepPlay is refused
  with "Run on the page (no Stop)" (`runScript(…, { page: true })`, the old main-thread path). A new J call goes in
  `scriptCalls` if it needs only the bench, else in `workerCalls`. `save(name, data, format, meta)` (JS bare or `J.save`;
  Python `save`, NumPy arrays tagged `__ndarray__` with shape and dtype) only collects into the run's `saves`, which come
  back with the worker's done message (Stop: none) and become files on the page in `saveScriptFiles` (gated by
  `scriptsWhy`); the output's Save as… goes through it too. Node `headless.mjs`, `cli.mjs`; documented in
  `jek/docs/jekray/scripting.md`.
- **JEKrayPro gating**: `ui/pro.js` (`designPro`, `proMark`), reasons in `io/cloud.js` (`proWhy`). JEKrayPro is only
  what lives on the server: cloud save, history, forks, folders, My parts, teams, and more share links than a free
  account's three (`FREE_LINKS` in `jek-api/src/links.js`). Everything done in the browser needs only a free account
  (`freeWork` in `ui/pro.js`, in every app: the optimiser, tolerancing, reports, drawings, design export, scripts,
  every data format, JEKfilm's file, optimiser and specification): it still goes through `designPro(what)` /
  `proMark`, which ask for the account alone when `freeWork(what)`. Exports (layout, 3D PNG, plots' PNG/CSV, screen
  CSV, data, .zmx, CAD) and saving the .jekray file (`saveFile`) need a free account: `accountGate(what)` in `ui/pro.js` opens each export function
  and shows the sign-in prompt (`exportSignIn` in `io/nudges.js`, counted as `export.*`); only someone signed out for
  sure is stopped (account unknown or API down: allowed). JEKion's .jekion file is the same, and its ions fly only
  for someone signed in (`flyBar` in `jekion/src/ui/sim.js`: the fields are still solved and drawn). Every app keeps
  the work in the browser signed in or not (each app's autosave, JEKray's earlier versions and Open recent), so a
  bench shown to someone survives a reload; each of those writes asks `keepHere()` in `ui/pro.js`, whose
  `KEEP_SIGNED_OUT` switch turns signed-out keeping off again (with the sign beside Save, `keepSign`, saying so);
  `test/node/keep.test.mjs` checks each write asks. Badges: `proMark` /
  `acctMark` (or `data-need="pro|account" data-what` in `page.html`) give the Pro / Free account chip, redone live by
  `needsShown()` from `cloudGates`; menu items greyed by `gateItem` take the same chips. `test/node/pro-gate.test.mjs`
  checks from the syntax tree that each gated function opens with its gate, that every `downloadFile`/`download:` is
  behind one (`accountGate`, `designPro`/`designWhy`, or the scripts' `scriptsWhy`; or in its short list of
  non-exports), the data export's split, and that a script's files are made only after a run, never on Stop. Experimental features need only
  a signed-in account (`setExpGate` in `io/cloud.js`). None of it applies in TEST_MODE or without accounts.
  Node scripting (`headless.mjs`, `cli.mjs`) is never gated: it runs from the public source, where a check could just
  be deleted. Anything it gains that touches the cloud (benches, parts, links) goes through the API, whose own account
  and plan checks are the gate.

## Modelling rule (the tools)
JEKray and its sister tools are modelling programs. A part is modelled as the physical thing it is, and its behaviour
comes out of the physics the engine already traces. It is never a rule that asserts the answer.
- **Build a part from what it is made of**: real surfaces, materials and coatings, met by the same laws as every other
  part (reflection, refraction, Fresnel, polarisation in 3D, the beam and the field). A corner cube is three mirrors;
  a prism is its glass faces. If the result is known in closed form (a ray comes back antiparallel, a lens focuses at
  f), that is what the tests check the model against, not what the code writes down.
- **No teleporting or special-casing a part in the tracer** to produce its textbook behaviour: no ray moved to where
  it "should" leave, no direction set by formula, no polarisation, path or loss put in by hand. If a part needs
  something the engine cannot do yet (a face with its own tilt, an outline that is not a disc), extend the engine in
  general terms so any part can use it.
- **If the proper model is out of reach in the time, stop and say so before building.** State what a proper model
  needs, what the shortcut would leave out, and ask. Do not ship the shortcut and list its gaps afterwards.
- **A simplification that stays is a physical idealisation of a real quantity, named in the docs' Assumptions**
  (a mirror that follows its drive at any frequency, a filter whose edge does not move with tilt), never a missing
  mechanism. "Not modelled" in a write-up of new work is a sign to go back and model it.
- **Before calling a new part done, list what it gets from the engine and what it asserts.** Anything asserted is
  either removed or raised with the owner.

## Part panels (JEKray's free-space, fibre and circuit parts are tables)
A part's panel is a table, not a stack of boxed inputs (`tablePart(el)` in `ui/panel.js`: every free-space part, an
imported body, every fibre component and every circuit block; a photonic chip's parts are still boxes). Two ways a panel becomes one, both giving the
same rows: `propTable(el, rows)` builds a table from row specs (the mirror and the source: used where figures worked out
from the settings sit among them), and `tabulate(panel, el)` turns a panel built the older way (`param`, `selectField`,
`textField`, ticks, in `rt-rows` or `grid2`) into tables in place after the part's `panel()` has run, keeping each row's
`.rt-f`, label and box so what finds a setting by them still does. So a part's module need not change to be a table; write
new sections with `propTable`. When adding to a panel:
- **A row a setting**: name, value, unit and the sweep's ∿ in columns. The unit is its own column, never in the name
  (the label keeps it out of sight for a screen reader, so its text is still "Radius (mm)"). Values are plain text until
  pointed at. A row still at a new part's value is dimmed (`dflt`), so what has been set stands out.
- **Row kinds**: a number (`path`), a choice (`choose`), on or off (`tick`), words (`text`), anything else beside its
  name (`cell`) or across the row (`node`), and a figure worked out from the settings (`read`, in italics, among the
  settings it follows from: a focal length, a Rayleigh range). A choice's words are short enough to fit; the long of it
  goes in the row's `title`.
- **Sections are the panel's own folding headings** (`h3`), named for what they hold (Surface, Coating), not for the
  part. No fold-outs inside a section: every setting is a row.
- **A worked-out figure goes among the settings only if it follows from the settings alone** (a focal length from a radius, a
  groove spacing from lines per mm): `readRow({ name, read, unit })` appended with the settings. What depends on the
  light (a wavelength, what arrives) stays in the Readout, and a figure is never shown in both.
- **Readouts** (`.rt-readout`) are rows of the same look, and come before Colours. **A part's readout tabs** (Rays,
  Diffraction, Pulse) start with their own view: Name and Position show on the first tab only, and a tab's settings
  (Plot, Map scale, MTF, Focus model) are table rows.
- **The foot**: the part's actions the same size in one row (`rt-actions-even`): Design… (light fill), Duplicate, Delete.
- Explanations stay as text between or under the tables; nothing explanatory is squeezed into a row.

## Adding or changing a tool feature — checklist
0. A new part or behaviour: read the Modelling rule above first.
1. Part field: `norm` (default so old files load — there are no format migrations) and `guide.fields`; the panel in
   `ui/parts/<type>.js`; physics in the engine; 3D model in `ui/view3d.js` if it shows. New module → `order.json`.
2. `cd jek/tools/jekray && node build.mjs` (writes `jekray.html`, `jekray-dev.html`, `src/main.js`, `src/worker-main.js`;
   commit them).
3. `node docs.mjs` (regenerates the parameter tables and AI guide; the browser suite checks they match exactly).
4. Docs page in `jek/docs/jekray/<section>/` + entry in `_data/jekray_docs.yml` (not enforced by tests).
5. Tests: Node tests in `test/node/` (tool physics goes in a `physics-*.test.mjs`), browser checks in a `{ group }` in
   `jekray-tests.html`, and claim new files in `test/areas.mjs`.
6. A demo that should move: `UPDATE_SNAPSHOT=1 node --test test/node/demos.test.mjs`, then read the snapshot diff.
7. User-visible feature: an entry at the top of its version's list in `jek/tools/jekray/news.mjs`, then `node build.mjs` and
   `node docs.mjs` (the page carries each version's highlights and latest 20, `src/ui/news-data.js`; all of them are the docs'
   Release notes page, `jek/docs/jekray/release-notes.md`; both generated). Bump `APP_VERSION` in `ui/news.js` for a release.

## Running the tests (from `jek/tools/jekray`)
- `node test/run.mjs` — what the working tree touches; `--areas fibre,io`; `--full` (everything, ~7 min, Node + the
  browser suite in Playwright; Chromium is at `/opt/pw-browsers/chromium`). Every fifth run is made a full one.
- `node --test test/node/<file>.test.mjs` for one file. `build.test.mjs` fails until the page is rebuilt.
- `jek-api`: `npm test` (vitest, Workers pool). Deploy is manual: `npm run migrate:remote`, then `npm run deploy`.
  A change that needs a new secret or migration (e.g. signed packs) goes: migrate → secret → deploy the API → then the
  page (`jek-api/README.md`, "Turning on signed part packs").

## Gotchas
- The build joins every module into one scope: top-level names must be unique across modules; a module may not act at
  load (only `ui/boot.js`); another module's binding is changed through its setter (`setProject`, …).
- A new usage event goes in three places: `EVENTS` in `jek-api/src/usage.js`, `LABELS` in `jek-api/scripts/usage.mjs`,
  and `src/io/usage.js`.
- People step by step, with no id: `funnel(step)` in `io/usage.js` counts each step once per browser per source and
  device ('funnel' <src>.<step>, dev-<device>.<step>; steps in `FUNNEL` of `jek-api/scripts/usage.mjs`); first visits
  'cohort' <src>.<week> and 'back' ….d1/d7/d30 (`backMarks` in `core/src-tag.js`); the bench drawn 'load' drawn.<band>,
  and visits that end before it 'early.<band>', sent by page.html's early script (`#jekEarly`, kept like `deviceOf`
  by `test/node/usage-funnel.test.mjs`).
- Exercises (Help › Exercises; `?ex=<id>`): data `core/exercises.js`, the course `EXERCISES` in teaching order (start =
  a bench from `core/exercise-benches.js` + changes, checks on the optimiser's measures, unlocked settings, hints,
  answer, optimiser ranges); `CHALLENGES` is empty for now (reels no longer get a challenge). The bar/locks/checks
  `ui/challenge.js` (`exerciseTick` after each render puts back what may not change; locks are non-enumerable so never
  saved), solved kept in `jek-exercises` and on the account (`jek-api/src/exercises.js`, migration 0017). Each answer
  is checked by the browser group 'Exercises'.
- Instagram links (`?src=ig-…`, the bio's and any old per-reel one) all open the Michelson example with its sweep
  playing (`ui/boot.js`, `fromIgTag`); the tag is still counted per link. Reels no longer get their own bench or note.
- Usage report (baseline before a change meant to move a number): `cd jek-api && JEK_OPS_TOKEN=… node scripts/usage.mjs`
  (`--days 90`, `--html r.html`, `--json`). Its "Sign-in prompts" table has a row per prompt (`track('prompt',
  '<where>.<answer>')`: share, save, return, shared, tour, menu; names in `PROMPT_NAMES`) with shown, each answer,
  sign-in clicks and click-through. A new prompt reuses the `prompt` event; its where goes in `PROMPT_NAMES`
  (`test/node/nudge.test.mjs` checks). The notes share one weekly cap (`src/core/nudge.js`).
- Accounts report (who has an account, their plan, sign-ins, last active, benches, links, exercises): `GET /ops/users`
  (`jek-api/src/opsusers.js`), read by `cd jek-api && JEK_OPS_TOKEN=… node scripts/users.mjs` (`--html`, `--csv`,
  `--json`, `--sort active|joined|benches|plan|name`). Windows double-click files in `jek-api/scripts/`: `users-report.cmd`
  (page), `users-spreadsheet.cmd` (CSV on the desktop), `users-list.cmd` (terminal), `usage-report.cmd`; copies work from
  anywhere (they remember the jek-api folder as `JEK_API_DIR`). Account records only: never
  joined to the anonymous usage counts, and never a bench's contents.
- Site nav and CSS stamp are single-sourced: edit the nav in `_includes/site-nav.html`; after changing `jek.css` bump
  `css_v` in `_config.yml`. Pages get them via front matter + `{% include site-nav.html %}` / `?v={{ site.css_v }}`
  (so no stray `{{`/`{%` in a page: wrap in `{% raw %}`). Unbuilt copies to update by hand: `jekray-tests.html` and
  `jekion-tests.html` (nav + stamp) and `jekray/page.html`, `jekion/page.html`, `jeksuite/page.html` (stamp; rebuild). `test/node/site-nav.test.mjs`
  checks all of it. Preview: README.
- JEKion shares JEKray's modules as they are (`core/constants.js`, `hooks.js`, `numeric.js`, `datafiles.js`, `src-tag.js`,
  `step.js`, `worker/shim.js`, `ui/pro.js`, `ui/dom.js`, `io/usage.js`, `io/account.js`, `io/step-reader.js`): a change to one of those is a change
  to both tools, so rebuild and test both (`cd jek/tools/jekion && node build.mjs && node test/run.mjs`). A shared module
  reaches the page only through `core/hooks.js` (JEKion installs its own entries: `ionChanged`, `apiBase`, `usageTier`…).
  Top-level names must be unique across both tools' modules in JEKion's build. Accounts, usage counts and the data
  writers are JEKray's; JEKion's usage tokens are prefixed `ion-`, JEKfilm's (and JEKray's about JEKfilm) `film-`: the usage
  report's "Visits by app" (`byApp` in `jek-api/scripts/usage.mjs`) tells the apps apart by that prefix.
- My benches is JEKsuite (`jek/tools/jeksuite.html`): every app's My benches opens it in the tab named `jeksuite`
  (JEKray `openSpace` in `io/cloud.js`, JEKion `openCloudList`), and it opens a bench in its app's named tab at
  `#cloud=<id>[@v][:lens|rf|coat]`, or `#new[=lens|rf|coat]` (JEKray `startNewBench` in `ui/tours.js`, JEKion
  `newProject`). The rail's apps open each app's launch page in JEKsuite (`#app=jekray|jekion`, `showApp` in
  `jeksuite/src/ui/home.js`): its benches alone, the one picked beside them; New › Open opens the apps. JEKray keeps the
  home page's CSS (`.rt-home`, `.rt-h*` in `style.css`), which JEKsuite is styled with, and the merge dialog for a
  save conflict; comparing versions and merging forks are JEKsuite's.
- One account for every app: `jek/tools/jekray/src/io/account.js` (sign-in incl. the email dialog, the account menu's
  rows `accountMenuRows`, plans and billing, the account dialog, teams, invitations, a university's licence, deleting
  the account, `authOutcome` for the ?jekauth/?jekbilling return) is shared as it is by JEKray, JEKion and JEKsuite,
  with `ui/dom.js` (`h`, which every module imports from there). It reaches each app only through `core/hooks.js`:
  `appName`, `toast`, `keepWork` (the autosave before the page leaves to sign in or pay), `planActive`,
  `accountLoadedHere`, `accountChanged`, `accountMenu(rows)` / `accountMenuExtra` / `accountMenuDone` /
  `openAccountMenu` (where the menu goes), `sayUnreachable`, `accountDeleted`. JEKray installs them in `io/nudges.js`
  (`wireNudges`, which also holds its bench sign-in prompts: shareSignIn, exportSignIn, gateSignIn, the save/return/work
  notes), JEKion in `io/ion-account.js` (`wireIonAccount`, with its own sign-in prompt `showSignIn`), JEKsuite in
  `src/ui/boot.js`. A change to sign-in, plans, billing or teams is made once, there; rebuild all three.
- Site search: the box in the nav bar (`_includes/site-nav.html`, `.nav-search`) sends `?q=` to `jek/search-results.html`, which reads
  only the pages listed in its `PAGES`: add a new page there.
- Thorlabs/vendor files are not committed; reproduce them in tests with synthetic text.
