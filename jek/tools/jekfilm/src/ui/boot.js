import { EMBED, TEST_MODE } from '../../../jekray/src/core/constants.js';
import { installHooks } from '../../../jekray/src/core/hooks.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { accountLoaded } from '../../../jekray/src/io/account.js';
import { FILM_VERSION, filmSpec, filmToCoat, newFilm, normFilm } from '../core/film.js';
import { film, optimiseNow, redo, render, setFilm, undo } from './designer.js';
import { filmThemeApply, toast, wireBar } from './bar.js';
import { filmAutosave, filmCsv, filmRestore, newFilmHere, openFilmData, openFilmExample, saveFilmFile, wireFiles } from '../io/files.js';
import { wireFilmAccount } from '../io/film-account.js';
import { openFilmHash, openFilmShort, shareFilm, wireShare, filmShareHash, readFilmHash } from '../io/share.js';
import { filmCloudChanged, filmFor, filmLink, filmPush, openCloudFilm, saveToCloud, setFilmFor, setFilmLink, wireCloud } from '../io/cloud.js';

/* ==========================================================================
   JEKfilm put together: the theme, the hooks the shared modules reach the page through, each module's wiring, the
   coating restored from this browser (or a new one), a cloud coating from the address (#cloud=<id>, #new), and
   window.JEKfilm for the tests and the console.
   ========================================================================== */
filmThemeApply();
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', filmThemeApply);
window.addEventListener('storage', e => { if (e.key === 'jekray-theme') filmThemeApply(); });
// this tab is JEKfilm's: JEKsuite and the other apps open a coating here rather than in a new tab each time
if (!TEST_MODE && !EMBED && !window.name) window.name = 'jekfilm';
installHooks({
  toast, needsShown,
  filmChanged: () => { filmAutosave(); filmCloudChanged(); },
  filmLinked: () => false, filmUnlink() {}, filmCloudShown() {},
});
const kept = filmRestore();
setFilm(kept || newFilm(), true);
wireBar(); wireFiles(); wireCloud(); wireFilmAccount(); wireShare(); wireUsage();
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
  if (!location.hash && /[?&]demo=[a-z0-9-]+/.test(location.search)) { const slug = location.search.match(/[?&]demo=([a-z0-9-]+)/)[1]; window.history.replaceState(null, '', location.pathname); openFilmExample(slug); return; }
  const cl = location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?(?::\w+)?$/);
  if (cl) { window.history.replaceState(null, '', location.pathname); await accountLoaded; openCloudFilm(cl[1], cl[2] ? Number(cl[2]) : undefined); }
  else if (/^#s=[A-Za-z2-7]{10}$/.test(location.hash)) { const id = location.hash.slice(3); window.history.replaceState(null, '', location.pathname); openFilmShort(id); }
  else if (/^#p=[fg][A-Za-z0-9_-]+$/.test(location.hash)) { const hash = location.hash.slice(3); window.history.replaceState(null, '', location.pathname); openFilmHash(hash); }
  else if (/^#demo=[a-z0-9-]+$/.test(location.hash)) { const slug = location.hash.slice(6); window.history.replaceState(null, '', location.pathname); openFilmExample(slug); }
  else if (location.hash === '#new') { window.history.replaceState(null, '', location.pathname); newFilmHere(); }
  else if (/^#design=/.test(location.hash)) {
    // from a JEKray face: its glass, wavelength and stack to start from, and where to send the coating back
    let pass = null;
    try { pass = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(8).replace(/-/g, '+').replace(/_/g, '/'))))); } catch (err) { /* below */ }
    window.history.replaceState(null, '', location.pathname);
    if (!pass || !pass.seed) { toast('That link to a face could not be read', true); return; }
    setFilm(pass.seed); setFilmLink(null); filmAutosave();
    setFilmFor(pass.face ? { face: String(pass.face), label: String(pass.label || 'a face').slice(0, 80), ws: pass.ws || null, folder: pass.folder || null } : null);
  }
};
if (!TEST_MODE && !EMBED) { filmHash(); window.addEventListener('hashchange', filmHash); }
// the tests' and the console's handle on the app
window.JEKfilm = {
  version: FILM_VERSION,
  film: () => film, spec: () => filmSpec(film), load(d) { openFilmData(d, d && d.name); return film; }, normFilm,
  optimise: optimiseNow, undo, redo, csv: () => filmCsv(film), coat: () => filmToCoat(film), saveToCloud, link: () => filmLink, forFace: () => filmFor, share: shareFilm, example: openFilmExample, shareHash: () => filmShareHash(), readHash: readFilmHash, openHash: openFilmHash,
};
