import { EMBED, TEST_MODE, cloud } from '../../../jekray/src/core/constants.js';
import { installHooks } from '../../../jekray/src/core/hooks.js';
import { needsShown } from '../../../jekray/src/ui/pro.js';
import { usageDrawn, usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { shapeBounds } from '../core/geom.js';
import { future, history, project, setFuture, setHistory } from '../state/project.js';
import { checkpoint, demoProject, loadProject, serialize } from '../state/elements.js';
import { buildArray, fieldSetOf, solveArray } from '../engines/session.js';
import { flyAll } from '../engines/fly.js';
import { trapAnalysis } from '../engines/trap.js';
import { potentialAt, eFieldAt } from '../engines/fields.js';
import { gatherIonData } from '../engines/data.js';
import { h, renderPanel, syncPanel } from './panel.js';
import { fitView, requestRender, setDrawnOnce, setTheme, themePref, wireRender } from './render.js';
import { wirePointer } from './pointer.js';
import { changed, toast, updateUndoButtons, viewMenuShown, wireActions, addElectrode, addIon, addDetector, selectOne } from './actions.js';
import { SIM, flyNow, requestSlice, stopFly, trapNow, wireSim } from './sim.js';
import { setPotPlot, wirePanels } from './panels.js';
import { wirePicker } from './picker.js';
import { wireNews, openGallery, APP_VERSION } from './news.js';
import { wireScripts, runScript } from './scripts.js';
import { V3D, wireView3d } from './view3d.js';
import { newProject, openDemo, openProjectData, restoreSaved, scheduleSave, wireOpen } from '../io/open.js';
import { accountLoaded, wireAccount } from '../io/account.js';
import { cloudPush, openCloudBench, openCloudList, wireCloud } from '../io/cloud.js';
import { exportData, wireDataExport } from '../io/data-export.js';
import { openShareHash, openShortLink, shareRoundTrip, wireShare } from '../io/share.js';
import { bodiesToElectrodes } from '../io/step.js';
import { mapLog, mapRange } from './render.js';
import { viridisCss } from '../core/colour.js';

/* ==========================================================================
   The page put together: the hooks the engines and the shared modules reach the page through, every module's wiring
   in order, the bench restored (or the first one), and window.JEKion for the tests and the console.
   ========================================================================== */
const MENU_ICONS = {
  new: 'M4 1.5h5.5L12.5 4.5V14.5H4Z M9.5 1.5V4.5H12.5', open: 'M1.5 4.5V13.5H13L14.5 7.5H4L2.5 13 M1.5 4.5V2.5H6L7.5 4H12.5V7.5', save: 'M2.5 2.5H11L13.5 5V13.5H2.5Z M5 2.5V6H10V2.5 M5 13.5V9.5H11V13.5',
  gallery: 'M1.5 2.5H14.5V13.5H1.5Z M1.5 10.5L5.5 6.5L8.5 9.5L10.5 7.5L14.5 11.5 M11 5A0.5 0.5 0 1 0 11 4.9', cube: 'M8 1.5L14 5V11L8 14.5L2 11V5Z M8 8L14 5 M8 8V14.5 M8 8L2 5',
  image: 'M1.5 2.5H14.5V13.5H1.5Z M1.5 10.5L5.5 6.5L8.5 9.5L10.5 7.5L14.5 11.5', export: 'M8 1.5V10 M5 7L8 10L11 7 M2.5 11V14H13.5V11',
  undo: 'M5.5 3.5L2.5 6.5L5.5 9.5 M2.5 6.5H10Q13.5 6.5 13.5 10Q13.5 13.5 10 13.5H6', redo: 'M10.5 3.5L13.5 6.5L10.5 9.5 M13.5 6.5H6Q2.5 6.5 2.5 10Q2.5 13.5 6 13.5H10',
  dup: 'M5 5H14V14H5Z M2 11V2H11', trash: 'M2.5 4H13.5 M5.5 4V2.5H10.5V4 M4 4L4.5 14H11.5L12 4 M6.5 6.5V11.5 M9.5 6.5V11.5', fit: 'M2 6V2H6 M10 2H14V6 M14 10V14H10 M6 14H2V10',
  check: 'M3 8.5L6.5 12L13 4', theme: 'M8 1.5A6.5 6.5 0 1 0 8 14.5Z', cut: 'M2 12L14 12 M8 2L8 14 M2 4L14 4', pot: 'M2 13C5 13 5 3 8 3S11 13 14 13', paths: 'M2 12C5 12 5 4 8 8S11 12 14 4', parts: 'M2 2H7V7H2Z M9 2H14V7H9Z M2 9H7V14H2Z M9 9H14V14H9Z', play: 'M4 2.5L13 8L4 13.5Z', pause: 'M4 2.5H6.5V13.5H4Z M9.5 2.5H12V13.5H9.5Z',
  target: 'M8 2A6 6 0 1 0 8 14A6 6 0 1 0 8 2 M8 5A3 3 0 1 0 8 11A3 3 0 1 0 8 5 M8 1V3 M8 13V15 M1 8H3 M13 8H15', flask: 'M6 1.5H10 M7 1.5V6L2.5 13.5H13.5L9 6V1.5', sliders: 'M2 4H14 M2 8H14 M2 12H14 M5 2.5V5.5 M11 6.5V9.5 M7 10.5V13.5',
  keyboard: 'M1.5 4H14.5V12H1.5Z M4 6.5H5 M7 6.5H8 M10 6.5H11 M4 9.5H12', book: 'M2 3H6.5Q8 3 8 4.5V14Q8 12.5 6.5 12.5H2Z M14 3H9.5Q8 3 8 4.5V14Q8 12.5 9.5 12.5H14Z', star: 'M8 1.5L9.9 6.1L14.5 6.5L11 9.6L12.1 14.5L8 12L3.9 14.5L5 9.6L1.5 6.5L6.1 6.1Z',
  quote: 'M3 3H7V8H4.5Q3 8 3 9.5V11 M9.5 3H13.5V8H11Q9.5 8 9.5 9.5V11', bug: 'M8 4A3.5 3.5 0 0 1 11.5 7.5V11A3.5 3.5 0 0 1 4.5 11V7.5A3.5 3.5 0 0 1 8 4Z M5 2.5L6.5 4 M11 2.5L9.5 4 M1.5 8H4.5 M11.5 8H14.5 M2.5 12.5L4.5 11 M13.5 12.5L11.5 11',
  info: 'M8 1.5A6.5 6.5 0 1 0 8 14.5A6.5 6.5 0 1 0 8 1.5 M8 7V11.5 M8 4.5V5', pdf: 'M4 1.5h5.5L12.5 4.5V14.5H4Z', beam: 'M1.5 8H14.5 M10.5 4.5L14.5 8L10.5 11.5', home: 'M2 8L8 2.5L14 8 M4 7V13.5H12V7',
  paste: 'M5 2.5H3.5V14.5H12.5V2.5H11 M5.5 1.5H10.5V3.5H5.5Z', share: 'M12 2.5A1.5 1.5 0 1 0 12 5.5A1.5 1.5 0 1 0 12 2.5 M4 6.5A1.5 1.5 0 1 0 4 9.5A1.5 1.5 0 1 0 4 6.5 M12 10.5A1.5 1.5 0 1 0 12 13.5A1.5 1.5 0 1 0 12 10.5 M5.3 7.3L10.7 4.7 M5.3 8.7L10.7 11.3', link: 'M6.5 9.5L9.5 6.5 M7 11L5.5 12.5A2.1 2.1 0 0 1 2.5 9.5L4.5 7.5A2.1 2.1 0 0 1 7.5 7.5 M9 5L10.5 3.5A2.1 2.1 0 0 1 13.5 6.5L11.5 8.5A2.1 2.1 0 0 1 8.5 8.5', eye: 'M1.5 8Q8 1.5 14.5 8Q8 14.5 1.5 8Z M8 6A2 2 0 1 1 8 10A2 2 0 1 1 8 6', user: 'M8 2A3 3 0 1 0 8 8A3 3 0 1 0 8 2 M2.5 14Q2.5 9.5 8 9.5Q13.5 9.5 13.5 14', signin: 'M6 2.5H13.5V13.5H6 M2 8H9.5 M7 5.5L9.5 8L7 10.5', signout: 'M10 2.5H2.5V13.5H10 M14 8H6.5 M11.5 5.5L14 8L11.5 10.5',
};
function menuIcons(root) {
  for (const n of root.querySelectorAll('.rt-imenu [data-icon], .rt-tbi[data-icon], .rt-tbl[data-icon]')) {
    if (n.querySelector(':scope > svg.ic')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', MENU_ICONS[n.dataset.icon] || '');
    svg.append(p); n.prepend(svg);
  }
}
/* the colour bar for the potential map */
function legendShown() {
  const box = document.getElementById('legend'), S = SIM.slice;
  if (!box) return;
  if (!S || project.show.pot === 'none' || (project.show.pot === 'contours' && !project.show.efield) || !mapRange) { box.hidden = true; return; }
  box.hidden = false;
  const cv = h('canvas', { width: 120, height: 8 }), c = cv.getContext('2d');
  for (let i = 0; i < 120; i++) { c.fillStyle = viridisCss(i / 119); c.fillRect(i, 0, 1, 8); }
  const span = Math.abs(mapRange[1] - mapRange[0]) || 1, f = v => (!mapLog && Math.abs(v) < 1e-4 * span ? '0' : Math.abs(v) >= 1000 ? (v / 1000).toPrecision(3) + ' k' : (+v.toPrecision(3)).toString());    // a 7e-9 floor reads 0
  box.replaceChildren(h('div', null, project.show.efield && S.emag ? '|E| (V/mm' + (mapLog ? ', log' : '') + ')' : 'potential (V)'), cv, h('div', { class: 'lr' }, h('span', null, f(mapRange[0])), h('span', null, f(mapRange[1]))));
}
/* the theme menu */
function themeMenu() {
  const menu = document.getElementById('themeMenu');
  menu.replaceChildren(...[['system', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(themePref === v), 'data-icon': 'check', onclick: () => { setTheme(v); themeMenu(); V3D.draw(); } }, label)));
  menuIcons(menu);
}

installHooks({
  requestRender, renderPanel, syncPanel, toast,
  ionChanged: changed, ionStatus: () => {}, ionLegend: legendShown, ionResults: () => { renderPanel(); V3D.draw(); }, ionDraw3d: () => V3D.refresh(), ionFit3d: () => { if (!V3D.active()) return false; V3D.fit(); return true; }, ionHistory: () => ({ history, future }),
  ionViewMenu: viewMenuShown, ionBounds: shapeBounds, ionBusy: () => SIM.busy, ionStop: stopFly, ionMenuIcons: menuIcons, needsShown,
});
// this tab is the JEKion one: JEKray's My benches opens a JEKion bench here rather than in a new tab each time
if (!TEST_MODE && !EMBED && !window.name) window.name = 'jekion';
// the bench: restored from this browser, or the first one
const saved = restoreSaved();
loadProject(saved || demoProject());
setHistory([]); setFuture([]);
wireRender(); wirePointer(); wireActions(); wireSim(); wirePanels(); wirePicker(); wireOpen(); wireNews(); wireScripts(); wireDataExport(); wireAccount(); wireCloud(); wireShare(); wireView3d(); wireUsage();
menuIcons(document); themeMenu(); viewMenuShown(); renderPanel(); updateUndoButtons();
setDrawnOnce(() => { usageDrawn(); });
usageStart(saved ? 'ion-restored' : 'ion-fresh');
if (!saved) fitView(); else requestRender();
requestSlice();
if (project.fly.auto && !TEST_MODE) flyNow();
// a share link opens the bench it names: #s=<id> (a short one, /i/<id> on the site) or #p=<the bench itself>
const shortLinkAt = !TEST_MODE && location.hash.match(/^#s=([A-Za-z2-7]{10})$/), longLinkAt = !TEST_MODE && location.hash.match(/^#p=([ik][A-Za-z0-9_-]+)/);
if (shortLinkAt || longLinkAt) { window.history.replaceState(null, '', location.pathname); if (shortLinkAt) openShortLink(shortLinkAt[1]); else openShareHash(longLinkAt[1]); }
if (!TEST_MODE) window.addEventListener('hashchange', () => { const sh = location.hash.match(/^#p=([ik][A-Za-z0-9_-]+)/), ss = location.hash.match(/^#s=([A-Za-z2-7]{10})$/); if (!sh && !ss) return; window.history.replaceState(null, '', location.pathname); if (sh) openShareHash(sh[1]); else openShortLink(ss[1]); });
// ?demo=<name> or #demo=<name> opens an example; #examples the gallery
const demo = !TEST_MODE && (location.hash + '&' + location.search).match(/[#?&]demo=([a-z0-9-]+)/);
if (!saved && !demo && !TEST_MODE && !EMBED) setTimeout(() => toast('Welcome to JEKion. This is an einzel lens: drag a tube, change its voltage, and the ions fly again. File › Import brings in a trap from CAD.'), 600);
if (demo) { window.history.replaceState(null, '', location.pathname); openDemo(demo[1]); }
if (!TEST_MODE && location.hash === '#examples') { window.history.replaceState(null, '', location.pathname); setTimeout(openGallery, 0); }
// #cloud=<id> (or #cloud=<id>@<version>, a copy of a version) opens a cloud bench; #benches opens JEKspace, where the
// benches are; #new (JEKspace's New, for someone with nowhere in the cloud to put it) starts a new bench
const cloudAt = !TEST_MODE && !EMBED && location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?$/), benchesAt = !TEST_MODE && !EMBED && location.hash === '#benches';
const cloudHash = async (cl, benches) => { window.history.replaceState(null, '', location.pathname); await accountLoaded; if (cl) openCloudBench(cl[1], cl[2] ? Number(cl[2]) : undefined); else if (benches) openCloudList(); };
if (cloudAt || benchesAt) cloudHash(cloudAt, benchesAt);
if (!TEST_MODE && !EMBED && location.hash === '#new') { window.history.replaceState(null, '', location.pathname); newProject(); }
if (!TEST_MODE && !EMBED) window.addEventListener('hashchange', () => { const cl = location.hash.match(/^#cloud=([A-Za-z0-9_-]+)(?:@(\d+))?$/); if (cl || location.hash === '#benches') cloudHash(cl, location.hash === '#benches'); else if (location.hash === '#new') { window.history.replaceState(null, '', location.pathname); newProject(); } });
// the tests' and the console's handle on the tool
window.JEKion = {
  version: APP_VERSION,
  load(d) { openProjectData(d, d && d.name, { fresh: true }); return project; },
  project: () => project, serialize, demoProject,
  select: selectOne, add: { electrode: addElectrode, ion: addIon, detector: addDetector },
  // the engines run here and now, on the page, for a project as data (the worker is bypassed)
  solve(P) { const A = buildArray(P); const cycles = solveArray(A); return { A, F: fieldSetOf(A, P), cycles }; },
  fly(P) { const S = this.solve(P); return Object.assign(flyAll(S.F, P), { F: S.F }); },
  trap(P, point, species) { const S = this.solve(P); return trapAnalysis(S.F, P, point, species || P.species); },
  potential(F, x, y, z, t) { return potentialAt(F.G, F.g, x, y, z, t || 0); },
  field(F, x, y, z, t) { const E = [0, 0, 0]; return eFieldAt(F.G, F.g, x, y, z, t || 0, E) ? E : null; },
  // the page's own run: a promise of the results, as the worker (or the page without one) gives them
  flyPage: async () => { await flyNow(); return SIM.result; },
  trapPage: () => trapNow(), sim: SIM, data: kinds => gatherIonData(project, SIM.result, SIM.trap, kinds), exportData,
  bodiesToElectrodes, runScript, checkpoint, changed, fitView, v3d: V3D, scheduleSave, setPotPlot, shareRoundTrip, openShareHash,
  cloud: { push: cloudPush, link: () => cloud, open: openCloudBench, list: openCloudList },
};
