import { clamp } from '../core/constants.js';
import { hooks } from '../core/hooks.js';

/* ==========================================================================
   Vector pages, and PDF written here with no library
   VecCtx is a 2D canvas context that keeps what it is told (paths, text, and a raster layer for the diffracted field's
   glow) rather than pixels; pdfDoc writes pages of them as one PDF, in the standard fonts (nothing to embed). Shared
   by JEKray's layout, figures, reports and drawings, and by JEKfilm's coating specification; whether the glow layer
   is drawn light (no screen blend) comes through hooks.vecLightLayer.
   ========================================================================== */
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
export class VecCtx {
  constructor(w, h, opts) {
    this.w = w; this.h = h; this.plain = !!(opts && opts.plain); this.res = opts && opts.res || 2; this.ops = []; this.path = []; this.stack = [];
    this.M = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
    this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; this.font = '10px sans-serif';
    this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = [];
    this.shadowColor = 'transparent'; this.shadowBlur = 0; this.imageSmoothingEnabled = true; this.miterLimit = 10;
    this.meas = document.createElement('canvas').getContext('2d');
    this.layer = null;                     // what drawImage paints, at res times the size (twice unless asked)
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
      const c = document.createElement('canvas'); c.width = Math.round(this.w * this.res); c.height = Math.round(this.h * this.res);
      this.layer = c; this.ops.push({ k: 'layer', blend: hooks.vecLightLayer() || this.plain ? null : 'screen', alpha: 1 });
    }
    const g = this.layer.getContext('2d'), M = this.M, r = this.res;
    g.setTransform(r * M[0], r * M[1], r * M[2], r * M[3], r * M[4], r * M[5]);
    g.globalAlpha = this.globalAlpha; g.globalCompositeOperation = this.globalCompositeOperation === 'source-over' ? 'source-over' : this.globalCompositeOperation === 'multiply' ? 'multiply' : 'lighter';
    g.imageSmoothingEnabled = this.imageSmoothingEnabled;
    g.drawImage(img, ...a);
  }
  createImageData(w, h) { return new ImageData(w, h); }
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
  'β': 'beta', 'γ': 'gamma', 'ρ': 'rho', 'σ': 'sigma', 'ν': 'nu', 'τ': 'tau', ' ': ' ', ' ': ' ', '′': "'", '″': '"', '⁄': '/' };
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
/* pages, each a VecCtx's record, as one PDF (the title in its information); opts.raw: its page contents
   left uncompressed, so their text can be read */
export async function pdfDoc(recs, title, opts) {
  const n = v => +v.toFixed(3);
  const col = c => [c.r, c.g, c.b].map(v => n(v / 255)).join(' ');
  const gsList = [], gsKey = new Map();
  const gs = (ca, CA, bm) => {
    const k = n(ca) + ',' + n(CA) + ',' + (bm || '');
    if (!gsKey.has(k)) { gsKey.set(k, 'G' + gsList.length); gsList.push({ ca: n(ca), CA: n(CA), bm }); }
    return gsKey.get(k);
  };
  const fonts = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Courier', F4: 'Courier-Bold' };
  const streams = recs.map(rec => {
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
        // (a page drawn for print, in the standard fonts themselves, keeps their own widths)
        const est = o.t.length * (o.mono ? 0.6 : 0.52) * o.size, tz = rec.plain ? 100 : clamp(100 * o.w / (est || 1), 70, 130);
        C.push('q /' + gs(o.fill.a * o.alpha, 1, o.blend) + ' gs ' + col(o.fill) + ' rg BT /' + f + ' ' + n(o.size) + ' Tf ' + n(tz) + ' Tz ' +
          [n(c), n(s), n(s), n(-c), n(o.x), n(o.y)].join(' ') + ' Tm (' + pdfText(o.t) + ') Tj ET Q');
      } else if (o.k === 'layer') {
        C.push('q /' + gs(1, 1, o.blend) + ' gs ' + n(rec.w) + ' 0 0 ' + n(-rec.h) + ' 0 ' + n(rec.h) + ' cm /Im1 Do Q');
      }
    }
    return Uint8Array.from(C.join('\n'), ch => ch.charCodeAt(0) & 255);
  });
  // the pieces, each an object; byte offsets for the cross-reference table
  const parts = [], offs = [];
  let len = 0;
  const put = x => { const b = typeof x === 'string' ? Uint8Array.from(x, ch => ch.charCodeAt(0) & 255) : x; parts.push(b); len += b.length; };
  const obj = (i, body, stream) => {
    offs[i] = len;
    if (stream) { put(i + ' 0 obj\n' + body.replace(/>>$/, '/Length ' + stream.length + '>>') + '\nstream\n'); put(stream); put('\nendstream\nendobj\n'); }
    else put(i + ' 0 obj\n' + body + '\nendobj\n');
  };
  put('%PDF-1.4\n%âãÏÓ\n');
  // 1 catalog, 2 pages, 3 information; then fonts and states, then each page: page, contents, resources, image, mask
  let next = 4;
  const fontIds = {}; for (const k in fonts) fontIds[k] = next++;
  const gsIds = gsList.map(() => next++);
  const pages = [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i], pg = { id: next++, cid: next++, rid: next++, zc: opts && opts.raw ? null : await deflateBytes(streams[i]) };
    if (rec.layer) {
      const L = rec.layer, d = L.getContext('2d').getImageData(0, 0, L.width, L.height).data, N = L.width * L.height;
      const rgb = new Uint8Array(N * 3), al = new Uint8Array(N);
      for (let q = 0; q < N; q++) { rgb[3 * q] = d[4 * q]; rgb[3 * q + 1] = d[4 * q + 1]; rgb[3 * q + 2] = d[4 * q + 2]; al[q] = d[4 * q + 3]; }
      pg.img = { w: L.width, h: L.height, rgb: (await deflateBytes(rgb)) || rgb, al: (await deflateBytes(al)) || al, z: !!(await deflateBytes(new Uint8Array(1))) };
      pg.imId = next++; pg.smId = next++;
    }
    pages.push(pg);
  }
  obj(1, '<</Type/Catalog/Pages 2 0 R>>');
  obj(2, '<</Type/Pages/Kids[' + pages.map(p => p.id + ' 0 R').join(' ') + ']/Count ' + pages.length + '>>');
  obj(3, '<</Title(' + pdfText(title || 'Untitled') + ')/Producer(' + pdfText(hooks.appName || 'JEKray') + ')>>');
  for (const k in fonts) obj(fontIds[k], '<</Type/Font/Subtype/Type1/BaseFont/' + fonts[k] + '/Encoding/WinAnsiEncoding>>');
  gsList.forEach((g, i) => obj(gsIds[i], '<</Type/ExtGState/ca ' + g.ca + '/CA ' + g.CA + (g.bm ? (g.bm === 'multiply' ? '/BM/Multiply' : '/BM/Screen') : '') + '>>'));
  pages.forEach((pg, i) => {
    const rec = recs[i];
    obj(pg.id, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + n(rec.w) + ' ' + n(rec.h) + ']/Contents ' + pg.cid + ' 0 R/Resources ' + pg.rid + ' 0 R>>');
    obj(pg.cid, '<<' + (pg.zc ? '/Filter/FlateDecode' : '') + '>>', pg.zc || streams[i]);
    obj(pg.rid, '<</Font<<' + Object.keys(fonts).map(k => '/' + k + ' ' + fontIds[k] + ' 0 R').join('') + '>>' +
      (gsList.length ? '/ExtGState<<' + gsList.map((g, q) => '/G' + q + ' ' + gsIds[q] + ' 0 R').join('') + '>>' : '') +
      (pg.img ? '/XObject<</Im1 ' + pg.imId + ' 0 R>>' : '') + '>>');
    if (pg.img) {
      const F = pg.img.z ? '/Filter/FlateDecode' : '';
      obj(pg.imId, '<</Type/XObject/Subtype/Image/Width ' + pg.img.w + '/Height ' + pg.img.h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/SMask ' + pg.smId + ' 0 R' + F + '>>', pg.img.rgb);
      obj(pg.smId, '<</Type/XObject/Subtype/Image/Width ' + pg.img.w + '/Height ' + pg.img.h + '/ColorSpace/DeviceGray/BitsPerComponent 8' + F + '>>', pg.img.al);
    }
  });
  const xref = len, count = offs.length;
  put('xref\n0 ' + count + '\n0000000000 65535 f \n' + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  put('trailer\n<</Size ' + count + '/Root 1 0 R/Info 3 0 R>>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
