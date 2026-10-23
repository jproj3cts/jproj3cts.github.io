/* The data files File › Export data and a script's save() write (core/datafiles.js), each read back by a reader that is
   not ours: Python's zipfile and csv, pandas, numpy.load, scipy.io.loadmat and openpyxl where Python has them (CI installs
   them; a run without them says so and skips those checks), and always by the small readers here, written from the
   formats' own specifications (the zip's records and CRC, .npy's header, MAT Level 5's tags, SpreadsheetML's cells).
   Numbers come back as the same float64, to the last bit; shapes, names, units and the context with them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import * as D from '../../src/core/datafiles.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jekray-data-'));
const PY = (() => { try { execFileSync('python3', ['-I', '-c', 'import numpy, scipy.io, openpyxl'], { stdio: 'ignore' }); return true; } catch (err) { return false; } })();
const pyOpts = { skip: PY ? false : 'python3 with numpy, scipy and openpyxl is not here (pip install numpy scipy openpyxl)' };
/* a Python script run on the files written, with nothing of ours on its path: what it prints, as JSON */
const py = (code, ...files) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...files], { encoding: 'utf8', maxBuffer: 1 << 28 }));
const write = async (set, fmt, name) => { const r = await D.dfWrite(set, fmt); const f = path.join(TMP, name + r.ext); fs.writeFileSync(f, r.bytes); return { f, bytes: r.bytes, ext: r.ext }; };

// numbers that test a float64's last bit, the extremes and the ones JSON has no word for
const NUMS = [0, -0, 1 / 3, Math.PI * 1e-300, -1.7976931348623157e308, 5e-324, 2 ** 53 + 2, 0.1 + 0.2, NaN, 12345.678901234567];
const SET = () => ({
  meta: { title: 'JEKray data: test', bench: 'A µ bench, with “quotes”', tab: 'Bench 1', version: '9.9', created: '2026-10-23T09:08:07.000Z', source: 'the tests',
    parts: { 'Lens 1': { type: 'lens', x: 60, surfaces: [{ R: 51.5, k: -1 }, { R: null }], materials: [{ glass: 'N-BK7' }] } } },
  items: [
    { kind: 'table', name: 'Screen 1 hits', about: 'rays, with a comma', cols: [
      { name: 'across', unit: 'mm', values: NUMS.slice() },
      { name: 'source', values: ['Laser', 'a,b', 'say "hi"', 'line\nbreak', ' pad ', 'é µ °', '', null, 'x', 'y'] },
      { name: 'ok', values: [true, false, true, true, false, false, true, false, true, false] },
      { name: 'ray', type: 'int', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { name: 'power', unit: '% of its source', values: [1, 2, 3, 4, 5, 6, 7, 8, Infinity, -Infinity] }] },
    { kind: 'array', name: 'Screen 1 field', unit: 'relative', dtype: 'f8', shape: [3, 4], data: Float64Array.from({ length: 12 }, (_, i) => i / 7 + (i === 5 ? 1e-17 : 0)) },
    { kind: 'array', name: 'counts', dtype: 'i4', shape: [2, 3, 2], data: Array.from({ length: 12 }, (_, i) => i * 1000 - 5000) },
    { kind: 'array', name: 'mask', dtype: 'b1', shape: [5], data: [true, false, false, true, true] },
    { kind: 'value', name: 'bench', value: { name: 'Bench', elements: [{ id: 'a', x: 1.25, sweeps: {} }, { id: 'b', R: null, list: [1, 2, 3] }], on: true } },
  ],
});
const bits = x => { const b = Buffer.alloc(8); b.writeDoubleLE(x); return b.toString('hex'); };
const sameNum = (a, b, at) => assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0), at + ': ' + a + ' against ' + b + ' (' + bits(a) + ' / ' + bits(b) + ')');

/* ---- the readers here, from the specifications ---- */
function unzip(u8) {
  const b = Buffer.from(u8), files = new Map();
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'the end of the central directory');
  const n = b.readUInt16LE(end + 10), cd = b.readUInt32LE(end + 16);
  let o = cd;
  for (let i = 0; i < n; i++) {
    assert.equal(b.readUInt32LE(o), 0x02014b50, 'a central directory record');
    const flags = b.readUInt16LE(o + 8), method = b.readUInt16LE(o + 10), crc = b.readUInt32LE(o + 16), csize = b.readUInt32LE(o + 20), size = b.readUInt32LE(o + 24);
    const nl = b.readUInt16LE(o + 28), xl = b.readUInt16LE(o + 30), cl = b.readUInt16LE(o + 32), lo = b.readUInt32LE(o + 42), name = b.toString('utf8', o + 46, o + 46 + nl);
    assert.ok(flags & 0x0800, name + ': its name marked UTF-8');
    assert.equal(b.readUInt32LE(lo), 0x04034b50, name + ': its local header');
    const start = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28), body = b.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : (assert.equal(method, 0, name + ': stored or deflated'), body);
    assert.equal(data.length, size, name + ': its size');
    assert.equal(zlib.crc32 ? zlib.crc32(data) : D.dfCrc32(data), crc, name + ': its CRC');
    files.set(name, data);
    o += 46 + nl + xl + cl;
  }
  return files;
}
function readNpy(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 'the .npy magic, format 1.0');
  const hl = buf.readUInt16LE(8), head = buf.toString('latin1', 10, 10 + hl);
  assert.equal((10 + hl) % 64, 0, 'the header pads the data to 64 bytes');
  assert.ok(head.endsWith('\n'));
  const descr = /'descr': '([^']+)'/.exec(head)[1], shape = /'shape': \(([^)]*)\)/.exec(head)[1].split(',').map(s => s.trim()).filter(Boolean).map(Number);
  assert.match(head, /'fortran_order': False/);
  const body = buf.subarray(10 + hl), n = shape.reduce((a, c) => a * c, 1);
  let data;
  if (descr === '<f8') data = Array.from({ length: n }, (_, i) => body.readDoubleLE(8 * i));
  else if (descr === '<i8') data = Array.from({ length: n }, (_, i) => Number(body.readBigInt64LE(8 * i)));
  else if (descr === '<i4') data = Array.from({ length: n }, (_, i) => body.readInt32LE(4 * i));
  else if (descr === '|b1') data = Array.from(body.subarray(0, n), x => !!x);
  else if (descr.startsWith('<U')) { const w = +descr.slice(2); data = Array.from({ length: n }, (_, i) => { let s = ''; for (let j = 0; j < w; j++) { const c = body.readUInt32LE(4 * (i * w + j)); if (c) s += String.fromCodePoint(c); } return s; }); }
  else throw new Error('dtype ' + descr);
  assert.equal(body.length, n * (descr.startsWith('<U') ? 4 * +descr.slice(2) : +descr.slice(2)), 'the data is the shape’s size');
  return { descr, shape, data };
}
/* MAT Level 5: the header, then each variable's matrix element read into { cls, dims, name, data | cells | fields } */
function readMat(u8) {
  const b = Buffer.from(u8);
  const text = b.toString('latin1', 0, 116);
  assert.equal(b.readUInt16LE(124), 0x0100, 'version 0x0100');
  assert.equal(b.toString('latin1', 126, 128), 'IM', 'little-endian');
  const el = o => { const t = b.readUInt32LE(o), n = b.readUInt32LE(o + 4); return { t, n, at: o + 8, next: o + 8 + n + ((8 - n % 8) % 8) }; };
  const matrix = o => {
    const M = el(o); assert.equal(M.t, 14, 'a matrix');
    let p = M.at;
    const F = el(p); assert.equal(F.t, 6); const flags = b.readUInt32LE(F.at), cls = flags & 255; p = F.next;
    const Dm = el(p); const dims = []; for (let i = 0; i < Dm.n / 4; i++) dims.push(b.readInt32LE(Dm.at + 4 * i)); p = Dm.next;
    const N = el(p); const name = b.toString('latin1', N.at, N.at + N.n); p = N.next;
    const out = { cls, dims, name, logical: !!(flags & 0x0200) }, count = dims.reduce((a, c) => a * c, 1);
    if (cls === 1) { out.cells = []; for (let i = 0; i < count; i++) { const c = matrix(p); out.cells.push(c.v); p = c.end; } }
    else if (cls === 2) {
      const L = el(p), len = b.readInt32LE(L.at); p = L.next;
      const FN = el(p), keys = []; for (let i = 0; i < FN.n / len; i++) keys.push(b.toString('latin1', FN.at + i * len, FN.at + (i + 1) * len).replace(/\0+$/, '')); p = FN.next;
      out.fields = {}; for (const k of keys) { const c = matrix(p); out.fields[k] = c.v; p = c.end; }
    } else {
      const R = el(p);
      if (cls === 4) { assert.equal(R.t, 16, 'text as UTF-8'); out.data = b.toString('utf8', R.at, R.at + R.n); }
      else if (cls === 6) { assert.equal(R.t, 9); out.data = Array.from({ length: R.n / 8 }, (_, i) => b.readDoubleLE(R.at + 8 * i)); }
      else if (cls === 12) out.data = Array.from({ length: R.n / 4 }, (_, i) => b.readInt32LE(R.at + 4 * i));
      else if (cls === 9) out.data = Array.from(b.subarray(R.at, R.at + R.n));
      else throw new Error('class ' + cls);
      p = R.next;
    }
    assert.equal(p, M.next, (name || 'an element') + ': its parts fill it exactly');
    return { v: out, end: M.next };
  };
  const vars = {};
  for (let o = 128; o < b.length;) { const m = matrix(o); vars[m.v.name] = m.v; o = m.end; }
  return { text, vars };
}
/* an xlsx sheet's cells: { A1: value } (numbers as numbers, inline strings, booleans) */
function sheetCells(xml) {
  const out = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const t = /t="(\w+)"/.exec(m[2]), v = /<v>([^<]*)<\/v>/.exec(m[3]), s = /<t[^>]*>([^<]*)<\/t>/.exec(m[3]);
    const un = x => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    out[m[1]] = t && t[1] === 'inlineStr' ? un(s[1]) : t && t[1] === 'b' ? v[1] === '1' : Number(v[1]);
  }
  return out;
}
/* RFC 4180, as written: quoted fields, doubled quotes, CRLF */
function parseCsv(text) {
  assert.ok(text.startsWith('﻿'), 'a byte-order mark first');
  text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; }
    else f += c;
  }
  assert.equal(f + row.join(''), '', 'the last line ends CRLF');
  return rows;
}

test('names: a program’s identifiers, unique sheet and file names, column letters', () => {
  assert.equal(D.dfIdent('x (mm)'), 'x_mm');
  assert.equal(D.dfIdent('power % of µW/s²'), 'power_pct_of_uW_per_s2');
  assert.equal(D.dfIdent('2nd'), 'x_2nd');
  assert.equal(D.dfIdent('Ångström é'), 'Angstrom_e');
  assert.equal(D.dfIdent(''), 'x');
  assert.ok(D.dfIdent('a'.repeat(100)).length <= 63);
  assert.equal(D.dfColKey({ name: 'angle from the normal', unit: '°' }), 'angle_from_the_normal_deg');
  assert.deepEqual(D.dfUnique(['a', 'A', 'a', 'b'], 31, ['About']), ['a', 'A_2', 'a_3', 'b']);
  assert.equal(D.dfSheetName('a/b:c*d?[e]\\f' + 'x'.repeat(40)).length, 31);
  assert.ok(!/[[\]:*?/\\]/.test(D.dfSheetName('a/b:c*d?[e]\\f')));
  assert.deepEqual([0, 25, 26, 701, 702, 16383].map(D.dfColLetter), ['A', 'Z', 'AA', 'ZZ', 'AAA', 'XFD']);
  assert.equal(D.dfCrc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'the CRC-32 check value');
});

test('what a script hands save(): rows, an object of columns, nested lists, typed and NumPy arrays, an object of named things', () => {
  const [T] = D.dfItemsOf([{ x: 1, y: 'a' }, { x: 2, z: true }], 'rows');
  assert.equal(T.kind, 'table'); assert.deepEqual(T.cols.map(c => c.name), ['x', 'y', 'z']); assert.deepEqual(T.cols[2].values, [null, true]);
  const [C] = D.dfItemsOf({ f: [1, 2, 3], g: ['a', 'b', 'c'] }, 'cols');
  assert.equal(C.kind, 'table'); assert.deepEqual(D.dfColType(C.cols[1]), 'str');
  const [A] = D.dfItemsOf([[1, 2, 3], [4, 5, 6]], 'm');
  assert.ok(A.kind === 'array' && A.dtype === 'f8'); assert.deepEqual(A.shape, [2, 3]); assert.deepEqual(Array.from(A.data), [1, 2, 3, 4, 5, 6]);
  const [B] = D.dfItemsOf(new Int32Array([1, -2]), 'i'); assert.equal(B.dtype, 'i4');
  const [N] = D.dfItemsOf({ __ndarray__: [1, 2, 3, 4, 5, 6], shape: [3, 2], dtype: 'int64' }, 'np');
  assert.ok(N.kind === 'array' && N.dtype === 'i8'); assert.deepEqual(N.shape, [3, 2]);
  const named = D.dfItemsOf({ spot: [{ r: 1 }], field: [[1, 2], [3, 4]], axis: { __ndarray__: [true, false], shape: [2], dtype: 'bool' } }, 'many');
  assert.deepEqual(named.map(i => i.name + ':' + i.kind), ['spot:table', 'field:array', 'axis:array']);
  assert.equal(named[2].dtype, 'b1');
  assert.equal(D.dfItemsOf({ a: 1, b: { c: 2 } }, 'v')[0].kind, 'value');
  assert.equal(D.dfItemsOf([[1, 2], [3]], 'ragged')[0].kind, 'value', 'a ragged list is a value, not an array');
  assert.equal(D.dfItemsOf('text', 't')[0].kind, 'value');
});

test('zip: stored and deflated entries read back by their records, sizes and CRCs; Python’s zipfile agrees', async t => {
  const big = 'JEKray '.repeat(4000), files = [{ name: 'a.txt', data: big }, { name: 'µ/é.bin', data: Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 255) }, { name: 'empty', data: '' }];
  for (const deflate of [true, false]) {
    const z = await D.dfZip(files, { deflate, date: '2026-10-23T09:08:07Z' }), F = unzip(z);
    assert.deepEqual([...F.keys()], ['a.txt', 'µ/é.bin', 'empty']);
    assert.equal(F.get('a.txt').toString(), big);
    if (deflate) assert.ok(z.length < big.length / 10, 'deflated where that is smaller');
    fs.writeFileSync(path.join(TMP, 'z' + deflate + '.zip'), z);
  }
  assert.ok(D.dfDeflateOk(), 'Node has CompressionStream’s deflate-raw');
  if (PY) {
    const r = py("import sys, zipfile, json\nout = []\nfor f in sys.argv[1:]:\n    z = zipfile.ZipFile(f)\n    out.append([z.testzip(), z.namelist(), len(z.read('a.txt')), [i.compress_type for i in z.infolist()]])\nprint(json.dumps(out))",
      path.join(TMP, 'ztrue.zip'), path.join(TMP, 'zfalse.zip'));
    assert.deepEqual(r[0].slice(0, 3), [null, ['a.txt', 'µ/é.bin', 'empty'], big.length]);
    assert.deepEqual(r[0][3], [8, 8, 0]); assert.deepEqual(r[1][3], [0, 0, 0]);
  } else t.diagnostic('Python’s zipfile not run: ' + pyOpts.skip);
});

test('CSV: a zip of one file for each item, README.txt and meta.json; RFC 4180 quoting, every number back to the bit', async () => {
  const { bytes } = await write(SET(), 'csv', 'set'), F = unzip(bytes);
  assert.deepEqual([...F.keys()], ['README.txt', 'meta.json', 'Screen 1 hits.csv', 'Screen 1 field.csv', 'counts.csv', 'mask.csv', 'bench.json']);
  const readme = F.get('README.txt').toString();
  for (const s of ['Bench: A µ bench, with “quotes”', 'JEKray version: 9.9', 'Created: 2026-10-23T09:08:07.000Z', 'Screen 1 hits.csv: rays, with a comma', '    across (mm)', '    power (% of its source)', 'An array of 3 x 4, in relative', 'meta.json']) assert.ok(readme.includes(s), 'README says ' + s);
  const rows = parseCsv(F.get('Screen 1 hits.csv').toString());
  assert.deepEqual(rows[0], ['across (mm)', 'source', 'ok', 'ray', 'power (% of its source)']);
  assert.equal(rows.length, 11);
  rows.slice(1).forEach((r, i) => { sameNum(r[0] === '' ? NaN : Number(r[0]), Object.is(NUMS[i], -0) ? -0 : NUMS[i], 'across ' + i); });
  assert.deepEqual(rows.slice(1).map(r => r[1]), ['Laser', 'a,b', 'say "hi"', 'line\nbreak', ' pad ', 'é µ °', '', '', 'x', 'y']);
  assert.deepEqual(rows.slice(1, 3).map(r => r[2]), ['TRUE', 'FALSE']);
  assert.deepEqual(rows.slice(9).map(r => r[4]), ['inf', '-inf']);
  const M = parseCsv(F.get('Screen 1 field.csv').toString());
  assert.equal(M.length, 3); assert.equal(M[0].length, 4); sameNum(Number(M[1][1]), 5 / 7 + 1e-17, 'the matrix');
  const meta = JSON.parse(F.get('meta.json'));
  assert.equal(meta.bench, 'A µ bench, with “quotes”'); assert.equal(meta.parts['Lens 1'].surfaces[0].R, 51.5);
  assert.deepEqual(meta.items['Screen 1 hits'].columns[0], { name: 'across', unit: 'mm', key: 'across_mm', type: 'num' });
  assert.equal(JSON.parse(F.get('bench.json')).elements[1].list[2], 3);
});

test('CSV read by Python’s csv and by pandas: the same table, its units in the headings', pyOpts, async () => {
  const { f } = await write(SET(), 'csv', 'set-py');
  const r = py(`import sys, zipfile, io, csv, json, math
z = zipfile.ZipFile(sys.argv[1])
rows = list(csv.reader(io.TextIOWrapper(z.open('Screen 1 hits.csv'), encoding='utf-8-sig', newline='')))
try:
    import pandas as pd
    df = pd.read_csv(z.open('Screen 1 hits.csv'), float_precision='round_trip')
    pdv = [None if math.isnan(x) else x for x in df['across (mm)'].tolist()]
    near = [None if math.isnan(x) else x for x in pd.read_csv(z.open('Screen 1 hits.csv'))['across (mm)'].tolist()]
    cols = list(df.columns)
    oks = [bool(x) for x in df['ok'].tolist()]
except ImportError:
    pdv, cols, oks, near = None, None, None, None
print(json.dumps({'rows': rows, 'pd': pdv, 'cols': cols, 'oks': oks, 'near': near}))`, f);
  assert.deepEqual(r.rows[0], ['across (mm)', 'source', 'ok', 'ray', 'power (% of its source)']);
  assert.equal(r.rows[4][1], 'line\nbreak');
  r.rows.slice(1).forEach((row, i) => sameNum(row[0] === '' ? NaN : Number(row[0]), NUMS[i], 'csv ' + i));
  // pandas reads the last bit with float_precision='round_trip' (its own faster parser can be an ulp out: the docs say so)
  if (r.pd) {
    r.pd.forEach((v, i) => sameNum(v === null ? NaN : v, NUMS[i], 'pandas ' + i)); assert.deepEqual(r.oks.slice(0, 3), [true, false, true]);
    assert.deepEqual(r.cols, ['across (mm)', 'source', 'ok', 'ray', 'power (% of its source)']);
    r.near.forEach((v, i) => { if (Number.isFinite(NUMS[i]) && NUMS[i] !== 0) assert.ok(Math.abs(v - NUMS[i]) <= 4e-16 * Math.abs(NUMS[i]), 'pandas, by default, within an ulp: ' + i); });
  }
});

test('JSON: the context, each table by column (pandas.DataFrame takes it), arrays nested to their shape, non-finite numbers null', async () => {
  const { bytes } = await write(SET(), 'json', 'set');
  const J = JSON.parse(Buffer.from(bytes).toString());
  assert.equal(J.format, 'JEKray data'); assert.equal(J.meta.version, '9.9'); assert.equal(J.meta.parts['Lens 1'].x, 60);
  const T = J.tables['Screen 1 hits'];
  assert.deepEqual(T.columns.map(c => c.key), ['across_mm', 'source', 'ok', 'ray', 'power_pct_of_its_source']);
  T.data.across_mm.forEach((v, i) => sameNum(v === null ? NaN : v, NUMS[i] === 0 ? 0 : NUMS[i], 'json ' + i));
  assert.deepEqual(T.data.power_pct_of_its_source.slice(8), [null, null]);
  assert.deepEqual(J.arrays.counts.shape, [2, 3, 2]); assert.equal(J.arrays.counts.data[1][2][1], 11000 - 5000); assert.equal(J.arrays.counts.dtype, 'int32');
  assert.deepEqual(J.arrays.mask.data, [true, false, false, true, true]);
  assert.equal(J.values.bench.elements[0].x, 1.25);
});

test('NumPy: .npy 1.0 files in a zip, a column each, arrays in their shape and type, text as unicode, the context as JSON', async () => {
  const { bytes } = await write(SET(), 'npz', 'set'), F = unzip(bytes);
  assert.deepEqual([...F.keys()], ['meta.npy', 'Screen_1_hits/across_mm.npy', 'Screen_1_hits/source.npy', 'Screen_1_hits/ok.npy', 'Screen_1_hits/ray.npy', 'Screen_1_hits/power_pct_of_its_source.npy',
    'Screen_1_field.npy', 'counts.npy', 'mask.npy', 'bench.npy']);
  const x = readNpy(F.get('Screen_1_hits/across_mm.npy'));
  assert.equal(x.descr, '<f8'); assert.deepEqual(x.shape, [10]); x.data.forEach((v, i) => sameNum(v, NUMS[i], 'npy ' + i));
  assert.equal(readNpy(F.get('Screen_1_hits/ray.npy')).descr, '<i8');
  assert.equal(readNpy(F.get('Screen_1_hits/ok.npy')).descr, '|b1');
  const s = readNpy(F.get('Screen_1_hits/source.npy')); assert.equal(s.descr, '<U10'); assert.equal(s.data[5], 'é µ °');
  const c = readNpy(F.get('counts.npy')); assert.equal(c.descr, '<i4'); assert.deepEqual(c.shape, [2, 3, 2]);
  const m = readNpy(F.get('meta.npy')); assert.deepEqual(m.shape, []); assert.equal(JSON.parse(m.data[0]).items.counts.dtype, 'int32');
});

test('NumPy read by numpy.load (no pickle): every array, dtype and shape as written', pyOpts, async () => {
  const { f } = await write(SET(), 'npz', 'set-py');
  const r = py(`import sys, json, numpy as np
d = np.load(sys.argv[1], allow_pickle=False)
x = d['Screen_1_hits/across_mm']
print(json.dumps({'files': d.files, 'bits': [v.hex() for v in x.tolist()], 'nan': bool(np.isnan(x[8])), 'src': d['Screen_1_hits/source'].tolist(),
  'ok': d['Screen_1_hits/ok'].tolist(), 'ray': str(d['Screen_1_hits/ray'].dtype), 'field': d['Screen_1_field'].tolist(), 'fshape': list(d['Screen_1_field'].shape),
  'counts': [str(d['counts'].dtype), list(d['counts'].shape), int(d['counts'][1, 2, 1])], 'mask': [str(d['mask'].dtype), d['mask'].tolist()],
  'meta': json.loads(str(d['meta'])), 'bench': json.loads(str(d['bench']))}))`, f);
  assert.equal(r.files[0], 'meta');
  NUMS.forEach((v, i) => { if (!Number.isNaN(v)) assert.equal(r.bits[i], pyHex(v), 'numpy ' + i); });
  assert.ok(r.nan); assert.equal(r.src[3], 'line\nbreak'); assert.deepEqual(r.ok.slice(0, 2), [true, false]); assert.equal(r.ray, 'int64');
  assert.deepEqual(r.fshape, [3, 4]); sameNum(r.field[1][1], 5 / 7 + 1e-17, 'field');
  assert.deepEqual(r.counts, ['int32', [2, 3, 2], 6000]); assert.deepEqual(r.mask, ['bool', [true, false, false, true, true]]);
  assert.equal(r.meta.bench, 'A µ bench, with “quotes”'); assert.equal(r.meta.parts['Lens 1'].materials[0].glass, 'N-BK7');
  assert.deepEqual(r.bench.elements[1].list, [1, 2, 3]);
});
/* float.hex() as Python writes it, from the number's bits */
function pyHex(v) {
  if (v === 0) return Object.is(v, -0) ? '-0x0.0p+0' : '0x0.0p+0';
  const b = Buffer.alloc(8); b.writeDoubleLE(v);
  const hi = b.readUInt32LE(4), lo = b.readUInt32LE(0), sign = hi >>> 31 ? '-' : '', e = (hi >>> 20) & 0x7ff;
  let m = ((BigInt(hi & 0xfffff) << 32n) | BigInt(lo)).toString(16).padStart(13, '0').replace(/0+$/, '') || '0';
  return sign + (e ? '0x1.' + m + 'p' + (e - 1023 >= 0 ? '+' : '') + (e - 1023) : '0x0.' + m + 'p-1022');
}

test('MATLAB: the 128-byte header, then a variable for each item: tables as structs of columns, arrays in MATLAB’s order, values as structs and cells', async () => {
  const { bytes } = await write(SET(), 'mat', 'set'), { text, vars } = readMat(bytes);
  assert.equal(text.trimEnd(), 'MATLAB 5.0 MAT-file, Platform: JEKray, Created on: ' + ctime(new Date('2026-10-23T09:08:07.000Z')));
  assert.deepEqual(Object.keys(vars), ['meta', 'Screen_1_hits', 'Screen_1_field', 'counts', 'mask', 'bench']);
  const T = vars.Screen_1_hits.fields;
  assert.deepEqual(Object.keys(T), ['across_mm', 'source', 'ok', 'ray', 'power_pct_of_its_source', 'about', 'units', 'headings']);
  assert.deepEqual(T.across_mm.dims, [10, 1]); T.across_mm.data.forEach((v, i) => sameNum(v, NUMS[i], 'mat ' + i));
  assert.equal(T.source.cells[5].data, 'é µ °'); assert.ok(T.ok.logical); assert.equal(T.units.fields.across_mm.data, 'mm');
  assert.equal(T.headings.cells[4].data, 'power (% of its source)');
  const Fm = vars.Screen_1_field; assert.deepEqual(Fm.dims, [3, 4]);
  sameNum(Fm.data[1 + 3 * 1], 5 / 7 + 1e-17, 'row 1, column 1 in column-major order'); sameNum(Fm.data[3], 1 / 7, 'row 0, column 1');
  assert.equal(vars.counts.cls, 12); assert.deepEqual(vars.counts.dims, [2, 3, 2]);
  assert.equal(vars.counts.data[1 + 2 * 2 + 6 * 1], 11 * 1000 - 5000, '(1, 2, 1) in column-major order');
  assert.equal(vars.bench.fields.elements.cells.length, 2); assert.equal(vars.bench.fields.elements.cells[0].fields.x.data[0], 1.25);
  assert.equal(vars.meta.fields.bench.data, 'A µ bench, with “quotes”');
});
const ctime = d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' +
  String(d.getDate()).padStart(2, ' ') + ' ' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':') + ' ' + d.getFullYear();

test('MATLAB read by scipy.io.loadmat: the same numbers, shapes, text, structs and cells', pyOpts, async () => {
  const { f } = await write(SET(), 'mat', 'set-py');
  const r = py(`import sys, json, numpy as np, scipy.io as sio
m = sio.loadmat(sys.argv[1], simplify_cells=True)
raw = sio.loadmat(sys.argv[1])
T = m['Screen_1_hits']
print(json.dumps({'header': m['__header__'].decode(), 'version': m['__version__'], 'keys': [k for k in m if not k.startswith('__')],
  'bits': [float(v).hex() for v in np.ravel(T['across_mm'])], 'shape': list(raw['Screen_1_hits']['across_mm'][0, 0].shape), 'src': [str(s) if not isinstance(s, np.ndarray) else '' for s in T['source']],
  'ok': [bool(v) for v in T['ok']], 'units': T['units']['across_mm'], 'field': m['Screen_1_field'].tolist(), 'counts': [str(m['counts'].dtype), list(m['counts'].shape), int(m['counts'][1, 2, 1])],
  'mask': [bool(v) for v in np.ravel(m['mask'])], 'bench': m['bench']['elements'][0]['x'], 'list': np.ravel(m['bench']['elements'][1]['list']).tolist(), 'meta': m['meta']['bench'],
  'lens': m['meta']['parts']['Lens_1']['surfaces'][0]['R']}))`, f);
  assert.match(r.header, /^MATLAB 5\.0 MAT-file, Platform: JEKray, Created on: /);
  assert.equal(r.version, '1.0');
  assert.deepEqual(r.keys, ['meta', 'Screen_1_hits', 'Screen_1_field', 'counts', 'mask', 'bench']);
  NUMS.forEach((v, i) => { if (!Number.isNaN(v)) assert.equal(r.bits[i], pyHex(v), 'scipy ' + i); });
  assert.deepEqual(r.shape, [10, 1], 'a column vector');
  assert.equal(r.src[5], 'é µ °'); assert.equal(r.src[3], 'line\nbreak'); assert.deepEqual(r.ok.slice(0, 2), [true, false]); assert.equal(r.units, 'mm');
  sameNum(r.field[1][1], 5 / 7 + 1e-17, 'field'); assert.deepEqual(r.counts, ['int32', [2, 3, 2], 6000]); assert.deepEqual(r.mask, [true, false, false, true, true]);
  assert.equal(r.bench, 1.25); assert.deepEqual(r.list, [1, 2, 3]); assert.equal(r.meta, 'A µ bench, with “quotes”'); assert.equal(r.lens, 51.5);
});

test('Excel: an About sheet with the context and each column’s unit, then a sheet for each item, numbers as numbers', async () => {
  const { bytes } = await write(SET(), 'xlsx', 'set'), F = unzip(bytes);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) assert.ok(F.has(p), p);
  const wb = F.get('xl/workbook.xml').toString(), names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(names, ['About', 'Screen 1 hits', 'Screen 1 field', 'counts', 'mask', 'bench']);
  for (let i = 1; i <= names.length; i++) assert.ok(F.get('[Content_Types].xml').toString().includes('/xl/worksheets/sheet' + i + '.xml'), 'sheet ' + i + ' has its type');
  const about = sheetCells(F.get('xl/worksheets/sheet1.xml').toString());
  assert.equal(about.A1, 'JEKray data: test'); assert.ok(Object.values(about).includes('A µ bench, with “quotes”')); assert.ok(Object.values(about).includes('% of its source'));
  assert.ok(Object.values(about).includes('surfaces[0].R'), 'the parts’ settings opened out');
  const S = sheetCells(F.get('xl/worksheets/sheet2.xml').toString());
  assert.equal(S.A1, 'across (mm)'); assert.equal(S.E1, 'power (% of its source)');
  NUMS.forEach((v, i) => { if (!Number.isNaN(v)) sameNum(S['A' + (i + 2)], v === 0 ? 0 : v, 'xlsx ' + i); else assert.equal(S['A' + (i + 2)], undefined, 'NaN is an empty cell'); });
  assert.equal(S.B5, 'line\nbreak'); assert.equal(S.C2, true); assert.equal(S.E9, 8); assert.equal(S.E10, undefined, 'the infinities are empty cells');
  assert.match(F.get('xl/worksheets/sheet2.xml').toString(), /<pane ySplit="1"/, 'the heading row frozen');
  assert.match(F.get('docProps/core.xml').toString(), /<dc:title>JEKray data: test: A µ bench, with “quotes”<\/dc:title>/);
});

test('Excel read by openpyxl: the sheets, numbers to the bit, text and the context', pyOpts, async () => {
  const { f } = await write(SET(), 'xlsx', 'set-py');
  const r = py(`import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Screen 1 hits']
col = [ws.cell(row=i, column=1).value for i in range(2, 12)]
print(json.dumps({'sheets': wb.sheetnames, 'head': [c.value for c in ws[1]], 'bits': [None if v is None else float(v).hex() for v in col], 'src': [ws.cell(row=i, column=2).value for i in range(2, 12)],
  'ok': ws['C2'].value, 'field': [[c.value for c in r] for r in wb['Screen 1 field'].iter_rows()], 'about': [[c.value for c in r] for r in wb['About'].iter_rows()],
  'title': wb.properties.title, 'creator': wb.properties.creator, 'bench': [[c.value for c in r] for r in wb['bench'].iter_rows()][:4]}))`, f);
  assert.deepEqual(r.sheets, ['About', 'Screen 1 hits', 'Screen 1 field', 'counts', 'mask', 'bench']);
  assert.deepEqual(r.head, ['across (mm)', 'source', 'ok', 'ray', 'power (% of its source)']);
  NUMS.forEach((v, i) => { if (Number.isNaN(v)) assert.equal(r.bits[i], null); else assert.equal(r.bits[i], pyHex(v === 0 ? 0 : v), 'openpyxl ' + i); });
  assert.equal(r.src[3], 'line\nbreak'); assert.equal(r.src[4], ' pad '); assert.equal(r.ok, true);
  assert.equal(r.field.length, 3); assert.equal(r.field[0].length, 4);
  assert.ok(r.about.some(row => row[0] === 'JEKray version' && row[1] === '9.9'));
  assert.equal(r.title, 'JEKray data: test: A µ bench, with “quotes”'); assert.equal(r.creator, 'JEKray 9.9');
  assert.deepEqual(r.bench[0], ['path', 'value']); assert.deepEqual(r.bench[1], ['name', 'Bench']);
});

test('a sheet past Excel’s rows says it is cut short; a long text cell too', async () => {
  const n = 1048580, set = { meta: { title: 't' }, items: [{ kind: 'table', name: 'long', cols: [{ name: 'i', values: Float64Array.from({ length: n }, (_, i) => i) }] }, { kind: 'value', name: 'v', value: { s: 'x'.repeat(40000) } }] };
  set.items[0].cols[0].values = Array.from(set.items[0].cols[0].values);
  const F = unzip((await D.dfWrite(set, 'xlsx', { deflate: false })).bytes), xml = F.get('xl/worksheets/sheet2.xml').toString();
  // (the heading and 1,048,575 rows fit; the last row says the 6 left are not there)
  assert.ok(/<row r="1048576"><c r="A1048576" t="inlineStr"><is><t>\(cut short: 6 more rows do not fit on a sheet/.test(xml), 'the last row says so');
  assert.ok(!xml.includes('r="1048577"'));
  assert.match(F.get('xl/worksheets/sheet3.xml').toString(), /cut short: a cell holds 32767 characters/);
});
