import { partnerSection, linkPartnerFields } from '../panels.js';
import { V } from '../../state/project.js';
import { benchName, linkPairs, linkPartner } from '../../state/tabs.js';
import { frame, toWorld } from '../../core/mask.js';
import { ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { hitPlate } from './hits.js';
import { panel, param, textField } from '../panel.js';
import { h } from '../dom.js';

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
  partnerSection(el, () => linkPartner(el), P => {
    const L = linkPairs().get(el.pair) || [];
    return P ? 'Linked to ' + P.name + ' on ' + benchName(P.bench) + '. The two are one plane seen from two benches: light reaching either leaves the other at the same place along it, going the same way across it, beam and field unchanged.'
      : L.indexOf(el) > 1 ? 'More than two link planes are named \u201c' + el.pair + '\u201d; only the first two are linked, so light stops here.'
      : 'No partner yet, so light stops here. Give a link plane on another tab the same pair name, or make one below.';
  }, () => linkPartnerFields(el));
}

export const LINK_UI = {
  draw: drawLink, hit: hitPlate, panel: linkPanel, rank: 1,
};
