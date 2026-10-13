# JEKray2D source

The tool is served as one page, `jek/tools/jekray2d.html`. That page is built from what is here and committed alongside it.

- `page.html`: the markup, with `{{STYLE}}` and `{{SCRIPT}}` where the style and the script go.
- `style.css`: the page's style.
- `src/`: the script, as ES modules, in the order `order.json` gives:
  - `core/`: constants, maths, formats, glasses, materials physics, geometry, masks, STL meshes, and `hooks.js`;
  - `state/`: the project, its elements, drawings, benches, parameters, installed packs;
  - `engines/`: ray tracing, the diffracted field, cavities, fibre, electronics, photonic circuits, mods' results, screen figures;
  - `ui/`: rendering, drawings, the pointer, panels, readouts, plots, sweeps, tabs, the close-up, the 3D view, wiring;
  - `io/`: saving and opening, autosave, share links, .zmx, part packs, mods, the cloud, the AI guide;
  - `page/`: the page's workers (the field worker's client, the trace worker, the shim);
  - `worker/`: the field worker's side, and the dev page's worker entry.

The first four of those are layers. `core/`, `state/`, `engines/` and `worker/` know nothing of the page: they import nothing from `ui/`, `io/` or `page/`, and when an engine has something to tell the page (redraw, rebuild a panel, run a mod in its sandbox, ask the field worker) it calls `core/hooks.js`, whose entries do nothing until `ui/boot.js` installs the page's own. The lint refuses an import the other way. Two modules are still allowed through, `engines/elec.js` and `engines/pic.js`, whose panels and drawings live in the same closure as their maths; stage 5 of the split takes those out.
- `vendor/`: acorn and acorn-walk (MIT), the parser the build's lint reads the modules with.
- `test/node/`: tests that run in Node, with no browser. The browser suite is `jek/tools/jekray2d-tests.html`.

## Working on it

Edit the modules, then build the page:

```
node build.mjs            # writes ../jekray2d.html
node build.mjs --check    # says whether the page is current
node --test test/node/*.test.mjs    # the Node tests (the first checks the page is current)
```

`node build.mjs` also writes `src/main.js` (an entry importing every module in order), `src/worker-main.js` (the modules the worker runs) and `../jekray2d-dev.html`, which loads the modules directly instead of the built script. It runs the tool as the modules say it is; its workers are module workers started from `src/worker/entry.js`, where the built page's start from its own script. The browser suite runs against it with `jekray2d-tests.html?dev=1`.

`test/node/engines.test.mjs` traces the demo benches in Node and checks them against the browser's figures: the engines run with no page at all, the hooks left as no-ops.

A module declares; it does not act as it loads. Listeners, dialogs and anything else that touches the page go in the module's `wire…()` function, which `ui/boot.js` calls in the page's order once every module is loaded (the lint refuses a bare statement at a module's top level). A binding another module assigns is exported with a setter (`project` and `setProject`, `drag` and `setDrag`), since a module cannot assign another's binding.

The build joins the modules into one script in one scope, as the page has always run: it drops each module's import lines and `export` keywords and changes nothing else. A module starts with its imports, then one blank line, then its code. Every name a module takes from another must be imported from the module that declares it; the build's lint refuses otherwise.
