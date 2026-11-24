import { EMBED, OPTIC, OPTIC_FORMAT, TEST_MODE, VERSION, cloud } from '../core/constants.js';
import { asmCheck, asmKind, asmMembers, assemblies, normAssemblies, remapDesign } from '../core/assembly.js';
import { isRfAsm } from '../ui/rf-workspace.js';
import { V, nextName, project, uid } from '../state/project.js';
import { isOpticUid, normElement, opticUid, serialize } from '../state/elements.js';
import { setSelection } from '../ui/render.js';
import { changed, toast } from '../ui/actions.js';
import { checkpoint } from '../ui/tabs.js';
import { asmMoveTo, asmPlace, newLensDesign } from '../ui/assembly.js';
import { asmBenchLight, closeLensDesign, lensDesignAsm, lensDesignOpen, openLensDesign, placeOnBench } from '../ui/lens-workspace.js';
import { benchName } from '../state/tabs.js';
import { track } from './usage.js';
import { account, accountsOn, api } from './account.js';

/* ==========================================================================
   The Optics designer and the benches that use its designs
   The Optics designer is JEKray's page opened with ?optic (core/constants.js OPTIC): its document is one design, a
   .optic (format 'jekoptic'), the parts of one assembly and its record, with a uid. A bench uses a design as a copy of
   its parts, the assembly keeping where it came from (asm.src: { uid, and in the cloud id and v }), so it traces,
   shares and opens offline as before.
   - The designer, as the design changes, tells the other tabs on the channel 'jek-optic'; a bench open in one with that
     design on it takes the change at once, in place, as a step of Undo.
   - A bench opened later whose design moved on in the cloud is offered the newer version, never given it unasked.
   - From a bench, Edit in the Optics designer hands the assembly over (localStorage 'jek-optic-handoff') and opens the
     designer's tab on it (#take), linking it first if it was not; from the designer, Use on a bench hands the design
     to JEKray's tab (localStorage 'jek-optic-place', #place-optic), which puts it on the bench with light for it.
   ========================================================================== */
const OPTIC_CHANNEL = 'jek-optic', OPTIC_HANDOFF = 'jek-optic-handoff', OPTIC_PLACE = 'jek-optic-place', OPTIC_FRESH = 120e3;
let opticChan = null, opticSendTimer = 0, opticLastFollow = { asm: null, t: 0 };
const opticOffered = new Set();                       // 'id@v' already offered this visit
const isOpticAsm = a => a && !isRfAsm(a) && a.kind !== 'rf';
/* the page's own path, with ?optic for the designer, and the other app's */
export const opticPage = () => location.pathname.replace(/[^/]*$/, '') + (/jekray-dev\.html$/.test(location.pathname) ? 'jekray-dev.html' : 'jekray.html');
const toOpticTab = hash => window.open(opticPage() + '?optic#' + hash, 'jekoptic');
const toBenchTab = hash => window.open(opticPage() + '#' + hash, 'jekray');
function opticPut(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (err) { toast('This browser is blocking storage, so the design could not be handed over. Save it as a file and open that instead.', true); return false; } }
function opticTake(key) {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(key)); localStorage.removeItem(key); } catch (err) { /* nothing handed over */ }
  return v && v.content && Date.now() - (v.t || 0) < OPTIC_FRESH ? v : null;
}

/* ---------- A design as a file, made from an assembly on a bench ---------- */
export function designContent(asm, u) {
  const M = asmMembers(asm), rec = JSON.parse(JSON.stringify(asm));
  delete rec.src; delete rec.lock;
  rec.bench = 'b1';
  return { format: OPTIC_FORMAT, version: VERSION, name: asm.name, uid: u, benches: [{ id: 'b1', name: 'Design' }], tab: 'b1',
    elements: JSON.parse(JSON.stringify(M)).map(e => Object.assign(e, { bench: 'b1', locked: false })), fibres: [], assemblies: [rec] };
}
/* the design in a .optic's content: its assembly's record and parts (null when it has none) */
export function designIn(data) {
  const els = data && Array.isArray(data.elements) ? data.elements.filter(e => e && typeof e === 'object') : [];
  const rec = (data && Array.isArray(data.assemblies) ? data.assemblies : []).find(a => a && els.some(e => e.group === a.id));
  return rec ? { rec, members: els.filter(e => e.group === rec.id) } : null;
}

/* ---------- On a bench: a design put down, updated, handed to the designer ---------- */
/* the design's parts put on the bench as an assembly of their own, linked to it (src), at { x, y, angle, z } or in the
   middle of the view; keep: the assembly's id kept (an update); quiet: no step of Undo (one already made) */
export function placeDesign(data, src, opts) {
  opts = opts || {};
  const D = designIn(data);
  if (!D) throw new Error('That design has no assembly in it.');
  if (!opts.quiet) checkpoint();
  const gid = opts.keep || 'g' + uid().slice(1), map = new Map(), made = [];
  for (const c of D.members) {
    const e = normElement(Object.assign({}, c, { id: undefined, bench: project.tab, locked: false, group: gid }));
    if (!e) continue;
    e.id = uid();
    if (project.elements.some(x => x.name === e.name) || made.some(x => x.name === e.name)) e.name = nextName(String(c.name).replace(/\s+\d+$/, ''));
    map.set(c.id, e.id); made.push(e);
    project.elements.push(e);
  }
  if (!made.length) throw new Error('That design has no parts.');
  const [asm] = normAssemblies([Object.assign({}, D.rec, { id: gid, ref: map.get(D.rec.ref) || made[0].id, name: String(data.name || D.rec.name || 'Design'),
    design: remapDesign(D.rec.design, map), lock: true, src })], made);
  project.assemblies = (project.assemblies || []).filter(a => a.id !== gid).concat([asm]);
  asmMoveTo(asm, opts.at || { x: Math.round(V().cx), y: Math.round(V().cy) });
  return asm;
}
/* a linked assembly given its design's newer content, where it stands */
export function updateDesign(asm, data, src, quiet) {
  const at = asmPlace(asm);
  if (!quiet) checkpoint();
  project.elements = project.elements.filter(e => e.group !== asm.id);
  project.assemblies = (project.assemblies || []).filter(a => a.id !== asm.id);
  return placeDesign(data, src, { at, keep: asm.id, quiet: true });
}
/* Edit in the Optics designer: the assembly linked to a design of its own (a new one, when it had none), handed over */
export function editInOptic(asm) {
  if (!asm || !isOpticAsm(asm)) return false;
  if (!asm.src) { checkpoint(); asm.src = { uid: opticUid() }; changed(false); }
  // with the light arriving at it on the bench, for the designer's Take conditions from the bench
  let light = null;
  try { const B = asmBenchLight(asm); light = B ? { B: JSON.parse(JSON.stringify(B)), bench: benchName(asm.bench) } : null; } catch (err) { /* none */ }
  if (!opticPut(OPTIC_HANDOFF, { t: Date.now(), content: designContent(asm, asm.src.uid), src: asm.src, light })) return false;
  track('designer', 'optic.edit');
  toOpticTab('take');
  toast('Opened ' + asm.name + ' in the Optics designer: what you change there comes back here as you go');
  return true;
}
/* the way into a design from a bench: the Optics designer, in its own tab, for an optical one (the RF designer is
   still the bench's own); here, on the page, in the designer itself, a test page, or when asked (here) */
export let opticTabs = !TEST_MODE && !EMBED;
export const setOpticTabs = v => (opticTabs = !!v);
export function openDesign(asm, opts) {
  if (!asm) return false;
  if (opticTabs && !OPTIC && isOpticAsm(asm) && !(opts && opts.here)) return editInOptic(asm);
  return openLensDesign(asm, opts);
}
/* a new optical design, from the bench: started in the Optics designer */
export function newOpticDesign() {
  if (!opticTabs || OPTIC) return newLensDesign();
  track('designer', 'optic.new');
  toOpticTab('new');
  return null;
}
/* a bench's design took a change from the designer (live), or is offered the cloud's newer one */
export function opticFollow(m) {
  if (OPTIC || !m || m.kind !== 'design' || !isOpticUid(m.uid) || !m.content) return;
  const mine = assemblies().filter(a => a.src && (m.id && a.src.id ? a.src.id === m.id : a.src.uid === m.uid));
  if (!mine.length) return;
  // one step of Undo for a run of changes to the same design
  const quiet = opticLastFollow.asm === mine.map(a => a.id).join() && Date.now() - opticLastFollow.t < 4000;
  if (!quiet) checkpoint();
  const src = { uid: m.uid, ...(m.id ? { id: m.id } : {}), ...(m.v ? { v: m.v } : {}) };
  let ok = 0;
  for (const a of mine) { try { updateDesign(a, m.content, src, true); ok++; } catch (err) { /* left as it was */ } }
  opticLastFollow = { asm: mine.map(a => a.id).join(), t: Date.now() };
  if (ok) changed(true);
}
/* a bench just opened: its designs in the cloud that have moved on since they were copied, offered */
export async function opticOffers() {
  if (OPTIC || TEST_MODE || EMBED || !accountsOn() || !account) return;
  for (const a of assemblies().filter(x => x.src && x.src.id)) {
    try {
      const b = await api('/v1/benches/' + a.src.id);
      if (!(b.version > (a.src.v || 0)) || opticOffered.has(b.id + '@' + b.version)) continue;
      opticOffered.add(b.id + '@' + b.version);
      toast('“' + b.name + '” has changed in the Optics designer since ' + a.name + ' was put on this bench', false, { label: 'Update it', fn: () => {
        try { updateDesign(a, JSON.parse(b.content), Object.assign({}, a.src, { v: b.version })); changed(true); toast('Updated ' + a.name + ' to version ' + b.version); }
        catch (err) { toast('Could not update it: ' + err.message, true); }
      } });
    } catch (err) { /* offline, or no longer ours: the bench keeps its copy */ }
  }
}
/* #place-optic: a design the designer sent, put on the bench with light for it (or, already here, shown) */
function opticPlaceHanded() {
  const v = opticTake(OPTIC_PLACE);
  if (!v) { toast('Nothing to put on the bench: open the design in the Optics designer and choose Use on a bench again.', true); return; }
  const there = v.src && assemblies().find(a => a.src && a.src.uid === v.src.uid);
  if (there) { setSelection(asmMembers(there)); toast(there.name + ' is on this bench already, and follows the design as it changes'); return; }
  try {
    const asm = placeDesign(v.content, v.src && isOpticUid(v.src.uid) ? v.src : null);
    placeOnBench(asm);
    setSelection(asmMembers(asm));
    changed(true);
    track('designer', 'optic.place');
  } catch (err) { toast('Could not put the design on the bench: ' + err.message, true); }
}

/* ---------- In the designer ---------- */
/* the one design the page holds, opened: made from what was opened when it is not yet one (a single lens, say), or
   a new design when there is nothing to design */
export function opticShow() {
  if (!OPTIC) return;
  let asm = assemblies().find(isOpticAsm);
  if (!asm) {
    const parts = project.elements.filter(e => ['lens', 'stop', 'mirror', 'window'].includes(e.type) || asmKind(e));
    if (parts.length && asmCheck(parts, {}).ok) {
      const id = 'g' + uid().slice(1), C = asmCheck(parts, {});
      for (const e of parts) e.group = id;
      asm = { id, name: project.name || 'Design', bench: parts[0].bench, ref: C.ref, rev: C.rev };
      project.assemblies = (project.assemblies || []).concat(normAssemblies([asm], parts));
      asm = assemblies().find(a => a.id === id);
    }
  }
  // (a design made empty in the cloud, by JEKsuite's New, keeps the name it was given there)
  if (!asm) { const nm = project.name && !/^(Untitled bench|New design)$/.test(project.name) ? project.name : 'New design'; newLensDesign(); asm = assemblies().find(isOpticAsm); if (asm) project.name = asm.name = nm; }
  // the design's name is the file's
  else if (project.name && asm.name !== project.name) asm.name = String(project.name).slice(0, 80);
  // (open already on this very record: nothing to do; on one a load or New replaced: opened again on this)
  if (lensDesignOpen()) { if (lensDesignAsm() === asm) return; closeLensDesign(); }
  if (asm) { openLensDesign(asm, { optical: true }); const n = document.getElementById('projName'); if (n) n.value = project.name; }
}
/* the design as it stands, to the benches that use it: soon after each change */
export function opticChanged() {
  if (!OPTIC || TEST_MODE || EMBED || !opticChan) return;
  clearTimeout(opticSendTimer);
  opticSendTimer = setTimeout(() => {
    try { opticChan.postMessage({ kind: 'design', uid: serialize().uid, id: cloud ? cloud.id : null, v: cloud ? cloud.version : null, content: serialize() }); } catch (err) { /* no other tab hears */ }
  }, 400);
}
/* Use on a bench: the design handed to JEKray's tab, which puts it down linked to it */
export function useOnBench() {
  const content = serialize();
  if (!opticPut(OPTIC_PLACE, { t: Date.now(), content, src: { uid: content.uid, ...(cloud ? { id: cloud.id, v: cloud.version } : {}) } })) return;
  track('designer', 'optic.use');
  toBenchTab('place-optic');
  toast('Sent to JEKray: it is on the bench there, and follows this design as it changes');
}
/* the light that arrived at the design on the bench it was opened from, when it was ({ uid, B, bench }; null when not) */
let opticLight = null;
export const handedLight = () => (opticLight && opticLight.uid === project.uid ? opticLight : null);
/* #take: the assembly a bench handed over, opened here (its cloud version, when it has one and the person can open it) */
async function opticTakeHanded(openData, openCloud) {
  const v = opticTake(OPTIC_HANDOFF);
  if (!v) { toast('Nothing was handed over: choose Design… on the assembly on the bench again.', true); return; }
  opticLight = v.light && v.light.B && v.src ? { uid: v.src.uid, B: v.light.B, bench: String(v.light.bench || 'the bench') } : null;
  if (v.src && v.src.id && accountsOn() && account) {
    try { await openCloud(v.src.id); opticShow(); return; } catch (err) { /* not ours to open: its copy instead */ }
  }
  openData(v.content, '“' + (v.content.name || 'design') + '” from the bench');
  opticShow();
}

/* ---------- The page as the Optics designer ---------- */
/* its title and the File menu's words for a design; what is the bench's alone, out of the way */
export function opticPageSetup() {
  if (!OPTIC) return;
  document.body.classList.add('rt-optic');
  document.title = 'Optics designer | JEKray';
  const say = (sel, text, title) => { const el = document.querySelector(sel); if (!el) return; const k = el.querySelector('.k'); el.textContent = text; if (k) el.append(k); if (title) el.title = title; };
  say('#btnNew', 'New design');
  say('#btnOpen', 'Open a .optic file…');
  say('#fileMenu [data-click="btnSave"]', 'Save as .optic');
  say('#btnCloudList', 'My designs on JEKsuite…', 'Every design and bench in the cloud, on JEKsuite (in its own tab)');
  say('#btnCloudFork', 'Fork this design…', 'Carry on in a new cloud design, leaving this one as it is');
  const save = document.getElementById('btnSave'); if (save) save.title = 'Save the design as a .optic file (Ctrl+S)';
  const file = document.getElementById('fileJekray'); if (file) file.accept = '.optic,application/json';
  const nd = document.querySelector('#newDialog p'); if (nd) nd.textContent = 'The current design will be cleared. Save it as a .optic file first if you want to keep it. You can still undo this.';
  const nc = document.getElementById('newConfirm'); if (nc) nc.textContent = 'Start a new design';
  // the bench's own: examples, packs, objects, the layout's and the bench's exports, share links (a design's are to come)
  for (const sel of ['#fileMenu [data-click="btnExamples"]', '#fileMenu [data-click="btnShare"]', '#btnImport', '#btnImportStl', '#btnPacks', '#btnExportFigure', '#btnExportZmx', '#btnExportData'])
    for (const el of document.querySelectorAll(sel)) el.hidden = true;
  for (const el of document.querySelectorAll('#fileMenu .rt-sub[data-what="export the layout"]')) el.hidden = true;
}

/* ---------- The hash, the channel ---------- */
/* #take or #place-optic: handled (true), with the page's own ways of opening a file and a cloud bench */
export function opticHash(openData, openCloud) {
  if (OPTIC && location.hash === '#take') { opticTakeHanded(openData, openCloud); return true; }
  if (!OPTIC && location.hash === '#place-optic') { opticPlaceHanded(); return true; }
  return false;
}
export function wireOptic() {
  if (TEST_MODE || EMBED || typeof BroadcastChannel === 'undefined') return;
  opticChan = new BroadcastChannel(OPTIC_CHANNEL);
  opticChan.onmessage = e => opticFollow(e.data);
}
