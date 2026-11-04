---
layout: docs
docs: jekion
title: Scripting
permalink: /jek/docs/jekion/scripting/
description: "Tools › Scripts: JavaScript run against the bench through J, to set voltages, fly, read the results, sweep a parameter and save tables."
---

<p class="dx-lead">Tools › Scripts (JEKrayPro) runs JavaScript on the page against the bench. The script gets `J`, and may `await`.</p>

## The API

| Call | What it does |
|---|---|
| `J.names()` | the electrodes', ion groups' and detectors' names |
| `J.get(name, key)` | a setting of the thing named (`'V'`, `'rf.amp'`, `'x'`, `'ke'`…); without a key, the whole thing |
| `J.set(name, key, value)` | changes it (the ions fly again when the script ends, or at `J.fly()`) |
| `J.setting(key, value)` | a bench setting: `'grid.h'`, `'gas.on'`, `'bfield.bz'`, `'fly.tMax'`…; without a value, reads it |
| `await J.fly()` | solves (if the geometry changed) and flies; gives the results |
| `J.results()` | the last flight: `n`, `ms`, `particles` (each with its group, start, end and hits), `hits(detector)`, `ends()`, `path(group, i)` |
| `await J.trap()` | the trap analysis at the analysis point |
| `await J.sweep(name, key, values, fn)` | sets each value, flies, and keeps `fn(results, value)` (or the ends' counts) |
| `J.data(kinds)` | the export's items, as [data export](/jek/docs/jekion/data-export/) has them |
| `J.save(name, data, format)` | keeps a table (rows of objects, or an object of columns) as a file, `'csv'`, `'json'`, `'xlsx'`, `'npz'` or `'mat'`, written when the script ends |
| `J.log(…)` | writes below the script |

The script's changes are one undo step. The **Example** button fills in a sweep of the einzel lens's focus voltage recording the spot's rms radius at each.

```js
const rows = [];
for (const V of [-800, -1000, -1200, -1400, -1600]) {
  J.set('Focus tube', 'V', V);
  const R = await J.fly();
  const hits = R.hits('Screen');
  const r = Math.sqrt(hits.reduce((a, h) => a + h.y * h.y + h.z * h.z, 0) / hits.length);
  rows.push({ V, hits: hits.length, rmsRadius_mm: r });
}
J.save('focus sweep', rows, 'csv');
```
