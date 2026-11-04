/* ==========================================================================
   The project: what is on the bench, the selection and the undo history. One module holds the bindings the rest
   read; another module changes them through the setters.
   ========================================================================== */
export let project = null;
export function setProject(v) { return (project = v); }
export let selectedId = null;             // an electrode's, ion group's or detector's id
export function setSelectedId(v) { return (selectedId = v); }
export let history = [], future = [];
export function setHistory(v) { return (history = v); }
export function setFuture(v) { return (future = v); }
export const uid = () => 'e' + Math.random().toString(36).slice(2, 9);
export const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
export const str = (v, d, n = 60) => (typeof v === 'string' ? v.slice(0, n) : d);
export const V = () => project.view;
/* the thing selected, whatever it is: { kind: 'electrode' | 'ion' | 'detector', el } or null */
export function selectedItem() {
  if (!project || !selectedId) return null;
  for (const [kind, list] of [['electrode', project.electrodes], ['ion', project.ions], ['detector', project.detectors]]) { const el = list.find(e => e.id === selectedId); if (el) return { kind, el }; }
  return null;
}
export const selected = () => { const s = selectedItem(); return s ? s.el : null; };
export const kindOf = el => (project.electrodes.includes(el) ? 'electrode' : project.ions.includes(el) ? 'ion' : project.detectors.includes(el) ? 'detector' : null);
export function nextName(prefix, list) {
  const used = new Set(list.map(e => e.name));
  let i = 1; while (used.has(prefix + ' ' + i)) i++;
  return prefix + ' ' + i;
}
