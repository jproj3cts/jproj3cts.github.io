import { V, deg, project } from '../state/project.js';
import { lastTrace, setExporting } from '../engines/trace.js';
import { DPR, H, W, canvas, ctx, render, requestRender, setCtx, setDPR } from '../ui/render.js';
import { diffraction } from '../engines/pd-cavity.js';
import { binnedField, screenStats } from '../engines/screen-stats.js';
import { downloadFile, fitView, safeFileName, toast } from '../ui/actions.js';
import { accountGate } from '../ui/pro.js';
import { VecCtx, pdfDoc } from './pdf.js';

/* ---------- The layout as a vector drawing ----------
   The bench is drawn again into a context that keeps what it is told (paths, text, and the
   field's glow as one picture) rather than pixels, and that is written out as SVG or PDF.
   Paths stay paths at any zoom; the diffracted field, a raster in the tool, stays a raster. */
/* the bench drawn once into a VecCtx, just as it stands, less the handles */
export function recordLayout() {
  const rec = new VecCtx(W, H), keep = ctx, dpr = DPR;
  setCtx(rec); setDPR(1); setExporting(true);
  try { render(); } finally { setCtx(keep); setDPR(dpr); setExporting(false); requestRender(); }
  return rec;
}
const svgNum = v => +v.toFixed(2);
const segsD = segs => segs.map(s => s[0] + (s.length > 1 ? s.slice(1).map(svgNum).join(' ') : '')).join('');
const xmlEsc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function layoutSvg(rec, title, unit = '') {     // unit: 'pt' for a figure of a size on paper
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const op = (c, a) => { const o = c.a * a; return o < 0.999 ? ' ' + o.toFixed(3).replace(/0+$/, '') : ''; };
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + svgNum(rec.w) + unit + '" height="' + svgNum(rec.h) + unit +
    '" viewBox="0 0 ' + svgNum(rec.w) + ' ' + svgNum(rec.h) + '">', '<title>' + xmlEsc(title || project.name) + '</title>'];
  for (const o of rec.ops) {
    const bl = o.blend ? ' style="mix-blend-mode:' + o.blend + '"' : '';
    if (o.k === 'path') {
      let a = '<path d="' + segsD(o.segs) + '"';
      if (o.fill) { a += ' fill="' + hex(o.fill) + '"'; const q = op(o.fill, o.alpha); if (q) a += ' fill-opacity="' + q.trim() + '"'; }
      else a += ' fill="none"';
      if (o.stroke) {
        a += ' stroke="' + hex(o.stroke) + '" stroke-width="' + svgNum(o.lw) + '"';
        const q = op(o.stroke, o.alpha); if (q) a += ' stroke-opacity="' + q.trim() + '"';
        if (o.dash.length) a += ' stroke-dasharray="' + o.dash.map(svgNum).join(' ') + '"';
        if (o.cap !== 'butt') a += ' stroke-linecap="' + o.cap + '"';
        if (o.join !== 'miter') a += ' stroke-linejoin="' + o.join + '"';
      }
      out.push(a + bl + '/>');
    } else if (o.k === 'text') {
      const q = op(o.fill, o.alpha);
      out.push('<text x="' + svgNum(o.x) + '" y="' + svgNum(o.y) + '" font-family="' + xmlEsc(o.family.replace(/"/g, "'")) + '" font-size="' + svgNum(o.size) + '"' +
        (o.bold ? ' font-weight="600"' : '') + (o.italic ? ' font-style="italic"' : '') + ' fill="' + hex(o.fill) + '"' + (q ? ' fill-opacity="' + q.trim() + '"' : '') +
        (Math.abs(o.rot) > 1e-6 ? ' transform="rotate(' + svgNum(o.rot / deg) + ' ' + svgNum(o.x) + ' ' + svgNum(o.y) + ')"' : '') + bl + '>' + xmlEsc(o.t) + '</text>');
    } else if (o.k === 'layer') {
      out.push('<image x="0" y="0" width="' + svgNum(rec.w) + '" height="' + svgNum(rec.h) + '" preserveAspectRatio="none" xlink:href="' + rec.layer.toDataURL('image/png') + '"' + bl + '/>');
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

const layoutPdf = rec => pdfDoc([rec], project.name);
/* the layout as a picture: the whole tab, framed as Fit frames it, or (view) just what is on screen now */
export async function exportLayout(kind, view) {
  if (!accountGate('export the layout')) return;
  const base = safeFileName(project.name) + (project.benches.length > 1 ? ' - ' + safeFileName((project.benches.find(b => b.id === project.tab) || {}).name) : '');
  const keep = Object.assign({}, V());
  if (!view) fitView();                                         // put back as soon as it is drawn
  try {
    if (kind === 'svg') {
      const name = base + '.svg';
      downloadFile(name, new Blob([layoutSvg(recordLayout())], { type: 'image/svg+xml' }));
      toast('Saved ' + name);
    } else if (kind === 'pdf') {
      const name = base + '.pdf';
      downloadFile(name, await layoutPdf(recordLayout()));
      toast('Saved ' + name);
    } else {
      const name = base + '.png';
      setExporting(true); render(); setExporting(false);           // without the handles
      canvas.toBlob(blob => {
        if (!blob) { toast('The layout could not be exported here.', true); return; }
        downloadFile(name, blob);
        toast('Saved ' + name);
      }, 'image/png');
      requestRender();
    }
  } catch (err) {
    setExporting(false);
    toast('The layout could not be exported: ' + err.message, true);
  } finally {
    if (!view) { Object.assign(V(), keep); requestRender(); }
  }
}

/* Everything a screen saw, as a spreadsheet: the rays, then the curves */
export function exportScreen(el) {
  if (!accountGate('export a screen\u2019s data')) return;
  const st = screenStats(el);
  if (!st || st.empty) { toast('That screen has nothing on it to export.', true); return; }
  const hits = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
  const L = [];
  L.push('JEKray screen export');
  L.push('bench,' + JSON.stringify(project.name));
  L.push('screen,' + JSON.stringify(el.name));
  L.push('');
  L.push('section,rays');
  L.push('position_mm,power,optical_path_mm,wavelength_nm,s_power,p_power');
  for (const t of hits) {
    L.push([t.y, t.w, t.opl, t.nm, t.sr * t.sr + t.si * t.si, t.pr * t.pr + t.pi * t.pi]
      .map(v => (+v.toPrecision(9))).join(','));
  }
  const B = binnedField(el);
  if (B) {
    L.push('');
    L.push('section,binned intensity' + (B.interp ? ' (interpolated)' : ''));
    L.push('bin_centre_mm,coherent,incoherent');
    for (let i = 0; i < B.n; i++) {
      L.push([+(B.lo + (i + 0.5) * B.width).toPrecision(9), +B.coh[i].toPrecision(6), +B.inc[i].toPrecision(6)].join(','));
    }
  }
  const D = diffraction(el);
  if (D) {
    L.push('');
    L.push('section,point spread and enclosed energy' + (D.symmetric ? ' (round field)' : ' (2D field, averaged round the peak)'));
    L.push('radius_mm,psf_normalised,enclosed_energy');
    const pk = Math.max(...D.psf) || 1;
    for (let i = 0; i < D.rho.length; i++) {
      L.push([+D.rho[i].toPrecision(8), +(D.psf[i] / pk).toPrecision(6), +D.ee[i].toPrecision(6)].join(','));
    }
    L.push('');
    L.push('section,mtf' + (D.symmetric ? ' (round field)' : ' (2D field)'));
    L.push(D.symmetric ? 'frequency_lp_per_mm,mtf' : 'frequency_lp_per_mm,mtf_in_plane,mtf_out_of_plane');
    for (let i = 0; i < D.freq.length; i++) L.push((+D.freq[i].toPrecision(8)) + ',' + (+D.mtf[i].toPrecision(6)) + (D.symmetric ? '' : ',' + (+D.mtfY[i].toPrecision(6))));
  }
  const name = safeFileName(project.name + ' ' + el.name) + '.csv';
  downloadFile(name, new Blob([L.join('\n')], { type: 'text/csv' }));
  toast('Saved ' + name);
}
