import { designPro } from '../../../jekray/src/ui/pro.js';
import { dfWrite, dfItemsOf, DATA_FORMATS } from '../../../jekray/src/core/datafiles.js';
import { track } from '../../../jekray/src/io/usage.js';
import { nf } from '../core/units.js';
import { project } from '../state/project.js';
import { checkpoint, serialize } from '../state/elements.js';
import { gatherIonData } from '../engines/data.js';
import { changed, downloadFile, safeFileName, toast } from './actions.js';
import { SIM, flyNow, trapNow } from './sim.js';
import { APP_VERSION } from './news.js';

/* ==========================================================================
   Tools › Scripts: JavaScript run on the page against the bench through J (JEKrayPro). set changes a thing by name,
   fly solves and flies (awaited), results gives the last flight's numbers, sweep flies once a value, save keeps a
   table as a file. The script's edits are one undo step.
   ========================================================================== */
const EXAMPLE = `// Sweep the focus tube's voltage and record where the beam crosses the axis
const rows = [];
for (const V of [-800, -1000, -1200, -1400, -1600]) {
  J.set('Focus tube', 'V', V);
  const R = await J.fly();
  const hits = R.hits('Screen');
  const r = hits.length ? Math.sqrt(hits.reduce((a, h) => a + h.y * h.y + h.z * h.z, 0) / hits.length) : NaN;
  rows.push({ V, hits: hits.length, rmsRadius_mm: r });
  J.log(V + ' V: ' + hits.length + ' hits, rms radius ' + r.toFixed(3) + ' mm');
}
J.save('focus sweep', rows, 'csv');`;
export function makeJ(log) {
  const find = name => { const all = [...project.electrodes, ...project.ions, ...project.detectors]; const el = all.find(e => e.name === name) || all.find(e => e.id === name); if (!el) throw new Error('nothing is called ' + name); return el; };
  const saves = [];
  const J = {
    log: (...a) => log(a.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')),
    project: () => JSON.parse(JSON.stringify(serialize())),
    names: () => ({ electrodes: project.electrodes.map(e => e.name), ions: project.ions.map(e => e.name), detectors: project.detectors.map(e => e.name) }),
    get: (name, key) => { const el = find(name); return key === undefined ? JSON.parse(JSON.stringify(Object.assign({}, el, { meshT: undefined }))) : key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), el); },
    set: (name, key, value) => { const el = find(name), path = key.split('.'); let o = el; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = value; changed(false); return value; },
    setting: (key, value) => { const path = key.split('.'); let o = project; for (const k of path.slice(0, -1)) o = o[k]; if (value !== undefined) { o[path[path.length - 1]] = value; changed(false); } return o[path[path.length - 1]]; },
    fly: async () => { await flyNow(); return J.results(); },
    trap: async () => trapNow(),
    results: () => {
      const R = SIM.result; if (!R) return null;
      const dets = project.detectors.filter(d => d.on !== false);
      return { n: R.particles.length, ms: R.ms, particles: R.particles.map(p => ({ group: (project.ions[p.group] || {}).name, i: p.i, m: p.m, q: p.q, ke0: p.ke0, t0: p.t0, start: p.start.slice(), end: Object.assign({}, p.end), hits: p.hits.map(hh => Object.assign({}, hh, { det: (dets[hh.det] || {}).name })), collisions: p.collisions || 0 })),
        hits: name => { const di = dets.findIndex(d => d.name === name); if (di < 0) throw new Error('no detector called ' + name); const out = []; for (const p of R.particles) for (const hh of p.hits) if (hh.det === di) out.push(Object.assign({ group: (project.ions[p.group] || {}).name, i: p.i }, hh)); return out; },
        ends: () => { const o = {}; for (const p of R.particles) o[p.end.why] = (o[p.end.why] || 0) + 1; return o; },
        path: (group, i) => { const gi = project.ions.findIndex(g => g.name === group); const p = R.particles.find(q => q.group === gi && q.i === (i || 0)); if (!p) return null; const out = []; for (let k = 0; k < p.pts.length; k += 4) out.push({ x: p.pts[k], y: p.pts[k + 1], z: p.pts[k + 2], t: p.pts[k + 3] }); return out; } };
    },
    sweep: async (name, key, values, fn) => { const out = []; for (const v of values) { J.set(name, key, v); const R = await J.fly(); out.push(fn ? fn(R, v) : { value: v, ends: R.ends() }); } return out; },
    data: kinds => gatherIonData(project, SIM.result, SIM.trap, kinds),
    save: (name, data, format) => { saves.push({ name: String(name || 'data'), data, format: DATA_FORMATS[format] ? format : 'csv' }); },
    nf,
  };
  return { J, saves };
}
export async function runScript(code, log) {
  const { J, saves } = makeJ(log);
  checkpoint();
  const fn = new Function('J', 'return (async () => {\n' + code + '\n})();');
  await fn(J);
  for (const s of saves) {
    const items = dfItemsOf(s.data, s.name), set = { meta: { title: project.name + ': ' + s.name, tool: 'JEKion', version: APP_VERSION, created: new Date().toISOString() }, items };
    const W = await dfWrite(set, s.format);
    downloadFile(safeFileName(s.name) + W.ext, new Blob([W.bytes], { type: W.mime }));
  }
  return saves.length;
}
export function wireScripts() {
  const dlg = document.getElementById('scriptDialog'), ta = document.getElementById('scriptText'), out = document.getElementById('scriptOut');
  const KEY = 'jek-ion-script';
  try { ta.value = localStorage.getItem(KEY) || ''; } catch (err) { /* empty */ }
  document.getElementById('btnScripts').addEventListener('click', () => { if (!designPro('run scripts')) return; dlg.showModal(); track('mod', 'ion-scripts'); });
  document.getElementById('scriptClose').addEventListener('click', () => dlg.close());
  document.getElementById('scriptExample').addEventListener('click', () => { ta.value = EXAMPLE; });
  document.getElementById('scriptRun').addEventListener('click', async () => {
    if (!designPro('run scripts')) return;
    out.textContent = '';
    const log = s => { out.textContent += s + '\n'; out.scrollTop = out.scrollHeight; };
    try { localStorage.setItem(KEY, ta.value); } catch (err) { /* fine */ }
    const btn = document.getElementById('scriptRun'); btn.disabled = true;
    try { const n = await runScript(ta.value, log); log('Done' + (n ? ', ' + n + ' file' + (n === 1 ? '' : 's') + ' saved' : '')); }
    catch (err) { log('Error: ' + (err && err.message || err)); toast('The script failed: ' + (err && err.message || err), true); }
    btn.disabled = false;
  });
}
