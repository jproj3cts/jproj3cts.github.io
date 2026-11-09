import { TEST_MODE } from '../../../jekray/src/core/constants.js';
import { track } from '../../../jekray/src/io/usage.js';
import { project } from '../state/project.js';
import { h } from './panel.js';
import { toast } from './actions.js';
import { openDemo } from '../io/open.js';

/* ==========================================================================
   Version, what's new, the examples gallery, citing and reporting a bug.
   ========================================================================== */
export const APP_VERSION = '1.0', APP_DATE = '12 November 2026';
export const NEWS = [
  ['1.0', APP_DATE, [
    '<b>JEKspace</b>, the JEK hub: File \u203a My benches on JEKspace opens <a href="/jek/tools/jekspace.html" target="_blank">JEKspace</a> in its own tab, with every cloud bench of every JEK app, JEKion\u2019s among them, labelled and filtered by app; a JEKion bench chosen there opens here. New there starts a JEKion bench, in the cloud when you can save there. Your account, plan and teams are there too.',
    '<b>JEKion 1.0, released</b>: a charged-particle trap simulator in the browser, alongside JEKray. Electrodes from the bodies of a STEP or STL file, the potential solved by multigrid in planar, cylindrical or three-dimensional symmetry, ions and electrons flown relativistically through it and a uniform magnetic field, with RF voltages, a background gas and space charge; detectors, splats, time-of-flight and energy spectra; a trap analysis giving Mathieu a and q, secular and Penning frequencies.',
    'Examples: an einzel lens, a quadrupole deflector, a linear time-of-flight, a reflectron, a quadrupole mass filter, a Paul trap and a Penning trap.',
    'Export data as CSV, JSON, Excel, NumPy or MATLAB (JEKray’s writers); scripts in JavaScript against the bench (JEKrayPro).',
    '<b>Share links</b>: Share copies a short link that opens the bench as it is now, for anyone (JEKrayPro; a free account keeps three), as JEKray\u2019s do. The potential plotted along the axis, across it, along a picked line or along a particle\u2019s path; a CAD body\u2019s voxels found by winding along three axes; the field strength drawn logarithmically; RF down to single hertz.',
    '<b>Cloud benches</b>, as JEKray\u2019s: File \u203a Save to cloud puts the bench in your cloud benches or a team\u2019s, where it saves as you work with its history; My benches opens the home of every bench, JEKray\u2019s page, where a JEKion bench is marked and opens back here; Fork this bench carries on in a new one. A link #cloud=<id> opens a bench here. Saving there is JEKrayPro\u2019s.',
    'The field between the nodes is now the node-centred gradient interpolated within the cell, continuous and exact for a quadratic potential, so a quadrupole’s null is a true null (before, a heavy particle at a null felt a cell’s worth of field stepping in sign). The trap analysis works along the trap’s principal axes, from the Hessian: a quadrupole on the diagonals, or a CAD trap at any angle, reads its true a and q.',
    'A heavy particle at a small energy now moves: the speed was taken from γ, which a nanosphere’s thermal energy (1e-21 of its rest energy) left at exactly 1. A cut that falls outside the array (a file saved on another plane) goes to the analysis point rather than drawing nothing; the 3D view follows every change of the View menu and shows the equipotentials too; labels of electrodes at the same spot stack. The View menu is the one place for what the bench shows, in three submenus, Cut, Potential and Paths (the paths’ colouring moved there from the Bench panel’s Display section, which keeps only the numbers); the potential plots along x, y or z through the analysis point; the Notes section is gone; the end-time histogram waits for three ions.',
  ]],
];
/* the examples: [id, title, blurb, tag] */
export const EXAMPLES = [
  ['einzel-lens', 'Einzel lens', 'Three tubes, the middle one negative: a 2 keV Ar⁺ beam focused to a point. Change the focus voltage and watch the focal length move.', 'Lenses'],
  ['quadrupole-deflector', 'Quadrupole deflector', 'Four rods at ±V in planar symmetry bend a beam through 90°: an electrostatic turn used in ion beam lines.', 'Beam lines'],
  ['linear-tof', 'Linear time-of-flight', 'A two-stage Wiley–McLaren source, a drift tube and a detector: masses separate in time; the start spread sets the resolution.', 'Mass spectrometry'],
  ['reflectron', 'Reflectron', 'A time-of-flight with an ion mirror: ions of the same mass but different energies refocus in time at the detector.', 'Mass spectrometry'],
  ['quad-mass-filter', 'Quadrupole mass filter', 'Four rods with RF and DC: the mass whose (a, q) sits in the stability tip passes, masses 12% away are thrown out.', 'Mass spectrometry'],
  ['paul-trap', 'Paul trap', 'A hyperbolic ring and two endcaps with RF on the ring: an ion held at the centre, its secular motion and micromotion; helium buffer gas cools it.', 'Traps'],
  ['penning-trap', 'Penning trap', 'A cylindrical trap in a 1 T field: the magnetron, modified cyclotron and axial motions of a single ion.', 'Traps'],
];
const NEWS_KEY = 'jek-ion-news-seen';
function newsBody() {
  const box = document.getElementById('newsBody');
  box.replaceChildren(...NEWS.map(([v, d, items]) => h('section', null, h('h3', null, 'Version ' + v, h('small', null, ' · ' + d)), h('ul', null, ...items.map(t => { const li = h('li'); li.innerHTML = t; return li; })))));
}
export function openGallery() {
  const dlg = document.getElementById('galleryDialog'), grid = document.getElementById('galleryGrid');
  const groups = [...new Set(EXAMPLES.map(e => e[3]))];
  grid.replaceChildren(...groups.flatMap(g => [h('h3', null, g), h('div', { class: 'rt-gcards' }, ...EXAMPLES.filter(e => e[3] === g).map(([id, title, blurb]) =>
    h('button', { type: 'button', class: 'ion-gcard', onclick: () => { dlg.close(); openDemo(id, true); } }, h('span', { class: 'ion-gtag' }, g), h('b', null, title), h('small', null, blurb))))]));
  dlg.showModal(); track('help', 'ion-examples');
}
export function wireNews() {
  document.getElementById('appVersion').textContent = APP_VERSION;
  const newsDlg = document.getElementById('newsDialog');
  document.getElementById('btnNews').addEventListener('click', () => { newsBody(); newsDlg.showModal(); try { localStorage.setItem(NEWS_KEY, APP_VERSION); } catch (err) { /* fine */ } document.getElementById('newsDot').hidden = true; document.getElementById('helpDot').hidden = true; });
  document.getElementById('newsClose').addEventListener('click', () => newsDlg.close());
  try { if (!TEST_MODE && localStorage.getItem(NEWS_KEY) !== APP_VERSION) { document.getElementById('newsDot').hidden = false; document.getElementById('helpDot').hidden = false; } } catch (err) { /* fine */ }
  document.getElementById('btnExamples').addEventListener('click', openGallery);
  document.getElementById('galleryClose').addEventListener('click', () => document.getElementById('galleryDialog').close());
  const help = document.getElementById('helpDialog');
  document.getElementById('btnHelp').addEventListener('click', () => help.showModal());
  document.getElementById('helpClose').addEventListener('click', () => help.close());
  // citing
  const cite = document.getElementById('citeDialog');
  document.getElementById('btnCite').addEventListener('click', () => {
    const y = new Date().getFullYear();
    document.getElementById('citeText').value = 'JEK Systems (' + y + '). JEKion ' + APP_VERSION + ': a charged-particle optics simulator in the browser. https://jeksys.net/jek/tools/jekion.html';
    document.getElementById('citeBib').value = '@software{jekion' + y + ',\n  author = {{JEK Systems}},\n  title = {JEKion: a charged-particle optics simulator in the browser},\n  version = {' + APP_VERSION + '},\n  year = {' + y + '},\n  url = {https://jeksys.net/jek/tools/jekion.html}\n}';
    cite.showModal(); track('help', 'ion-cite');
  });
  document.getElementById('citeClose').addEventListener('click', () => cite.close());
  for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).value); toast('Copied'); } catch (err) { toast('Could not copy: select the text and copy it', true); } });
  // a bug
  const bug = document.getElementById('bugDialog');
  const report = () => 'JEKion ' + APP_VERSION + ' · ' + navigator.userAgent + '\nBench: ' + (project ? project.name + ', ' + project.electrodes.length + ' electrodes, ' + project.grid.sym + ' h=' + project.grid.h : '-') + '\n\nWhat happened:\n' + document.getElementById('bugWhat').value + '\n\nExpected:\n' + document.getElementById('bugExpect').value;
  document.getElementById('btnBug').addEventListener('click', () => { bug.showModal(); track('help', 'ion-bug'); });
  document.getElementById('bugClose').addEventListener('click', () => bug.close());
  document.getElementById('bugCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(report()); toast('Copied the report'); } catch (err) { toast('Could not copy', true); } });
  document.getElementById('bugSend').addEventListener('click', () => { location.href = 'mailto:support@jeksys.net?subject=' + encodeURIComponent('JEKion bug report') + '&body=' + encodeURIComponent(report().slice(0, 1800)); bug.close(); });
}
