// Photo → fantasy world. Pure data in, pure data out (runs inside a Web Worker).
//
//  1. segment   : luminance → glare removal → background flattening → smoothing → Otsu threshold
//  2. cleanup   : drop specks, fill pinholes, find islands / lakes
//  3. terrain   : distance-to-coast + ridged noise + foam brightness → elevation; moisture; temperature; hillshade
//  4. rivers    : priority-flood depression filling → steepest descent → flow accumulation → traced polylines
//  5. towns     : score cells (harbours, river mouths, flat fertile land) → greedy spaced placement
//  6. roads     : MST per island, A* over a slope-aware cost grid
//  7. glyphs    : mountains / hills / trees placed by jittered grid sampling
//  8. names     : islands, seas, lakes, towns, title

import { mulberry32, hashBytes, shuffle } from './rng.js';
import { makeNoise2D, fbm, ridged } from './noise.js';
import { boxBlur, otsu, label, edt, smoothstep, clamp, chaikin } from './imageproc.js';
import { MinHeap } from './heap.js';
import { biomeAt, BIOME } from './biomes.js';
import { NameGen, LANG_COUNT } from './names.js';

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DD = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export function generate(rgba, N, params = {}) {
  const p = {
    land: 0, // -1.5..1.5 : shifts threshold; + means more land
    smoothing: 2, // 0..6
    roughness: 0.6, // 0..1 mountain intensity
    coast: 0.7, // 0..1 coastline ruggedness
    invert: false,
    seedOffset: 0,
    drink: 'auto',
    ...params,
  };
  const timings = {};
  let t0 = performance.now();
  const lap = (name) => { const t = performance.now(); timings[name] = Math.round(t - t0); t0 = t; };

  const seed = (hashBytes(rgba) ^ Math.imul(p.seedOffset + 1, 0x9e3779b1)) >>> 0;
  const rng = mulberry32(seed);
  const noise = makeNoise2D(rng);

  const seg = segment(rgba, N, p); lap('segment');
  roughenCoast(seg.f, seg.rr, N, noise, p.coast); lap('roughen');
  const geo = cleanup(seg.f, seg.rr, N); lap('cleanup');
  const terr = terrain(N, seg.f, seg.rr, geo, noise, p); lap('terrain');
  const hyd = rivers(N, terr, geo, rng); lap('rivers');
  const towns = settlements(N, terr, geo, hyd, seg.rr, rng); lap('towns');
  const { roads, seaRoutes } = buildRoads(N, terr, geo, hyd, towns); lap('roads');
  const glyphs = placeGlyphs(N, terr, geo, hyd, seg.rr, towns, rng); lap('glyphs');
  const drink = p.drink === 'auto' ? guessDrink(seg.stats) : p.drink;
  const labels = nameWorld(N, terr, geo, towns, seg.rr, rng, drink); lap('names');

  return {
    N,
    seed,
    drink,
    H: terr.H, M: terr.M, T: terr.T, shade: terr.shade,
    land: geo.land, lake: geo.lake,
    rivers: hyd.rivers,
    roads,
    seaRoutes,
    glyphs,
    towns,
    ...labels,
    stats: {
      landPct: Math.round((100 * geo.landArea) / (Math.PI * (N / 2) ** 2)),
      islands: geo.islands.length,
      towns: towns.length,
      rivers: hyd.rivers.length,
      timings,
    },
  };
}

// ---------------------------------------------------------------------------- 1. segmentation
function segment(rgba, N, p) {
  const n = N * N, c = (N - 1) / 2, R = N / 2;
  const L = new Float32Array(n), W = new Float32Array(n), rr = new Float32Array(n);
  let sr = 0, sg = 0, sb = 0, cnt = 0, sl = 0, wc = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const r = Math.hypot((x - c) / R, (y - c) / R);
      rr[i] = r;
      const o = i * 4;
      const Rv = rgba[o] / 255, Gv = rgba[o + 1] / 255, Bv = rgba[o + 2] / 255;
      const l = 0.299 * Rv + 0.587 * Gv + 0.114 * Bv;
      L[i] = l;
      const inside = r < 1 && rgba[o + 3] > 127;
      const mx = Math.max(Rv, Gv, Bv), mn = Math.min(Rv, Gv, Bv);
      const glare = l > 0.9 && mx - mn < 0.12; // specular highlights: near-white & unsaturated
      W[i] = inside && !glare ? 1 : 0;
      if (W[i]) { sl += l; wc++; }
      if (inside && r < 0.9) { sr += Rv; sg += Gv; sb += Bv; cnt++; }
    }
  }
  const meanL = wc ? sl / wc : 0.5;

  // Inpaint glare + outside-of-disk with a normalized convolution so they don't read as foam.
  const LW = new Float32Array(n);
  for (let i = 0; i < n; i++) LW[i] = L[i] * W[i];
  const rFill = Math.max(2, N / 40);
  const nb = boxBlur(LW, N, rFill), wb = boxBlur(W, N, rFill);
  for (let i = 0; i < n; i++) {
    if (!W[i]) { L[i] = wb[i] > 0.02 ? nb[i] / wb[i] : meanL; LW[i] = L[i] * 0.5; }
  }

  // Flatten uneven lighting: subtract a large-radius (masked) background.
  const rBg = N / 7;
  const W2 = new Float32Array(n);
  for (let i = 0; i < n; i++) W2[i] = W[i] ? 1 : 0.5;
  const bgN = boxBlur(LW, N, rBg), bgW = boxBlur(W2, N, rBg);
  let s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = L[i] - 0.85 * (bgW[i] > 0.02 ? bgN[i] / bgW[i] : meanL);

  // Smoothing controls how intricate coastlines are.
  const rad = p.smoothing * (N / 384);
  if (rad >= 0.5) s = boxBlur(s, N, rad);
  if (p.invert) for (let i = 0; i < n; i++) s[i] = -s[i];

  const inner = new Uint8Array(n);
  let m = 0, m2 = 0, k = 0;
  for (let i = 0; i < n; i++) {
    if (rr[i] < 0.85) { inner[i] = 1; m += s[i]; m2 += s[i] * s[i]; k++; }
  }
  m /= k;
  const std = Math.sqrt(Math.max(1e-8, m2 / k - m * m));
  const t = otsu(s, inner);

  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = (s[i] - t) / std + p.land * 0.6;
    v -= 4 * smoothstep(0.8, 0.97, rr[i]); // keep land off the rim (foam rings hug the glass)
    if (rr[i] >= 0.99) v = Math.min(v, -1);
    f[i] = v;
  }
  return { f, rr, stats: { r: sr / cnt, g: sg / cnt, b: sb / cnt, luma: meanL } };
}

function guessDrink({ r, g, b, luma }) {
  // Beer is redder/yellower than coffee: (coffee crema ≈ warm 0.2, b/r 0.56; ale ≈ warm 0.38, b/r 0.44)
  const warm = (r - g) / Math.max(r, 0.01);
  if (warm > 0.3 || b / Math.max(r, 0.01) < 0.38) return 'beer';
  if (luma < 0.55) return 'coffee';
  return 'other';
}

// ---------------------------------------------------------------------------- 1b. rough coastlines
// The photo's foam edges are smooth blobs; real coastlines are fractal. Domain-warp the field
// (bays, headlands, fjord-ish wiggles) and add fine multi-octave noise (rocky detail).
// Only the zero-crossing matters, so this mostly affects cells near the coast.
function roughenCoast(f, rr, N, noise, amount) {
  if (amount <= 0) return;
  const n = N * N;
  const src = Float32Array.from(f);
  const warp = amount * N * 0.022; // up to ~7 cells at N=384
  const last = N - 1.001;
  for (let y = 0; y < N; y++) {
    const ny = y / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (rr[i] >= 0.99) continue;
      const nx = x / N;
      // domain warp
      const wx = fbm(noise, nx * 6 + 101.3, ny * 6 + 17.9, 3) * warp;
      const wy = fbm(noise, nx * 6 + 33.1, ny * 6 + 205.7, 3) * warp;
      let sx = x + wx, sy = y + wy;
      sx = sx < 0 ? 0 : sx > last ? last : sx;
      sy = sy < 0 ? 0 : sy > last ? last : sy;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, j = y0 * N + x0;
      let v = src[j] * (1 - fx) * (1 - fy) + src[j + 1] * fx * (1 - fy) + src[j + N] * (1 - fx) * fy + src[j + N + 1] * fx * fy;
      // fine rocky detail, strongest right at the shoreline
      const near = Math.exp(-Math.abs(v) * 1.5);
      v += amount * near * (0.8 * fbm(noise, nx * 26 + 7.7, ny * 26 + 3.3, 4) + 0.4 * noise(nx * 75 + 1.1, ny * 75 + 9.4));
      // keep the rim fade intact
      f[i] = rr[i] > 0.8 ? Math.min(v, src[i] + 0.3) : v;
    }
  }
}

// ---------------------------------------------------------------------------- 2. cleanup
function cleanup(f, rr, N) {
  const n = N * N;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = f[i] > 0 ? 1 : 0;

  const minIsland = Math.max(8, Math.round(n * 0.00035));
  const L1 = label(land, N, 1);
  for (let i = 0; i < n; i++) {
    if (land[i] && L1.sizes[L1.lab[i]] < minIsland) { land[i] = 0; f[i] = Math.min(f[i], -0.02); }
  }

  const Wl = label(land, N, 0);
  const isSea = new Uint8Array(Wl.count);
  for (let i = 0; i < n; i++) if (!land[i] && rr[i] > 0.97) isSea[Wl.lab[i]] = 1;
  const minLake = Math.round(n * 0.0008);
  const lake = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (land[i]) continue;
    const id = Wl.lab[i];
    if (isSea[id]) continue;
    if (Wl.sizes[id] < minLake) { land[i] = 1; f[i] = Math.max(f[i], 0.02); } else lake[i] = 1;
  }

  const I = label(land, N, 1);
  const islands = [];
  for (let id = 0; id < I.count; id++) islands.push({ id, area: I.sizes[id], pole: -1, maxD: 0, lang: 0 });
  let landArea = 0;
  for (let i = 0; i < n; i++) landArea += land[i];
  return { land, lake, islandLab: I.lab, islands, landArea };
}

// ---------------------------------------------------------------------------- 3. terrain
function terrain(N, f, rr, geo, noise, p) {
  const n = N * N;
  const { land, islandLab, islands } = geo;
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = land[i] ? 0 : 1;
  const dl = edt(water, N); // land cells: distance to nearest water
  const ds = edt(land, N); // water cells: distance to nearest land

  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    const isl = islands[islandLab[i]];
    if (dl[i] > isl.maxD) { isl.maxD = dl[i]; isl.pole = i; }
  }

  const H = new Float32Array(n), M = new Float32Array(n), T = new Float32Array(n);
  const rough = p.roughness;
  let hmax = 0;
  for (let y = 0; y < N; y++) {
    const ny = y / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x, nx = x / N;
      const fb = fbm(noise, nx * 5 + 3.1, ny * 5 + 1.7, 4);
      let h;
      if (land[i]) {
        const isl = islands[islandLab[i]];
        const dn = dl[i] / Math.max(1, isl.maxD);
        const sizeF = clamp(0.3 + Math.sqrt(isl.area) / (N * 0.2), 0.3, 1);
        const inland = smoothstep(0.08, 0.5, dn);
        const rid = ridged(noise, nx * 4.5 + 7.3, ny * 4.5 + 2.9, 4);
        const img = clamp(f[i] * 0.05, 0, 0.12);
        h = 0.03 + 0.4 * Math.pow(dn, 0.85) * sizeF + inland * sizeF * rough * 0.6 * rid + 0.07 * fb * inland + img;
        if (dl[i] < 1.5) h = clamp(f[i] * 0.1, 0.002, 0.03); // coastline follows the smooth photo field
        if (h > hmax) hmax = h;
      } else {
        h = -(1 - Math.exp(-ds[i] / (N * 0.035))) * (0.92 + 0.08 * fb);
        if (ds[i] < 1.5) h = clamp(f[i] * 0.1, -0.03, -0.002);
      }
      H[i] = h;
      const m0 = fbm(noise, nx * 2.5 + 40.2, ny * 2.5 + 40.7, 4);
      M[i] = land[i]
        ? clamp(0.5 + 0.6 * m0 + 0.18 * Math.exp(-dl[i] / (N * 0.04)) - 0.2 * Math.max(0, h - 0.45), 0, 1)
        : 0.6;
    }
  }
  if (hmax > 1) for (let i = 0; i < n; i++) if (H[i] > 0.03) H[i] = 0.03 + (H[i] - 0.03) / ((hmax - 0.03) / 0.97);

  for (let y = 0; y < N; y++) {
    const ny = y / N;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      T[i] = clamp(0.82 - 0.4 * ny - 0.8 * Math.max(0, H[i] - 0.3) + 0.12 * fbm(noise, x / N * 3 + 80, ny * 3 + 80, 3), 0, 1);
    }
  }

  // Hillshade (light from the north-west).
  const shade = new Float32Array(n).fill(1);
  const E = N * 0.11;
  const lx = -0.55, ly = -0.55, lz = 0.63;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (!land[i]) continue;
      const gx = (Math.max(0, H[i + 1]) - Math.max(0, H[i - 1])) * 0.5 * E;
      const gy = (Math.max(0, H[i + N]) - Math.max(0, H[i - N])) * 0.5 * E;
      const len = Math.hypot(gx, gy, 1);
      shade[i] = clamp(((-gx * lx - gy * ly + lz) / len) / lz, 0.25, 1.5);
    }
  }
  return { H, M, T, shade, dl, ds };
}

// ---------------------------------------------------------------------------- 4. rivers
function rivers(N, terr, geo, rng) {
  const n = N * N;
  const { H, M } = terr;
  const { land } = geo;
  const Z = Float32Array.from(H);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(Math.max(1024, geo.landArea));
  const order = new Int32Array(geo.landArea);
  let on = 0;

  for (let i = 0; i < n; i++) {
    if (!land[i]) { closed[i] = 1; continue; }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!land[i]) continue;
      for (let k = 0; k < 8; k++) {
        const xx = x + DX[k], yy = y + DY[k];
        if (xx < 0 || yy < 0 || xx >= N || yy >= N || !land[yy * N + xx]) {
          closed[i] = 1; heap.push(Z[i], i); break;
        }
      }
    }
  }
  // Priority-flood: guarantees every land cell drains to the sea.
  while (heap.n) {
    const c = heap.pop();
    order[on++] = c;
    const x = c % N, y = (c / N) | 0;
    for (let k = 0; k < 8; k++) {
      const xx = x + DX[k], yy = y + DY[k];
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const nb = yy * N + xx;
      if (closed[nb]) continue;
      closed[nb] = 1;
      Z[nb] = Math.max(H[nb], Z[c] + 1e-5);
      heap.push(Z[nb], nb);
    }
  }

  const down = new Int32Array(n).fill(-1);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!land[i]) continue;
      let best = -1, bs = 0;
      for (let k = 0; k < 8; k++) {
        const xx = x + DX[k], yy = y + DY[k];
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const nb = yy * N + xx;
        const zz = land[nb] ? Z[nb] : -1;
        const sl = (Z[i] - zz) / DD[k];
        if (sl > bs) { bs = sl; best = nb; }
      }
      down[i] = best;
    }
  }

  const acc = new Float32Array(n);
  for (let j = on - 1; j >= 0; j--) {
    const c = order[j];
    acc[c] += 0.3 + M[c];
    const d = down[c];
    if (d >= 0 && land[d]) acc[d] += acc[c];
  }

  // Global threshold, lowered per island so every decent-sized island gets at least one river.
  const T = n * 0.0005;
  const { islandLab, islands } = geo;
  const islMax = new Float32Array(islands.length);
  for (let i = 0; i < n; i++) if (land[i] && acc[i] > islMax[islandLab[i]]) islMax[islandLab[i]] = acc[i];
  const islT = islands.map((isl, k) => (isl.area >= n * 0.0015 ? Math.min(T, islMax[k] * 0.3) : T));
  const river = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (land[i] && acc[i] >= islT[islandLab[i]]) river[i] = 1;

  const hasUp = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (river[i] && down[i] >= 0 && land[down[i]]) hasUp[down[i]] = 1;
  const visited = new Uint8Array(n);
  const out = [];
  for (let j = on - 1; j >= 0; j--) {
    const head = order[j];
    if (!river[head] || hasUp[head]) continue;
    const pts = [];
    let c = head;
    for (;;) {
      pts.push(c % N, (c / N) | 0, acc[c]);
      if (visited[c]) break;
      visited[c] = 1;
      const d = down[c];
      if (d < 0) break;
      if (!land[d]) { pts.push(d % N, (d / N) | 0, acc[c]); break; }
      c = d;
    }
    if (pts.length / 3 < 9) { for (let q = 0; q < pts.length; q += 3) { const c2 = pts[q + 1] * N + pts[q]; if (c2 !== c) visited[c2] = 0; } continue; }
    const tLocal = islT[islandLab[head]];
    for (let q = 2; q < pts.length; q += 3) pts[q] = 0.7 + 0.65 * Math.log2(1 + pts[q] / tLocal);
    // meander: jitter interior points sideways (ends stay put so joins/mouths line up)
    const m = pts.length / 3;
    for (let q = 1; q < m - 1; q++) {
      pts[q * 3] += (rng() - 0.5) * 0.9;
      pts[q * 3 + 1] += (rng() - 0.5) * 0.9;
    }
    out.push(new Float32Array(chaikin(pts, 3, 3)));
  }
  return { rivers: out, acc, T, down, river };
}

// ---------------------------------------------------------------------------- 5. settlements
function settlements(N, terr, geo, hyd, rr, rng) {
  const n = N * N;
  const { H, M, dl } = terr;
  const { land, islandLab, islands } = geo;
  const { river } = hyd;
  const cands = [];
  for (let y = 3; y < N - 3; y += 2) {
    for (let x = 3; x < N - 3; x += 2) {
      const i = y * N + x;
      if (!land[i] || rr[i] > 0.93) continue;
      const h = H[i];
      if (h > 0.55) continue;
      const slope = Math.abs(H[i + 1] - H[i - 1]) + Math.abs(H[i + N] - H[i - N]);
      const d = dl[i];
      let s = 0;
      if (d <= 3.5) s += 1.0;
      let a = 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) a = Math.max(a, river[i + yy * N + xx]);
      if (a) {
        s += 1.0;
        if (d <= 4) s += 0.7;
      }
      s -= slope * 20;
      s -= h * 0.8;
      if (M[i] > 0.3 && M[i] < 0.8) s += 0.25;
      if (d < 1.5) s -= 0.6;
      s += rng() * 0.6;
      cands.push({ s, x, y, i });
    }
  }
  cands.sort((a, b) => b.s - a.s);

  const placed = [];
  const tooClose = (x, y, r) => {
    for (const q of placed) if ((q.x - x) ** 2 + (q.y - y) ** 2 < r * r) return true;
    return false;
  };
  const nCities = clamp(Math.round(geo.landArea / (n * 0.035)), 1, 6);
  const nTowns = clamp(Math.round(geo.landArea / (n * 0.008)), 2, 24);
  let cities = 0, townsN = 0;
  for (const c of cands) {
    if (cities >= nCities) break;
    if (tooClose(c.x, c.y, N * 0.11)) continue;
    placed.push({ x: c.x, y: c.y, i: c.i, kind: 'city', island: islandLab[c.i], s: c.s });
    cities++;
  }
  for (const c of cands) {
    if (townsN >= nTowns) break;
    if (tooClose(c.x, c.y, N * 0.05)) continue;
    placed.push({ x: c.x, y: c.y, i: c.i, kind: 'town', island: islandLab[c.i], s: c.s });
    townsN++;
  }
  // Every decent-sized island deserves at least a village.
  const has = new Set(placed.map((q) => q.island));
  for (const c of cands) {
    const id = islandLab[c.i];
    if (has.has(id) || islands[id].area < n * 0.002) continue;
    if (tooClose(c.x, c.y, N * 0.03)) continue;
    placed.push({ x: c.x, y: c.y, i: c.i, kind: 'town', island: id, s: c.s });
    has.add(id);
  }
  // Capital: best city on the largest island.
  let big = 0;
  for (const isl of islands) if (isl.area > islands[big].area) big = isl.id;
  const cap = placed.find((q) => q.kind === 'city' && q.island === big) || placed.find((q) => q.kind === 'city');
  if (cap) cap.kind = 'capital';
  return placed;
}

// ---------------------------------------------------------------------------- 6. roads & sea lanes
// Land roads: per island, an MST over all settlements plus extra links from each city to its
// nearest neighbours (so cities sit on a network, not a single chain). A* over a slope-aware
// cost grid at half resolution; reusing existing road cells is cheap so roads merge naturally.
// Sea lanes: islands are joined (MST over islands) by A* through water between coastal towns.
function buildRoads(N, terr, geo, hyd, towns) {
  const { H, dl } = terr;
  const { land } = geo;
  const { river } = hyd;
  const G = N >> 1, gn = G * G;
  const landCost = new Float32Array(gn), seaCost = new Float32Array(gn);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = gx * 2, y = gy * 2, i = y * N + x, g = gy * G + gx;
      const edge = x < 1 || y < 1 || x >= N - 1 || y >= N - 1;
      if (edge) { landCost[g] = seaCost[g] = Infinity; continue; }
      if (land[i]) {
        const slope = Math.abs(H[i + 1] - H[i - 1]) + Math.abs(H[i + N] - H[i - N]);
        landCost[g] = 1 + 60 * slope + (H[i] > 0.5 ? 4 : 0) + (river[i] ? 3 : 0);
        seaCost[g] = Infinity;
      } else {
        landCost[g] = Infinity;
        // sailors keep a little off the coast
        seaCost[g] = geo.lake[i] ? Infinity : 1 + 2 * Math.exp(-terr.ds[i] / 2);
      }
    }
  }
  const snap = (cost, x, y, maxR) => {
    const gx0 = Math.round(x / 2), gy0 = Math.round(y / 2);
    for (let r = 0; r <= maxR; r++) {
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        if (Math.max(Math.abs(xx), Math.abs(yy)) !== r) continue;
        const gx = gx0 + xx, gy = gy0 + yy;
        if (gx >= 0 && gy >= 0 && gx < G && gy < G && cost[gy * G + gx] < Infinity) return gy * G + gx;
      }
    }
    return -1;
  };

  const gScore = new Float32Array(gn);
  const came = new Int32Array(gn);
  const closedA = new Uint8Array(gn);
  const roadCell = new Uint8Array(gn);
  function astar(cost, s, t, reuse) {
    gScore.fill(Infinity); closedA.fill(0);
    const tx = t % G, ty = (t / G) | 0;
    const heap = new MinHeap(4096);
    gScore[s] = 0; came[s] = -1;
    heap.push(0, s);
    let iter = 0;
    while (heap.n && iter++ < gn * 3) {
      const c = heap.pop();
      if (c === t) break;
      if (closedA[c]) continue;
      closedA[c] = 1;
      const x = c % G, y = (c / G) | 0;
      for (let k = 0; k < 8; k++) {
        const xx = x + DX[k], yy = y + DY[k];
        if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
        const nb = yy * G + xx;
        const cc = cost[nb];
        if (cc === Infinity || closedA[nb]) continue;
        const g = gScore[c] + DD[k] * (reuse && roadCell[nb] ? cc * 0.35 : cc);
        if (g < gScore[nb]) {
          gScore[nb] = g; came[nb] = c;
          heap.push(g + 0.35 * Math.hypot(xx - tx, yy - ty), nb);
        }
      }
    }
    if (gScore[t] === Infinity) return null;
    const path = [];
    for (let c = t; c !== -1; c = came[c]) { path.push((c % G) * 2, ((c / G) | 0) * 2, 0); if (reuse) roadCell[c] = 1; }
    return path;
  }

  const mst = (nodes, dist) => {
    const edges = [];
    if (nodes.length < 2) return edges;
    const inTree = [0], rest = nodes.map((_, i) => i).slice(1);
    while (rest.length) {
      let best = null, bd = Infinity, bi = -1;
      for (const a of inTree) rest.forEach((b, j) => { const d = dist(a, b); if (d < bd) { bd = d; best = [a, b]; bi = j; } });
      if (!best || bd === Infinity) break;
      edges.push(best);
      inTree.push(rest[bi]);
      rest.splice(bi, 1);
    }
    return edges;
  };
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  // --- land roads
  const roads = [];
  const byIsland = new Map();
  for (const t of towns) {
    if (!byIsland.has(t.island)) byIsland.set(t.island, []);
    byIsland.get(t.island).push(t);
  }
  for (const group of byIsland.values()) {
    if (group.length < 2) continue;
    // cities first so the main highways are laid down before the village lanes
    group.sort((a, b) => (b.kind !== 'town') - (a.kind !== 'town'));
    const pairs = new Set();
    const list = [];
    const add = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (a === b || pairs.has(key)) return;
      pairs.add(key); list.push([group[a], group[b]]);
    };
    for (const [a, b] of mst(group, (a, b) => d2(group[a], group[b]))) add(a, b);
    group.forEach((t, i) => {
      if (t.kind === 'town') return;
      const near = group.map((o, j) => [d2(t, o), j]).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]);
      for (const [dd, j] of near.slice(0, 3)) if (Math.sqrt(dd) < N * 0.35) add(i, j);
    });
    list.sort((p, q) => rankKind(q[0]) + rankKind(q[1]) - rankKind(p[0]) - rankKind(p[1]));
    for (const [a, b] of list) {
      if (Math.hypot(a.x - b.x, a.y - b.y) > N * 0.5) continue;
      const s = snap(landCost, a.x, a.y, 3), t = snap(landCost, b.x, b.y, 3);
      if (s < 0 || t < 0 || s === t) continue;
      const path = astar(landCost, s, t, true);
      if (path) roads.push(new Float32Array(chaikin(path, 3, 3)));
    }
  }

  // --- sea lanes between islands (port to port)
  const seaRoutes = [];
  const ports = towns.filter((t) => dl[t.i] <= 6);
  const islandIds = [...new Set(ports.map((t) => t.island))];
  if (islandIds.length > 1) {
    const portsOf = (id) => ports.filter((t) => t.island === id);
    const closest = (A, B) => {
      let best = null, bd = Infinity;
      for (const a of portsOf(A)) for (const b of portsOf(B)) { const d = d2(a, b); if (d < bd) { bd = d; best = [a, b]; } }
      return { best, bd };
    };
    const edges = mst(islandIds, (a, b) => closest(islandIds[a], islandIds[b]).bd);
    for (const [a, b] of edges) {
      const { best, bd } = closest(islandIds[a], islandIds[b]);
      if (!best || Math.sqrt(bd) > N * 0.55) continue;
      const s = snap(seaCost, best[0].x, best[0].y, 8), t = snap(seaCost, best[1].x, best[1].y, 8);
      if (s < 0 || t < 0 || s === t) continue;
      const path = astar(seaCost, s, t, false);
      if (!path) continue;
      // start/end at the ports themselves
      path.unshift(best[1].x, best[1].y, 0);
      path.push(best[0].x, best[0].y, 0);
      seaRoutes.push(new Float32Array(chaikin(path, 3, 4)));
    }
  }
  return { roads, seaRoutes };
}
const rankKind = (t) => (t.kind === 'capital' ? 2 : t.kind === 'city' ? 1 : 0);

// ---------------------------------------------------------------------------- 7. glyphs
function placeGlyphs(N, terr, geo, hyd, rr, towns, rng) {
  const { H, M, T, dl } = terr;
  const { land } = geo;
  const { river } = hyd;
  const out = [];
  const nearTown = (x, y, r) => {
    for (const t of towns) if ((t.x - x) ** 2 + (t.y - y) ** 2 < r * r) return true;
    return false;
  };
  const sample = (step, fn) => {
    const cells = Math.floor(N / step);
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        const x = (gx + 0.15 + rng() * 0.7) * step;
        const y = (gy + 0.15 + rng() * 0.7) * step;
        const i = Math.round(y) * N + Math.round(x);
        if (i < 0 || i >= N * N || !land[i] || rr[i] > 0.96) continue;
        fn(x, y, i);
      }
    }
  };
  // Mountains
  sample(N / 44, (x, y, i) => {
    const h = H[i];
    if (h < 0.48 || dl[i] < 2 || river[i] || nearTown(x, y, N * 0.03)) return;
    out.push({ t: 'm', x, y, s: 0.75 + (h - 0.48) * 1.4 + rng() * 0.15, snow: biomeAt(h, M[i], T[i]) === BIOME.SNOW });
  });
  // Hills
  sample(N / 58, (x, y, i) => {
    const h = H[i];
    if (h < 0.3 || h >= 0.48 || dl[i] < 2 || rng() > 0.65 || river[i] || nearTown(x, y, N * 0.025)) return;
    out.push({ t: 'h', x, y, s: 0.8 + rng() * 0.3 });
  });
  // Trees / marsh
  sample(N / 100, (x, y, i) => {
    if (dl[i] < 2 || river[i] || nearTown(x, y, N * 0.02)) return;
    const b = biomeAt(H[i], M[i], T[i]);
    let t = null;
    if (b === BIOME.FOREST) t = 'td';
    else if (b === BIOME.RAINFOREST) t = 'tj';
    else if (b === BIOME.TAIGA) t = 'tc';
    else if (b === BIOME.SWAMP) t = rng() < 0.5 ? 'sw' : null;
    else if (b === BIOME.DESERT) t = rng() < 0.12 ? 'dn' : null;
    if (t && rng() < 0.85) out.push({ t, x, y, s: 0.8 + rng() * 0.4 });
  });
  out.sort((a, b) => a.y - b.y);
  return out;
}

// ---------------------------------------------------------------------------- 8. names
function nameWorld(N, terr, geo, towns, rr, rng, drink) {
  const n = N * N;
  const { ds } = terr;
  const { islands, lake } = geo;
  const ng = new NameGen(rng, drink);

  const order = [...islands].sort((a, b) => b.area - a.area);
  const langs = shuffle(rng, [...Array(LANG_COUNT).keys()]);
  order.forEach((isl, k) => { isl.lang = k < langs.length ? langs[k] : Math.floor(rng() * LANG_COUNT); });
  const mainLang = order.length ? order[0].lang : 0;

  for (const t of towns) t.name = ng.place(islands[t.island].lang);

  const islandLabels = [];
  for (const isl of order) {
    if (isl.area < n * 0.0025 || islandLabels.length >= 9 || isl.pole < 0) continue;
    const small = isl.area < n * 0.012;
    islandLabels.push({
      name: ng.island(isl.lang, small ? 'small' : 'big'),
      x: isl.pole % N, y: (isl.pole / N) | 0,
      area: isl.area,
    });
  }

  // Seas: the most open stretches of water, spaced apart.
  const seaLabels = [];
  const seaC = [];
  for (let y = 4; y < N - 4; y += 3) {
    for (let x = 4; x < N - 4; x += 3) {
      const i = y * N + x;
      if (lake[i] || rr[i] > 0.8 || ds[i] < N * 0.03) continue;
      seaC.push({ x, y, d: ds[i] });
    }
  }
  seaC.sort((a, b) => b.d - a.d);
  for (const c of seaC) {
    if (seaLabels.length >= 3) break;
    if (seaLabels.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < N * 0.3)) continue;
    seaLabels.push({ x: c.x, y: c.y, name: ng.sea(mainLang, seaLabels.length === 0 && c.d > N * 0.06 ? 'big' : 'small') });
  }

  const lakeLabels = [];
  const LL = label(lake, N, 1);
  const poles = new Map();
  for (let i = 0; i < n; i++) {
    if (!lake[i]) continue;
    const id = LL.lab[i];
    if (LL.sizes[id] < n * 0.002) continue;
    if (!poles.has(id) || ds[i] > ds[poles.get(id)]) poles.set(id, i);
  }
  for (const i of poles.values()) lakeLabels.push({ x: i % N, y: (i / N) | 0, name: ng.lake(mainLang) });

  return { islandLabels, seaLabels, lakeLabels, title: ng.title(mainLang), subtitle: ng.subtitle() };
}
