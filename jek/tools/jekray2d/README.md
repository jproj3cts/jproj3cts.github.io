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

`node build.mjs` also writes `src/main.js` (an entry importing every module in order) and `../jekray2d-dev.html`, which loads the modules directly instead of the built script. It runs the tool as the modules say it is, with the field worked out on the page (the workers start from the built page's script, so they are off there). The browser suite runs against it with `jekray2d-tests.html?dev=1`.

A module declares; it does not act as it loads. Listeners, dialogs and anything else that touches the page go in the module's `wire…()` function, which `ui/boot.js` calls in the page's order once every module is loaded (the lint refuses a bare statement at a module's top level). A binding another module assigns is exported with a setter (`project` and `setProject`, `drag` and `setDrag`), since a module cannot assign another's binding.

The build joins the modules into one script in one scope, as the page has always run: it drops each module's import lines and `export` keywords and changes nothing else. A module starts with its imports, then one blank line, then its code. Every name a module takes from another must be imported from the module that declares it; the build's lint refuses otherwise.
