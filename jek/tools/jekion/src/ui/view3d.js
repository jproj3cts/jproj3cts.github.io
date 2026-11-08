import { clamp } from '../../../jekray/src/core/constants.js';
import { accountGate, acctMark } from '../../../jekray/src/ui/pro.js';
import { track } from '../../../jekray/src/io/usage.js';
import { shapeTriangles } from '../core/geom.js';
import { project, selectedId, setSelectedId, V } from '../state/project.js';
import { h, renderPanel } from './panel.js';
import { downloadFile, hideCtxMenu, safeFileName, toast } from './actions.js';
import { requestRender, cutCanvasFor } from './render.js';
import { SIM } from './sim.js';

/* ==========================================================================
   The 3D view: the electrodes as solids, the array's box, the cut plane with its potential map, the detectors, the
   ion groups' starts and the flown paths, turned and zoomed as in a CAD program (right-drag turns, middle-drag
   pans, the wheel zooms; one finger turns). three.js is fetched from the site the first time it opens.
   ========================================================================== */
export const V3D = (() => {
  let T = null, loading = null, D = null, R = null, on = false, key = '';
  function load() {
    if (T) return Promise.resolve();
    if (!loading) { const base = new URL('../assets/vendor/three/', location.href).href; loading = import(base + 'three.module.min.js').then(m => { T = m; }); loading.catch(() => { loading = null; }); }
    return loading;
  }
  function init() {
    if (D || typeof document === 'undefined') return;
    const stage = document.getElementById('stage'), bench = document.getElementById('bench');
    const cv = h('canvas', { class: 'rt-v3d', tabindex: '0', hidden: true, 'aria-label': '3D view: right-drag to turn, middle-drag to pan, scroll to zoom, click an electrode to select it.' });
    bench.after(cv);
    const b2 = h('button', { type: 'button', class: 'on', 'aria-pressed': 'true', title: 'The cut through the array (2D)', onclick: () => setOn(false) }, '2D');
    const b3 = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setOn(true) }, '3D');
    const sw = h('div', { class: 'rt-v3dswitch', role: 'group', 'aria-label': 'View: 2D or 3D' }, b2, b3);
    const btn = (label, title, fn) => h('button', { type: 'button', class: 'rt-btn', title, onclick: fn }, label);
    const bar = h('div', { class: 'rt-v3dbar', hidden: true }, btn('Fit', 'Zoom to fit (F)', () => fit()), acctMark(btn('PNG', 'Save this view as a picture', png), 'save a picture of the 3D view'));
    stage.append(sw, bar);
    D = { stage, cv, sw, b2, b3, bar };
    events();
  }
  function renderer() {
    if (R) return R;
    const gl = new T.WebGLRenderer({ canvas: D.cv, antialias: true, preserveDrawingBuffer: true });
    gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 1e5); camera.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xffffff, 0x404850, 0.9));
    const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(1, -2, 3); scene.add(sun);
    const groups = { parts: new T.Group(), light: new T.Group(), misc: new T.Group() };
    for (const g of Object.values(groups)) scene.add(g);
    R = { gl, scene, camera, groups, target: new T.Vector3(), w: 1, h: 1 };
    return R;
  }
  const dark = () => document.documentElement.dataset.rtTheme === 'dark';
  /* the scene rebuilt from the project and the last flight */
  function build() {
    const k = JSON.stringify([project.electrodes.map(e => [e.id, e.shape, e.x, e.y, e.z, e.axis, e.sx, e.sy, e.sz, e.r, e.L, e.rIn, e.rOut, e.r1, e.r2, e.wall, e.r0, e.rMax, e.z0, e.side, e.colour, e.on, e.mesh && e.mesh.n]), selectedId, SIM.when, SIM.slice && SIM.slice.id, project.grid, V().plane, V().slice, project.show.pot, project.show.contours, project.show.efield, project.show.traj, project.ions.map(g => [g.x, g.y, g.z, g.colour, g.on]), project.detectors.map(d => [d.axis, d.at, d.x, d.y, d.z, d.half, d.colour, d.on]), dark()]);
    if (k === key) return;
    key = k;
    const { groups, scene } = R, dispose = g => { for (const c of g.children) { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } } g.clear(); };
    for (const g of Object.values(groups)) dispose(g);
    scene.background = new T.Color(dark() ? 0x1f2529 : 0xf3eee5);
    // the electrodes
    for (const el of project.electrodes) {
      if (el.on === false) continue;
      const tri = shapeTriangles(el); if (!tri) continue;
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(tri.pos, 3)); geo.setIndex(new T.BufferAttribute(tri.idx, 1)); geo.computeVertexNormals();
      const sel = el.id === selectedId, mat = new T.MeshStandardMaterial({ color: new T.Color(el.colour), metalness: 0.5, roughness: 0.45, emissive: sel ? new T.Color(0x0092b2) : new T.Color(0), emissiveIntensity: sel ? 0.5 : 0, side: T.DoubleSide, transparent: true, opacity: 0.92 });
      const m = new T.Mesh(geo, mat); m.userData.id = el.id; groups.parts.add(m);
    }
    // the array's box
    const G = project.grid, lo = [G.x0, G.sym === 'cyl' ? -G.y1 : G.y0, G.sym === '3d' ? G.z0 : G.sym === 'cyl' ? -G.y1 : -0.5], hi = [G.x1, G.y1, G.sym === '3d' ? G.z1 : G.sym === 'cyl' ? G.y1 : 0.5];
    const box = new T.Box3(new T.Vector3(...lo), new T.Vector3(...hi));
    const helper = new T.Box3Helper(box, new T.Color(dark() ? 0x9aa0a6 : 0x6a6f76)); groups.misc.add(helper);
    R.box = box;
    // the cut plane with the potential map
    const S = SIM.slice;
    const cutCv = S && S.plane === V().plane && S.nv > 1 ? cutCanvasFor(S, project.show) : null;
    if (cutCv) {
      const tex = new T.CanvasTexture(cutCv); tex.colorSpace = T.SRGBColorSpace;
      const du = S.h * S.nu, dv = S.h * S.nv, geo = new T.PlaneGeometry(du, dv), mat = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
      const m = new T.Mesh(geo, mat), cu = S.u0 - S.h / 2 + du / 2, cvv = S.v0 - S.h / 2 + dv / 2;
      if (V().plane === 'xy') m.position.set(cu, cvv, G.sym === '3d' ? V().slice : 0);
      else if (V().plane === 'xz') { m.rotation.x = Math.PI / 2; m.position.set(cu, V().slice, cvv); }
      else { m.rotation.y = Math.PI / 2; m.rotation.z = Math.PI / 2; m.position.set(V().slice, cu, cvv); }
      groups.misc.add(m);
      if (G.sym === 'cyl') { const m2 = m.clone(); m2.scale.y = -1; m2.position.y = -cvv; groups.misc.add(m2); }
    }
    // the detectors
    for (const d of project.detectors) {
      if (d.on === false) continue;
      const hw = d.half > 0 ? d.half : Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
      const geo = new T.PlaneGeometry(2 * hw, 2 * hw), mat = new T.MeshBasicMaterial({ color: new T.Color(d.colour), transparent: true, opacity: d.id === selectedId ? 0.45 : 0.25, side: T.DoubleSide, depthWrite: false });
      const m = new T.Mesh(geo, mat);
      if (d.axis === 'x') { m.rotation.y = Math.PI / 2; m.position.set(d.at, d.y, d.z); } else if (d.axis === 'y') { m.rotation.x = Math.PI / 2; m.position.set(d.x, d.at, d.z); } else m.position.set(d.x, d.y, d.at);
      groups.misc.add(m);
    }
    // the ion groups' starts
    // a unit sphere each, scaled every frame to a few pixels on screen (draw), so zooming in uncovers the path round it
    for (const g of project.ions) { if (g.on === false) continue; const m = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(g.colour) })); m.position.set(g.x, g.y, g.z); m.userData.startMark = true; groups.misc.add(m); }
    // the paths
    if (project.show.traj && SIM.result) {
      for (const p of SIM.result.particles) {
        const n = p.pts.length / 4; if (n < 2) continue;
        const pos = new Float32Array(3 * n); for (let i = 0; i < n; i++) { pos[3 * i] = p.pts[4 * i]; pos[3 * i + 1] = p.pts[4 * i + 1]; pos[3 * i + 2] = p.pts[4 * i + 2]; }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        groups.light.add(new T.Line(geo, new T.LineBasicMaterial({ color: new T.Color(p.colour || '#e8402a'), transparent: true, opacity: 0.85 })));
      }
    }
  }
  function size() {
    const r = D.stage.getBoundingClientRect(); R.w = Math.max(1, r.width); R.h = Math.max(1, r.height);
    R.gl.setSize(R.w, R.h, false); R.camera.aspect = R.w / R.h; R.camera.updateProjectionMatrix();
  }
  function draw() {
    if (!on || !R) return;
    build();
    // the start markers: 4 px of radius whatever the distance (a sphere of that many world units at its depth)
    const cam = R.camera, perPx = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, R.h);
    for (const m of R.groups.misc.children) if (m.userData.startMark) m.scale.setScalar(Math.max(1e-6, 4 * perPx * cam.position.distanceTo(m.position)));
    R.gl.render(R.scene, R.camera);
  }
  function fit() {
    if (!R || !R.box) return;
    const c = R.box.getCenter(new T.Vector3()), s = R.box.getSize(new T.Vector3()).length() || 10;
    R.target.copy(c);
    const dir = new T.Vector3(1, -1.2, 0.8).normalize();
    R.camera.position.copy(c).addScaledVector(dir, s * 1.1);
    R.camera.lookAt(R.target); R.camera.updateMatrixWorld();
    draw();
  }
  function orbit(dx, dy) {
    const cam = R.camera, k = 0.008, rot = (axis, a) => { const q = new T.Quaternion().setFromAxisAngle(axis, a); cam.position.sub(R.target).applyQuaternion(q).add(R.target); };
    rot(new T.Vector3(0, 0, 1), -dx * k);
    const dir = cam.position.clone().sub(R.target).normalize(), right = new T.Vector3(-dir.y, dir.x, 0).normalize();
    const pol = Math.acos(clamp(dir.z, -1, 1)), want = clamp(pol + dy * k, 0.02, Math.PI - 0.02);
    rot(right, want - pol);
    cam.lookAt(R.target); cam.updateMatrixWorld();
  }
  function pan(dx, dy) {
    const cam = R.camera, d = cam.position.distanceTo(R.target), k = 2 * d * Math.tan(cam.fov * Math.PI / 360) / R.h;
    const right = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const m = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
    cam.position.add(m); R.target.add(m); cam.updateMatrixWorld();
  }
  function zoom(f) { const cam = R.camera; cam.position.sub(R.target).multiplyScalar(f).add(R.target); cam.updateMatrixWorld(); }
  function pick(e) {
    const r = D.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = -((e.clientY - r.top) / r.height * 2 - 1);
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(x, y), R.camera);
    const hits = rc.intersectObjects(R.groups.parts.children, false);
    return hits.length ? hits[0].object.userData.id : null;
  }
  function events() {
    const cv = D.cv; let drag = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => { if (!R) return; hideCtxMenu(); cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0, touch: e.pointerType === 'touch' }; });
    cv.addEventListener('pointermove', e => {
      if (!drag || !R) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.button === 2 || drag.touch || (drag.button === 0 && e.shiftKey)) orbit(dx, dy); else if (drag.button === 1 || (drag.button === 0 && drag.moved > 3)) pan(dx, dy);
      draw();
    });
    cv.addEventListener('pointerup', e => {
      if (drag && drag.button === 0 && drag.moved < 4) { const id = pick(e); setSelectedId(id); renderPanel(); draw(); requestRender(); }
      drag = null;
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); if (!R) return; zoom(Math.exp(e.deltaY * 0.0015)); draw(); }, { passive: false });
    
    new ResizeObserver(() => { if (on && R) { size(); draw(); } }).observe(D.stage);
  }
  async function setOn(v) {
    init();
    if (v && !T) { try { await load(); } catch (err) { toast('The 3D view could not load: ' + err.message, true); return; } }
    on = !!v;
    D.cv.hidden = !on; D.bar.hidden = !on;
    D.b2.classList.toggle('on', !on); D.b2.setAttribute('aria-pressed', String(!on)); D.b3.classList.toggle('on', on); D.b3.setAttribute('aria-pressed', String(on));
    document.getElementById('bench').style.visibility = on ? 'hidden' : '';
    const mi = document.getElementById('btnView3d'); if (mi) mi.setAttribute('aria-checked', String(on));
    if (on) { renderer(); size(); key = ''; build(); if (!R.fitted) { fit(); R.fitted = true; } else draw(); track('view', 'ion-3d'); }
  }
  function png() {
    if (!accountGate('save a picture of the 3D view') || !R) return;
    draw();
    D.cv.toBlob(b => { downloadFile(safeFileName(project.name) + ' 3D.png', b); toast('Saved the 3D view'); });
  }
  return { active: () => on, setOn, fit, draw: () => { if (on && R) { key = ''; draw(); } }, refresh: () => { if (on && R) draw(); } };
})();
export function wireView3d() {
  const it = document.getElementById('btnView3d');
  it.addEventListener('click', () => V3D.setOn(!V3D.active()));
  V3D.setOn(false);
}
