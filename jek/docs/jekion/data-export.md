---
layout: docs
docs: jekion
title: Data export
permalink: /jek/docs/jekion/data-export/
description: "File › Export data: the bench's numbers as CSV, JSON, Excel, NumPy or MATLAB files; what each kind holds and how to open it."
---

<p class="dx-lead">File › Export data writes the numbers behind the bench as a file to open in a spreadsheet, in Python or in MATLAB, with JEKray's writers and layouts.</p>

## What can be exported

| Kind | What it holds |
|---|---|
| Ions | a row a particle: its group, mass and charge, start position, time and energy, end position, time and energy, how it ended and on what, the collisions it had |
| Detectors | a table a detector, a row a crossing: position, time, energy and direction |
| Trajectories | a table a particle: x, y, z and t along its path, as kept (thinned when long) |
| Trap analysis | the Mathieu parameters, frequencies and stability at the analysis point |
| Electrodes | a row an electrode: shape, place, size and voltage |

Every file carries the bench's name, JEKion's version, the date, the units and the array's settings. The layouts are JEKray's: a CSV export is a zip with a file a table (one heading row, "name (unit)"), JSON holds each table by column with its units, an Excel workbook has an About sheet and a sheet a table, NumPy's `.npz` an array a column as `table/key_unit` with the metadata in `meta`, and MATLAB's `.mat` a struct a table. [JEKray's data export page](/jek/docs/jekray/data-export/) shows how to open each.

## Who may

Every format, several kinds at once and **Export everything** need a free account. A script's `J.save` writes the same files ([scripting](/jek/docs/jekion/scripting/)).
