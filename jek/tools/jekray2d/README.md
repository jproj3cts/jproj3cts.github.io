# JEKray2D source

The tool is served as one page, `jek/tools/jekray2d.html`. That page is built from what is here and committed alongside it.

- `page.html`: the markup, with `{{STYLE}}` and `{{SCRIPT}}` where the style and the script go.
- `style.css`: the page's style.
- `src/`: the script, as ES modules, in the order `order.json` gives:
  - `core/`: constants, maths, formats, glasses, materials physics, geometry, masks, STL meshes, and `hooks.js`;
  - `state/`: the project, its elements, drawings, benches, parameters, installed packs;
  - `parts/`: one module per part type (`mirror.js`, `lens.js`, ...) and `registry.js`, which gathers them;
  - `engines/`: ray tracing, the diffracted field, cavities, fibre, electronics, photonic circuits, modules' results, screen figures, an RF receiver's frequency sweep and link budget;
  - `ui/`: rendering, drawings, the pointer, panels, readouts, plots, sweeps, tabs, the close-up, the 3D view, wiring, and `ui/parts/`, one module per part (how it is drawn, picked and edited) with its own `registry.js`;
  - `io/`: saving and opening, autosave, share links, .zmx, part packs, modules, the cloud, the AI guide;
  - `page/`: the page's workers (the field worker's client, the trace worker, the shim);
  - `worker/`: the field worker's side, and the dev page's worker entry.

The first five of those are layers. `core/`, `state/`, `parts/`, `engines/` and `worker/` know nothing of the page: they import nothing from `ui/`, `io/` or `page/`, and when an engine has something to tell the page (redraw, rebuild a panel, run a mod in its sandbox, ask the field worker) it calls `core/hooks.js`, whose entries do nothing until `ui/boot.js` installs the page's own. The lint refuses an import the other way. The electronics and the photonic circuits are split the same way: their signals and scattering in `engines/elec.js` and `engines/pic.js` (`ELEC`, `PIC`), their symbols, panels and instruments in `ui/elec.js` and `ui/pic.js` (`ELEC_UI`, `PIC_UI`).
- `vendor/`: acorn and acorn-walk (MIT), the parser the build's lint reads the modules with.
- `test/node/`: tests that run in Node, with no browser. The browser suite is `jek/tools/jekray2d-tests.html`.

## A part

`parts/<type>.js` says what a part is: its `label`; how the picker lists it (`picker`, and its place in the registry's `FREE_GROUPS`); the keys that make one (`keys`) and what a new one is (`make(x, y, kind)`); what a saved one is taken to be (`norm(e, base)`: every field checked and given its default, so a file from any version loads); its extent out of the bench plane (`zHalf`, `zSquare`); and what the AI guide says of it (`guide`). `registry.js` gathers them into `PARTS` (by type), `PART_BY_KEY` (by picker key), `TYPE_LABEL` and the free-space palette's tables, which `state/elements.js`, the picker, the rail, the trace and the guide read. Its page side is `ui/parts/<type>.js`: `draw(el, sel)` on the bench, `hit(el, lx, ly, tol)` for the pointer (and `rank`, which is picked first where parts overlap), `panel(el)` for its own sections of the panel; `ui/parts/registry.js` gathers those into `PART_UI`, which the renderer, the pointer and the panel read. To add a part: write `parts/<type>.js` and `ui/parts/<type>.js`, list both in `order.json` and their registries, and give it a group. How the light meets it (`engines/trace.js`) and its 3D model (`ui/view3d.js`) are still written by type there. The fibre components, the electronics and the photonic circuits are families: `fcomp.js`, `elec.js` and `pic.js` hand on to their own tables (`FC`, `ELEC`, `PIC`); `rf.js` is the RF palette, whose parts are ordinary ones marked as its own.

## Working on it

Edit the modules, then build the page:

```
node build.mjs            # writes ../jekray2d.html
node build.mjs --check    # says whether the page is current
node --test test/node/*.test.mjs    # the Node tests (the first checks the page is current)
```

`node build.mjs` also writes `src/main.js` (an entry importing every module in order), `src/worker-main.js` (the modules the worker runs) and `../jekray2d-dev.html`, which loads the modules directly instead of the built script. It runs the tool as the modules say it is; its workers are module workers started from `src/worker/entry.js`, where the built page's start from its own script. The browser suite runs against it with `jekray2d-tests.html?dev=1`.

`test/node/parts.test.mjs` makes every part the picker offers and checks that normalising it again changes nothing; `test/node/engines.test.mjs` traces the demo benches in Node and checks them against the browser's figures: the engines run with no page at all, the hooks left as no-ops.

A module declares; it does not act as it loads. Listeners, dialogs and anything else that touches the page go in the module's `wire…()` function, which `ui/boot.js` calls in the page's order once every module is loaded (the lint refuses a bare statement at a module's top level). A binding another module assigns is exported with a setter (`project` and `setProject`, `drag` and `setDrag`), since a module cannot assign another's binding.

The build joins the modules into one script in one scope, as the page has always run: it drops each module's import lines and `export` keywords and changes nothing else. A module starts with its imports, then one blank line, then its code. Every name a module takes from another must be imported from the module that declares it; the build's lint refuses otherwise.
