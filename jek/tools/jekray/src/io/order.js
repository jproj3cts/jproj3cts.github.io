import { C_NM_GHZ, PRINTER, RF_MAT, mountVolume, mountedDia, printedMatch } from '../core/rf.js';
import { grinDesign } from '../core/grin.js';
import { benchNms } from '../state/elements.js';
import { paraxial } from '../engines/trace.js';
import { lensThickness, lensVolume } from '../ui/readouts.js';
import { shareBase, shareData, shareHash } from './share.js';
import { toast } from '../ui/actions.js';
import { h } from '../ui/panel.js';

/* ---------- A custom RF lens, asked for by quote ----------
   An RF lens in one of the made-to-order plastics, or a graded-index lens, that can be made:
   its figures and a link that reopens its design go into the site's quote cart (the same one
   the product pages fill), from which the customer emails sales. The link holds the lens and
   the horns and receivers on its tab, nothing else of the bench; a graded-index lens travels
   as its design, its plate rebuilt from it on opening. */
const CART = 'JEK_QUOTE_CART';
const mm = v => (+v).toFixed(v < 10 ? 2 : 1).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1') + ' mm';
const ghzOf = el => el.grin ? el.grin.ghz : (() => { const nm = benchNms().find(v => v > 1e5); return nm ? +(C_NM_GHZ / nm).toPrecision(4) : null; })();

/* its mounting, as the order gives it */
const mountLine = (dia, m) => m ? 'Mounting: flange ' + mm(m.width) + ' wide, ' + mm(m.thick) + ' thick' + (m.holes ? ', ' + m.holes + ' holes of ' + mm(m.hole) + ' on a ' + mm(dia + m.width) + ' circle' : ', no holes') : null;
/* what the order says of it, or null when it is not a lens that can be ordered */
export function orderSpec(el) {
  if (!el || !el.mmw) return null;
  if (el.type === 'mask' && el.grin) {
    const g = el.grin, D = grinDesign(g, el.length);
    if (!D.usable || mountedDia(el.length, el.mount) > PRINTER.maxDia || D.tTot > PRINTER.maxHeight) return null;
    return {
      name: 'Graded-index RF lens, ' + D.M.name + ', ' + mm(el.length) + ' across, f ' + mm(g.f) + ', ' + g.ghz + ' GHz',
      spec: ['Design frequency: ' + g.ghz + ' GHz', 'Diameter: ' + mm(el.length), 'Focal length: ' + mm(g.f) + ', ' + (g.profile === 'parabolic' ? 'parabolic' : 'ideal-lens') + ' profile',
        'Material: ' + D.M.name, 'Thickness: ' + mm(D.tTot), 'Density: ' + D.fillHi.toFixed(0) + '% at the centre to ' + D.fillLo.toFixed(0) + '% at the edge',
        D.match ? 'Faces: quarter-wave matching layers at ' + g.ghz + ' GHz, ' + mm(D.tm) + ' each' : null, mountLine(el.length, el.mount),
        'Weight: about ' + Math.round(D.grams + mountVolume(el.length, el.mount) / 1000 * (D.M.density || 1.2)) + ' g'].filter(Boolean),
    };
  }
  if (el.type === 'lens') {
    const mats = el.materials.filter(m => m.glass !== 'AIR'), M = mats.length && RF_MAT[mats[0].glass];
    if (!M || !M.print || mats.some(m => m.glass !== mats[0].glass)) return null;
    const geo = lensThickness(el);
    if (mountedDia(el.diameter, el.mount) > PRINTER.maxDia || geo.thickest > PRINTER.maxHeight || geo.thinnest < PRINTER.minWall) return null;
    const skins = el.surfaces.map(s => printedMatch(M, s.coat));
    if (skins.some(k => k && !k.ok)) return null;
    const ghz = ghzOf(el), nm = ghz ? C_NM_GHZ / ghz : null, p = nm ? paraxial(el, nm) : null;
    const R = el.surfaces.map(s => s.R === null || !isFinite(s.R) ? 'flat' : mm(Math.abs(s.R)) + (s.R > 0 ? ' convex' : ' concave'));
    const R2 = el.surfaces.length === 2 ? (el.surfaces[1].R === null || !isFinite(el.surfaces[1].R) ? 'flat' : mm(Math.abs(el.surfaces[1].R)) + (el.surfaces[1].R < 0 ? ' convex' : ' concave')) : null;
    const grams = (lensVolume(el) + mountVolume(el.diameter, el.mount)) / 1000 * (M.density || 1.2);
    return {
      name: 'RF lens, ' + M.name + ', ' + mm(el.diameter) + ' across' + (p && isFinite(p.efl) ? ', f ' + mm(p.efl) : '') + (ghz ? ', ' + ghz + ' GHz' : ''),
      spec: [ghz ? 'Design frequency: ' + ghz + ' GHz' : null, 'Diameter: ' + mm(el.diameter), p && isFinite(p.efl) ? 'Focal length: ' + mm(p.efl) : null,
        'Material: ' + M.name, 'Centre thickness: ' + mm(geo.centre),
        'Faces: ' + (R2 ? R[0] + ', ' + R2 : R.join(', ')),
        skins.some(Boolean) ? 'Matched: ' + skins.map((k, i) => k ? 'face ' + (i + 1) + ' (quarter wave at ' + (+k.ghz.toPrecision(4)) + ' GHz)' : null).filter(Boolean).join(', ') : null,
        mountLine(el.diameter, el.mount),
        'Weight: about ' + Math.round(grams) + ' g'].filter(Boolean),
    };
  }
  return null;
}
/* the link that reopens it: the lens and the horns and receivers on its tab */
export async function orderLink(el) {
  const d = shareData(), tab = el.bench;
  d.elements = d.elements.filter(e => e.id === el.id || (e.mmw && !e.mmw.part && (e.type === 'source' || e.type === 'detector') && (!tab || !e.bench || e.bench === tab)));
  for (const e of d.elements) if (e.grin) { delete e.amp; delete e.delay; delete e.preset; }
  delete d.notes; delete d.ui; d.name = el.name;
  if (d.benches && d.benches.length > 1) d.benches = d.benches.filter(b => b.id === tab);
  return shareBase() + '#p=' + await shareHash(d);
}
const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0; return x.toString(36).toUpperCase().padStart(6, '0').slice(-6); };
/* into the quote cart: a new line for a new design, more of one already there */
export async function requestQuote(el, qty) {
  const S = orderSpec(el);
  if (!S) { toast('This lens cannot be made as it is: see its panel.', true); return false; }
  const url = await orderLink(el), part = 'RFL-' + hash(S.spec.join('|')), n = Math.max(1, Math.round(+qty || 1));
  let items = [];
  try { items = JSON.parse(localStorage.getItem(CART) || '[]'); if (!Array.isArray(items)) items = []; } catch (err) { items = []; }
  const had = items.find(it => it && it.part === part);
  if (had) { had.qty += n; had.url = url; }
  else items.push({ part, name: S.name, price: null, currency: '', note: '', url, qty: n, spec: S.spec });
  try { localStorage.setItem(CART, JSON.stringify(items)); }
  catch (err) { toast('Your browser is blocking site storage, so the quote cart cannot be saved.', true); return false; }
  toast('Added to your quote cart: open Cart on the JEK Systems site to send the request.');
  return part;
}

/* the panel's row: how many, and the orange button, for a lens that can be made */
export function orderRow(el) {
  if (!orderSpec(el)) return null;
  const qty = h('input', { type: 'number', min: '1', step: '1', value: '1', 'aria-label': 'How many', class: 'rt-order-qty' });
  const btn = h('button', { type: 'button', class: 'rt-btn rt-order', onclick: async () => {
    btn.disabled = true;
    try { if (await requestQuote(el, qty.value)) { btn.textContent = 'Added to your quote'; setTimeout(() => { btn.textContent = 'Request a quote for this lens'; }, 2400); } }
    finally { btn.disabled = false; }
  } }, 'Request a quote for this lens');
  return h('div', { class: 'rt-orderrow' }, h('label', null, 'How many ', qty), btn,
    h('p', { class: 'note' }, 'Made to order to this design. The request goes into your quote cart with its figures and a link to the design; send it from Cart on the JEK Systems site and we reply with a price. ',
      h('a', { href: '/jek/made-to-order-terms.html', target: '_blank', rel: 'noopener' }, 'Made-to-Order Terms'), ' apply.'));
}
