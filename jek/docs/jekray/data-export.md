---
layout: docs
title: Exporting data
permalink: /jek/docs/jekray/data-export/
description: "File › Export data: the numbers behind a bench (its readouts, plots, screens' rays and field maps, Gaussian beams, sweeps and studies, and its parts) as CSV, JSON, Excel, NumPy or MATLAB files; what each holds, column by column with its unit, how each format is laid out, and how to open it in Excel, Python and MATLAB. A script's save() writes the same files."
---

<p class="dx-lead">Everything the bench works out can leave it as numbers: <strong>File › Export data…</strong> writes the readouts, the plots' curves, each screen's rays and field, the Gaussian beams, the sweeps and studies, and the bench itself, as CSV, JSON, Excel, NumPy or MATLAB files. Each file says what it holds: the bench, the JEKray version, the date, every column's unit, and the settings of the parts the numbers come from. A script can write the same files with <a href="/jek/docs/jekray/scripting/#saving-files"><code>save()</code></a>.</p>

## Exporting

Choose **File › Export data…**. The window lists each kind of data with how many the bench has, as *Screens (3)*; one the bench has none of is greyed. Tick what to export, pick a format, and choose **Export**: one file comes down, named after the bench (*Michelson - readouts.zip*, or *Michelson - data.xlsx* for several kinds). **Export everything** puts every kind there is into one file in the format picked.

| Format | What comes down | Needs |
|---|---|---|
| CSV | a `.zip` of CSV files, one for each table, with `README.txt` and `meta.json` | a free account |
| JSON | one `.json` file | a free account |
| Excel | one `.xlsx` workbook, a sheet for each table | JEKrayPro |
| NumPy | one `.npz` file | JEKrayPro |
| MATLAB | one `.mat` file (Level 5) | JEKrayPro |

With a free account you export one kind at a time, as CSV or JSON. Several kinds at once, **Export everything**, and the Excel, NumPy and MATLAB files are part of JEKrayPro; they carry a **Pro** badge until you have it. Signed out, **Export** asks you to sign in first. Saving the bench as a `.jekray` file needs no account at all.

The numbers are the ones the panels show, worked out for the bench as it is when you export: a screen's diffracted field is worked out to the end first if it has not been yet, so a big field can take a few seconds.

## What each kind holds

### Readouts

One table, a row for each reading of every screen, photodetector, spectrometer, receiving horn and RF antenna on the bench, in whichever tab it is on:

| Column | What it is |
|---|---|
| `part`, `type`, `tab` | the part's name, its kind (*Screen*, *Photodiode*, *RF lens*, …) and the bench tab it is on |
| `reading` | what is read, named as its panel names it: *RMS spot*, *Power*, *Gain, horn and lens* |
| `value` | the number (blank where it is not a number) |
| `unit` | its unit: mm, nm, mW, V, %, dB, dBi, °, lp/mm; empty for a ratio |
| `note` | what the number needs said: *of what its sources emit*, *negative: behind it*, *yes* or *no* for a flag |

A screen gives its rays (count, the share of its sources' light, centroid, RMS spot, full width, optical path, wavefront error, Stokes parameters), the Gaussian beam arriving (radius, wavefront radius, waist, Rayleigh range) and its diffracted field's figures (Strehl ratio, FWHM, the radii holding 50% and 80% of the energy, MTF 50%). A photodetector gives its power (mW), photocurrent (mA), output (V), noise and signal to noise; a receiving horn its power into its mode, coupling, output, noise floor and link budget; a spectrometer its peak and width (nm), resolution, power and counts; an RF lens or mirror fed by a horn its gain and directivity (dBi), beamwidths (°), sidelobe (dB) and efficiencies.

### Plots

Each plot in each part's panel, as the **CSV** button under it gives it: one table for each plot, its columns as the plot names them, with their units in the names (*wavelength_nm*, *x (mm)*). A part's panel need not be open: JEKray draws every part's panel out of sight for a moment to read its plots (a screen's Plots, Rays and Pulse tabs among them), in the views each is set to. The Aberrations tab, worked out across the field, is left to its own panel's CSV.

### Screen data

For each screen, its **hits**: one row for each ray arriving.

| Column | Unit | What it is |
|---|---|---|
| `source`, `ray`, `path` | | the source the ray came from, its number in the fan, the way it came (the bounces and splits it took) |
| `across`, `up` | mm | where it lands: across the screen from its centre, and up out of the bench plane |
| `angle from the normal` | ° | its direction in the bench plane against the screen's normal |
| `slope up` | | its rise out of the plane, dz/ds |
| `power` | % of its source | its share of its source's light (the column adds up to the screen's *Power received*) |
| `ray weight` | | the same as the trace carries it |
| `wavelength`, `optical path`, `index` | nm, mm | its wavelength, its optical path from its source, the index of the medium it arrives in |
| `s power`, `p power` | | its power in s (out of the bench plane) and p (in it) |
| `Es real`, `Es imaginary`, `Ep real`, `Ep imaginary` | | the complex amplitudes of the two, as the trace carries them |

And, where the bench works out a diffracted field there, its **field**: the irradiance map (relative), an n × n array, row j out of the bench plane and column i along the screen, with its axes beside it as two arrays, *field along* and *field up*, in mm.

### Beams

One table, a row for each Gaussian beam segment, from the face it starts at to the face it ends at: `beam` (its number) and `parent` (the one it came from, −1 for a source), `source`, `tab`, `wavelength` (nm), `index`, where it starts (`start x`, `start y`, `start z`, mm), its `direction` (°) and `slope up`, its `length` (mm) and the part it `ends at`; then the beam itself, `q real` and `q imaginary` (q = z + i z<sub>R</sub> at the start, z from the waist, mm), the 1/e² `radius at the start` and `radius at the end`, the `wavefront radius at the start`, the `waist radius`, where the waist is (`waist ahead of the start`, mm, negative behind), the `Rayleigh range` (mm) and the far-field `divergence (half angle)` (mrad), all in the medium it is in and times its `M²`, with its `share of its launch` and its `launch power` (mW).

### Sweep results

Each parameter given a sweep (its part, path, range, wave, frequency in Hz, phase and its value now); each receiving horn's frequency sweep (frequency in GHz, S21 in dB, coupling); and what the bench's studies last found: **Tolerance the bench**'s sensitivity table and Monte Carlo trials, and **Optimise the bench**'s values and goals at the start and at the best, with its merit trace by trace and its scan.

### The bench

A `parts` table, a row for each part: its name, type and kind, its tab, x, y and z (mm), angle (°), and `settings`, every setting as JSON, as the `.jekray` file holds it. And the whole bench as one value, as the `.jekray` file holds it. (An imported mesh's triangles are left out of both.)

## How each format is laid out

Every file carries its context: a title, the bench's name, the tab, the JEKray version, the date and time it was made (ISO 8601, UTC), and, under `parts`, the settings of every part the numbers come from. Each table's columns have a name and a unit, and a **key**: the two joined into one name a program can use, letters, digits and _ only (`across_mm`, `power_pct_of_its_source`, `angle_from_the_normal_deg`; µ becomes u, % pct, ° deg). Numbers are written in full: the shortest text that reads back as the same 64-bit float, so nothing is rounded.

### CSV (a zip)

A `.zip` with one `.csv` file for each table and array, named after it (*Screen 1 hits.csv*), `README.txt` (the context, then each file, what it holds and its columns with their units) and `meta.json` (the context whole, with the parts' settings). A value (the whole bench) is a `.json` file of its own.

Each table's CSV has **one heading row**, each column named with its unit in brackets (`across (mm)`), then a row for each record: RFC 4180, comma-separated, text quoted where it holds a comma, a quote or a line break, lines ending CRLF. A missing number is left blank; the infinities are `inf` and `-inf`; true and false are `TRUE` and `FALSE`. The files are UTF-8 with a byte-order mark, so Excel reads µ and ° as they are. A 1-D array is one column under `value (unit)`; a 2-D array (a field map) is the matrix itself, row by row, with no heading; a larger one a row for each element, its indices first.

```python
import zipfile, pandas as pd
z = zipfile.ZipFile('Michelson - readouts.zip')
r = pd.read_csv(z.open('readouts.csv'), float_precision='round_trip')   # (round_trip: every last bit)
print(r[r.reading == 'RMS spot'][['part', 'value', 'unit']])
field = pd.read_csv(z.open('Output port field.csv'), header=None).to_numpy()
```

In Excel, open a `.csv` from the unzipped folder. Python's own `csv` module reads them with `open(f, encoding='utf-8-sig', newline='')`.

### JSON

One object:

```json
{ "format": "JEKray data",
  "meta": { "title": "…", "bench": "Michelson", "tab": "Bench 1", "version": "1.2", "created": "2026-10-23T10:15:00.000Z", "parts": { "Laser": { … } },
            "items": { "readouts": { "kind": "table", "rows": 57, "columns": [ … ] } } },
  "tables": { "readouts": { "about": "…", "columns": [{ "name": "value", "unit": "", "key": "value", "type": "num" }, …], "data": { "part": […], "value": […] } } },
  "arrays": { "Output port field": { "unit": "relative", "dtype": "float64", "shape": [256, 256], "data": [[…], …] } },
  "values": { "bench": { … } } }
```

A table's data is by column, under each column's key; an array's data is nested lists to its shape. JSON has no NaN or infinity: a missing or non-finite number is `null`.

```python
import json, pandas as pd, numpy as np
d = json.load(open('Michelson - data.json'))
hits = pd.DataFrame(d['tables']['Output port hits']['data'])
field = np.array(d['arrays']['Output port field']['data'], dtype=float)
```

### Excel (.xlsx)

A workbook whose first sheet, **About**, holds the context, a list of the sheets with what each holds and its size, every column's unit, and the parts' settings opened out as part, setting and value. Then a sheet for each item, named after it (31 characters at most, without `[]:*?/\`): a table with its heading row (bold, frozen) and numbers as numbers; a 1-D array as one column; a 2-D array as its matrix with no heading; a value opened out as path and value. A sheet holds 1,048,576 rows, so one with more says on its last row that it was cut short (CSV, NumPy and MATLAB hold every row); a cell holds 32,767 characters.

```python
import openpyxl, pandas as pd
hits = pd.read_excel('Michelson - data.xlsx', sheet_name='Output port hits')
```

### NumPy (.npz)

What `numpy.savez` writes: a zip of `.npy` files (format 1.0), read with `numpy.load`, no pickle needed. Each table's columns are arrays of their own, named `table/key` (`readouts/value`, `Output_port_hits/across_mm`): numbers as float64 (a missing one NaN), counts as int64, flags as bool, text as fixed-width unicode (`<U`). An array is itself, in its shape and type. A value, and the context (`meta`: the bench, version, date, the parts' settings, and every item's columns and units), are JSON text in a 0-d unicode array. Item names become keys a program can use (spaces as _).

```python
import json, numpy as np
d = np.load('Michelson - data.npz')
print(d.files)
x, P = d['Output_port_hits/across_mm'], d['Output_port_hits/power_pct_of_its_source']
field = d['Output_port_field']                       # (256, 256)
meta = json.loads(str(d['meta']))
print(meta['bench'], meta['items']['Output port hits']['columns'])
```

### MATLAB (.mat)

A Level 5 MAT-file, as MATLAB's own `save -v6` writes: the header *MATLAB 5.0 MAT-file, Platform: JEKray, Created on: …*, then a variable for each item, its name made one MATLAB takes (letters, digits and _, 63 at most):

- a **table** is a struct with a field for each column, under its key, as a column vector: double (a missing number NaN), logical for true and false, a cell of char for text; and with it `about` (what it holds), `units` (a struct of each column's unit) and `headings` (a cell of the headings as a spreadsheet shows them);
- an **array** is a double (or int32, int64, logical) array of its shape, a 1-D one as a column;
- a **value** is MATLAB's own: structs for objects, cells for lists of mixed things, double or logical rows for lists of numbers or flags, char for text;
- `meta` is the context as a struct, the parts' settings under `meta.parts`.

```matlab
S = load('Michelson - data.mat');
r = S.readouts;                         % a struct of columns
plot(S.Output_port_hits.across_mm, S.Output_port_hits.power_pct_of_its_source, 'o')
imagesc(S.Output_port_field_along, S.Output_port_field_up, S.Output_port_field); axis xy
S.meta.bench, S.Output_port_hits.units.across_mm
```

```python
import scipy.io
S = scipy.io.loadmat('Michelson - data.mat', simplify_cells=True)
S['Output_port_hits']['across_mm'], S['meta']['bench']
```

## From a script

A script writes these same files with `save(name, data, format='csv', meta=None)`, in JavaScript or Python, downloaded when the run ends; the output's **Save as…** saves what a script returned in any of the five formats. The data can be rows, an object of columns, an array, or an object of several named ones, each becoming a sheet, a variable or an entry. See [Scripting: saving files](/jek/docs/jekray/scripting/#saving-files). In Node, `headless.mjs`'s `exportData(kinds, format)` gives the same files' bytes (see [Headless, in Node](/jek/docs/jekray/scripting/#headless-in-node)).

## What is not here

- The plots of panels drawn as the bench works them out in the background (a screen's field while it is still being worked out) come out as they stand then; the readouts and the screen data work them out to the end.
- An Aberrations tab's plots, and the designers' own analyses (in the Optical and RF designers each plot has its own CSV), are not in the export.
- Complex numbers are given as their real and imaginary parts in two columns, not as one complex column.
- A zip, NumPy or Excel file is at most 4 GB (no ZIP64), far past anything a bench makes.
