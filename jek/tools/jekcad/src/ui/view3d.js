import { TEST_MODE } from '../../../jekray/src/core/constants.js';
import { app, emit, isDark, on, toast } from './app.js';

/* ==========================================================================
   The 3D view: the parts as the kernel meshed them (faces, edges and vertices, each pickable), drawn with three.js
   (vendored, fetched from the site the first time). The camera is orthographic, as a CAD program's is.
   Mouse (shown in the hint line): right-drag orbits, middle-drag or Shift+right-drag pans, the wheel zooms about
   the pointer; a left click selects (Ctrl or Shift adds), a left drag from empty space selects by a box. Keys: F
   fits, N looks normal to the face or sketch chosen. The view cube turns the view to a face of it.
   Modes: shaded with edges, shaded, hidden edges (dashed through the part), and edges alone. A section view cuts
   the parts with a plane, the cut faces drawn in the accent colour.
   ========================================================================== */
let T = null, loading = null;
export const V = { ready: false, renderer: null, scene: null, cam: null, parts: new Map(), target: [0, 0, 0], q: [0, 0, 0, 1], hh: 60, mode: 'shadedEdges',
  section: null, preview: null, anim: null, w: 1, h: 1, dirty: true, overlays: [], fly: null };
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qaxis = (ax, ang) => { const s = Math.sin(ang / 2), l = Math.hypot(...ax) || 1; return [ax[0] / l * s, ax[1] / l * s, ax[2] / l * s, Math.cos(ang / 2)]; };
const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
const qnorm = q => { const l = Math.hypot(...q) || 1; return q.map(v => v / l); };
/* the orientation whose camera looks along -z (its z out of the screen) with x and y as given */
function qBasis(x, y, z) {
  const m = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], tr = m[0] + m[4] + m[8];
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4]; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s]; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s]; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s]; }
  return qnorm(q);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
/* a view looking from dir (towards the target), up as near up as it can be */
export function qView(dir, up) {
  const z = unit(dir);
  let u = up || [0, 0, 1];
  if (Math.abs(z[0] * u[0] + z[1] * u[1] + z[2] * u[2]) > 0.999) u = [0, 1, 0];
  const x = unit(cross(u, z)), y = cross(z, x);
  return qBasis(x, y, z);
}
export const VIEWS = { top: [[0, 0, 1], [0, 1, 0]], bottom: [[0, 0, -1], [0, -1, 0]], front: [[0, -1, 0]], back: [[0, 1, 0]], right: [[1, 0, 0]], left: [[-1, 0, 0]], iso: [[1, -1, 1]] };
export const camAxes = () => ({ x: qrot(V.q, [1, 0, 0]), y: qrot(V.q, [0, 1, 0]), z: qrot(V.q, [0, 0, 1]) });
/* ---------- world to screen and back (CSS pixels in the stage) ---------- */
export function project(p) {
  const { x, y, z } = camAxes(), d = [p[0] - V.target[0], p[1] - V.target[1], p[2] - V.target[2]], s = V.h / (2 * V.hh);
  return [V.w / 2 + (d[0] * x[0] + d[1] * x[1] + d[2] * x[2]) * s, V.h / 2 - (d[0] * y[0] + d[1] * y[1] + d[2] * y[2]) * s, d[0] * z[0] + d[1] * z[1] + d[2] * z[2]];
}
/* the ray through a screen point: from far in front, along the view */
export function rayAt(sx, sy) {
  const { x, y, z } = camAxes(), s = 2 * V.hh / V.h, u = (sx - V.w / 2) * s, v = (V.h / 2 - sy) * s, far = V.hh * 200;
  const o = [V.target[0] + x[0] * u + y[0] * v + z[0] * far, V.target[1] + x[1] * u + y[1] * v + z[1] * far, V.target[2] + x[2] * u + y[2] * v + z[2] * far];
  return { o, d: [-z[0], -z[1], -z[2]] };
}
export const pxToMm = px => px * 2 * V.hh / V.h;
/* where a ray meets a plane frame F, in the plane's (u, v); null if parallel */
export function rayPlane(r, F) {
  const dn = r.d[0] * F.n[0] + r.d[1] * F.n[1] + r.d[2] * F.n[2];
  if (Math.abs(dn) < 1e-9) return null;
  const t = ((F.o[0] - r.o[0]) * F.n[0] + (F.o[1] - r.o[1]) * F.n[1] + (F.o[2] - r.o[2]) * F.n[2]) / dn, p = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
  const q = [p[0] - F.o[0], p[1] - F.o[1], p[2] - F.o[2]];
  return [q[0] * F.x[0] + q[1] * F.x[1] + q[2] * F.x[2], q[0] * F.y[0] + q[1] * F.y[1] + q[2] * F.y[2]];
}
/* ---------- three.js, loaded once ---------- */
export function loadThree() {
  if (T) return Promise.resolve(T);
  if (!loading) { const base = new URL('../assets/vendor/three/', location.href).href; loading = import(base + 'three.module.min.js').then(m => { T = m; return m; }); loading.catch(() => { loading = null; }); }
  return loading;
}
function cssVar(n, d) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || d; }
const COL = () => ({ bg: isDark() ? 0x1c1f24 : 0xf3efe6, edge: isDark() ? 0x0c0d10 : 0x24272c, hidden: isDark() ? 0x8a93a0 : 0x6f7782, sel: 0xe0892e, hov: 0xf0b070, cut: 0xe0892e });
export async function initView() {
  const cv = document.getElementById('view');
  try { await loadThree(); }
  catch (err) { const n = document.getElementById('viewNote'); if (n) { n.hidden = false; n.textContent = 'The 3D view could not load (three.js): ' + err.message; } return; }
  const r = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: false });
  r.localClippingEnabled = true;
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V.renderer = r;
  V.scene = new T.Scene();
  V.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 1e7);
  V.scene.add(new T.AmbientLight(0xffffff, 0.55));
  V.key = new T.DirectionalLight(0xffffff, 1.6); V.fill = new T.DirectionalLight(0xffffff, 0.55);
  V.scene.add(V.key, V.fill);
  V.group = new T.Group(); V.scene.add(V.group);
  V.hl = new T.Group(); V.scene.add(V.hl);
  V.ready = true;
  V.q = qView(...VIEWS.iso);
  resize();
  new ResizeObserver(resize).observe(cv.parentElement);
  on('model', out => { setParts(out); });
  on('sel', () => { highlight(); });
  on('theme', () => { V.dirty = true; highlight(); });
  loop();
}
function resize() {
  const st = document.getElementById('stage');
  if (!st || !V.renderer) return;
  V.w = st.clientWidth; V.h = st.clientHeight;
  V.renderer.setSize(V.w, V.h, false);
  for (const c of ['view', 'over']) { const el = document.getElementById(c); el.style.width = V.w + 'px'; el.style.height = V.h + 'px'; }
  const ov = document.getElementById('over'), pr = Math.min(2, window.devicePixelRatio || 1);
  ov.width = Math.round(V.w * pr); ov.height = Math.round(V.h * pr);
  V.dirty = true;
}
function loop() {
  requestAnimationFrame(loop);
  if (V.anim) {
    const a = V.anim, t = Math.min(1, (performance.now() - a.t0) / a.ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let q1 = a.q1; if (a.q0[0] * q1[0] + a.q0[1] * q1[1] + a.q0[2] * q1[2] + a.q0[3] * q1[3] < 0) q1 = q1.map(v => -v);
    V.q = qnorm(a.q0.map((v, i) => v + (q1[i] - v) * e)); V.target = a.t0v.map((v, i) => v + (a.t1v[i] - v) * e); V.hh = a.h0 + (a.h1 - a.h0) * e;
    if (t >= 1) V.anim = null;
    V.dirty = true;
  }
  if (V.fly) flyStep();
  if (!V.dirty) return;
  V.dirty = false;
  draw();
  emit('view');
}
export const redraw = () => { V.dirty = true; };
function draw() {
  if (!V.ready) return;
  const C = COL();
  V.renderer.setClearColor(C.bg);
  if (V.fly) { drawFly(); return; }
  const { x, y, z } = camAxes(), far = V.hh * 200;
  V.cam.left = -V.hh * V.w / V.h; V.cam.right = V.hh * V.w / V.h; V.cam.top = V.hh; V.cam.bottom = -V.hh;
  V.cam.near = 0.01; V.cam.far = far * 2 + V.hh * 400;
  V.cam.position.set(V.target[0] + z[0] * far, V.target[1] + z[1] * far, V.target[2] + z[2] * far);
  V.cam.up.set(y[0], y[1], y[2]);
  V.cam.lookAt(V.target[0], V.target[1], V.target[2]);
  V.cam.updateProjectionMatrix();
  // the lights come with the camera: from above-left of the view, and a softer one from the right
  const L = (a, b, c) => [V.cam.position.x + (x[0] * a + y[0] * b + z[0] * c) * far, V.cam.position.y + (x[1] * a + y[1] * b + z[1] * c) * far, V.cam.position.z + (x[2] * a + y[2] * b + z[2] * c) * far];
  V.key.position.set(...L(-0.5, 0.8, 1)); V.fill.position.set(...L(0.9, -0.3, 0.6));
  V.key.target.position.set(...V.target); V.fill.target.position.set(...V.target);
  V.key.target.updateMatrixWorld(); V.fill.target.updateMatrixWorld();
  V.renderer.render(V.scene, V.cam);
  cubeShown();
}
/* ---------- the parts ---------- */
const hexOf = c => parseInt(String(c || '#9aa7b4').slice(1), 16);
function clipPlanes() {
  if (!V.section) return [];
  const s = V.section, n = s.n.map(v => v * (s.flip ? 1 : -1)), p = new T.Plane(new T.Vector3(...n), 0);
  p.constant = -(n[0] * s.o[0] + n[1] * s.o[1] + n[2] * s.o[2]);
  return [p];
}
function partObject(p) {
  const C = COL(), g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p.pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(p.nrm, 3));
  g.setIndex(new T.BufferAttribute(p.idx, 1));
  const col = new Float32Array(p.pos.length);
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  const clip = clipPlanes();
  const mat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.05, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clip, side: T.FrontSide });
  const mesh = new T.Mesh(g, mat);
  const back = new T.Mesh(g, new T.MeshBasicMaterial({ color: C.cut, side: T.BackSide, clippingPlanes: clip }));
  back.visible = !!V.section;
  const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(p.seg, 3));
  const edges = new T.LineSegments(eg, new T.LineBasicMaterial({ color: C.edge, clippingPlanes: clip }));
  const hid = new T.LineSegments(eg, new T.LineDashedMaterial({ color: C.hidden, dashSize: pxToMm(5), gapSize: pxToMm(4), depthFunc: T.GreaterDepth, transparent: true, opacity: 0.7, depthWrite: false, clippingPlanes: clip }));
  hid.computeLineDistances();
  const grp = new T.Group(); grp.add(mesh, back, edges, hid);
  grp.userData = { p, mesh, back, edges, hid, base: new T.Color(hexOf(p.look && p.look.colour)) };
  return grp;
}
function modeShown(o) {
  const m = V.mode, u = o.userData;
  u.mesh.visible = m !== 'wire';
  u.edges.visible = m !== 'shaded';
  u.hid.visible = m === 'hidden' || m === 'wire';
  u.hid.material.dashSize = pxToMm(5); u.hid.material.gapSize = pxToMm(4);
  u.mesh.material.transparent = m === 'hidden'; u.mesh.material.opacity = m === 'hidden' ? 0.9 : 1;
}
export function setParts(out) {
  if (!V.ready) return;
  for (const o of V.parts.values()) { V.group.remove(o); o.userData.mesh.geometry.dispose(); o.userData.edges.geometry.dispose(); }
  V.parts.clear();
  for (const p of out.parts) { if (p.look && p.look.hidden) continue; const o = partObject(p); modeShown(o); V.group.add(o); V.parts.set(p.id, o); }
  previewShown(out.preview);
  highlight();
  if (!V.fitted && out.parts.length) { V.fitted = true; fit(true); }
  V.dirty = true;
}
/* the feature being edited, drawn over the model: its tool body (green adds, red cuts) or its result's edges */
function previewShown(pv) {
  if (V.preview) { V.scene.remove(V.preview); V.preview = null; }
  if (!pv || (!pv.tool && !pv.parts)) return;
  const grp = new T.Group(), E = app.editing || app.sketch, op = E && E.f && (E.f.op || (E.f.type === 'hole' ? 'remove' : null));
  const col = op === 'remove' ? 0xd04040 : op === 'intersect' ? 0x4f8fd8 : 0x3aa860;
  for (const p of pv.tool ? [pv.tool] : pv.parts) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p.pos, 3)); g.setAttribute('normal', new T.BufferAttribute(p.nrm, 3)); g.setIndex(new T.BufferAttribute(p.idx, 1));
    if (pv.tool) grp.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.7 })));
    const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(p.seg, 3));
    grp.add(new T.LineSegments(eg, new T.LineBasicMaterial({ color: pv.tool ? col : 0xe0892e, depthTest: !pv.parts })));
  }
  V.preview = grp; V.scene.add(grp);
}
export function setMode(m) { V.mode = m; for (const o of V.parts.values()) modeShown(o); V.dirty = true; emit('viewmode'); }
export function setSection(s) {
  V.section = s;
  const clip = s ? clipPlanes() : [];
  for (const o of V.parts.values()) { const u = o.userData; for (const m of [u.mesh, u.back, u.edges, u.hid]) { m.material.clippingPlanes = clip; m.material.needsUpdate = true; } u.back.visible = !!s; }
  V.dirty = true;
}
/* the colours of faces and edges: the part's own, the selection and the hover over it */
const faceRange = (p, i) => [p.faceGroups[2 * i], p.faceGroups[2 * i + 1]];
export function highlight() {
  if (!V.ready) return;
  const C = COL();
  for (const [id, o] of V.parts) {
    const u = o.userData, p = u.p, col = u.mesh.geometry.getAttribute('color'), arr = col.array, base = u.base, idx = p.idx;
    const whole = app.sel.some(s => s.part === id && s.kind === 'part'), hovWhole = app.hover && app.hover.part === id && app.hover.kind === 'part';
    const paint = (c, from, n) => { for (let k = from; k < from + n; k++) { const v = idx[k] * 3; arr[v] = c.r; arr[v + 1] = c.g; arr[v + 2] = c.b; } };
    const b = whole ? new T.Color(C.sel) : hovWhole ? base.clone().lerp(new T.Color(C.hov), 0.5) : base;
    for (let v = 0; v < arr.length; v += 3) { arr[v] = b.r; arr[v + 1] = b.g; arr[v + 2] = b.b; }
    const sc = new T.Color(C.sel), hc = base.clone().lerp(new T.Color(C.hov), 0.55);
    if (app.hover && app.hover.part === id && app.hover.kind === 'face') paint(hc, ...faceRange(p, app.hover.index));
    for (const s of app.sel) if (s.part === id && s.kind === 'face') paint(sc, ...faceRange(p, s.index));
    col.needsUpdate = true;
  }
  // edges and vertices chosen or hovered: drawn thick on top
  for (const c of [...V.hl.children]) { V.hl.remove(c); c.geometry.dispose(); }
  const segs = [], hseg = [], vts = [], hv = [];
  const add = (s, into, vinto) => {
    const o = V.parts.get(s.part); if (!o) return;
    const p = o.userData.p;
    if (s.kind === 'edge') { const a = p.edgeGroups[2 * s.index], n = p.edgeGroups[2 * s.index + 1]; for (let k = a * 6; k < (a + n) * 6; k++) into.push(p.seg[k]); }
    if (s.kind === 'vertex') vinto.push(p.verts[3 * s.index], p.verts[3 * s.index + 1], p.verts[3 * s.index + 2]);
  };
  for (const s of app.sel) add(s, segs, vts);
  if (app.hover) add(app.hover, hseg, hv);
  const lines = (a, c, w) => { if (!a.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(a), 3)); const l = new T.LineSegments(g, new T.LineBasicMaterial({ color: c, linewidth: w, depthTest: false, transparent: true })); l.renderOrder = 5; V.hl.add(l); };
  const dots = (a, c) => { if (!a.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(a), 3)); const m = new T.Points(g, new T.PointsMaterial({ color: c, size: 9, sizeAttenuation: false, depthTest: false, transparent: true })); m.renderOrder = 6; V.hl.add(m); };
  lines(hseg, C.hov, 2); lines(segs, C.sel, 3); dots(hv, C.hov); dots(vts, C.sel);
  V.dirty = true;
}
/* ---------- picking: what is under a screen point, as the filter allows ---------- */
function rayToThree(r) { return new T.Ray(new T.Vector3(...r.o), new T.Vector3(...r.d)); }
export function pickAt(sx, sy, filter) {
  if (!V.ready) return null;
  filter = filter || app.filter;
  const r = rayAt(sx, sy), rc = new T.Raycaster();
  rc.ray = rayToThree(r);
  rc.params.Line.threshold = pxToMm(5);
  if (V.section) { /* hits beyond the cut do not count */ }
  const meshes = [...V.parts.values()].filter(o => o.userData.mesh.visible).map(o => o.userData.mesh);
  const hits = rc.intersectObjects(meshes, false).filter(hh => !V.section || sectionKeeps(hh.point));
  const face = hits[0] || null;
  let best = null;
  // vertices near the pointer, in front of the face hit
  if (filter === 'any' || filter === 'vertex') {
    let bd = 8;
    for (const [id, o] of V.parts) { const v = o.userData.p.verts; for (let i = 0; i < v.length / 3; i++) { const s = project([v[3 * i], v[3 * i + 1], v[3 * i + 2]]), d = Math.hypot(s[0] - sx, s[1] - sy); if (d < bd && (!face || depthOk(s, face))) { bd = d; best = { part: id, kind: 'vertex', index: i }; } } }
    if (best) return best;
  }
  if (filter === 'any' || filter === 'edge') {
    let bd = 6;
    for (const [id, o] of V.parts) {
      if (!o.userData.edges.visible && !o.userData.mesh.visible) continue;
      const p = o.userData.p, s = p.seg;
      for (let j = 0; j < p.edgeGroups.length / 2; j++) {
        const a = p.edgeGroups[2 * j], n = p.edgeGroups[2 * j + 1];
        for (let k = a; k < a + n; k++) {
          const A = project([s[6 * k], s[6 * k + 1], s[6 * k + 2]]), B = project([s[6 * k + 3], s[6 * k + 4], s[6 * k + 5]]);
          const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((sx - A[0]) * dx + (sy - A[1]) * dy) / L2));
          const d = Math.hypot(A[0] + dx * t - sx, A[1] + dy * t - sy), dep = A[2] + (B[2] - A[2]) * t;
          if (d < bd && (!face || depthOk([0, 0, dep], face))) { bd = d; best = { part: id, kind: 'edge', index: j }; }
        }
      }
    }
    if (best) return best;
  }
  if (face && (filter === 'any' || filter === 'face' || filter === 'part')) {
    const o = [...V.parts.entries()].find(([, ob]) => ob.userData.mesh === face.object);
    if (!o) return null;
    const p = o[1].userData.p, t3 = face.faceIndex * 3;
    if (filter === 'part') return { part: o[0], kind: 'part' };
    for (let i = 0; i < p.faceGroups.length / 2; i++) { const a = p.faceGroups[2 * i], n = p.faceGroups[2 * i + 1]; if (t3 >= a && t3 < a + n) return { part: o[0], kind: 'face', index: i, point: [face.point.x, face.point.y, face.point.z] }; }
  }
  return null;
}
/* the screen depth (along the view, towards the camera) of the nearest face hit, and whether s is not behind it */
function depthOk(s, hit) { const d = project([hit.point.x, hit.point.y, hit.point.z])[2]; return s[2] >= d - pxToMm(2); }
function sectionKeeps(pt) { const s = V.section, n = s.n.map(v => v * (s.flip ? 1 : -1)); return (pt.x - s.o[0]) * n[0] + (pt.y - s.o[1]) * n[1] + (pt.z - s.o[2]) * n[2] >= -1e-6; }
/* everything whose screen position falls in a box (faces by their middles, edges by all their points) */
export function pickBox(x0, y0, x1, y1, filter) {
  const lo = [Math.min(x0, x1), Math.min(y0, y1)], hi = [Math.max(x0, x1), Math.max(y0, y1)], inBox = s => s[0] >= lo[0] && s[0] <= hi[0] && s[1] >= lo[1] && s[1] <= hi[1], out = [];
  filter = filter || app.filter;
  for (const [id, o] of V.parts) {
    const p = o.userData.p;
    if (filter === 'part') { if (allIn(p.pos, inBox)) out.push({ part: id, kind: 'part' }); continue; }
    if (filter === 'any' || filter === 'edge') for (let j = 0; j < p.edgeGroups.length / 2; j++) { const a = p.edgeGroups[2 * j], n = p.edgeGroups[2 * j + 1]; if (n && allIn(p.seg.subarray(a * 6, (a + n) * 6), inBox)) out.push({ part: id, kind: 'edge', index: j }); }
    if (filter === 'face') for (let i = 0; i < p.faceGroups.length / 2; i++) { const a = p.faceGroups[2 * i], n = p.faceGroups[2 * i + 1], pts = []; for (let k = a; k < a + n; k++) pts.push(p.pos[3 * p.idx[k]], p.pos[3 * p.idx[k] + 1], p.pos[3 * p.idx[k] + 2]); if (n && allIn(new Float32Array(pts), inBox)) out.push({ part: id, kind: 'face', index: i }); }
    if (filter === 'vertex') for (let i = 0; i < p.verts.length / 3; i++) if (inBox(project([p.verts[3 * i], p.verts[3 * i + 1], p.verts[3 * i + 2]]))) out.push({ part: id, kind: 'vertex', index: i });
  }
  return out;
}
function allIn(a, inBox) { for (let k = 0; k < a.length; k += 3) if (!inBox(project([a[k], a[k + 1], a[k + 2]]))) return false; return a.length > 0; }
/* ---------- the camera ---------- */
export function animateTo(q1, t1, h1, ms) {
  V.anim = { q0: V.q.slice(), q1, t0v: V.target.slice(), t1v: t1 || V.target.slice(), h0: V.hh, h1: h1 || V.hh, t0: performance.now(), ms: TEST_MODE ? 1 : ms || 260 };
  V.dirty = true;
}
/* the bounds of what there is to see: the parts, and the sketches and planes the overlay draws */
export function sceneBounds(q) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], grow = p => { for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } };
  for (const o of V.parts.values()) { const b = o.userData.p.bbox; grow(b[0]); grow(b[1]); }
  for (const p of V.overlays) grow(p);
  if (!Number.isFinite(lo[0])) { grow([-50, -50, -50]); grow([50, 50, 50]); }
  // in the view's own axes, for the size it needs
  const ax = (() => { const x = qrot(q || V.q, [1, 0, 0]), y = qrot(q || V.q, [0, 1, 0]); return { x, y }; })();
  const c = lo.map((v, i) => (v + hi[i]) / 2);
  let w = 0, hgt = 0;
  for (const cx of [lo[0], hi[0]]) for (const cy of [lo[1], hi[1]]) for (const cz of [lo[2], hi[2]]) { const d = [cx - c[0], cy - c[1], cz - c[2]]; w = Math.max(w, Math.abs(d[0] * ax.x[0] + d[1] * ax.x[1] + d[2] * ax.x[2])); hgt = Math.max(hgt, Math.abs(d[0] * ax.y[0] + d[1] * ax.y[1] + d[2] * ax.y[2])); }
  return { c, w, h: hgt };
}
export function fit(now, q) {
  const b = sceneBounds(q || V.q), hh = Math.max(1, Math.max(b.h, b.w * V.h / Math.max(1, V.w)) * 1.25);
  if (now) { if (q) V.q = q; V.target = b.c; V.hh = hh; V.dirty = true; return; }
  animateTo(q || V.q, b.c, hh);
}
export function viewFrom(name) { const v = VIEWS[name]; if (!v) return; fit(false, qView(v[0], v[1])); }
/* look straight at a plane frame (a sketch's, a face's): its x across, its y up */
export function normalTo(F, keepZoom) { const q = qBasis(F.x, F.y, F.n); if (keepZoom) animateTo(q); else fit(false, q); }
/* orbit: the model turned about its own upright axis (the z through the middle of what there is to see) as the
   pointer goes across, and tipped towards or away as it goes up and down. The middle of the model stays where it
   is on the screen, wherever the view was panned to; a view left rolled (by a sketch on a tilted face, or a
   flight) is set upright first; the tip stops just short of straight down and straight up. */
export function orbit(dx, dy) {
  // (the middle of the parts, where there are any: a sketch or a plane beside them does not shift the axis)
  let pivot = sceneBounds().c;
  if (V.parts.size) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const o of V.parts.values()) { const b = o.userData.p.bbox; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], b[0][i]); hi[i] = Math.max(hi[i], b[1][i]); } } pivot = lo.map((v, i) => (v + hi[i]) / 2); }
  const s0 = project(pivot);
  let a = camAxes();
  if (Math.abs(a.x[2]) > 1e-3 && Math.abs(a.z[2]) < 0.999) { V.q = qView(a.z); a = camAxes(); }
  V.q = qnorm(qmul(qaxis([0, 0, 1], -dx * 0.008), V.q));
  a = camAxes();
  const el = Math.asin(Math.max(-1, Math.min(1, a.z[2]))), lim = 89.5 * Math.PI / 180, want = Math.max(-lim, Math.min(lim, el + dy * 0.008));
  if (Math.abs(a.x[2]) < 1e-3) V.q = qnorm(qmul(qaxis(a.x, -(want - el)), V.q));
  const s1 = project(pivot);
  pan(s0[0] - s1[0], s0[1] - s1[1]);
  V.dirty = true;
}
export function pan(dx, dy) { const a = camAxes(), s = 2 * V.hh / V.h; V.target = V.target.map((v, i) => v - a.x[i] * dx * s + a.y[i] * dy * s); V.dirty = true; }
export function zoomAt(sx, sy, f) {
  const a = camAxes(), s = 2 * V.hh / V.h, u = (sx - V.w / 2) * s, v = (V.h / 2 - sy) * s;
  const w = V.target.map((t, i) => t + a.x[i] * u + a.y[i] * v);
  V.target = w.map((wi, i) => wi + (V.target[i] - wi) * f); V.hh = Math.max(1e-3, Math.min(1e6, V.hh * f)); V.dirty = true;
  for (const o of V.parts.values()) modeShown(o);
}
/* ---------- the view cube: drawn with the camera; a face clicked turns the view to it ---------- */
const CUBE_FACES = [['top', 'Top', [0, 0, 1]], ['bottom', 'Bottom', [0, 0, -1]], ['front', 'Front', [0, -1, 0]], ['back', 'Back', [0, 1, 0]], ['right', 'Right', [1, 0, 0]], ['left', 'Left', [-1, 0, 0]]];
let cubeHover = null;
function cubeFaces() {
  const { x, y, z } = camAxes(), S = 22, out = [];
  for (const [k, label, n] of CUBE_FACES) {
    const vis = n[0] * z[0] + n[1] * z[1] + n[2] * z[2];
    if (vis < 0.02) continue;
    const a = Math.abs(n[2]) > 0.5 ? [1, 0, 0] : [0, 0, 1], b = cross(n, a);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const w = [n[0] + a[0] * u + b[0] * v, n[1] + a[1] * u + b[1] * v, n[2] + a[2] * u + b[2] * v]; return [38 + S * (w[0] * x[0] + w[1] * x[1] + w[2] * x[2]), 38 - S * (w[0] * y[0] + w[1] * y[1] + w[2] * y[2])]; });
    out.push({ k, label, pts, vis });
  }
  return out.sort((p, q) => p.vis - q.vis);
}
export function wireCube() {
  const box = document.getElementById('viewCube');
  if (!box) return;
  const cv = document.createElement('canvas'); cv.className = 'cad-cubecv'; cv.width = 152; cv.height = 152; cv.setAttribute('aria-label', 'View cube: click a face to look at it');
  box.prepend(cv);
  const at = e => { const r = cv.getBoundingClientRect(), q = [(e.clientX - r.left) * 76 / r.width, (e.clientY - r.top) * 76 / r.height]; let hit = null; for (const f of cubeFaces()) { let c = false; const P = f.pts; for (let i = 0, j = 3; i < 4; j = i++) if ((P[i][1] > q[1]) !== (P[j][1] > q[1]) && q[0] < (P[j][0] - P[i][0]) * (q[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; if (c) hit = f.k; } return hit; };
  cv.addEventListener('pointermove', e => { const k = at(e); if (k !== cubeHover) { cubeHover = k; cubeShown(); } cv.style.cursor = k ? 'pointer' : 'default'; });
  cv.addEventListener('pointerleave', () => { cubeHover = null; cubeShown(); });
  cv.addEventListener('click', e => { const k = at(e); if (k) viewFrom(k); });
}
function cubeShown() {
  const cv = document.querySelector('#viewCube .cad-cubecv');
  if (!cv) return;
  const c = cv.getContext('2d'), dark = isDark();
  c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 76, 76);
  c.font = '600 9px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const f of cubeFaces()) {
    c.beginPath(); f.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    const sh = 0.6 + 0.4 * f.vis;
    c.fillStyle = f.k === cubeHover ? '#e0892e' : dark ? 'rgb(' + [62, 68, 77].map(v => Math.round(v * sh)).join(',') + ')' : 'rgb(' + [240, 234, 222].map(v => Math.round(v * sh + 90 * (1 - sh))).join(',') + ')';
    c.fill(); c.strokeStyle = dark ? '#8a93a0' : '#7c8591'; c.lineWidth = 0.8; c.stroke();
    if (f.vis > 0.25) { const m = f.pts.reduce((s2, p) => [s2[0] + p[0] / 4, s2[1] + p[1] / 4], [0, 0]); c.fillStyle = f.k === cubeHover ? '#fff' : dark ? '#e9e6df' : '#1f232a'; c.fillText(f.label, m[0], m[1]); }
  }
}
/* ---------- fly: the model full screen, flown through, as JEKray's 3D view is ----------
   The view is orthographic, which cannot be flown through (nothing grows as you near it), so flying has a camera
   of its own, in perspective, starting where the view looks from. W A S D or the arrows move the way it looks and
   across it, Space and Ctrl up and down, Shift four times as fast; the mouse looks round and up and down, never
   rolled; the wheel sets the speed. Esc lands: the view is left looking the way the flight ended. */
const FLY_FOV = 50, FLY_PITCH = 88 * Math.PI / 180;
const FLY_KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'u', ControlLeft: 'd', ControlRight: 'd', ShiftLeft: 'fast', ShiftRight: 'fast' };
const flyDir = () => { const f = V.fly; return [Math.cos(f.yaw) * Math.cos(f.pitch), Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch)]; };
const flyCv = () => document.getElementById('view');
function flyHintText() {
  const f = V.fly, el = document.getElementById('flyHint');
  if (!f || !el) return;
  const locked = document.pointerLockElement === flyCv();
  el.textContent = 'Flying · W A S D: move · ' + (locked ? 'Mouse: look' : 'Click, then the mouse: look') + ' · Space / Ctrl: up, down · Shift: faster · Wheel: speed (' + (f.speed >= 1000 ? +(f.speed / 1000).toPrecision(2) + ' m' : Math.round(f.speed) + ' mm') + '/s) · Esc: land';
}
function flyLock() { try { const cv = flyCv(), q = cv.requestPointerLock && cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (err) { /* no pointer lock: drag to look */ } }
export function flyStart() {
  if (V.fly || !V.ready) return false;
  if (app.sketch || app.editing) { toast('Finish the ' + (app.sketch ? 'sketch' : 'feature') + ' first, then fly'); return false; }
  V.anim = null;
  const z = camAxes().z, dist = V.hh / Math.tan(FLY_FOV * Math.PI / 360), d = [-z[0], -z[1], -z[2]];
  V.fly = { pos: V.target.map((v, i) => v + z[i] * dist), yaw: Math.atan2(d[1], d[0]), pitch: Math.max(-FLY_PITCH, Math.min(FLY_PITCH, Math.asin(Math.max(-1, Math.min(1, d[2]))))), dist, speed: Math.max(5, Math.min(5000, dist * 0.5)), keys: new Set(), last: null, fs: false };
  if (!V.pcam) V.pcam = new T.PerspectiveCamera(FLY_FOV, 1, 0.1, 1e6);
  const st = document.getElementById('stage');
  st.classList.add('cad-flying');
  document.getElementById('flyHint').hidden = false;
  window.addEventListener('keydown', flyKey, true); window.addEventListener('keyup', flyKey, true);
  document.addEventListener('mousemove', flyMouse);
  document.addEventListener('pointerlockchange', flyHintText);
  document.addEventListener('fullscreenchange', flyFull);
  window.addEventListener('blur', flyBlur);
  try { const q = st.requestFullscreen && st.requestFullscreen(); if (q && q.then) q.then(() => { if (V.fly) V.fly.fs = true; }, () => {}); } catch (err) { /* the stage fills the window itself */ }
  flyLock(); flyHintText();
  app.hover = null; emit('fly');
  V.dirty = true;
  return true;
}
export function flyStop() {
  const f = V.fly;
  if (!f) return;
  window.removeEventListener('keydown', flyKey, true); window.removeEventListener('keyup', flyKey, true);
  document.removeEventListener('mousemove', flyMouse);
  document.removeEventListener('pointerlockchange', flyHintText);
  document.removeEventListener('fullscreenchange', flyFull);
  window.removeEventListener('blur', flyBlur);
  // the view left looking the way the flight ended, at a point as far ahead as the model was at take-off
  const d = flyDir();
  V.q = qView([-d[0], -d[1], -d[2]]); V.target = f.pos.map((v, i) => v + d[i] * f.dist); V.hh = f.dist * Math.tan(FLY_FOV * Math.PI / 360);
  V.fly = null;
  const st = document.getElementById('stage');
  st.classList.remove('cad-flying');
  document.getElementById('flyHint').hidden = true;
  if (document.pointerLockElement === flyCv()) try { document.exitPointerLock(); } catch (err) { /* gone already */ }
  if (document.fullscreenElement === st) { const q = document.exitFullscreen(); if (q && q.catch) q.catch(() => {}); }
  for (const o of V.parts.values()) modeShown(o);
  emit('fly');
  V.dirty = true;
}
/* full screen left (Esc, which the browser keeps for itself there): landed */
function flyFull() { const f = V.fly; if (!f) return; if (document.fullscreenElement === document.getElementById('stage')) f.fs = true; else if (f.fs) flyStop(); V.dirty = true; }
function flyBlur() { if (V.fly) V.fly.keys.clear(); }
function flyKey(e) {
  const f = V.fly;
  if (!f) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown') flyStop(); return; }
  const k = FLY_KEYS[e.code];
  if (!k || e.metaKey || e.altKey) return;
  e.preventDefault(); e.stopPropagation();
  if (e.type === 'keydown') f.keys.add(k); else f.keys.delete(k);
}
function flyMouse(e) {
  const f = V.fly, cv = flyCv();
  if (!f || !(document.pointerLockElement === cv || (e.buttons && e.target === cv))) return;
  flyTurn(e.movementX || 0, e.movementY || 0);
}
export function flyTurn(dx, dy) { const f = V.fly; if (!f) return; f.yaw -= dx * 0.0022; f.pitch = Math.max(-FLY_PITCH, Math.min(FLY_PITCH, f.pitch - dy * 0.0022)); V.dirty = true; }
function flyStep() {
  const f = V.fly, t = performance.now(), dt = f.last === null ? 0 : Math.min(0.1, (t - f.last) / 1000), K = f.keys;
  f.last = t;
  const d = flyDir(), right = [Math.sin(f.yaw), -Math.cos(f.yaw), 0];
  const m = [0, 1, 2].map(i => d[i] * ((K.has('f') ? 1 : 0) - (K.has('b') ? 1 : 0)) + right[i] * ((K.has('r') ? 1 : 0) - (K.has('l') ? 1 : 0)) + (i === 2 ? (K.has('u') ? 1 : 0) - (K.has('d') ? 1 : 0) : 0)), L = Math.hypot(...m);
  if (L > 0 && dt > 0) { const s = f.speed * (K.has('fast') ? 4 : 1) * dt / L; f.pos = f.pos.map((v, i) => v + m[i] * s); V.dirty = true; }
}
function drawFly() {
  const f = V.fly, d = flyDir(), c = V.pcam, size = Math.max(100, sceneBounds().w * 4, f.dist * 4);
  c.aspect = V.w / Math.max(1, V.h); c.near = Math.max(0.05, size / 20000); c.far = size * 50;
  c.position.set(...f.pos); c.up.set(0, 0, 1); c.lookAt(f.pos[0] + d[0], f.pos[1] + d[1], f.pos[2] + d[2]);
  c.updateProjectionMatrix();
  // the lights come with the camera, as they do in the ordinary view
  const right = [Math.sin(f.yaw), -Math.cos(f.yaw), 0], up = cross(right, d), far = size;
  const L = (a, b, e) => f.pos.map((v, i) => v + (right[i] * a + up[i] * b - d[i] * e) * far), ahead = f.pos.map((v, i) => v + d[i] * f.dist);
  V.key.position.set(...L(-0.5, 0.8, 1)); V.fill.position.set(...L(0.9, -0.3, 0.6));
  V.key.target.position.set(...ahead); V.fill.target.position.set(...ahead);
  V.key.target.updateMatrixWorld(); V.fill.target.updateMatrixWorld();
  V.renderer.render(V.scene, c);
}
export function wireFly() {
  const cv = flyCv();
  if (!cv) return;
  cv.addEventListener('pointerdown', e => { if (!V.fly) return; e.preventDefault(); if (document.pointerLockElement !== cv) flyLock(); });
  cv.addEventListener('wheel', e => { const f = V.fly; if (!f) return; e.preventDefault(); f.speed = Math.max(1, Math.min(20000, f.speed * Math.exp(-e.deltaY * 0.0015))); flyHintText(); }, { passive: false });
}
/* a picture of the view (for cloud thumbnails and the tests) */
export function viewPng() { if (!V.ready) return null; draw(); return document.getElementById('view').toDataURL('image/png'); }

