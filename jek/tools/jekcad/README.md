# JEKcad source

JEKcad, the JEK Part Studio (parametric CAD), is served as one page, `jek/tools/jekcad.html`, built from what is here
and committed alongside it, as JEKion and JEKfilm are. `order.json` lists each module by its path from `src/`:
JEKcad's own, or one of JEKray's as it is (`../../jekray/src/core/hooks.js`). `build.mjs` lends JEKray's parser and
lint: every top-level name unique, imports from where a name is declared, nothing run at load (`ui/boot.js` apart),
and the layers (`core`, `engines` and the worker never import from `ui`, `io` or `page`).

The geometry kernel is OpenCascade, the vendored `replicad-opencascadejs` 1.2.1 build
(`jek/assets/vendor/replicad-opencascadejs/1.2.1/`, LGPL-2.1, 22.9 MB of wasm, 7.2 MB gzipped; its README says why
this build). It is loaded on first use, from the site, in the kernel worker: the page's own script run in a worker
behind JEKray's shim (`page/kernel.js`), or on the dev page the modules as a module worker (`src/worker/entry.js`).

- `src/core/`: numbers with units and expressions, and the Variables table (`units.js`); the sketch solver, copied
  from JEKray's old Model mode and owned here (`sketch.js`: constraints, dimensions, Levenberg–Marquardt solve,
  fully-defined analysis, regions); the letters of a sketch's text (`font-data.js`: Source Sans 3 Semibold's outlines, made from `jek/assets/fonts/` by fontTools with overlaps removed, OFL 1.1); the sketch tools (`sketch-tools.js`: outlines, regions for features, trim,
  fillet, offset, mirror, rectangles, slots, polygons, arcs); the document (`doc.js`: the .jekcad format, every
  feature's fields and defaults in `FEATURE_KINDS`, `normDoc` so old files load, `prepareDoc` which evaluates
  dimensions and re-solves sketches, reordering rules, materials).
- `src/engines/kernel.js`: `makeKernel(oc)`, the feature list regenerated on OpenCascade. Each feature runs in its
  own try, so a failure is reported on it and the rest carry on; states are cached by the list up to each feature.
  Faces carry names given by the feature that made them and carried by OCCT's history (Modified, Generated,
  IsDeleted); refs are a face's names and a point on it, or an edge's two faces and its midpoint. A cut takes in the
  model's holes that lie in what it takes where the parts are empty there (`withEmptyHoles`), chosen or not: left
  out, its side lies on the hole's own wall and the two leave slivers. Also meshes with
  face and edge groups, measure, STEP and STL out, projecting edges into a sketch.
- `src/worker/main.js` the worker's side; `src/page/kernel.js` the page's client (the last regeneration wins).
- `src/ui/`: state, undo, menus and icons (`app.js`); the three.js view, picking, view cube, modes and section
  (`view3d.js`); the sketcher and the overlay of planes and sketches (`sketcher.js`); the feature dialogs and the
  Variables table (`dialog.js`); the feature list, rollback bar, parts list and measure box (`panel.js`); the pointer
  and keys (`pointer.js`); `news.js`; `boot.js`, which also sets `window.JEKcad` for the tests.
  The sketcher infers from the model too (`modelGeom`, `refEnt` in `sketcher.js`): a point snapped to an edge brings
  the edge in as a fixed construction shape with `src`, the kernel's ref for the edge; `followRefs` in the kernel
  finds each such edge again on every regeneration, moves the shape, solves the sketch and sends it back
  (`info.ents`), and `regenNow` writes it into the document. Chosen regions follow their shapes (`carryPt`,
  `carryRegions` in `core/sketch-tools.js`). Dimensions drawn on the model, and typed there, are `modelDims` and
  `modelDimEdit`; fly mode is `flyStart` in `view3d.js` (a perspective camera of its own).
- `src/io/`: files and autosave, STEP import, exports (`files.js`); the account's hooks (`cad-account.js`: the
  account itself is JEKray's `io/account.js`, shared); cloud part studios (`cloud.js`, as JEKion's).

Shared from JEKray: `core/constants.js`, `core/hooks.js`, `core/src-tag.js`, `worker/shim.js`, `ui/pro.js`,
`ui/dom.js`, `io/usage.js`, `io/account.js`.

Gates (as JEKion's): modelling, .jekcad files and STEP import need nothing; STEP and STL exports need a free account
(`accountGate`); the cloud needs JEKrayPro (`designPro`). A cloud document's tool is `jekcad` (the API reads it from
the content's `format`).

## Working on it

```
node build.mjs            # writes ../jekcad.html, ../jekcad-dev.html, src/main.js, src/worker-main.js
node build.mjs --check    # says whether the page is current
node --test test/node/*.test.mjs    # the solver, the model, and the kernel on the vendored OpenCascade in Node
node test/run.mjs         # the build, the Node tests and the browser suite (test/browser.mjs) in Playwright
node test/run.mjs --shots <folder>  # and keep pictures of the steps
```

The example is `jek/tools/demos/lens-mount-plate.jekcad`; the documentation `jek/docs/jekcad/` with its contents in
`_data/jekcad_docs.yml`; the product page `jek/products/design-software/jekcad/`.
