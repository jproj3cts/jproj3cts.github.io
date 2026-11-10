# jeksys.net — working notes

The repo is the jeksys.net site (GitHub Pages) plus JEKray, a browser optics/photonics/RF simulator, JEKion, a
charged-particle optics simulator built the same way beside it, JEKfilm, a thin-film coating designer, and their API. The root README has the site
conventions; `jek/tools/jekray/README.md` has the tool's module rules, `jek/tools/jekion/README.md` JEKion's.

## Working rules
- Develop on a feature branch and push it. **Ask before pushing to `main`** every time; an earlier "yes" does not carry over.
- Before pushing to main, merge `origin/main` into the branch (never rebase or force-push), rebuild, re-run the full suite.
- CI (`.github/workflows/tests.yml`) runs the build/docs checks, the Node and browser suites and the API tests on pushes to
  `main` and `claude/**` and on PRs (~7 min). Still run the suites locally before pushing and report the counts.
- **Commits are the owner's.** Before the first commit of a session run
  `git config user.name "jproj3cts" && git config user.email "114860885+jproj3cts@users.noreply.github.com"`, and write
  commit messages with no `Co-Authored-By`, `Claude-Session` or other assistant lines, session links or model names.
  (main's history was rewritten to this once, on 5 Nov 2026; it is never force-pushed again.)

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
| JEKsuite, the JEK hub (the apps and every cloud bench, account, plans, teams) | `jek/tools/jekspace/` — built into `jek/tools/jekspace.html` (committed), as JEKion is; `README.md` there; tests `node test/run.mjs` (build, Node, a Playwright check against `test/fake-api.mjs`); docs `jek/docs/jekray/jekspace.md` |
| JEKfilm, the coating designer (`.jekfilm`; a cloud bench with tool `jekfilm`) | `jek/tools/jekfilm/` — built into `jek/tools/jekfilm.html` (committed), as JEKsuite is; `README.md` there; shares JEKray's `core/coatings.js` and `core/coatdesign.js`; saving and optimising are Pro; tests `node test/run.mjs`; docs `jek/docs/jekray/jekfilm.md` |
| Accounts / benches / billing API (Cloudflare Worker) | `jek-api/` (routes in `src/index.js`, D1 migrations in `migrations/`) |
| Shop fulfilment worker | `worker/` (separate; products in `src/catalogue.js`) |
| Instagram post rules | `.claude/commands/instagram-conversion.md`; tag parsing `src/core/src-tag.js` |

### Inside `jek/tools/jekray/src/`
Layers (lint-enforced): `core/ state/ parts/ engines/ worker/` never import `ui/ io/ page/`; engines reach the page only
through `core/hooks.js`.
- **Parts**: `parts/<type>.js` (fields: `norm` defaults/clamps, `guide` text, `make`, picker) + `ui/parts/<type>.js`
  (`draw`, `hit`, `panel`). Registries: `parts/registry.js` (`FREE_GROUPS`, picker), `ui/parts/registry.js` (`PART_UI`).
- **Physics**: ray/beam tracing `engines/trace.js` (by part type); diffracted field `field.js`, `field2d.js`,
  `diffraction.js`; cavities `cavity.js`; fibre networks `fibre.js`, `fibre-face.js`; electronics `elec.js`;
  photonic chips `pic.js`; RF `rf-design.js`, `rf-sweep.js`; lens design `lens-*.js`; data in `core/` (glass,
  coatings, crystals, atoms in `cells.js`/`traps.js`/`zeeman.js`, horns, special functions).
- **UI**: bench `ui/render.js`, `pointer.js`, `actions.js` (toast, context menu, save); panel framework `ui/panel.js`
  (`param`, `numInput`, `selectField`), shared sections `ui/panels.js`, readouts `ui/readouts.js`, plots `ui/plots.js`,
  sweeps `ui/sweeps.js`, optimiser `ui/optimise.js`, 3D `ui/view3d.js`, Optical designer `ui/lens-*.js`, RF designer
  `ui/rf-workspace.js`, RF matching-layer workspace `ui/coat-workspace.js` (optical faces go to JEKfilm: `designInFilm` in `io/film-coats.js`), instruments `ui/instruments.js`, tours `ui/tours.js`,
  news/version `ui/news.js` (`APP_VERSION`, `NEWS`), experimental flags `ui/experimental.js`.
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
- **JEKrayPro gating**: `ui/pro.js` (`designPro`, `proMark`), reasons in `io/cloud.js` (`proWhy`). Pro: optimiser,
  tolerancing, reports, drawings, design export, share links/QR, scripts, My parts, and data export as XLSX/NPZ/MAT,
  several kinds at once or Export everything (`exportData`/`exportEverything` in `io/data-export.js`: `accountGate`
  first, then `designPro`; `DATA_PRO`). Exports (layout, 3D PNG, plots' PNG/CSV, screen CSV, data as CSV or JSON one
  kind at a time, .zmx, CAD) need a free account: `accountGate(what)` in `ui/pro.js` opens each export function
  and shows the sign-in prompt (`exportSignIn` in `io/nudges.js`, counted as `export.*`); only someone signed out for
  sure is stopped (account unknown or API down: allowed). Saving the .jekray file is never gated. Badges: `proMark` /
  `acctMark` (or `data-need="pro|account" data-what` in `page.html`) give the Pro / Free account chip, redone live by
  `needsShown()` from `cloudGates`; menu items greyed by `gateItem` take the same chips. `test/node/pro-gate.test.mjs`
  checks from the syntax tree that each gated function opens with its gate, that every `downloadFile`/`download:` is
  behind one (`accountGate`, `designPro`/`designWhy`, or the scripts' `scriptsWhy`; or in its short list of
  non-exports), the data export's split, and that a script's files are made only after a run, never on Stop, and that
  the .jekray save is not. Experimental features need only
  a signed-in account (`setExpGate` in `io/cloud.js`). None of it applies in TEST_MODE or without accounts.
  Node scripting (`headless.mjs`, `cli.mjs`) is never gated: it runs from the public source, where a check could just
  be deleted. Anything it gains that touches the cloud (benches, parts, links) goes through the API, whose own account
  and plan checks are the gate.

## Adding or changing a tool feature — checklist
1. Part field: `norm` (default so old files load — there are no format migrations) and `guide.fields`; the panel in
   `ui/parts/<type>.js`; physics in the engine; 3D model in `ui/view3d.js` if it shows. New module → `order.json`.
2. `cd jek/tools/jekray && node build.mjs` (writes `jekray.html`, `jekray-dev.html`, `src/main.js`, `src/worker-main.js`;
   commit them).
3. `node docs.mjs` (regenerates the parameter tables and AI guide; the browser suite checks they match exactly).
4. Docs page in `jek/docs/jekray/<section>/` + entry in `_data/jekray_docs.yml` (not enforced by tests).
5. Tests: Node tests in `test/node/` (tool physics goes in a `physics-*.test.mjs`), browser checks in a `{ group }` in
   `jekray-tests.html`, and claim new files in `test/areas.mjs`.
6. A demo that should move: `UPDATE_SNAPSHOT=1 node --test test/node/demos.test.mjs`, then read the snapshot diff.
7. User-visible feature: a `NEWS` entry in `ui/news.js` (bump `APP_VERSION` for a release).

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
  `jekion-tests.html` (nav + stamp) and `jekray/page.html`, `jekion/page.html`, `jekspace/page.html` (stamp; rebuild). `test/node/site-nav.test.mjs`
  checks all of it. Preview: README.
- JEKion shares JEKray's modules as they are (`core/constants.js`, `hooks.js`, `numeric.js`, `datafiles.js`, `src-tag.js`,
  `step.js`, `worker/shim.js`, `ui/pro.js`, `ui/dom.js`, `io/usage.js`, `io/account.js`, `io/step-reader.js`): a change to one of those is a change
  to both tools, so rebuild and test both (`cd jek/tools/jekion && node build.mjs && node test/run.mjs`). A shared module
  reaches the page only through `core/hooks.js` (JEKion installs its own entries: `ionChanged`, `apiBase`, `usageTier`…).
  Top-level names must be unique across both tools' modules in JEKion's build. Accounts, usage counts and the data
  writers are JEKray's; JEKion's usage tokens are prefixed `ion-`.
- My benches is JEKsuite (`jek/tools/jekspace.html`): every app's My benches opens it in the tab named `jekspace`
  (JEKray `openSpace` in `io/cloud.js`, JEKion `openCloudList`), and it opens a bench in its app's named tab at
  `#cloud=<id>[@v][:lens|rf|coat]`, or `#new[=lens|rf|coat]` (JEKray `startNewBench` in `ui/tours.js`, JEKion
  `newProject`). The rail's apps open each app's launch page in JEKsuite (`#app=jekray|jekion`, `showApp` in
  `jekspace/src/ui/home.js`): its benches alone, the one picked beside them; New › Open opens the apps. JEKray keeps the
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
