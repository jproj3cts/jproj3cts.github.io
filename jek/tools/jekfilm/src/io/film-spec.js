import { VecCtx, pdfDoc } from '../../../jekray/src/io/pdf.js';
import { designPro } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { COAT_MATERIALS, qwot } from '../../../jekray/src/core/coatings.js';
import { METAL_NAMES, metalNK } from '../../../jekray/src/core/metals.js';
import { FILM_TARGETS, filmSpec, subLabelOf } from '../core/film.js';
import { MAKE_DURABILITY, MAKE_SURFACES, makeLimits } from '../core/film-make.js';
import { film, filmCurves, filmTolResult } from '../ui/designer.js';
import { toast } from '../ui/bar.js';
import { downloadBlob, filmFileName } from './files.js';

/* ==========================================================================
   The coating specification: what an optics maker needs to coat the part, as a PDF of two A4 pages, written by
   JEKray's io/pdf.js. Page 1 is the order: the part and the substrate, the surfaces and the clear aperture, the
   performance it is accepted against (with the design's own value beside each limit), durability, surface quality
   and how it is checked. Page 2 is the design behind it: the layers (material, index, physical and optical thickness),
   the reflectance across the band and against the angle, and the tolerance run when there is one for this design.
   JEKrayPro's, as JEKray's design reports are.
   ========================================================================== */
const SW = 595, SH = 842, SM = 48, INK = '#1a1a1a', SOFT = '#666', RULE = '#cfcfcf';
function stext(g, t, x, y, o) {
  o = o || {};
  g.font = (o.bold ? '600 ' : '') + (o.size || 9) + 'px ' + (o.mono ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif');
  g.fillStyle = o.ink || INK; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
  g.fillText(String(t), x, y);
}
const swrap = (t, n) => { const out = []; let line = ''; for (const w of String(t).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
function spage(meta, title, n) {
  const g = new VecCtx(SW, SH, { plain: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, SW, SH);
  stext(g, title, SM, 56, { size: 16, bold: true });
  stext(g, meta.name, SM, 74, { size: 10, ink: SOFT });
  stext(g, meta.date, SW - SM, 56, { size: 8.5, ink: SOFT, align: 'right' });
  g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(SM, 84); g.lineTo(SW - SM, 84); g.stroke();
  stext(g, 'Designed in JEKfilm (jeksys.net). Theoretical performance from the thin-film model and the indices listed.', SM, SH - 30, { size: 7, ink: SOFT });
  stext(g, 'Page ' + n + ' of 2', SW - SM, SH - 30, { size: 7, ink: SOFT, align: 'right' });
  return { g, y: 108 };
}
const shead = (pg, t) => { pg.y += 8; stext(pg.g, t, SM, pg.y, { size: 11, bold: true }); pg.y += 16; };
const spara = (pg, t) => { for (const ln of swrap(t, 104)) { stext(pg.g, ln, SM, pg.y, { size: 8.5 }); pg.y += 12; } };
/* a table: cols [{ label, w, align, mono }], rows of strings */
function stable(pg, cols, rows) {
  const g = pg.g; let x = SM; const xs = cols.map(c => { const a = x; x += c.w; return a; });
  const cell = (c, i, t, head) => stext(g, t, c.align === 'right' ? xs[i] + c.w - 4 : xs[i], pg.y, { size: head ? 7.5 : 8.5, ink: head ? SOFT : INK, bold: head, mono: !head && c.mono, align: c.align === 'right' ? 'right' : 'left' });
  cols.forEach((c, i) => cell(c, i, c.label, true));
  pg.y += 4; g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(SM, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += 11;
  for (const r of rows) { r.forEach((t, i) => cell(cols[i], i, t, false)); pg.y += 4; g.strokeStyle = RULE; g.lineWidth = 0.35; g.beginPath(); g.moveTo(SM, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += 11; }
  pg.y += 4;
}
/* a plot: series [{ xs, ys, ink, dash }], axes ranges, titles */
function splot(pg, x0, w, h, o) {
  const g = pg.g, y0 = pg.y + 8, L = 34, B = 26, X = v => x0 + L + (w - L - 8) * (v - o.xr[0]) / ((o.xr[1] - o.xr[0]) || 1), Y = v => y0 + h - B - (h - B - 6) * (v - o.yr[0]) / ((o.yr[1] - o.yr[0]) || 1);
  stext(g, o.title, x0, y0 - 14, { size: 8.5, bold: true });
  const ticks = (a, b, n) => { const raw = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / mag, st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9 * st; v += st) out.push(+v.toPrecision(10)); return out; };
  g.lineWidth = 0.3; g.strokeStyle = RULE;
  for (const t of ticks(o.xr[0], o.xr[1], 5)) { g.beginPath(); g.moveTo(X(t), y0 + 6); g.lineTo(X(t), y0 + h - B); g.stroke(); stext(g, String(t), X(t), y0 + h - B + 10, { size: 7, ink: SOFT, align: 'center' }); }
  for (const t of ticks(o.yr[0], o.yr[1], 4)) { g.beginPath(); g.moveTo(x0 + L, Y(t)); g.lineTo(x0 + w - 8, Y(t)); g.stroke(); stext(g, String(t), x0 + L - 4, Y(t) + 2.5, { size: 7, ink: SOFT, align: 'right' }); }
  stext(g, o.xTitle, x0 + L + (w - L - 8) / 2, y0 + h - 4, { size: 7.5, ink: SOFT, align: 'center' });
  stext(g, o.yTitle, x0, y0 - 1, { size: 7.5, ink: SOFT });
  for (const s of o.series) {
    g.strokeStyle = s.ink; g.lineWidth = s.dash ? 0.7 : 1.2; g.setLineDash(s.dash ? [3, 2] : []); g.beginPath();
    s.xs.forEach((xv, i) => { const yv = Math.max(o.yr[0], Math.min(o.yr[1], s.ys[i])); if (i) g.lineTo(X(xv), Y(yv)); else g.moveTo(X(xv), Y(yv)); });
    g.stroke(); g.setLineDash([]);
  }
  let kx = x0 + L;
  for (const s of o.series.filter(q => q.label)) { g.strokeStyle = s.ink; g.lineWidth = 1.2; g.setLineDash(s.dash ? [3, 2] : []); g.beginPath(); g.moveTo(kx, y0 + h + 8); g.lineTo(kx + 12, y0 + h + 8); g.stroke(); g.setLineDash([]); stext(g, s.label, kx + 16, y0 + h + 10.5, { size: 7.5, ink: SOFT }); kx += 22 + s.label.length * 4.2; }
}
/* a layer's material as the maker reads it: MgF2, Ta2O5…, a metal by name, or an index of one's own */
const smat = L => (L.metal ? METAL_NAMES[L.metal] + ' (' + L.metal + ')' : ((COAT_MATERIALS.find(m => Math.abs(+m[0] - L.n) < 1e-9) || [0, 'n = ' + L.n])[1]).replace(/ \([\d.]+\)$/, ''));
const spct = v => (v >= 10 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toExponential(2));
/* the specification's pages, as VecCtx records (the tests read them) */
export function filmSpecRecs(f, o) {
  o = o || {};
  const s = filmSpec(f), M = f.make, date = o.date || new Date().toISOString().slice(0, 10), meta = { name: f.name, date };
  const angles = s.theta > s.theta0 ? s.theta0 + '–' + s.theta + '°' : s.theta0 + '°', pol = { avg: 'mean of s and p', s: 's', p: 'p' }[s.pol];
  // page 1: the order
  const p1 = spage(meta, 'Coating specification', 1);
  shead(p1, 'Part and substrate');
  stable(p1, [{ label: 'Item', w: 170 }, { label: 'Requirement', w: 329 }], [
    ['Part', M.part || f.name], ['Quantity', String(M.qty)],
    ['Substrate', subLabelOf(f.spec.sub) + (s.ns ? ', n = ' + s.ns.toFixed(4) + ' at ' + s.design + ' nm' : '')],
    ['Size', M.size + ' mm diameter'], ['Clear aperture', M.ca + '% of the diameter (' + (M.size * M.ca / 100).toFixed(1) + ' mm)'],
    ['Surfaces coated', MAKE_SURFACES[M.surfaces]], ['Coating', FILM_TARGETS[s.target] + ' (design attached, page 2)']]);
  shead(p1, 'Performance');
  spara(p1, 'Reflectance of one coated surface, incident medium n = ' + s.n0 + ', at ' + angles + ' angle of incidence, ' + pol + ' polarisation. The coating is accepted when each limit below is met over its band.');
  p1.y += 4;
  const rows = makeLimits(f, s, M);
  stable(p1, [{ label: 'Quantity', w: 150 }, { label: 'Band', w: 120 }, { label: 'Limit', w: 90, align: 'right', mono: true }, { label: 'Design gives', w: 90, align: 'right', mono: true }, { label: '', w: 49 }],
    rows.map(r => [r.label + ' (%)', r.where, (r.op === 'le' ? '<= ' : '>= ') + r.value, spct(r.design), r.ok ? 'met' : 'NOT MET']));
  shead(p1, 'Durability and quality');
  stable(p1, [{ label: 'Item', w: 170 }, { label: 'Requirement', w: 329 }], [['Durability', MAKE_DURABILITY[M.durability]], ['Surface quality', M.quality]]);
  shead(p1, 'Verification');
  spara(p1, M.witness ? 'Measure the reflectance of a witness sample from the same run over ' + s.lo + '–' + s.hi + ' nm at ' + (s.theta > s.theta0 ? s.theta0 + '° and ' + s.theta + '°' : s.theta0 + '°') + ', and send the measured curve with the parts. The design curves to compare it with are on page 2.' : 'The maker’s standard checks of the run.');
  // page 2: the design
  const p2 = spage(meta, 'Coating design', 2);
  shead(p2, 'Layers, from the incident medium to the substrate');
  const total = f.layers.reduce((a, L) => a + L.d, 0);
  stable(p2, [{ label: 'Layer', w: 40, align: 'right' }, { label: 'Material', w: 130 }, { label: 'n at ' + s.design + ' nm', w: 90, align: 'right', mono: true }, { label: 'k', w: 60, align: 'right', mono: true }, { label: 'Thickness (nm)', w: 90, align: 'right', mono: true }, { label: 'QWOT', w: 80, align: 'right', mono: true }],
    f.layers.map((L, i) => { const nk = L.metal ? metalNK(L.metal, s.design) : [L.n, 0]; return [String(i + 1), smat(L), nk[0].toFixed(3), nk[1].toFixed(3), L.d.toFixed(2), L.metal ? '-' : (L.d / qwot(L.n, s.design)).toFixed(3)]; }).concat([['', 'Total', '', '', total.toFixed(2), '']]));
  const C = filmCurves(f);
  p2.y += 12;
  const series = [{ label: 'R at ' + s.theta0 + '°', ink: '#0077a8', xs: C.nms, ys: C.R0.map(v => 100 * v) }];
  if (C.Rt) series.push({ label: 'R at ' + s.theta + '°', ink: '#d9531e', xs: C.nms, ys: C.Rt.map(v => 100 * v) });
  for (const r of rows) series.push({ label: r === rows[0] ? 'limits' : '', ink: '#888', dash: true, xs: [s.lo, s.hi], ys: [r.value, r.value] });
  const top = Math.min(100, Math.max(0.5, 1.15 * Math.max(...series.flatMap(q => q.ys))));
  splot(p2, SM, 240, 190, { title: 'Reflectance against wavelength', xTitle: 'wavelength (nm)', yTitle: 'R (%)', xr: [s.lo, s.hi], yr: [s.target === 'hr' ? Math.max(0, Math.floor(Math.min(...C.R0) * 100 - 1)) : 0, top], series });
  splot(p2, SM + 259, 240, 190, { title: 'Reflectance against angle at ' + s.design + ' nm', xTitle: 'angle of incidence (deg)', yTitle: 'R (%)', xr: [0, 89], yr: [0, 100],
    series: [{ label: 'Rs', ink: '#0077a8', xs: C.A.degs, ys: C.A.s.map(v => 100 * v) }, { label: 'Rp', ink: '#d9531e', xs: C.A.degs, ys: C.A.p.map(v => 100 * v) }] });
  p2.y += 222;
  const T = o.tol === undefined ? filmTolResult() : o.tol;
  if (T) {
    shead(p2, 'Tolerance');
    spara(p2, 'Each layer’s thickness off by a normal error of σ = ' + T.tol.sigma + (T.tol.kind === 'rel' ? '% of the layer' : ' nm') + ', over ' + T.tol.runs + ' runs, at ' + s.theta0 + '°:');
    p2.y += 4;
    stable(p2, [{ label: '', w: 120 }, { label: 'Nominal', w: 110, align: 'right', mono: true }, { label: 'Median', w: 110, align: 'right', mono: true }, { label: '90th percentile', w: 110, align: 'right', mono: true }],
      [['R mean (%)', T.mean], ['R max (%)', T.worst]].map(([k, v]) => [k, spct(100 * v.nominal), spct(100 * v.median), spct(100 * v.p90)]));
  }
  return [p1.g, p2.g];
}
export const filmSpecPdf = (f, o) => pdfDoc(filmSpecRecs(f, o), f.name + ' coating specification', o);
/* Make it › Coating specification (PDF): JEKrayPro's */
export async function saveFilmSpec() {
  if (!designPro('make a coating specification')) return false;
  try {
    const name = filmFileName(film.name + ' coating specification', 'pdf');
    downloadBlob(name, await filmSpecPdf(film));
    toast('Saved ' + name); track('report', 'film-spec');
    return true;
  } catch (err) { toast('Could not write the PDF: ' + err.message, true); return false; }
}
