import { renderMap, marchingSquares, SERIF } from './render.js';

const N = 384; // analysis grid resolution — the main speed/detail knob
const VIEW_SIZE = 1200; // on-screen map canvas resolution
const EXPORT_SIZE = 2400; // downloaded PNG resolution
const MAX_SOURCE = 1400; // photos are downscaled to this on load

const SAMPLES = {
  coffee: 'samples/coffee.jpg',
  beer: 'samples/beer.jpg',
};

const $ = (id) => document.getElementById(id);
const els = {
  file: $('file'), crop: $('crop'), map: $('map'), radius: $('radius'), land: $('land'),
  smooth: $('smooth'), rough: $('rough'), coast: $('coast'), drink: $('drink'), invert: $('invert'), mask: $('mask'),
  reroll: $('reroll'), findRim: $('find-rim'), download: $('download'), stats: $('stats'), busy: $('busy'), empty: $('empty'),
};

const state = {
  src: null, // HTMLCanvasElement holding the (downscaled) photo
  circle: { x: 0.5, y: 0.5, r: 0.45 }, // x,y normalised to width/height; r normalised to min(w,h)
  seedOffset: 0,
  data: null,
  maskCanvas: null,
  outline: null, // the map's coastline and lake shores in grid units, for the photo
  dataCircle: null, // the circle the current map was charted from
  sentCircle: null,
  reqId: 0,
};

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onmessage = ({ data }) => {
  if (data.type === 'rim') return onRim(data);
  if (data.id !== state.reqId) return; // stale
  els.busy.hidden = true;
  if (data.error) {
    console.error(data.error);
    els.stats.textContent = 'Something went wrong charting this one. Try adjusting the circle or the Land slider.';
    return;
  }
  state.data = data.result;
  state.dataCircle = state.sentCircle;
  buildMaskCanvas();
  drawCrop();
  drawMap();
};

const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load(`20px ${SERIF}`),
    document.fonts.load('20px "IM Fell English SC"'),
    document.fonts.load(`italic 20px ${SERIF}`),
  ]),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});

// ---------------------------------------------------------------- loading photos
async function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

function toSourceCanvas(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, MAX_SOURCE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function setSource(url) {
  try {
    els.busy.hidden = false;
    const img = await loadImage(url);
    state.src = toSourceCanvas(img);
    state.circle = guessCircle();
    state.seedOffset = 0;
    els.radius.value = state.circle.r;
    els.empty.hidden = true;
    els.reroll.disabled = false;
    els.download.disabled = false;
    els.findRim.disabled = false;
    sizeCropCanvas();
    drawCrop();
    autoFindRim();
  } catch (e) {
    console.error(e);
    els.busy.hidden = true;
    els.stats.textContent = 'Could not read that image.';
  }
}

// Fallback when rim detection fails: centre of the frame, a little smaller than the short side.
function guessCircle() {
  return { x: 0.5, y: 0.5, r: 0.42 };
}

// Rim detection runs in the worker on a ~256px greyscale copy of the photo.
let rimReq = 0;
function autoFindRim() {
  if (!state.src) return;
  const s = 256 / Math.max(state.src.width, state.src.height);
  const w = Math.max(16, Math.round(state.src.width * s)), h = Math.max(16, Math.round(state.src.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.src, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  els.busy.textContent = 'Finding the rim…';
  els.busy.hidden = false;
  worker.postMessage({ type: 'rim', id: ++rimReq, grey, w, h }, [grey.buffer]);
}

function onRim({ id, circle }) {
  if (id !== rimReq) return;
  els.busy.textContent = 'Charting…';
  if (circle) state.circle = { x: circle.x, y: circle.y, r: Math.min(0.8, Math.max(0.08, circle.r)) };
  else els.stats.textContent = 'Couldn’t spot the rim. Drag the circle onto the drink.';
  els.radius.value = state.circle.r;
  drawCrop();
  generate(0);
}

els.file.addEventListener('change', () => {
  const f = els.file.files && els.file.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  setSource(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
  els.file.value = '';
});
document.querySelectorAll('[data-sample]').forEach((b) => {
  b.addEventListener('click', () => {
    setSource(SAMPLES[b.dataset.sample]);
  });
});

// ---------------------------------------------------------------- crop editor
function sizeCropCanvas() {
  if (!state.src) return;
  const maxW = 900;
  const s = Math.min(1, maxW / state.src.width);
  els.crop.width = Math.round(state.src.width * s);
  els.crop.height = Math.round(state.src.height * s);
}

function circlePx() {
  const { width: w, height: h } = state.src;
  return { cx: state.circle.x * w, cy: state.circle.y * h, r: state.circle.r * Math.min(w, h) };
}

function drawCrop() {
  if (!state.src) return;
  const c = els.crop, ctx = c.getContext('2d');
  const s = c.width / state.src.width;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(state.src, 0, 0, c.width, c.height);
  const { cx, cy, r } = circlePx();
  const X = cx * s, Y = cy * s, R = r * s;

  // The foam that becomes land: a light tint and the map's own coastline, so it is
  // clear which part of the photo turned into which island. Hidden while the circle
  // has moved since the map was charted, until the new map arrives.
  const dc = state.dataCircle, cc = state.circle;
  const current = dc && dc.x === cc.x && dc.y === cc.y && dc.r === cc.r;
  if (els.mask.checked && state.maskCanvas && state.outline && current) {
    ctx.save();
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(state.maskCanvas, X - R, Y - R, 2 * R, 2 * R);
    const k = (2 * R) / N, P = (g) => (g + 0.5) * k;
    const lw = Math.max(3.5, c.width / 180);
    const stroke = (segs, style, w) => {
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let j = 0; j < segs.length; j += 4) {
        ctx.moveTo(X - R + P(segs[j]), Y - R + P(segs[j + 1]));
        ctx.lineTo(X - R + P(segs[j + 2]), Y - R + P(segs[j + 3]));
      }
      ctx.stroke();
    };
    stroke(state.outline.coast, 'rgba(0, 0, 0, 0.55)', lw * 1.9);
    stroke(state.outline.coast, '#ffb347', lw);
    stroke(state.outline.lakes, '#73b9ca', lw * 0.8);
    ctx.restore();
  }
  // dim outside
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 10, 0.6)';
  ctx.beginPath();
  ctx.rect(0, 0, c.width, c.height);
  ctx.arc(X, Y, R, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = Math.max(2, c.width / 300);
  ctx.setLineDash([10, 7]);
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function buildMaskCanvas() {
  const d = state.data;
  if (!d) return;
  const c = state.maskCanvas || document.createElement('canvas');
  c.width = d.N; c.height = d.N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(d.N, d.N);
  const lake = new Float32Array(d.N * d.N);
  for (let i = 0; i < d.N * d.N; i++) {
    const o = i * 4;
    // land: a strong amber shade; lakes blue; the sea darkened so the land stands out
    if (d.land[i]) { img.data[o] = 255; img.data[o + 1] = 166; img.data[o + 2] = 50; img.data[o + 3] = 135; }
    else if (d.lake[i]) { lake[i] = 1; img.data[o] = 115; img.data[o + 1] = 185; img.data[o + 2] = 202; img.data[o + 3] = 120; }
    else { img.data[o + 3] = 95; }
  }
  ctx.putImageData(img, 0, 0);
  state.maskCanvas = c;
  state.outline = { coast: marchingSquares(d.H, d.N, 0), lakes: marchingSquares(lake, d.N, 0.5) };
}

// Pointer interaction: drag to move, pinch / wheel to resize.
const pointers = new Map();
let drag = null;
function toSrc(e) {
  const rect = els.crop.getBoundingClientRect();
  // canvas uses object-fit: contain; compute the drawn box
  const cw = els.crop.width, ch = els.crop.height;
  const s = Math.min(rect.width / cw, rect.height / ch);
  const ox = rect.left + (rect.width - cw * s) / 2, oy = rect.top + (rect.height - ch * s) / 2;
  const k = state.src.width / cw;
  return { x: ((e.clientX - ox) / s) * k, y: ((e.clientY - oy) / s) * k };
}
els.crop.addEventListener('pointerdown', (e) => {
  if (!state.src) return;
  els.crop.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, toSrc(e));
  startGesture();
});
els.crop.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, toSrc(e));
  const { width: w, height: h } = state.src;
  const pts = [...pointers.values()];
  if (pts.length === 1 && drag.mode === 'move') {
    state.circle.x = drag.cx + (pts[0].x - drag.p0.x) / w;
    state.circle.y = drag.cy + (pts[0].y - drag.p0.y) / h;
  } else if (pts.length >= 2 && drag.mode === 'pinch') {
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    setRadius(drag.r * (dist / drag.d0));
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    state.circle.x = drag.cx + (mx - drag.m0.x) / w;
    state.circle.y = drag.cy + (my - drag.m0.y) / h;
  }
  drawCrop();
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size) startGesture();
  else { drag = null; generate(); }
};
els.crop.addEventListener('pointerup', endPointer);
els.crop.addEventListener('pointercancel', endPointer);
function startGesture() {
  const pts = [...pointers.values()];
  const base = { cx: state.circle.x, cy: state.circle.y, r: state.circle.r };
  if (pts.length >= 2) {
    drag = { ...base, mode: 'pinch', d0: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), m0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } };
  } else if (pts.length === 1) {
    drag = { ...base, mode: 'move', p0: pts[0] };
  }
}
els.crop.addEventListener('wheel', (e) => {
  if (!state.src) return;
  e.preventDefault();
  setRadius(state.circle.r * Math.exp(-e.deltaY * 0.001));
  drawCrop();
  generate();
}, { passive: false });

function setRadius(r) {
  state.circle.r = Math.min(0.8, Math.max(0.08, r));
  els.radius.value = state.circle.r;
}

els.radius.addEventListener('input', () => { if (!state.src) return; state.circle.r = +els.radius.value; drawCrop(); generate(); });
for (const el of [els.land, els.smooth, els.rough, els.coast]) el.addEventListener('input', () => generate());
for (const el of [els.drink, els.invert]) el.addEventListener('change', () => generate(0));
els.mask.addEventListener('change', drawCrop);
els.findRim.addEventListener('click', autoFindRim);
els.reroll.addEventListener('click', () => { state.seedOffset++; generate(0); });

// ---------------------------------------------------------------- generation
const sampler = document.createElement('canvas');
sampler.width = sampler.height = N;
function sampleGrid() {
  const ctx = sampler.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, N, N);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const { cx, cy, r } = circlePx();
  const W = state.src.width, H = state.src.height;
  const sx0 = cx - r, sy0 = cy - r, sw = 2 * r, k = N / sw;
  // Clip the source rect manually (Safari doesn't like out-of-bounds source rects).
  const ix0 = Math.max(0, sx0), iy0 = Math.max(0, sy0);
  const ix1 = Math.min(W, sx0 + sw), iy1 = Math.min(H, sy0 + sw);
  if (ix1 > ix0 && iy1 > iy0) {
    ctx.drawImage(state.src, ix0, iy0, ix1 - ix0, iy1 - iy0, (ix0 - sx0) * k, (iy0 - sy0) * k, (ix1 - ix0) * k, (iy1 - iy0) * k);
  }
  return ctx.getImageData(0, 0, N, N).data;
}

let timer = 0;
function generate(delay = 150) {
  if (!state.src) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const rgba = sampleGrid();
    const id = ++state.reqId;
    state.sentCircle = { ...state.circle };
    els.busy.textContent = 'Charting…';
    els.busy.hidden = false;
    worker.postMessage({
      id, rgba, N,
      params: {
        land: +els.land.value,
        smoothing: +els.smooth.value,
        roughness: +els.rough.value,
        coast: +els.coast.value,
        invert: els.invert.checked,
        drink: els.drink.value,
        seedOffset: state.seedOffset,
      },
    }, [rgba.buffer]);
  }, delay);
}

async function drawMap() {
  await fontsReady;
  const d = state.data;
  if (!d) return;
  const t0 = performance.now();
  renderMap(els.map, d, { size: VIEW_SIZE });
  const ms = Math.round(performance.now() - t0);
  const s = d.stats;
  els.stats.textContent = `${s.islands} island${s.islands === 1 ? '' : 's'} · ${s.towns} settlements · ${s.rivers} rivers · generated in ${s.totalMs} ms, drawn in ${ms} ms`;
}

els.download.addEventListener('click', async () => {
  if (!state.data) return;
  await fontsReady;
  const c = document.createElement('canvas');
  renderMap(c, state.data, { size: EXPORT_SIZE });
  c.toBlob((blob) => {
    const a = document.createElement('a');
    const slug = state.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = `${slug || 'drink-map'}.png`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
});
