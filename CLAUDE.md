# jeksys.net — working notes

The repo is the jeksys.net site (GitHub Pages) plus JEKray, a browser optics/photonics/RF simulator, and its
API. The root README has the site conventions; `jek/tools/jekray/README.md` has the tool's module rules.

## Working rules
- Develop on a feature branch and push it. **Ask before pushing to `main`** every time; an earlier "yes" does not carry over.
- Before pushing to main, merge `origin/main` into the branch (never rebase or force-push), rebuild, re-run the full suite.
- CI (`.github/workflows/tests.yml`) runs the build/docs checks, the Node and browser suites and the API tests on pushes to
  `main` and `claude/**` and on PRs (~7 min). Still run the suites locally before pushing and report the counts.

## Where things are
| Area | Path |
|---|---|
| The tool (source) | `jek/tools/jekray/src/` — built into `jek/tools/jekray.html` (committed) |
| Browser test suite | `jek/tools/jekray-tests.html` (`?dev=1` runs it on the unbuilt modules via `jekray-dev.html`) |
| Example benches | `jek/tools/demos/*.jekray` (+ `thumbs/`) |
| Physics validation against external references | `jek/tools/validation/` |
| Docs (Jekyll, `layout: docs`) | `jek/docs/jekray/**.md`; sidebar/prev-next from `_data/jekray_docs.yml` |
| Docs parameter tables / AI guide (generated) | `_data/jekray_params.json`, `jek/tools/jekray-ai-guide.md` |
| Site pages (HTML built by Jekyll; nav from `_includes/site-nav.html`) | `jek/*.html`, `jek/products/`, `jek/calculators/`, `index.html`, `404.html` (old-URL map) |
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
  `ui/rf-workspace.js`, coating designer `ui/coat-workspace.js`, instruments `ui/instruments.js`, tours `ui/tours.js`,
  news/version `ui/news.js` (`APP_VERSION`, `NEWS`), experimental flags `ui/experimental.js`.
  Toolbar/menus/dialogs markup: `page.html`; wiring in each module's `wire…()`, called from `ui/boot.js`.
- **Files and sharing**: `io/open.js`, `io/autosave.js`, `io/share.js`, `.zmx/.zar` `io/zmx-import.js` /
  `io/zmx-export.js`, packs `io/packs.js`, mods `io/mods.js` + `engines/mods.js`, cloud `io/cloud.js`, usage counts
  `io/usage.js`, AI guide/docs tables `io/guide.js`.
  STEP import: `io/step.js` (blob worker, dialog, `importStep`) + `core/step.js` (units, tessellation passes, bodies);
  OpenCascade's occt-import-js vendored in `jek/assets/vendor/occt-import-js/<version>/` (LGPL-2.1, loaded on first use).
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
  domain by hand or freed, signing our own packs) `scripts/packs.mjs`. The source carries a TEST public key
  (private half only in `jek-api/vitest.config.js`), taken only in TEST_MODE and on localhost, until the real one
  replaces it. Modules install only verified; ids are claimed by their first signer.
- **Scripting**: `window.JEKray` in `ui/boot.js`; in-page scripts `ui/scripts.js` (`CALLS`); Node `headless.mjs`,
  `cli.mjs`; documented in `jek/docs/jekray/scripting.md`.
- **JEKrayPro gating**: `ui/pro.js` (`designPro`, `proMark`), reasons in `io/cloud.js` (`proWhy`). Pro: optimiser,
  tolerancing, reports, drawings, design export, share links/QR, scripts, My parts. Exports (layout, 3D PNG, plots'
  PNG/CSV, screen CSV, .zmx, CAD) need a free account: `accountGate(what)` in `ui/pro.js` opens each export function
  and shows the sign-in prompt (`exportSignIn` in `io/account.js`, counted as `export.*`); only someone signed out for
  sure is stopped (account unknown or API down: allowed). Saving the .jekray file is never gated. Badges: `proMark` /
  `acctMark` (or `data-need="pro|account" data-what` in `page.html`) give the Pro / Free account chip, redone live by
  `needsShown()` from `cloudGates`; menu items greyed by `gateItem` take the same chips. `test/node/pro-gate.test.mjs`
  checks from the syntax tree that each gated function opens with its gate, that every `downloadFile`/`download:` is
  behind one (or in its short list of non-exports), and that the .jekray save is not. Experimental features need only
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
- Usage report (baseline before a change meant to move a number): `cd jek-api && JEK_OPS_TOKEN=… node scripts/usage.mjs`
  (`--days 90`, `--html r.html`, `--json`). Its "Sign-in prompts" table has a row per prompt (`track('prompt',
  '<where>.<answer>')`: share, save, return, shared, tour, menu; names in `PROMPT_NAMES`) with shown, each answer,
  sign-in clicks and click-through. A new prompt reuses the `prompt` event; its where goes in `PROMPT_NAMES`
  (`test/node/nudge.test.mjs` checks). The notes share one weekly cap (`src/core/nudge.js`).
- Site nav and CSS stamp are single-sourced: edit the nav in `_includes/site-nav.html`; after changing `jek.css` bump
  `css_v` in `_config.yml`. Pages get them via front matter + `{% include site-nav.html %}` / `?v={{ site.css_v }}`
  (so no stray `{{`/`{%` in a page: wrap in `{% raw %}`). Unbuilt copies to update by hand: `jekray-tests.html` (nav +
  stamp) and `jekray/page.html` (stamp; rebuild). `test/node/site-nav.test.mjs` checks all of it. Preview: README.
- Site search only finds pages listed in `searchablePages` in `jek/index.html`.
- Thorlabs/vendor files are not committed; reproduce them in tests with synthetic text.
