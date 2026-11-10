import { DATA_FORMATS, dfWrite } from '../../../jekray/src/core/datafiles.js';
import { accountGate, designPro, needMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { h } from '../../../jekray/src/ui/dom.js';
import { qwot } from '../../../jekray/src/core/coatings.js';
import { metalNK } from '../../../jekray/src/core/metals.js';
import { FILM_VERSION, subLabelOf } from '../core/film.js';
import { film, filmCurves } from '../ui/designer.js';
import { toast } from '../ui/bar.js';
import { downloadBlob, filmFileName } from './files.js';

/* ==========================================================================
   File › Export data…: the coating's numbers (the reflectance across the band, against the angle, and the layers) as
   CSV (a zip), JSON, Excel, NumPy or MATLAB, by JEKray's writers (core/datafiles.js). Gated as JEKray's and JEKion's:
   CSV or JSON needs a free account; Excel, NumPy and MATLAB are JEKrayPro's.
   ========================================================================== */
export const FILM_DATA_PRO = new Set(['xlsx', 'npz', 'mat']);
let filmDataFmt = 'csv';
const col = (name, unit, values, type) => ({ name, unit, values, type });
/* the coating's numbers as a set of tables, as the writers take them */
export function filmDataSet(f) {
  const C = filmCurves(f), s = C.spec, pc = v => 100 * v;
  const band = [col('wavelength', 'nm', C.nms), col('R at ' + s.theta0 + ' deg', '%', C.R0.map(pc))];
  if (C.Rt) band.push(col('R at ' + s.theta + ' deg', '%', C.Rt.map(pc)));
  band.push(col('target R', '%', C.want.map(pc)));
  const L = f.layers;
  const items = [
    { kind: 'table', name: 'band', about: 'the reflectance across the band, at the smallest and largest angles judged, and its target', cols: band },
    { kind: 'table', name: 'angle', about: 'the reflectance against the angle of incidence at the design wavelength ' + s.design + ' nm', cols: [col('angle', 'deg', C.A.degs), col('Rs', '%', C.A.s.map(pc)), col('Rp', '%', C.A.p.map(pc))] },
    { kind: 'table', name: 'layers', about: 'the layers from the outside in; n and k at the design wavelength (k for a metal)', cols: [
      col('layer', '', L.map((_, i) => i + 1), 'int'), col('material', '', L.map(x => (x.metal ? x.metal : 'n ' + x.n)), 'str'),
      col('n', '', L.map(x => (x.metal ? metalNK(x.metal, s.design)[0] : x.n))), col('k', '', L.map(x => (x.metal ? metalNK(x.metal, s.design)[1] : 0))),
      col('thickness', 'nm', L.map(x => x.d)), col('QWOT', '', L.map(x => (x.metal ? NaN : x.d / qwot(x.n, s.design))))] },
  ];
  return { meta: { title: f.name, tool: 'JEKfilm', version: FILM_VERSION, created: new Date().toISOString(), format: 'jekfilm', target: s.target, substrate: subLabelOf(f.spec.sub), substrate_n: s.ns, design_nm: s.design, band_nm: [s.lo, s.hi], angles_deg: [s.theta0, s.theta], polarisation: s.pol }, items };
}
export async function filmExportData(fmt) {
  if (!accountGate('export data')) return false;
  if (FILM_DATA_PRO.has(fmt) && !designPro('export data as ' + DATA_FORMATS[fmt].label)) return false;
  try {
    const W = await dfWrite(filmDataSet(film), fmt), name = filmFileName(film.name + ' data', W.ext.slice(1));
    downloadBlob(name, new Blob([W.bytes], { type: W.mime }));
    toast('Saved ' + name); track('export', 'film-data-' + fmt);
    return true;
  } catch (err) { toast('Could not write the file: ' + err.message, true); return false; }
}
function dataDialog() {
  let dlg = document.getElementById('filmData');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'filmData', 'aria-labelledby': 'filmDataTitle' }); document.body.append(dlg); }
  const box = h('div', { class: 'film-fmts', role: 'radiogroup', 'aria-label': 'Format' }, ...Object.entries(DATA_FORMATS).map(([k, F]) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'rt-btn', 'data-fmt': k, 'aria-checked': String(k === filmDataFmt), onclick: () => { filmDataFmt = k; for (const x of box.children) x.setAttribute('aria-checked', String(x === b)); } }, F.label);
    return FILM_DATA_PRO.has(k) ? needMark(b, 'pro', 'export data as ' + F.label) : b;
  }));
  dlg.replaceChildren(h('h2', { id: 'filmDataTitle' }, 'Export data'),
    h('p', null, 'The reflectance across the band and against the angle, and the layers, as three tables with their units.'), box,
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'rt-btn primary', type: 'button', id: 'filmDataGo', onclick: async () => { if (await filmExportData(filmDataFmt)) dlg.close(); } }, 'Export')));
  dlg.showModal();
}
export function wireFilmData() { document.getElementById('btnExportData').addEventListener('click', dataDialog); }
