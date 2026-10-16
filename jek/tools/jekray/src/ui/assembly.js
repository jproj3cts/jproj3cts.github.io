import { fmtLen } from '../core/format.js';
import { asmCheck, asmMembers, asmParaxial, asmPrescription, condSummary, normCond } from '../core/assembly.js';
import { V, project, typeLabel, uid } from '../state/project.js';
import { benchNms, normElement } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { paraxial } from '../engines/trace.js';
import { h, panel, textField } from './panel.js';
import { setSelection } from './render.js';
import { changed, toast } from './actions.js';
import { checkpoint } from './tabs.js';
import { exportZmx } from '../io/zmx-export.js';
import { condMismatch } from '../engines/lens-design.js';
import { asmBenchLight, openLensDesign } from './lens-workspace.js';

/* ---------- Assemblies on the bench ----------
   Made from lenses and stops picked on the bench, split back into them, or started afresh from the
   File menu. The parts stay the bench's own parts (core/assembly.js); this is how they are made one,
   shown and taken apart. */
const sources = () => project.elements.filter(e => e.type === 'source' && onTab(e));
const nextAsmName = () => { let n = 1; while ((project.assemblies || []).some(a => a.name === 'Assembly ' + n)) n++; return 'Assembly ' + n; };
/* conditions to start from: the aperture its stop (or smallest part) sets, the axis alone, the bench's wavelengths */
function startCond(els) {
  const ap = Math.min(...els.map(e => e.type === 'stop' ? e.aperture : e.type === 'lens' ? e.diameter : e.size));
  const nms = benchNms().filter(nm => nm < 1e5).slice(0, 3);
  return normCond({ aperture: { kind: 'epd', v: ap }, fields: [{ deg: 0, w: 1 }], waves: (nms.length ? nms : [587.56]).map(nm => ({ nm, w: 1 })) });
}
export function makeAssembly(list) {
  const C = asmCheck(list, { sources: sources() });
  if (!C.ok) { toast(C.why, true); return null; }
  checkpoint();
  const id = 'g' + uid().slice(1);
  for (const e of list) e.group = id;
  const asm = { id, name: nextAsmName(), bench: list[0].bench, ref: C.ref, rev: C.rev, cond: startCond(list) };
  project.assemblies = (project.assemblies || []).concat([asm]);
  setSelection(list);
  toast('Made ' + asm.name + ' from ' + list.length + ' parts');
  changed(true);
  return asm;
}
export function splitAssembly(asm) {
  checkpoint();
  const M = asmMembers(asm);
  for (const e of M) delete e.group;
  project.assemblies = (project.assemblies || []).filter(a => a.id !== asm.id);
  setSelection(M);
  toast('Split ' + asm.name + ' into its ' + M.length + ' parts');
  changed(true);
}
/* a new design: a stop and a singlet, f about 50 mm at f/5, in the middle of the view */
export function newLensDesign() {
  checkpoint();
  const id = 'g' + uid().slice(1), x = Math.round(V().cx), y = Math.round(V().cy);
  const stop = normElement({ type: 'stop', id: uid(), name: 'Stop', x: x - 8, y, angle: 0, aperture: 10, outer: 25.4, group: id, bench: project.tab });
  const lens = normElement({ type: 'lens', id: uid(), name: 'Singlet', x, y, angle: 0, diameter: 25.4, surfaces: [{ R: 51.5 }, { R: -51.5 }], gaps: [3.6], materials: [{ glass: 'N-BK7' }], group: id, bench: project.tab });
  project.elements.push(stop, lens);
  const asm = { id, name: 'New design', bench: project.tab, ref: lens.id, rev: false, cond: normCond({ aperture: { kind: 'epd', v: 10 }, fields: [{ deg: 0, w: 1 }, { deg: 5, w: 1 }], waves: [{ nm: 486.13, w: 1 }, { nm: 587.56, w: 2 }, { nm: 656.27, w: 1 }], primary: 1 }) };
  project.assemblies = (project.assemblies || []).concat([asm]);
  setSelection([stop, lens]);
  changed(true);
  openLensDesign(asm, { draft: true });
  return asm;
}

/* its panel: what it is made of, its first-order figures at its primary wavelength, its conditions */
export function assemblyPanel(asm) {
  const M = asmMembers(asm), C = asmCheck(M, { ref: asm.ref, rev: asm.rev });
  const title = h('h2', null, h('span', null, asm.name), h('span', { class: 'kind' }, 'Assembly'));
  panel.append(title);
  panel.append(h('div', { class: 'rt-rows' }, textField('Name', () => asm.name, v => { asm.name = String(v || 'Assembly').slice(0, 80); title.firstChild.textContent = asm.name; }, { wide: true })));
  if (!C.ok) panel.append(h('p', { class: 'note', style: 'color:var(--jek-red, #b3261e)' }, 'Its parts are no longer on one axis: ' + C.why + ' Line them up again, or split it into its parts.'));
  panel.append(h('h3', null, 'Parts'));
  const P = C.ok ? asmPrescription(asm, M) : null, order = P ? P.parts.map(p => M.find(e => e.id === p.id)) : M;
  const ul = h('ul', { class: 'rt-list' });
  for (const e of order) ul.append(h('li', null, h('button', { type: 'button', onclick: () => setSelection([e]) }, e.name, h('span', { class: 't' }, typeLabel(e)))));
  panel.append(ul);
  if (P) {
    const c = asm.cond, nm = c.waves[c.primary].nm, p = asmParaxial(P, nm, paraxial);
    const len = P.gaps.reduce((a, b) => a + b, 0);
    const rows = [['EFL at ' + (+nm.toPrecision(5)) + ' nm', isFinite(p.efl) ? fmtLen(p.efl) : 'afocal'], ['BFL', isFinite(p.bfl) ? fmtLen(p.bfl) : '—'],
      ['Surfaces', P.surfaces.length + (P.stopIndex >= 0 ? ', the stop the ' + ordinal(P.stopIndex + 1) : ', no stop of its own')], ['First to last surface', fmtLen(len)],
      ['Designed for', condSummary(c)]];
    panel.append(h('div', { class: 'rt-readout' }, h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))));
  }
  // the bench's light against what it is designed for
  if (P) {
    const L = asmBenchLight(asm, P);
    if (L) {
      const M = condMismatch(asm, L);
      panel.append(M.length
        ? h('div', { class: 'rt-asmnote bad', role: 'status' }, h('b', null, 'Used outside its design conditions: '), M.join('; ') + '. Open it with Design… to take the bench’s conditions and redesign it for them.')
        : h('div', { class: 'rt-asmnote good', role: 'status' }, h('b', null, 'Within its design conditions. '), 'The bench’s light is what it is designed for.'));
    }
  }
  const B = (label, fn, title2) => h('button', { class: 'rt-btn', type: 'button', title: title2 || '', onclick: fn }, label);
  panel.append(h('div', { class: 'rt-inline', style: 'display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.6rem' },
    h('button', { class: 'rt-btn primary', type: 'button', title: 'Open it in the lens design workspace: its conditions, layout and lens data (or double-click it)', onclick: () => openLensDesign(asm) }, 'Design…'),
    B('Export as a lens file (.zmx)', () => { setSelection(asmMembers(asm)); exportZmx(); }, 'Its prescription, its stop and the conditions it is designed for'),
    B('Split into parts', () => splitAssembly(asm), 'Back to separate lenses and stops; nothing on the bench moves')));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.6rem' }, 'An assembly is its parts, traced on the bench as they always are: it is picked and moved as one, and read as one prescription along its axis. Ctrl-click one of its parts to edit it alone; double-click it to design it.'));
}
const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

/* in a selection's panel: the button that makes these parts one, or why it can't */
export function makeAssemblyRow(list) {
  const C = asmCheck(list, { sources: sources() });
  if (C.ok) return h('button', { class: 'rt-btn', type: 'button', title: 'Lenses and stops on one axis, designed as one; nothing on the bench changes', onclick: () => makeAssembly(list) }, 'Make an assembly');
  return list.some(e => e.type === 'lens') ? h('p', { class: 'note' }, 'Not an assembly: ' + C.why) : null;
}
