# JEKfilm

The JEK coating designer: one thin-film coating at a time, kept as a `.jekfilm` file or in the cloud beside the
benches that use it. Served as `jek/tools/jekfilm.html`, built from the sources here as JEKspace is (no worker).

- `node build.mjs` writes `../jekfilm.html`, `../jekfilm-dev.html` and `src/main.js` (commit them); `--check` says
  whether they are current. The modules in `order.json` are joined into one scope with JEKray's lint: unique
  top-level names, imports from where a name is declared, nothing run at load but `ui/boot.js`.
- Shared from JEKray, as they are: the physics (`core/coatings.js`, the stack model JEKray traces with, and
  `core/coatdesign.js`, the targets, merit and optimiser), `core/constants.js`, `core/hooks.js`, `core/numeric.js`,
  `core/src-tag.js`, `ui/dom.js`, `ui/pro.js` (the Pro and account gates), `io/usage.js` and `io/account.js`.
  A change to one of them is a change to JEKray too: rebuild and test both.
- `src/core/film.js`: the file (`normFilm`: any input opens, no migrations), the substrates (JEKray's Sellmeier
  coefficients, copied; `test/node/film.test.mjs` checks they are JEKray's), `filmSpec` (what coatdesign.js takes),
  `filmToCoat` (what a JEKray face takes: `normCoat` mode `stack`). RF matching layers are not JEKfilm's: they stay
  with the RF designer.
- `src/ui/`: `bar.js` (toast, menus, icons, theme), `plot.js` (SVG line plots), `designer.js` (the coating, undo, the
  page; `optimiseNow`), `boot.js` (`window.JEKfilm`, `#cloud=<id>[@v]`, `#new`).
- `src/io/`: `files.js` (the autosave, `.jekfilm` save/open, the curves as CSV), `film-account.js` (the shared
  account's hooks, `filmSignIn`), `cloud.js` (open, save, the conflict, Save to the cloud into a workspace and
  folder, the picture JEKspace shows).
- Gates: saving a `.jekfilm` file, saving to the cloud and optimising are JEKrayPro's (`designPro`); exporting the
  curves needs a free account (`accountGate`); opening a file and designing need nothing. The API refuses a cloud save
  without a plan (402) regardless.
- In the cloud a coating is a bench with `tool` `jekfilm` (from its content's `format`; `jek-api/src/benches.js`
  `toolOf`, `TOOLS`): it lists with the benches on JEKspace, and no other app's file saves over it.
- Tests: `node test/run.mjs` (the build and lint, `test/node/`, then `test/browser.mjs` in Playwright against the
  stand-in API in `test/fake-api.mjs`); `--shots <folder>` keeps pictures.
