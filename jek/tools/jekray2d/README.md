# JEKray2D source

The tool is served as one page, `jek/tools/jekray2d.html`. That page is built from what is here and committed alongside it.

- `page.html`: the markup, with `{{STYLE}}` and `{{SCRIPT}}` where the style and the script go.
- `style.css`: the page's style.
- `src/`: the script, as ES modules, in the order `order.json` gives:
  - `core/`: constants, glasses, materials physics, geometry, masks, STL meshes;
  - `state/`: the project, its elements and tabs;
  - `engines/`: ray tracing, the diffracted field, cavities, fibre, electronics, photonic circuits;
  - `ui/`: rendering, drawings, the pointer, panels, plots, sweeps, the 3D view, wiring;
  - `io/`: saving and opening, share links, .zmx, part packs, mods, the cloud, the AI guide;
  - `worker/`: the field worker.
- `jstok.mjs`: a small tokenizer the build's lint uses.
- `test/node/`: tests that run in Node, with no browser. The browser suite is `jek/tools/jekray2d-tests.html`.

## Working on it

Edit the modules, then build the page:

```
node build.mjs            # writes ../jekray2d.html
node build.mjs --check    # says whether the page is current
node --test test/node/*.test.mjs    # the Node tests (the first checks the page is current)
```

The build joins the modules into one script in one scope, as the page has always run: it drops each module's import lines and `export` keywords and changes nothing else. A module starts with its imports, then one blank line, then its code. Every name a module takes from another must be imported from the module that declares it; the build's lint refuses otherwise. The exceptions, for now, are the mutable bindings listed in `src/state/shared.md`, which the next stage moves into state objects.
