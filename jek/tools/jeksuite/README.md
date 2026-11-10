# JEKsuite

The JEK hub: the apps (JEKray and JEKion) and every bench kept in the cloud, of every app, with the account, plans,
billing and teams. Served as `jek/tools/jeksuite.html`, built from the sources here as JEKion is built.

- `node build.mjs` writes `../jeksuite.html`, `../jeksuite-dev.html` and `src/main.js` (commit them); `--check` says
  whether they are current. The modules in `order.json` are joined into one scope, with JEKray's lint: unique
  top-level names, imports from where a name is declared, nothing run at load but `ui/boot.js`.
- Shared from JEKray, as they are: `core/constants.js`, `core/hooks.js`, `core/src-tag.js`, `ui/dom.js` (`h`),
  `io/merge.js` (comparing and merging versions), `io/usage.js` (usage counts, the visit counted as `open` `space`)
  and `io/account.js`, the account all the apps share (sign-in, plans, billing, the account dialog, teams, a
  university's licence, deleting the account), whose hooks are installed in `src/ui/boot.js`: the hub's name and
  toasts, its pop-up account menu made as it opens (`openAccountMenu` in `src/ui/home.js`, with the theme in it).
  The page's style is JEKray's `style.css` and then `style.css` here.
- `src/ui/dom.js`: elements, icons, menus, the theme (JEKray's `jekray-theme`), and `APPS`, the apps it lists and
  opens, each in its own named tab (`jekray`, `jekion`).
  `src/ui/home.js`: the benches, from what was JEKray's My benches page (folders, history, compare, merge, fork,
  copy, move, rename, bin, My parts, My links), New (what can be started: a JEKray or JEKion bench, or one of JEKray's designers), the
  apps under the sign-in panel when signed out, and each app's launch page (`#app=<id>`, `showApp`: the app's
  description and starts, its benches alone through the same `fillHome` path, the bench picked shown in `#appPreview`).
  The file system: the rail has the workspace's folders as a tree (open folders kept in `jek-home-view`), a list has
  a chip for each app with benches in it (`cloudPlace.only`, for the visit), cards or a table whose headings sort it,
  benches and folders picked together (`picked`, `pickedF`: ticks, Ctrl and Shift, a bar to move, copy or bin them;
  a binned bench has an Undo in its note, `toast`'s action), the arrow keys from card to card (`arrowTo`), benches and folders
  dragged onto a folder (its card, the tree, the breadcrumbs) or the bin (`dragFrom`, `dropOn`), and names typed in
  place (`nameInput`: F2, the menu's Rename, New folder, a part) or asked for in a dialog (`askName`: a fork, a copy;
  never the browser's `prompt`). The chip pressed is kept in `jek-home-view` (`only`). On an app's page a click opens the bench; the one shown
  beside the list follows the pointer and the keyboard, and a folder with none of the app's benches is hidden
  (`decorate`, once every bench of the workspace is read). The bar's `#homeTheme` turns the page dark or light.
  `src/core/files.js`: the arithmetic of that with no page in it (the tree, what a folder holds, where a folder may
  go, the orders, a Shift-click's run), checked by `test/node/files.test.mjs`.
  The apps' colours (`--app`, `--app-on`, `--app-ink` in `style.css`) are JEKsuite's alone.
- What it sends the apps: `#cloud=<id>` (and `@<version>` for a copy of one; `:lens`, `:rf`, `:coat` into one of
  JEKray's designers), `#new` (and `#new=lens|rf|coat`) when there is nowhere in the cloud to make the bench, and
  JEKray's `#s=<id>` for a share link. The apps' My benches open this page in the tab named `jeksuite`; JEKray's
  Manage My parts opens it at `#parts`.
- Tests: `node test/run.mjs` (the build and lint, `test/node/`, then `test/browser.mjs` in Playwright against the
  stand-in API in `test/fake-api.mjs`); `--shots <folder>` keeps pictures of the page signed in.
