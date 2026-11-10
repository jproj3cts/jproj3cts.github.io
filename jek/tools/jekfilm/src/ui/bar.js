import { h } from '../../../jekray/src/ui/dom.js';

/* ==========================================================================
   JEKfilm's bar and what every module shows through it: the toast, the status line, the pop-up menus (a button with
   aria-controls and its role="menu" box, as JEKray's and JEKion's), their icons, and the theme (JEKray's, kept as
   'jekray-theme', so the apps and JEKsuite look alike).
   ========================================================================== */
let barToastTimer = null;
export function toast(msg, bad) {
  const t = document.getElementById('filmToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(barToastTimer);
  barToastTimer = setTimeout(() => t.classList.remove('show'), bad ? 5000 : 2600);
}
export function setStatus(text) { const s = document.getElementById('filmStatus'); if (s) s.textContent = text || ''; }

/* the menus' icons, by name (data-icon) */
export const FILM_ICONS = {
  new: 'M4 1.5h5.5L12.5 4.5V14.5H4Z M9.5 1.5V4.5H12.5', open: 'M1.5 4.5V13.5H13L14.5 7.5H4L2.5 13 M1.5 4.5V2.5H6L7.5 4H12.5V7.5',
  save: 'M2.5 2.5H11L13.5 5V13.5H2.5Z M5 2.5V6H10V2.5 M5 13.5V9.5H11V13.5', cloud: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z',
  upload: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z M8 11V7 M6.5 8.5L8 7L9.5 8.5', export: 'M8 1.5V10 M5 7L8 10L11 7 M2.5 11V14H13.5V11',
  undo: 'M5.5 3.5L2.5 6.5L5.5 9.5 M2.5 6.5H10Q13.5 6.5 13.5 10Q13.5 13.5 10 13.5H6', redo: 'M10.5 3.5L13.5 6.5L10.5 9.5 M13.5 6.5H6Q2.5 6.5 2.5 10Q2.5 13.5 6 13.5H10',
  check: 'M3 8.5L6.5 12L13 4', theme: 'M8 1.5A6.5 6.5 0 1 0 8 14.5Z', star: 'M8 1.5L9.9 6.1L14.5 6.5L11 9.6L12.1 14.5L8 12L3.9 14.5L5 9.6L1.5 6.5L6.1 6.1Z',
  user: 'M8 2A3 3 0 1 0 8 8A3 3 0 1 0 8 2 M2.5 14Q2.5 9.5 8 9.5Q13.5 9.5 13.5 14', users: 'M6 2.5A2.5 2.5 0 1 1 5.99 2.5 M1.5 13.5A4.5 4.5 0 0 1 10.5 13.5 M10.5 3A2.5 2.5 0 0 1 11 8 M11.5 9.5A4 4 0 0 1 14.5 13.5',
  card: 'M1.5 3.5H14.5V12.5H1.5Z M1.5 6.5H14.5 M4 10H7', sync: 'M13 6A5.2 5.2 0 0 0 3.4 4.6 M3 2V5H6 M3 10A5.2 5.2 0 0 0 12.6 11.4 M13 14V11H10',
  signin: 'M6 2.5H13.5V13.5H6 M2 8H9.5 M7 5.5L9.5 8L7 10.5', signout: 'M10 2.5H2.5V13.5H10 M14 8H6.5 M11.5 5.5L14 8L11.5 10.5',
  book: 'M2 3H6.5Q8 3 8 4.5V14Q8 12.5 6.5 12.5H2Z M14 3H9.5Q8 3 8 4.5V14Q8 12.5 9.5 12.5H14Z', info: 'M8 1.5A6.5 6.5 0 1 0 8 14.5A6.5 6.5 0 1 0 8 1.5 M8 7V11.5 M8 4.5V5',
  coat: 'M2 4H14 M2 8H14 M2 12H14', link: 'M6.5 9.5L9.5 6.5 M7 11L5.5 12.5A2.1 2.1 0 0 1 2.5 9.5L4.5 7.5A2.1 2.1 0 0 1 7.5 7.5 M9 5L10.5 3.5A2.1 2.1 0 0 1 13.5 6.5L11.5 8.5A2.1 2.1 0 0 1 8.5 8.5',
  fork: 'M4.5 1.5A1.5 1.5 0 1 1 4.49 1.5 M11.5 1.5A1.5 1.5 0 1 1 11.49 1.5 M4.5 11.5A1.5 1.5 0 1 1 4.49 11.5 M4.5 4.5V11.5 M11.5 4.5V6A2 2 0 0 1 9.5 8H6.5A2 2 0 0 0 4.5 10',
};
export function filmIcons(root) {
  for (const n of root.querySelectorAll('[data-icon]')) {
    if (n.querySelector(':scope > svg.ic')) continue;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', FILM_ICONS[n.dataset.icon] || '');
    svg.append(p); n.prepend(svg);
  }
}

/* ---------- the menus: each .rt-more holds a button (aria-controls) and its menu ---------- */
let openBarMenu = null;
export function closeBarMenu() {
  if (!openBarMenu) return;
  const { btn, menu } = openBarMenu; openBarMenu = null;
  menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
}
function barMenuOpen(btn) {
  const menu = document.getElementById(btn.getAttribute('aria-controls'));
  if (!menu) return;
  if (openBarMenu && openBarMenu.btn === btn) { closeBarMenu(); return; }
  closeBarMenu();
  filmIcons(menu);
  menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
  openBarMenu = { btn, menu };
  const first = menu.querySelector('button:not([disabled]), a'); if (first) first.focus();
}
export function wireBar() {
  for (const btn of document.querySelectorAll('.rt-more > button[aria-controls]')) btn.addEventListener('click', e => { e.stopPropagation(); barMenuOpen(btn); });
  // a menu item chosen closes its menu; one standing for a button elsewhere clicks it (data-click)
  document.addEventListener('click', e => {
    const it = e.target.closest('[role="menu"] [role^="menuitem"]');
    if (it && it.dataset.click) { const b = document.getElementById(it.dataset.click); if (b) b.click(); }
    if (openBarMenu && (!openBarMenu.menu.contains(e.target) || it)) closeBarMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openBarMenu) { const b = openBarMenu.btn; closeBarMenu(); b.focus(); } });
  filmIcons(document);
  themeMenuShown();
}

/* ---------- the theme ---------- */
const FILM_THEME_KEY = 'jekray-theme';
export function filmTheme() { try { const v = localStorage.getItem(FILM_THEME_KEY); return v === 'light' || v === 'system' ? v : 'dark'; } catch (err) { return 'dark'; } }
export function filmThemeApply() {
  const v = filmTheme(), dark = v === 'dark' || (v === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.rtTheme = dark ? 'dark' : 'light';
  document.dispatchEvent(new Event('rt-theme'));
}
export function setFilmTheme(v) {
  try { if (v === 'dark') localStorage.removeItem(FILM_THEME_KEY); else localStorage.setItem(FILM_THEME_KEY, v); } catch (err) { /* this visit only */ }
  filmThemeApply(); themeMenuShown();
}
function themeMenuShown() {
  const menu = document.getElementById('themeMenu');
  if (!menu) return;
  const v = filmTheme();
  menu.replaceChildren(...[['system', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) =>
    h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(v === k), 'data-icon': 'check', onclick: () => setFilmTheme(k) }, label)));
  filmIcons(menu);
}
