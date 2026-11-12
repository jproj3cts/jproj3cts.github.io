import { getEl } from '../state/elements.js';
import { VecCtx, pdfDoc } from '../io/pdf.js';
import { dfZip } from '../core/datafiles.js';
import { PART_FINISHES, normPartMake, sdValid } from '../core/part-make.js';
import { coatFilmDoc, drawingRec, lensDrawings } from './lens-drawing.js';
import { filmCoat } from '../io/film-coats.js';
import { filmSpecRecs } from '../../../jekfilm/src/io/film-pages.js';
import { filmTolerance } from '../../../jekfilm/src/core/film-tol.js';
import { filmYield } from '../../../jekfilm/src/core/film-make.js';
import { filmSpec } from '../../../jekfilm/src/core/film.js';
import { downloadFile, safeFileName, toast } from './actions.js';
import { h } from './dom.js';
import { designPro, proMark } from './pro.js';
import { track } from '../io/usage.js';

/* ==========================================================================
   Make the part: what an optics maker needs to quote and make one lens or window of a design, as one zip
     <part> - drawing.pdf                the ISO 10110 drawing (ui/lens-drawing.js), with what it is made to
     <part> - part specification.pdf     the order: quantity, glass, dimensions and tolerances, each face's finish,
                                          form, scratch-dig, chamfer and coating, the documents enclosed
     <part> - S<n> coating - <name>.pdf  each JEKfilm coating on it, as JEKfilm writes its specification (its pages,
                                          jekfilm/src/io/film-pages.js, with its tolerance run and yield)
   The part's make settings (core/part-make.js) are set in the card under the drawing; one not set follows the design's
   tolerance settings, else the commercial grade, and the card says which. A free account's, as the drawings are.
   ========================================================================== */
const PS_W = 595, PS_H = 842, PS_M = 48, PS_INK = '#1a1a1a', PS_SOFT = '#666', PS_RULE = '#cfcfcf';
const pmf = (v, p) => (!isFinite(v) ? '—' : String(+(+v).toFixed(p === undefined ? 3 : p)));
function pstext(g, t, x, y, o) {
  o = o || {};
  g.font = (o.bold ? '600 ' : '') + (o.size || 9) + 'px ' + (o.mono ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif');
  g.fillStyle = o.ink || PS_INK; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
  g.fillText(String(t), x, y);
}
const pswrap = (t, n) => { const out = []; let line = ''; for (const w of String(t).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
const pshead = (pg, t) => { pg.y += 8; pstext(pg.g, t, PS_M, pg.y, { size: 11, bold: true }); pg.y += 16; };
const pspara = (pg, t) => { for (const ln of pswrap(t, 118)) { pstext(pg.g, ln, PS_M, pg.y, { size: 8.5 }); pg.y += 12; } };
function pstable(pg, cols, rows) {
  const g = pg.g; let x = PS_M; const xs = cols.map(c => { const a = x; x += c.w; return a; });
  const cell = (c, i, t, head) => pstext(g, t, c.align === 'right' ? xs[i] + c.w - 4 : xs[i], pg.y, { size: head ? 7.5 : 8.5, ink: head ? PS_SOFT : PS_INK, bold: head, mono: !head && c.mono, align: c.align === 'right' ? 'right' : 'left' });
  cols.forEach((c, i) => cell(c, i, c.label, true));
  pg.y += 4; g.strokeStyle = PS_INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(PS_M, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += 11;
  for (const r of rows) { r.forEach((t, i) => cell(cols[i], i, t, false)); pg.y += 4; g.strokeStyle = PS_RULE; g.lineWidth = 0.35; g.beginPath(); g.moveTo(PS_M, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += 11; }
  pg.y += 4;
}

/* each coated face's coating document: the face's own (coat.film), else a linked cloud coating's fetched, else none
   (a stack put on before faces kept their specification, or one typed in by hand) */
async function faceFilms(D) {
  const e = D.id ? getEl(D.id) : null, out = [];
  if (!e) return out;
  const faces = e.type === 'prism' ? [e.coat, e.coat] : D.make.order.map(i => e.surfaces[i] && e.surfaces[i].coat);
  for (let j = 0; j < faces.length; j++) {
    const c = faces[j];
    if (!c || c.mode !== 'stack') continue;
    let doc = coatFilmDoc(c);
    if (!doc && c.src) { try { doc = coatFilmDoc(await filmCoat(c.src.id)); } catch (err) { /* offline: said in the specification */ } }
    out.push({ surface: D.surfaces[j].n, coat: c, doc });
  }
  return out;
}
/* the coating specification's file name for a face */
const coatFileName = (part, f) => safeFileName(part + ' - S' + f.surface + ' coating - ' + f.doc.name) + '.pdf';

/* the part specification's page: what is ordered, and what it is made to */
export function partSpecRec(D, films, o) {
  o = o || {};
  const g = new VecCtx(PS_W, PS_H, { plain: true }), pg = { g, y: 108 }, M = D.make, date = o.date || new Date().toISOString().slice(0, 10);
  g.fillStyle = '#fff'; g.fillRect(0, 0, PS_W, PS_H);
  pstext(g, 'Part specification', PS_M, 56, { size: 16, bold: true });
  pstext(g, D.name + (o.assembly ? ', in ' + o.assembly : ''), PS_M, 74, { size: 10, ink: PS_SOFT });
  pstext(g, date, PS_W - PS_M, 56, { size: 8.5, ink: PS_SOFT, align: 'right' });
  g.strokeStyle = PS_INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(PS_M, 84); g.lineTo(PS_W - PS_M, 84); g.stroke();
  const glass = D.elements.filter(e => !e.air && !e.stack);
  pshead(pg, 'The part');
  pstable(pg, [{ label: 'Item', w: 150 }, { label: 'Requirement', w: 349 }], [
    ['Part', D.name + ' (' + (D.kind === 'window' ? 'window' : 'lens') + '), to the drawing enclosed'],
    ['Quantity', String(M.qty)],
    ...glass.map((e, q) => [glass.length > 1 ? 'Glass ' + (q + 1) : 'Glass', e.glass + ', nd ' + pmf(e.nd, 5) + (e.ndTol ? ' ± ' + pmf(e.ndTol, 4) : '') + ', Vd ' + pmf(e.vd, 2) + (e.vdTol ? ' ± ' + pmf(e.vdTol, 2) : '')]),
    ['Diameter', 'Ø ' + pmf(D.dia) + ' mm +0/−' + pmf(M.diaTol) + ' mm'],
    ...glass.map((e, q) => [glass.length > 1 ? 'Centre thickness ' + (q + 1) : 'Centre thickness', pmf(e.ct) + ' ± ' + pmf(M.ctTol) + ' mm (edge ' + pmf(e.et) + ' mm, for reference)']),
    ['Centring (4/)', D.surfaces.some(s => s.centring !== undefined) ? D.surfaces.map(s => 'S' + s.n + ' ' + pmf(s.centring, 2) + '′').join(', ') : '—'],
  ]);
  pshead(pg, 'Faces');
  const fname = s => { const f = films.find(x => x.surface === s.n); return f ? (f.doc ? '“' + f.doc.name + '”' : (s.coat || 'stack') + '*') : s.coat || 'None'; };
  pstable(pg, [{ label: 'Face', w: 34 }, { label: 'Radius (mm)', w: 70, align: 'right', mono: true }, { label: 'Clear Ø', w: 52, align: 'right', mono: true }, { label: 'Finish', w: 62 }, { label: 'Form 3/', w: 56, mono: true },
    { label: 'Scratch-dig', w: 58, mono: true }, { label: 'Chamfer', w: 60 }, { label: 'Coating', w: 107 }],
    D.surfaces.map(s => ['S' + s.n, s.R === null ? 'Flat' : (s.R < 0 ? '−' : '') + pmf(Math.abs(s.R)), pmf(s.clear), PART_FINISHES[s.finish] || '—',
      s.finish === 'ground' ? '—' : '3/' + pmf(s.form, 2) + '(' + pmf(s.irr, 2) + ')', s.sd || '—', s.chamfer !== undefined ? '≤ ' + pmf(s.chamfer, 2) + ' × 45°' : '—', fname(s).slice(0, 26)]));
  pshead(pg, 'Coatings');
  const coated = D.surfaces.filter(s => s.coat);
  if (!coated.length) pspara(pg, 'No face is coated.');
  for (const s of coated) {
    const f = films.find(x => x.surface === s.n);
    pspara(pg, 'S' + s.n + ': ' + (f && f.doc ? '“' + f.doc.name + '”, designed in JEKfilm, to its coating specification enclosed (' + coatFileName(D.name, f) + ').'
      : f ? s.coat + ': a thin-film stack with no coating specification kept. *Put the coating on again from JEKfilm to include one.'
        : s.coat + ', the maker’s standard coating of that kind.'));
  }
  pshead(pg, 'Documents and inspection');
  pspara(pg, 'Enclosed: the drawing (' + safeFileName(D.name + ' - drawing') + '.pdf)' + (films.some(f => f.doc) ? ' and the coating specifications listed above' : '') + '. Where this sheet and the drawing differ, ask before making the part.');
  pspara(pg, 'Dimensions in millimetres. Surface form 3/A(B): A fringes of power and B of irregularity at 632.8 nm over the clear aperture. Centring 4/: each surface’s tilt to the part’s axis, in arcminutes. Scratch-dig to MIL-PRF-13830B over the clear aperture. Chamfers protective, at 45°, no wider than given. A fine-ground face has no form or surface quality asked of it.');
  pstext(g, 'Drawn with JEKray (jeksys.net) from the design' + (o.assembly ? ' ' + o.assembly : '') + '.', PS_M, PS_H - 30, { size: 7, ink: PS_SOFT });
  return g;
}

/* the documents for the drawing D, as files [{ name, data }]; o: assembly, date, raw (uncompressed PDFs, for the tests) */
export async function partFiles(D, o) {
  o = o || {};
  const meta = { assembly: o.assembly, sheet: 1, of: 1, date: o.date }, films = await faceFilms(D), files = [];
  const bytes = async b => new Uint8Array(await b.arrayBuffer());
  files.push({ name: safeFileName(D.name + ' - drawing') + '.pdf', data: await bytes(await pdfDoc([drawingRec(D, meta)], D.name + ' drawing', o)) });
  files.push({ name: safeFileName(D.name + ' - part specification') + '.pdf', data: await bytes(await pdfDoc([partSpecRec(D, films, o)], D.name + ' part specification', o)) });
  for (const f of films) {
    if (!f.doc) continue;
    const spec = filmSpec(f.doc), tol = f.doc.layers.length ? filmTolerance(f.doc.layers, spec, f.doc.tol) : null;
    const yld = tol ? filmYield(tol.stacks, f.doc, spec, f.doc.make) : null;
    files.push({ name: coatFileName(D.name, f), data: await bytes(await pdfDoc(filmSpecRecs(f.doc, { date: o.date, tol, yield: yld }), f.doc.name + ' coating specification', o)) });
  }
  return files;
}
/* Make the part: the drawing's documents as one zip, downloaded */
export async function makeThePart(asm, i) {
  if (!designPro('make the part')) return null;
  const all = lensDrawings(asm), D = all[Math.min(i || 0, all.length - 1)];
  if (!D) return null;
  try {
    const files = await partFiles(D, { assembly: asm.name });
    const name = safeFileName(D.name + ' - to make') + '.zip';
    downloadFile(name, new Blob([await dfZip(files)], { type: 'application/zip' }));
    track('export', 'make-part');
    toast('Saved ' + name + ': ' + files.length + ' documents');
    return { name, files: files.map(f => f.name) };
  } catch (err) { toast('Could not make the documents: ' + err.message, true); return null; }
}

/* the card under the drawing: what the part is made to, each value its own or (greyed) from the tolerance settings or
   the commercial grade; and Make the part */
export function makeCard(asm, D, i, state) {
  const e = D.id ? getEl(D.id) : null, M = D.make, n = e ? (e.type === 'lens' ? e.surfaces.length : 2) : 0;
  const card = h('section', { class: 'rt-lmake', 'aria-label': 'Make the part' });
  if (!e || !M) return card;
  const fromTip = { set: 'Set here', tol: 'From the design’s tolerance settings', default: 'The commercial grade: set it to change it' };
  // a change: the part's make settings with this one value set (or cleared, typed empty)
  const setMake = fn => state.edit(() => { const m = JSON.parse(JSON.stringify(e.make || {})); fn(m); e.make = normPartMake(m, n); });
  const num = (v, from, label, set, o) => {
    // a value the tolerance settings give per surface (centring): none shown, the drawing gives each
    const per = o && o.perSurface && from === 'tol';
    const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'rt-lnum' + (from !== 'set' ? ' rt-lfrom' : ''), value: per ? '' : pmf(v, 4), placeholder: per ? 'per surface' : null, 'aria-label': label, title: per ? 'From the tolerance settings: each surface’s tilt plus its decentre over its radius, as the drawing gives it. Type a value to set one for every surface.' : fromTip[from], spellcheck: 'false', style: 'width:' + ((o && o.w) || '4.2rem') });
    inp.addEventListener('change', () => { const t = inp.value.trim(); if (t === '') setMake(m => set(m, undefined)); else if (isFinite(+t)) setMake(m => set(m, +t)); else { toast('A number, please', true); inp.value = per ? '' : pmf(v, 4); } });
    return inp;
  };
  const partRow = (label, input, unit) => h('tr', null, h('th', { scope: 'row' }, label), h('td', null, input), h('td', { class: 'unit' }, unit));
  const part = h('table', { class: 'rt-ltable rt-lmakepart' }, h('tbody', null,
    partRow('Quantity', num(M.qty, M.from.qty, 'Quantity', (m, v) => { m.qty = v; }), ''),
    partRow('Diameter tolerance', num(M.diaTol, M.from.diaTol, 'Diameter tolerance (mm)', (m, v) => { m.diaTol = v; }), 'mm, +0/−'),
    partRow('Centre thickness tolerance', num(M.ctTol, M.from.ctTol, 'Centre thickness tolerance (mm)', (m, v) => { m.ctTol = v; }), '± mm'),
    partRow('Centring 4/', num(M.cent, M.from.cent, 'Centring (arcminutes)', (m, v) => { m.cent = v; }, { perSurface: true, w: '5.2rem' }), '′')));
  const faceSet = (j, k) => (m, v) => { m.faces = m.faces || []; m.faces[M.order[j]] = Object.assign({}, m.faces[M.order[j]], { [k]: v }); };
  const faces = h('table', { class: 'rt-ltable rt-lmakefaces' },
    h('thead', null, h('tr', null, ...['Face', 'Finish', 'Power 3/A', 'Irregularity (B)', 'Scratch-dig', 'Chamfer (mm)', 'Coating'].map(t => h('th', { scope: 'col' }, t)))),
    h('tbody', null, ...D.surfaces.map((s, j) => {
      const f = M.faces[j], fin = h('select', { 'aria-label': 'Finish of S' + s.n, class: f.from.finish !== 'set' ? 'rt-lfrom' : null, title: fromTip[f.from.finish] },
        ...Object.entries(PART_FINISHES).map(([v, t]) => h('option', { value: v, selected: v === f.finish ? '' : null }, t)));
      fin.onchange = () => setMake(m => faceSet(j, 'finish')(m, fin.value));
      const sd = h('input', { type: 'text', class: 'rt-lnum' + (f.from.sd !== 'set' ? ' rt-lfrom' : ''), value: f.sd, 'aria-label': 'Scratch-dig of S' + s.n, title: fromTip[f.from.sd] + '. MIL-PRF-13830B: scratch number, dash, dig number (60-40, 20-10, 10-5)', spellcheck: 'false', style: 'width:4.2rem' });
      sd.addEventListener('change', () => { const t = sd.value.trim(); if (t === '') setMake(m => faceSet(j, 'sd')(m, undefined)); else if (sdValid(t)) setMake(m => faceSet(j, 'sd')(m, t)); else { toast('Scratch-dig as two numbers with a dash: 60-40', true); sd.value = f.sd; } });
      const ground = f.finish === 'ground';
      return h('tr', null, h('td', { class: 'n' }, 'S' + s.n), h('td', null, fin),
        h('td', null, ground ? '—' : num(f.form, f.from.form, 'Power (fringes) of S' + s.n, faceSet(j, 'form'), { w: '3.4rem' })),
        h('td', null, ground ? '—' : num(f.irr, f.from.irr, 'Irregularity (fringes) of S' + s.n, faceSet(j, 'irr'), { w: '3.4rem' })),
        h('td', null, ground ? '—' : sd), h('td', null, num(f.chamfer, f.from.chamfer, 'Chamfer of S' + s.n + ' (mm)', faceSet(j, 'chamfer'), { w: '3.4rem' })),
        h('td', null, s.coat || 'None'));
    })));
  const go = proMark(h('button', { class: 'rt-btn primary', type: 'button', id: 'lensMakePart', title: 'The drawing, the part specification and each JEKfilm coating’s specification, as one zip to send to the maker' }, 'Make the part'), 'make the part');
  go.addEventListener('click', () => { makeThePart(asm, i); });
  card.append(h('h3', null, 'Make the part'),
    h('p', { class: 'rt-lnote' }, 'What ' + D.name + ' is made to. Values in grey follow the tolerance settings or a commercial grade; type one to set it here, or clear it to follow them again. Make the part downloads the drawing, the part specification and each JEKfilm coating’s specification as one zip.'),
    h('div', { class: 'rt-lmakegrid' }, part, h('div', { class: 'rt-ltwrap' }, faces)),
    h('div', { class: 'rt-lbar' }, go));
  return card;
}
