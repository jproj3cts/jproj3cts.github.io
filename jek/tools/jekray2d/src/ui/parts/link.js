import { V, project } from '../../state/project.js';
import { benchName, linkPairs, linkPartner } from '../../state/tabs.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { hitPlate } from './hits.js';
import { bindSync, h, panel, param, textField } from '../panel.js';
import { makeLinkPartner } from '../panels.js';
import { selectEl } from '../tabs.js';

/* Link plane on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/link.js */

/* A link plane: a dashed line, with where it leads */
function drawLink(el, sel) {
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, P = linkPartner(el);
  const col = P ? '#7fdcff' : 'rgba(127,220,255,0.45)';
  pathLocal(f, [[0, -L], [0, L]]);
  ctx.setLineDash([6, 4]); ctx.strokeStyle = sel ? selInk() : col; ctx.lineWidth = sel ? 3 : 2.2; ctx.stroke(); ctx.setLineDash([]);
  // end caps
  ctx.beginPath();
  for (const y of [-L, L]) { const [ax, ay] = toWorld(f, -4 * k, y), [bx, by] = toWorld(f, 4 * k, y); ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
}

function linkPanel(el) {
  panel.append(h('h3', null, 'Link'));
  panel.append(h('div', { class: 'rt-rows' },
    textField('Pair name', () => el.pair, v => { el.pair = v.trim().slice(0, 60) || el.pair; }, { wide: true }),
    param('Length (mm)', el, 'length')));
  const st = h('p', { class: 'note', style: 'margin-top:0.5rem' });
  const acts = h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' });
  panel.append(st, acts);
  let sig = null;
  bindSync(st, () => {
    const P = linkPartner(el), L = linkPairs().get(el.pair) || [];
    st.textContent = P ? 'Linked to ' + P.name + ' on ' + benchName(P.bench) + '. The two are one plane seen from two benches: light reaching either leaves the other at the same place along it, going the same way across it, beam and field unchanged.'
      : L.indexOf(el) > 1 ? 'More than two link planes are named \u201c' + el.pair + '\u201d; only the first two are linked, so light stops here.'
      : 'No partner yet, so light stops here. Give a link plane on another tab the same pair name, or make one below.';
    const s2 = (P ? P.id : '') + '|' + project.benches.map(b => b.id + b.name).join();
    if (s2 === sig) return;
    sig = s2;
    acts.replaceChildren();
    if (P) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => selectEl(P) }, 'Go to ' + P.name + ' on ' + benchName(P.bench)));
    else {
      for (const b of project.benches) if (b.id !== el.bench)
        acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => makeLinkPartner(el, b.id) }, 'Make its partner on ' + b.name));
      acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => makeLinkPartner(el, null) }, 'Make its partner on a new tab'));
    }
  });
}

export const LINK_UI = {
  draw: drawLink, hit: hitPlate, panel: linkPanel, rank: 1,
};
