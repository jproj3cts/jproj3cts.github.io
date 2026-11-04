# JEKion source

JEKion, the charged-particle optics simulator, is served as one page, `jek/tools/jekion.html`, built from what is
here and committed alongside it. It is built the way JEKray is (`../jekray/README.md`), and shares JEKray's
modules where it can: `order.json` lists each module by its path from `src/`, JEKion's own (`core/units.js`) or
one of JEKray's as it is (`../../jekray/src/core/constants.js`). `build.mjs` lends JEKray's parser and lint, so the
same rules hold across both tools' modules that are here: every top-level name unique, imports from where a name is
declared, no code run at load (`ui/boot.js` apart), and the layers (`core`, `state`, `parts`, `engines` and the
`worker` never import from `ui`, `io` or `page`; the engines reach the page through JEKray's `core/hooks.js`).

- `page.html`, `style.css`: the markup, and what JEKion adds to JEKray's `style.css` (both are inlined).
- `src/core/`: units and constants (`units.js`), the electrode shapes (`geom.js`: inside tests, sections, triangles),
  the grid (`grid.js`), painting shapes and CAD bodies into it (`voxel.js`), the mesh codec and STL reader
  (`mesh.js`), the colour map.
- `src/state/`: the project, selection and undo history; `elements.js` normalises a file and writes one.
- `src/parts/`: what an electrode of each shape, an ion group and a detector are (fields, defaults, guide text).
- `src/engines/`: the multigrid Laplace solver (`solve.js`), the fields from the solved arrays (`fields.js`), the
  tracer (`fly.js`), the trap analysis (`trap.js`), a project's solved array (`session.js`), the data gathered for
  export (`data.js`), and the jobs the page asks for (`jobs.js`), which run in the worker or on the page.
- `src/worker/`, `src/page/`: the worker's side and the page's client of it.
- `src/ui/`: the panel framework, the 2D view, the pointer, the actions and menus, the simulation controller
  (`sim.js`), the panels, plots, the Add menu, the 3D view, scripts, news and examples, and `boot.js`.
- `src/io/`: files and autosave, CAD import (JEKray's STEP reader), the account (JEKray's API) and data export.

Shared from JEKray: `core/constants.js`, `core/hooks.js`, `core/numeric.js`, `core/datafiles.js`,
`core/src-tag.js`, `core/step.js`, `worker/shim.js`, `ui/pro.js`, `io/usage.js`, `io/step-reader.js`.

## Working on it

```
node build.mjs            # writes ../jekion.html, ../jekion-dev.html, src/main.js, src/worker-main.js
node build.mjs --check    # says whether the page is current
node --test test/node/*.test.mjs    # the Node tests (the solver and tracer against closed forms, the files)
node test/run.mjs         # the build, the Node tests and the browser suite (../jekion-tests.html) in Playwright
```

The examples are `jek/tools/demos/*.jekion`; the documentation `jek/docs/jekion/` with its contents in
`_data/jekion_docs.yml`; the product page `jek/products/design-software/jekion/`.
