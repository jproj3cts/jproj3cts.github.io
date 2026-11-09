# JEKspace

The JEK hub: the apps (JEKray and JEKion) and every bench kept in the cloud, of every app, with the account, plans,
billing and teams. Served as `jek/tools/jekspace.html`, built from the sources here as JEKion is built.

- `node build.mjs` writes `../jekspace.html`, `../jekspace-dev.html` and `src/main.js` (commit them); `--check` says
  whether they are current. The modules in `order.json` are joined into one scope, with JEKray's lint: unique
  top-level names, imports from where a name is declared, nothing run at load but `ui/boot.js`.
- Shared from JEKray, as they are: `core/constants.js`, `core/hooks.js`, `core/src-tag.js`, `io/merge.js` (comparing
  and merging versions) and `io/usage.js` (usage counts, the visit counted as `open` `space`). The page's style is
  JEKray's `style.css` and then `style.css` here.
- `src/ui/dom.js`: elements, icons, menus, the theme (JEKray's `jekray-theme`), and `APPS`, the apps it lists and
  opens, each in its own named tab (`jekray`, `jekion`). `src/io/account.js`: the account, from JEKray's
  `io/account.js` (sign-in, plans, billing, the account dialog, teams, a university's licence, deleting the account).
  `src/ui/home.js`: the benches, from what was JEKray's My benches page (folders, history, compare, merge, fork,
  copy, move, rename, bin, My parts, My links), the apps' cards, New, and the filter by app.
- What it sends the apps: `#cloud=<id>` (and `@<version>` for a copy of one; `:lens`, `:rf`, `:coat` into one of
  JEKray's designers), `#new` (and `#new=lens|rf|coat`) when there is nowhere in the cloud to make the bench, and
  JEKray's `#s=<id>` for a share link. The apps' My benches open this page in the tab named `jekspace`; JEKray's
  Manage My parts opens it at `#parts`.
- Tests: `node test/run.mjs` (the build and lint, `test/node/`, then `test/browser.mjs` in Playwright against the
  stand-in API in `test/fake-api.mjs`); `--shots <folder>` keeps pictures of the page signed in.
