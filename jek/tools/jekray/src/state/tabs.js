import { project } from './project.js';

/* ---------- Tabs: benches of their own ----------
   A project holds one or more benches, each on a tab with its own view; every element is on
   one of them. They are traced as one scene: a ray keeps to the bench it is on, and a link
   plane hands it to its partner on another (see the tracer). project.view is always the
   view of the tab on show. */
export function ensureBenches(p) {
  if (!Array.isArray(p.benches) || !p.benches.length) p.benches = [{ id: 'b1', name: 'Bench 1', view: p.view || { cx: 0, cy: 0, scale: 4 } }];
  const ids = new Set(p.benches.map(b => b.id));
  if (!ids.has(p.tab)) p.tab = p.benches[0].id;
  for (const e of p.elements) if (!ids.has(e.bench)) e.bench = p.benches[0].id;
  p.view = p.benches.find(b => b.id === p.tab).view;
  return p;
}
export const curBench = () => project.benches.find(b => b.id === project.tab) || project.benches[0];
export const onTab = el => el.bench === project.tab;
export const benchName = id => { const b = project.benches.find(b2 => b2.id === id); return b ? b.name : '?'; };
/* link planes by pair name, in bench order: the first two of a name are partners */
export function linkPairs() {
  const m = new Map();
  for (const e of project.elements) if (e.type === 'link') { if (!m.has(e.pair)) m.set(e.pair, []); m.get(e.pair).push(e); }
  return m;
}
export function linkPartner(el) {
  const L = linkPairs().get(el.pair) || [];
  const i = L.indexOf(el);
  return i === 0 && L.length > 1 ? L[1] : i === 1 ? L[0] : null;
}

