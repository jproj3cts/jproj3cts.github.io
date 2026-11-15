// Draws generated world data onto a 2D canvas in an inked-parchment atlas style.
import { biomeAt, PALETTE, BIOME } from './gen/biomes.js';

const INK = '#3a2c1d';
const PAPER = '#efe2c2';
const HALO = 'rgba(241, 230, 202, 0.88)';
const SEA_INK = '#36606b';
export const SERIF = '"IM Fell English", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
export const SERIF_SC = '"IM Fell English SC", "IM Fell English", Georgia, serif';

const SEA_SHALLOW = [182, 208, 200];
const SEA_DEEP = [126, 162, 168];

export function renderMap(canvas, d, opts = {}) {
  const S = opts.size || 1200;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const N = d.N;
  const k = S / N;
  const u = S / 1200; // unit: 1px at 1200px output
  const P = (g) => (g + 0.5) * k; // grid → pixel

  drawRaster(ctx, d, S, k);
  vignette(ctx, S);

  // Ocean ripple lines (classic coastal hatching)
  const ripples = [
    [-0.16, 1.1, 0.5],
    [-0.3, 0.9, 0.32],
    [-0.46, 0.8, 0.18],
  ];
  for (const [lvl, w, a] of ripples) {
    strokeSegs(ctx, marchingSquares(d.H, N, lvl), P, `rgba(54, 96, 107, ${a})`, w * u);
  }
  // Coastline: soft wide underline then crisp ink
  const coast = marchingSquares(d.H, N, 0);
  strokeSegs(ctx, coast, P, 'rgba(58, 44, 29, 0.18)', 4.5 * u);
  strokeSegs(ctx, coast, P, INK, 1.7 * u);

  if (opts.roads !== false) drawSeaRoutes(ctx, d.seaRoutes || [], P, u);
  if (opts.rivers !== false) drawRivers(ctx, d.rivers, P, u);
  if (opts.roads !== false) drawRoads(ctx, d.roads, P, u);
  drawGlyphs(ctx, d.glyphs, P, u, S);

  // Reserve map furniture so labels avoid it.
  const boxes = [
    titleBox(ctx, d.title, d.subtitle, S, u),
    { x: S * 0.80, y: S * 0.79, w: S * 0.17, h: S * 0.18 }, // compass
    { x: S * 0.04, y: S * 0.9, w: S * 0.2, h: S * 0.06 }, // scale bar
  ];
  drawTowns(ctx, d.towns, P, u, S, boxes, opts.labels !== false);
  if (opts.labels !== false) {
    drawRegionLabels(ctx, d, P, u, S, boxes);
  }

  drawFrame(ctx, S, u);
  drawCompass(ctx, S * 0.885, S * 0.885, S * 0.062, u);
  drawScale(ctx, S * 0.065, S * 0.935, S * 0.13, u);
  if (opts.labels !== false) drawTitle(ctx, d.title, d.subtitle, S, u);
}

// ----------------------------------------------------------------------------- raster
function drawRaster(ctx, d, S, k) {
  const { N, H, M, T, shade, lake } = d;
  const img = ctx.createImageData(S, S);
  const px = img.data;
  const inv = 1 / k;
  const LAKE = PALETTE[BIOME.LAKE];
  const max = N - 1.0001;
  let o = 0;
  for (let py = 0; py < S; py++) {
    let gy = (py + 0.5) * inv - 0.5;
    gy = gy < 0 ? 0 : gy > max ? max : gy;
    const y0 = gy | 0, fy = gy - y0;
    for (let qx = 0; qx < S; qx++, o += 4) {
      let gx = (qx + 0.5) * inv - 0.5;
      gx = gx < 0 ? 0 : gx > max ? max : gx;
      const x0 = gx | 0, fx = gx - x0;
      const i = y0 * N + x0;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const h = H[i] * w00 + H[i + 1] * w10 + H[i + N] * w01 + H[i + N + 1] * w11;
      let r, g, b;
      if (h <= 0) {
        const li = (fy < 0.5 ? y0 : y0 + 1) * N + (fx < 0.5 ? x0 : x0 + 1);
        if (lake[li]) { r = LAKE[0]; g = LAKE[1]; b = LAKE[2]; }
        else {
          const t = Math.min(1, -h * 1.15);
          r = SEA_SHALLOW[0] + (SEA_DEEP[0] - SEA_SHALLOW[0]) * t;
          g = SEA_SHALLOW[1] + (SEA_DEEP[1] - SEA_SHALLOW[1]) * t;
          b = SEA_SHALLOW[2] + (SEA_DEEP[2] - SEA_SHALLOW[2]) * t;
        }
      } else {
        const m = M[i] * w00 + M[i + 1] * w10 + M[i + N] * w01 + M[i + N + 1] * w11;
        const t = T[i] * w00 + T[i + 1] * w10 + T[i + N] * w01 + T[i + N + 1] * w11;
        const s = shade[i] * w00 + shade[i + 1] * w10 + shade[i + N] * w01 + shade[i + N + 1] * w11;
        const c = PALETTE[biomeAt(h, m, t)];
        const sh = 0.78 + 0.24 * s;
        r = c[0] * sh; g = c[1] * sh; b = c[2] * sh;
      }
      // paper grain
      let hh = Math.imul(qx, 374761393) + Math.imul(py, 668265263);
      hh = Math.imul(hh ^ (hh >>> 13), 1274126177);
      const gr = (((hh >>> 24) & 255) - 128) * 0.05;
      px[o] = r + gr; px[o + 1] = g + gr; px[o + 2] = b + gr * 0.8; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function vignette(ctx, S) {
  ctx.save();
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, 'rgba(90, 60, 30, 0)');
  g.addColorStop(1, 'rgba(90, 60, 30, 0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}

// ----------------------------------------------------------------------------- contours
export function marchingSquares(F, N, level) {
  const segs = [];
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const i = y * N + x;
      const a = F[i] - level, b = F[i + 1] - level, c = F[i + N + 1] - level, d = F[i + N] - level;
      const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = () => [x + a / (a - b), y];
      const right = () => [x + 1, y + b / (b - c)];
      const bottom = () => [x + d / (d - c), y + 1];
      const left = () => [x, y + a / (a - d)];
      const seg = (p, q) => segs.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: seg(left(), bottom()); break;
        case 2: case 13: seg(bottom(), right()); break;
        case 3: case 12: seg(left(), right()); break;
        case 4: case 11: seg(top(), right()); break;
        case 6: case 9: seg(top(), bottom()); break;
        case 7: case 8: seg(top(), left()); break;
        case 5: {
          const ctr = (a + b + c + d) / 4;
          if (ctr > 0) { seg(top(), left()); seg(bottom(), right()); }
          else { seg(top(), right()); seg(left(), bottom()); }
          break;
        }
        case 10: {
          const ctr = (a + b + c + d) / 4;
          if (ctr > 0) { seg(top(), right()); seg(left(), bottom()); }
          else { seg(top(), left()); seg(bottom(), right()); }
          break;
        }
      }
    }
  }
  return segs;
}

function strokeSegs(ctx, segs, P, style, width) {
  ctx.save();
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let j = 0; j < segs.length; j += 4) {
    ctx.moveTo(P(segs[j]), P(segs[j + 1]));
    ctx.lineTo(P(segs[j + 2]), P(segs[j + 3]));
  }
  ctx.stroke();
  ctx.restore();
}

// ----------------------------------------------------------------------------- rivers & roads
function drawRivers(ctx, rivers, P, u) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // pale bank underlay, then the water line on top (tapers from source to mouth)
  for (const [style, extra] of [['rgba(236, 228, 200, 0.7)', 2.2], ['#3d6f8c', 0]]) {
    ctx.strokeStyle = style;
    for (const r of rivers) {
      for (let j = 0; j + 5 < r.length; j += 3) {
        ctx.lineWidth = (Math.min(5, r[j + 2] * 1.15) + extra) * u;
        ctx.beginPath();
        ctx.moveTo(P(r[j]), P(r[j + 1]));
        ctx.lineTo(P(r[j + 3]), P(r[j + 4]));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function polyline(ctx, r, P) {
  ctx.beginPath();
  ctx.moveTo(P(r[0]), P(r[1]));
  for (let j = 3; j < r.length; j += 3) ctx.lineTo(P(r[j]), P(r[j + 1]));
}

function drawRoads(ctx, roads, P, u) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(241, 230, 202, 0.75)';
  ctx.lineWidth = 3.6 * u;
  for (const r of roads) { polyline(ctx, r, P); ctx.stroke(); }
  ctx.strokeStyle = '#8a3f22';
  ctx.lineWidth = 1.7 * u;
  ctx.setLineDash([6 * u, 3.5 * u]);
  for (const r of roads) { polyline(ctx, r, P); ctx.stroke(); }
  ctx.restore();
}

function drawSeaRoutes(ctx, routes, P, u) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(58, 44, 29, 0.55)';
  ctx.lineWidth = 1.4 * u;
  ctx.setLineDash([1.5 * u, 6 * u]);
  for (const r of routes) { polyline(ctx, r, P); ctx.stroke(); }
  ctx.restore();
}

// ----------------------------------------------------------------------------- glyphs
function drawGlyphs(ctx, glyphs, P, u, S) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const g of glyphs) {
    const x = P(g.x), y = P(g.y);
    switch (g.t) {
      case 'm': mountain(ctx, x, y, S * 0.03 * g.s, g.snow, u); break;
      case 'h': hill(ctx, x, y, S * 0.017 * g.s, u); break;
      case 'td': tree(ctx, x, y, S * 0.0052 * g.s, '#7f9a5a', u); break;
      case 'tj': tree(ctx, x, y, S * 0.0058 * g.s, '#5f8247', u); break;
      case 'tc': conifer(ctx, x, y, S * 0.0055 * g.s, u); break;
      case 'sw': marsh(ctx, x, y, S * 0.006 * g.s, u); break;
      case 'dn': dune(ctx, x, y, S * 0.01 * g.s, u); break;
    }
  }
  ctx.restore();
}

function mountain(ctx, x, y, w, snow, u) {
  const h = w * 0.78;
  const px = x - w * 0.06, py = y - h;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y); ctx.lineTo(px, py); ctx.lineTo(x + w / 2, y); ctx.closePath();
  ctx.fillStyle = '#eee1c0';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.04, y);
  ctx.lineTo(px + w * 0.1, y - h * 0.45); ctx.lineTo(px + w * 0.02, y - h * 0.7); ctx.closePath();
  ctx.fillStyle = '#b39a72';
  ctx.fill();
  if (snow) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - w * 0.17, py + h * 0.3);
    ctx.lineTo(px - w * 0.07, py + h * 0.24);
    ctx.lineTo(px + w * 0.01, py + h * 0.33);
    ctx.lineTo(px + w * 0.08, py + h * 0.25);
    ctx.lineTo(px + w * 0.17, py + h * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#fbf9f2';
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(0.9 * u, w * 0.045);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y); ctx.lineTo(px, py); ctx.lineTo(x + w / 2, y);
  ctx.stroke();
  // a few hatch strokes on the shaded flank
  ctx.lineWidth = Math.max(0.6 * u, w * 0.025);
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) {
    const t = k / 4.2;
    const ax = px + (x + w / 2 - px) * t, ay = py + (y - py) * t;
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - w * 0.1, ay + h * 0.2);
  }
  ctx.stroke();
}

function hill(ctx, x, y, w, u) {
  ctx.fillStyle = 'rgba(160, 135, 95, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.08, y, w * 0.48, w * 0.28, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1 * u;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, w * 0.32, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
}

function tree(ctx, x, y, r, color, u) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8 * u;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.2); ctx.lineTo(x, y + r * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
}

function conifer(ctx, x, y, r, u) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2.6); ctx.lineTo(x - r, y); ctx.lineTo(x + r, y); ctx.closePath();
  ctx.fillStyle = '#6a8a62';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8 * u;
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + r * 0.5); ctx.stroke();
}

function marsh(ctx, x, y, r, u) {
  ctx.strokeStyle = 'rgba(58, 80, 60, 0.85)';
  ctx.lineWidth = 0.9 * u;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.2, y); ctx.lineTo(x + r * 1.2, y);
  ctx.moveTo(x, y); ctx.lineTo(x, y - r * 1.1);
  ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 0.8, y - r * 0.8);
  ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 0.8, y - r * 0.8);
  ctx.stroke();
}

function dune(ctx, x, y, w, u) {
  ctx.strokeStyle = 'rgba(150, 110, 60, 0.7)';
  ctx.lineWidth = 0.9 * u;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y);
  ctx.quadraticCurveTo(x - w * 0.1, y - w * 0.45, x + w * 0.6, y);
  ctx.stroke();
}

// ----------------------------------------------------------------------------- text helpers
function spacedWidth(ctx, text, sp) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + sp;
  return w - sp;
}

function drawText(ctx, text, x, y, { font, color = INK, sp = 0, halo = true, align = 'center' }) {
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const w = sp ? spacedWidth(ctx, text, sp) : ctx.measureText(text).width;
  let sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const draw = (fn) => {
    if (!sp) { ctx.textAlign = 'left'; fn(text, sx, y); return; }
    let cx = sx;
    ctx.textAlign = 'left';
    for (const ch of text) { fn(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  };
  if (halo) {
    ctx.strokeStyle = HALO;
    ctx.lineWidth = Math.max(2, parseFloat(font.match(/([\d.]+)px/)[1]) * 0.28);
    ctx.lineJoin = 'round';
    draw((t, a, b) => ctx.strokeText(t, a, b));
  }
  ctx.fillStyle = color;
  draw((t, a, b) => ctx.fillText(t, a, b));
  ctx.restore();
  return w;
}

function measure(ctx, text, font, sp) {
  ctx.save();
  ctx.font = font;
  const w = sp ? spacedWidth(ctx, text, sp) : ctx.measureText(text).width;
  ctx.restore();
  return w;
}

const overlaps = (a, boxes) => boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
const inBounds = (a, S) => a.x > S * 0.03 && a.y > S * 0.03 && a.x + a.w < S * 0.97 && a.y + a.h < S * 0.97;

// ----------------------------------------------------------------------------- towns
function drawTowns(ctx, towns, P, u, S, boxes, labels) {
  const order = [...towns].sort((a, b) => rank(b.kind) - rank(a.kind));
  // markers first (and reserve their space)
  for (const t of order) {
    const x = P(t.x), y = P(t.y);
    const r = (t.kind === 'capital' ? 7 : t.kind === 'city' ? 5.2 : 3) * u;
    boxes.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
    ctx.save();
    ctx.lineWidth = 1.4 * u;
    ctx.strokeStyle = INK;
    if (t.kind === 'capital') {
      ctx.fillStyle = '#9c2f1f';
      star(ctx, x, y, r * 1.25, r * 0.55, 5);
      ctx.fill(); ctx.stroke();
    } else if (t.kind === 'city') {
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (!labels) return;
  for (const t of order) {
    const x = P(t.x), y = P(t.y);
    const fs = (t.kind === 'capital' ? 22 : t.kind === 'city' ? 18.5 : 15) * u;
    const font = `${t.kind === 'capital' ? 'bold ' : ''}${fs}px ${t.kind === 'town' ? SERIF : SERIF_SC}`;
    const w = measure(ctx, t.name, font, 0);
    const h = fs * 1.05;
    const gap = 9 * u;
    const opts = [
      [x + gap, y - h / 2, 'left'],
      [x - gap - w, y - h / 2, 'left'],
      [x - w / 2, y - gap - h, 'left'],
      [x - w / 2, y + gap, 'left'],
      [x + gap * 0.7, y - h - gap * 0.4, 'left'],
      [x + gap * 0.7, y + gap * 0.4, 'left'],
    ];
    for (const [bx, by] of opts) {
      const box = { x: bx, y: by, w, h };
      if (inBounds(box, S) && !overlaps(box, boxes)) {
        boxes.push(box);
        drawText(ctx, t.name, bx, by + h / 2, { font, align: 'left' });
        break;
      }
    }
  }
}
const rank = (k) => (k === 'capital' ? 2 : k === 'city' ? 1 : 0);

function star(ctx, x, y, R, r, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    const rad = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

// ----------------------------------------------------------------------------- region labels
function drawRegionLabels(ctx, d, P, u, S, boxes) {
  const N = d.N;
  const place = (text, x, y, font, sp, color, shifts) => {
    const w = measure(ctx, text, font, sp);
    const h = parseFloat(font.match(/([\d.]+)px/)[1]) * 1.1;
    for (const [dx, dy] of shifts) {
      const box = { x: x + dx - w / 2, y: y + dy - h / 2, w, h };
      if (inBounds(box, S) && !overlaps(box, boxes)) {
        boxes.push(box);
        drawText(ctx, text, x + dx, y + dy, { font, sp, color });
        return true;
      }
    }
    return false;
  };
  const shifts = (step) => [[0, 0], [0, -step], [0, step], [-step * 2, 0], [step * 2, 0], [0, -step * 2], [0, step * 2]];

  for (const isl of d.islandLabels) {
    const big = Math.sqrt(isl.area) / N;
    const fs = Math.min(36, 17 + big * 70) * u;
    const text = isl.name.toUpperCase();
    place(text, P(isl.x), P(isl.y), `${fs}px ${SERIF_SC}`, fs * 0.28, 'rgba(58, 44, 29, 0.9)', shifts(fs));
  }
  for (const s of d.seaLabels) {
    const fs = 25 * u;
    place(s.name, P(s.x), P(s.y), `italic ${fs}px ${SERIF}`, fs * 0.22, SEA_INK, shifts(fs));
  }
  for (const l of d.lakeLabels) {
    const fs = 15 * u;
    place(l.name, P(l.x), P(l.y), `italic ${fs}px ${SERIF}`, fs * 0.1, SEA_INK, shifts(fs));
  }
}

// ----------------------------------------------------------------------------- furniture
function drawFrame(ctx, S, u) {
  const m = S * 0.014, t = S * 0.012;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2 * u;
  ctx.strokeRect(m, m, S - 2 * m, S - 2 * m);
  ctx.lineWidth = 1 * u;
  ctx.strokeRect(m + t, m + t, S - 2 * (m + t), S - 2 * (m + t));
  // alternating neatline ticks
  const segs = 24;
  const len = (S - 2 * m) / segs;
  ctx.fillStyle = INK;
  for (let i = 0; i < segs; i++) {
    if (i % 2) continue;
    const a = m + i * len;
    ctx.fillRect(a, m, len, t);
    ctx.fillRect(a, S - m - t, len, t);
    ctx.fillRect(m, a, t, len);
    ctx.fillRect(S - m - t, a, t, len);
  }
  ctx.restore();
  // outer paper margin
  ctx.save();
  ctx.fillStyle = '#e6d5ae';
  ctx.fillRect(0, 0, S, m);
  ctx.fillRect(0, S - m, S, m);
  ctx.fillRect(0, 0, m, S);
  ctx.fillRect(S - m, 0, m, S);
  ctx.restore();
}

function drawCompass(ctx, cx, cy, R, u) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1 * u;
  ctx.fillStyle = 'rgba(239, 226, 194, 0.75)';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2); ctx.stroke();
  const point = (ang, len, wid) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa, py = ca;
    const tip = [ca * len, sa * len];
    const l = [px * wid, py * wid];
    const r = [-px * wid, -py * wid];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...l); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...r); ctx.closePath();
    ctx.fillStyle = PAPER; ctx.fill(); ctx.stroke();
  };
  for (let i = 0; i < 4; i++) point(Math.PI / 4 + (i * Math.PI) / 2, R * 0.6, R * 0.09);
  for (let i = 0; i < 4; i++) point(-Math.PI / 2 + (i * Math.PI) / 2, R, R * 0.14);
  drawText(ctx, 'N', 0, -R * 1.2, { font: `bold ${R * 0.32}px ${SERIF}`, halo: true });
  ctx.restore();
}

function drawScale(ctx, x, y, len, u) {
  ctx.save();
  const h = 5 * u;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1 * u;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? PAPER : INK;
    ctx.fillRect(x + (i * len) / 4, y, len / 4, h);
  }
  ctx.strokeRect(x, y, len, h);
  ctx.restore();
  drawText(ctx, '0', x, y - 9 * u, { font: `${12 * u}px ${SERIF}` });
  drawText(ctx, '100 leagues', x + len, y - 9 * u, { font: `italic ${12 * u}px ${SERIF}` });
}

function titleMetrics(ctx, title, subtitle, S, u) {
  const fs = 34 * u;
  const font = `${fs}px ${SERIF_SC}`;
  const sfont = `italic ${15 * u}px ${SERIF}`;
  const tw = Math.max(measure(ctx, title, font, fs * 0.08), measure(ctx, subtitle, sfont, 0));
  const w = tw + 70 * u, h = 72 * u;
  return { fs, font, sfont, w, h, x: S / 2 - w / 2, y: S * 0.034 };
}

function titleBox(ctx, title, subtitle, S, u) {
  const m = titleMetrics(ctx, title, subtitle, S, u);
  return { x: m.x - 34 * u, y: m.y, w: m.w + 68 * u, h: m.h + 6 * u };
}

function drawTitle(ctx, title, subtitle, S, u) {
  const { fs, font, sfont, w, h, x, y } = titleMetrics(ctx, title, subtitle, S, u);
  ctx.save();
  // banner tails
  ctx.fillStyle = '#e2cfa3';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4 * u;
  for (const side of [-1, 1]) {
    const bx = side < 0 ? x - 28 * u : x + w;
    ctx.beginPath();
    if (side < 0) {
      ctx.moveTo(x, y + 12 * u); ctx.lineTo(bx, y + 12 * u); ctx.lineTo(bx + 12 * u, y + h / 2 + 6 * u);
      ctx.lineTo(bx, y + h); ctx.lineTo(x, y + h);
    } else {
      ctx.moveTo(x + w, y + 12 * u); ctx.lineTo(bx + 28 * u, y + 12 * u); ctx.lineTo(bx + 16 * u, y + h / 2 + 6 * u);
      ctx.lineTo(bx + 28 * u, y + h); ctx.lineTo(x + w, y + h);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = '#f1e5c6';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 0.8 * u;
  ctx.strokeRect(x + 4 * u, y + 4 * u, w - 8 * u, h - 8 * u);
  ctx.restore();
  drawText(ctx, title, S / 2, y + h * 0.4, { font, sp: fs * 0.08, halo: false });
  drawText(ctx, subtitle, S / 2, y + h * 0.76, { font: sfont, halo: false, color: '#5a4630' });
}
