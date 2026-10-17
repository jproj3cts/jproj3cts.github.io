import { surfSag } from '../engines/lens-design.js';
import { RF_MAT } from '../core/rf.js';
import { h } from './panel.js';

/* ---------- A lens to be made, in 3D: a quick look before it is ordered ----------
   The lens as it would be printed: its faces turned about its axis to their full diameter (the sags as the bench
   has them, conics and aspheric terms included), its rim, and its flange with its bolt holes, centred on the rim as
   the bench draws it. It turns slowly; drag to turn it by hand. three.js is the 3D view's own, fetched the first
   time; one renderer is kept per lens and moved into the page each time it is drawn, so drawing again costs
   nothing new. */
let R3 = null, R3loading = null;
const R3views = new Map();         // lens id -> { renderer, scene, camera, group, key, yaw, pitch, drag }
function r3load() {
  if (R3) return Promise.resolve(R3);
  if (!R3loading) {
    const base = new URL('../assets/vendor/three/', location.href).href;
    R3loading = import(base + 'three.module.min.js').then(m => (R3 = m));
    R3loading.catch(() => { R3loading = null; });
  }
  return R3loading;
}
const r3sag = (s, r) => (s.R === null || !isFinite(s.R) || !s.R) && !s.k && !(s.A && s.A.some(a => a)) ? 0 : surfSag({ R: s.R, k: s.k || 0, a2: s.a2 || 0, A: s.A || [], odd: s.odd || null }, r);
/* the lens's outline in (r, z), front face to back, for a lathe */
function r3profile(el) {
  const S = el.surfaces, f = S[0], b = S[S.length - 1], T = el.gaps.reduce((u, v) => u + v, 0), a = el.diameter / 2, n = 64, pts = [];
  for (let i = 0; i <= n; i++) { const r = a * i / n; pts.push([r, r3sag(f, r)]); }
  for (let i = n; i >= 0; i--) { const r = a * i / n; pts.push([r, T + r3sag(b, r)]); }
  return { pts, a, mid: (r3sag(f, a) + T + r3sag(b, a)) / 2, T };
}
const r3key = el => JSON.stringify([el.diameter, el.surfaces.map(s => [s.R, s.k, s.a2, s.A]), el.gaps, el.materials, el.mount]);
function r3build(T, v, el) {
  if (v.group) { v.scene.remove(v.group); v.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const P = r3profile(el), M = RF_MAT[el.materials[0] && el.materials[0].glass], col = M && /ABS|ASA/.test(M.name) ? 0xe9e4d4 : M && /PETG/.test(M.name) ? 0xcfe6ef : 0xf0eee6;
  const mat = new T.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0, side: T.DoubleSide });
  const group = new T.Group();
  group.add(new T.Mesh(new T.LatheGeometry(P.pts.map(([r, z]) => new T.Vector2(Math.max(r, 1e-6), z)), 96), mat));
  // the flange: a ring with its holes, extruded along the axis, centred on the rim
  const m = el.mount;
  if (m && m.kind === 'flange') {
    const shape = new T.Shape(), ro = P.a + m.width;
    shape.absarc(0, 0, ro, 0, 2 * Math.PI, false);
    const inner = new T.Path(); inner.absarc(0, 0, P.a, 0, 2 * Math.PI, true); shape.holes.push(inner);
    for (let k = 0; k < m.holes; k++) { const t = 2 * Math.PI * k / m.holes, c = P.a + m.width / 2, hp = new T.Path(); hp.absarc(c * Math.cos(t), c * Math.sin(t), m.hole / 2, 0, 2 * Math.PI, true); shape.holes.push(hp); }
    const g = new T.ExtrudeGeometry(shape, { depth: m.thick, bevelEnabled: false, curveSegments: 48 });
    g.rotateX(-Math.PI / 2); g.translate(0, P.mid - m.thick / 2, 0);
    group.add(new T.Mesh(g, mat));
  }
  // the axis along y: centred, and sized to the view
  group.position.y = -P.T / 2;
  v.scene.add(group); v.group = group;
  const span = Math.max(P.a + (m ? m.width : 0), P.T);
  v.camera.position.set(0, 0, span * 3.9); v.camera.near = span * 0.05; v.camera.far = span * 20; v.camera.updateProjectionMatrix();
  v.key = r3key(el);
}
/* the 3D view of lens el: a box that fills itself once three.js is in */
export function lens3d(el) {
  const box = h('div', { class: 'rt-rf3d', role: 'img', 'aria-label': 'The lens ' + el.name + ' in 3D, as it would be made: drag to turn it' }, h('span', { class: 'rt-lsub' }, 'Loading the 3D view…'));
  const fail = () => box.replaceChildren(h('span', { class: 'rt-lsub' }, 'The 3D view could not load here.'));
  r3load().then(T => { try { r3show(T, el, box); } catch (err) { fail(); } }, fail);
  return box;
}
/* the lens drawn into box (its renderer made the first time; WebGL may be missing: the caller says so) */
function r3show(T, el, box) {
  if (!box.isConnected) return;
  let v = R3views.get(el.id);
  if (!v) {
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 1, 1000);
    scene.add(new T.HemisphereLight(0xffffff, 0x445566, 1.6));
    const d = new T.DirectionalLight(0xffffff, 1.8); d.position.set(2, 3, 4); scene.add(d);
    const d2 = new T.DirectionalLight(0xffffff, 1.2); d2.position.set(-2, -3, 3); scene.add(d2);
    v = { renderer, scene, camera, group: null, key: '', yaw: 0.6, pitch: -0.38, drag: null, idle: 0 };
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => { v.drag = [e.clientX, e.clientY]; v.idle = performance.now() + 4000; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!v.drag) return; v.yaw += (e.clientX - v.drag[0]) * 0.01; v.pitch = Math.max(-1.4, Math.min(1.4, v.pitch + (e.clientY - v.drag[1]) * 0.01)); v.drag = [e.clientX, e.clientY]; v.idle = performance.now() + 4000; });
    cv.addEventListener('pointerup', () => { v.drag = null; });
    R3views.set(el.id, v);
  }
  if (v.key !== r3key(el)) r3build(T, v, el);
  const W = Math.max(160, box.clientWidth || 260), H = Math.round(W * 0.8);
  v.renderer.setPixelRatio(window.devicePixelRatio || 1); v.renderer.setSize(W, H); v.camera.aspect = W / H; v.camera.updateProjectionMatrix();
  box.replaceChildren(v.renderer.domElement);
  // one loop at a time: a lens drawn again starts its own and the last one stops
  const loop = v.loop = {};
  let last = performance.now();
  const frame = t => {
    if (v.loop !== loop || !v.renderer.domElement.isConnected) return;
    if (!v.drag && t > v.idle) v.yaw += (t - last) * 0.00035;
    last = t;
    v.group.rotation.set(v.pitch, v.yaw, 0, 'XYZ');
    v.renderer.render(v.scene, v.camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
