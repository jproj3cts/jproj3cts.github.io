// Find the surface of the drink in a photo: a circle where the liquid meets the cup/glass rim.
//
// 1. Sobel gradients on a small greyscale copy (~256px).
// 2. Hough-style centre voting: every strong edge pixel votes along its gradient line
//    (both directions) for all plausible radii.
// 3. For the best few centres, build a radial profile: for each radius, what fraction of the
//    circle has a consistent edge where it gets *brighter going outward* (dark liquid inside,
//    lighter rim / foam ring / cup outside).
// 4. Prefer the largest well-supported such circle (the liquid edge rather than inner rings),
//    falling back to the strongest edge of either polarity.
//
// Input: grey Float32Array (0..1), width, height. Output: { x, y, r } normalised like the crop
// UI (x / w, y / h, r / min(w, h)) plus a confidence score, or null.

export function findRim(grey, w, h) {
  const n = w * h;
  const minDim = Math.min(w, h);
  const rMin = Math.round(minDim * 0.18);
  const rMax = Math.round(minDim * 0.62);

  // light blur, then Sobel
  const g = blur3(grey, w, h);
  const gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1];
      const d = g[i - 1], f = g[i + 1];
      const p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
      const sx = c + 2 * f + r - a - 2 * d - p;
      const sy = p + 2 * q + r - a - 2 * b - c;
      gx[i] = sx; gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  }
  const thr = percentile(mag, 0.88);
  if (!(thr > 0.02)) return null;

  // centre voting
  const acc = new Float32Array(n);
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < thr) continue;
      const ux = gx[i] / m, uy = gy[i] / m;
      const wt = Math.min(m / thr, 3);
      for (let r = rMin; r <= rMax; r += 1) {
        for (const s of [1, -1]) {
          const cx = Math.round(x + s * ux * r), cy = Math.round(y + s * uy * r);
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
          acc[cy * w + cx] += wt;
        }
      }
    }
  }
  const accB = blur3(blur3(acc, w, h), w, h);
  const centres = peaks(accB, w, h, 6, minDim * 0.06);
  if (!centres.length) return null;

  // radial profiles
  const A = 180;
  const cosT = new Float32Array(A), sinT = new Float32Array(A);
  for (let k = 0; k < A; k++) { cosT[k] = Math.cos((2 * Math.PI * k) / A); sinT[k] = Math.sin((2 * Math.PI * k) / A); }
  const edgeT = thr * 0.6;
  const rLimit = Math.round(minDim * 0.75);
  const pos = new Float32Array(rLimit + 2), any = new Float32Array(rLimit + 2);
  const evaluate = (cx, cy) => {
    let top = null;
    pos.fill(0); any.fill(0);
    for (let r = rMin; r <= rLimit; r++) {
      let inImg = 0, sp = 0, sa = 0;
      for (let k = 0; k < A; k++) {
        const x = Math.round(cx + cosT[k] * r), y = Math.round(cy + sinT[k] * r);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        inImg++;
        // strongest radial gradient within ±1px (tolerates slight ellipse / perspective)
        let bestS = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const xx = Math.round(cx + cosT[k] * (r + dr)), yy = Math.round(cy + sinT[k] * (r + dr));
          if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
          const i = yy * w + xx;
          const s = gx[i] * cosT[k] + gy[i] * sinT[k];
          if (Math.abs(s) > Math.abs(bestS)) bestS = s;
        }
        if (bestS > edgeT) sp++;
        if (Math.abs(bestS) > edgeT) sa++;
      }
      if (inImg < A * 0.45) continue; // mostly off-screen: not trustworthy
      const denom = Math.max(inImg, A * 0.7);
      const sPos = sp / denom, sAny = sa / denom;
      // prefer larger circles (the liquid edge, not inner rings / glints)
      const score = Math.max(sPos, sAny * 0.75) * Math.pow(r / minDim, 0.6);
      if (!top || score > top.score) top = { x: cx, y: cy, r, score, support: Math.max(sPos, sAny) };
    }
    return top;
  };

  // coarse pass on every centre, then refine the two best on a small neighbourhood
  const coarse = centres.map((c) => evaluate(c.x, c.y)).filter(Boolean).sort((a, b) => b.score - a.score);
  let best = coarse[0] || null;
  for (const c of coarse.slice(0, 2)) {
    for (let oy = -2; oy <= 2; oy += 2) {
      for (let ox = -2; ox <= 2; ox += 2) {
        if (!ox && !oy) continue;
        const e = evaluate(c.x + ox, c.y + oy);
        if (e && e.score > best.score) best = e;
      }
    }
  }
  if (!best || best.support < 0.25) return null;
  return {
    x: best.x / w,
    y: best.y / h,
    r: (best.r * 0.97) / minDim, // pull in slightly so the rim itself stays out
    confidence: best.support,
  };
}

function blur3(src, w, h) {
  const out = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      tmp[i] = (src[i - (x > 0 ? 1 : 0)] + src[i] * 2 + src[i + (x < w - 1 ? 1 : 0)]) / 4;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = (tmp[i - (y > 0 ? w : 0)] + tmp[i] * 2 + tmp[i + (y < h - 1 ? w : 0)]) / 4;
    }
  }
  return out;
}

function percentile(arr, q) {
  const s = Float32Array.from(arr).sort();
  return s[Math.floor(q * (s.length - 1))];
}

function peaks(acc, w, h, k, minDist) {
  const cands = [];
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x, v = acc[i];
      if (v <= 0) continue;
      if (v >= acc[i - 1] && v >= acc[i + 1] && v >= acc[i - w] && v >= acc[i + w]) cands.push({ x, y, v });
    }
  }
  cands.sort((a, b) => b.v - a.v);
  const out = [];
  for (const c of cands) {
    if (out.length >= k) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < minDist)) continue;
    out.push(c);
  }
  return out;
}
