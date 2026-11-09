import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { hooks } from '../../../jekray/src/core/hooks.js';
import { accountGate, designPro } from '../../../jekray/src/ui/pro.js';
import { goal, track } from '../../../jekray/src/io/usage.js';
import { FILM_FORMAT, FILM_STORE_KEY, filmText, newFilm, normFilm } from '../core/film.js';
import { film, filmCurves, setFilm } from '../ui/designer.js';
import { setStatus, toast } from '../ui/bar.js';

/* ==========================================================================
   Files: the coating kept in this browser as it changes (the autosave, which needs no account), a .jekfilm file
   saved (JEKrayPro's, as the cloud is) and opened (open to all), a new coating, a file dropped on the page, and the
   curves exported as CSV (a free account's, as JEKray's exports are).
   ========================================================================== */
let filmSaveTimer = null;
export function filmAutosave() {
  if (TEST_MODE || EMBED) return;
  clearTimeout(filmSaveTimer);
  filmSaveTimer = setTimeout(filmKeepNow, 350);
}
export function filmKeepNow() {
  if (TEST_MODE || EMBED) return;
  try { localStorage.setItem(FILM_STORE_KEY, filmText(film)); }
  catch (err) { setStatus('not kept: this browser blocks it'); }
}
export function filmRestore() {
  if (TEST_MODE || EMBED) return null;
  try { const d = JSON.parse(localStorage.getItem(FILM_STORE_KEY) || 'null'); if (d && d.format === FILM_FORMAT) return normFilm(d); } catch (err) { /* nothing kept */ }
  return null;
}
export const filmFileName = (name, ext) => (String(name || 'coating').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'coating') + '.' + ext;
export function downloadBlob(name, blob) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* the coating as a .jekfilm file: JEKrayPro's */
export function saveFilmFile() {
  if (!designPro('save a coating file')) return false;
  const name = filmFileName(film.name, 'jekfilm');
  downloadBlob(name, new Blob([filmText(film)], { type: 'application/json' }));
  toast('Saved ' + name); track('save', 'film'); goal('save');
  return true;
}
/* a coating's data put here (undoable): from a file, the cloud or an example */
export function openFilmData(d, name) {
  if (!d || typeof d !== 'object') { toast('That is not a JEKfilm coating', true); return false; }
  if (d.format !== FILM_FORMAT) {
    toast(d.format === 'jekion' ? 'That is a JEKion bench: open it in JEKion' : d.format ? 'That is a JEKray bench: open it in JEKray' : 'That is not a JEKfilm coating', true);
    return false;
  }
  if (name && !d.name) d = Object.assign({}, d, { name: String(name).replace(/\.jekfilm$/i, '') });
  setFilm(d);
  return true;
}
export function openFilmFile(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let d = null;
    try { d = JSON.parse(rd.result); } catch (err) { toast('Could not read ' + file.name + ': it is not a JEKfilm file', true); return; }
    if (openFilmData(d, file.name)) { hooks.filmUnlink(); filmAutosave(); toast('Opened ' + file.name); track('import', 'jekfilm'); }
  };
  rd.readAsText(file);
}
export function newFilmHere() {
  setFilm(newFilm());
  hooks.filmUnlink(); filmAutosave();
  toast('A new coating. Undo brings the last one back.');
}
/* the curves as CSV, one heading row with units: wavelength against R, and angle against R(s), R(p) */
export function filmCsv(f) {
  const C = filmCurves(f), rows = [['wavelength (nm)', C.spec.theta0 ? 'R at ' + C.spec.theta0 + ' deg (%)' : 'R square on (%)', ...(C.Rt ? ['R at ' + C.spec.theta + ' deg (%)'] : []), 'target R (%)']];
  C.nms.forEach((nm, i) => rows.push([+nm.toFixed(3), +(100 * C.R0[i]).toPrecision(6), ...(C.Rt ? [+(100 * C.Rt[i]).toPrecision(6)] : []), +(100 * C.want[i]).toPrecision(6)]));
  rows.push([], ['angle (deg)', 'R s at ' + C.spec.design + ' nm (%)', 'R p at ' + C.spec.design + ' nm (%)']);
  C.A.degs.forEach((d, i) => rows.push([+d.toFixed(3), +(100 * C.A.s[i]).toPrecision(6), +(100 * C.A.p[i]).toPrecision(6)]));
  return '﻿' + rows.map(r => r.map(v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\r\n') + '\r\n';
}
export function exportCurves() {
  if (!accountGate('export the curves')) return;
  const name = filmFileName(film.name + ' reflectance', 'csv');
  downloadBlob(name, new Blob([filmCsv(film)], { type: 'text/csv' }));
  toast('Saved ' + name); track('export', 'film-csv');
}
export function wireFiles() {
  const fi = document.getElementById('fileFilm');
  document.getElementById('btnOpen').addEventListener('click', () => fi.click());
  fi.addEventListener('change', () => { if (fi.files[0]) openFilmFile(fi.files[0]); fi.value = ''; });
  document.getElementById('btnSaveFile').addEventListener('click', saveFilmFile);
  document.getElementById('btnNew').addEventListener('click', newFilmHere);
  document.getElementById('btnExportCsv').addEventListener('click', exportCurves);
  // a file dropped on the page
  document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (/\.(jekfilm|json)$/i.test(f.name)) openFilmFile(f);
    else toast(/\.jekray$/i.test(f.name) ? f.name + ' is a JEKray bench: open it in JEKray' : 'Drop a .jekfilm coating here', true);
  });
  window.addEventListener('beforeunload', filmKeepNow);
}
