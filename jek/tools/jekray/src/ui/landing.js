import { EMBED, TEST_MODE } from '../core/constants.js';
import { fromIgTag, srcTag } from '../core/src-tag.js';
import { h, phoneSheet } from './panel.js';
import { fitView } from './actions.js';
import { openDemo } from './tours.js';
import { remindForm } from './news.js';
import { themeDark } from './render.js';
import { REELS } from './reels.js';
import { openProjectData } from '../io/open.js';
import { account, accountLoaded, accountOffer } from '../io/account.js';
import { goal } from '../io/usage.js';

/* ---------- From Instagram ----------
   A visit that came from one of our Instagram posts (a tag starting "ig" on its link, or Instagram as the referrer)
   is shown the benches from the latest reels (ui/reels.js), each a click away, in place of the welcome note. Not to
   someone signed in; once closed, not again in this browser until a newer reel is listed. Counted against the post
   as it shows and as a bench is opened from it ('goal' landing, landing-open). */
const LANDING_KEY = 'jek-ig-landing';       // the newest reel's id when the note was closed
export const fromInstagram = () => !TEST_MODE && !EMBED && fromIgTag(srcTag(location.search, document.referrer));
function landingClosed() { try { return localStorage.getItem(LANDING_KEY) === REELS[0].id; } catch (err) { return false; } }
// read before the address is tidied (io/usage.js takes the tag off it)
export const landingDue = () => fromInstagram() && REELS.length > 0 && !landingClosed();
export function hideLanding(keep) {
  const n = document.getElementById('igLanding');
  if (n) n.remove();
  if (keep) try { localStorage.setItem(LANDING_KEY, REELS[0].id); } catch (err) { /* shown again next time: fine */ }
}
async function openReel(r) {
  goal('landing-open');
  hideLanding(false);
  if (r.demo) { await openDemo(r.demo, true); return; }
  const data = JSON.parse(JSON.stringify(r.bench));
  openProjectData(data, data.name || r.title);
  if (!data.keepView) fitView();
}
/* opened: the example the post's own link opened (#demo=), marked as on the bench */
export async function showLanding(opened) {
  await accountLoaded;
  if (account || ['igLanding', 'welcome', 'coach'].some(id => document.getElementById(id)) || document.querySelector('dialog[open]')) return;
  const dark = themeDark();
  const reel = r => h('li', null, h('button', { class: 'rt-reel' + (r.demo && r.demo === opened ? ' on' : ''), type: 'button', onclick: () => openReel(r) },
    r.demo ? h('img', { src: 'demos/thumbs/' + (dark ? '' : 'light/') + r.demo + '.webp', alt: '', loading: 'lazy', width: 96, height: 60 }) : h('i', { 'aria-hidden': 'true' }),
    h('span', null, h('b', null, r.title), h('small', null, r.demo && r.demo === opened ? 'On the bench now' : r.line))));
  const list = h('ul', { class: 'rt-reels', tabindex: '0', 'aria-label': 'Benches from our reels, newest first' }, ...REELS.map(reel));
  document.getElementById('stage').append(h('div', { class: 'rt-welcome rt-landing', id: 'igLanding', role: 'note' },
    h('button', { class: 'rt-wx', type: 'button', title: 'Close', 'aria-label': 'Close this note', onclick: () => hideLanding(true) }, '\u00d7'),
    h('h3', null, 'From Instagram'),
    h('p', null, 'The benches from our latest reels. Open one and change it yourself: free, in the browser, nothing to install.'),
    phoneSheet() ? remindForm() : null,
    list,
    accountOffer('landing'),
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => { hideLanding(false); window.openGallery(); } }, 'All examples'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => hideLanding(true) }, 'Close'))));
  reelsFit(list);
  goal('landing');
}
/* the three newest reels in view, the rest a scroll away: the list as tall as its first three rows and the top of the fourth */
export const REELS_SHOWN = 3;
function reelsFit(list) {
  const fit = () => {
    if (!list.isConnected) { removeEventListener('resize', fit); return; }
    const rows = list.children;
    if (rows.length <= REELS_SHOWN) { list.style.maxHeight = ''; return; }
    list.style.maxHeight = '';
    list.style.maxHeight = (rows[REELS_SHOWN - 1].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top + 18) + 'px';   // and a glimpse of the next
    list.classList.add('more');
    end();
  };
  // faded at its foot while there are more below
  const end = () => list.classList.toggle('end', list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
  list.addEventListener('scroll', end, { passive: true });
  fit();
  addEventListener('resize', fit);
}
