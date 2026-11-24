import { NEWS } from './news-data.js';
import { EMBED } from '../core/constants.js';
import { exerciseInvite } from './challenge.js';
import { project } from '../state/project.js';
import { phoneSheet } from './panel.js';
import { h } from './dom.js';
import { saveFile, toast, typingIn } from './actions.js';
import { shareBase, shareHash } from '../io/share.js';
import { openProjectData } from '../io/open.js';
import { EXPERIMENTAL, exp, expOn, expPicked, expWhy, setExperimental } from './experimental.js';
import { hooks } from '../core/hooks.js';
import { readSnaps } from '../io/autosave.js';
import { openDemo, startTour } from './tours.js';
import { API_BASE } from '../io/account.js';
import { accountOffer } from '../io/nudges.js';
import { goal } from '../io/usage.js';
import { themeDark } from './render.js';

/* ---------- Version, what's new, citing ---------- */
export const APP_VERSION = '1.1', APP_DATE = '12 October 2026';
/* What's new: each version's number, its date, its latest changes, the few that matter most (shown first, from 1.1) and
   how many changes it has in all. Written by build.mjs into ./news-data.js from the whole list, ../../news.mjs, which
   is where an entry is added; all of them are on the docs' Release notes page */
const CITE_URL = 'https://jeksys.net/jek/tools/jekray.html';
/* A bug report by email: what happened, what was expected, the version and browser, and
   (if wanted) a link that opens the bench as it is. An email link carries a few thousand
   characters at most; a bench too big for that is asked for as a file instead. */
const BUG_TO = 'support@jeksys.net', BUG_MAILTO_MAX = 1900;

/* The examples, by group: file name in demos/, title, and one line on what it shows. The
   gallery shows each with a picture from demos/thumbs/ (demos/thumbs/light/ in the Light theme). */
export const EXAMPLES = [
  ['Interference and cavities', false, [
    ['michelson', 'Michelson interferometer', 'Move a mirror and watch the fringes at the output port walk.'],
    ['mach-zehnder', 'Mach–Zehnder interferometer', 'Two arms, two outputs: the power swaps between them with the path difference.'],
    ['fabry-perot', 'Fabry–Perot cavity', 'Free spectral range, finesse, linewidth and the cavity’s Gaussian mode.'],
    ['fox-li', 'Fox–Li: a cavity finds its mode', 'Light bounced round a cavity settles into its lowest-loss mode.'],
    ['pdh-lock', 'Pound–Drever–Hall lock', 'Sidebands, a cavity and a photodiode give the classic PDH error signal.'],
    ['laser-threshold', 'Laser cavity with gain', 'A Nd:YAG gain sheet in a cavity: threshold, output power and the mode.']]],
  ['Diffraction and imaging', false, [
    ['youngs-double-slit', 'Young’s double slit', 'Two slits, one screen, and the fringe spacing you expect.'],
    ['poissons-spot', 'Poisson’s spot', 'The bright spot in the shadow of an opaque disc.'],
    ['plano-convex', 'Plano-convex lens, both ways round', 'Why the curved side should face the collimated beam.'],
    ['lens-aberrations', 'Aberrations of a singlet across the field', 'Seidel and Zernike terms, spot diagrams, field curvature and distortion.'],
    ['tight-focus', 'A tight focus, vector', 'A high-NA focus where polarisation shapes the spot.'],
    ['maltese-cross', 'Maltese cross', 'A steep focus seen through a polariser.'],
    ['off-axis-parabola', 'Off-axis parabola', 'A 90° off-axis mirror focuses with no spherical aberration.'],
    ['bessel-beam', 'Axicon: a Bessel beam', 'A cone lens makes a long, narrow line focus.'],
    ['vortex-beams', 'Vortex beams: mode converter and SLM', 'Light with orbital angular momentum, made two ways.'],
    ['optical-differentiator', 'Optical differentiator', 'A 4f system with a ramp in its Fourier plane takes the derivative of the light.'],
    ['optical-integrator', 'Optical integrator', 'The same 4f system with a 1/x mask integrates it instead.']]],
  ['Polarisation and spectra', false, [
    ['wollaston-polarimeter', 'Wollaston polarimeter', 'A half-wave plate and a calcite Wollaston split s from p.'],
    ['optical-isolator', 'Optical isolator', 'A Faraday rotator stops light getting back into the laser.'],
    ['grating-spectrometer', 'Grating spectrometer', 'Mercury lines spread out by a transmission grating.'],
    ['czerny-turner', 'Czerny–Turner spectrometer', 'A slit, two concave mirrors and a grating, beside the Spectrometer part.'],
    ['dispersing-prism', 'Dispersing prism', 'White light split into colours by an N-SF11 prism.'],
    ['dichroic-combiner', 'Dichroic combiner, two tables', 'Two lasers combined, carried between tabs by link planes.']]],
  ['Fibre', false, [
    ['fibre-heterodyne', 'Fibre heterodyne (AOM beat note)', 'An AOM shifts one arm; the photodiode sees the beat.'],
    ['split-laser', 'Two fibre launches from one laser', 'One laser, split and launched into two fibres, recombined in free space.'],
    ['fibre-michelson', 'Fibre Michelson, Faraday mirrors', 'An all-fibre interferometer that cancels polarisation drift.'],
    ['fibre-amplifier', 'Fibre amplifier and its noise', '20 km of fibre, an erbium amplifier, and the noise it adds.']]],
  ['Atoms and traps', false, [
    ['saturated-absorption', 'Saturated absorption, rubidium', 'Doppler-free hyperfine lines from a pump and probe.'],
    ['polarisation-spectroscopy', 'Polarisation spectroscopy', 'A circular pump makes the vapour birefringent: a dispersive lock signal.'],
    ['davll-lock', 'DAVLL: a lock from a magnetic field', 'Zeeman-split absorption gives a wide error signal.'],
    ['faraday-filter', 'Faraday filter', 'A hot cell in a field between crossed polarisers passes a narrow band.'],
    ['dipole-trap', 'Optical dipole trap, rubidium', 'A focused 1064 nm beam: trap depth, frequencies and scattering.'],
    ['optical-lattice', 'Two-dimensional optical lattice', 'Four beams make a grid of traps.'],
    ['optical-tweezers', 'Optical tweezers in water', 'A bead held by an NA 1.2 objective: stiffness and forces.'],
    ['levitated-nanoparticle', 'Levitated nanoparticle in air', 'A 150 nm silica sphere held in vacuum by a tight focus.'],
    ['scattering-sphere', 'Light scattered by a 300 nm sphere', 'A silica sphere in a tight 1550 nm focus: the light it scatters collected ahead and at 90°, and a split detector that reads its place.']]],
  ['Pulses', false, [
    ['pulse-compressor', 'Grating pulse compressor', 'A grating pair takes a chirped pulse back to its transform limit.'],
    ['fibre-solitons', 'Self-phase modulation and a soliton', 'The same pulse broadens in one fibre and holds its shape in another.']]],
  ['Nonlinear optics', false, [
    ['frequency-doubling', 'Frequency doubling: PPLN and PPKTP', '1560 nm to 780 nm and 1064 nm to 532 nm in poled crystals.'],
    ['fibre-solitons', 'Self-phase modulation and a soliton', 'Spectral broadening from the Kerr effect in fibre.']]],
  ['Electronics', false, [
    ['lockin-absorption', 'Lock-in absorption measurement', 'A sample’s transmission from two lock-ins, the light square-wave modulated at 1 kHz.']]],
  ['Modules', false, [
    ['mod-vortex', 'A module: vortex through a metalens', 'A part pack with code: a spiral phase plate and a metalens written as a module.', 'mods']]],
  ['RF and millimetre waves', false, [
    ['rf-10ghz-pla-lens', 'PLA lens, 10 GHz', 'A horn\u2019s beam collimated by a PLA lens: its loss, its edge taper, and whether it can be made.'],
    ['rf-24ghz-grin-lens', 'Graded-index lens, 24 GHz', 'A flat disc whose density falls from its centre to its edge focuses a horn\u2019s beam: its design and what it comes to.'],
    ['rf-24ghz-abs-lens', 'ABS lens, 24 GHz radar', 'A radar horn behind an ABS lens: the band where plastic RF lenses of this size work best.'],
    ['rf-24ghz-lens-antenna', 'Lens antenna, 24 GHz (RF designer)', 'A worked example: a PLA lens designed for its horn, its gain over the band, its tolerances and its quote.'],
    ['rf-150ghz-telescope', 'Gaussian beam telescope, 150 GHz (RF designer)', 'A worked example: two hyperbolic lenses image a feed horn onto a receiver; what each loss takes across the band.'],
    ['mm-wave-link', 'Millimetre-wave link, 150 GHz', 'Two feed horns and two HDPE lenses: the power a horn takes in, in dBm.'],
    ['mm-wave-mesh-filter', 'Mesh filter, swept', 'A band-pass mesh in a Gaussian beam telescope: the receiver\u2019s S21 against frequency, and its link budget.'],
    ['mm-wave-grid-diplexer', 'Wire-grid diplexer, 150 GHz', 'A wire grid at 45\u00b0 sends the field along its wires one way and passes the other: what it reflects and leaks, from its pitch and wires.'],
    ['mm-wave-heterodyne', 'Heterodyne link, 150 GHz', 'A 1 GHz tone up on a 150 GHz carrier, across two lenses and down through a mixer to a spectrum analyser.']]],
  ['Photonic circuits', false, [
    ['ring-filter', 'Ring filter on a chip', 'A ring between two waveguides drops one line of a laser tuned across it.', 'pic']]],
  ['From a paper', false, [
    ['levitated-trap', 'Levitated nanorod trap (Hu et al. 2023)', 'The standing-wave trap from a Nature Communications paper.']]],
];
/* Examples whose model is still in beta, where their whole group is not: they have no check of
   their own on the validation page yet (polarisation spectroscopy, a lattice), or fail one
   (a levitated sphere's gas damping, against Gieseler et al.'s measurements) */
const BETA_EXAMPLES = new Set(['polarisation-spectroscopy', 'optical-lattice', 'levitated-nanoparticle']);
/* on a phone: the link emailed, to open on a computer later. The address goes to the API, which sends one fixed
   email and keeps no copy of it (jek-api src/remind.js) */
export function remindForm() {
  const input = h('input', { type: 'email', id: 'remindAddr', autocomplete: 'email', placeholder: 'you@example.com', spellcheck: 'false', 'aria-label': 'Your email address' });
  const btn = h('button', { class: 'rt-btn primary', type: 'submit' }, 'Send');
  const say = h('p', { class: 'rt-wsay', hidden: '', role: 'status' });
  const form = h('form', { class: 'rt-remind' }, h('label', { for: 'remindAddr' }, 'Email me a link for my computer'), h('div', null, input, btn), say);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { say.textContent = 'That does not look like an email address.'; say.hidden = false; input.focus(); return; }
    btn.disabled = true; say.hidden = true;
    try {
      const res = await fetch(API_BASE + '/v1/remind', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body && body.error && body.error.message || 'It could not be sent just now.');
      goal('remind');
      form.replaceChildren(h('p', { class: 'rt-wsay', role: 'status' }, 'Sent: open it on your computer. We keep no copy of your address.'));
    } catch (err) { say.textContent = err.message; say.hidden = false; btn.disabled = false; }
  });
  return form;
}
/* the first visit: what to do first, and where the examples are */
export function hideWelcome() {
  const w = document.getElementById('welcome');
  if (w) w.remove();
  try { localStorage.setItem('jek-raytracer-welcomed', '1'); } catch (err) { /* shown again next time: fine */ }
}
export function showWelcome() {
  try { if (localStorage.getItem('jek-raytracer-welcomed')) return; } catch (err) { return; }
  const pick = h('button', { class: 'rt-btn', type: 'button', onclick: () => openGallery() }, 'Browse examples');
  // on a touch screen, the touch ways; a phone is told the designers and plots want a desktop
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, phone = phoneSheet();
  document.getElementById('stage').append(h('div', { class: 'rt-welcome', id: 'welcome', role: 'note' },
    h('button', { class: 'rt-wx', type: 'button', title: 'Close', 'aria-label': 'Close the welcome note', onclick: hideWelcome }, '\u00d7'),
    h('h3', null, 'Welcome to JEKray'),
    phone ? h('p', { class: 'rt-wdesk' }, 'JEKray is best used on a desktop or laptop: the bench works here, but the designers, plots and shortcuts need a larger screen and a mouse.') : null,
    phone ? remindForm() : null,
    touch ? h('ul', null,
      h('li', null, 'Tap + to add parts, or drag one from the rail at the bench\u2019s left.'),
      h('li', null, 'Drag a part to move it; drag the blue handle to turn it. Drag the empty bench with one finger to pan, pinch to zoom.'),
      h('li', null, 'Tap a part for its settings and readings: they open at the bottom, \u2191 makes them taller. Tap the empty bench to close them.'))
    : h('ul', null,
      h('li', null, 'Add parts with Add, the first button of the parts rail across the top of the bench (or press A), or from the rail\u2019s own buttons; its switcher changes the palette: free space, fibre, circuits, RF or drawing.'),
      h('li', null, 'Drag to move, scroll to zoom, right-drag (or middle-drag, or Space-drag) to pan.'),
      h('li', null, 'Click anything for its settings and readings; right-click for more. The arrow tab on the bench\u2019s left edge brings out the bench\u2019s own settings.'),
      h('li', null, 'Ctrl+K finds any command, part or example by name; ? lists every shortcut.')),
    exerciseInvite(),
    accountOffer('welcome'),
    h('div', { class: 'rt-actions' }, pick, h('button', { class: 'rt-btn', type: 'button', onclick: () => startTour('focus') }, 'Take the tour'),
      h('button', { class: 'rt-btn primary', type: 'button', onclick: hideWelcome }, 'Got it'))));
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireNews() {
  {
    document.getElementById('appVersion').textContent = APP_VERSION;
    const dlg = document.getElementById('newsDialog'), dot = document.getElementById('newsDot');
    // the Help button carries the What's new dot, its menu being shut
    new MutationObserver(() => { document.getElementById('helpDot').hidden = dot.hidden; }).observe(dot, { attributes: true, attributeFilter: ['hidden'] });
    const NEWS_KEY = 'jek-raytracer-news';
    try {
      const seen = localStorage.getItem(NEWS_KEY);
      // someone new has nothing to catch up on; someone back since an older version does
      if (!seen && !localStorage.getItem('jek-raytracer-welcomed')) localStorage.setItem(NEWS_KEY, APP_VERSION);
      else if (seen !== APP_VERSION && !EMBED) dot.hidden = false;
    } catch (err) { /* no store: no dot */ }
    document.getElementById('btnNews').addEventListener('click', () => {
      const body = document.getElementById('newsBody');
      const list = items => { const ul = h('ul'); for (const t of items) { const li = h('li'); li.innerHTML = t; ul.append(li); } return ul; };
      body.replaceChildren(...NEWS.flatMap(([v, date, items, top, total]) => {
        const head = h('h3', null, /^\d/.test(v) ? 'Version ' + v : v, h('span', null, date));
        // the version's highlights first, its every change folded beneath them
        // (a version with more changes than the page carries: its latest here, all of them on the docs' Release notes page)
        const more = total > items.length ? [h('p', { class: 'note' }, h('a', { href: '/jek/docs/jekray/release-notes/', target: '_blank', rel: 'noopener' }, 'All ' + total + ' changes in ' + v + ', on the release notes page'))] : [];
        if (top) return [head, list(top), h('details', { class: 'rt-news-all' }, h('summary', null, (more.length ? 'The latest ' + items.length + ' of ' + total : 'All ' + items.length) + ' changes in ' + v), list(items), ...more)];
        return [head, list(items), ...more];
      }));
      dot.hidden = true;
      try { localStorage.setItem(NEWS_KEY, APP_VERSION); } catch (err) { /* shown again: fine */ }
      dlg.showModal();
    });
    document.getElementById('newsClose').addEventListener('click', () => dlg.close());
  }

  {
    const dlg = document.getElementById('citeDialog');
    document.getElementById('btnCite').addEventListener('click', () => {
      const d = new Date(), iso = d.toISOString().slice(0, 10), year = APP_DATE.slice(-4);
      document.getElementById('citeText').value = 'JEK Systems (' + year + '). JEKray optical bench simulator, version ' + APP_VERSION + '. ' + CITE_URL + ' (accessed ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' }) + ' ' + d.getFullYear() + ').';
      document.getElementById('citeBib').value = '@software{jekray,\n  author  = {{JEK Systems}},\n  title   = {{JEKray}: optical bench simulator},\n  version = {' + APP_VERSION + '},\n  year    = {' + year + '},\n  url     = {' + CITE_URL + '},\n  urldate = {' + iso + '}\n}';
      dlg.showModal();
    });
    dlg.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]');
      if (!b) return;
      const ta = document.getElementById(b.dataset.copy);
      ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => toast('Copied'), () => { document.execCommand('copy'); toast('Copied'); });
    });
    document.getElementById('citeClose').addEventListener('click', () => dlg.close());
  }

  {
    const btn = document.getElementById('btnExp'), menu = document.getElementById('expMenu');
    const account = () => !(hooks.proWhy && /^Sign in/.test(hooks.proWhy() || ''));
    const fill = () => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = expOn;
      const n = () => EXPERIMENTAL.filter(f => expPicked(f.key)).length;
      cb.addEventListener('change', () => { setExperimental(cb.checked); fill(); menu.querySelector('input').focus(); toast(expOn ? 'Experimental features on: ' + n() + ' of ' + EXPERIMENTAL.length + ' ticked' : 'Experimental features off'); });
      // each feature its own tick, kept whether the master switch is on or off; it acts only while it is on
      const row = f => {
        const t = h('input', { type: 'checkbox', 'data-exp': f.key });
        t.checked = expPicked(f.key);
        t.addEventListener('change', () => { setExperimental(null, { [f.key]: t.checked }); if (expOn) toast(f.name + (t.checked ? ' on' : ' off')); });
        return h('li', null, h('label', { class: 'rt-exppick' }, t, h('span', null, h('b', null, f.name), ': ', f.what)));
      };
      // for any signed-in account: signed out, the switch is shown but held off, with the way to sign in
      const why = expWhy();
      cb.disabled = !!why;
      menu.replaceChildren(h('label', { class: why ? 'rt-off' : null, title: why || null }, cb, 'Turn on experimental features'),
        why ? h('p', { class: 'rt-exppro' }, h('b', null, 'For signed-in accounts. '), 'Sign in, top right: a free account is enough, and JEKrayPro has them too. ', h('button', { type: 'button', class: 'rt-link', onclick: () => { show(false); if (hooks.proFix) hooks.proFix('', 'exp'); } }, 'Sign in…')) : null,
        h('p', null, 'Features still being built and checked, before they reach beta. They may change, or give wrong answers: nothing made with them is validated yet. Tick the ones you want; the switch above turns them all on or off together. The settings are kept in this browser.'),
        EXPERIMENTAL.length ? h('ul', { class: expOn ? null : 'off' }, ...EXPERIMENTAL.map(row))
          : h('p', { style: 'margin:0' }, 'There are none at the moment.'));
    };
    const show = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) { fill(); menu.querySelector('input').focus(); } };
    btn.addEventListener('click', e => { e.stopPropagation(); show(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) show(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
    document.getElementById('expDot').hidden = !(expOn && !expWhy());
  }

  {
    const dlg = document.getElementById('bugDialog'), note = document.getElementById('bugNote');
    const what = document.getElementById('bugWhat'), expect = document.getElementById('bugExpect'), withBench = document.getElementById('bugBench');
    const report = async () => {
      const lines = ['What happened:', what.value.trim() || '(not given)', '', 'What I expected:', expect.value.trim() || '(not given)', '', '---',
        'JEKray ' + APP_VERSION + ' (' + APP_DATE + ')', 'Browser: ' + navigator.userAgent,
        'Bench: ' + (project.name || 'Untitled') + ', ' + project.elements.length + ' parts on ' + project.benches.length + ' tab' + (project.benches.length === 1 ? '' : 's')];
      let link = null;
      if (withBench.checked) { try { link = shareBase() + '#p=' + await shareHash(); } catch (err) { link = null; } }
      return { lines, link };
    };
    const mailto = (subject, body) => 'mailto:' + BUG_TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.getElementById('btnBug').addEventListener('click', () => { note.textContent = ''; dlg.showModal(); what.focus(); });
    document.getElementById('bugClose').addEventListener('click', () => dlg.close());
    document.getElementById('bugSend').addEventListener('click', async () => {
      const { lines, link } = await report(), subject = 'JEKray bug: ' + (what.value.trim().split('\n')[0].slice(0, 60) || project.name || 'report');
      let url = mailto(subject, lines.concat(link ? ['', 'Link to the bench: ' + link] : []).join('\n'));
      if (link && url.length > BUG_MAILTO_MAX) {
        // too big to travel in the email link: without it, and ask for the file
        url = mailto(subject, lines.concat(['', 'The bench is attached as a .jekray file.']).join('\n'));
        note.replaceChildren('This bench is too big to travel in an email link. Please attach it to the email: ',
          h('button', { class: 'rt-link', type: 'button', onclick: () => saveFile() }, 'save it as a .jekray file'), ', then add that file to the email.');
      }
      window.location.href = url;
      if (!note.textContent) note.textContent = 'Your email app should open with the report. If nothing happens, use Copy the report and send it to ' + BUG_TO + '.';
    });
    document.getElementById('bugCopy').addEventListener('click', async () => {
      const { lines, link } = await report(), text = 'To: ' + BUG_TO + '\n\n' + lines.concat(link ? ['', 'Link to the bench: ' + link] : []).join('\n');
      try { await navigator.clipboard.writeText(text); toast('Copied: paste it into an email to ' + BUG_TO); }
      catch (err) { toast('Could not copy here; please email ' + BUG_TO, true); }
    });
  }

  {
    const dlg = document.getElementById('snapsDialog'), box = document.getElementById('snapsList');
    const when = t => {
      const d = new Date(t), today = new Date().toDateString() === d.toDateString();
      const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return today ? 'Today ' + hm : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hm;
    };
    const fill = () => {
      const list = readSnaps();
      box.replaceChildren(...(list.length ? list.map((S, i) => h('div', null,
        h('span', { class: 'when' }, when(S.t)),
        h('span', { class: 'what', title: S.name }, S.name || 'Untitled bench', ' ', h('small', null, S.n + ' part' + (S.n === 1 ? '' : 's') + ' · ' + S.why)),
        h('button', { class: 'rt-btn', type: 'button', onclick: () => {
          try { dlg.close(); openProjectData(JSON.parse(S.json), 'the version from ' + when(S.t).replace('Today ', '')); }
          catch (err) { toast('Could not open that version (' + err.message + ').', true); }
        } }, 'Open'))) : [h('p', null, 'Nothing kept yet. Copies appear here once you have been working for a few minutes.')]));
    };
    document.getElementById('btnSnaps').addEventListener('click', () => { fill(); dlg.showModal(); });
    document.getElementById('snapsClose').addEventListener('click', () => dlg.close());
  }

  {
    const dlg = document.getElementById('galleryDialog'), grid = document.getElementById('galleryGrid');
    const search = document.getElementById('gallerySearch');
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      grid.replaceChildren();
      for (const [group, beta, list] of EXAMPLES) {
        const hits = list.filter(([id, t, d, x]) => (!x || exp(x)) && (!q || (group + ' ' + t + ' ' + d).toLowerCase().includes(q)));
        if (!hits.length) continue;
        grid.append(h('h3', null, group, beta ? h('span', { class: 'rt-beta' }, 'Beta') : null),
          h('div', { class: 'rt-gcards' }, ...hits.map(([id, t, d, x]) => h('button', { class: 'rt-card', type: 'button', 'data-demo': id },
            h('img', { src: 'demos/thumbs/' + (themeDark() ? '' : 'light/') + id + '.webp', alt: '', loading: 'lazy', width: 320, height: 200 }), h('b', null, t, x ? h('span', { class: 'rt-exp' }, 'Experimental') : !beta && BETA_EXAMPLES.has(id) ? h('span', { class: 'rt-beta' }, 'Beta') : null), h('span', null, d)))));
      }
      if (!grid.children.length) grid.append(h('p', { class: 'rt-gempty' }, 'No example matches “' + search.value.trim() + '”.'));
    };
    window.openGallery = () => { hideWelcome(); search.value = ''; fill(); dlg.showModal(); grid.scrollTop = 0; search.focus(); };
    search.addEventListener('input', fill);
    document.getElementById('btnExamples').addEventListener('click', () => openGallery());
    document.getElementById('galleryClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }                      // a click on the backdrop
      const b = e.target.closest('[data-demo]');
      if (b) { dlg.close(); openDemo(b.dataset.demo, true); }
    });
  }

  {
    const dlg = document.getElementById('helpDialog');
    document.getElementById('btnHelp').addEventListener('click', () => { hideWelcome(); dlg.showModal(); });
    document.getElementById('helpClose').addEventListener('click', () => dlg.close());
    document.addEventListener('keydown', e => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || typingIn(e.target) || document.querySelector('dialog[open]')) return;
      e.preventDefault(); hideWelcome(); dlg.showModal();
    });
  }

}
