/* ==========================================================================
   Data files, written here with no library: a zip (stored, or deflated where the browser can), CSV, JSON,
   an Excel workbook (.xlsx), NumPy's .npz and MATLAB's .mat (Level 5). File › Export data and a script's
   save() hand these a set of named items, each a table (columns, each with its unit), an array (a shape and
   its numbers) or a value (anything JSON holds), with the context every file carries: the bench, JEKray's
   version, the date, the units, and the settings of the parts the numbers come from. Nothing here touches
   the page, so the Node tests read what it writes with Python's own readers. The layouts are documented in
   jek/docs/jekray/data-export.md: change one there too.
   ========================================================================== */

/* ---------- The data: a set of named items ----------
   set   { meta, items }: meta the context (title, bench, version, created, and the parts' settings as parts)
   table { kind: 'table', name, about, cols: [{ name, unit, type?, values }] }: type 'num', 'int', 'bool' or 'str',
         worked out from the values when not given (numbers, booleans, else text)
   array { kind: 'array', name, about, unit, dtype: 'f8' | 'i8' | 'i4' | 'u1' | 'b1', shape, data } (row-major, flat)
   value { kind: 'value', name, about, value }: anything JSON holds */
export const DATA_FORMATS = {
  csv: { label: 'CSV', ext: '.zip', mime: 'application/zip' },
  json: { label: 'JSON', ext: '.json', mime: 'application/json' },
  xlsx: { label: 'Excel', ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  npz: { label: 'NumPy', ext: '.npz', mime: 'application/octet-stream' },
  mat: { label: 'MATLAB', ext: '.mat', mime: 'application/x-matlab-data' },
};

const dfIsNum = v => typeof v === 'number';
/* a column's type, from its values when it does not say */
export function dfColType(c) {
  if (c.type) return c.type;
  let num = 0, bool = 0, other = 0;
  for (const v of c.values) {
    if (v === null || v === undefined) continue;
    if (dfIsNum(v)) num++; else if (typeof v === 'boolean') bool++; else other++;
  }
  return other || (num && bool) ? 'str' : bool ? 'bool' : 'num';
}
/* a value as text in a text column: numbers in full, objects as JSON */
export const dfText = v => (v === null || v === undefined ? '' : typeof v === 'string' ? v : dfIsNum(v) ? dfNum(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));
/* a number in full: the shortest text that reads back as the same float64; NaN as nothing, the infinities as inf */
export const dfNum = v => (Number.isFinite(v) ? String(v) : Number.isNaN(v) ? '' : v > 0 ? 'inf' : '-inf');
/* a column's heading, as a spreadsheet shows it: its name, its unit in brackets */
export const dfHead = c => c.name + (c.unit ? ' (' + c.unit + ')' : '');
/* a name a program can use (a MATLAB variable or field, a NumPy key): letters, digits and _, starting with a letter, 63 at most */
export function dfIdent(s, fallback = 'x') {
  let t = String(s == null ? '' : s).replace(/µ|μ/g, 'u').replace(/°/g, 'deg').replace(/%/g, 'pct').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/\//g, '_per_').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!t) t = fallback;
  if (!/^[A-Za-z]/.test(t)) t = fallback + '_' + t;
  return t.slice(0, 63).replace(/_+$/, '');
}
/* names made unique within a set (case aside, as a spreadsheet's sheets and Windows' files take them) */
export function dfUnique(names, max = 63, reserved = []) {
  const seen = new Set(reserved.map(n => n.toLowerCase()));
  return names.map(n => {
    let t = n.slice(0, max), k = 2;
    while (seen.has(t.toLowerCase())) { const s = '_' + k++; t = n.slice(0, max - s.length) + s; }
    seen.add(t.toLowerCase());
    return t;
  });
}
/* a column's key: its name and unit as one name a program can use (x_mm, power_pct) */
export const dfColKey = c => dfIdent(c.name + (c.unit ? '_' + c.unit : ''), 'col');
const dfColKeys = (T, reserved = []) => dfUnique(T.cols.map(dfColKey), 63, reserved);
/* a file's name in a zip: plain, no folders */
export const dfFileName = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'data';

/* ---------- What a script hands save(), as items ----------
   rows (a list of objects) or an object of equal-length lists: a table; a list of numbers (nested, rectangular),
   a typed array or NumPy's array: an array; an object of named things: one item each; anything else: a value */
const dfPlainObj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);
const dfIsRows = v => Array.isArray(v) && v.length > 0 && v.every(dfPlainObj) && !v.some(r => r.__ndarray__);
const dfPrim = v => v === null || ['number', 'string', 'boolean'].includes(typeof v);
function dfColumns(o) {
  if (!dfPlainObj(o) || o.__ndarray__) return null;
  const ks = Object.keys(o);
  if (!ks.length) return null;
  const vs = ks.map(k => (ArrayBuffer.isView(o[k]) ? Array.from(o[k], Number) : o[k]));
  if (!vs.every(v => Array.isArray(v) && v.every(dfPrim))) return null;
  const n = vs[0].length;
  return n > 0 && vs.every(v => v.length === n) ? ks.map((k, i) => ({ name: k, values: vs[i] })) : null;
}
const DF_TYPED = [[Float64Array, 'f8'], [Float32Array, 'f8'], [Int32Array, 'i4'], [Int16Array, 'i4'], [Int8Array, 'i4'], [Uint16Array, 'i4'],
  [Uint32Array, 'i8'], [Uint8Array, 'u1'], [Uint8ClampedArray, 'u1']];
const DF_NPDTYPE = { float64: 'f8', float32: 'f8', float16: 'f8', int64: 'i8', uint32: 'i8', int32: 'i4', int16: 'i4', int8: 'i4', uint16: 'i4', uint8: 'u1', bool: 'b1' };
/* a rectangular nest of numbers or booleans: { shape, data, dtype }, or null */
export function dfArrayOf(v) {
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    if (typeof BigInt64Array !== 'undefined' && (v instanceof BigInt64Array || v instanceof BigUint64Array)) return { shape: [v.length], data: Array.from(v, Number), dtype: 'i8' };
    const t = DF_TYPED.find(([C]) => v instanceof C);
    return { shape: [v.length], data: t && t[1] === 'f8' ? Float64Array.from(v) : Array.from(v), dtype: t ? t[1] : 'f8' };
  }
  if (dfPlainObj(v) && Array.isArray(v.__ndarray__) && Array.isArray(v.shape)) {       // NumPy's, from a Python script (ui/python.js)
    const n = v.shape.reduce((a, b) => a * b, 1), d = v.__ndarray__;
    if (d.length !== n || !d.every(x => x === null || dfIsNum(x) || typeof x === 'boolean')) return null;
    const dt = DF_NPDTYPE[v.dtype] || 'f8';
    return { shape: v.shape.slice(), data: d.map(x => (x === null ? NaN : dt === 'b1' ? !!x : +x)), dtype: dt };
  }
  if (!Array.isArray(v) || !v.length) return null;
  const shape = [];
  for (let a = v; Array.isArray(a); a = a[0]) { if (!a.length) return null; shape.push(a.length); }
  const data = [];
  let bool = 0, num = 0;
  const walk = (a, d) => {
    if (d === shape.length) {
      if (typeof a === 'boolean') bool++; else if (dfIsNum(a) || a === null) num++; else return false;
      data.push(a === null ? NaN : a);
      return true;
    }
    return Array.isArray(a) && a.length === shape[d] && a.every(x => walk(x, d + 1));
  };
  if (!walk(v, 0)) return null;
  if (bool && num) return null;
  return { shape, data: bool ? data : Float64Array.from(data), dtype: bool ? 'b1' : 'f8' };
}
/* one thing a script saves, as one item (or, for an object of named things, several) */
export function dfItemsOf(data, name) {
  name = String(name || 'data');
  if (dfIsRows(data)) {
    const keys = [...new Set(data.flatMap(r => Object.keys(r)))];
    return [{ kind: 'table', name, cols: keys.map(k => ({ name: k, values: data.map(r => (r[k] === undefined ? null : r[k])) })) }];
  }
  if (dfPlainObj(data)) {
    const cols = dfColumns(data);
    if (cols) return [{ kind: 'table', name, cols }];
    const A = dfArrayOf(data);
    if (A) return [Object.assign({ kind: 'array', name }, A)];
    const ks = Object.keys(data);
    if (ks.length && ks.every(k => dfIsRows(data[k]) || dfColumns(data[k]) || dfArrayOf(data[k]))) return ks.flatMap(k => dfItemsOf(data[k], k));
    return [{ kind: 'value', name, value: data }];
  }
  const A = dfArrayOf(data);
  if (A) return [Object.assign({ kind: 'array', name }, A)];
  return [{ kind: 'value', name, value: data === undefined ? null : data }];
}

/* JSON for anything: non-finite numbers as null (JSON has none), typed arrays as lists */
const dfJsonSafe = v => JSON.parse(JSON.stringify(v === undefined ? null : v, (k, x) => (ArrayBuffer.isView(x) && !(x instanceof DataView) ? Array.from(x, Number)
  : typeof x === 'bigint' ? Number(x) : x)));
/* an object as rows of path and value, for a sheet or a text file: nested objects and lists of objects opened out,
   a list of plain values kept as one JSON value */
export function dfFlat(v, path = '', out = []) {
  if (v !== null && typeof v === 'object' && !ArrayBuffer.isView(v)) {
    const arr = Array.isArray(v);
    if (arr && v.every(dfPrim)) { out.push([path, JSON.stringify(v)]); return out; }
    const ks = Object.keys(v);
    if (!ks.length) { out.push([path, arr ? '[]' : '{}']); return out; }
    for (const k of ks) dfFlat(v[k], arr ? path + '[' + k + ']' : path ? path + '.' + k : k, out);
    return out;
  }
  if (ArrayBuffer.isView(v)) { out.push([path, JSON.stringify(Array.from(v, Number))]); return out; }
  out.push([path, v === undefined ? null : v]);
  return out;
}
/* the context as plain lines: what README.txt and a sheet's About open with */
function dfMetaPairs(meta) {
  const out = [];
  for (const [k, v] of Object.entries(meta || {})) if (k !== 'parts' && k !== 'items' && k !== 'title' && v !== undefined && v !== null && v !== '') out.push([DF_META_LABEL[k] || k, typeof v === 'object' ? JSON.stringify(v) : v]);
  return out;
}
const DF_META_LABEL = { title: 'What', bench: 'Bench', tab: 'Tab', version: 'JEKray version', created: 'Created', source: 'Made by', script: 'Script', note: 'Note' };
/* what each item is, for the file's own description of itself */
export function dfDescribe(item) {
  if (item.kind === 'table') return { kind: 'table', about: item.about || '', rows: item.cols.length ? item.cols[0].values.length : 0, columns: item.cols.map(c => ({ name: c.name, unit: c.unit || '', key: dfColKey(c), type: dfColType(c) })) };
  if (item.kind === 'array') return { kind: 'array', about: item.about || '', unit: item.unit || '', shape: item.shape, dtype: DF_DTYPE_NAME[item.dtype] };
  return { kind: 'value', about: item.about || '' };
}
const DF_DTYPE_NAME = { f8: 'float64', i8: 'int64', i4: 'int32', u1: 'uint8', b1: 'bool' };
/* the context with what each item holds, for the files that carry it whole (JSON, NumPy, MATLAB) */
export const dfMetaFull = set => Object.assign({}, set.meta, { items: Object.fromEntries(set.items.map(it => [it.name, dfDescribe(it)])) });

/* ---------- Zip ----------
   Entries stored, or deflated (CompressionStream's deflate-raw: Chrome and Edge 103, Firefox 113, Safari 16.4, Node 18)
   where that is smaller; a browser without it stores them all, which every reader takes as well */
const DF_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function dfCrc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = DF_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const dfUtf8 = s => new TextEncoder().encode(s);
export function dfDeflateOk() {
  try { if (typeof CompressionStream === 'undefined') return false; new CompressionStream('deflate-raw'); return true; } catch (err) { return false; }
}
async function dfDeflateRaw(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const dfDosTime = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dfDosDate = d => ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
/* files [{ name, data: Uint8Array or text }] as one zip's bytes; o.deflate false to store them all; o.date their time */
export async function dfZip(files, o = {}) {
  const date = o.date ? new Date(o.date) : new Date(), tm = dfDosTime(date), dt = dfDosDate(date);
  const z = o.deflate !== false && dfDeflateOk(), locals = [], central = [];
  let off = 0;
  for (const f of files) {
    const raw = typeof f.data === 'string' ? dfUtf8(f.data) : f.data, name = dfUtf8(f.name), crc = dfCrc32(raw);
    let body = raw, method = 0;
    if (z && raw.length > 128) { try { const d = await dfDeflateRaw(raw); if (d.length < raw.length) { body = d; method = 8; } } catch (err) { /* stored */ } }
    if (off + body.length > 0xfffffff0) throw new Error('the data is too big for one zip file (4 GB)');
    const head = (sig, extra) => {
      const b = new Uint8Array(extra), v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      return [b, v];
    };
    const [L, lv] = head(0x04034b50, 30 + name.length);
    lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true); lv.setUint16(10, tm, true); lv.setUint16(12, dt, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, name.length, true);
    L.set(name, 30);
    const [C, cv] = head(0x02014b50, 46 + name.length);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(12, tm, true); cv.setUint16(14, dt, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true);
    C.set(name, 46);
    locals.push(L, body); central.push(C);
    off += L.length + body.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0), E = new Uint8Array(22), ev = new DataView(E.buffer);
  if (files.length > 0xffff) throw new Error('too many files for one zip');
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
  return dfConcat([...locals, ...central, E]);
}
export function dfConcat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------- CSV (RFC 4180) ----------
   One heading row, each column named with its unit in brackets ("x (mm)"), as Excel and pandas take it; then a row
   for each record. Numbers in full (the shortest text that reads back exactly); a missing number blank, the
   infinities inf and -inf; text quoted where it holds a comma, a quote or a line break. Lines end CRLF, and the
   file opens with a byte-order mark so Excel reads µ and ° as they are (pandas and Python's csv, with
   encoding='utf-8-sig', read past it). */
const dfCsvCell = s => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const DF_BOM = '﻿';
export function dfCsvRows(rows) { return DF_BOM + rows.map(r => r.map(v => dfCsvCell(dfIsNum(v) ? dfNum(v) : dfText(v))).join(',')).join('\r\n') + '\r\n'; }
/* a table as CSV text */
export function dfTableCsv(T) {
  const n = T.cols.length ? T.cols[0].values.length : 0, rows = [T.cols.map(dfHead)];
  const ty = T.cols.map(dfColType);
  for (let i = 0; i < n; i++) rows.push(T.cols.map((c, j) => { const v = c.values[i]; return ty[j] === 'str' ? dfText(v) : v === null || v === undefined ? '' : ty[j] === 'bool' ? (v ? 'TRUE' : 'FALSE') : +v; }));
  return dfCsvRows(rows);
}
/* an array as CSV text: one column (1-D, headed with its unit), the matrix itself (2-D, no heading), or one row
   for each element with its indices (3-D and up) */
export function dfArrayCsv(A) {
  const v = x => (A.dtype === 'b1' ? (x ? 'TRUE' : 'FALSE') : x);
  if (A.shape.length <= 1) return dfCsvRows([['value' + (A.unit ? ' (' + A.unit + ')' : '')], ...Array.from(A.data, x => [v(x)])]);
  if (A.shape.length === 2) {
    const [r, c] = A.shape, rows = [];
    for (let i = 0; i < r; i++) { const row = new Array(c); for (let j = 0; j < c; j++) row[j] = v(A.data[i * c + j]); rows.push(row); }
    return dfCsvRows(rows);
  }
  const rows = [[...A.shape.map((_, k) => 'i' + k), 'value' + (A.unit ? ' (' + A.unit + ')' : '')]], N = A.data.length, idx = new Array(A.shape.length).fill(0);
  for (let q = 0; q < N; q++) {
    rows.push([...idx, v(A.data[q])]);
    for (let k = A.shape.length - 1; k >= 0; k--) { if (++idx[k] < A.shape[k]) break; idx[k] = 0; }
  }
  return dfCsvRows(rows);
}
/* README.txt: the context, then each file and what is in it, column by column */
function dfReadme(set, names) {
  const L = [set.meta.title || 'JEKray data', ''];
  for (const [k, v] of dfMetaPairs(set.meta)) L.push(k + ': ' + v);
  L.push('', 'Each table is a CSV file: one heading row, each column named with its unit in brackets, then one row for each record.',
    'Numbers are given in full; a missing number is left blank. The files are UTF-8 with a byte-order mark (Excel opens them as they are;',
    "in Python: pandas.read_csv('file.csv'), or csv.reader(open('file.csv', encoding='utf-8-sig'))).", '');
  set.items.forEach((it, i) => {
    const D = dfDescribe(it);
    L.push(names[i] + (it.about ? ': ' + it.about : ''));
    if (it.kind === 'table') { L.push('  ' + D.rows + ' row' + (D.rows === 1 ? '' : 's') + '. Columns:'); for (const c of D.columns) L.push('    ' + dfHead(c) + (c.type === 'str' ? ' (text)' : c.type === 'bool' ? ' (TRUE or FALSE)' : '')); }
    else if (it.kind === 'array') L.push('  An array of ' + it.shape.join(' x ') + (it.unit ? ', in ' + it.unit : '') + (it.shape.length === 2 ? ': the matrix itself, row by row, with no heading.' : it.shape.length > 2 ? ': one row for each element, its indices first.' : ': one column.'));
    else L.push('  As JSON.');
    L.push('');
  });
  if (set.meta.parts && Object.keys(set.meta.parts).length) L.push('The settings of the parts these numbers come from are in meta.json (parts), with all of the above.', '');
  return L.join('\r\n');
}
/* the CSV export: a zip of one CSV file for each table or array, JSON for a value, README.txt and meta.json */
export async function dfCsvZip(set, o = {}) {
  const names = dfUnique(set.items.map(it => dfFileName(it.name)), 76, ['README', 'meta']).map((n, i) => n + (set.items[i].kind === 'value' ? '.json' : '.csv'));
  const files = [{ name: 'README.txt', data: dfReadme(set, names) }, { name: 'meta.json', data: JSON.stringify(dfJsonSafe(dfMetaFull(set)), null, 1) + '\n' }];
  set.items.forEach((it, i) => files.push({ name: names[i], data: it.kind === 'table' ? dfTableCsv(it) : it.kind === 'array' ? dfArrayCsv(it) : JSON.stringify(dfJsonSafe(it.value), null, 1) + '\n' }));
  return dfZip(files, Object.assign({ date: set.meta.created }, o));
}

/* ---------- JSON ----------
   { format: 'JEKray data', meta, tables: { name: { about, columns: [{ name, unit, key }], data: { key: [...] } } },
     arrays: { name: { about, unit, dtype, shape, data: nested lists } }, values: { name: … } }: a table's data by
   column, so pandas.DataFrame(d['tables'][name]['data']) is the table; a missing or non-finite number is null */
function dfNest(A) {
  const conv = x => (A.dtype === 'b1' ? !!x : Number.isFinite(x) ? x : null);
  if (A.shape.length <= 1) return Array.from(A.data, conv);
  const rec = (d, o) => { if (d === A.shape.length - 1) return Array.from(A.data.slice(o, o + A.shape[d]), conv); const st = A.shape.slice(d + 1).reduce((a, b) => a * b, 1), out = []; for (let i = 0; i < A.shape[d]; i++) out.push(rec(d + 1, o + i * st)); return out; };
  return rec(0, 0);
}
export function dfJson(set) {
  const out = { format: 'JEKray data', meta: dfJsonSafe(set.meta), tables: {}, arrays: {}, values: {} };
  for (const it of set.items) {
    if (it.kind === 'table') {
      const keys = dfColKeys(it), ty = it.cols.map(dfColType), data = {};
      it.cols.forEach((c, j) => { data[keys[j]] = c.values.map(v => (ty[j] === 'str' ? (v === null || v === undefined ? null : dfText(v)) : ty[j] === 'bool' ? (v === null || v === undefined ? null : !!v) : Number.isFinite(+v) && v !== null && v !== undefined ? +v : null)); });
      out.tables[it.name] = { about: it.about || '', columns: it.cols.map((c, j) => ({ name: c.name, unit: c.unit || '', key: keys[j], type: ty[j] })), data };
    } else if (it.kind === 'array') out.arrays[it.name] = { about: it.about || '', unit: it.unit || '', dtype: DF_DTYPE_NAME[it.dtype], shape: it.shape, data: dfNest(it) };
    else out.values[it.name] = dfJsonSafe(it.value);
  }
  return JSON.stringify(out, null, 1) + '\n';
}

/* ---------- Excel (.xlsx) ----------
   The smallest workbook Excel, LibreOffice, Numbers and openpyxl open: a first sheet About (the context, each sheet
   and what it holds, each column's unit, the parts' settings), then one sheet for each item: a table with its
   heading row bold and frozen, numbers as numbers and text as inline strings; an array as its column (1-D), its
   matrix (2-D) or a row for each element with its indices; a value opened out as path and value. Sheet names are
   31 characters at most, without []:*?/\ and unique. A sheet holds 1,048,576 rows: past that it says it is cut short. */
const DF_XL_ROWS = 1048576, DF_XL_TEXT = 32767;
const dfXml = s => String(s).replace(/[^\x09\x0a\x0d\x20-퟿-�\u{10000}-\u{10ffff}]/gu, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function dfColLetter(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }
export const dfSheetName = s => (String(s).replace(/[[\]:*?/\\\x00-\x1f]+/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31).trim();
function dfXlCell(ref, v, bold) {
  const s = bold ? ' s="1"' : '';
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"' + s + '><v>' + (v ? 1 : 0) + '</v></c>';
  if (dfIsNum(v)) return Number.isFinite(v) ? '<c r="' + ref + '"' + s + '><v>' + String(v) + '</v></c>' : '';
  let t = String(v);
  if (t.length > DF_XL_TEXT) t = t.slice(0, DF_XL_TEXT - 40) + ' … (cut short: a cell holds 32767 characters)';
  return '<c r="' + ref + '" t="inlineStr"' + s + '><is><t' + (/^\s|\s$/.test(t) ? ' xml:space="preserve"' : '') + '>' + dfXml(t) + '</t></is></c>';
}
/* a sheet's XML from its rows (lists of values); head: how many rows at the top are headings (bold, the first frozen) */
function dfSheetXml(rows, head = 0, widths = null) {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
  if (head) out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + head + '" topLeftCell="A' + (head + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  if (widths && widths.length) out.push('<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>');
  out.push('<sheetData>');
  const n = Math.min(rows.length, DF_XL_ROWS);
  for (let i = 0; i < n; i++) {
    let r = rows[i];
    if (i === DF_XL_ROWS - 1 && rows.length > DF_XL_ROWS) r = ['(cut short: ' + (rows.length - DF_XL_ROWS + 1) + ' more rows do not fit on a sheet; export as CSV, NumPy or MATLAB for all of them)'];
    const cells = r.slice(0, 16384).map((v, j) => dfXlCell(dfColLetter(j) + (i + 1), v, i < head)).join('');
    out.push('<row r="' + (i + 1) + '">' + cells + '</row>');
  }
  out.push('</sheetData></worksheet>');
  return out.join('');
}
/* an item's rows on its sheet, and how many of them are headings */
function dfItemRows(it) {
  if (it.kind === 'table') {
    const n = it.cols.length ? it.cols[0].values.length : 0, ty = it.cols.map(dfColType), rows = [it.cols.map(dfHead)];
    for (let i = 0; i < n; i++) rows.push(it.cols.map((c, j) => { const v = c.values[i]; return v === null || v === undefined ? null : ty[j] === 'str' ? dfText(v) : ty[j] === 'bool' ? !!v : +v; }));
    return [rows, 1];
  }
  if (it.kind === 'array') {
    const v = x => (it.dtype === 'b1' ? !!x : x);
    if (it.shape.length <= 1) return [[['value' + (it.unit ? ' (' + it.unit + ')' : '')], ...Array.from(it.data, x => [v(x)])], 1];
    if (it.shape.length === 2) { const [r, c] = it.shape, rows = []; for (let i = 0; i < r; i++) rows.push(Array.from(it.data.slice(i * c, i * c + c), v)); return [rows, 0]; }
    const rows = [[...it.shape.map((_, k) => 'i' + k), 'value' + (it.unit ? ' (' + it.unit + ')' : '')]], idx = new Array(it.shape.length).fill(0);
    for (let q = 0; q < it.data.length; q++) { rows.push([...idx, v(it.data[q])]); for (let k = it.shape.length - 1; k >= 0; k--) { if (++idx[k] < it.shape[k]) break; idx[k] = 0; } }
    return [rows, 1];
  }
  return [[['path', 'value'], ...dfFlat(it.value).map(([p, v]) => [p, v])], 1];
}
function dfAboutRows(set, sheets) {
  const rows = [[set.meta.title || 'JEKray data']];
  for (const [k, v] of dfMetaPairs(set.meta)) rows.push([k, v]);
  rows.push([], ['Sheet', 'Holds', 'Size']);
  set.items.forEach((it, i) => {
    const D = dfDescribe(it);
    rows.push([sheets[i], it.about || (it.kind === 'value' ? 'settings, as path and value' : ''), it.kind === 'table' ? D.rows + ' rows' : it.kind === 'array' ? it.shape.join(' x ') + (it.shape.length === 2 ? ' (the matrix itself, no heading)' : '') : '']);
  });
  const tabs = set.items.filter(it => it.kind === 'table');
  if (tabs.length) {
    rows.push([], ['Sheet', 'Column', 'Unit']);
    set.items.forEach((it, i) => { if (it.kind === 'table') for (const c of it.cols) rows.push([sheets[i], c.name, c.unit || '']); });
  }
  const P = set.meta.parts && Object.keys(set.meta.parts).length ? set.meta.parts : null;
  if (P) {
    rows.push([], ['Part', 'Setting', 'Value']);
    for (const [name, s] of Object.entries(P)) for (const [p, v] of dfFlat(s)) rows.push([name, p, v]);
  }
  return rows;
}
export async function dfXlsx(set, o = {}) {
  const sheets = dfUnique(set.items.map(it => dfSheetName(it.name)), 31, ['About', 'History']);
  const all = ['About', ...sheets], W = 'http://schemas.openxmlformats.org/', ct = 'application/vnd.openxmlformats-';
  const created = (set.meta.created ? new Date(set.meta.created) : new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="' + W + 'package/2006/content-types">' +
      '<Default Extension="rels" ContentType="' + ct + 'package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + ct + 'officedocument.spreadsheetml.sheet.main+xml"/>' +
      all.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + ct + 'officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="' + ct + 'officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="' + ct + 'package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="' + ct + 'officedocument.extended-properties+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="' + W + 'package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + W + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="' + W + 'package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + W + 'officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>' },
    { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="' + W + 'package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + dfXml((set.meta.title || 'JEKray data') + (set.meta.bench ? ': ' + set.meta.bench : '')) + '</dc:title><dc:creator>JEKray' + (set.meta.version ? ' ' + dfXml(set.meta.version) : '') + '</dc:creator>' +
      '<dc:description>' + dfXml(dfMetaPairs(set.meta).map(([k, v]) => k + ': ' + v).join('; ')) + '</dc:description>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + created + '</dcterms:created></cp:coreProperties>' },
    { name: 'docProps/app.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="' + W + 'officeDocument/2006/extended-properties"><Application>JEKray</Application></Properties>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="' + W + 'spreadsheetml/2006/main" xmlns:r="' + W + 'officeDocument/2006/relationships"><sheets>' +
      all.map((n, i) => '<sheet name="' + dfXml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="' + W + 'package/2006/relationships">' +
      all.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + W + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (all.length + 1) + '" Type="' + W + 'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="' + W + 'spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: dfSheetXml(dfAboutRows(set, sheets), 0, [24, 60, 28]) },
  ];
  set.items.forEach((it, i) => { const [rows, head] = dfItemRows(it); files.push({ name: 'xl/worksheets/sheet' + (i + 2) + '.xml', data: dfSheetXml(rows, head) }); });
  return dfZip(files, Object.assign({ date: set.meta.created }, o));
}

/* ---------- NumPy (.npz) ----------
   A zip of .npy files (format 1.0), as numpy.savez writes: each table's columns as arrays of their own, named
   table/column_unit ('screens/x_mm'); each array as itself, with its shape; text as fixed-width unicode ('<U');
   a value, and the context (meta: the bench, version, date, every item's columns and units, the parts'
   settings), as JSON text in a 0-d unicode array, so json.loads(str(d['meta'])) reads it, with no pickle */
const DF_NPY = { f8: ['<f8', 8], i8: ['<i8', 8], i4: ['<i4', 4], u1: ['|u1', 1], b1: ['|b1', 1] };
export function dfNpy(descr, shape, body) {
  const sh = '(' + shape.join(', ') + (shape.length === 1 ? ',' : '') + ')';
  let h = "{'descr': '" + descr + "', 'fortran_order': False, 'shape': " + sh + ', }';
  const pad = 64 - ((10 + h.length + 1) % 64);
  h += ' '.repeat(pad % 64) + '\n';
  const head = new Uint8Array(10 + h.length);
  head.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0], 0);
  new DataView(head.buffer).setUint16(8, h.length, true);
  for (let i = 0; i < h.length; i++) head[10 + i] = h.charCodeAt(i);
  return dfConcat([head, body]);
}
function dfNumBody(dtype, data) {
  const [, size] = DF_NPY[dtype], n = data.length, b = new Uint8Array(n * size), v = new DataView(b.buffer);
  for (let i = 0; i < n; i++) {
    const x = data[i];
    if (dtype === 'f8') v.setFloat64(8 * i, x === null || x === undefined ? NaN : +x, true);
    else if (dtype === 'i8') v.setBigInt64(8 * i, BigInt(Math.trunc(+x || 0)), true);
    else if (dtype === 'i4') v.setInt32(4 * i, +x || 0, true);
    else b[i] = dtype === 'b1' ? (x ? 1 : 0) : (+x || 0) & 255;
  }
  return b;
}
/* text as '<U': each string its code points, UTF-32 little-endian, padded to the longest */
export function dfNpyText(strs, shape) {
  const cps = strs.map(s => Array.from(String(s), c => c.codePointAt(0))), w = Math.max(1, ...cps.map(c => c.length));
  const b = new Uint8Array(cps.length * w * 4), v = new DataView(b.buffer);
  cps.forEach((c, i) => c.forEach((p, j) => v.setUint32(4 * (i * w + j), p, true)));
  return dfNpy('<U' + w, shape || [strs.length], b);
}
export async function dfNpz(set, o = {}) {
  const files = [], names = dfUnique(set.items.map(it => dfIdent(it.name, 'item')), 63, ['meta']);
  files.push({ name: 'meta.npy', data: dfNpyText([JSON.stringify(dfJsonSafe(dfMetaFull(set)))], []) });
  set.items.forEach((it, i) => {
    if (it.kind === 'table') {
      const keys = dfColKeys(it);
      it.cols.forEach((c, j) => {
        const ty = dfColType(c), n = c.values.length, name = names[i] + '/' + keys[j] + '.npy';
        if (ty === 'str') files.push({ name, data: dfNpyText(c.values.map(dfText), [n]) });
        else if (ty === 'bool' && !c.values.some(v => v === null || v === undefined)) files.push({ name, data: dfNpy('|b1', [n], dfNumBody('b1', c.values)) });
        else if (ty === 'int' && c.values.every(v => Number.isInteger(v))) files.push({ name, data: dfNpy('<i8', [n], dfNumBody('i8', c.values)) });
        else files.push({ name, data: dfNpy('<f8', [n], dfNumBody('f8', c.values.map(v => (v === null || v === undefined ? NaN : +v)))) });
      });
    } else if (it.kind === 'array') files.push({ name: names[i] + '.npy', data: dfNpy(DF_NPY[it.dtype][0], it.shape, dfNumBody(it.dtype, it.data)) });
    else files.push({ name: names[i] + '.npy', data: dfNpyText([JSON.stringify(dfJsonSafe(it.value))], []) });
  });
  return dfZip(files, Object.assign({ date: set.meta.created }, o));
}

/* ---------- MATLAB (.mat, Level 5) ----------
   The 128-byte header ("MATLAB 5.0 MAT-file, Platform: JEKray, Created on: …"), little-endian, then a variable for
   each item, uncompressed: a table as a struct of column vectors (numbers as double, text as a cell of char,
   true/false as logical), with its units (a struct of the columns' units) and headings (a cell); an array as a
   double (or integer, or logical) array of its shape (a 1-D one as a column); a value as structs, cells, char,
   double and logical, nested as it is; and meta, the context, as a struct. MATLAB's load and scipy.io.loadmat read it. */
const MI = { INT8: 1, UINT8: 2, UTF8: 16, INT32: 5, UINT32: 6, DOUBLE: 9, INT64: 12, MATRIX: 14 };
const MX = { CELL: 1, STRUCT: 2, CHAR: 4, DOUBLE: 6, UINT8: 9, INT32: 12, INT64: 14 };
const DF_MAT_CLASS = { f8: [MX.DOUBLE, MI.DOUBLE, 8], i8: [MX.INT64, MI.INT64, 8], i4: [MX.INT32, MI.INT32, 4], u1: [MX.UINT8, MI.UINT8, 1], b1: [MX.UINT8, MI.UINT8, 1] };
/* one data element: its tag (type, bytes) and its bytes, padded to 8 */
function dfMatEl(type, body) {
  const pad = (8 - (body.length % 8)) % 8, out = new Uint8Array(8 + body.length + pad), v = new DataView(out.buffer);
  v.setUint32(0, type, true); v.setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}
function dfU32s(list, signed) { const b = new Uint8Array(4 * list.length), v = new DataView(b.buffer); list.forEach((x, i) => (signed ? v.setInt32(4 * i, x, true) : v.setUint32(4 * i, x >>> 0, true))); return b; }
const dfAscii = s => Uint8Array.from(String(s), c => c.charCodeAt(0) & 127);
/* a matrix element: class, dims, name and what follows (its data, or a cell's or struct's elements) */
function dfMatrix(cls, dims, name, rest, logical) {
  const flags = dfMatEl(MI.UINT32, dfU32s([cls | (logical ? 0x0200 : 0), 0])), D = dfMatEl(MI.INT32, dfU32s(dims, true)), N = dfMatEl(MI.INT8, dfAscii(name));
  return dfMatEl(MI.MATRIX, dfConcat([flags, D, N, ...rest]));
}
/* row-major data of a shape, as MATLAB's column-major order */
function dfColMajor(shape, data) {
  if (shape.length < 2) return data;
  const n = data.length, out = new Array(n), st = shape.map((_, k) => shape.slice(k + 1).reduce((a, b) => a * b, 1)), idx = new Array(shape.length).fill(0);
  for (let q = 0; q < n; q++) {                   // q runs column-major: the first index fastest
    let o = 0; for (let k = 0; k < shape.length; k++) o += idx[k] * st[k];
    out[q] = data[o];
    for (let k = 0; k < shape.length; k++) { if (++idx[k] < shape[k]) break; idx[k] = 0; }
  }
  return out;
}
function dfMatNum(name, dtype, shape, data) {
  const [cls, mi] = DF_MAT_CLASS[dtype], dims = shape.length === 0 ? [1, 1] : shape.length === 1 ? [shape[0], 1] : shape;
  const flat = dfColMajor(shape, Array.from(data)), body = dtype === 'f8' ? dfNumBody('f8', flat) : dtype === 'i8' ? dfNumBody('i8', flat) : dtype === 'i4' ? dfNumBody('i4', flat) : dfNumBody(dtype === 'b1' ? 'b1' : 'u1', flat);
  return dfMatrix(cls, dims, name, [dfMatEl(mi, body)], dtype === 'b1');
}
function dfMatChar(name, s) {
  // UTF-8, as MATLAB writes text and scipy reads it, a character for each of MATLAB's (one beyond those is a ?)
  const t = String(s).replace(/[\ud800-\udfff]+/g, m => '?'.repeat(Math.ceil(m.length / 2)));
  return dfMatrix(MX.CHAR, t.length ? [1, t.length] : [0, 0], name, [dfMatEl(MI.UTF8, dfUtf8(t))]);
}
const dfMatCell = (name, els, dims) => dfMatrix(MX.CELL, dims || [els.length, 1], name, els);
function dfMatStruct(name, fields) {
  const keys = dfUnique(fields.map(([k]) => dfIdent(k, 'f')), 63), len = Math.max(1, ...keys.map(k => k.length)) + 1;
  const names = new Uint8Array(len * keys.length);
  keys.forEach((k, i) => names.set(dfAscii(k), i * len));
  return dfMatrix(MX.STRUCT, [1, 1], name, [dfMatEl(MI.INT32, dfU32s([len], true)), dfMatEl(MI.INT8, names), ...fields.map(([, el]) => el)]);
}
/* anything JSON holds, as MATLAB's own: struct, cell, char, double, logical */
function dfMatValue(name, v) {
  if (v === null || v === undefined) return dfMatNum(name, 'f8', [0, 0], []);
  if (typeof v === 'boolean') return dfMatNum(name, 'b1', [1, 1], [v]);
  if (dfIsNum(v)) return dfMatNum(name, 'f8', [1, 1], [v]);
  if (typeof v === 'string') return dfMatChar(name, v);
  if (ArrayBuffer.isView(v)) return dfMatNum(name, 'f8', [1, v.length], Array.from(v, Number));
  if (Array.isArray(v)) {
    if (!v.length) return dfMatCell(name, [], [0, 0]);
    const A = dfArrayOf(v);
    if (A) return dfMatNum(name, A.dtype, A.shape.length === 1 ? [1, A.shape[0]] : A.shape, A.data);
    return dfMatCell(name, v.map(x => dfMatValue('', x)), [1, v.length]);
  }
  return dfMatStruct(name, Object.entries(v).filter(([, x]) => x !== undefined && typeof x !== 'function').map(([k, x]) => [k, dfMatValue('', x)]));
}
function dfMatTable(name, T) {
  const keys = dfColKeys(T, ['about', 'units', 'headings']), fields = [];
  T.cols.forEach((c, j) => {
    const ty = dfColType(c), n = c.values.length;
    if (ty === 'str') fields.push([keys[j], dfMatCell('', c.values.map(v => dfMatChar('', dfText(v))), [n, 1])]);
    else if (ty === 'bool' && !c.values.some(v => v === null || v === undefined)) fields.push([keys[j], dfMatNum('', 'b1', [n], c.values)]);
    else fields.push([keys[j], dfMatNum('', 'f8', [n], c.values.map(v => (v === null || v === undefined ? NaN : +v)))]);
  });
  fields.push(['about', dfMatChar('', T.about || '')]);
  fields.push(['units', dfMatStruct('', T.cols.map((c, j) => [keys[j], dfMatChar('', c.unit || '')]))]);
  fields.push(['headings', dfMatCell('', T.cols.map(c => dfMatChar('', dfHead(c))), [1, T.cols.length])]);
  return dfMatStruct(name, fields);
}
const DF_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* MATLAB's own date in the header: Fri Oct 23 10:00:00 2026 */
const dfCtime = d => DF_DAYS[d.getDay()] + ' ' + DF_MONTHS[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, ' ') + ' ' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':') + ' ' + d.getFullYear();
export function dfMat(set) {
  const date = set.meta.created ? new Date(set.meta.created) : new Date();
  const text = 'MATLAB 5.0 MAT-file, Platform: JEKray, Created on: ' + dfCtime(date), head = new Uint8Array(128);
  head.fill(32, 0, 116);
  head.set(dfAscii(text.slice(0, 116)), 0);
  head[124] = 0x00; head[125] = 0x01; head[126] = 0x49; head[127] = 0x4d;        // version 0x0100; 'IM': little-endian
  const names = dfUnique(set.items.map(it => dfIdent(it.name, 'v')), 63, ['meta']), els = [head, dfMatValue('meta', dfJsonSafe(dfMetaFull(set)))];
  set.items.forEach((it, i) => {
    if (it.kind === 'table') els.push(dfMatTable(names[i], it));
    else if (it.kind === 'array') els.push(dfMatNum(names[i], it.dtype, it.shape, it.dtype === 'f8' ? Array.from(it.data, x => (x === null ? NaN : x)) : it.data));
    else els.push(dfMatValue(names[i], dfJsonSafe(it.value)));
  });
  return dfConcat(els);
}

/* the set as a file in the format named: { bytes, ext, mime } */
export async function dfWrite(set, fmt, o = {}) {
  const F = DATA_FORMATS[fmt];
  if (!F) throw new Error('no such format: ' + fmt);
  const bytes = fmt === 'csv' ? await dfCsvZip(set, o) : fmt === 'json' ? dfUtf8(dfJson(set)) : fmt === 'xlsx' ? await dfXlsx(set, o) : fmt === 'npz' ? await dfNpz(set, o) : dfMat(set);
  return { bytes, ext: F.ext, mime: F.mime };
}
