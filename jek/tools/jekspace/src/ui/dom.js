import { h } from '../../../jekray/src/ui/dom.js';
/* ==========================================================================
   JEKsuite's page helpers: elements, icons, the note at the foot, the pop-up menus, the theme, and the apps it
   opens (each in a tab of its own, named, so a second bench opens in the same tab rather than a new one each time).
   ========================================================================== */

/* the apps, as the hub lists and opens them: their page, their tab's name, what they are */
export const APPS = [
  { id: 'jekray', name: 'JEKray', url: '/jek/tools/jekray.html', tab: 'jekray', about: '/jek/products/design-software/jekray/',
    line: 'Optics, fibre, electronics and RF on one bench: rays, Gaussian beams and the diffracted field, in 2D and 3D; lens, RF and coating design.' },
  { id: 'jekion', name: 'JEKion', url: '/jek/tools/jekion.html', tab: 'jekion', about: '/jek/products/design-software/jekion/',
    line: 'Charged-particle optics: electrodes, ion traps, lenses and time of flight, solved and flown live.' },
];
export const appOf = id => APPS.find(a => a.id === id) || APPS[0];
/* an app opened at a hash (#cloud=<id>, #new…), in its own tab */
export function openApp(id, hash) {
  const a = appOf(id), w = window.open(a.url + (hash ? '#' + hash : ''), a.tab);
  if (w) w.focus();
  return w;
}

/* a short line of help, its fuller explanation folded behind an ⓘ */
export function helpLine(short, long, cls) {
  const more = h('span', { class: 'rt-helpmore', hidden: '' }, ' ', ...(Array.isArray(long) ? long : [long]));
  const btn = h('button', { type: 'button', class: 'rt-helpbtn', 'aria-expanded': 'false', 'aria-label': 'More about this', title: 'More about this',
    onclick: () => { const open = more.hidden; more.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } }, 'ⓘ');
  return h('p', { class: cls || 'rt-lsub' }, short, ' ', btn, more);
}
let toastTimer = null;
export function toast(msg, bad) {
  const t = document.getElementById('homeToast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), bad ? 5000 : 2500);
}

/* the icons (JEKray's menu icons, those used here) */
export const SPACE_ICONS = {
  folder: 'M1.5 3.5H6L7.5 5H14.5V13H1.5Z', recent: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M8 4.5V8L10.5 9.5',
  fork: 'M4.5 1.5A1.5 1.5 0 1 1 4.49 1.5 M11.5 1.5A1.5 1.5 0 1 1 11.49 1.5 M4.5 11.5A1.5 1.5 0 1 1 4.49 11.5 M4.5 4.5V11.5 M11.5 4.5V6A2 2 0 0 1 9.5 8H6.5A2 2 0 0 0 4.5 10',
  copy: 'M5 2.5H3.5V14.5H12.5V2.5H11 M5.5 1.5H10.5V3.5H5.5Z', list: 'M5.5 4H14 M5.5 8H14 M5.5 12H14 M2 4H2.5 M2 8H2.5 M2 12H2.5',
  grid: 'M2 2H7V7H2Z M9 2H14V7H9Z M2 9H7V14H2Z M9 9H14V14H9Z', trash: 'M2.5 4H13.5 M6 4V2.5H10V4 M3.5 4L4.5 14H11.5L12.5 4 M6.5 6.5V11.5 M9.5 6.5V11.5',
  bench: 'M1.5 3.5H14.5V12.5H1.5Z M4 6H4.1 M8 6H8.1 M12 6H12.1 M4 10H4.1 M8 10H8.1 M12 10H12.1', open: 'M1.5 4.5V13.5H13L14.5 7.5H4L2.5 13 M1.5 4.5V2.5H6L7.5 4H12.5V7.5',
  history: 'M8 2.5A5.5 5.5 0 1 1 2.6 7 M2.5 3V7H6.5 M8 5V8.5L10.5 10', rename: 'M10.5 2.5L13.5 5.5L5.5 13.5H2.5V10.5Z M9 4L12 7',
  move: 'M1.5 3.5H6L7.5 5H14.5V13H1.5Z M6 9H10.5 M8.5 7L10.5 9L8.5 11', restore: 'M3 8A5 5 0 1 0 4.5 4.4 M3 2V5H6',
  star: 'M8 1.5L9.9 5.6L14.3 6L11 9L12 13.5L8 11.2L4 13.5L5 9L1.7 6L6.1 5.6Z', link: 'M6.5 9.5L9.5 6.5 M7 4.5L8.5 3A2.5 2.5 0 0 1 13 6.5L11.5 8 M9 11.5L7.5 13A2.5 2.5 0 0 1 3 9.5L4.5 8',
  apps: 'M2.5 2.5H6.5V6.5H2.5Z M9.5 2.5H13.5V6.5H9.5Z M2.5 9.5H6.5V13.5H2.5Z M9.5 9.5H13.5V13.5H9.5Z', new: 'M4 1.5h5.5L12.5 4.5V14.5H4Z M9.5 1.5V4.5H12.5',
  user: 'M8 2A3 3 0 1 1 7.99 2 M2.5 14.5A5.5 5 0 0 1 13.5 14.5', users: 'M6 2.5A2.5 2.5 0 1 1 5.99 2.5 M1.5 13.5A4.5 4.5 0 0 1 10.5 13.5 M10.5 3A2.5 2.5 0 0 1 11 8 M11.5 9.5A4 4 0 0 1 14.5 13.5',
  signin: 'M9.5 2.5H13.5V13.5H9.5 M2 8H10 M7 5L10 8L7 11', signout: 'M6.5 2.5H2.5V13.5H6.5 M6 8H14 M11 5L14 8L11 11',
  card: 'M1.5 3.5H14.5V12.5H1.5Z M1.5 6.5H14.5 M4 10H7', sync: 'M13 6A5.2 5.2 0 0 0 3.4 4.6 M3 2V5H6 M3 10A5.2 5.2 0 0 0 12.6 11.4 M13 14V11H10',
  home: 'M2 7.5L8 2.5L14 7.5 M3.5 6.5V13.5H12.5V6.5 M6.5 13.5V9.5H9.5V13.5', check: 'M3 8.5L6.5 12L13 4.5',
  theme: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M8 1.5V14.5 M8 4H12.5 M8 7H14 M8 10H13.5', cloud: 'M4.5 12.5H12A2.75 2.75 0 0 0 12.2 7A4 4 0 0 0 4.4 6.6A3 3 0 0 0 4.5 12.5Z',
  lens: 'M8 1.5Q11 8 8 14.5Q5 8 8 1.5Z M1 8H15', rf: 'M3 13L8 3L13 13 M5 9H11', coat: 'M2 4H14 M2 8H14 M2 12H14', ion: 'M8 1.5A6.5 6.5 0 1 1 7.99 1.5 M5 8H11 M8 5V11',
};
export function iconNode(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', SPACE_ICONS[name] || ''); svg.append(p);
  return svg;
}
/* the icons a menu's items name (data-icon), in front of each */
export function menuIcons(root) {
  for (const n of root.querySelectorAll('[data-icon]')) if (!n.querySelector(':scope > svg.ic')) n.prepend(iconNode(n.dataset.icon));
}

/* ---------- pop-up menus: [label, icon, fn, cls] items, 'sep', or an element ---------- */
let popMenu = null;
export function closeMenu() {
  if (!popMenu) return;
  const { el, btn } = popMenu; popMenu = null;
  el.remove(); btn.setAttribute('aria-expanded', 'false');
}
export const menuOpenFor = () => popMenu;
export function openMenu(btn, items, cls) {
  if (popMenu && popMenu.btn === btn) { closeMenu(); return; }
  closeMenu();
  const el = h('div', { class: 'rt-hmenu' + (cls ? ' ' + cls : ''), role: 'menu' }, ...items.filter(Boolean).map(it => it === 'sep' ? h('div', { class: 'sep' }) : it instanceof Node ? it
    : h('button', { type: 'button', role: 'menuitem', class: it[3] || null, onclick: () => { closeMenu(); it[2](); } }, iconNode(it[1]), it[0])));
  document.getElementById('home').append(el);
  const r = btn.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 4 + hh > innerHeight - 8 ? Math.max(8, r.top - 4 - hh) : r.bottom + 4) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  popMenu = { el, btn };
  const first = el.querySelector('button, select, a'); if (first) first.focus();
}

/* ---------- the theme: JEKray's (kept as 'jekray-theme', so the hub and the apps look alike) ---------- */
const SPACE_THEME_KEY = 'jekray-theme';
export function spaceTheme() { try { const v = localStorage.getItem(SPACE_THEME_KEY); return v === 'light' || v === 'system' ? v : 'dark'; } catch (err) { return 'dark'; } }
export function themeApply() {
  const v = spaceTheme(), dark = v === 'dark' || (v === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.rtTheme = dark ? 'dark' : 'light';
}
export function setSpaceTheme(v) {
  try { if (v === 'dark') localStorage.removeItem(SPACE_THEME_KEY); else localStorage.setItem(SPACE_THEME_KEY, v); } catch (err) { /* this visit only */ }
  themeApply();
}
