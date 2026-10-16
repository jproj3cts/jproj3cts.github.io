import { matLabel } from '../core/glass.js';
import { deg, project } from '../state/project.js';
import { getEl } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { cfgSolved, designFigures, designOf, designPrescription, mcOf, mcValue, posOf, primaryNm, surfaceParts } from '../engines/lens-design.js';
import { anaSystems, fieldCurves, mtfAnalysis, spotDiagram } from '../engines/lens-analysis.js';
import { VecCtx, pdfDoc } from '../io/layout.js';
import { downloadFile, safeFileName, toast } from './actions.js';
import { WAVE_COLOURS } from './lens-analyses.js';
import { drawSheet, lensDrawings } from './lens-drawing.js';
import { layoutData } from './lens-workspace.js';
import { tolResultsFor } from './lens-tolerance.js';

/* ==========================================================================
   The design report: the design as a PDF to hand on
   A4 pages, portrait: the summary (its conditions, first-order figures, layout and spot sizes), its
   prescription with its solves and variables and its Seidel sums, its analyses (spot diagrams, field
   curvature and distortion, MTF), its tolerances (the settings, and the last Sensitivity and Monte
   Carlo runs if they were made on the design as it is), then each lens's drawing, landscape.
   Every page is drawn with the canvas's own calls into a VecCtx, so all of it stays vector.
   ========================================================================== */
const RP_W = 595, RP_H = 842, RP_M = 48;
const RP_INK = '#1b1f24', RP_SOFT = '#5b6570', RP_RULE = '#c8ced4';
const rf = (v, p) => v === null || v === undefined || !isFinite(v) ? '—' : String(+(+v).toPrecision(p || 6));
const colourOf = i => WAVE_COLOURS[i % WAVE_COLOURS.length];

function rpText(g, t, x, y, o) {
  o = o || {};
  g.font = (o.bold ? '600 ' : '') + (o.size || 9) + 'px ' + (o.mono ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif');
  g.fillStyle = o.ink || RP_INK; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
  g.fillText(String(t), x, y);
}
const rpWrap = (t, n) => { const out = []; let line = ''; for (const w of String(t).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };

/* a page: its header and footer, and a cursor down it */
function rpPage(meta, title) {
  const g = new VecCtx(RP_W, RP_H, { plain: true });
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, RP_W, RP_H);
  rpText(g, meta.name + ' · lens design report', RP_M, 30, { size: 8, ink: RP_SOFT });
  rpText(g, meta.date, RP_W - RP_M, 30, { size: 8, ink: RP_SOFT, align: 'right' });
  g.strokeStyle = RP_RULE; g.lineWidth = 0.5; g.beginPath(); g.moveTo(RP_M, 36); g.lineTo(RP_W - RP_M, 36); g.stroke();
  const pg = { g, y: 66, title };
  if (title) { rpText(g, title, RP_M, pg.y, { size: 16, bold: true }); pg.y += 26; }
  meta.pages.push(pg);
  return pg;
}
function rpHead(pg, t) { pg.y += 6; rpText(pg.g, t, RP_M, pg.y, { size: 11, bold: true }); pg.y += 16; }
function rpPara(pg, t, o) { for (const ln of rpWrap(t, (o && o.wrap) || 100)) { rpText(pg.g, ln, RP_M, pg.y, { size: 8.5, ink: (o && o.ink) || RP_INK }); pg.y += 12; } }
/* a table: cols [{ label, w, mono, align }], rows of strings */
function rpTable(pg, cols, rows, o) {
  o = o || {};
  const g = pg.g, size = o.size || 8, lh = size + 5;
  let x = RP_M;
  const xs = cols.map(c => { const a = x; x += c.w; return a; });
  const cell = (c, i, t, y, head) => rpText(g, t, c.align === 'right' ? xs[i] + c.w - 4 : xs[i] + (c.pad || 0), y, { size: head ? size - 0.5 : size, ink: head ? RP_SOFT : RP_INK, bold: head, mono: !head && c.mono, align: c.align === 'right' ? 'right' : 'left' });
  cols.forEach((c, i) => cell(c, i, c.label, pg.y, true));
  pg.y += 4; g.strokeStyle = RP_INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(RP_M, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += lh - 2;
  for (const r of rows) {
    r.forEach((t, i) => cell(cols[i], i, t, pg.y, false));
    pg.y += 4; g.strokeStyle = RP_RULE; g.lineWidth = 0.35; g.beginPath(); g.moveTo(RP_M, pg.y); g.lineTo(x, pg.y); g.stroke(); pg.y += lh - 2;
  }
  pg.y += 6;
}
/* a plot in the box: axes with ticks, the series ({ xs, ys, colour, dash }), labels */
const rpStep = span => { const p = Math.pow(10, Math.floor(Math.log10(span / 4))); for (const m of [1, 2, 2.5, 5, 10]) if (span / (m * p) <= 6) return m * p; return 10 * p; };
function rpPlot(g, x, y, w, h, o) {
  const [x0, x1] = o.xr, [y0, y1] = o.yr, X = v => x + (v - x0) / (x1 - x0) * w, Y = v => y + h - (v - y0) / (y1 - y0) * h;
  g.strokeStyle = RP_RULE; g.lineWidth = 0.35;
  const sx = rpStep(x1 - x0), sy = rpStep(y1 - y0);
  for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9 * sx; v += sx) { g.beginPath(); g.moveTo(X(v), y); g.lineTo(X(v), y + h); g.stroke(); rpText(g, rf(Math.abs(v) < 1e-6 * sx ? 0 : v, 4), X(v), y + h + 10, { size: 6.5, ink: RP_SOFT, align: 'center' }); }
  for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9 * sy; v += sy) { g.beginPath(); g.moveTo(x, Y(v)); g.lineTo(x + w, Y(v)); g.stroke(); rpText(g, rf(Math.abs(v) < 1e-6 * sy ? 0 : v, 4), x - 3, Y(v) + 2.5, { size: 6.5, ink: RP_SOFT, align: 'right' }); }
  if (y0 < 0 && y1 > 0) { g.strokeStyle = RP_SOFT; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x, Y(0)); g.lineTo(x + w, Y(0)); g.stroke(); }
  if (x0 < 0 && x1 > 0) { g.strokeStyle = RP_SOFT; g.lineWidth = 0.5; g.beginPath(); g.moveTo(X(0), y); g.lineTo(X(0), y + h); g.stroke(); }
  g.strokeStyle = RP_INK; g.lineWidth = 0.6; g.strokeRect(x, y, w, h);
  for (const s of o.series) {
    g.strokeStyle = s.colour; g.lineWidth = 1.2; g.setLineDash(s.dash ? [4, 2.5] : []);
    g.beginPath(); let on = false;
    s.xs.forEach((v, i) => { const u = s.ys[i]; if (u === null || !isFinite(u)) { on = false; return; } const px = X(v), py = Y(Math.max(y0, Math.min(y1, u))); if (on) g.lineTo(px, py); else g.moveTo(px, py); on = true; });
    g.stroke(); g.setLineDash([]);
  }
  if (o.title) rpText(g, o.title, x, y - 6, { size: 8, bold: true });
  if (o.xName) rpText(g, o.xName, x + w / 2, y + h + 21, { size: 7, ink: RP_SOFT, align: 'center' });
  if (o.yName) { g.save(); g.translate(x - 26, y + h / 2); g.rotate(-Math.PI / 2); rpText(g, o.yName, 0, 0, { size: 7, ink: RP_SOFT, align: 'center' }); g.restore(); }
}
const rpRange = (vals, pad) => { const v = vals.filter(isFinite); let a = Math.min(...v), b = Math.max(...v); if (!v.length) return [0, 1]; if (b - a < 1e-12) { a -= 1; b += 1; } const p = (b - a) * (pad || 0.05); return [a - p, b + p]; };
function rpKey(g, x, y, items) {
  for (const [t, c, dash] of items) {
    g.strokeStyle = c; g.lineWidth = 1.4; g.setLineDash(dash ? [4, 2.5] : []); g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 16, y - 3); g.stroke(); g.setLineDash([]);
    rpText(g, t, x + 20, y, { size: 7, ink: RP_SOFT }); x += 28 + t.length * 3.8;
  }
}

/* the layout, on white: the same picture the workspace draws */
function rpLayout(g, asm, P, F, x, y, w, h) {
  const L = layoutData(asm, P, F), z0 = -L.lead;
  const rays = L.rays.map(r => { const p = r.pts.slice(), [ya, za] = p[0], [yb, zb] = p[1], t = (z0 - za) / (zb - za); p[0] = [ya + t * (yb - ya), z0]; return Object.assign({}, r, { pts: p }); });
  let hi = 1;
  for (const pr of L.lenses) for (const [yy] of pr) hi = Math.max(hi, 0.5 * Math.abs(yy));
  for (const r of rays) if (r.lost < 0) { const [yy, zz] = r.pts[r.pts.length - 1]; hi = Math.max(hi, 1.08 * Math.abs((yy - L.image.p[0]) * L.image.e[0] + (zz - L.image.p[1]) * L.image.e[1])); }
  const img = [[L.image.p[0] + L.image.e[0] * hi, L.image.p[1] + L.image.e[1] * hi], [L.image.p[0] - L.image.e[0] * hi, L.image.p[1] - L.image.e[1] * hi]];
  let ya = Infinity, yb = -Infinity, za = Infinity, zb = -Infinity;
  const take = ([yy, zz]) => { if (!isFinite(yy) || !isFinite(zz)) return; ya = Math.min(ya, yy); yb = Math.max(yb, yy); za = Math.min(za, zz); zb = Math.max(zb, zz); };
  L.lenses.forEach(pr => pr.forEach(take)); L.mirrors.forEach(m => { m.face.forEach(take); m.back.forEach(take); }); L.stops.forEach(s => s.forEach(seg => seg.forEach(take))); img.forEach(take); L.axis.forEach(take); if (L.object) L.object.forEach(take);
  for (const r of rays) r.pts.forEach(take);
  const k = Math.min(w / (zb - za), h / (yb - ya)) * 0.96, X = zz => x + w / 2 + (zz - (za + zb) / 2) * k, Y = yy => y + h / 2 - (yy - (ya + yb) / 2) * k;
  const path = pts => { g.beginPath(); pts.forEach(([yy, zz], q) => q ? g.lineTo(X(zz), Y(yy)) : g.moveTo(X(zz), Y(yy))); };
  g.strokeStyle = RP_RULE; g.lineWidth = 0.5; g.setLineDash([4, 3]); path(L.axis); g.stroke(); g.setLineDash([]);
  g.lineWidth = 0.6;
  for (const r of rays) { g.strokeStyle = colourOf(r.field); path(r.pts); g.stroke(); }
  for (const pr of L.lenses) { path(pr); g.closePath(); g.fillStyle = 'rgba(120,170,190,0.25)'; g.fill(); g.strokeStyle = RP_INK; g.lineWidth = 0.8; g.stroke(); }
  for (const m of L.mirrors) { path(m.face.concat(m.back.slice().reverse())); g.closePath(); g.fillStyle = 'rgba(90,100,110,0.35)'; g.fill(); path(m.face); g.strokeStyle = RP_INK; g.lineWidth = 1.2; g.stroke(); }
  g.strokeStyle = RP_INK; g.lineWidth = 1.8; for (const s of L.stops) for (const seg of s) { path(seg); g.stroke(); }
  g.lineWidth = 1.2; path(img); g.stroke();
  if (L.object) { g.strokeStyle = '#b8860b'; g.lineWidth = 1.6; path(L.object); g.stroke(); }
  g.strokeStyle = RP_RULE; g.lineWidth = 0.5; g.strokeRect(x, y, w, h);
}

/* the pages of the report, as records */
export function reportRecs(asm) {
  const P = designPrescription(asm), F = designFigures(asm, P), c = asm.cond, D = designOf(asm), A = anaSystems(asm, P);
  const meta = { name: asm.name, date: new Date().toISOString().slice(0, 10), pages: [] };
  const sps = surfaceParts(P), moved = P.surfaces.some(s => s.mirror || s.tilt || s.dec), fin = !!F.object, FU = fin ? ' mm' : '°';
  const nameOf = i => { const sp = sps[i], e = getEl(sp.id), nm = e ? e.name : '?'; return sp.kind === 'stop' ? nm + ' (stop)' : sp.n === 1 ? nm : sp.n === 2 ? nm + (sp.j ? ', back' : ', front') : nm + ', ' + (sp.j + 1); };

  // ---- 1: summary ----
  let pg = rpPage(meta, '');
  const g = pg.g;
  rpText(g, asm.name, RP_M, pg.y + 8, { size: 22, bold: true }); pg.y += 26;
  rpText(g, 'Lens design report · ' + benchName(asm.bench) + ' in ' + (project.name || 'Untitled bench'), RP_M, pg.y, { size: 9.5, ink: RP_SOFT }); pg.y += 22;
  rpHead(pg, 'Design conditions');
  const ap = c.aperture.kind === 'epd' ? 'Entrance pupil diameter ' + rf(c.aperture.v) + ' mm' : c.aperture.kind === 'fno' ? 'Working F-number ' + rf(c.aperture.v) : 'Object-space NA ' + rf(c.aperture.v);
  rpPara(pg, (fin ? 'An object ' + rf(F.object, 6) + ' mm before the first surface. ' : 'Light from infinity. ') + 'Aperture: ' + ap + '. Fields' + (fin ? ' (object heights)' : '') + ': ' + c.fields.map(f => rf(f.deg, 4) + FU + (f.w !== 1 ? ' (weight ' + rf(f.w, 3) + ')' : '')).join(', ') + '. Wavelengths: ' +
    c.waves.map((w, i) => rf(w.nm, 6) + ' nm' + (i === c.primary ? ' (primary)' : '') + (w.w !== 1 ? ' weight ' + rf(w.w, 3) : '')).join(', ') + '.');
  rpHead(pg, 'First order, at ' + rf(primaryNm(c), 6) + ' nm');
  rpTable(pg, [{ label: 'Effective focal length', w: 125 }, { label: 'Back focal length', w: 105 }, { label: 'Working F-number', w: 100 }, { label: 'Image-space NA', w: 85 }, { label: 'Image height', w: 84 }],
    [[rf(F.efl) + ' mm', rf(F.bfl) + ' mm', isFinite(F.fno) ? 'f/' + rf(Math.abs(A.fw), 4) : '—', rf(A.na, 4), rf(Math.abs(F.imgH), 5) + ' mm']]);
  if (fin) rpTable(pg, [{ label: 'Object distance', w: 125 }, { label: 'Image distance', w: 125 }, { label: 'Magnification', w: 100 }, { label: 'NA at the object', w: 149 }],
    [[rf(F.object) + ' mm', rf(F.imgDist) + ' mm from the last surface', rf(F.mag, 5), rf(F.na, 4)]]);
  rpTable(pg, [{ label: 'Entrance pupil', w: 230 }, { label: 'Exit pupil', w: 185 }, { label: 'Total track', w: 84 }],
    [[rf(F.epd, 5) + ' mm, ' + rf(F.epz, 5) + ' mm from surface 1', rf(F.xpz, 5) + ' mm from the last surface', rf(F.track, 6) + ' mm']]);
  rpHead(pg, 'Layout' + (P.folded ? ', folded as on the bench' : '') + (fin && F.object <= 3 * Math.max(F.track, 10) ? ', from the object' : '') + ', in the plane of the fields');
  rpLayout(g, asm, P, F, RP_M, pg.y, RP_W - 2 * RP_M, 230); pg.y += 240;
  rpKey(g, RP_M, pg.y, c.fields.map((f, i) => [rf(f.deg, 4) + FU, colourOf(i)])); pg.y += 18;
  rpHead(pg, 'Spot sizes, over the wavelengths');
  const spots = c.fields.map(f => spotDiagram(A, f.deg, 15));
  rpTable(pg, [{ label: 'Field', w: 80 }, { label: 'RMS radius (µm)', w: 110, mono: true }, { label: 'Largest radius (µm)', w: 120, mono: true }, { label: 'Airy radius (µm)', w: 110, mono: true }, { label: 'Rays lost', w: 79, mono: true }],
    spots.map(s => [rf(s.deg, 4) + FU, rf(1000 * s.rms, 4), rf(1000 * s.geo, 4), rf(1000 * s.airy, 4), String(s.waves.reduce((a, w) => a + w.lost, 0)) + ' of ' + s.rays * s.waves.length]));

  // ---- 2: prescription and Seidel sums ----
  pg = rpPage(meta, 'Prescription');
  const cols = [{ label: '#', w: 26 }, { label: 'Surface', w: 120 }, { label: 'Radius', w: 70, mono: true, align: 'right' }, { label: 'Thickness', w: 70, mono: true, align: 'right' }, { label: 'Glass', w: 68, pad: 10 }, { label: 'Clear r', w: 50, mono: true, align: 'right' }, { label: 'Conic', w: 50, mono: true, align: 'right' }];
  if (moved) cols.push({ label: 'Tilt, decentre', w: 45 });
  const rows = [['OBJ', 'Object', 'Flat', '∞', '', '', '']];
  P.surfaces.forEach((s, i) => {
    const last = i === P.surfaces.length - 1, t = last ? P.image : P.gaps[i], sp = sps[i];
    const glass = s.mirror ? 'Mirror' : last || P.materials[i].glass === 'AIR' ? '' : P.materials[i].glass === 'Model' ? rf(P.materials[i].nd, 5) + '/' + rf(P.materials[i].vd, 4) : matLabel(P.materials[i]);
    const r = [sp.kind === 'stop' ? 'STO' : String(i + 1), nameOf(i), s.R === null ? 'Flat' : rf(s.R, 7), rf(t, 7), glass, rf(s.semi, 5), s.k ? rf(s.k, 6) : '0'];
    if (moved) { const tt = s.tilt ? s.tilt[0] / deg : 0, dd = s.dec ? s.dec[1] : 0; r.push(sp.j === 0 && (tt || dd) ? [tt ? rf(tt, 4) + '°' : '', dd ? rf(dd, 4) + ' mm' : ''].filter(Boolean).join(', ') : ''); }
    rows.push(r);
  });
  rows.push(['IMA', 'Image', 'Flat', '', '', rf(Math.abs(F.imgH), 5), '']);
  if (moved) rows.forEach(r => { while (r.length < cols.length) r.push(''); });
  rpTable(pg, cols, rows, { size: 7.5 });
  rpPara(pg, 'Lengths in mm. Light from the left; a radius is positive with its centre to the right. The thickness after the last surface is the image distance' + (D.solves['t:image'] ? ', solved for the paraxial focus.' : '.') + (moved ? ' A tilt (degrees, in the plane of the fields) and a decentre (across the axis) are each part’s, about its first vertex; a mirror’s tilt folds the axis.' : ''), { ink: RP_SOFT });
  const asph = P.surfaces.map((s, i) => [i, s]).filter(([, s]) => s.a2 || (s.A || []).some(a => a) || (s.odd && s.odd.some(a => a)));
  if (asph.length) {
    rpHead(pg, 'Aspheric terms');
    for (const [i, s] of asph) rpPara(pg, 'Surface ' + (i + 1) + ': ' + [s.a2 ? 'A2 ' + s.a2.toExponential(6) : '', ...(s.A || []).map((a, q) => a ? 'A' + (4 + 2 * q) + ' ' + a.toExponential(6) : ''), ...((s.odd || []).map((a, q) => a ? 'B' + (q + 1) + ' ' + a.toExponential(6) : ''))].filter(Boolean).join(', '));
  }
  // the configurations: what differs between them, and what each gives (the rest of the report is the one shown)
  const MC = mcOf(D);
  if (MC) {
    rpHead(pg, 'Configurations (this report is of ' + MC.configs[MC.active].name + ')');
    const shown = MC.configs.slice(0, 6), cw = Math.floor((RP_W - 2 * RP_M - 160) / shown.length);
    const keyName = k => { const at = posOf(P, k); if (!at) return k; if (at.image) return 'Image distance'; const w = at.q === 'R' ? 'Radius' : at.q === 't' ? 'Thickness after' : at.q === 'k' ? 'Conic' : at.q === 'T' ? 'Tilt (°)' : at.q === 'D' ? 'Decentre' : 'A' + at.q.slice(1); return w + ' ' + (at.i + 1) + ' (' + nameOf(at.i) + ')'; };
    const figs = shown.map((cf, ci) => ci === MC.active ? F : designFigures({ cond: cf.obj && fin ? Object.assign({}, c, { object: { kind: 'finite', d: cf.obj } }) : c, design: D }, cfgSolved(asm, P, ci)));
    const crow = [['Weight', ...shown.map(cf => rf(cf.w, 4))]];
    if (fin) crow.push(['Object distance', ...shown.map((cf, ci) => rf(ci === MC.active ? F.object : cf.obj || F.object, 6))]);
    for (const k of MC.keys) crow.push([keyName(k), ...shown.map((cf, ci) => { const v = mcValue(asm, P, ci, k); return v === null ? 'Flat' : rf(v, 7); })]);
    crow.push(['Focal length', ...figs.map(f => rf(f.efl, 6))], ['Working F-number', ...figs.map(f => isFinite(f.fno) ? 'f/' + rf(Math.abs(f.fno), 4) : '—')], ['Total track', ...figs.map(f => rf(f.track, 6))]);
    rpTable(pg, [{ label: '', w: 160 }].concat(shown.map(cf => ({ label: cf.name, w: cw, mono: true, align: 'right' }))), crow, { size: 7.5 });
    if (MC.configs.length > shown.length) rpPara(pg, 'And ' + (MC.configs.length - shown.length) + ' more configurations, not shown.', { ink: RP_SOFT });
  }
  const nSolve = Object.keys(D.solves).length, nPick = Object.keys(D.pickups).length;
  if (nSolve || nPick || D.vars.length) { rpHead(pg, 'Solves, pickups and variables'); rpPara(pg, nSolve + ' solve' + (nSolve === 1 ? '' : 's') + ', ' + nPick + ' pickup' + (nPick === 1 ? '' : 's') + ' and ' + D.vars.length + ' variable' + (D.vars.length === 1 ? '' : 's') + ' for the optimiser are set in the lens data.'); }
  rpHead(pg, 'Seidel sums at the largest field, ' + rf(F.fmax, 4) + FU + ' (transverse, mm)');
  const sd = F.seidel, K = ['SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT'];
  const sc = [{ label: '#', w: 30 }].concat(K.map(k => ({ label: k, w: 67, mono: true, align: 'right' })));
  const se = v => !isFinite(v) ? '—' : Math.abs(v) < 5e-7 ? '0' : v.toExponential(3);
  rpTable(pg, sc, sd.rows.map((r, i) => [String(i + 1)].concat(K.map(k => se(r[k])))).concat([['Sum'].concat(K.map(k => se(sd.sum[k])))]), { size: 7 });
  rpPara(pg, 'SI spherical aberration, SII coma, SIII astigmatism, SIV Petzval curvature, SV distortion, CL axial colour, CT lateral colour' + (F.hi > F.lo ? ' (between ' + rf(F.lo, 5) + ' and ' + rf(F.hi, 5) + ' nm).' : '.'), { ink: RP_SOFT });

  // ---- 3: analyses ----
  pg = rpPage(meta, 'Analyses');
  const nf = spots.length, per = Math.min(4, nf), sw = (RP_W - 2 * RP_M - (per - 1) * 12) / per;
  rpHead(pg, 'Spot diagrams, about the chief ray');
  const lim = Math.max(...spots.map(s => s.geo), 1e-6) * 1.1;
  spots.forEach((s, i) => {
    const col = i % per, row = Math.floor(i / per), x = RP_M + col * (sw + 12), y = pg.y + row * (sw + 30), k2 = sw / (2 * lim), cx = x + sw / 2, cy = y + sw / 2;
    const q = pg.g;
    q.strokeStyle = RP_RULE; q.lineWidth = 0.4; q.strokeRect(x, y, sw, sw);
    q.beginPath(); q.moveTo(x, cy); q.lineTo(x + sw, cy); q.moveTo(cx, y); q.lineTo(cx, y + sw); q.stroke();
    s.waves.forEach((w, wi) => { pg.g.fillStyle = colourOf(wi); for (const [px, py] of w.pts) pg.g.fillRect(cx + px * k2 - 0.7, cy - py * k2 - 0.7, 1.4, 1.4); });
    // the Airy disc
    pg.g.strokeStyle = RP_SOFT; pg.g.lineWidth = 0.5; pg.g.beginPath(); pg.g.arc(cx, cy, s.airy * k2, 0, 2 * Math.PI); pg.g.stroke();
    rpText(pg.g, rf(s.deg, 4) + FU + ': RMS ' + rf(1000 * s.rms, 3) + ' µm', x, y + sw + 11, { size: 7.5 });
  });
  pg.y += Math.ceil(nf / per) * (sw + 30) - 8;
  rpText(pg.g, 'Each box ' + rf(2000 * lim, 3) + ' µm across; the circle is the Airy disc at ' + rf(A.nm0, 6) + ' nm.', RP_M, pg.y, { size: 7.5, ink: RP_SOFT }); pg.y += 8;
  rpKey(pg.g, RP_M + 300, pg.y - 8, c.waves.map((w, i) => [rf(w.nm, 5) + ' nm', colourOf(i)]));
  pg.y += 22;
  const FC = fieldCurves(A, 15), pw = (RP_W - 2 * RP_M - 40) / 2, ph = 150;
  const curves = []; FC.waves.forEach((w, wi) => { curves.push({ xs: w.tan, ys: FC.degs, colour: colourOf(wi) }, { xs: w.sag, ys: FC.degs, colour: colourOf(wi), dash: true }); });
  const xr = rpRange(FC.waves.flatMap(w => w.tan.concat(w.sag)).filter(v => v !== null), 0.1);
  rpPlot(pg.g, RP_M + 30, pg.y + 10, pw - 30, ph, { xr, yr: [0, Math.max(FC.degs[FC.degs.length - 1], 1e-3)], series: curves, title: 'Field curvature', xName: 'focus from the image plane (mm)', yName: fin ? 'object height (mm)' : 'field (°)' });
  rpPlot(pg.g, RP_M + pw + 70, pg.y + 10, pw - 30, ph, { xr: rpRange(FC.dist.filter(v => v !== null).concat([0]), 0.1), yr: [0, Math.max(FC.degs[FC.degs.length - 1], 1e-3)], series: [{ xs: FC.dist, ys: FC.degs, colour: colourOf(0) }], title: 'Distortion', xName: 'distortion (%)', yName: fin ? 'object height (mm)' : 'field (°)' });
  pg.y += ph + 40;
  rpKey(pg.g, RP_M, pg.y, [['tangential', RP_SOFT], ['sagittal', RP_SOFT, true]]); pg.y += 22;
  const M = c.fields.map(f => mtfAnalysis(A, f.deg)), mser = [];
  M.forEach((m, i) => mser.push({ xs: m.freqs, ys: m.tan, colour: colourOf(i) }, { xs: m.freqs, ys: m.sag, colour: colourOf(i), dash: true }));
  mser.push({ xs: M[0].freqs, ys: M[0].limT, colour: '#666' });
  rpPlot(pg.g, RP_M + 30, pg.y + 10, RP_W - 2 * RP_M - 30, 170, { xr: [0, M[0].freqs[M[0].freqs.length - 1]], yr: [0, 1], series: mser, title: 'MTF, over the wavelengths', xName: 'spatial frequency (cycles/mm)', yName: 'modulation' });
  pg.y += 210;
  rpKey(pg.g, RP_M, pg.y, c.fields.map((f, i) => [rf(f.deg, 4) + FU, colourOf(i)]).concat([['diffraction limit', '#666']]));

  // ---- 4: tolerances ----
  pg = rpPage(meta, 'Tolerances');
  const T = D.tol, R = tolResultsFor(asm, P);
  const kinds = [['rad', 'Radius (surface form)', 'fringes at 632.8 nm'], ['thk', 'Thickness and air gaps', '± mm'], ['dec', 'Lens decentre', '± mm, x and y'], ['tilt', 'Lens tilt', '± arcmin, about x and y'], ['ind', 'Glass index', '± in index'], ['abbe', 'Abbe number', '± %'], ['irr', 'Surface irregularity', 'fringes peak to valley at 632.8 nm']];
  rpTable(pg, [{ label: 'Tolerance', w: 180 }, { label: 'Limit', w: 90, mono: true }, { label: 'Unit', w: 229 }], kinds.map(([k, l, u]) => [l, T[k].on ? rf(T[k].v, 4) : 'off', u]));
  rpPara(pg, 'Compensator: ' + (T.comp ? 'the image plane refocused for each build.' : 'none.') + ' Monte Carlo: ' + T.trials + ' builds, each tolerance ' + (T.dist === 'normal' ? 'normal, its limit at two standard deviations' : 'uniform within its limits') + ', seed ' + T.seed + '.');
  const crit = { spot: 'RMS spot about the centroid (mm)', chief: 'RMS spot about the chief ray (mm)', wfe: 'RMS wavefront error (waves)' }[(R && R.crit) || D.merit.crit];
  rpPara(pg, 'Criterion: the merit function’s image term, ' + crit + ', over every field and wavelength.', { ink: RP_SOFT });
  if (!R || (!R.sens && !R.mc)) rpPara(pg, 'Neither run has been made on the design as it is now. Run Sensitivity and Monte Carlo in the Tolerance the design tab and make the report again to include them.');
  if (R && R.sens) {
    rpHead(pg, 'Sensitivity: each tolerance alone at its limits');
    const rows2 = R.sens.rows.slice().sort((a, b) => Math.max(b.minus, b.plus) - Math.max(a.minus, a.plus)).slice(0, 22);
    rpTable(pg, [{ label: 'Tolerance', w: 300 }, { label: 'At −limit', w: 100, mono: true, align: 'right' }, { label: 'At +limit', w: 99, mono: true, align: 'right' }], rows2.map(r => [r.label, rf(r.minus, 3), rf(r.plus, 3)]), { size: 7.5 });
    rpPara(pg, 'The change in the criterion from its nominal ' + rf(R.sens.nominal, 4) + (R.sens.rows.length > rows2.length ? '; the ' + rows2.length + ' largest of ' + R.sens.rows.length + ' shown' : '') + '. Expected over the builds, from these: ' + rf(R.est, 4) + '.');
  }
  if (R && R.mc && R.mc.stats) {
    const st = R.mc.stats;
    rpHead(pg, 'Monte Carlo: ' + st.n + ' builds');
    rpTable(pg, [{ label: 'Nominal', w: 70, mono: true }, { label: 'Mean', w: 70, mono: true }, { label: 'Deviation', w: 70, mono: true }, { label: '50% within', w: 72, mono: true }, { label: '90% within', w: 72, mono: true }, { label: '98% within', w: 72, mono: true }, { label: 'Worst', w: 73, mono: true }],
      [[rf(R.mc.nominal, 4), rf(st.mean, 4), rf(st.sd, 4), rf(st.p50, 4), rf(st.p90, 4), rf(st.p98, 4), rf(st.worst, 4)]]);
  }

  // ---- the drawings, landscape ----
  const draws = lensDrawings(asm);
  const recs = meta.pages.map(p => p.g);
  draws.forEach((Dd, i) => { const r = new VecCtx(842, 595, { plain: true }); drawSheet(r, Dd, { assembly: asm.name, sheet: i + 1, of: draws.length, date: meta.date }); recs.push(r); });
  // page numbers
  recs.forEach((r, i) => rpText(r, 'Page ' + (i + 1) + ' of ' + recs.length, r.w - (r.w > r.h ? 22 + 330 : RP_M), r.w > r.h ? 14 : RP_H - 24, { size: 7.5, ink: RP_SOFT, align: r.w > r.h ? 'left' : 'right' }));
  return recs;
}
export const reportPdfBlob = (asm, opts) => pdfDoc(reportRecs(asm), asm.name + ' lens design report', opts);
export async function saveReport(asm) {
  const name = safeFileName(asm.name + ' - design report') + '.pdf';
  try { downloadFile(name, await reportPdfBlob(asm)); toast('Saved ' + name); }
  catch (e) { toast('The report could not be made: ' + e.message, true); }
  return name;
}
