/* ---------- Comparing and merging benches ----------
   A saved bench is a few bench-wide settings and some lists keyed by id: elements, fibres, the
   tabs (benches), the parts it carries (library). Two versions are compared item by item and
   field by field; three (a common base and the two sides that grew from it) merge the git way:
   a change on one side goes in, the same change on both goes in once, and a different change
   to the same field (or one side changing what the other removed) is a conflict to be chosen.
   Nothing here knows the physics: the merged bench is for the person to look at before keeping. */

/* the lists keyed by id, and the settings compared whole; the rest (format, version, saved,
   the name) is left to the bench the merge lands in */
const KEYED = ['elements', 'fibres', 'benches', 'library'];
const SETTINGS = ['view', 'snap', 'maxBounces', 'minPower', 'ghosts', 'light', 'cavityLock', 'notes', 'labelMm', 'style', 'tab', 'measures', 'mods'];
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const copy = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const listOf = (p, k) => Array.isArray(p && p[k]) ? p[k].filter(e => e && typeof e === 'object' && typeof e.id === 'string') : [];
const mapOf = (p, k) => new Map(listOf(p, k).map(e => [e.id, e]));
/* what an item is called, for a person */
export function itemLabel(kind, e) {
  if (!e) return '';
  if (kind === 'elements') return (e.name || e.type || 'element') + (e.type && e.name && e.name.toLowerCase() !== e.type.toLowerCase() ? ' (' + e.type + ')' : '');
  if (kind === 'fibres') return (e.wire ? 'wire ' : 'fibre ') + (Array.isArray(e.a) ? e.a[0] : '?') + ' to ' + (Array.isArray(e.b) ? e.b[0] : '?');
  if (kind === 'benches') return 'tab “' + (e.name || e.id) + '”';
  if (kind === 'library') return 'part “' + (e.name || e.id) + '”';
  return e.id;
}
export const KIND_WORD = { elements: 'element', fibres: 'fibre', benches: 'tab', library: 'part', settings: 'setting' };
/* a value as a person reads it */
export function showValue(v) {
  if (v === undefined || v === null) return 'none';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toPrecision(5));
  if (typeof v === 'string') return v.length > 40 ? '“' + v.slice(0, 37) + '…”' : '“' + v + '”';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  const s = JSON.stringify(v);
  return s.length > 48 ? s.slice(0, 45) + '…' : s;
}
/* the fields of two items that differ: [{key, from, to}] */
function fieldDiff(a, b) {
  const out = [];
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (key === 'id' || same(a && a[key], b && b[key])) continue;
    out.push({ key, from: copy(a && a[key]), to: copy(b && b[key]) });
  }
  return out;
}
/* ---------- compare ----------
   from a to b: for each keyed list, the items added, removed and changed (with their fields);
   and the settings that differ. `count` is the number of changes in all. */
export function diffProject(a, b) {
  const out = { items: [], settings: [], count: 0 };
  for (const kind of KEYED) {
    const A = mapOf(a, kind), B = mapOf(b, kind);
    for (const [id, e] of A) {
      if (!B.has(id)) out.items.push({ kind, id, change: 'removed', label: itemLabel(kind, e), item: copy(e) });
      else { const f = fieldDiff(e, B.get(id)); if (f.length) out.items.push({ kind, id, change: 'changed', label: itemLabel(kind, B.get(id)), fields: f }); }
    }
    for (const [id, e] of B) if (!A.has(id)) out.items.push({ kind, id, change: 'added', label: itemLabel(kind, e), item: copy(e) });
  }
  for (const key of SETTINGS) if (!same(a && a[key], b && b[key])) out.settings.push({ key, from: copy(a && a[key]), to: copy(b && b[key]) });
  out.count = out.items.length + out.settings.length;
  return out;
}
/* ---------- merge ----------
   base is where both sides started; the result keeps `target`'s order, name and anything
   neither side touched, takes each side's own changes, and lists the conflicts:
     {kind, id, label, key?, base, target, source, choice}   choice: 'target' | 'source' | null
   A conflict without a key is about the item as a whole (one side removed it, the other
   changed it; or both added an item of that id, differently). `taken` counts what went in from
   each side. Call resolve() with the choices made to get the bench. */
export function merge3(base, target, source) {
  const conflicts = [], taken = { target: 0, source: 0, both: 0 };
  const result = copy(target) || {};
  for (const kind of KEYED) {
    const B = mapOf(base, kind), T = mapOf(target, kind), S = mapOf(source, kind);
    const outList = [], seen = new Set();
    const push = e => { if (e && !seen.has(e.id)) { seen.add(e.id); outList.push(e); } };
    // in target's order first, then what the source added
    const ids = [...listOf(target, kind).map(e => e.id), ...listOf(source, kind).map(e => e.id).filter(id => !T.has(id))];
    for (const id of ids) {
      const b = B.get(id), t = T.get(id), s = S.get(id);
      if (!b) {
        // new on one side, or on both
        if (t && s) { if (same(t, s)) { push(copy(t)); taken.both++; } else conflicts.push({ kind, id, label: itemLabel(kind, t), key: null, base: null, target: copy(t), source: copy(s), choice: null }); }
        else if (t) { push(copy(t)); taken.target++; }
        else if (s) { push(copy(s)); taken.source++; }
        continue;
      }
      if (!t && !s) continue;                                       // gone on both
      if (!t || !s) {
        // removed on one side: fine unless the other changed it
        const kept = t || s, side = t ? 'target' : 'source';
        if (same(b, kept)) { taken[side === 'target' ? 'source' : 'target']++; continue; }
        conflicts.push({ kind, id, label: itemLabel(kind, kept), key: null, base: copy(b), target: copy(t), source: copy(s), choice: null });
        continue;
      }
      // in all three: field by field
      const merged = copy(t);
      let fromT = false, fromS = false;
      for (const key of new Set([...Object.keys(b), ...Object.keys(t), ...Object.keys(s)])) {
        if (key === 'id') continue;
        const tChanged = !same(b[key], t[key]), sChanged = !same(b[key], s[key]);
        if (!sChanged) { if (tChanged) fromT = true; continue; }                    // target's, or nobody's
        if (!tChanged || same(t[key], s[key])) { if (s[key] === undefined) delete merged[key]; else merged[key] = copy(s[key]); if (tChanged) fromT = true; else fromS = true; continue; }
        conflicts.push({ kind, id, label: itemLabel(kind, t), key, base: copy(b[key]), target: copy(t[key]), source: copy(s[key]), choice: null });
      }
      if (fromT && fromS) taken.both++; else if (fromT) taken.target++; else if (fromS) taken.source++;
      push(merged);
    }
    result[kind] = outList;
  }
  for (const key of SETTINGS) {
    const b = base && base[key], t = target && target[key], s = source && source[key];
    const tChanged = !same(b, t), sChanged = !same(b, s);
    if (!sChanged) continue;
    if (!tChanged || same(t, s)) { if (s === undefined) delete result[key]; else result[key] = copy(s); taken.source++; continue; }
    conflicts.push({ kind: 'settings', id: key, label: key, key, base: copy(b), target: copy(t), source: copy(s), choice: null });
  }
  return { result, conflicts, taken };
}
/* the merged bench with each conflict settled: a choice of 'target' or 'source' on every one */
export function resolve(merge) {
  const out = copy(merge.result);
  for (const c of merge.conflicts) {
    const side = c.choice === 'source' ? 'source' : 'target';
    const v = c[side];
    if (c.kind === 'settings') { if (v === undefined) delete out[c.key]; else out[c.key] = copy(v); continue; }
    const list = out[c.kind] || (out[c.kind] = []);
    const at = list.findIndex(e => e.id === c.id);
    if (c.key) { if (at >= 0) { if (v === undefined) delete list[at][c.key]; else list[at][c.key] = copy(v); } continue; }
    // the whole item: the chosen side's, or none
    if (v) { if (at >= 0) list[at] = copy(v); else list.push(copy(v)); }
    else if (at >= 0) list.splice(at, 1);
  }
  return out;
}
