# Running the tests

Two suites cover the tool: the Node tests in `test/node/*.test.mjs` (the engines and the designers, headless) and the
browser suite in `../jekray-tests.html` (the built page in a real browser, about 670 checks in some 55 groups). The
whole of both takes a quarter of an hour, so `test/run.mjs` runs the part that covers a change:

    node test/run.mjs                      what changed since the last commit (the working tree), by area
    node test/run.mjs --changed main       what changed since a branch, tag or commit
    node test/run.mjs --areas bench,field  named areas (below)
    node test/run.mjs --full               everything
    node test/run.mjs --list --dry         the areas, and the plan for the change, without running
    --no-browser   Node tests only            --dry   plan only           --port N   serve the repository on this port

It builds the page first, runs the Node tests it chose, then serves the repository itself and runs the chosen groups of
the browser suite in Playwright (installed globally or in this folder). The same scripts are in `package.json`:
`npm run test:changed`, `test:areas -- bench`, `test:full`, `test:list`.

**Every fifth smaller run is a full one.** The count of smaller runs since the last full one is kept in `test/.runs.json`
(not committed); when it reaches four, the next run is made a full run whatever was asked, and `--full` resets it. A
change to a shared file (the data model, the project, the page boot, the registry, the tests page, these runner files) or
to a file no area claims always runs everything. A test file changed itself is run as it is.

## The areas

`test/areas.mjs` is the map: each area names source files (by exact path or prefix, relative to this folder), the Node
test files that exercise them and the browser groups that do. A source file may be in several areas. The groups are
named exactly as the suite's `{ group }` rows, and `?groups=A|B` on the tests page runs just those (as `?only=text`
runs the checks whose names hold a text).

| Area | Code | Node tests | Browser groups |
|---|---|---|---|
| build | the build, the worker entry, the page shell, the built pages | build | — |
| bench | the tracer and the parts: geometry, coatings, glasses, parts and their panels, the 2D view | engines, demos, parts, numeric, face-pol, coatdesign, zoned, grin | the optics groups from Materials to Heights, Surfaces: holes, stacks and mirror coatings |
| field | the diffracted field, the close-up, vector focusing, coherence, the 3D field volume | demos | the field groups: propagation, screens, interference, slits, polarisation, high NA, coherence, dipole traps, the field in 3D |
| cavity | cavities and lasers that settle | ghost-cavity, demos | the three Cavities groups, Lasers that settle |
| fibre | fibre networks and parts, electronics, modulators, pulses, vapour cells, crystals | demos | fibres and detectors, Fibre networks, Fibre extras, Modulators, Sources split, Short pulses, Atomic vapour cells, Nonlinear crystals |
| io | files, links, lens files, CAD, merging, packs, modules, the AI guide | headless, merge, zmx-cb, cad-export, lens-stock | Import, files and tools; Projects written elsewhere; Share links; Tabs and link planes; Part packs; Modules |
| view3d | the 3D view, STL objects | zoned | The 3D view, STL objects, The field in 3D |
| lens-design | the Optical designer: assemblies, the sequential engine, analyses, optimiser, tolerancing, drawings | the lens-* tests, assembly, cad-export, zmx-cb | The Optical designer (two groups), Surfaces: holes, stacks and mirror coatings; Import, files and tools |
| rf | RF parts, antennas, graded and zoned lenses, the RF designer | rf-*, antenna, grin, zoned | RF: millimetre-wave quasi-optics; RF parts on the bench; The RF designer (two groups) |
| scripts | scripts run against the bench | — | Scripts |
| site | the documentation pages and their data | site-pages | Projects written elsewhere, and the AI guide |
| shared | the data model, the project, the page boot, the registry, constants, hooks, the tests page, this runner | all | all |

## Where the time goes

A full run took about 15 minutes before one test was mended: the check that every palette button makes its part
added all 150-odd parts to one bench, retracing the lot at each add, and took 7½ minutes by itself; on a fresh bench
per part it takes seconds. The designers' tests are the next cost (the Optical designer's groups about 3 minutes, the RF
designer's about 1½), then the Node tests at about a minute (the headless test, which starts the command line several
times, is 25 seconds of that). Everything else is small change, so a change outside the designers runs its browser groups
in a minute or two.

When a feature's tests land, put its browser group and its Node test file in the area it belongs to, and claim any new
source file; the runner says `no area claims <file>` and runs everything when one is missed.
