// Grid image-processing primitives. All grids are square N×N, row-major.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function blurH(src, dst, N, r) {
  const inv = 1 / (2 * r + 1);
  const last = N - 1;
  for (let y = 0; y < N; y++) {
    const row = y * N;
    let acc = src[row] * (r + 1);
    for (let k = 1; k <= r; k++) acc += src[row + Math.min(k, last)];
    for (let x = 0; x < N; x++) {
      dst[row + x] = acc * inv;
      acc += src[row + Math.min(x + r + 1, last)] - src[row + Math.max(x - r, 0)];
    }
  }
}

function blurV(src, dst, N, r) {
  const inv = 1 / (2 * r + 1);
  const last = N - 1;
  for (let x = 0; x < N; x++) {
    let acc = src[x] * (r + 1);
    for (let k = 1; k <= r; k++) acc += src[Math.min(k, last) * N + x];
    for (let y = 0; y < N; y++) {
      dst[y * N + x] = acc * inv;
      acc += src[Math.min(y + r + 1, last) * N + x] - src[Math.max(y - r, 0) * N + x];
    }
  }
}

// 3-pass box blur ≈ gaussian. O(N²) regardless of radius.
export function boxBlur(src, N, radius, passes = 3) {
  const r = Math.max(1, Math.round(radius));
  const a = Float32Array.from(src);
  const b = new Float32Array(N * N);
  for (let p = 0; p < passes; p++) {
    blurH(a, b, N, r);
    blurV(b, a, N, r);
  }
  return a;
}

// Otsu threshold over values where mask[i] is truthy.
export function otsu(vals, mask) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < vals.length; i++) {
    if (!mask[i]) continue;
    const v = vals[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  if (!(mx > mn)) return mn;
  const B = 256, hist = new Float64Array(B), sc = (B - 1) / (mx - mn);
  let total = 0;
  for (let i = 0; i < vals.length; i++) {
    if (!mask[i]) continue;
    hist[((vals[i] - mn) * sc) | 0]++;
    total++;
  }
  let sum = 0;
  for (let i = 0; i < B; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0;
  for (let i = 0; i < B; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = i; }
  }
  return mn + (bestT + 0.5) / sc;
}

// 4-connected component labelling of cells where mask[i] === val.
export function label(mask, N, val) {
  const n = N * N;
  const lab = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes = [];
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (mask[s] !== val || lab[s] >= 0) continue;
    let sp = 0, size = 0;
    stack[sp++] = s;
    lab[s] = id;
    while (sp) {
      const c = stack[--sp];
      size++;
      const x = c % N;
      if (x > 0 && mask[c - 1] === val && lab[c - 1] < 0) { lab[c - 1] = id; stack[sp++] = c - 1; }
      if (x < N - 1 && mask[c + 1] === val && lab[c + 1] < 0) { lab[c + 1] = id; stack[sp++] = c + 1; }
      if (c >= N && mask[c - N] === val && lab[c - N] < 0) { lab[c - N] = id; stack[sp++] = c - N; }
      if (c < n - N && mask[c + N] === val && lab[c + N] < 0) { lab[c + N] = id; stack[sp++] = c + N; }
    }
    sizes.push(size);
    id++;
  }
  return { lab, sizes, count: id };
}

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher).
// Returns distance (in cells) from each cell to the nearest cell where feature[i] is truthy.
export function edt(feature, N) {
  const INF = 1e20;
  const n = N * N;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = feature[i] ? 0 : INF;
  const f = new Float64Array(N), d = new Float64Array(N);
  const v = new Int32Array(N), z = new Float64Array(N + 1);
  const pass = (get, set) => {
    for (let q = 0; q < N; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < N; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < N; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let q = 0; q < N; q++) set(q, d[q]);
  };
  for (let x = 0; x < N; x++) pass((q) => grid[q * N + x], (q, val) => { grid[q * N + x] = val; });
  for (let y = 0; y < N; y++) { const row = y * N; pass((q) => grid[row + q], (q, val) => { grid[row + q] = val; }); }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(Math.min(grid[i], 1e12));
  return out;
}

// Chaikin corner-cutting on an interleaved [x,y,w, x,y,w, ...] polyline.
export function chaikin(pts, stride, iterations = 2) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const m = p.length / stride;
    if (m < 3) return p;
    const out = [];
    for (let s = 0; s < stride; s++) out.push(p[s]);
    for (let i = 0; i < m - 1; i++) {
      for (let s = 0; s < stride; s++) out.push(0.75 * p[i * stride + s] + 0.25 * p[(i + 1) * stride + s]);
      for (let s = 0; s < stride; s++) out.push(0.25 * p[i * stride + s] + 0.75 * p[(i + 1) * stride + s]);
    }
    for (let s = 0; s < stride; s++) out.push(p[(m - 1) * stride + s]);
    p = out;
  }
  return p;
}
