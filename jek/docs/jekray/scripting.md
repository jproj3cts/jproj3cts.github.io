---
layout: docs
title: Scripting and headless use
permalink: /jek/docs/jekray/scripting/
description: "Drive JEKray from a script: the Scripts editor on the bench (JEKrayPro), in JavaScript or Python, the window.JEKray object in the page, the same engine in Node without a browser, and a command line that traces a bench file and prints its readouts or sweeps a parameter to a table."
---

<p class="dx-lead">Everything the bench works out can be asked for from a script: on the bench, in the <strong>Scripts</strong> editor (JEKrayPro), in JavaScript or Python; in the page, through the <code>JEKray</code> object the tool puts on <code>window</code>; outside it, through the same engine running in Node, with no browser; and from the command line, which traces a bench file and prints what its panels would show. A design can sit in a repository with a check that runs it, and a parameter study can be a loop.</p>

## On the bench: Scripts

**File › Scripts…** opens an editor beside the bench, part of JEKrayPro. A script is JavaScript or [Python](#python), chosen for each script in the menu beside its name, given `J`, the bench, and `log()`. Choose **Run** (or Ctrl+Enter): the `log()` lines appear below as the script writes them, then what the script returned: rows (an array of objects) as a table, anything else as JSON. **Save as** under it keeps a table, an array or an object of named ones as CSV, JSON, Excel, NumPy or MATLAB; `save()` keeps whatever the script makes as a file of its own ([Saving files](#saving-files)). What the script changed is applied to the bench when it ends, as one step, so one **Undo** puts it back. Scripts are kept in this browser by name, each with its language; **Save as a file** and **Open a file…** move them as `.js` or `.py` files, and **Start from an example…** gives four to begin with, in either language: read a screen, sweep a part to a table, check a figure, list every part.

`J` has the calls in the table below, taking parts by name, and these besides:

| Call | What it does |
|---|---|
| `J.elements()` | Every part: name, type, x, y, angle. |
| `J.element(name)` | A part's settings, as a copy. |
| `J.get(name, path)`, `J.set(name, path, value)` | A parameter read, or set and the bench traced again. |
| `J.range(a, b, n)` | n values from a to b. |
| `J.sweep(name, path, values, read)` | Each value set, `read(value)` called, and the parameter put back: rows of the value and what was read. |
| `J.csv(rows)` | Rows as CSV text. |
| `save(name, data, format, meta)` (also `J.save`) | A file made of `data` when the run ends: [Saving files](#saving-files). |

A script to read the spot as a lens moves, as a table:

```js
const x0 = J.get('Lens', 'x');
return J.sweep('Lens', 'x', J.range(x0 - 20, x0 + 20, 21), () => ({ rms: J.stats('Screen').rms }));
```

### Saving files

`save(name, data, format='csv', meta=null)` keeps what a script makes as a file: it is downloaded **when the run ends**, named `name` with the format's extension, and the output says what was saved. A run that is **stopped saves nothing**; one that fails saves what it asked for before it failed. The format is one of `'csv'`, `'json'`, `'xlsx'`, `'npz'` or `'mat'`, laid out as [File › Export data](/jek/docs/jekray/data-export/#how-each-format-is-laid-out) lays them out, and `data` can be

- rows, a list of objects (`[{ x: 1, rms: 0.2 }, …]`): a table, one column for each key;
- an object of equal-length lists (`{ x: xs, rms: rms }`): a table;
- a list of numbers, nested to any depth but rectangular (`[[1, 2], [3, 4]]`), a typed array (`Float64Array`, `Int32Array`), or in Python a NumPy array: an array, in its shape and type;
- an object of named things, each one of those (`{ spot: rows, field: grid }`): one file with a sheet, variable or entry for each name (as CSV, a zip of CSV files);
- anything else: a value, kept as JSON (in a `.mat`, as structs and cells).

A single table or array saved as CSV is a plain `.csv` file; everything else as CSV is a zip of them with `README.txt`. Every file carries its context (the script's name, the bench, the JEKray version and the date), with your own fields from `meta` beside it (`{ run: 3, operator: 'AB' }`). What `data` holds is kept as it is when `save()` is called. A run saves 20 files at most; more than five come down as one zip.

```js
const rows = J.sweep('Lens', 'x', J.range(80, 120, 41), () => ({ rms: J.stats('Screen').rms }));
save('focus', rows);                                   // focus.csv
save('focus', rows, 'mat', { lens: 'LA1509' });        // focus.mat: S = load('focus.mat'); plot(S.focus.x, S.focus.rms)
```

```python
import numpy as np
xs = np.linspace(80, 120, 41)
rms = np.array([J.set('Lens', 'x', x).stats('Screen')['rms'] for x in xs])
save('focus', {'x': xs, 'rms': rms}, 'npz')            # numpy.load('focus.npz')['focus/rms']
save('grid', np.outer(xs, rms), format='xlsx')         # a 41 x 41 sheet
```

### In the background, and Stop

A script runs **in the background**, in a worker of its own beside the page, on **a copy of your bench**: the page carries on while it runs (the bench can be looked at, the window moved), and a long loop holds up nothing. While it runs, **Run** becomes **Stop**, with the time it has been running beside it, and its `log()` and `print()` lines come as they are written. **Stop** ends it at once, in either language, a loop that never ends included: the output says *Stopped after … s*, and **nothing the script did is applied**, so the bench is as it was before Run.

**When it ends** (it returns, or it fails), what it changed on its copy is applied to the bench as **one step**: the parts it set with `J.set`, or the bench it opened with `J.load`; one **Undo** puts all of it back, and the output says so. A sweep (`J.sweep`) puts its parameter back, so it changes nothing and there is nothing to undo. Your view, the tab you are on and the selection stay as they were, unless the script asked for them: `J.showTab(name)` and `J.select(name, tab)` are done on the page when the script ends (on the copy, `J.showTab` changes the tab the script reads straight away), and `J.sweepPause()` pauses the sweeps playing on the page then. If you change the bench yourself while a script runs, what the script changed is not applied (the output says so: run it again).

The answers are the page's own: the copy is traced by the same code, and the calls are the ones `window.JEKray` has. A detector or screen whose diffracted field the page would still be working out in the background (`pending` in a reading on the page) is worked out to the end in the script's copy, so a script never reads a field that is not ready.

**Calls that need the page.** `J.sweepPlay(name, path)` plays a sweep on the bench you are looking at, which a script in the background cannot do: it stops the script with *sweepPlay runs on the page: …*. So does a script that reaches past `J` for the page itself (`window`, `document`). The output then offers **Run on the page (no Stop)**: the script runs on the page's own thread, as typing it into the browser's console would, with the page's own `window.JEKray`, the bench checkpointed first so Undo puts back what it changed. There it cannot be stopped, and a long loop holds the page until it ends, so try a sweep with a few values before a thousand. Where a browser cannot start the worker, scripts run on the page this way.

A script runs in this browser, on your own bench. It is not a module: nothing in it is shared, carried with the bench or run for anyone else.

### Python

Choose **Python** in the menu beside the script's name (a new script starts in the language you last chose; one kept from before there was a choice is JavaScript), or start from one of the Python examples. Python is [Pyodide](https://pyodide.org/), CPython 3.14 built for WebAssembly, running in this browser. It is fetched from this site the first time a Python script runs, 13.5 MB once, with its progress shown below the editor; after that it comes from the browser's cache, and starts in a second or two each time the page is opened. It runs in the script's worker, so Stop ends a Python loop as it does a JavaScript one; it stays loaded there between runs, and after a Stop it starts again (a couple of seconds, from the cache). Nothing leaves the browser.

`J` has the same calls as in JavaScript, with Python's shapes: what comes back is dicts, lists, numbers, strings and `None`, and what you pass in (numbers, lists, dicts, NumPy arrays and numbers) is taken as the plain values the bench expects.

```python
S = J.stats('Screen')                      # a dict: S['rms'], S['powerPct'], …
J.set('Lens', 'x', 120).stats('Screen')    # set returns J, as in JavaScript
x0 = J.get('Lens', 'x')
rows = J.sweep('Lens', 'x', J.range(x0 - 20, x0 + 20, 21), lambda x: {'rms': J.stats('Screen')['rms']})
```

`J.sweep(name, path, values, read)` takes any Python function (a `def` or a `lambda`) for `read`, called with each value; it puts the parameter back afterwards, also when `read` raises. `log(*values)` writes a line below, numbers to six figures as JavaScript's `log()` does, and `print()` writes there too. A bench call that fails (a part that is not there, say) raises `BenchError` with the bench's message.

**What is shown.** Python has no top-level `return`, so a Python script shows what it sets **`result`** to; if it sets none, the value of its last line, when that line is an expression and not `None`, as a notebook cell shows it. So `J.elements()` as a last line shows every part, and `result = rows` shows the sweep. Rows (a list of dicts) are a table with **Save as**, and so is a dict of lists of equal length, one column each (`{'x': xs, 'rms': rms}`); NumPy arrays are shown as lists; anything else as JSON. `save(name, data, format='csv', meta=None)` is there as in JavaScript ([Saving files](#saving-files)), and takes NumPy arrays as they are: their shape and type (int64, float64, bool) reach the file.

```python
import numpy as np

x = np.linspace(100, 140, 41)
rms = []
for v in x:
    J.set('Lens', 'x', v)
    rms.append(J.stats('Screen')['rms'])
result = {'x': x, 'rms': rms}      # a table of two columns
```

**Errors** show Python's traceback, cut to the lines of your script (the bench's own Python is left out), with the line that failed:

```
Traceback (most recent call last):
  File "<script>", line 3, in <module>
    x0 = J.get('Lens 2', 'x')
BenchError: No part is called "Lens 2"
```

**Each run starts afresh**: the names a script makes are gone when it ends, so nothing from one run is seen by the next (a module it imported stays imported, which only saves time). What a run changed is applied when it ends, as for JavaScript, so one **Undo** puts it back.

**NumPy** is there: `import numpy` fetches it from this site the first time a script imports it (3.0 MB, once). Beyond NumPy, **only Python's standard library** is available (math, statistics, json, csv, re, itertools, fractions, datetime and the rest; not tkinter or turtle): an import of anything else stops with *No module named …: only the standard library and NumPy are available on the bench*. There are no threads or subprocesses, no files but the script's own memory, and `input()` reads nothing. `J.sweepPlay` needs the page: run the script on the page (no Stop) to use it, and there `await J.sweepPlay('Lens', 'x')` waits for a sweep's play, the one call that takes time.

A Python script is checked against the same JEKrayPro plan as a JavaScript one, and is as much your own code in your own browser: through Pyodide's `js` module it can reach what a JavaScript one can (the worker, or the page when it is run there).

## In the page

The page exposes `window.JEKray` (the old name `JEKray2D` still works). Its functions take parts by **name**, as the panels show them, and return plain numbers and objects: what the panel would show, without the words. They hand back data rather than downloading files, so the free account the page's own exports ask for is not asked for here; nor does anything in Node below need an account. The stable set:

| Call | What it does |
|---|---|
| `JEKray.load(data)` | Opens a bench from its data (the object a `.jekray` file holds). |
| `JEKray.serialize()` | The bench as a `.jekray` object. |
| `JEKray.trace()` | Traces it now (loading and changing a part trace on their own; this forces one). |
| `JEKray.select(name)` | Selects a part, so its panel is open. |
| `JEKray.stats(name)` | A screen's spot: count, centroid, rms, full width, power (see below: not mW). |
| `JEKray.detector(name)` | A photodetector's or receiving horn's reading: mW, volts, SNR. |
| `JEKray.spectrometer(name)` | A spectrometer's reading: the peak and its width (nm), the resolution, the power through its entrance, counts, saturation, SNR and the lines that get in. |
| `JEKray.lensAntenna(name)` | An RF lens, disc or mirror on its axis as an antenna: gain, beamwidth, sidelobe, efficiencies. |
| `JEKray.rfSweep(name)`, `JEKray.linkBudget(name)` | A receiving horn against frequency, and its link budget. |
| `JEKray.arrivals(name)` | The Gaussian beams arriving at a part's face: each beam's q, direction, polarisation and path. |
| `JEKray.asmPrescription(name)`, `JEKray.asmEfl(name)` | An assembly as the lens designer reads it, and its focal length. |
| `JEKray.step(bytes, name, x, y, { as })` | A STEP file (its bytes) brought in as STL objects at x, y, as the import does: `as: 'parts'` (one each, grouped; the default) or `'one'`. Resolves with their names, the bodies, triangles and units. |
| `JEKray.exportZmx(names)` | Parts as a lens file. |
| `JEKray.sweepPlay(name, path)`, `JEKray.sweepPause()` | A sweep played and paused. |
| `JEKray.typeLabel(name)`, `JEKray.benches()`, `JEKray.showTab(name)` | What a part is called, the bench tabs, and switching between them. |

A screen's `power` (from `JEKray.stats`, the headless `screen()` and the command line's `screen`) is the sum of the weights of the rays that reach it, not milliwatts: each ray leaves its source with weight 1 (an unpolarised one as two halves of ½), a fan for each of the source's wavelengths, so it counts rays as much as light and changes with a source's number of rays and lines. `powerPct` beside it is that sum as a percentage of what the sources reaching the screen send out, so `powerPct / 100` times those sources' power is the mW in the rays. For a reading in mW, put a photodetector there and read it with `detector`: it takes Gaussian beams by their fields and ray fans by each ray's share of its source's power.

Parameters have **paths**, the same the panels and sweeps use: `x`, `angle`, `surfaces.0.R`, `gaps.0`, `mmw.ghz`, `grin.f`. The parts' fields are listed under each part in [Parts](/jek/docs/jekray/params.json) and in the [AI guide](/jek/tools/jekray-ai-guide.md).

The rest of `window.JEKray` is the test suite's: it works, and may change between versions. The calls above will not change without a note in What's new.

## Headless, in Node

The engine runs in Node as it is, with no browser. This is for your own computer or a build server, not the website: with the JEKray program files alongside (the same files that make the page, laid out as `jek/tools/jekray/`), `headless.mjs` opens a bench and gives it the same calls. It needs Node 20 or later and nothing installed, and no account: it runs on your own computer. The paths below are relative to the folder holding `jek/`.

```js
import { openFile } from './jek/tools/jekray/headless.mjs';

const B = await openFile('my-bench.jekray');
B.trace();                                   // { rays, rayPower, beams, dropped, absorbed }
B.screen('Sensor');                          // the spot on a screen (power: the rays' weights, not mW)
B.detector('PD');                            // a photodetector's reading
B.spectrometer('Spectrometer');              // a spectrometer's peak, width, counts and SNR
B.antenna('GRIN lens');                      // an RF lens as an antenna
B.paraxial('Lens', 633);                     // { efl, bfl }
B.set('Lens', 'x', 120).screen('Sensor');    // move a part, read again
B.rf('RF', 24);                              // the RF designer's figures for an assembly at 24 GHz
B.sweep('Horn', 'mmw.ghz', [22, 24, 26], b => ({ G: b.antenna('GRIN lens').Gdbi }));

// the lens designer, on an assembly
B.assemblies();                              // [{ name, kind, parts }]
B.lens('Cooke triplet');                     // { efl, bfl, epd, fNumber, na, fields, waves }
B.prescription('Cooke triplet');             // surfaces, gaps, materials, the stop
B.spot('Cooke triplet', 14);                 // the spot at 14°: rms, largest radius, the Airy radius
B.wavefront('Cooke triplet', 14);            // rms and peak-to-valley in waves, the first Zernike terms
B.mtf('Cooke triplet', 0, [20, 50]);         // tangential and sagittal MTF at 20 and 50 cycles/mm
B.fieldCurves('Cooke triplet');              // field curvature and distortion across the field
B.relIllum('Cooke triplet');                 // relative illumination and vignetting
B.merit('Cooke triplet');                    // the optimiser's merit function
B.zmx(['L1', 'L2', 'L3']).text;              // parts as a lens file
B.arrivals('Sensor');                        // the Gaussian beams arriving at a face
await B.step('mount.step', null, 0, 0, { as: 'parts' });   // a STEP file's solids as STL objects (OpenCascade, as on the page)
```

The data File › Export data writes is there too: `B.data(['readouts', 'screens', 'beams', 'sweeps', 'bench'])` gives its tables and arrays (each column with its unit), and `await B.exportData(kinds, 'npz')` the bytes of the file, in any of the five formats (`fs.writeFileSync('bench.npz', …)`); given rows, arrays or an object of named ones in place of the kinds, it writes those, as `save()` does. The plots are the page's own, so they are not here. See [Exporting data](/jek/docs/jekray/data-export/).

`openBench(data)` takes the bench's data instead of a file. `set` traces again on the next read; `sweep` sets each value, reads, and puts the parameter back. Every number is what the panel shows, rounded to six figures.

## The command line

`cli.mjs` wraps the same calls, printing JSON (or CSV for a sweep):

```sh
node jek/tools/jekray/cli.mjs trace bench.jekray
node jek/tools/jekray/cli.mjs screen bench.jekray "Sensor"
node jek/tools/jekray/cli.mjs antenna bench.jekray "GRIN lens"
node jek/tools/jekray/cli.mjs rf bench.jekray "RF" --ghz 24
node jek/tools/jekray/cli.mjs sweep bench.jekray "Horn" mmw.ghz 20:28:9 --read "antenna:GRIN lens" --csv
```

The commands: `trace`, `elements`, `screen`, `detector`, `spectrometer`, `antenna`, `paraxial` (`--nm`), `cavities`, `arrivals`; for an assembly, `assemblies`, `prescription`, `lens`, `spot` and `wavefront` (`--deg`), `mtf` (`--deg`, `--freq` once per frequency), `fieldcurves`, `relillum`, `merit` and `zmx` (parts' names, `--nm`; the lens file on standard output); for RF, `rf` (`--ghz`), `rfband`, `rfsweep`, `linkbudget`; and `sweep`. A sweep takes a part, a parameter path and values (`a:b:n` for n values from a to b, or `a,b,c`), and one or more `--read kind:Name` (screen, detector, spectrometer, antenna, paraxial, rf, lens, spot, wavefront, mtf, merit, or `trace`) for what to record at each value.

```sh
node jek/tools/jekray/cli.mjs sweep bench.jekray "L2" x 24:26:21 --read "spot:Cooke triplet" --deg 14 --csv
```

## Examples

**A design checked in a repository.** Keep the bench file next to the code and have the check compare a figure against what was agreed:

```sh
node jek/tools/jekray/cli.mjs antenna antenna.jekray "GRIN lens" | node -e '
  const A = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (A.Gdbi < 25) { console.error("gain fell to " + A.Gdbi.toFixed(2) + " dBi"); process.exit(1); }'
```

**A parameter study.** A lens moved along the bench, the spot read at each place, as CSV for a plot:

```sh
node jek/tools/jekray/cli.mjs sweep bench.jekray "Lens" x 80:120:41 --read "screen:Sensor" --csv > focus.csv
```

**The tool's own tests** run this way: `node --test test/node/*.test.mjs` in `jek/tools/jekray` traces every example bench and holds it against a snapshot.

## What is not here

The diffracted field's pictures, the 3D view and the drawings need the page; the numbers they come from (a screen's spot, an antenna's pattern cut, a lens's spot diagram) do not. Modules (parts whose behaviour is code) run in the page's sandbox only, so a bench with a module's part traces headless without it.
