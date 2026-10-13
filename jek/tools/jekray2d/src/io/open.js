import { FORMAT, TEST_MODE, VERSION } from '../core/constants.js';
import { GLASS, glassKey } from '../core/glass.js';
import { RF_MAT } from '../core/rf.js';
import { TYPE_LABEL, selectOne, typeLabel } from '../state/project.js';
import { loadProject } from '../state/elements.js';
import { checkpoint, keepSnapshot, renderBenchTabs } from '../state/tabs.js';
import { BEAM_Z, dropTraceStore, tippable } from '../engines/trace.js';
import { pauseAll, playing } from '../ui/sweeps.js';
import { FC, FC_ORDER, fcNames, fcPortsOf, pkey, portName, portsOf } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';
import { V3D } from '../ui/view3d.js';
import { updateSweepButtons } from '../ui/optimise.js';
import { changed, fitView, toast, updateUndoButtons } from '../ui/actions.js';
import { applyUi } from './share.js';
import { cloudLink } from './cloud.js';
import { modsOffer } from './mods.js';
// Shared mutable state read or set here, not yet imported (see state/shared.md): cloud, cloudOpening, history, project, selFibreId

/* ---------- Opening a project someone (or something) else wrote ----------
   A file from outside the tool, an AI assistant's above all, is read as leniently as it
   can be: names where ids belong, no format tag, fences and comments round pasted text.
   Whatever could not be used as written is listed afterwards, plainly enough to hand back
   to whoever wrote it. */
let lastImport = [];
const IMPORT_SAME = new Set(['id', 'type', 'name', 'x', 'y', 'angle', 'bench', 'locked', 'sweeps', 'colour', 'colourAuto']);
function prepImport(data, notes) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('That is not a JEKray2D project: it should be one JSON object.');
  if (!Array.isArray(data.elements)) throw new Error('The project has no "elements" list.');
  if (data.format === undefined) data.format = FORMAT;       // what else would it be
  if (data.version === undefined) data.version = VERSION;
  const named = e => e && typeof e === 'object' ? String(e.name || e.type || '?') : '?';
  // every element gets an id; fibres, split sources and tabs may name what they mean
  const ids = new Set(), byName = new Map();
  data.elements.forEach((e, i) => {
    if (!e || typeof e !== 'object') return;
    if (typeof e.id !== 'string' || !e.id || ids.has(e.id)) {
      if (typeof e.id === 'string' && ids.has(e.id)) notes.push('<b>' + esc(named(e)) + '</b>: id "' + esc(e.id) + '" was already used, so it was given a new one.');
      let k = 'e' + (i + 1); while (ids.has(k)) k += '_';
      e.id = k;
    }
    ids.add(e.id);
    if (e.name && !byName.has(String(e.name))) byName.set(String(e.name), e.id);
  });
  const resolve = (ref, what) => {
    if (typeof ref !== 'string') return ref;
    if (ids.has(ref)) return ref;
    if (byName.has(ref)) return byName.get(ref);             // a name is as good as an id
    return ref;
  };
  for (const F of Array.isArray(data.fibres) ? data.fibres : []) {
    if (!F || typeof F !== 'object') continue;
    for (const end of ['a', 'b']) if (Array.isArray(F[end])) F[end] = [resolve(F[end][0], 'Fibre ends'), F[end][1]];
  }
  for (const e of data.elements) if (e && e.splitFrom) e.splitFrom = resolve(e.splitFrom, 'splitFrom');
  if (Array.isArray(data.benches)) {
    const bIds = new Set(data.benches.filter(b => b && typeof b.id === 'string').map(b => b.id));
    const bNames = new Map(data.benches.filter(b => b && b.name).map(b => [String(b.name), b.id]));
    for (const e of data.elements) if (e && typeof e.bench === 'string' && !bIds.has(e.bench) && bNames.has(e.bench)) e.bench = bNames.get(e.bench);
  }
}
export const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function checkImport(raw, p, notes) {
  const got = new Map(p.elements.map(e => [e.id, e]));
  const fmtV = v => typeof v === 'string' ? '"' + esc(v) + '"' : esc(JSON.stringify(v));
  const glassNote = (who, m, where) => {
    if (!m || typeof m !== 'object' || m.glass === 'AIR' || m.glass === 'custom' || m.table || isFinite(m.nd)) return;
    if (!glassKey(m.glass) && !RF_MAT[m.glass]) notes.push(who + ': glass ' + fmtV(m.glass) + (where ? ' (' + where + ')' : '') + ' is not in the catalogue, so n = 1.5 was used. Give one of ' +
      Object.keys(GLASS).slice(0, 12).join(', ') + '\u2026 or {"glass": "custom", "n": 1.52}.');
  };
  raw.elements.forEach((e, i) => {
    if (!e || typeof e !== 'object') { notes.push('Element ' + (i + 1) + ' is not an object: left out.'); return; }
    const who = '<b>' + esc(e.name || e.type || 'Element ' + (i + 1)) + '</b>', n = got.get(e.id);
    if (!n) {
      notes.push(who + ': ' + (e.type === 'fcomp' ? 'fibre component kind ' + fmtV(e.kind) + ' is not one of ' + FC_ORDER.join(', ') : 'type ' + fmtV(e.type) + ' is not one of ' + Object.keys(TYPE_LABEL).concat('fcomp').join(', ')) + ': left out.');
      return;
    }
    for (const [k, v] of Object.entries(e)) {
      if (IMPORT_SAME.has(k)) continue;
      if (k === 'beamView' || k === 'beamScale' || k === 'emitView') continue;             // how the light showed, now the bench's Light (see normLight)
      if (k === 'z' && V3D.free(n) && isFinite(v) && +v === BEAM_Z) continue;       // the beam height, which is no height of its own
      if ((k === 'tip' || k === 'roll') && tippable(n) && isFinite(v) && +v === 0) continue;   // upright, which is no tip at all
      if (k === 'faceMap' && n.type === 'screen' && v === false) continue;                    // not shown, as by default
      if (!(k in n)) { notes.push(who + ': field ' + fmtV(k) + ' is not used by a ' + (n.type === 'fcomp' ? FC[n.kind].label.toLowerCase() : typeLabel(n).toLowerCase()) + ': ignored.'); continue; }
      const w = n[k];
      if (typeof w === 'number') {
        const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && isFinite(v) ? +v : NaN;
        if (!isFinite(x)) notes.push(who + ': ' + k + ' = ' + fmtV(v) + ' is not a number: ' + w + ' used.');
        else if (Math.abs(x - w) > 1e-9 * Math.max(1, Math.abs(x))) notes.push(who + ': ' + k + ' = ' + x + ' is outside what it can be: ' + w + ' used.');
      } else if (typeof w === 'boolean') {
        if (v !== w && !(typeof v === 'boolean')) notes.push(who + ': ' + k + ' should be true or false: ' + w + ' used.');
      } else if (typeof w === 'string' && typeof v === 'string' && v !== w) {
        notes.push(who + ': ' + k + ' = ' + fmtV(v) + ' is not an option: ' + fmtV(w) + ' used.');
      } else if (w === null && v !== null && v !== undefined && v !== '' && v !== 0) {
        notes.push(who + ': ' + k + ' = ' + fmtV(v) + ' could not be used: left unset.');
      }
    }
    if (n.material) glassNote(who, e.material);
    if (n.type === 'lens') {
      if (!Array.isArray(e.surfaces) || e.surfaces.length < 2) notes.push(who + ': a lens needs at least two surfaces; a default pair was used.');
      (e.materials || []).forEach((m, j) => glassNote(who, m, 'after surface ' + (j + 1)));
      const nS = Array.isArray(e.surfaces) ? e.surfaces.length : 0, short = (list, dflt) => Array.isArray(list) ? list.length < nS - 1 : nS > 2;
      if (nS >= 2 && short(e.gaps)) notes.push(who + ': "gaps" should hold ' + (e.surfaces.length - 1) + ' thickness(es); 3 mm used where missing.');
      if (nS >= 2 && short(e.materials)) notes.push(who + ': "materials" should hold ' + (e.surfaces.length - 1) + ' entr' + (e.surfaces.length > 2 ? 'ies' : 'y') + '; N-BK7 used where missing.');
    }
    if (n.type === 'source' && n.splitFrom) {
      const L = got.get(n.splitFrom);
      if (!L || L.type !== 'source') notes.push(who + ': splitFrom ' + fmtV(n.splitFrom) + ' is not a source here, so it is a laser of its own.');
    }
    if (raw.benches && typeof e.bench === 'string' && n.bench !== e.bench) notes.push(who + ': bench ' + fmtV(e.bench) + ' is not one of the tabs: put on ' + fmtV(benchNameIn(p, n.bench)) + '.');
  });
  // fibres: the ones that could not be joined, and why
  // a wire's ends may have been put output first, so either way round counts (ELEC hook)
  const kept = new Set(p.fibres.flatMap(F => [pkey(...F.a) + '|' + pkey(...F.b), pkey(...F.b) + '|' + pkey(...F.a)]));
  const isElec = e => e.type === 'elec' && ELEC.KINDS[e.kind];
  // optical parts' electrical ports (a photodiode's out, a laser's mod and fm) count too, after any fibre ones
  const nPorts = e => isElec(e) ? ELEC.ports(e).length : (e.type === 'fcomp' ? fcPortsOf(e).length : e.type === 'fibre' ? 1 : e.type === 'pic' ? PIC.ports(e).length : 0) + ELEC.extra(e).length;
  const portName = e => portsOf(e).map((q, i) => i + ' (' + (isElec(e) ? ELEC.names(e)[i] : portName0(e, i)) + ')').join(', ');
  const portName0 = (e, i) => (portsOf(e)[i] || {}).name || (e.type === 'fcomp' ? fcNames(e)[i] : e.type === 'pic' ? PIC.names(e)[i] : 'fibre');
  // an electrical output feeds any number of wires; so does a node, from its one port, though only one comes in
  const outPort = (e, k, first) => { const P = (isElec(e) ? ELEC.ports(e) : portsOf(e))[k], d = P && P.elec; return d === 'out' || (d === 'io' && first); };
  const used = new Map();
  (Array.isArray(raw.fibres) ? raw.fibres : []).forEach((F, i) => {
    const tag = 'Fibre ' + (i + 1);
    if (!F || !Array.isArray(F.a) || !Array.isArray(F.b)) { notes.push(tag + ': needs "a" and "b", each [element id, port number]: left out.'); return; }
    const why = [];
    for (const end of [F.a, F.b]) {
      const e = got.get(String(end[0])), first = end === F.a;
      if (!e) { why.push(fmtV(end[0]) + ' is not an element'); continue; }
      const np = nPorts(e);
      if (!np) why.push('<b>' + esc(e.name) + '</b> has no fibre port (only fibre components and fibre tips do' + '; photodiodes, lasers, AOMs, EOMs and choppers have electrical ones' + ')');
      else if (!((end[1] | 0) >= 0 && (end[1] | 0) < np)) why.push('<b>' + esc(e.name) + '</b> has ports ' + portName(e) + ', not ' + fmtV(end[1]));
      else if (!outPort(e, end[1] | 0, first)) { const k = pkey(e.id, end[1] | 0); if (used.has(k)) why.push('port ' + (end[1] | 0) + ' of <b>' + esc(e.name) + '</b> already has ' + used.get(k)); else used.set(k, tag.toLowerCase()); }
    }
    if (why.length) notes.push(tag + ': ' + why.join('; ') + ': left out.');
    else if (!kept.has(pkey(String(F.a[0]), F.a[1] | 0) + '|' + pkey(String(F.b[0]), F.b[1] | 0))) notes.push(tag + ' could not be joined (both ends on one port?): left out.');
  });
  // link planes and feedthroughs pair by name, exactly two to a name
  const pairs = new Map();
  for (const e of p.elements) {
    const k = e.type === 'link' ? 'link plane ' + e.pair : e.type === 'fcomp' && e.kind === 'thru' ? 'feedthrough ' + e.pair : e.type === 'elec' && e.kind === 'thru' ? 'electrical feedthrough ' + e.pair : null;
    if (k) pairs.set(k, (pairs.get(k) || []).concat(e.name));
  }
  for (const [k, list] of pairs) if (list.length !== 2) notes.push('The ' + esc(k.replace(/^(link plane|electrical feedthrough|feedthrough) /, '$1 pair "')) + '" has ' + list.length + ' member' + (list.length === 1 ? '' : 's') + ' (' + list.map(esc).join(', ') + '): it needs exactly two, one on each tab, with the same "pair" name.');
  // two parts on the one spot is nearly always a slip (one over the other, as in a periscope, is not)
  const spot = new Map();
  for (const e of p.elements) {
    const z = typeof e.z === 'number' ? e.z : 75, k = e.bench + ':' + Math.round(e.x * 100) + ',' + Math.round(e.y * 100) + ',' + Math.round(z * 100);
    if (spot.has(k)) notes.push('<b>' + esc(spot.get(k)) + '</b> and <b>' + esc(e.name) + '</b> sit at the same place (' + e.x + ', ' + e.y + (z !== 75 ? ', at height ' + z : '') + ').');
    else spot.set(k, e.name);
  }
  return notes;
}
const benchNameIn = (p, id) => { const b = p.benches.find(q => q.id === id); return b ? b.name : id; };
/* text as an assistant hands it over: fenced, commented, with trailing commas */
export function parseProjectText(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/);
  if (fence) t = fence[1];
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON object found in the text.');
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch (err) { /* try again, forgiving */ }
  // comments out (not inside strings), then trailing commas
  let out = '', inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === '\\') { out += t[++i] || ''; } else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && t[i + 1] === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(out); } catch (err) {
    const m = String(err.message).match(/position (\d+)/), at = m ? +m[1] : -1;
    if (at >= 0) { const pre = out.slice(0, at), line = pre.split('\n').length, col = at - pre.lastIndexOf('\n'); throw new Error('The JSON is not valid at line ' + line + ', column ' + col + ': ' + err.message.replace(/ in JSON at position \d+.*$/, '') + '.'); }
    throw new Error('The JSON is not valid: ' + err.message);
  }
}
/* open a project from its data: undoable, then the report if anything was changed */
export function openProjectData(data, label) {
  if (cloud && !cloudOpening) cloudLink(null);  // something else on the bench: no longer the cloud's
  const notes = [];
  data = JSON.parse(JSON.stringify(data));
  prepImport(data, notes);
  const raw = JSON.parse(JSON.stringify(data)), prev = project, hist = history.length;
  pauseAll();
  keepSnapshot('Before opening ' + label, true);
  if (prev && prev.elements.length) checkpoint();
  try { loadProject(data); } catch (err) { project = prev; history.length = hist; updateUndoButtons(); throw err; }
  checkImport(raw, project, notes);
  lastImport = notes;
  playing.clear(); dropTraceStore(); updateSweepButtons();
  selectOne(null); selFibreId = null; updateUndoButtons();
  document.getElementById('projName').value = project.name;
  renderBenchTabs();
  changed(true);
  if (!raw.view) fitView();
  toast('Opened ' + label + (notes.length ? ', with ' + notes.length + ' change' + (notes.length === 1 ? '' : 's') : ''));
  if (notes.length && !TEST_MODE) showImportReport(notes);
  if (project.mods.length) setTimeout(modsOffer, notes.length ? 600 : 0);   // its mods: offered, never run unasked
  // a link (or an example) may say which panels to show and how
  if (raw.ui) applyUi(raw.ui);
  return notes;
}
function showImportReport(notes) {
  const dlg = document.getElementById('importDialog');
  document.getElementById('importTitle').textContent = 'Opened, with ' + notes.length + ' change' + (notes.length === 1 ? '' : 's');
  const ul = document.getElementById('importList');
  ul.innerHTML = notes.map(n => '<li>' + n + '</li>').join('');
  if (!dlg.open) dlg.showModal();
}
const importReportText = notes => 'JEKray2D import report for "' + project.name + '": ' + notes.length + ' change' + (notes.length === 1 ? '' : 's') + '.\n' +
  notes.map(n => '- ' + n.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join('\n') +
  '\nPlease correct the .jekray file so that it opens with none of these.\n';
export function openJekray(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      let data;
      try { data = JSON.parse(r.result); } catch (err) { data = parseProjectText(r.result); }
      openProjectData(data, file.name);
    } catch (err) {
      toast(file.name + ' could not be opened: ' + err.message, true);
    }
  };
  r.readAsText(file);
}
{
  const dlg = document.getElementById('importDialog');
  document.getElementById('importClose').addEventListener('click', () => dlg.close());
  document.getElementById('importCopy').addEventListener('click', () => {
    const t = importReportText(lastImport);
    try { navigator.clipboard.writeText(t).then(() => toast('Report copied'), () => toast('Could not copy: select the list and copy it instead.', true)); }
    catch (err) { toast('Could not copy: select the list and copy it instead.', true); }
  });
  const pd = document.getElementById('pasteDialog'), ta = document.getElementById('pasteText'), er = document.getElementById('pasteError');
  document.getElementById('btnPasteProj').addEventListener('click', () => { er.hidden = true; pd.showModal(); ta.focus(); });
  document.getElementById('pasteCancel').addEventListener('click', () => pd.close());
  document.getElementById('pasteOpen').addEventListener('click', () => {
    try { const data = parseProjectText(ta.value); pd.close(); openProjectData(data, 'the pasted project'); ta.value = ''; }
    catch (err) { er.textContent = err.message; er.hidden = false; }
  });
}

