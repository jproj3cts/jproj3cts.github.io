---
layout: docs
title: Scripting and headless use
permalink: /jek/docs/jekray/scripting/
description: Drive JEKray from a script: the window.JEKray object in the page, the same engine in Node without a browser, and a command line that traces a bench file and prints its readouts or sweeps a parameter to a table.
---

<p class="dx-lead">Everything the bench works out can be asked for from a script: in the page, through the <code>JEKray</code> object the tool puts on <code>window</code>; outside it, through the same engine running in Node, with no browser; and from the command line, which traces a bench file and prints what its panels would show. A design can sit in a repository with a check that runs it, and a parameter study can be a loop.</p>

## In the page

The page exposes `window.JEKray` (the old name `JEKray2D` still works). Its functions take parts by **name**, as the panels show them, and return plain numbers and objects: what the panel would show, without the words. The stable set:

| Call | What it does |
|---|---|
| `JEKray.load(data)` | Opens a bench from its data (the object a `.jekray` file holds). |
| `JEKray.serialize()` | The bench as a `.jekray` object. |
| `JEKray.trace()` | Traces it now (loading and changing a part trace on their own; this forces one). |
| `JEKray.select(name)` | Selects a part, so its panel is open. |
| `JEKray.stats(name)` | A screen's spot: count, centroid, rms, full width, power. |
| `JEKray.detector(name)` | A photodetector's or receiving horn's reading: mW, volts, SNR. |
| `JEKray.lensAntenna(name)` | An RF lens, disc or mirror on its axis as an antenna: gain, beamwidth, sidelobe, efficiencies. |
| `JEKray.rfSweep(name)`, `JEKray.linkBudget(name)` | A receiving horn against frequency, and its link budget. |
| `JEKray.arrivals(name)` | The Gaussian beams arriving at a part's face: each beam's q, direction, polarisation and path. |
| `JEKray.asmPrescription(name)`, `JEKray.asmEfl(name)` | An assembly as the lens designer reads it, and its focal length. |
| `JEKray.exportZmx(names)` | Parts as a lens file. |
| `JEKray.sweepPlay(name, path)`, `JEKray.sweepPause()` | A sweep played and paused. |
| `JEKray.typeLabel(name)`, `JEKray.benches()`, `JEKray.showTab(name)` | What a part is called, the bench tabs, and switching between them. |

Parameters have **paths**, the same the panels and sweeps use: `x`, `angle`, `surfaces.0.R`, `gaps.0`, `mmw.ghz`, `grin.f`. The parts' fields are listed under each part in [Parts](/jek/docs/jekray/params.json) and in the [AI guide](/jek/tools/jekray-ai-guide.md).

The rest of `window.JEKray` is the test suite's: it works, and may change between versions. The calls above will not change without a note in What's new.

## Headless, in Node

The engine runs in Node as it is, with no browser: `jek/tools/jekray/headless.mjs` opens a bench and gives it the same calls. It needs Node 20 or later and nothing installed.

```js
import { openFile } from './jek/tools/jekray/headless.mjs';

const B = await openFile('my-bench.jekray');
B.trace();                                   // { rays, rayPower, beams, dropped, absorbed }
B.screen('Sensor');                          // the spot on a screen
B.detector('PD');                            // a photodetector's reading
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
```

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

The commands: `trace`, `elements`, `screen`, `detector`, `antenna`, `paraxial` (`--nm`), `cavities`, `arrivals`; for an assembly, `assemblies`, `prescription`, `lens`, `spot` and `wavefront` (`--deg`), `mtf` (`--deg`, `--freq` once per frequency), `fieldcurves`, `relillum`, `merit` and `zmx` (parts' names, `--nm`; the lens file on standard output); for RF, `rf` (`--ghz`), `rfband`, `rfsweep`, `linkbudget`; and `sweep`. A sweep takes a part, a parameter path and values (`a:b:n` for n values from a to b, or `a,b,c`), and one or more `--read kind:Name` (screen, detector, antenna, paraxial, rf, lens, spot, wavefront, mtf, merit, or `trace`) for what to record at each value.

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
