import { DESIGNER, EMBED, OPTIC, OPTIC_FORMAT, PAGE_MODE, RFAPP, RFD, RFD_FORMAT, TEST_MODE, VERSION, cloud } from '../core/constants.js';
import { asmCheck, asmKind, asmMembers, assemblies, normAssemblies, remapDesign } from '../core/assembly.js';
import { closeRfDesign, isRfAsm, newRfDesign, openRfDesign, rfDesignAsm, rfDesignOpen, rfFollowHorns, rfPlaceOnBench } from '../ui/rf-workspace.js';
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
   The designers, and the benches that use their designs
   Each designer is JEKray's page as a program of its own (core/constants.js): the Optics designer (?optic, its designs
   .optic files, used on JEKray's benches) and JEKrf's RF designer (?rfd, .rfd files, used on JEKrf's benches, ?rf). A
   design is the parts of one assembly and its record, with a uid. A bench uses it as a copy of its parts, the assembly
   keeping where it came from (asm.src: { uid, and in the cloud id and v }), so it traces, shares and opens offline.
   - The designer, as the design changes, tells the other tabs on its channel ('jek-optic', 'jek-rfd'); a bench open in
     one with that design on it takes the change at once, where it stands, as a step of Undo (an RF design's horns on
     the bench kept, and moved to follow it).
   - A bench opened later whose design moved on in the cloud is offered the newer version, never given it unasked.
   - From a bench, Design… hands the assembly over (localStorage '<channel>-handoff') and opens the designer's tab on it
     (#take), linking it first if it was not; from the designer, Use on a bench hands the design to its bench's tab
     ('<channel>-place', #place-optic or #place-rfd), which puts it on the bench with light (or horns) for it.
   ========================================================================== */
const DESIGN_FRESH = 120e3;
/* the two kinds of design: the page each is made on (mode) and used on (bench), their names, files and ways in */
const DESIGN_KINDS = {
  optic: { key: 'optic', mode: 'optic', bench: 'ray', name: 'Optics designer', app: 'JEKray', ext: '.optic', format: OPTIC_FORMAT,
    is: a => !!a && !isRfAsm(a) && a.kind !== 'rf', open: a => openLensDesign(a, { optical: true }), isOpen: () => lensDesignOpen(), openAsm: () => lensDesignAsm(),
    close: () => closeLensDesign(), make: () => newLensDesign(), light: a => asmBenchLight(a), lit: a => placeOnBench(a) },
  rfd: { key: 'rfd', mode: 'rfd', bench: 'rf', name: 'RF designer', app: 'JEKrf', ext: '.rfd', format: RFD_FORMAT,
    is: a => !!a && (a.kind === 'rf' || isRfAsm(a)), open: a => openRfDesign(a), isOpen: () => rfDesignOpen(), openAsm: () => rfDesignAsm(),
    close: () => closeRfDesign(), make: () => newRfDesign(), light: () => null, lit: a => rfPlaceOnBench(a) },
};
const designKind = asm => (DESIGN_KINDS.rfd.is(asm) ? DESIGN_KINDS.rfd : DESIGN_KINDS.optic);
/* the kind of design this page is the designer of (null on a bench) */
const PAGE_KIND = OPTIC ? DESIGN_KINDS.optic : RFD ? DESIGN_KINDS.rfd : null;
const designChan = {}, chanName = k => 'jek-' + k.key, MODE_Q = { ray: '', optic: '?optic', rf: '?rf', rfd: '?rfd' }, MODE_TAB = { ray: 'jekray', optic: 'jekoptic', rf: 'jekrf', rfd: 'jekrfd' };
let designSendTimer = 0, designLastFollow = { asm: null, t: 0 };
const designOffered = new Set();                       // 'id@v' already offered this visit
/* the page's own file (the built page, or on the dev page the dev page), and a mode's address and tab */
export const opticPage = () => location.pathname.replace(/[^/]*$/, '') + (/jekray-dev\.html$/.test(location.pathname) ? 'jekray-dev.html' : 'jekray.html');
export const modePage = mode => opticPage() + MODE_Q[mode];
const toMode = (mode, hash) => window.open(modePage(mode) + (hash ? '#' + hash : ''), MODE_TAB[mode]);
function designPut(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (err) { toast('This browser is blocking storage, so the design could not be handed over. Save it as a file and open that instead.', true); return false; } }
function designTake(key) {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(key)); localStorage.removeItem(key); } catch (err) { /* nothing handed over */ }
  return v && v.content && Date.now() - (v.t || 0) < DESIGN_FRESH ? v : null;
}

/* ---------- A design as a file, made from an assembly on a bench ---------- */
export function designContent(asm, u) {
  const K = designKind(asm), M = asmMembers(asm), rec = JSON.parse(JSON.stringify(asm));
  delete rec.src; delete rec.lock;
  rec.bench = 'b1';
  // (an RF design's horns are the bench's, not the design's: their links stay behind)
  if (rec.rf) { if (rec.rf.feed) delete rec.rf.feed.id; if (rec.rf.goal && rec.rf.goal.rx) delete rec.rf.goal.rx.id; }
  return { format: K.format, version: VERSION, name: asm.name, uid: u, benches: [{ id: 'b1', name: 'Design' }], tab: 'b1',
    elements: JSON.parse(JSON.stringify(M)).map(e => Object.assign(e, { bench: 'b1', locked: false })), fibres: [], assemblies: [rec] };
}
/* the design in a design file's content: its assembly's record and parts (null when it has none) */
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
/* a linked assembly given its design's newer content, where it stands (an RF design's horns kept, and moved to follow) */
export function updateDesign(asm, data, src, quiet) {
  const at = asmPlace(asm), horns = asm.rf ? { feed: asm.rf.feed && asm.rf.feed.id, rx: asm.rf.goal && asm.rf.goal.rx && asm.rf.goal.rx.id } : null;
  if (!quiet) checkpoint();
  project.elements = project.elements.filter(e => e.group !== asm.id);
  project.assemblies = (project.assemblies || []).filter(a => a.id !== asm.id);
  const a = placeDesign(data, src, { at, keep: asm.id, quiet: true });
  if (horns && a.rf) {
    if (horns.feed && a.rf.feed) a.rf.feed.id = horns.feed;
    if (horns.rx && a.rf.goal && a.rf.goal.rx) a.rf.goal.rx.id = horns.rx;
    try { rfFollowHorns(a); } catch (err) { /* the horns stay where they were */ }
  }
  return a;
}
/* Design…: the assembly linked to a design of its own (a new one, when it had none), handed to its designer's tab */
export function editInOptic(asm) {
  if (!asm) return false;
  const K = designKind(asm);
  if (!asm.src) { checkpoint(); asm.src = { uid: opticUid() }; changed(false); }
  // with the light arriving at it on the bench, for the Optics designer's Take conditions from the bench
  let light = null;
  try { const B = K.light(asm); light = B ? { B: JSON.parse(JSON.stringify(B)), bench: benchName(asm.bench) } : null; } catch (err) { /* none */ }
  if (!designPut(chanName(K) + '-handoff', { t: Date.now(), content: designContent(asm, asm.src.uid), src: asm.src, light })) return false;
  track('designer', K.key + '.edit');
  toMode(K.mode, 'take');
  toast('Opened ' + asm.name + ' in the ' + K.name + ': what you change there comes back here as you go');
  return true;
}
/* the way into a design from a bench: its designer, in its own tab; here, on the page, in a designer itself, on a test
   page, or when asked (here) */
export let opticTabs = !TEST_MODE && !EMBED;
export const setOpticTabs = v => (opticTabs = !!v);
export function openDesign(asm, opts) {
  if (!asm) return false;
  if (opticTabs && !DESIGNER && !(opts && opts.here)) return editInOptic(asm);
  return openLensDesign(asm, opts);
}
/* a new design, from a bench: started in its designer (the Optics designer's from JEKray, the RF designer's from JEKrf) */
export function newOpticDesign() {
  if (!opticTabs || DESIGNER) return newLensDesign();
  track('designer', 'optic.new');
  toMode('optic', 'new');
  return null;
}
export function newRfdDesign() {
  if (!opticTabs || DESIGNER) return newRfDesign();
  track('designer', 'rfd.new');
  toMode('rfd', 'new');
  return null;
}
/* a bench's design took a change from its designer (live) */
export function opticFollow(m) {
  if (DESIGNER || !m || m.kind !== 'design' || !isOpticUid(m.uid) || !m.content) return;
  const mine = assemblies().filter(a => a.src && (m.id && a.src.id ? a.src.id === m.id : a.src.uid === m.uid));
  if (!mine.length) return;
  // one step of Undo for a run of changes to the same design
  const quiet = designLastFollow.asm === mine.map(a => a.id).join() && Date.now() - designLastFollow.t < 4000;
  if (!quiet) checkpoint();
  const src = { uid: m.uid, ...(m.id ? { id: m.id } : {}), ...(m.v ? { v: m.v } : {}) };
  let ok = 0;
  for (const a of mine) { try { updateDesign(a, m.content, src, true); ok++; } catch (err) { /* left as it was */ } }
  designLastFollow = { asm: mine.map(a => a.id).join(), t: Date.now() };
  if (ok) changed(true);
}
/* a bench just opened: its designs in the cloud that have moved on since they were copied, offered */
export async function opticOffers() {
  if (DESIGNER || TEST_MODE || EMBED || !accountsOn() || !account) return;
  for (const a of assemblies().filter(x => x.src && x.src.id)) {
    try {
      const b = await api('/v1/benches/' + a.src.id);
      if (!(b.version > (a.src.v || 0)) || designOffered.has(b.id + '@' + b.version)) continue;
      designOffered.add(b.id + '@' + b.version);
      toast('“' + b.name + '” has changed in the ' + designKind(a).name + ' since ' + a.name + ' was put on this bench', false, { label: 'Update it', fn: () => {
        try { updateDesign(a, JSON.parse(b.content), Object.assign({}, a.src, { v: b.version })); changed(true); toast('Updated ' + a.name + ' to version ' + b.version); }
        catch (err) { toast('Could not update it: ' + err.message, true); }
      } });
    } catch (err) { /* offline, or no longer ours: the bench keeps its copy */ }
  }
}
/* #place-optic, #place-rfd: a design its designer sent, put on the bench with light (horns) for it, or, here already, shown */
function designPlaceHanded(K) {
  const v = designTake(chanName(K) + '-place');
  if (!v) { toast('Nothing to put on the bench: open the design in the ' + K.name + ' and choose Use on a bench again.', true); return; }
  const there = v.src && assemblies().find(a => a.src && a.src.uid === v.src.uid);
  if (there) { setSelection(asmMembers(there)); toast(there.name + ' is on this bench already, and follows the design as it changes'); return; }
  try {
    const asm = placeDesign(v.content, v.src && isOpticUid(v.src.uid) ? v.src : null);
    K.lit(asm);
    setSelection(asmMembers(asm));
    changed(true);
    track('designer', K.key + '.place');
  } catch (err) { toast('Could not put the design on the bench: ' + err.message, true); }
}
/* a design file opened on a bench: its own kind is put on it, linked; the other kind is sent to its own bench's tab */
export function placeDesignFile(data, label) {
  const K = data.format === RFD_FORMAT ? DESIGN_KINDS.rfd : DESIGN_KINDS.optic;
  const src = isOpticUid(data.uid) ? { uid: data.uid } : null;
  if (K.bench !== PAGE_MODE) {
    if (!designPut(chanName(K) + '-place', { t: Date.now(), content: data, src })) return;
    toMode(K.bench, 'place-' + K.key);
    toast(label + ' is ' + (K.key === 'rfd' ? 'an RF design' : 'an optical design') + ': put on a bench in ' + K.app + ', in its own tab');
    return;
  }
  const asm = placeDesign(data, src);
  K.lit(asm); setSelection(asmMembers(asm)); changed(true);
  toast('Put the design ' + label + ' on the bench, with ' + (K.key === 'rfd' ? 'its horns' : 'light for it') + '. Edit it in the ' + K.name + ': double-click it');
}

/* ---------- In a designer ---------- */
/* the one design the page holds, opened: made from what was opened when it is not yet one (a single lens, say), or
   a new design when there is nothing to design */
export function opticShow() {
  const K = PAGE_KIND;
  if (!K) return;
  let asm = assemblies().find(K.is);
  if (!asm && K.key === 'optic') {
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
  if (!asm) {
    const nm = project.name && !/^(Untitled bench|New design|New RF design)$/.test(project.name) ? project.name : K.key === 'rfd' ? 'New RF design' : 'New design';
    if (K.isOpen()) K.close();
    K.make(); asm = assemblies().find(K.is); if (asm) project.name = asm.name = nm;
  }
  // the design's name is the file's
  else if (project.name && asm.name !== project.name) asm.name = String(project.name).slice(0, 80);
  // (open already on this very record: nothing to do; on one a load or New replaced: opened again on this)
  if (K.isOpen()) { if (K.openAsm() === asm) return; K.close(); }
  if (asm) { K.open(asm); const n = document.getElementById('projName'); if (n) n.value = project.name; }
}
/* the design as it stands, to the benches that use it: soon after each change */
export function opticChanged() {
  if (!PAGE_KIND || TEST_MODE || EMBED || !designChan[PAGE_KIND.key]) return;
  clearTimeout(designSendTimer);
  designSendTimer = setTimeout(() => {
    try { const content = serialize(); designChan[PAGE_KIND.key].postMessage({ kind: 'design', uid: content.uid, id: cloud ? cloud.id : null, v: cloud ? cloud.version : null, content }); } catch (err) { /* no other tab hears */ }
  }, 400);
}
/* Use on a bench: the design handed to its bench's tab (JEKray's, JEKrf's), which puts it down linked to it */
export function useOnBench() {
  const K = PAGE_KIND;
  if (!K) return;
  const content = serialize();
  if (!designPut(chanName(K) + '-place', { t: Date.now(), content, src: { uid: content.uid, ...(cloud ? { id: cloud.id, v: cloud.version } : {}) } })) return;
  track('designer', K.key + '.use');
  toMode(K.bench, 'place-' + K.key);
  toast('Sent to ' + K.app + ': it is on the bench there, and follows this design as it changes');
}
/* the light that arrived at the design on the bench it was opened from, when it was ({ uid, B, bench }; null when not) */
let opticLight = null;
export const handedLight = () => (opticLight && opticLight.uid === project.uid ? opticLight : null);
/* #take: the assembly a bench handed over, opened here (its cloud version, when it has one and the person can open it) */
async function designTakeHanded(openData, openCloud) {
  const v = designTake(chanName(PAGE_KIND) + '-handoff');
  if (!v) { toast('Nothing was handed over: choose Design… on the assembly on the bench again.', true); return; }
  opticLight = v.light && v.light.B && v.src ? { uid: v.src.uid, B: v.light.B, bench: String(v.light.bench || 'the bench') } : null;
  if (v.src && v.src.id && accountsOn() && account) {
    try { await openCloud(v.src.id); opticShow(); return; } catch (err) { /* not ours to open: its copy instead */ }
  }
  openData(v.content, '“' + (v.content.name || 'design') + '” from the bench');
  opticShow();
}

/* ---------- The page as another program ---------- */
/* its title, its file's name in the File menu, and what is another program's out of the way */
export function opticPageSetup() {
  if (PAGE_MODE === 'ray') {
    // JEKray: the RF designer is JEKrf's now (a bench with RF parts still opens and traces here)
    for (const id of ['btnNewRf', 'btnRfOfSel']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    return;
  }
  const say = (sel, text, title) => { const el = document.querySelector(sel); if (!el) return; const k = el.querySelector('.k'); el.textContent = text; if (k) el.append(k); if (title) el.title = title; };
  const hide = sels => { for (const sel of sels) for (const el of document.querySelectorAll(sel)) el.hidden = true; };
  document.body.classList.add('rt-' + PAGE_MODE);
  if (RFAPP) {
    document.title = 'JEKrf';
    const wm = document.querySelector('.rt-title .jek-wm'); if (wm) wm.innerHTML = 'JEK<b>rf</b>';
    const ab = document.querySelector('.rt-title a'); if (ab) { ab.href = '/jek/docs/jekray/rf/'; ab.title = 'About JEKrf: its pages in the docs'; }
    say('#btnOpen', 'Open a .jekrf file…', 'A JEKrf bench, a JEKray bench to carry on here as a JEKrf one, or an RF design (.rfd)');
    say('#fileMenu [data-click="btnSave"]', 'Save as .jekrf');
    const save = document.getElementById('btnSave'); if (save) save.title = 'Save the bench as a .jekrf file (Ctrl+S)';
    const file = document.getElementById('fileJekray'); if (file) file.accept = '.jekrf,.jekray,.rfd,application/json';
    const nd = document.querySelector('#newDialog p'); if (nd) nd.textContent = 'The current bench will be cleared. Save it as a .jekrf file first if you want to keep it. You can still undo this.';
    // the optical designers and JEKfilm are JEKray's; share links (short ones open in JEKray for now) are to come
    hide(['#btnNewLens', '#btnLensOfSel', '#btnCoatDesign', '#btnShare', '#fileMenu [data-click="btnShare"]']);
    return;
  }
  const K = PAGE_KIND;
  document.title = K.name + ' | ' + K.app;
  say('#btnNew', K.key === 'rfd' ? 'New RF design' : 'New design');
  say('#btnOpen', 'Open a ' + K.ext + ' file…');
  say('#fileMenu [data-click="btnSave"]', 'Save as ' + K.ext);
  say('#btnCloudList', 'My designs on JEKsuite…', 'Every design and bench in the cloud, on JEKsuite (in its own tab)');
  say('#btnCloudFork', 'Fork this design…', 'Carry on in a new cloud design, leaving this one as it is');
  const save = document.getElementById('btnSave'); if (save) save.title = 'Save the design as a ' + K.ext + ' file (Ctrl+S)';
  const file = document.getElementById('fileJekray'); if (file) file.accept = K.ext + ',application/json';
  const nd = document.querySelector('#newDialog p'); if (nd) nd.textContent = 'The current design will be cleared. Save it as a ' + K.ext + ' file first if you want to keep it. You can still undo this.';
  const nc = document.getElementById('newConfirm'); if (nc) nc.textContent = 'Start a new design';
  // the bench's own: examples, packs, objects, the layout's and the bench's exports, share links (a design's are to come)
  hide(['#fileMenu [data-click="btnExamples"]', '#fileMenu [data-click="btnShare"]', '#btnImport', '#btnImportStl', '#btnPacks', '#btnExportFigure', '#btnExportZmx', '#btnExportData', '#fileMenu .rt-sub[data-what="export the layout"]']);
}

/* ---------- The hash, the channels ---------- */
/* #take in a designer, #place-optic on JEKray's bench, #place-rfd on JEKrf's: handled (true), with the page's own ways
   of opening a file and a cloud bench */
export function opticHash(openData, openCloud) {
  if (PAGE_KIND && location.hash === '#take') { designTakeHanded(openData, openCloud); return true; }
  for (const K of Object.values(DESIGN_KINDS)) if (K.bench === PAGE_MODE && location.hash === '#place-' + K.key) { designPlaceHanded(K); return true; }
  return false;
}
export function wireOptic() {
  if (TEST_MODE || EMBED || typeof BroadcastChannel === 'undefined') return;
  for (const K of Object.values(DESIGN_KINDS)) {
    designChan[K.key] = new BroadcastChannel(chanName(K));
    designChan[K.key].onmessage = e => opticFollow(e.data);
  }
}
