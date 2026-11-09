import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { installHooks } from '../../../jekray/src/core/hooks.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { accountLoaded } from '../../../jekray/src/io/account.js';
import { FILM_VERSION, filmSpec, filmToCoat, newFilm, normFilm } from '../core/film.js';
import { film, optimiseNow, redo, render, setFilm, undo } from './designer.js';
import { filmThemeApply, toast, wireBar } from './bar.js';
import { filmAutosave, filmCsv, filmRestore, newFilmHere, openFilmData, saveFilmFile, wireFiles } from '../io/files.js';
import { wireFilmAccount } from '../io/film-account.js';
import { filmCloudChanged, filmLink, filmPush, openCloudFilm, saveToCloud, wireCloud } from '../io/cloud.js';

/* ==========================================================================
   JEKfilm put together: the theme, the hooks the shared modules reach the page through, each module's wiring, the
   coating restored from this browser (or a new one), a cloud coating from the address (#cloud=<id>, #new), and
   window.JEKfilm for the tests and the console.
   ========================================================================== */
filmThemeApply();
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', filmThemeApply);
window.addEventListener('storage', e => { if (e.key === 'jekray-theme') filmThemeApply(); });
// this tab is JEKfilm's: JEKspace and the other apps open a coating here rather than in a new tab each time
if (!TEST_MODE && !EMBED && !window.name) window.name = 'jekfilm';
installHooks({
  toast, needsShown,
  filmChanged: () => { filmAutosave(); filmCloudChanged(); },
  filmLinked: () => false, filmUnlink() {}, filmCloudShown() {},
});
const kept = filmRestore();
setFilm(kept || newFilm(), true);
wireBar(); wireFiles(); wireCloud(); wireFilmAccount(); wireUsage();
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
{
  const nm = document.getElementById('filmName');
  nm.addEventListener('change', () => { const v = nm.value.trim(); if (v && v !== film.name) { setFilm(Object.assign({}, film, { name: v })); filmAutosave(); filmCloudChanged(); } else nm.value = film.name; });
  nm.addEventListener('keydown', e => { if (e.key === 'Enter') nm.blur(); });
}
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (filmLink) filmPush({ checkpoint: true }); else saveFilmFile(); }
  else if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  else if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
});
document.addEventListener('rt-theme', render);
needsShown();
usageStart(kept ? 'film-restored' : 'film-fresh');
// #cloud=<id> (or <id>@<version>, a copy of that version) opens a cloud coating; #new starts a new one here
const filmHash = async () => {
  const cl = location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?(?::\w+)?$/);
  if (cl) { window.history.replaceState(null, '', location.pathname); await accountLoaded; openCloudFilm(cl[1], cl[2] ? Number(cl[2]) : undefined); }
  else if (location.hash === '#new') { window.history.replaceState(null, '', location.pathname); newFilmHere(); }
};
if (!TEST_MODE && !EMBED) { filmHash(); window.addEventListener('hashchange', filmHash); }
// the tests' and the console's handle on the app
window.JEKfilm = {
  version: FILM_VERSION,
  film: () => film, spec: () => filmSpec(film), load(d) { openFilmData(d, d && d.name); return film; }, normFilm,
  optimise: optimiseNow, undo, redo, csv: () => filmCsv(film), coat: () => filmToCoat(film), saveToCloud, link: () => filmLink,
};
