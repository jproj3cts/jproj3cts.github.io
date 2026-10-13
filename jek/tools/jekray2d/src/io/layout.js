import { deg, project } from '../state/project.js';
import { lastTrace, setExporting } from '../engines/trace.js';
import { DPR, H, V, W, canvas, ctx, lightLayer, render, requestRender, setCtx, setDPR } from '../ui/render.js';
import { clamp } from '../ui/params.js';
import { binnedField } from '../ui/panels.js';
import { diffraction, screenStats } from '../engines/pd-cavity.js';
import { downloadFile, fitView, safeFileName, toast } from '../ui/actions.js';

/* ---------- The layout as a vector drawing ----------
   The bench is drawn again into a context that keeps what it is told (paths, text, and the
   field's glow as one picture) rather than pixels, and that is written out as SVG or PDF.
   Paths stay paths at any zoom; the diffracted field, a raster in the tool, stays a raster. */
export const cssColour = (() => {
  const g = document.createElement('canvas').getContext('2d'), memo = new Map();
  return s => {
    if (typeof s !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
    if (memo.has(s)) return memo.get(s);
    g.fillStyle = '#000'; g.fillStyle = s;
    const v = g.fillStyle; let out;
    if (v[0] === '#') out = { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16), a: 1 };
    else { const m = v.match(/[\d.]+/g) || [0, 0, 0, 1]; out = { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; }
    memo.set(s, out); return out;
  };
})();
class VecCtx {
  constructor(w, h) {
    this.w = w; this.h = h; this.ops = []; this.path = []; this.stack = [];
    this.M = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.font = '10px sans-serif';
    this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = [];
    this.shadowColor = 'transparent'; this.shadowBlur = 0; this.imageSmoothingEnabled = true; this.miterLimit = 10;
    this.meas = document.createElement('canvas').getContext('2d');
    this.layer = null;                     // what drawImage paints, at twice the size
  }
  static KEYS = ['M', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'globalCompositeOperation',
    'font', 'textAlign', 'textBaseline', 'dash', 'shadowColor', 'shadowBlur', 'imageSmoothingEnabled', 'miterLimit'];
  save() { const s = {}; for (const k of VecCtx.KEYS) s[k] = this[k]; this.stack.push(s); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setTransform(a, b, c, d, e, f) { this.M = [a, b, c, d, e, f]; }
  resetTransform() { this.M = [1, 0, 0, 1, 0, 0]; }
  setLineDash(d) { this.dash = (d || []).slice(); }
  getLineDash() { return this.dash.slice(); }
  pt(x, y) { const M = this.M; return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }
  // how much the current transform scales lengths (for line widths and text)
  unit() { const M = this.M; return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])); }
  // the canvas's own transforms, which the fibre, electronics and chip parts' symbols use
  transform(a, b, c, d, e, f) {
    const M = this.M;
    this.M = [M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * c + M[2] * d, M[1] * c + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]];
  }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  rotate(t) { const c = Math.cos(t), s = Math.sin(t); this.transform(c, s, -s, c, 0, 0); }
  scale(x, y) { this.transform(x, 0, 0, y === undefined ? x : y, 0, 0); }
  getTransform() { const M = this.M; return { a: M[0], b: M[1], c: M[2], d: M[3], e: M[4], f: M[5] }; }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push(['M', ...this.pt(x, y)]); this.start = this.path[this.path.length - 1].slice(1); }
  lineTo(x, y) { if (!this.path.length) return this.moveTo(x, y); this.path.push(['L', ...this.pt(x, y)]); }
  bezierCurveTo(a, b, c, d, x, y) { if (!this.path.length) this.moveTo(a, b); this.path.push(['C', ...this.pt(a, b), ...this.pt(c, d), ...this.pt(x, y)]); }
  quadraticCurveTo(a, b, x, y) {
    const last = this.path.length ? this.path[this.path.length - 1] : null;
    if (!last) return this.moveTo(x, y);
    // back to the user's space for the one control point: exact for an affine map
    const p0 = last.slice(-2), q = this.pt(a, b), p1 = this.pt(x, y);
    this.path.push(['C', p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1]), p1[0] + 2 / 3 * (q[0] - p1[0]), p1[1] + 2 / 3 * (q[1] - p1[1]), p1[0], p1[1]]);
  }
  closePath() { if (this.path.length) { this.path.push(['Z']); if (this.start) this.path.push(['M', ...this.start]); } }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  arc(cx, cy, r, a0, a1, ccw) {
    let da = a1 - a0;
    if (!ccw) { if (da >= 2 * Math.PI) da = 2 * Math.PI; else { da %= 2 * Math.PI; if (da < 0) da += 2 * Math.PI; } }
    else { if (-da >= 2 * Math.PI) da = -2 * Math.PI; else { da %= 2 * Math.PI; if (da > 0) da -= 2 * Math.PI; } }
    const P = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const p0 = P(a0);
    if (this.path.length) this.lineTo(...p0); else this.moveTo(...p0);
    const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-9)), s = da / n, k = 4 / 3 * Math.tan(s / 4);
    for (let i = 0; i < n; i++) {
      const a = a0 + i * s, b = a + s, [x0, y0] = P(a), [x1, y1] = P(b);
      this.bezierCurveTo(x0 - k * r * Math.sin(a), y0 + k * r * Math.cos(a), x1 + k * r * Math.sin(b), y1 - k * r * Math.cos(b), x1, y1);
    }
  }
  ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) {
    const M0 = this.M.slice(), c = Math.cos(rot), s = Math.sin(rot), M = M0;
    this.M = [M[0] * c * rx + M[2] * s * rx, M[1] * c * rx + M[3] * s * rx, -M[0] * s * ry + M[2] * c * ry, -M[1] * s * ry + M[3] * c * ry, M[0] * cx + M[2] * cy + M[4], M[1] * cx + M[3] * cy + M[5]];
    this.arc(0, 0, 1, a0, a1, ccw); this.M = M0;
  }
  clip() { /* nothing on the bench clips */ }
  style() {
    const op = this.globalCompositeOperation;
    return { alpha: this.globalAlpha, blend: op === 'lighter' || op === 'screen' ? 'screen' : op === 'multiply' ? 'multiply' : null };
  }
  fill() { if (this.path.length) this.ops.push(Object.assign({ k: 'path', segs: this.path.slice(), fill: cssColour(this.fillStyle) }, this.style())); }
  stroke() {
    if (!this.path.length) return;
    const s = this.unit();
    this.ops.push(Object.assign({ k: 'path', segs: this.path.slice(), stroke: cssColour(this.strokeStyle), lw: this.lineWidth * s,
      dash: this.dash.map(v => v * s), cap: this.lineCap, join: this.lineJoin }, this.style()));
  }
  fillRect(x, y, w, h) { const P = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = P; }
  strokeRect(x, y, w, h) { const P = this.path; this.path = []; this.rect(x, y, w, h); this.stroke(); this.path = P; }
  clearRect() { }
  measureText(t) { this.meas.font = this.font; return this.meas.measureText(t); }
  fillText(t, x, y) {
    t = String(t); if (!t) return;
    this.meas.font = this.font;
    const f = this.meas.font, size = +(f.match(/([\d.]+)px/) || [0, 10])[1], w = this.meas.measureText(t).width;
    const al = this.textAlign, dx = al === 'center' ? -w / 2 : al === 'right' || al === 'end' ? -w : 0;
    const bl = this.textBaseline, dy = bl === 'middle' ? 0.35 * size : bl === 'top' || bl === 'hanging' ? 0.8 * size : bl === 'bottom' || bl === 'ideographic' ? -0.22 * size : 0;
    const [ox, oy] = this.pt(x + dx, y + dy), M = this.M, sc = this.unit();
    this.ops.push(Object.assign({ k: 'text', t, x: ox, y: oy, w: w * sc, size: size * sc, rot: Math.atan2(M[1], M[0]),
      mono: /mono|courier|consol/i.test(f), bold: /\b(bold|[6-9]00)\b/.test(f), italic: /\bitalic\b/.test(f), family: (f.match(/[\d.]+px\s+(.*)$/) || [0, 'sans-serif'])[1],
      fill: cssColour(this.fillStyle) }, this.style()));
  }
  strokeText() { }
  drawImage(img, ...a) {
    if (!this.layer) {
      const c = document.createElement('canvas'); c.width = Math.round(this.w * 2); c.height = Math.round(this.h * 2);
      this.layer = c; this.ops.push({ k: 'layer', blend: lightLayer ? null : 'screen', alpha: 1 });
    }
    const g = this.layer.getContext('2d'), M = this.M;
    g.setTransform(2 * M[0], 2 * M[1], 2 * M[2], 2 * M[3], 2 * M[4], 2 * M[5]);
    g.globalAlpha = this.globalAlpha; g.globalCompositeOperation = this.globalCompositeOperation === 'source-over' ? 'source-over' : this.globalCompositeOperation === 'multiply' ? 'multiply' : 'lighter';
    g.imageSmoothingEnabled = this.imageSmoothingEnabled;
    g.drawImage(img, ...a);
  }
  createImageData(w, h) { return new ImageData(w, h); }
}

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
export function layoutSvg(rec) {
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const op = (c, a) => { const o = c.a * a; return o < 0.999 ? ' ' + o.toFixed(3).replace(/0+$/, '') : ''; };
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + svgNum(rec.w) + '" height="' + svgNum(rec.h) +
    '" viewBox="0 0 ' + svgNum(rec.w) + ' ' + svgNum(rec.h) + '">', '<title>' + xmlEsc(project.name) + '</title>'];
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

/* A PDF of one page, written here: the standard fonts (so nothing to embed), the field's
   glow as one image with its transparency, deflated where the browser can */
async function deflateBytes(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  } catch (e) { return null; }
}
const WINANSI = { 0x20ac: 128, 0x201a: 130, 0x192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x2c6: 136, 0x2030: 137, 0x160: 138, 0x2039: 139,
  0x152: 140, 0x17d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x2dc: 152, 0x2122: 153,
  0x161: 154, 0x203a: 155, 0x153: 156, 0x17e: 158, 0x178: 159 };
const PDF_SUBS = { '−': '-', '→': '->', '←': '<-', '⇄': '<->', '↔': '<->', '≈': '~', '≤': '<=', '≥': '>=', '∞': 'inf',
  'λ': 'lambda', 'Δ': 'Delta', 'δ': 'delta', 'ω': 'omega', 'π': 'pi', 'θ': 'theta', 'φ': 'phi', 'α': 'alpha',
  'β': 'beta', 'γ': 'gamma', 'σ': 'sigma', 'ν': 'nu', 'τ': 'tau', ' ': ' ', ' ': ' ', '′': "'", '″': '"', '⁄': '/' };
function pdfText(t) {
  let s = '';
  for (const ch of String(t)) {
    const c = ch.codePointAt(0);
    let b = c < 128 || (c >= 160 && c < 256) ? c : WINANSI[c];
    if (b === undefined) { const r = PDF_SUBS[ch]; if (r !== undefined) { s += pdfText(r); continue; } b = 63; }
    s += b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b);
  }
  return s;
}
async function layoutPdf(rec) {
  const n = v => +v.toFixed(3);
  const col = c => [c.r, c.g, c.b].map(v => n(v / 255)).join(' ');
  const gsList = [], gsKey = new Map();
  const gs = (ca, CA, bm) => {
    const k = n(ca) + ',' + n(CA) + ',' + (bm || '');
    if (!gsKey.has(k)) { gsKey.set(k, 'G' + gsList.length); gsList.push({ ca: n(ca), CA: n(CA), bm }); }
    return gsKey.get(k);
  };
  const fonts = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Courier', F4: 'Courier-Bold' };
  const C = ['1 0 0 -1 0 ' + n(rec.h) + ' cm'];      // y down, as on the canvas
  for (const o of rec.ops) {
    if (o.k === 'path') {
      const P = [];
      for (const s of o.segs) {
        if (s[0] === 'M') P.push(n(s[1]) + ' ' + n(s[2]) + ' m');
        else if (s[0] === 'L') P.push(n(s[1]) + ' ' + n(s[2]) + ' l');
        else if (s[0] === 'C') P.push(s.slice(1).map(n).join(' ') + ' c');
        else P.push('h');
      }
      if (o.fill) C.push('q /' + gs(o.fill.a * o.alpha, 1, o.blend) + ' gs ' + col(o.fill) + ' rg ' + P.join(' ') + ' f Q');
      else {
        C.push('q /' + gs(1, o.stroke.a * o.alpha, o.blend) + ' gs ' + col(o.stroke) + ' RG ' + n(o.lw) + ' w ' +
          ({ butt: 0, round: 1, square: 2 }[o.cap] || 0) + ' J ' + ({ miter: 0, round: 1, bevel: 2 }[o.join] || 0) + ' j [' +
          o.dash.map(n).join(' ') + '] 0 d ' + P.join(' ') + ' S Q');
      }
    } else if (o.k === 'text') {
      const f = (o.mono ? (o.bold ? 'F4' : 'F3') : (o.bold ? 'F2' : 'F1')), c = Math.cos(o.rot), s = Math.sin(o.rot);
      // the standard font's own width differs from the browser's: squeeze it to fit
      const est = o.t.length * (o.mono ? 0.6 : 0.52) * o.size, tz = clamp(100 * o.w / (est || 1), 70, 130);
      C.push('q /' + gs(o.fill.a * o.alpha, 1, o.blend) + ' gs ' + col(o.fill) + ' rg BT /' + f + ' ' + n(o.size) + ' Tf ' + n(tz) + ' Tz ' +
        [n(c), n(s), n(s), n(-c), n(o.x), n(o.y)].join(' ') + ' Tm (' + pdfText(o.t) + ') Tj ET Q');
    } else if (o.k === 'layer') {
      C.push('q /' + gs(1, 1, o.blend) + ' gs ' + n(rec.w) + ' 0 0 ' + n(-rec.h) + ' 0 ' + n(rec.h) + ' cm /Im1 Do Q');
    }
  }
  // the pieces, each an object; byte offsets for the cross-reference table
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const put = x => { const b = typeof x === 'string' ? Uint8Array.from(x, ch => ch.charCodeAt(0) & 255) : x; parts.push(b); len += b.length; };
  const obj = (i, body, stream) => {
    offs[i] = len;
    if (stream) { put(i + ' 0 obj\n' + body.replace(/>>$/, '/Length ' + stream.length + '>>') + '\nstream\n'); put(stream); put('\nendstream\nendobj\n'); }
    else put(i + ' 0 obj\n' + body + '\nendobj\n');
  };
  put('%PDF-1.4\n%âãÏÓ\n');
  const content = Uint8Array.from(C.join('\n'), ch => ch.charCodeAt(0) & 255);
  const zc = await deflateBytes(content);
  let next = 6;
  const fontIds = {}; for (const k in fonts) fontIds[k] = next++;
  const gsIds = gsList.map(() => next++);
  let imId = 0, smId = 0, img = null;
  if (rec.layer) {
    const L = rec.layer, d = L.getContext('2d').getImageData(0, 0, L.width, L.height).data, N = L.width * L.height;
    const rgb = new Uint8Array(N * 3), al = new Uint8Array(N);
    for (let i = 0; i < N; i++) { rgb[3 * i] = d[4 * i]; rgb[3 * i + 1] = d[4 * i + 1]; rgb[3 * i + 2] = d[4 * i + 2]; al[i] = d[4 * i + 3]; }
    img = { w: L.width, h: L.height, rgb: (await deflateBytes(rgb)) || rgb, al: (await deflateBytes(al)) || al, z: !!(await deflateBytes(new Uint8Array(1))) };
    imId = next++; smId = next++;
  }
  obj(1, '<</Type/Catalog/Pages 2 0 R>>');
  obj(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>');
  obj(3, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + n(rec.w) + ' ' + n(rec.h) + ']/Contents 4 0 R/Resources 5 0 R>>');
  obj(4, '<<' + (zc ? '/Filter/FlateDecode' : '') + '>>', zc || content);
  obj(5, '<</Font<<' + Object.keys(fonts).map(k => '/' + k + ' ' + fontIds[k] + ' 0 R').join('') + '>>' +
    (gsList.length ? '/ExtGState<<' + gsList.map((g, i) => '/G' + i + ' ' + gsIds[i] + ' 0 R').join('') + '>>' : '') +
    (img ? '/XObject<</Im1 ' + imId + ' 0 R>>' : '') + '>>');
  for (const k in fonts) obj(fontIds[k], '<</Type/Font/Subtype/Type1/BaseFont/' + fonts[k] + '/Encoding/WinAnsiEncoding>>');
  gsList.forEach((g, i) => obj(gsIds[i], '<</Type/ExtGState/ca ' + g.ca + '/CA ' + g.CA + (g.bm ? (g.bm === 'multiply' ? '/BM/Multiply' : '/BM/Screen') : '') + '>>'));
  if (img) {
    const F = img.z ? '/Filter/FlateDecode' : '';
    obj(imId, '<</Type/XObject/Subtype/Image/Width ' + img.w + '/Height ' + img.h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/SMask ' + smId + ' 0 R' + F + '>>', img.rgb);
    obj(smId, '<</Type/XObject/Subtype/Image/Width ' + img.w + '/Height ' + img.h + '/ColorSpace/DeviceGray/BitsPerComponent 8' + F + '>>', img.al);
  }
  const xref = len, count = offs.length;
  put('xref\n0 ' + count + '\n0000000000 65535 f \n' + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  put('trailer\n<</Size ' + count + '/Root 1 0 R>>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
/* the layout as a picture: the whole tab, framed as Fit frames it, or (view) just what is on screen now */
export async function exportLayout(kind, view) {
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
  const st = screenStats(el);
  if (!st || st.empty) { toast('That screen has nothing on it to export.', true); return; }
  const hits = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
  const L = [];
  L.push('JEKray2D screen export');
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
