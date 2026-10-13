import { BEAM_Z } from '../core/constants.js';
import { MOD_COLOURS } from '../core/modulators.js';
import { m2Of } from '../core/pulses.js';
import { m2Env, modeM2 } from '../core/beams-hom.js';
import { deg, extraSel, project, selectOne, selectedId } from '../state/project.js';
import { FIBRE_COLOUR, fieldDec, getEl, lightOf } from '../state/elements.js';
import { benchName, checkpoint, curBench, linkPartner, undo } from '../state/tabs.js';
import { lensSurfaces, polyVerts, rawSag, sagFn } from '../core/geometry.js';
import { crystalGeom, elementSurfaces, meshOf } from '../core/stl.js';
import { stopBlades } from '../core/mask.js';
import { lastTrace, sag3, setRoll, setTip, setZ, tippable, traceKeyNow, traceStore, traceStoreOn, zOf } from '../engines/trace.js';
import {
  H, V, benchBg, benchHoles, benchLight, detR, draw, filterColour, hornLam, hornShape, metal,
  requestRender, resize, segPlanes, selection, setSelection, srcBody, stage, surfPoints, wx, wy
} from './render.js';
import { groupOf } from './drawings.js';
import { drag, snapVal } from './pointer.js';
import { clamp } from './params.js';
import { qW } from '../engines/fibre-face.js';
import { h, renderPanel, syncPanel } from './panel.js';
import { magma } from './plots.js';
import { beamAt } from './panel-cavity.js';
import { QFree, beamQ, cavEventABCD, ccInv, cx, cz, mfree, qThrough } from '../engines/cavity.js';
import { VOL, fmtIrr, volDisp, volLater, volRayMax } from '../engines/volume.js';
import { diffractionLater, popScreenCache } from '../engines/pd-cavity.js';
import { benchMenu, changed, hideCtxMenu, toast } from './actions.js';
import { qrLink } from '../io/share.js';
import { exp, palette } from './experimental.js';
import { fillRail, setPalette } from './rail.js';
import { api } from '../io/account.js';

/* ==========================================================================
   3D view: a tab of free-space parts seen in three dimensions, turned and zoomed as in a CAD
   program (the default mouse: right-drag turns, middle-drag pans, the wheel zooms;
   or a trackpad's). The bench is the same: every part sits at the beam height above the
   breadboard, made from its own numbers (a lens from its surfaces, a mirror from its sag), and
   the light is drawn as the trace has it, rays as lines and Gaussian beams as tubes as wide as
   they are in the bench plane and out of it. Nothing is worked out here that the trace has
   not: it is a view. Fibre, electronic and chip parts (and drawings) are left out of it.
   three.js is fetched from the site the first time a 3D view opens.
   ========================================================================== */
export const V3D = (() => {
  const FREE = new Set(['source', 'detector', 'screen', 'fibre', 'mirror', 'lens', 'cube', 'waveplate', 'polariser', 'crystal', 'faraday', 'isolator',
    'stop', 'mask', 'filter', 'grating', 'prism', 'gain', 'cell', 'nlc', 'aom', 'eom', 'chopper', 'link', 'stl', 'draw']);
  const BEAM_H = BEAM_Z;                                 // mm: the beam above the breadboard's top, unless a part says otherwise
  const BOARD_T = 12.7, PITCH = 25;
  const VIEWS = { front: [0, -1, 0], back: [0, 1, 0], left: [-1, 0, 0], right: [1, 0, 0], top: [0, -1e-4, 1], bottom: [0, -1e-4, -1], iso: [1, -1, 0.85] };
  let T = null, RoomEnv = null, loading = null;           // three.js, once loaded
  let D = null, R = null;                                 // the page's parts, and the renderer's
  const st = new Map();                                   // per tab: { on, cam: { p, t } }
  let ctrl = (() => { try { return localStorage.getItem('jek-3d-mouse') === 'trackpad' ? 'trackpad' : 'default'; } catch (e) { return 'default'; } })();
  let names = true;

  // fibre, electronic and chip parts (and drawings) are not drawn in 3D: their tab still opens there
  const blockers = id => project.elements.filter(e => e.bench === id && !FREE.has(e.type));
  const eligible = () => true;
  const tabState = () => st.get(project.tab) || null;
  // (a feature of the tool proper: always there for a tab it can show)
  const allowed = () => true;
  const active = () => allowed() && !!(tabState() && tabState().on);

  function load() {
    if (T) return Promise.resolve();
    if (!loading) {
      const base = new URL('../assets/vendor/three/', location.href).href;
      loading = Promise.all([import(base + 'three.module.min.js'), import(base + 'RoomEnvironment.js')])
        .then(([m, r]) => { T = m; RoomEnv = r.RoomEnvironment; });
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  /* ---------- the page: the 2D / 3D switch, the 3D canvas, its bar and hint ---------- */
  function init() {
    if (D || typeof document === 'undefined') return;
    const stage = document.getElementById('stage'), bench = document.getElementById('bench');
    if (!stage || !bench) return;
    const cv = h('canvas', { class: 'rt-v3d', tabindex: '0', hidden: true, 'aria-label': '3D view of this tab. Right-drag to turn it, middle-drag to pan, scroll to zoom, click a part to select it.' });
    bench.after(cv);
    const b2 = h('button', { type: 'button', class: 'on', 'aria-pressed': 'true', title: 'The bench, from above (2D)', onclick: () => setOn(false) }, '2D');
    const b3 = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setOn(true) }, '3D');
    const sw = h('div', { class: 'rt-v3dswitch', role: 'group', 'aria-label': 'View: 2D or 3D' }, b2, b3);
    const btn = (label, title, fn) => h('button', { type: 'button', class: 'rt-btn', title, onclick: fn }, label);
    const mouse = h('select', { 'aria-label': 'Mouse', title: 'How the mouse turns and pans the view' },
      h('option', { value: 'default' }, 'Mouse: default'), h('option', { value: 'trackpad' }, 'Mouse: trackpad'));
    mouse.value = ctrl;
    mouse.addEventListener('change', () => { ctrl = mouse.value; try { localStorage.setItem('jek-3d-mouse', ctrl); } catch (e) { /* kept for this visit */ } hintText(); });
    const nm = btn('Names', 'Show or hide the parts’ names', () => { names = !names; nm.classList.toggle('off', !names); nm.setAttribute('aria-pressed', String(names)); if (R) R.key = null; requestRender(); });
    // Fly: a bird in flight
    const flyBtn = btn('', 'Fly through the bench, full screen: W A S D and the mouse, Q and E to roll, Esc to land', () => flyStart());
    flyBtn.setAttribute('aria-label', 'Fly'); flyBtn.classList.add('rt-flybird');
    flyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M2 7c3.5 0 6.4 1.7 8.3 4.6C11.6 7.4 14.6 4.6 19 3.5c-2 2.4-3 4.9-3 7.6 1.4-.7 3-.9 4.8-.6L23 12l-2.5.5c-1.3 3.3-4.2 5.4-8.3 5.9L9 21l.6-3.6C5.6 15.6 3 12 2 7z"/></svg>';
    // (the views are on the cube, the keys Shift+1 to 7, and the right-click menu)
    const bar = h('div', { class: 'rt-v3dbar', hidden: true }, flyBtn, btn('Fit', 'Zoom to fit (F)', () => fit(null, true)), nm, mouse, btn('PNG', 'Save this view as a picture', png));
    const hint = h('div', { class: 'rt-v3dhint', hidden: true, role: 'status' });
    const flyHint = h('div', { class: 'rt-flyhint', hidden: true, role: 'status' });
    const vkey = h('div', { class: 'rt-v3dkey', hidden: true, role: 'status' });
    stage.append(sw, bar, hint, flyHint, vkey);
    D = { stage, cv, sw, b2, b3, bar, hint, mouse, flyBtn, flyHint, vkey };
    hintText();
    // flying, the mouse turns the view and the wheel sets the speed: the canvas's own handlers stand aside
    cv.addEventListener('pointerdown', e => { if (!fly) return; e.stopImmediatePropagation(); e.preventDefault(); if (document.pointerLockElement !== cv) flyLock(); }, true);
    cv.addEventListener('wheel', e => { if (!fly) return; e.stopImmediatePropagation(); e.preventDefault(); fly.speed = clamp(fly.speed * Math.exp(-e.deltaY * 0.0015), 5, 20000); flyHintText(); }, { capture: true, passive: false });
    events();
    document.addEventListener('keydown', keys, true);
    const it = document.getElementById('btnView3d');
    if (it) it.addEventListener('click', () => setOn(!active()));
    const fv = document.getElementById('btnFit');
    if (fv) fv.addEventListener('click', () => { if (active() && R) fit(null, true); });
  }
  function hintText() {
    if (!D) return;
    const s = tabState();
    if (s && s.on && !R) { D.hint.textContent = 'Opening the 3D view…'; return; }
    const draw = project.elements.some(e => e.bench === project.tab && e.type === 'draw') ? ' · Drawings show in 2D only' : '';
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    D.mouse.hidden = touch;
    const parts = 'Click a part: arrows to move it (orange x, green y, blue up) · Click it again: rings to turn it (blue: facing, green: tip, orange: roll; Alt: fine, Shift: 15°) · Drag a part: move it on the table · ';
    if (touch) { D.hint.textContent = 'Tap a part: arrows to move it · Tap again: rings to turn it · One finger: turn the view · Two: pan and zoom' + draw; return; }
    D.hint.textContent = parts + (ctrl === 'default'
      ? 'Right-drag: turn the view · Middle-drag: pan · Scroll: zoom · Right-click: menu · F: fit'
      : 'Drag elsewhere: turn the view · Shift-drag: pan · Pinch: zoom · Right-click: menu · F: fit') + draw;
  }
  /* the switch's state, and the 3D view shown or hidden, for the tab now showing */
  function show() {
    if (!D) return;
    const on = active(), ok = eligible(project.tab), there = allowed();
    D.sw.hidden = !there;
    const mi = document.getElementById('btnView3d');
    if (mi) mi.hidden = !there;
    D.stage.classList.toggle('v3d', on);
    D.cv.hidden = !on || !R; D.bar.hidden = !on || !R; D.hint.hidden = !on;
    // drawings are 2D only: the rail's Draw palette goes while the 3D view shows, and comes back after
    if (on !== D.wasOn) { D.wasOn = on; if (on && palette === 'draw') setPalette('free'); else fillRail(); }
    if (!on) D.vkey.hidden = true;
    D.flyBtn.hidden = !flyOk();
    if (fly && !on) flyStop();
    D.b2.classList.toggle('on', !on); D.b3.classList.toggle('on', on);
    D.b2.setAttribute('aria-pressed', String(!on)); D.b3.setAttribute('aria-pressed', String(on));
    D.b3.disabled = !ok && !on;
    const bl = blockers(project.tab);
    D.b3.title = 'This tab in three dimensions (3D)' + (bl.length ? ': its free-space parts; ' + bl.length + ' fibre, electronic or chip part' + (bl.length > 1 ? 's stay' : ' stays') + ' in 2D' : '');
    const it = document.getElementById('btnView3d');
    if (it) { it.setAttribute('aria-checked', String(on)); it.disabled = !ok && !on; }
    hintText();
  }
  async function setOn(on) {
    init();
    const id = project.tab;
    st.set(id, Object.assign(st.get(id) || {}, { on }));
    show();
    if (on) {
      D.hint.classList.remove('faded');
      try { await load(); renderer(); }
      catch (e) { st.get(id).on = false; show(); toast('The 3D view could not start in this browser (it needs WebGL)', true); return; }
      if (R) R.key = null;
      show(); sync();                                     // sized and built now, not at the next frame
      D.cv.focus({ preventScroll: true });
    }
    show(); requestRender();
  }

  /* ---------- the renderer, its scene, camera and view cube ---------- */
  function renderer() {
    if (R) return R;
    const gl = new T.WebGLRenderer({ canvas: D.cv, antialias: true });   // (a picture of it is taken straight after drawing it: see png)
    gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    gl.shadowMap.enabled = true; gl.shadowMap.type = T.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = false;                      // shadows are drawn again only when the scene is (see build), not as the view turns
    gl.autoClear = false;
    gl.localClippingEnabled = true;                      // beams cut along the surfaces they meet (see segPlanes)
    const scene = new T.Scene();
    const pm = new T.PMREMGenerator(gl);
    // the studio light round it all, its ceiling turned to be up (+z) as the bench's is
    const room = new RoomEnv(); room.rotation.x = Math.PI / 2; room.updateMatrixWorld(true);
    scene.environment = pm.fromScene(room, 0.04).texture;
    const camera = new T.PerspectiveCamera(35, 1, 1, 2e5);
    camera.up.set(0, 0, 1);
    const sun = new T.DirectionalLight(0xffffff, 1.6);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target, new T.HemisphereLight(0xffffff, 0x404850, 0.5));
    const groups = { board: new T.Group(), parts: new T.Group(), light: new T.Group(), names: new T.Group(), sel: new T.Group() };
    for (const g of Object.values(groups)) scene.add(g);
    // a beam that is never rebuilt, too small to see, for each way beams are blended: it keeps the
    // shader every beam shares (cut by two planes, see segClip3) compiled while the beams are
    // rebuilt, so dragging a part never waits on a new one
    // (and one not cut, as the outlines and markers redrawn with them are)
    for (const blending of [T.NormalBlending, T.AdditiveBlending]) for (const cut of [true, false]) {
      const keep = new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute([0, 0, -1e4, 1e-3, 0, -1e4, 0, 1e-3, -1e4], 3)),
        new T.MeshBasicMaterial(Object.assign(cut ? { clippingPlanes: [new T.Plane(new T.Vector3(0, 0, 1), 1e9), new T.Plane(new T.Vector3(0, 0, 1), 1e9)] } : {}, { transparent: true, opacity: 0, blending, side: T.DoubleSide, depthWrite: false })));
      keep.frustumCulled = false; scene.add(keep);
    }
    // the view cube: its own small scene, drawn in the top right corner over the bench
    const cube = new T.Scene(), cubeCam = new T.OrthographicCamera(-0.9, 0.9, 0.9, -0.9, 0.1, 10);
    const faceTex = label => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#eef1f3'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#9aa4ab'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
      g.fillStyle = '#2b3338'; g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 64, 66);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
    // built Y-up and turned so that its +Y face is the top: then every label reads upright
    const box = new T.Mesh(new T.BoxGeometry(1, 1, 1), ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'].map(l => new T.MeshBasicMaterial({ map: faceTex(l) })));
    box.rotation.x = Math.PI / 2;
    cube.add(box, new T.LineSegments(new T.EdgesGeometry(box.geometry), new T.LineBasicMaterial({ color: 0x55606a })).rotateX(Math.PI / 2));
    const axes = new T.Group();
    for (const [d, c] of [[[1, 0, 0], 0xdb3550], [[0, 1, 0], 0x3fa34d], [[0, 0, 1], 0x0092b2]]) {
      const g = new T.BufferGeometry().setFromPoints([new T.Vector3(-0.5, -0.5, -0.5), new T.Vector3(-0.5 + 0.75 * d[0], -0.5 + 0.75 * d[1], -0.5 + 0.75 * d[2])]);
      axes.add(new T.Line(g, new T.LineBasicMaterial({ color: c })));
    }
    cube.add(axes);
    R = { gl, scene, camera, sun, groups, cube, cubeCam, box, target: new T.Vector3(), key: null, trace: null, selKey: null, camTab: null, w: 0, h: 0, anim: null, queued: false };
    return R;
  }
  const CUBE_PX = 104, CUBE_M = 8;
  const cubeRect = () => ({ x: R.w - CUBE_PX - CUBE_M, y: 36, w: CUBE_PX, h: CUBE_PX });     // css px, from the top left
  function resize() {
    const w = D.stage.clientWidth, hgt = D.stage.clientHeight;
    if (!w || !hgt || (w === R.w && hgt === R.h)) return;
    R.w = w; R.h = hgt;
    R.gl.setSize(w, hgt, false);
    R.camera.aspect = w / hgt; R.camera.updateProjectionMatrix();
    R.key = null;                                         // the names are sized to the canvas
  }
  function draw() {
    if (!R || !active()) return;
    const { gl, scene, camera } = R;
    gl.setViewport(0, 0, R.w, R.h); gl.setScissorTest(false);
    gl.setClearColor(new T.Color(sceneBg()), 1); gl.clear();
    // seen from under the table, the breadboard fades so what is on it still shows
    const below = camera.position.z < -0.5;
    if (below !== !!R.boardBelow) {
      R.boardBelow = below;
      R.groups.board.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) { m.transparent = below; m.opacity = below ? 0.18 : 1; m.depthWrite = !below; m.needsUpdate = true; } });
    }
    gl.render(scene, camera);
    // the view cube, looking the way the camera looks
    const c = cubeRect();
    cubeAim();
    gl.setScissorTest(true); gl.setScissor(c.x, R.h - c.y - c.h, c.w, c.h); gl.setViewport(c.x, R.h - c.y - c.h, c.w, c.h);
    gl.clearDepth(); gl.render(R.cube, R.cubeCam);
    gl.setScissorTest(false); gl.setViewport(0, 0, R.w, R.h);
  }
  // the view cube's camera, looking the way the main one does
  function cubeAim() {
    const dir = R.camera.position.clone().sub(R.target).normalize();
    R.cubeCam.position.copy(dir.multiplyScalar(3)); R.cubeCam.quaternion.copy(R.camera.quaternion); R.cubeCam.updateMatrixWorld();
  }
  function need() { if (!R || R.queued) return; R.queued = true; requestAnimationFrame(() => { R.queued = false; draw(); }); }
  const sceneBg = () => { const c = new T.Color(benchBg()); const hsl = {}; c.getHSL(hsl); return hsl.l > 0.5 ? '#e9ecef' : '#101417'; };

  /* ---------- keeping up with the bench ---------- */
  function sync() {
    init();
    const s = tabState();
    show();
    if (!active() || !R) return;
    resize();
    const key = traceKeyNow() + '|' + project.tab + '|' + benchBg() + benchHoles() + names + '|' + R.w + 'x' + R.h + '|' + faceMapsKey() + '|' + project.elements.filter(e => e.hide3d).map(e => e.id).join() + '|L' + (lightOf().rays ? 'r' : '') + (lightOf().envelope ? 'e' : '') + (lightOf().field ? 'f|v' + VOL.rev + lightOf().scale : '');
    if (key !== R.key || lastTrace !== R.trace) { R.key = key; R.trace = lastTrace; build(); }
    if (R.camTab !== project.tab) { R.camTab = project.tab; if (s.cam) setCam(s.cam.p, s.cam.t); else fit('iso', false); }
    // (and where the one selected part is and how it is turned, so its handles follow it, through an undo too)
    const sel1 = selection().length === 1 ? selection()[0] : null;
    const sk = selection().map(e => e.id).join() + '|' + gz.mode + (sel1 ? '|' + [sel1.x, sel1.y, zOf(sel1), sel1.angle, sel1.tip || 0, sel1.roll || 0, sel1.locked ? 1 : 0].join() : '');
    if (sk !== R.selKey) { R.selKey = sk; highlight(); }
    need();
  }
  /* the camera turned to look at the target, from its angle down from straight up (th) and its
     heading round the vertical (ph): exact straight above or below too, where "up" alone cannot
     say which way the picture is turned (the heading is kept from before there) */
  function aim() {
    const cam = R.camera, d = cam.position.clone().sub(R.target), r = d.length() || 1, hz = Math.hypot(d.x, d.y);
    if (hz > 1e-7 * r) R.heading = Math.atan2(d.y, d.x);
    else if (R.heading === undefined) R.heading = -Math.PI / 2;
    const th = Math.acos(clamp(d.z / r, -1, 1));
    cam.quaternion.setFromEuler(new T.Euler(th, 0, R.heading + Math.PI / 2, 'ZYX'));
    cam.updateMatrixWorld();
  }
  function setCam(p, t) { R.camera.position.fromArray(p); R.target.fromArray(t); aim(); }
  function keepCam() {
    const s = tabState(); if (s) s.cam = { p: R.camera.position.toArray(), t: R.target.toArray() };
    // the tab's 2D view centred where this one looks: a part added from the menu lands in sight
    const c = tablePointNdc(0, 0), v = curBench().view;
    if (c && v) { v.cx = +c[0].toFixed(2); v.cy = +c[1].toFixed(2); }
  }

  /* ---------- the models ---------- */
  /* models taken down: their geometry and pictures freed. Their materials are left to be collected
     rather than disposed: disposing the last material of a kind frees its compiled shader, which the
     next build (each step of a drag) would then compile again, the slowest thing the view does */
  const disposeObj = o => o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.userData.texs) for (const t of x.userData.texs) t.dispose(); const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : []; for (const m of ms) if (m.map) m.map.dispose(); });
  /* what a part's model is made from: everything but where it is, how it is turned and its name, so a
     part moved or turned keeps its model and is only put in its new place (a screen showing its
     pattern on its face is made again each time, its picture changing with the light) */
  const POSE = new Set(['x', 'y', 'z', 'angle', 'tip', 'roll', 'name', 'label', 'sweeps', 'hide3d', 'locked', 'group']);
  const shapeKey = el => { if (el.type === 'screen' && el.faceMap) return null; const o = {}; for (const k in el) if (!POSE.has(k)) o[k] = el[k]; return JSON.stringify(o) + (el.mmw && el.type === 'detector' ? '|' + hornLam(el) : ''); };   // a receiving horn is built for the bench's frequency
  const disposeAll = g => { for (const o of [...g.children]) { g.remove(o); o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.userData.texs) for (const t of x.userData.texs) t.dispose(); const ms = Array.isArray(x.material) ? x.material : x.material ? [x.material] : []; for (const m of ms) if (m.map) m.map.dispose(); }); } };
  const col = c => new T.Color(c);
  const mat = {
    glass: (c = 0xa9d8e6, o = 0.3) => new T.MeshStandardMaterial({ color: col(c), transparent: true, opacity: o, roughness: 0.05, metalness: 0, side: T.DoubleSide, depthWrite: false }),
    metal: (c = 0xe6eaee, r = 0.12) => new T.MeshStandardMaterial({ color: col(c), metalness: 1, roughness: r, side: T.DoubleSide }),
    body: (c = 0x262b30) => new T.MeshStandardMaterial({ color: col(c), metalness: 0.35, roughness: 0.55, side: T.DoubleSide }),
    matte: c => new T.MeshStandardMaterial({ color: col(c), metalness: 0, roughness: 0.8, side: T.DoubleSide }),
    glow: c => new T.MeshStandardMaterial({ color: col(c), emissive: col(c), emissiveIntensity: 0.7, roughness: 0.4, side: T.DoubleSide }),
  };
  const mesh = (g, m) => { const o = new T.Mesh(g, m); o.castShadow = !m.transparent; o.receiveShadow = true; return o; };
  // a solid of revolution about the part's axis (local x): points [x, r]
  const lathe = pts => { const g = new T.LatheGeometry(pts.map(([x, r]) => new T.Vector2(Math.max(0, r), x)), 64); g.rotateZ(-Math.PI / 2); return g; };
  // a disc of thickness t and radius r across the axis, centred at x
  const disc = (t, r, x = 0) => { const g = new T.CylinderGeometry(r, r, t, 64); g.rotateZ(-Math.PI / 2); g.translate(x, 0, 0); return g; };
  const boxG = (x0, x1, y0, y1, z0, z1) => { const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
  // a 2D outline in the bench plane (local x, y), stood up to a height hz about the beam
  const upright = (verts, hz) => { const s = new T.Shape(verts.map(([x, y]) => new T.Vector2(x, y))); const g = new T.ExtrudeGeometry(s, { depth: hz, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, -hz / 2); return g; };
  // a shape across the beam (u along local y, v up), as a plate t thick along the axis
  const ACROSS = () => new T.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const plateShape = (shape, t, x = 0) => { const g = new T.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 48 }); g.translate(0, 0, -t / 2); g.applyMatrix4(ACROSS()); g.translate(x, 0, 0); return g; };
  const circle = (r, cy = 0, cz = 0) => { const p = new T.Path(); p.absarc(cy, cz, r, 0, 2 * Math.PI, false); return p; };
  const rectP = (y0, y1, z0, z1) => new T.Path([new T.Vector2(y0, z0), new T.Vector2(y1, z0), new T.Vector2(y1, z1), new T.Vector2(y0, z1)]);
  const shapeOf = path => { const s = new T.Shape(); s.curves = path.curves; s.currentPoint = path.currentPoint; return s; };
  /* a surface of revolution's face, x = sag(y, z) over a disc (or a square) of half-size a, closed
     by a flat back at x = back: three meshes, so the face stays smooth and the rim sharp */
  function sagSolid(sag, a, back, square, mFace, mRest) {
    const nr = 14, nt = 64, at = (r, th) => { let c = Math.cos(th), s = Math.sin(th); if (square) { const m = Math.max(Math.abs(c), Math.abs(s)); c /= m; s /= m; } return [r * a * c, r * a * s]; };
    const geo = (pos, idx) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const fp = [sag(0, 0), 0, 0], fi = [], F = (i, j) => i === 0 ? 0 : 1 + (i - 1) * nt + (j % nt);
    for (let i = 1; i <= nr; i++) for (let j = 0; j < nt; j++) { const [y, z] = at(i / nr, 2 * Math.PI * j / nt); fp.push(sag(y, z), y, z); }
    for (let j = 0; j < nt; j++) fi.push(0, F(1, j), F(1, j + 1));
    for (let i = 1; i < nr; i++) for (let j = 0; j < nt; j++) fi.push(F(i, j), F(i + 1, j), F(i + 1, j + 1), F(i, j), F(i + 1, j + 1), F(i, j + 1));
    const bp = [back, 0, 0], bi = [], rp = [], ri = [];
    for (let j = 0; j < nt; j++) { const [y, z] = at(1, 2 * Math.PI * j / nt); bp.push(back, y, z); rp.push(sag(y, z), y, z, back, y, z); }
    for (let j = 0; j < nt; j++) { bi.push(0, 1 + (j + 1) % nt, 1 + j); const a1 = 2 * j, a2 = 2 * ((j + 1) % nt); ri.push(a1, a1 + 1, a2 + 1, a1, a2 + 1, a2); }
    return [mesh(geo(fp, fi), mFace), mesh(geo(bp, bi), mRest), mesh(geo(rp, ri), mRest)];
  }
  const sag3 = s => (y, z) => (s.z || 0) + rawSag(s, Math.hypot(y + (s.y0 || 0), z)) - (s.y0 ? s.sag0 : 0);
  /* one part, in its own frame: x along its axis (where it points), y across in the bench
     plane, z up. Returns a group, or null for a part with nothing to show */
  function part(el) {
    const g = new T.Group(), add = (...o) => { for (const x of o) g.add(x); };
    const L = (el.length || 10) / 2;
    if ((el.type === 'source' || el.type === 'detector') && el.mmw && !el.mmw.part) {
      // a horn (see hornShape): its flare, waveguide and flange turned about its axis, square for a
      // diagonal horn; a corrugated horn's grooved bore inside a thick wall
      const H = hornShape(el), gold = mat.metal(0xd8a650, 0.25);
      const turn = pts => {
        if (!H.square) return lathe(pts);
        const g2 = new T.LatheGeometry(pts.map(([x, r]) => new T.Vector2(Math.max(0, r) * Math.SQRT2, x)), 4, Math.PI / 4).toNonIndexed();
        g2.computeVertexNormals(); g2.rotateZ(-Math.PI / 2); return g2;
      };
      if (H.corr) {
        add(mesh(turn([[H.xb, H.rg], [H.xb, H.upper[4][1]], [H.back, H.upper[4][1]], [H.back, 0]]), gold));
        add(mesh(turn([...H.grooves.slice().reverse(), [0, H.upper[0][1]], [-H.Lf, H.upper[1][1]], [-H.Lf, H.rg], [H.xb, H.rg]]), gold));
      } else add(mesh(turn([[0, H.a], [-H.Lf, H.rg], [H.xb, H.rg], [H.xb, H.rFl], [H.back, H.rFl], [H.back, 0]]), gold));
      // the mouth is open: the glow is down at the throat, where the waveguide feeds the flare
      add(mesh(disc(Math.min(0.3, 0.1 * H.rg), H.rg * 0.95, -H.Lf), mat.glow(el.type === 'source' ? el.colour : '#3f9a63')));
      return g;
    }
    switch (el.type) {
      case 'lens': {
        const ss = lensSurfaces(el);
        for (let i = 0; i < ss.length - 1; i++) {
          if (el.materials[i] && el.materials[i].glass === 'AIR') continue;
          const a = ss[i], b = ss[i + 1], m = el.mmw ? mat.glass(0xf4f4ee, 0.88) : mat.glass();   // an RF lens: white plastic
          if (el.cyl === 'plane') {                         // curved in the bench plane, straight up and down
            const out = surfPoints(a, 48).concat(surfPoints(b, 48, true));
            add(mesh(upright(out, 2 * Math.max(a.semi, b.semi)), m));
          } else if (el.cyl === 'out') {                    // curved up and down, straight across
            const A = Object.assign({}, a, a.cylS || {}), B = Object.assign({}, b, b.cylS || {});
            const out = surfPoints(A, 48).concat(surfPoints(B, 48, true));
            const s = new T.Shape(out.map(([x, z]) => new T.Vector2(x, z))), d = 2 * Math.max(a.semi, b.semi);
            const geo = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2); geo.rotateX(Math.PI / 2);
            add(mesh(geo, m));
          } else {
            const pts = [];
            for (let k = 0; k <= 32; k++) { const r = a.semi * k / 32; pts.push([a.z + sagFn(a, r), r]); }
            for (let k = 32; k >= 0; k--) { const r = b.semi * k / 32; pts.push([b.z + sagFn(b, r), r]); }
            add(mesh(lathe(pts), m));
          }
        }
        return g;
      }
      case 'mirror': {
        const [s] = elementSurfaces(el), sg = sag3(s);
        let lo = sg(0, 0); for (let j = 0; j < 32; j++) lo = Math.min(lo, sg(s.semi * Math.cos(j * Math.PI / 16), s.semi * Math.sin(j * Math.PI / 16)));
        const t = Math.max(2, Math.min(10, L * 0.25)), R0 = el.reflect >= 100;
        add(...sagSolid(sg, s.semi, lo - t, false, R0 ? mat.metal() : Object.assign(mat.metal(0xd8e4ea, 0.05), { transparent: true, opacity: 0.35 + 0.55 * el.reflect / 100 }), mat.glass(0xa9d8e6, 0.45)));
        return g;
      }
      case 'screen': {
        const [s] = elementSurfaces(el), sg = sag3(s);
        add(...sagSolid(sg, s.semi, Math.min(sg(0, 0), sg(s.semi, s.semi)) - 1.5, true, mat.matte(0xffb347), mat.body()));
        if (el.faceMap) { const m = faceMapMesh(el, sg(0, 0)); if (m) add(m); }
        return g;
      }
      case 'source': {
        const { L: len, hw } = srcBody(el);
        add(mesh(boxG(-len, 0, -hw, hw, -hw, hw), mat.body(0x2b2622)), mesh(disc(0.6, Math.max(0.6, el.width / 2), 0.3), mat.glow(el.colour || '#ff3030')));
        return g;
      }
      case 'detector': {
        const H = detR(el);
        add(mesh(disc(H * 1.4, H, -H * 0.7), mat.body(0x2b3338)), mesh(disc(0.4, L, 0.2), mat.glow('#3f9a63')));
        return g;
      }
      case 'fibre': {
        const r = Math.max(L, 1.25);
        add(mesh(disc(10, r, -5), mat.metal(0xcfd8dc, 0.3)));
        const j = new T.CylinderGeometry(1.5, 1.5, 40, 24); j.rotateZ(-Math.PI / 2); j.translate(-30, 0, 0);
        add(mesh(j, mat.matte(FIBRE_COLOUR)), mesh(disc(0.3, Math.max(0.3, el.core * 5e-4), 0.15), mat.glow('#ffb347')));
        return g;
      }
      case 'waveplate': case 'polariser': {
        if (el.mod) { add(mesh(disc(1.5, L), mat.glass(parseInt(MOD_COLOURS[el.mod.colour || 'grey'].slice(1), 16), 0.45))); return g; }   // a mod's polarisation plate
        const pol = el.type === 'polariser';
        add(mesh(disc(pol ? 2.5 : 1.5, L), mat.glass(pol ? 0xb79bff : 0x73b9ca, pol ? 0.45 : 0.35)));
        // the axis across the face: p along the bench, s up
        const a = (el.axis || 0) * deg, bar = boxG(-0.1, 0.1, -L * 0.9, L * 0.9, -0.25, 0.25); bar.rotateX(a); bar.translate(pol ? 1.35 : 0.85, 0, 0);
        add(mesh(bar, mat.matte(pol ? 0x6b4fd0 : 0x2f7d8f)));
        return g;
      }
      case 'filter': add(mesh(disc(2, L), mat.glass(filterColour(el), 0.5))); return g;
      case 'mask': add(mesh(disc(1.5, L), mat.glass(el.mod ? parseInt(MOD_COLOURS[el.mod.colour || 'grey'].slice(1), 16) : 0xd8b35a, 0.45))); return g;
      case 'gain': add(mesh(disc(4, L), mat.glass(0xff6a3d, 0.45))); return g;
      case 'faraday': case 'isolator': {
        add(mesh(disc(Math.max(8, L * 1.4), L), mat.metal(0xff9f6b, 0.35)));
        const cone = new T.ConeGeometry(1.6, 4, 16); cone.rotateZ(-Math.PI / 2); cone.translate(0, 0, L + 3);
        add(mesh(cone, mat.matte(0xff9f6b)));
        return g;
      }
      case 'stop': {
        const b = el.outer / 2, o = el.offset || 0, m = mat.metal(0x3a4147, 0.45);
        if (el.shape === 'round') { const s = shapeOf(circle(b)); s.holes.push(circle(el.aperture / 2, o)); add(mesh(plateShape(s, 1.5), m)); }
        else if (el.shape === 'disc') add(mesh(plateShape(shapeOf(circle(el.aperture / 2, o)), 1.5), m));
        else if (el.height > 0) {
          // a plate with openings where the blades leave a gap, as tall as the slit
          const s = shapeOf(rectP(-b, b, -b, b)), bl = stopBlades(el).sort((p, q) => p[0] - q[0]), hz = Math.min(b, el.height / 2);
          let y = -b; for (const [lo, hi] of bl) { if (lo > y + 1e-6) s.holes.push(rectP(y, lo, -hz, hz)); y = Math.max(y, hi); }
          if (b > y + 1e-6) s.holes.push(rectP(y, b, -hz, hz));
          add(mesh(plateShape(s, 1.5), m));
        } else for (const [lo, hi] of stopBlades(el)) add(mesh(boxG(-0.75, 0.75, lo, hi, -b, b), m));
        return g;
      }
      case 'cube': {
        const a = el.size / 2;
        add(mesh(boxG(-a, a, -a, a, -a, a), mat.glass()));
        const p = new T.PlaneGeometry(el.size * Math.SQRT2, el.size); p.rotateX(Math.PI / 2); p.rotateZ(Math.PI / 4);
        add(mesh(p, Object.assign(mat.metal(0xd8e4ea, 0.1), { transparent: true, opacity: 0.3 + 0.5 * (el.reflect || 50) / 100 })));
        return g;
      }
      case 'prism': add(mesh(upright(polyVerts(el), el.size), mat.glass())); return g;
      case 'stl': {
        // its own triangles, at its scale, in its own frame (the group turns it as the trace does)
        const M = meshOf(el); if (!M || !M.n) return g;
        const sc = el.scale || 1, P = new Float32Array(9 * M.n);
        for (let i = 0; i < P.length; i++) P[i] = M.T[i] * sc;
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.computeVertexNormals();
        add(mesh(geo, new T.MeshStandardMaterial({ color: col(el.colour || '#8a8f96'), roughness: 0.65, metalness: 0.25, side: T.DoubleSide })));
        return g;
      }
      case 'crystal': { const G = crystalGeom(el), hz = 2 * Math.max(...G.outline.map(p => Math.abs(p[1]))); add(mesh(upright(G.outline, hz), mat.glass(0xb79bff, 0.3))); return g; }
      case 'grating': {
        const refl = el.mode === 'reflect';
        add(mesh(boxG(refl ? -6 : -1.5, 0, -L, L, -L, L), refl ? mat.metal(0xb7a2e6, 0.25) : mat.glass(0xc9a6ff, 0.35)));
        return g;
      }
      case 'aom': add(mesh(boxG(-4, 4, -L, L, -L * 0.6, L * 0.6), mat.glass(0x9ad0ff, 0.35)), mesh(boxG(-3, 3, L, L + 3, -L * 0.6, L * 0.6), mat.metal(0x8fb8e0, 0.3))); return g;
      case 'eom': {
        const hz = Math.max(1.5, L * 0.5);
        add(mesh(boxG(-6, 6, -L, L, -hz, hz), mat.glass(0xc6a8ff, 0.35)), mesh(boxG(-6, 6, -L, L, hz, hz + 0.6), mat.metal(0xe8c547, 0.3)), mesh(boxG(-6, 6, -L, L, -hz - 0.6, -hz), mat.metal(0xe8c547, 0.3)));
        return g;
      }
      case 'cell': {
        const H = el.cellLen / 2, tube = new T.CylinderGeometry(L, L, 2 * H, 48, 1, true); tube.rotateZ(-Math.PI / 2);
        add(mesh(tube, mat.glass(0xc79bff, 0.28)), mesh(disc(1.2, L, -H), mat.glass(0x73b9ca, 0.4)), mesh(disc(1.2, L, H), mat.glass(0x73b9ca, 0.4)));
        const stem = new T.CylinderGeometry(2.5, 2.5, Math.min(8, L * 0.5), 24); stem.rotateX(Math.PI / 2); stem.translate(0, 0, L + Math.min(8, L * 0.5) / 2);   // its stem up, where the metal sits
        add(mesh(stem, mat.glass(0xc79bff, 0.35)));
        return g;
      }
      case 'nlc': { const H = el.nlLen / 2, hz = Math.max(0.5, L * 0.3); add(mesh(boxG(-H, H, -L, L, -hz, hz), mat.glass(0x78c8a0, 0.4))); return g; }
      case 'link': {
        const p = new T.PlaneGeometry(2 * L, 2 * L); p.rotateY(Math.PI / 2);
        add(new T.Mesh(p, new T.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false })));
        add(new T.LineSegments(new T.EdgesGeometry(p), new T.LineDashedMaterial({ color: 0x7fdcff, dashSize: 3, gapSize: 2 })).computeLineDistances());
        return g;
      }
      case 'chopper': {
        // the wheel across the beam, a gap over the beam (shown open, as on the bench), its motor behind
        const Rw = 2 * L + 5, yc = -(L + 5), n = 8, D0 = clamp((el.duty || 50) / 100, 0.05, 0.95), gap = 2 * Math.PI * D0 / n, m = mat.body(0x2b3338);
        const s = new T.Shape(); s.moveTo(0, 0);
        for (let k = 0; k < n; k++) { const a0 = Math.PI / 2 + gap / 2 + k * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n - gap; s.lineTo(Rw * Math.cos(a0), Rw * Math.sin(a0)); s.absarc(0, 0, Rw, a0, a1, false); s.lineTo(0, 0); }
        const wheel = plateShape(s, 1, 1.5); wheel.translate(0, yc, 0);
        add(mesh(wheel, m), mesh(plateShape(shapeOf(circle(Rw * 0.3)), 1.2, 1.5).translate(0, yc, 0), m), mesh(disc(10, 6, -4.5).translate(0, yc, 0), mat.body(0x1b1f22)));
        return g;
      }
    }
    return null;
  }
  /* a name, drawn the same size on screen however far away */
  function label(text, colour) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 26;
    g.font = '600 ' + fs + 'px system-ui, sans-serif';
    const w = Math.ceil(g.measureText(text).width) + 16;
    c.width = w; c.height = fs + 14;
    g.font = '600 ' + fs + 'px system-ui, sans-serif'; g.fillStyle = 'rgba(16,20,23,0.6)'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = colour || '#e8edf0'; g.textBaseline = 'middle'; g.fillText(text, 8, c.height / 2 + 1);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, transparent: true }));
    const k = 2 * Math.tan(R.camera.fov * deg / 2) / Math.max(1, R.h) * 0.5;      // css px to the sprite's units, at half the canvas's resolution
    sp.scale.set(c.width * k, c.height * k, 1); sp.center.set(0.5, 0); sp.renderOrder = 10;
    return sp;
  }

  /* A screen's diffraction pattern on its face: the Diffraction tab's irradiance map, in its colours
     and scale (lin or log), where the light lands, cut to the face. x along its normal, y across, z up */
  function faceMapMesh(el, x0) {
    const r = diffractionLater(el), D = r && r.D;
    if (!D || !D.map) return null;
    const M = D.map, n = M.n, L = el.length / 2;
    let pk = 0, pi = 0; for (let i = 0; i < M.v.length; i++) { pk = Math.max(pk, M.v[i]); pi = Math.max(pi, M.inc[i]); }
    pk = Math.max(pk, 0.02 * pi);
    const log = el.mapScale === 'log', cv = document.createElement('canvas'); cv.width = cv.height = n;
    const cx = cv.getContext('2d'), img = cx.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let v = M.v[j * n + i] / (pk || 1);
      if (log) v = Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / 3);
      const [rr, gg, bb] = magma(v), o = ((n - 1 - j) * n + i) * 4;
      img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    // the map's rectangle on the face, cut to the face's square
    const u0 = Math.max(M.u0, -L), u1 = Math.min(M.u1, L), v0 = Math.max(M.v0, -L), v1 = Math.min(M.v1, L);
    if (!(u1 > u0 && v1 > v0)) return null;
    const fu = u => (u - M.u0) / (M.u1 - M.u0), fv = v => (v - M.v0) / (M.v1 - M.v0), x = x0 + 0.05;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([x, u0, v0, x, u1, v0, x, u1, v1, x, u0, v1], 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute([fu(u0), fv(v0), fu(u1), fv(v0), fu(u1), fv(v1), fu(u0), fv(v1)], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.magFilter = T.LinearFilter;
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.userData.faceMap = el.id;
    return m;
  }
  // what the screens painted with their pattern show now: the scene is built again when it changes
  const faceMapsKey = () => project.elements.filter(e => e.type === 'screen' && e.faceMap && e.bench === project.tab).map(e => {
    const c = popScreenCache.get(e.id); return e.id + ':' + (c && c.D && c.D.map ? [c.D.peak, c.D.map.u0, c.D.map.v0, c.D.map.u1, e.mapScale].join(',') : '-');
  }).join(';');

  /* ---------- the scene, from the bench ---------- */
  function build() {
    const G = R.groups;
    disposeAll(G.sel);
    // the light: kept with its trace while a sweep plays (see traceStore), else made anew
    for (const o of [...G.light.children]) { G.light.remove(o); if (!o.userData.kept) disposeObj(o); }
    const lc = R.lightCache || (R.lightCache = new Map());
    if (!traceStoreOn() && lc.size) { for (const v of lc.values()) for (const o of v.objs) disposeObj(o); lc.clear(); }
    // the parts and their names are taken down but kept: one whose model is unchanged goes back up
    for (const g of [G.parts, G.names]) for (const o of [...g.children]) g.remove(o);
    const parts = R.partCache || (R.partCache = new Map()), labels = R.labelCache || (R.labelCache = new Map()), used = new Set(), usedL = new Set();
    const els = project.elements.filter(e => e.bench === project.tab && FREE.has(e.type) && e.type !== 'draw' && !e.hide3d), box = new T.Box3();
    for (const el of els) {
      const k = shapeKey(el), c = parts.get(el.id);
      let p = null;
      if (c && k !== null && c.k === k) p = c.obj;
      else {
        if (c) { disposeObj(c.obj); parts.delete(el.id); }
        try { p = part(el); } catch (e) { p = null; }
        if (p) parts.set(el.id, { k, obj: p });
      }
      if (!p) continue;
      used.add(el.id);
      p.position.set(el.x, el.y, zOf(el)); p.rotation.set((el.roll || 0) * deg, -(el.tip || 0) * deg, el.angle * deg, 'ZYX');
      p.userData.id = el.id; p.traverse(o => { o.userData.id = el.id; });
      G.parts.add(p);
      if (names) {
        const P = el.type === 'link' ? linkPartner(el) : null;
        const text = el.name + (el.type === 'link' ? (P ? ' → ' + benchName(P.bench) : ' (no partner)') : ''), lk = el.id + '|' + text + '|' + R.h;
        let sp = labels.get(lk);
        if (!sp) { sp = label(text, el.type === 'link' ? '#7fdcff' : null); labels.set(lk, sp); }
        usedL.add(lk);
        p.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(p);
        sp.position.set(el.x, el.y, (isFinite(b.max.z) ? b.max.z : zOf(el) + 10) + 4); sp.userData.id = el.id;
        G.names.add(sp);
      }
    }
    for (const [id, c] of parts) if (!used.has(id)) { disposeObj(c.obj); parts.delete(id); }
    for (const [lk, sp] of labels) if (!usedL.has(lk)) { disposeObj(sp); sp.material.map && sp.material.map.dispose(); labels.delete(lk); }
    G.parts.updateMatrixWorld(true);
    if (G.parts.children.length) box.setFromObject(G.parts);
    R.partsBox = box.clone();                             // what a fit frames: the parts, not light leaving them
    board(box);
    // the diffracted field as a volume, when the bench shows it: its key changes as it arrives
    const vb = R.boardBox, VL = lightOf().field && vb ? volLater([vb.min.x, vb.min.y, vb.max.x, vb.max.y]) : { data: null, busy: false };
    R.vol = VL.data; R.volBusy = VL.busy;
    const lk = [R.boardKey, benchLight(), lightOf().rays, lightOf().envelope, lightOf().field, lightOf().scale, VL.data ? VL.data.id : VL.busy ? 'b' : '-', project.tab].join('|'), got = lc.get(lastTrace);
    if (got && got.k === lk) { for (const o of got.objs) G.light.add(o); R.nRays = got.nRays; R.nBeams = got.nBeams; }
    else {
      if (got) { for (const o of got.objs) disposeObj(o); lc.delete(lastTrace); }
      light(box, R.boardBox);
      const objs = [...G.light.children];
      if (traceStoreOn()) {
        for (const o of objs) o.userData.kept = true;
        lc.set(lastTrace, { k: lk, objs, nRays: R.nRays, nBeams: R.nBeams });
        // only the traces still kept keep their light
        const live = new Set([...traceStore.values()].map(c => c.T));
        for (const [T2, v] of lc) if (T2 !== lastTrace && !live.has(T2)) { for (const o of v.objs) disposeObj(o); lc.delete(T2); }
      }
    }
    R.volMeshes = G.light.children.filter(o => o.userData.vol);
    keyShow();
    // the sun over the board, its shadow covering it
    const c = new T.Vector3(), s = new T.Vector3();
    (box.isEmpty() ? new T.Box3(new T.Vector3(-100, -100, 0), new T.Vector3(100, 100, 100)) : box).getCenter(c).z = 0;
    (box.isEmpty() ? new T.Vector3(200, 200, 100) : box.getSize(s));
    const rad = Math.max(150, Math.hypot(s.x, s.y) / 2 + 60);
    R.sun.position.set(c.x - 0.45 * rad, c.y - 0.75 * rad, 2.2 * rad); R.sun.target.position.copy(c);
    const sc = R.sun.shadow.camera; sc.left = -rad * 1.2; sc.right = rad * 1.2; sc.top = rad * 1.2; sc.bottom = -rad * 1.2; sc.near = 1; sc.far = 6 * rad; sc.updateProjectionMatrix();
    R.content = box;
    R.selKey = null;
    R.gl.shadowMap.needsUpdate = true;
  }
  /* the light: rays as lines, Gaussian beams as tubes as wide as the beam both ways */
  /* a stretch from (x0, y0) to (x1, y1) cut to the board: [t0, t1] of it, or null */
  function cut(x0, y0, x1, y1, bb) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    for (const [p, q] of [[-dx, x0 - bb.min.x], [dx, bb.max.x - x0], [-dy, y0 - bb.min.y], [dy, bb.max.y - y0]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return t1 > t0 ? [t0, t1] : null;
  }
  /* the light: rays as lines, Gaussian beams as tubes as wide as the beam both ways, each cut
     where it leaves the board (light off the table goes on, on the 2D bench) */
  function light(box, bb) {
    const G = R.groups.light, add = !benchLight();
    const blend = add ? T.AdditiveBlending : T.NormalBlending;
    const groups = new Map();
    for (const r of lightOf().rays ? lastTrace.rays || [] : []) {
      if (r.bench !== project.tab || !r.pts || r.pts.length < 4) continue;
      const lvl = Math.max(1, Math.round(10 * Math.pow(r.w, 0.5))), key = r.colour + '|' + lvl;
      if (!groups.has(key)) groups.set(key, { colour: r.colour, alpha: 0.08 + 0.72 * lvl / 10, pos: [] });
      const P = groups.get(key).pos, p = r.pts, zs = r.zs;
      for (let i = 2; i < p.length; i += 2) {
        const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1], c = cut(x0, y0, x1, y1, bb);
        const z0 = zs ? zs[(i >> 1) - 1] : BEAM_H, z1 = zs ? zs[i >> 1] : BEAM_H;
        if (c) P.push(x0 + (x1 - x0) * c[0], y0 + (y1 - y0) * c[0], z0 + (z1 - z0) * c[0], x0 + (x1 - x0) * c[1], y0 + (y1 - y0) * c[1], z0 + (z1 - z0) * c[1]);
      }
    }
    R.nRays = 0;
    for (const g of groups.values()) {
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(g.pos, 3));
      G.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: col(g.colour), transparent: true, opacity: g.alpha, blending: blend, depthWrite: false })));
      R.nRays += g.pos.length / 6;
      geo.computeBoundingBox(); box.union(geo.boundingBox);
    }
    // Gaussian beams: in the bench plane as the tracer has them, out of it carried along each
    // branch by the same matrices the cavities and fibre tips use
    const B = lastTrace.beams || [], qy = new Map(), m2 = new Map(), done = new Set();
    const qyAt = i => {
      if (qy.has(i)) return qy.get(i);
      const b = B[i];
      let q;
      if (b.parent === undefined || b.parent < 0 || !B[b.parent]) q = [b.qr / b.n, b.qi / b.n];
      else { const p = qyAt(b.parent), pb = B[b.parent], e = p && qThrough(mfree(pb.len3 || pb.len, pb.n), p), m = e && cavEventABCD(b.ev, b.nm * 1e-6); q = m ? qThrough(m.y, e) : null; }
      qy.set(i, q); return q;
    };
    R.nBeams = 0;
    B.forEach((seg, i) => {
      if (!lightOf().envelope || seg.fan || seg.pol || seg.bench !== project.tab || !((seg.len3 || seg.len) > 0)) return;
      const src = getEl(seg.src);
      if (!src) return;
      if (!m2.has(seg.src)) m2.set(seg.src, [m2Env(src), m2Of(src) * modeM2(src)[1]]);
      const [Mx, My] = m2.get(seg.src), q0 = qyAt(i), lam0 = seg.nm * 1e-6;
      // a beam with its axes turned: its ellipse from its whole Q along the segment (see beamQ)
      const QG = beamQ(B.map((b2, j) => j === i ? Object.assign({}, b2, { len: 0, len3: 0 }) : b2), i, lam0);
      const k = [seg.x0, seg.y0, seg.dx, seg.dy, seg.len, seg.qr, seg.qi].map(v => v.toFixed(3)).join() + seg.colour;
      if (done.has(k)) return;
      done.add(k);
      // along the beam in 3D (d3, len3 when it rises; a leg straight up has no length in the plane)
      const L3 = seg.len3 || seg.len, d = seg.d3 || [seg.dx, seg.dy, seg.uz || 0], up = seg.d3 && !(seg.len > 1e-9);
      const c = up ? [0, Math.min(1, 400 / L3)] : cut(seg.x0, seg.y0, seg.x0 + seg.dx * seg.len, seg.y0 + seg.dy * seg.len, bb);
      if (!c) return;
      // past each end as far as its surface runs across the beam, cut along the surface (see segPlanes)
      const PL = segPlanes(B, i), wEnd = Math.max(...[0, L3].map(t => { const b2 = beamAt(seg.qr + t, seg.qi, seg.n, seg.nm, Mx); return b2 ? b2.w : 0; })) * 1.6;
      const ta = c[0] * L3 - (c[0] === 0 && PL.p0 ? Math.min(5, PL.p0.tan) * wEnd : 0), tb = c[1] * L3 + (c[1] === 1 && PL.p1 ? Math.min(5, PL.p1.tan) * wEnd : 0);
      const steps = Math.max(8, Math.min(64, Math.round((tb - ta) / 4))), nt = 20, pos = [], idx = [];
      // across it: level, and up out of the plane square to it
      const hl = Math.hypot(d[0], d[1]), nx = hl > 1e-9 ? -d[1] / hl : -seg.dy, ny = hl > 1e-9 ? d[0] / hl : seg.dx;
      const dl = Math.hypot(d[0], d[1], d[2]), e = d.map(v => v / dl), vx = e[1] * 0 - e[2] * ny, vy = e[2] * nx - e[0] * 0, vz = e[0] * ny - e[1] * nx;
      for (let s = 0; s <= steps; s++) {
        const t = ta + (tb - ta) * s / steps, b = beamAt(seg.qr + t, seg.qi, seg.n, seg.nm, Mx);
        const wx = b ? b.w : 0, wy = q0 ? Math.sqrt(My) * qW([q0[0] + t / seg.n, q0[1]], lam0) : wx;
        const x = seg.x0 + e[0] * t, y = seg.y0 + e[1] * t, zc = seg.z0 !== undefined ? seg.z0 + e[2] * t : BEAM_H;
        if (QG) {
          // the 1/e^2 ellipse of exp(k r.Im(P).r): its axes and their turn, from -Im P
          const P = ccInv(QFree(QG, t / seg.n)), a = -P[0][1], b2 = -P[1][1], c = -P[3][1], k = 2 * Math.PI / lam0;
          const th = 0.5 * Math.atan2(2 * b2, a - c), m1 = 0.5 * (a + c) + Math.hypot(0.5 * (a - c), b2), m2v = 0.5 * (a + c) - Math.hypot(0.5 * (a - c), b2);
          const W1 = Math.sqrt(Mx) * Math.sqrt(2 / (k * Math.max(1e-30, m1))), W2 = Math.sqrt(My) * Math.sqrt(2 / (k * Math.max(1e-30, m2v))), ct = Math.cos(th), st = Math.sin(th);
          for (let j = 0; j < nt; j++) { const a2 = 2 * Math.PI * j / nt, p1 = Math.cos(a2) * W1, p2 = Math.sin(a2) * W2, u = p1 * ct - p2 * st, v = p1 * st + p2 * ct; pos.push(x + nx * u + vx * v, y + ny * u + vy * v, zc + vz * v); }
          continue;
        }
        for (let j = 0; j < nt; j++) { const a = 2 * Math.PI * j / nt, u = Math.cos(a) * wx, v = Math.sin(a) * (isFinite(wy) ? wy : wx); pos.push(x + nx * u + vx * v, y + ny * u + vy * v, zc + vz * v); }
      }
      for (let s = 0; s < steps; s++) for (let j = 0; j < nt; j++) { const a = s * nt + j, b = s * nt + (j + 1) % nt; idx.push(a, a + nt, b + nt, a, b + nt, b); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      G.add(new T.Mesh(geo, new T.MeshBasicMaterial({ clippingPlanes: segClip3(PL), color: col(seg.colour), transparent: true, opacity: (add ? 0.16 : 0.22) * (seg.hole > 0 ? clamp(Math.sqrt(seg.w || 0), 0.15, 1) : 1), blending: blend, side: T.DoubleSide, depthWrite: false })));
      R.nBeams++;
      geo.computeBoundingBox(); box.union(geo.boundingBox);
    });
    if (lightOf().field && R.vol) volMeshes(G);
  }
  // a segment's planes as the renderer's clipping planes (the world is the bench's frame, in mm)
  // always two (one that cuts nothing standing in), so every beam shares one compiled shader
  const segClip3 = P => [P.p0, P.p1].map(q => q ? new T.Plane(new T.Vector3(...q.n3), -(q.n3[0] * q.x + q.n3[1] * q.y + q.n3[2] * q.z)) : new T.Plane(new T.Vector3(0, 0, 1), 1e9));
  /* The diffracted field as a glowing volume, segment by segment: a box round each, its shader
     marching the view's ray through it in steps fitted to the beam (long outside it, short
     across it, and never past more than half the gap between two cuts along it) and keeping the
     brightest irradiance it meets, in the bench's colours and scale (lin or log, 30 dB) against
     the brightest on the tab: what the key under it reads */
  const VOL_VS = 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const VOL_FS = `
    uniform sampler2D uTex, uMap; uniform float uTs[64], uRm[64]; uniform int uNc, uM, uTwo; uniform float uTa, uTb, uZa, uZb, uR, uDec; uniform vec3 uCam; uniform vec4 uP0, uP1;
    varying vec3 vP;
    // the two cuts either side of t, how far between them, the larger reach, and their gap
    void cutAt(float t, out int lo, out int hi, out float f, out float rm, out float gap) {
      lo = 0; hi = uNc - 1;
      for (int k = 0; k < 7; k++) { if (hi - lo <= 1) break; int m = (lo + hi) / 2; if (uTs[m] <= t) lo = m; else hi = m; }
      float a = uTs[lo], b = uTs[hi];
      f = b > a ? clamp((t - a) / (b - a), 0.0, 1.0) : 0.0; rm = max(uRm[lo], uRm[hi]); gap = max(b - a, 1e-6);
    }
    // one cut's irradiance at a point across the beam, nothing beyond its reach
    float row(int j, vec2 xy) {
      float M = float(uM), nc = float(uNc), rm = uRm[j];
      if (uTwo == 0) { float q = length(xy) / rm; return q > 1.0 ? 0.0 : texture2D(uTex, vec2((sqrt(q) * (M - 1.0) + 0.5) / M, (float(j) + 0.5) / nc)).r; }
      vec2 u = xy / rm;
      if (max(abs(u.x), abs(u.y)) > 1.0) return 0.0;
      vec2 g = (u * 0.5 + 0.5) * (M - 1.0) + 0.5;
      return texture2D(uTex, vec2(g.x / M, (float(j) * M + g.y) / (M * nc))).r;
    }
    void main() {
      vec3 ro = uCam, rd = normalize(vP - uCam);
      vec3 sg = vec3(rd.x < 0.0 ? -1.0 : 1.0, rd.y < 0.0 ? -1.0 : 1.0, rd.z < 0.0 ? -1.0 : 1.0), iv = sg / max(abs(rd), vec3(1e-9));
      vec3 t0 = (vec3(-uR, -uR, uZa) - ro) * iv, t1 = (vec3(uR, uR, uZb) - ro) * iv, tn = min(t0, t1), tf = max(t0, t1);
      float sN = max(max(max(tn.x, tn.y), tn.z), 0.0), sF = min(min(tf.x, tf.y), tf.z);
      if (sF <= sN) discard;
      float sp = sN, best = 0.0, minStep = (sF - sN) / 4000.0, side = sqrt(max(1.0 - rd.z * rd.z, 1e-6)), along = max(abs(rd.z), 1e-6);
      for (int i = 0; i < 320; i++) {
        if (sp > sF) break;
        vec3 p = ro + rd * sp;
        int lo, hi; float f, rm, gap; cutAt(clamp(p.z, uTa, uTb), lo, hi, f, rm, gap);
        float q = uTwo == 0 ? length(p.xy) / rm : max(abs(p.x), abs(p.y)) / rm, ds;
        if (q > 1.0) ds = min((q - 1.0) * rm * 0.6 / side, gap / along);
        else {
          // the two cuts each at this distance from the axis (not the same share of their reach),
          // only between the surfaces the segment runs from and to
          if (dot(uP0.xyz, p) + uP0.w >= 0.0 && dot(uP1.xyz, p) + uP1.w >= 0.0) best = max(best, mix(row(lo, p.xy), row(hi, p.xy), f));
          ds = min(max(min(uRm[lo], uRm[hi]), 0.25 * rm) * 0.12 / side, gap * 0.5 / along);   // a cut with almost no reach does not stall the march
        }
        sp += max(ds, minStep);
      }
      float v = best;
      if (uDec > 0.0) v = clamp(1.0 + log(max(v, 1e-12)) / log(10.0) / uDec, 0.0, 1.0);
      if (v <= 0.002) discard;
      gl_FragColor = vec4(texture2D(uMap, vec2(v, 0.5)).rgb, clamp(0.25 + 0.75 * v, 0.0, 0.92) * smoothstep(0.0, 0.06, v));
    }`;
  function volPlanes(s) {
    const B = lastTrace.beams || [], none = new T.Vector4(0, 0, 0, 1);
    const k = B.findIndex(b => Math.abs(b.x0 - s.o[0]) < 1e-6 && Math.abs(b.y0 - s.o[1]) < 1e-6 && (() => { const d = b.d3 || [b.dx, b.dy, b.uz || 0], l = Math.hypot(...d); return (d[0] * s.e[0] + d[1] * s.e[1] + d[2] * s.e[2]) / l > 0.9999; })());
    if (k < 0) return { pl: [none, none], ext: [0, 0] };
    const P = segPlanes(B, k), ex = [s.n[0], s.n[1], 0], ez = s.e, ey = [ez[1] * ex[2] - ez[2] * ex[1], ez[2] * ex[0] - ez[0] * ex[2], ez[0] * ex[1] - ez[1] * ex[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const loc = q => { if (!q) return none; const n = [dot(q.n3, ex), dot(q.n3, ey), dot(q.n3, ez)], r = [q.x - s.o[0], q.y - s.o[1], q.z - s.o[2]], pp = [dot(r, ex), dot(r, ey), dot(r, ez)]; return new T.Vector4(n[0], n[1], n[2], -dot(n, pp)); };
    return { pl: [loc(P.p0), loc(P.p1)], ext: [P.p0 ? Math.min(5, P.p0.tan) : 0, P.p1 ? Math.min(5, P.p1.tan) : 0] };
  }
  let magmaTex = null;
  function volMeshes(G) {
    const V = R.vol, dec = fieldDec(lightOf().scale);
    if (!magmaTex) {
      const d = new Uint8Array(256 * 4);
      for (let i = 0; i < 256; i++) { const c = magma(i / 255); d.set([c[0], c[1], c[2], 255], i * 4); }
      magmaTex = new T.DataTexture(d, 256, 1, T.RGBAFormat); magmaTex.magFilter = magmaTex.minFilter = T.LinearFilter; magmaTex.needsUpdate = true;
    }
    // the brightest drawn last, over the rest: each pixel shows the brightest light along its line of sight
    const rank = new Map([...V.segs].sort((a, b) => a.peak - b.peak).map((s, k) => [s, k]));
    for (const s of V.segs) {
      const nc = Math.min(64, s.ts.length), M = s.M, data = new Float32Array(s.I.length);
      const top = volDisp(V);
      for (let i = 0; i < data.length; i++) data[i] = Math.min(1e4, s.I[i] / top);   // above the top colour, held at it (half floats end at 65504)
      const tex = new T.DataTexture(data, M, s.two ? M * nc : nc, T.RedFormat, T.FloatType);
      tex.internalFormat = 'R16F'; tex.magFilter = tex.minFilter = T.LinearFilter; tex.needsUpdate = true;
      const Rm = Math.max(...s.rmax), ts = new Float32Array(64), rm = new Float32Array(64);
      // the surfaces its beam runs between, in the box's own frame (x across, z along), and how far past its ends to reach them
      const { pl, ext } = volPlanes(s);
      for (let j = 0; j < 64; j++) { ts[j] = s.ts[Math.min(j, nc - 1)]; rm[j] = s.rmax[Math.min(j, nc - 1)]; }
      const za = s.ta - ext[0] * Rm, zb = s.tb + ext[1] * Rm, geo = new T.BoxGeometry(2 * Rm, 2 * Rm, zb - za); geo.translate(0, 0, (za + zb) / 2);
      const m3 = new T.ShaderMaterial({ vertexShader: VOL_VS, fragmentShader: VOL_FS, transparent: true, depthWrite: false, side: T.BackSide,
        uniforms: { uTex: { value: tex }, uMap: { value: magmaTex }, uTs: { value: ts }, uRm: { value: rm }, uNc: { value: nc }, uM: { value: M }, uTwo: { value: s.two ? 1 : 0 },
          uDec: { value: dec }, uTa: { value: s.ta }, uTb: { value: s.tb }, uZa: { value: za }, uZb: { value: zb }, uP0: { value: pl[0] }, uP1: { value: pl[1] }, uR: { value: Rm }, uCam: { value: new T.Vector3() } } });
      const o = new T.Mesh(geo, m3);
      const ex = new T.Vector3(s.n[0], s.n[1], 0), ez = new T.Vector3(s.e[0], s.e[1], s.e[2]), ey = ez.clone().cross(ex);
      o.matrixAutoUpdate = false; o.matrix.makeBasis(ex, ey, ez).setPosition(s.o[0], s.o[1], s.o[2]);
      o.renderOrder = 2 + rank.get(s);
      o.userData.vol = s; o.userData.texs = [tex];
      // its near faces are drawn, so the depth test is where the light starts along each line of sight, and
      // a part behind the beam (a screen with its pattern on its face) does not hide light in front of it;
      // from inside the box, its far faces (the march itself starts at the eye)
      o.onBeforeRender = (r, sc, cam) => {
        const c = m3.uniforms.uCam.value.copy(cam.position).applyMatrix4(o.matrixWorld.clone().invert()), pad = 1e-3 * (Rm + zb - za);
        m3.side = Math.abs(c.x) < Rm + pad && Math.abs(c.y) < Rm + pad && c.z > za - pad && c.z < zb + pad ? T.BackSide : T.FrontSide;
      };
      G.add(o);
    }
  }
  /* the key under the 3D view while it shows the field: its colours against irradiance, and
     what is under the pointer */
  function keyShow() {
    if (!D) return;
    const on = active() && R && lightOf().field && (R.vol || R.volBusy);
    D.vkey.hidden = !on;
    if (!on) return;
    if (!R.vol) { D.vkey.replaceChildren(h('b', null, 'Working out the field in 3D\u2026')); return; }
    const pk = volDisp(R.vol), over = pk < 0.999 * R.vol.peak, dec = fieldDec(lightOf().scale), cv = document.createElement('canvas');
    cv.width = 240; cv.height = 1;
    const g = cv.getContext('2d'), img = g.createImageData(240, 1);
    for (let i = 0; i < 240; i++) { const c = magma(i / 239); img.data.set([c[0], c[1], c[2], 255], i * 4); }
    g.putImageData(img, 0, 0);
    const ticks = dec ? [[0, pk * 10 ** -dec], [0.5, pk * 10 ** (-dec / 2)], [1, pk]] : [[0, 0], [0.5, pk / 2], [1, pk]];
    D.vread = h('div', { class: 'rd' }, 'Point at the light to read it');
    D.vkey.replaceChildren(h('b', null, 'Irradiance' + (dec ? ', log (' + dec * 10 + ' dB)' : '')), cv,
      h('div', { class: 'tk' }, ...ticks.map(([f, v]) => h('span', { style: 'left:' + (100 * f) + '%', title: f === 1 && over ? 'Brighter light (up to ' + fmtIrr(R.vol.peak) + ', where the beam is narrowest) shows in this colour too' : null }, v ? (f === 1 && over ? '\u2265 ' : '') + fmtIrr(v) : '0'))),
      D.vread);
  }
  /* the brightest irradiance along the line of sight under the pointer, and where: { I, p } */
  function volUnder(e) {
    if (!R || !R.vol || !R.volMeshes || !R.volMeshes.length) return null;
    const rc = new T.Raycaster(); rc.setFromCamera(ndc(e), R.camera);
    let best = null;
    for (const o of R.volMeshes) {
      const inv = o.matrixWorld.clone().invert(), ro = rc.ray.origin.clone().applyMatrix4(inv), rd = rc.ray.direction.clone().transformDirection(inv);
      const r = volRayMax(o.userData.vol, ro.toArray(), rd.toArray());
      if (r && (!best || r.I > best.I)) best = { I: r.I, p: rc.ray.at(r.s, new T.Vector3()).toArray() };
    }
    return best;
  }
  function readVol(e) {
    if (!D || !D.vread || D.vkey.hidden) return;
    const r = volUnder(e);
    D.vread.textContent = r ? fmtIrr(r.I) + ' at ' + r.p.map(v => v.toFixed(1)).join(', ') + ' mm' : 'Point at the light to read it';
  }
  /* the breadboard under it all, its holes on the bench's 25 mm grid */
  function board(box) {
    // round the parts, with room to spare, out to whole holes
    const b = box.isEmpty() ? new T.Box3(new T.Vector3(-150, -100, 0), new T.Vector3(150, 100, 0)) : box, mg = 75;
    const x0 = Math.floor((b.min.x - mg) / PITCH) * PITCH - PITCH / 2, x1 = Math.ceil((b.max.x + mg) / PITCH) * PITCH + PITCH / 2;
    const y0 = Math.floor((b.min.y - mg) / PITCH) * PITCH - PITCH / 2, y1 = Math.ceil((b.max.y + mg) / PITCH) * PITCH + PITCH / 2;
    // made again only when its size or look changes, which it does a hole's pitch at a time
    const bk = [x0, x1, y0, y1, benchBg(), benchHoles()].join();
    if (bk === R.boardKey && R.groups.board.children.length) return;
    R.boardKey = bk; R.boardBelow = false;               // (a new board is opaque: draw fades it again if need be)
    disposeAll(R.groups.board);
    const bg = benchBg(), side = new T.MeshStandardMaterial({ color: col(bg), roughness: 0.7, metalness: 0.25 });
    let top = side;
    if (benchHoles()) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
      const L0 = new T.Color(bg).getHSL({}).l > 0.5;
      g.fillStyle = L0 ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(32, 32, 8, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = L0 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5; g.stroke();
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set((x1 - x0) / PITCH, (y1 - y0) / PITCH); t.anisotropy = 8;
      top = new T.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 0.7, metalness: 0.25 });
    }
    const m = new T.Mesh(boxG(x0, x1, y0, y1, -BOARD_T, 0), [side, side, side, side, top, side]);
    m.receiveShadow = true;
    R.groups.board.add(m);
    R.boardBox = new T.Box3(new T.Vector3(x0, y0, -BOARD_T), new T.Vector3(x1, y1, 0));
  }
  /* the selected parts outlined, as a CAD program does */
  function highlight() {
    disposeAll(R.groups.sel);
    R.ring = null; R.lift = null; R.tip = null; R.roll = null; R.moveX = null; R.moveY = null;
    const ids = new Set(selection().map(e => e.id));
    if (!ids.size) { need(); return; }
    // One part selected: arrows to move it along the bench's x and y and up, out of both sides of it
    // (x Jek orange, y chip green, up Jek blue), or, clicked again, three rings crossing on a sphere
    // round it, crossing, to turn it about each of its three axes, each the colour of the axis
    // it turns about: blue about the vertical (its facing), green about its own across axis (its
    // tip), orange about the way it faces (its roll)
    const one = selection().length === 1 ? selection()[0] : null, P = one && R.groups.parts.children.find(q => q.userData.id === one.id);
    if (!one || gz.id !== one.id) gz = { id: one ? one.id : null, mode: 'move' };
    if (P && !one.locked) {
      const b = new T.Box3().setFromObject(P), rr = Math.max(10, Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2 + 6);
      const c = new T.Vector3(one.x, one.y, zOf(one)), a = one.angle * deg, ca = Math.cos(a), sa = Math.sin(a);
      const ORANGE = 0xf47742, GREEN = 0x3a9d5d, BLUE = 0x0092b2;
      // drawn over the parts, so a handle behind a part still shows and can be taken hold of
      const mat = (color, op) => new T.MeshBasicMaterial({ color, transparent: true, opacity: op || 1, depthTest: false, depthWrite: false });
      const put = o => { o.renderOrder = 10; R.groups.sel.add(o); return o; };
      const unseen = () => new T.MeshBasicMaterial({ visible: false });
      if (gz.mode === 'move') {
        // each axis an arrow out of either side of the part, from just clear of it
        const arrow = (dir, color) => {
          const m = mat(color), hit = [], ends = [];
          for (const sg of [1, -1]) {
            const d = dir.clone().multiplyScalar(sg), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d);
            // how far the part reaches that way from its centre
            const reach = Math.max(0, ...[b.min, b.max].flatMap(u => [b.min, b.max].flatMap(v => [b.min, b.max].map(w => new T.Vector3(u.x, v.y, w.z).sub(c).dot(d)))));
            const s0 = reach + 2, len = 12;
            const stem = put(new T.Mesh(new T.CylinderGeometry(0.6, 0.6, len, 10), m)); stem.quaternion.copy(q); stem.position.copy(c).addScaledVector(d, s0 + len / 2);
            const cone = put(new T.Mesh(new T.ConeGeometry(2.2, 5, 16), m)); cone.quaternion.copy(q); cone.position.copy(c).addScaledVector(d, s0 + len + 2.5);
            const h = new T.Mesh(new T.CylinderGeometry(3.5, 3.5, len + 5, 8), unseen()); h.quaternion.copy(q); h.position.copy(c).addScaledVector(d, s0 + (len + 5) / 2);
            R.groups.sel.add(h); hit.push(cone, h); ends.push(c.clone().addScaledVector(d, s0 + len + 2.5));
          }
          return { el: one, dir, hit, end: ends[0] };
        };
        R.moveX = arrow(new T.Vector3(1, 0, 0), ORANGE);
        R.moveY = arrow(new T.Vector3(0, 1, 0), GREEN);
        R.lift = arrow(new T.Vector3(0, 0, 1), BLUE);
      } else {
        // the rings: one size, square to each other, so they cross where the axes meet the sphere
        const ring = (n, u, v, color, ang, off) => {
          const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
          const tor = put(new T.Mesh(new T.TorusGeometry(rr, 0.9, 10, 128), mat(color, 0.95))); tor.quaternion.copy(q); tor.position.copy(c);
          const grip = new T.Mesh(new T.TorusGeometry(rr, 3.5, 8, 96), unseen()); grip.quaternion.copy(q); grip.position.copy(c); R.groups.sel.add(grip);
          const at = t => c.clone().addScaledVector(u, rr * Math.cos(t)).addScaledVector(v, rr * Math.sin(t));
          // a dot to take hold of it by: an eighth of a turn from where the part is turned to (on for
          // two rings, back for the third, so no two dots meet), clear of where the rings cross; it
          // moves round as the part turns
          const grab = at(ang + off);
          const knob = put(new T.Mesh(new T.SphereGeometry(2.6, 16, 12), mat(color))); knob.position.copy(grab);
          const kh = new T.Mesh(new T.SphereGeometry(4, 10, 8), unseen()); kh.position.copy(grab); R.groups.sel.add(kh);
          return { el: one, grip, knob, hit: [grip, knob, kh], dot: [knob, kh], n, u, v, c, at, grab };
        };
        const Z = new T.Vector3(0, 0, 1), fw = new T.Vector3(ca, sa, 0), ac = new T.Vector3(-sa, ca, 0);
        R.ring = ring(Z, new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), BLUE, a, Math.PI / 4);
        if (tippable(one)) {
          const tp = (one.tip || 0) * deg, f = new T.Vector3(Math.cos(tp) * ca, Math.cos(tp) * sa, Math.sin(tp));
          R.tip = ring(ac, fw, Z, GREEN, tp, Math.PI / 4);
          R.roll = ring(f, ac, f.clone().cross(ac), ORANGE, (one.roll || 0) * deg, -Math.PI / 4);
        }
      }
      R.groups.sel.updateMatrixWorld(true);              // placed now, so a press can find it before the next frame
    }
    const m = new T.LineBasicMaterial({ color: 0xff8c42, depthTest: false, transparent: true, opacity: 0.95 });
    for (const p of R.groups.parts.children) {
      if (!ids.has(p.userData.id)) continue;
      p.updateMatrixWorld(true);
      p.traverse(o => { if (!o.isMesh) return; const e = new T.LineSegments(new T.EdgesGeometry(o.geometry, 30), m); e.applyMatrix4(o.matrixWorld); e.renderOrder = 5; R.groups.sel.add(e); });
    }
    need();
  }

  /* ---------- looking about ---------- */
  function contentBox() { return R.partsBox && !R.partsBox.isEmpty() ? R.partsBox : R.content && !R.content.isEmpty() ? R.content : R.boardBox || new T.Box3(new T.Vector3(-150, -100, 0), new T.Vector3(150, 100, 100)); }
  function fit(dirName, animate) {
    if (!R) return;
    const b = contentBox(), c = b.getCenter(new T.Vector3()), r = Math.max(20, b.getBoundingSphere(new T.Sphere()).radius);
    const dir = dirName ? new T.Vector3(...VIEWS[dirName]).normalize() : R.camera.position.clone().sub(R.target).normalize();
    const fov = R.camera.fov * deg / 2, fovH = Math.atan(Math.tan(fov) * R.camera.aspect), dist = r / Math.sin(Math.min(fov, fovH)) * 1.05;
    go(c.clone().add(dir.multiplyScalar(dist)), c, animate);
  }
  function view(name) { fit(name, true); }
  /* the camera to a new place, turning smoothly about the target there */
  function go(p, t, animate) {
    if (!animate) { setCam(p.toArray(), t.toArray()); keepCam(); need(); return; }
    const p0 = R.camera.position.clone(), t0 = R.target.clone(), d0 = p0.clone().sub(t0), d1 = p.clone().sub(t);
    const l0 = d0.length(), l1 = d1.length(), q = new T.Quaternion().setFromUnitVectors(d0.clone().normalize(), d1.clone().normalize()), I = new T.Quaternion();
    const t1 = performance.now(), dur = 320, id = {};
    R.anim = id;
    const step = () => {
      if (R.anim !== id) return;
      const u = Math.min(1, (performance.now() - t1) / dur), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const tt = t0.clone().lerp(t, e), dd = d0.clone().normalize().applyQuaternion(I.clone().slerp(q, e)).multiplyScalar(l0 + (l1 - l0) * e);
      R.camera.position.copy(tt).add(dd); R.target.copy(tt); aim(); draw();
      if (u < 1) requestAnimationFrame(step); else { R.anim = null; keepCam(); }
    };
    step();
  }
  let rc0 = null, gz = { id: null, mode: 'move' };      // gz: the selected part's handles, its arrows (move) or its rings (rotate)
  const ray = { get: () => rc0 || (rc0 = new T.Raycaster()) };
  /* the point on the beam's plane under a canvas point (normalised device coordinates), [x, y] */
  function tablePointNdc(x, y, z) {
    if (!R) return null;
    const rc = ray.get(); rc.setFromCamera({ x, y }, R.camera);
    const p = new T.Vector3();
    return rc.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -(z === undefined ? BEAM_H : z)), p) ? [p.x, p.y] : null;
  }
  /* ...under a point on the screen (client px): for a part dropped onto the 3D view */
  function tablePoint(cx, cy) { if (!R) return null; const b = D.cv.getBoundingClientRect(); return tablePointNdc((cx - b.left) / b.width * 2 - 1, -(cy - b.top) / b.height * 2 + 1); }
  function ndc(e) { const b = D.cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * 2 - 1, y: -(e.clientY - b.top) / b.height * 2 + 1, px: e.clientX - b.left, py: e.clientY - b.top }; }
  /* the handle under a point (ndc): 'x', 'y' or 'lift' (the arrows), 'ring', 'tip' or 'roll' (the
     rings), the nearest to the eye where they cross */
  function handleUnder(n) {
    const rc = ray.get(); rc.setFromCamera(n, R.camera);
    let best = null, bd = Infinity;
    for (const [k, G] of [['x', R.moveX], ['y', R.moveY], ['lift', R.lift], ['ring', R.ring], ['tip', R.tip], ['roll', R.roll]]) {
      if (!G) continue;
      // a ring's dot before any ring: where a dot sits over another ring, the dot is what is meant
      const hs = rc.intersectObjects(G.hit, false), dot = G.dot && hs.find(h => G.dot.includes(h.object));
      if (hs.length) { const d = dot ? dot.distance - 1e3 : hs[0].distance; if (d < bd) { bd = d; best = k; } }
    }
    return best;
  }
  /* where the pointer is round a ring, radians from its u towards its v; null seen edge on */
  function ringAngle(G, e) {
    const rc = ray.get(); rc.setFromCamera(ndc(e), R.camera);
    if (Math.abs(rc.ray.direction.dot(G.n)) < 0.17) return null;
    const p = new T.Vector3();
    if (!rc.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(G.n, G.c), p)) return null;
    p.sub(G.c); return Math.atan2(p.dot(G.v), p.dot(G.u));
  }
  /* what is under a point on the canvas: the nearest part, else the beam plane, else the board */
  function pick(e, partsOnly) {
    const n = ndc(e), rc = ray.get(); rc.setFromCamera(n, R.camera);
    const hit = rc.intersectObjects(R.groups.parts.children, true)[0];
    if (hit || partsOnly) return hit || null;
    const b = rc.intersectObjects(R.groups.board.children, true)[0];
    if (b) return b;
    const p = new T.Vector3(); return rc.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -BEAM_H), p) ? { point: p } : null;
  }
  function inCube(n) { const c = cubeRect(); return n.px >= c.x && n.px <= c.x + c.w && n.py >= c.y && n.py <= c.y + c.h; }
  /* where on the cube a point lands: the corner, edge or face a click there looks from, as the
     signs of x, y and up (each of the cube's faces is cut in thirds each way: a corner's three
     cells, an edge's two, a face's middle) */
  const CUBE_CUT = 0.32;
  function cubeRegion(e) {
    const n = ndc(e), c = cubeRect(), rc = ray.get();
    if (!inCube(n)) return null;
    cubeAim();
    rc.setFromCamera({ x: (n.px - c.x) / c.w * 2 - 1, y: -(n.py - c.y) / c.h * 2 + 1 }, R.cubeCam);
    const hit = rc.intersectObject(R.box, false)[0];
    return hit ? [hit.point.x, hit.point.y, hit.point.z].map(v => Math.abs(v) > CUBE_CUT ? Math.sign(v) : 0) : null;
  }
  /* the region under the pointer, shaded: every cell of it, on each face it reaches */
  function cubeHover(s) {
    const k = s ? s.join() : '';
    if (k === (R.cubeHoverKey || '')) return;
    R.cubeHoverKey = k;
    if (R.cubeHL) { R.cube.remove(R.cubeHL); R.cubeHL.geometry.dispose(); R.cubeHL = null; }
    if (s) {
      const pos = [], band = [[-0.5, -CUBE_CUT], [-CUBE_CUT, CUBE_CUT], [CUBE_CUT, 0.5]], sideOf = b => b === 0 ? -1 : b === 1 ? 0 : 1, out = 0.503;
      for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
        if (s[a] !== 0 && s[a] !== sg) continue;          // the region's faces: those it touches
        const [b, c] = [0, 1, 2].filter(i => i !== a);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const cell = [0, 0, 0]; cell[a] = sg; cell[b] = sideOf(i); cell[c] = sideOf(j);
          if (cell.join() !== s.join()) continue;
          const q = (u, v) => { const p = [0, 0, 0]; p[a] = sg * out; p[b] = u; p[c] = v; return p; };
          const [u0, u1] = band[i], [v0, v1] = band[j], A = q(u0, v0), B = q(u1, v0), C = q(u1, v1), D2 = q(u0, v1);
          pos.push(...A, ...B, ...C, ...A, ...C, ...D2);
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      R.cubeHL = new T.Mesh(g, R.cubeHLMat || (R.cubeHLMat = new T.MeshBasicMaterial({ color: 0x0092b2, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })));
      R.cube.add(R.cubeHL);
    }
    need();
  }
  function cubeClick(e) {
    const s = cubeRegion(e);
    if (!s || s.every(v => v === 0)) return;
    const dir = new T.Vector3(...s).normalize();
    if (Math.abs(dir.z) > 0.999) dir.y = -1e-4;
    const dist = R.camera.position.distanceTo(R.target);
    go(R.target.clone().add(dir.multiplyScalar(dist)), R.target.clone(), true);
  }
  function orbit(dx, dy, pivot) {
    const cam = R.camera, k = 0.008;
    const rot = (axis, a) => { const q = new T.Quaternion().setFromAxisAngle(axis, a); for (const v of [cam.position, R.target]) v.sub(pivot).applyQuaternion(q).add(pivot); };
    rot(new T.Vector3(0, 0, 1), -dx * k);
    if (R.heading !== undefined) R.heading -= dx * k;              // (kept turning straight above or below, where the view alone cannot show it)
    // up and down: about the picture's own across, as far as straight above or below and no further
    const dir = cam.position.clone().sub(R.target).normalize(), h = R.heading === undefined ? Math.atan2(dir.y, dir.x) : R.heading;
    const right = new T.Vector3(-Math.sin(h), Math.cos(h), 0);
    const pol = Math.acos(clamp(dir.z, -1, 1)), want = clamp(pol + dy * k, 0, Math.PI);
    if (Math.abs(want - pol) > 0) rot(right, want - pol);
    aim();
  }
  function pan(dx, dy, depthAt) {
    const cam = R.camera, d = depthAt ? cam.position.distanceTo(depthAt) : cam.position.distanceTo(R.target);
    const k = 2 * d * Math.tan(cam.fov * deg / 2) / R.h, right = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const m = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
    cam.position.add(m); R.target.add(m); cam.updateMatrixWorld();
  }
  function zoom(f, at) {
    const P = at || R.target, cam = R.camera;
    if (cam.position.distanceTo(P) * f < 5 && f < 1) return;
    cam.position.sub(P).multiplyScalar(f).add(P); R.target.sub(P).multiplyScalar(f).add(P); cam.updateMatrixWorld();
  }
  function events() {
    const cv = D.cv, P = new Map();
    let drag = null, hoverQ = false;
    const plane = (e, z) => { const n = ndc(e); return tablePointNdc(n.x, n.y, z); };
    const handleAt = e => handleUnder(ndc(e));
    const liftAt = e => handleAt(e) === 'lift', ringAt = e => /^(ring|tip|roll)$/.test(handleAt(e) || '');
    const partAt = e => { const hit = pick(e, true), el = hit && hit.object && getEl(hit.object.userData.id); return el || null; };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      if (!R) return;
      cv.focus({ preventScroll: true });
      R.anim = null;
      D.hint.classList.add('faded');
      hideCtxMenu();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const n = ndc(e), touch = e.pointerType === 'touch';
      if (!touch && e.button === 0 && inCube(n)) { drag = { cube: true, x: e.clientX, y: e.clientY, moved: 0 }; return; }
      if (touch && P.size > 1) {
        // a second finger: whatever the first was doing becomes pan and pinch
        if (drag && drag.started) { changed(); }
        const [a, b] = [...P.values()], h0 = pick(e);
        drag = { mode: 'touch2', moved: 99, pivot: h0 ? h0.point.clone() : R.target.clone(), pinch: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
      const h0 = pick(e), pivot = h0 ? h0.point.clone() : R.target.clone();
      // the left button (or one finger) on the ring turns the part; on a part, moves it
      if (e.button === 0) {
        const hk = handleAt(e);
        if (hk === 'lift' || hk === 'x' || hk === 'y') {
          // an arrow: along its picture on the screen, 10 mm of it
          const G = hk === 'lift' ? R.lift : hk === 'x' ? R.moveX : R.moveY, el = getEl(G.el.id) || G.el, o = new T.Vector3(el.x, el.y, zOf(el));
          const a = o.clone().project(R.camera), b = o.clone().addScaledVector(G.dir, 10).project(R.camera);
          const vx = (b.x - a.x) / 2 * R.w, vy = -(b.y - a.y) / 2 * R.h, L2 = vx * vx + vy * vy;
          drag = { mode: hk === 'lift' ? 'lift' : 'axis', key: hk, el, v0: hk === 'lift' ? zOf(el) : el[hk], x: e.clientX, y: e.clientY, vx, vy, L2, moved: 0, started: false };
          return;
        }
        if (hk === 'ring' || hk === 'tip' || hk === 'roll') {
          const G = R[hk], el = getEl(G.el.id) || G.el;
          drag = { mode: 'rot', key: hk, G, el, v0: hk === 'ring' ? el.angle : hk === 'tip' ? el.tip || 0 : el.roll || 0, last: ringAngle(G, e), acc: 0, x: e.clientX, y: e.clientY, moved: 0, started: false };
          return;
        }
        const el = !(e.shiftKey && ctrl === 'trackpad') && partAt(e);       // Shift-drag pans, on a trackpad
        if (el) { drag = { mode: 'grab', el, p0: plane(e, zOf(el)), moved: 0, started: false, pivot, button: 0, add: e.shiftKey || e.ctrlKey || e.metaKey }; return; }
      }
      let mode;
      if (touch) mode = 'orbit';
      else if (ctrl === 'default') mode = e.button === 2 ? (e.ctrlKey ? 'pan' : 'orbit') : e.button === 1 ? 'pan' : 'click';
      else mode = e.button === 0 ? (e.shiftKey ? 'pan' : 'orbit') : e.button === 1 || e.button === 2 ? 'pan' : null;
      if (e.button === 1) e.preventDefault();
      drag = { mode, moved: 0, pivot, button: e.button };
    });
    cv.addEventListener('pointerleave', () => { if (R) cubeHover(null); });
    cv.addEventListener('pointermove', e => {
      if (!R) return;
      if (!drag || !P.has(e.pointerId)) {
        // over a part, or the ring: say what a drag would do
        if (hoverQ || e.pointerType === 'touch') return;
        hoverQ = true;
        requestAnimationFrame(() => { hoverQ = false; if (drag || !R) return; readVol(e); const cr = cubeRegion(e); cubeHover(cr); if (cr) { cv.style.cursor = 'pointer'; return; } { const k = handleAt(e); cv.style.cursor = k === 'lift' ? 'ns-resize' : k === 'x' || k === 'y' ? 'move' : k ? 'grab' : partAt(e) ? 'pointer' : ''; } });
        return;
      }
      const last = P.get(e.pointerId), dx = e.clientX - last.x, dy = e.clientY - last.y;
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.cube) return;
      if (drag.mode === 'grab') {
        if (!drag.started) {
          if (drag.moved < 4 || !drag.p0) return;
          const el = drag.el;
          if (!(el.id === selectedId || extraSel.has(el.id))) { setSelection(groupOf(el)); renderPanel(); }
          drag.group = selection().filter(x => !x.locked && x.bench === project.tab);
          if (el.locked || !drag.group.includes(el)) { toast(el.name + ' is locked in place'); drag = null; return; }
          checkpoint(); drag.started = true;
          drag.x0 = el.x; drag.y0 = el.y; drag.starts = drag.group.map(g => [g.x, g.y]);
          cv.style.cursor = 'grabbing';
        }
        const p = plane(e, zOf(drag.el));
        if (!p) return;
        // the grabbed part snaps, as on the bench; the rest keep their places against it
        const nx = snapVal(drag.x0 + p[0] - drag.p0[0], e), ny = snapVal(drag.y0 + p[1] - drag.p0[1], e), mx = nx - drag.x0, my = ny - drag.y0;
        drag.group.forEach((g, i) => { g.x = drag.starts[i][0] + mx; g.y = drag.starts[i][1] + my; });
        syncPanel(); requestRender();
        return;
      }
      if (drag.mode === 'lift' || drag.mode === 'axis') {
        if (!drag.started) { if (drag.moved < 3 || !(drag.L2 > 1e-6)) return; if (drag.el.locked) { toast(drag.el.name + ' is locked in place'); drag = null; return; } checkpoint(); drag.started = true; cv.style.cursor = 'grabbing'; }
        // how far along the arrow's picture the pointer has gone, in mm; snapped as on the bench
        const mm = ((e.clientX - drag.x) * drag.vx + (e.clientY - drag.y) * drag.vy) / drag.L2 * 10;
        if (drag.mode === 'lift') {
          const st = e.shiftKey ? 0.1 : project.snap || 0.5;
          setZ(drag.el, clamp(Math.round((drag.v0 + mm) / st) * st, 0, 2000));
        } else drag.el[drag.key] = snapVal(drag.v0 + mm, e);
        syncPanel(); requestRender();
        return;
      }
      if (drag.mode === 'rot') {
        if (!drag.started) { if (drag.moved < 3) return; if (drag.el.locked) { toast(drag.el.name + ' is locked in place'); drag = null; return; } checkpoint(); drag.started = true; cv.style.cursor = 'grabbing'; }
        // round the ring from where it was taken hold of; Alt for a tenth as fast, Shift in 15° steps
        const G = drag.G, a = ringAngle(G, e);
        if (a !== null && drag.last !== null) { let d = a - drag.last; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); drag.acc += d; }
        else if (a === null) {
          // seen edge on: along the knob's picture on the screen, 0.2° a pixel
          const t = Math.atan2(G.grab.clone().sub(G.c).dot(G.v), G.grab.clone().sub(G.c).dot(G.u)), p0 = G.at(t).project(R.camera), p1 = G.at(t + 0.01).project(R.camera);
          const vx = (p1.x - p0.x) * R.w, vy = -(p1.y - p0.y) * R.h, l = Math.hypot(vx, vy) || 1;
          drag.acc += (dx * vx + dy * vy) / l * 0.2 * deg;
        }
        drag.last = a;
        let v = drag.v0 + drag.acc / deg * (e.altKey ? 0.1 : 1);
        v = e.shiftKey ? Math.round(v / 15) * 15 : e.altKey ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
        const el = drag.el;
        if (drag.key === 'ring') el.angle = ((v % 360) + 540) % 360 - 180;
        else if (drag.key === 'tip') setTip(el, v);
        else setRoll(el, v);
        syncPanel(); requestRender();
        return;
      }
      if (drag.mode === 'orbit') orbit(dx, dy, drag.pivot);
      else if (drag.mode === 'pan') pan(dx, dy, drag.pivot);
      else if (drag.mode === 'touch2') {
        const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (drag.pinch && d > 0) zoom(drag.pinch / d, drag.pivot);
        pan(mid.x - drag.mid.x, mid.y - drag.mid.y, drag.pivot);
        drag.pinch = d; drag.mid = mid;
      } else return;
      draw();
    });
    const up = e => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (!drag) return;
      const d = drag;
      if (P.size) { if (d.mode === 'touch2' && P.size === 1) d.mode = 'orbit'; return; }
      drag = null;
      cv.style.cursor = '';
      if (d.cube) { if (d.moved < 5) cubeClick(e); return; }
      if ((d.mode === 'grab' || d.mode === 'rot' || d.mode === 'lift' || d.mode === 'axis') && d.started) { changed(); return; }
      if (d.mode === 'lift' || d.mode === 'axis' || d.mode === 'rot') {
        // a handle pressed and let go without a drag, over the part: a click on it, so its handles change over
        const el = d.moved < 5 && partAt(e);
        if (el && el.id === d.el.id) { gz = { id: el.id, mode: gz.mode === 'rotate' ? 'move' : 'rotate' }; requestRender(); }
        return;
      }
      if (d.mode !== 'grab' && d.mode !== 'rot') keepCam();
      // the right button without a drag: the bench's menu, for the part under it (or the bench)
      if (d.moved < 5 && d.button === 2 && e.pointerType !== 'touch') {
        const el = partAt(e), at = plane(e) || [R.target.x, R.target.y];
        benchMenu(e.clientX, e.clientY, el, [snapVal(at[0]), snapVal(at[1])], true);
        return;
      }
      // a click (or a tap): select what is under it, Shift or Ctrl adding, or nothing
      const click = d.moved < 5 && (d.mode === 'click' || d.mode === 'grab' || (ctrl === 'trackpad' && d.button === 0) || e.pointerType === 'touch');
      if (!click) return;
      const el = d.mode === 'grab' ? d.el : partAt(e);
      // the one part selected clicked again: from its arrows to its rings, and back
      if (el && !(e.shiftKey || e.ctrlKey || e.metaKey) && selection().length === 1 && selection()[0].id === el.id) {
        gz = { id: el.id, mode: gz.id === el.id && gz.mode === 'rotate' ? 'move' : 'rotate' };
        requestRender(); return;
      }
      if (el && (e.shiftKey || e.ctrlKey || e.metaKey) && e.pointerType !== 'touch') setSelection(selection().some(x => x.id === el.id) ? selection().filter(x => x.id !== el.id) : selection().concat([el]));
      else if (el) setSelection(groupOf(el).sort((a, b) => (b === el) - (a === el)));
      else { extraSel.clear(); selectOne(null); }
      renderPanel(); requestRender();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      if (!R) return;
      e.preventDefault(); R.anim = null;
      const d = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (ctrl === 'trackpad' && !e.ctrlKey) pan(-e.deltaX * d, -e.deltaY * d, null);
      else { const h0 = pick(e); zoom(Math.exp(e.deltaY * d * (e.ctrlKey ? 0.01 : 0.0015)), h0 ? h0.point : null); }
      keepCam(); draw();
    }, { passive: false });
    window.addEventListener('resize', () => { if (R && active()) { resize(); requestRender(); } });
  }
  /* The 3D view's keys: F fits, Shift+1 to 7 the standard views; the 2D view's own keys that mean
     nothing here (measure, pan with Space) are left alone */
  function keys(e) {
    if (!active() || !R) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code, views = { Digit1: 'front', Digit2: 'back', Digit3: 'left', Digit4: 'right', Digit5: 'top', Digit6: 'bottom', Digit7: 'iso' };
    if (!e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); e.stopPropagation(); fit(null, true); return; }
    if (e.shiftKey && views[k]) { e.preventDefault(); e.stopPropagation(); view(views[k]); return; }
    if (!e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); zoomSel(); return; }
    if (e.key === ' ' || e.key === 'm' || e.key === 'M') { e.preventDefault(); e.stopPropagation(); }
  }
  function zoomSel() {
    const ids = new Set(selection().map(e => e.id));
    if (!ids.size) { fit(null, true); return; }
    const b = new T.Box3();
    for (const p of R.groups.parts.children) if (ids.has(p.userData.id)) b.expandByObject(p);
    if (b.isEmpty()) return;
    const c = b.getCenter(new T.Vector3()), r = Math.max(15, b.getBoundingSphere(new T.Sphere()).radius) * 1.8;
    const dir = R.camera.position.clone().sub(R.target).normalize();
    go(c.clone().add(dir.multiplyScalar(r / Math.sin(R.camera.fov * deg / 2))), c, true);
  }
  function png() {
    if (!R) return;
    const { gl, scene, camera } = R;
    gl.setViewport(0, 0, R.w, R.h); gl.setScissorTest(false); gl.setClearColor(new T.Color(sceneBg()), 1); gl.clear(); gl.render(scene, camera);
    D.cv.toBlob(b => {
      if (!b) return;
      const a = h('a', { href: URL.createObjectURL(b), download: (project.name || 'bench').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-' + benchName(project.tab).replace(/\s+/g, '-') + '-3d.png' });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      need();
    }, 'image/png');
  }

  /* ---------- fly: the bench full screen, flown through ----------
     W A S D (or the arrows) move the way the camera looks and across it, Space and Ctrl up and
     down the picture, Q and E roll it left and right, Shift four times as fast; the mouse turns
     the view about its own axes, as a pilot would; the wheel sets the speed. Landing levels it. The pointer is held to the canvas while
     flying; Esc lets it go and lands, leaving the view orbiting a point straight ahead. */
  let fly = null;                                         // { keys, h, th, dist, speed, last, raf, fs }
  const flyOk = () => true;                               // (part of the tool proper since 1.1)
  const FLY_KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
    KeyE: 'rollR', KeyQ: 'rollL', Space: 'u', ControlLeft: 'd', ControlRight: 'd', ShiftLeft: 'fast', ShiftRight: 'fast' };
  // the camera's own axes, as it is turned now: it looks along its -z, its y is up the picture
  const flyAxis = (x, y, z) => new T.Vector3(x, y, z).applyQuaternion(fly.q);
  const flyDir = () => flyAxis(0, 0, -1);
  function flyLook() {
    R.camera.quaternion.copy(fly.q); R.camera.updateMatrixWorld();
    const f = flyDir();
    if (Math.hypot(f.x, f.y) > 1e-6) R.heading = Math.atan2(-f.y, -f.x);
    R.target.copy(R.camera.position).add(f.multiplyScalar(fly.dist));
  }
  // a turn about one of the camera's own axes
  const flyRot = (x, y, z, a) => { fly.q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(x, y, z), a)).normalize(); };
  function flyHintText() {
    if (!fly) return;
    const locked = document.pointerLockElement === D.cv;
    D.flyHint.textContent = 'Flying \u00b7 W A S D: move \u00b7 ' + (locked ? 'Mouse: look' : 'Click, then the mouse: look') + ' \u00b7 Q / E: roll \u00b7 Space / Ctrl: up, down \u00b7 Shift: faster \u00b7 Wheel: speed (' +
      (fly.speed >= 1000 ? +(fly.speed / 1000).toPrecision(2) + ' m' : Math.round(fly.speed) + ' mm') + '/s) \u00b7 Esc: land';
  }
  function flyLock() { try { const q = D.cv.requestPointerLock && D.cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* no pointer lock: drag to look */ } }
  function flyStart() {
    if (fly || !R || !active() || !flyOk()) return;
    R.anim = null;
    const d = R.camera.position.clone().sub(R.target), r = d.length() || 100;
    aim();
    fly = { keys: new Set(), q: R.camera.quaternion.clone(), dist: r, speed: clamp(r * 0.5, 20, 5000), last: null, raf: 0, fs: false };
    D.stage.classList.add('rt-flying');
    D.flyHint.hidden = false;
    flyHintText();
    window.addEventListener('keydown', flyKey, true); window.addEventListener('keyup', flyKey, true);
    document.addEventListener('mousemove', flyMouse);
    document.addEventListener('pointerlockchange', flyHintText);
    document.addEventListener('fullscreenchange', flyFull);
    window.addEventListener('blur', flyBlur);
    try { const q = D.stage.requestFullscreen && D.stage.requestFullscreen(); if (q && q.then) q.then(() => { if (fly) fly.fs = true; }, () => {}); } catch (e) { /* the page itself fills the window */ }
    flyLock();
    fly.raf = requestAnimationFrame(flyStep);
    tryMe(true);
    requestRender();
  }
  /* Try me (experimental): a QR code to a copy of the bench, bottom right while flying */
  let qrLoad = null;
  const qrLib = () => qrLoad || (qrLoad = new Promise((res, rej) => {
    if (typeof qrcode === 'function') return res(qrcode);
    const sc = document.createElement('script');
    sc.src = new URL('../assets/vendor/qrcode/qrcode.js', location.href).href;
    sc.onload = () => typeof qrcode === 'function' ? res(qrcode) : rej(new Error('no QR library'));
    sc.onerror = () => { qrLoad = null; rej(new Error('the QR library did not load')); };
    document.head.append(sc);
  }));
  async function tryMe(on) {
    if (D.tryme) { D.tryme.remove(); D.tryme = null; }
    if (!on || !flyOk() || !(() => { try { return exp('tryme'); } catch (e) { return false; } })()) return;
    const box = h('div', { class: 'rt-tryme', 'aria-label': 'Try me: a QR code that opens a copy of this bench' }, h('b', null, 'Try me!'));
    D.tryme = box; D.stage.append(box);
    try {
      const [lib, [url, alnum]] = await Promise.all([qrLib(), qrLink()]);
      if (D.tryme !== box) return;
      const q = lib(0, 'L');
      q.addData(url, alnum ? 'Alphanumeric' : 'Byte'); q.make();
      box.dataset.url = url;
      // as big as it needs to be to scan from across a room: 4 px a module at least, up to 40% of the height
      const n = q.getModuleCount(), px = Math.max(160, Math.min(Math.floor(D.stage.clientHeight * 0.4), n * 4));
      const cell = Math.max(1, Math.floor(px / (n + 2)));
      const wrap = h('div'); wrap.innerHTML = q.createSvgTag({ cellSize: cell, margin: cell, scalable: false });
      box.append(wrap.firstChild);
    } catch (err) {
      if (D.tryme === box) box.append(h('small', null, /overflow|length/i.test(err.message) ? 'This bench is too big to fit in a QR code: share it with a link or a .jekray file.' : 'No QR code here: ' + err.message + '.'));
    }
  }
  function flyStop() {
    if (!fly) return;
    cancelAnimationFrame(fly.raf);
    window.removeEventListener('keydown', flyKey, true); window.removeEventListener('keyup', flyKey, true);
    document.removeEventListener('mousemove', flyMouse);
    document.removeEventListener('pointerlockchange', flyHintText);
    document.removeEventListener('fullscreenchange', flyFull);
    window.removeEventListener('blur', flyBlur);
    flyLook();
    fly = null;
    D.stage.classList.remove('rt-flying');
    D.flyHint.hidden = true;
    tryMe(false);
    if (document.pointerLockElement === D.cv) try { document.exitPointerLock(); } catch (e) { /* gone already */ }
    if (document.fullscreenElement === D.stage) { const q = document.exitFullscreen(); if (q && q.catch) q.catch(() => {}); }
    aim(); keepCam(); requestRender();
  }
  // full screen left (Esc, which the browser keeps for itself there): landed
  function flyFull() { if (!fly) return; if (document.fullscreenElement === D.stage) fly.fs = true; else if (fly.fs) flyStop(); requestRender(); }
  function flyBlur() { if (fly) fly.keys.clear(); }
  function flyKey(e) {
    if (!fly) return;
    if (e.code === 'Escape' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown') flyStop(); return; }
    const k = FLY_KEYS[e.code];
    if (!k || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'keydown') fly.keys.add(k); else fly.keys.delete(k);
  }
  function flyMouse(e) {
    if (!fly || !(document.pointerLockElement === D.cv || (e.buttons && e.target === D.cv))) return;
    flyTurn(e.movementX || 0, e.movementY || 0);
  }
  // the mouse turns the view about its own axes, as a pilot turns, rolled or not
  function flyTurn(dx, dy) {
    flyRot(0, 1, 0, -dx * 0.0022); flyRot(1, 0, 0, -dy * 0.0022);
    flyLook(); need();
  }
  function flyStep(t) {
    if (!fly) return;
    const dt = fly.last === null ? 0 : Math.min(0.1, (t - fly.last) / 1000);
    fly.last = t;
    const K = fly.keys, f = flyDir(), right = flyAxis(1, 0, 0), up = flyAxis(0, 1, 0);
    const m = new T.Vector3()
      .addScaledVector(f, (K.has('f') ? 1 : 0) - (K.has('b') ? 1 : 0))
      .addScaledVector(right, (K.has('r') ? 1 : 0) - (K.has('l') ? 1 : 0))
      .addScaledVector(up, (K.has('u') ? 1 : 0) - (K.has('d') ? 1 : 0));
    // E rolls to the right, Q to the left, about the way it looks: 45 degrees a second
    const roll = (K.has('rollL') ? 1 : 0) - (K.has('rollR') ? 1 : 0);
    if (roll && dt > 0) flyRot(0, 0, 1, roll * Math.PI / 4 * dt);
    if ((m.lengthSq() > 0 || roll) && dt > 0) {
      if (m.lengthSq() > 0) R.camera.position.addScaledVector(m.normalize(), fly.speed * (K.has('fast') ? 4 : 1) * dt);
      flyLook(); need();
    }
    fly.raf = requestAnimationFrame(flyStep);
  }

  function reset() { if (fly) flyStop(); st.clear(); gz = { id: null, mode: 'move' }; if (R) { R.camTab = null; R.key = null; R.selKey = null; } if (D) { D.hint.classList.remove('faded'); show(); } }
  return {
    init, sync, active, eligible, setOn, view, fit, reset, zoomSel, tablePoint,
    // a bench opened in 3D (a link made there), from a camera if given
    open(cam) { st.set(project.tab, Object.assign(st.get(project.tab) || {}, cam ? { cam } : {})); if (R) R.camTab = null; return setOn(true); },
    free: el => FREE.has(el.type) && el.type !== 'draw',
    // for the tests: what the view holds
    api: {
      eligible: () => eligible(project.tab),
      blockers: () => blockers(project.tab).map(e => e.name),
      set: on => setOn(on),
      on: () => active(),
      ready: () => !!R,
      switchShown: () => { init(); show(); return !!(D && !D.sw.hidden); },
      stats() {
        if (!R || !active()) return null;
        sync();
        const kinds = {}; for (const p of R.groups.parts.children) { const el = getEl(p.userData.id); if (el) kinds[el.type] = (kinds[el.type] || 0) + 1; }
        let meshes = 0; R.groups.parts.traverse(o => { if (o.isMesh) meshes++; });
        const b = contentBox();
        const progs = (R.gl.info && R.gl.info.programs) || [];
        return { programs: progs.reduce((m, q) => Math.max(m, q.id || 0), 0), parts: R.groups.parts.children.length, kinds, meshes, rays: R.nRays || 0, beams: R.nBeams || 0, names: R.groups.names.children.length, outlined: R.groups.sel.children.length,
          box: { min: b.min.toArray(), max: b.max.toArray() }, board: R.boardBox ? { min: R.boardBox.min.toArray(), max: R.boardBox.max.toArray() } : null };
      },
      camera: () => R ? { p: R.camera.position.toArray(), t: R.target.toArray(), up: new T.Vector3(0, 1, 0).applyQuaternion(R.camera.quaternion).toArray() } : null,
      look(p, t) { if (!R) return; sync(); setCam(p, t); keepCam(); need(); },
      // the view cube under a canvas point: the signs of the place a click there looks from, and the cells it shades
      cubeAt(px, py) { if (!R) return null; sync(); const b = D.cv.getBoundingClientRect(), s = cubeRegion({ clientX: b.left + px, clientY: b.top + py }); cubeHover(s); return s && { s, cells: R.cubeHL ? R.cubeHL.geometry.attributes.position.count / 6 : 0 }; },
      cubeRect: () => R ? cubeRect() : null,
      pointOnScreen(p) { if (!R) return null; sync(); const v = new T.Vector3(...p).project(R.camera); return { x: (v.x + 1) / 2 * R.w, y: (1 - v.y) / 2 * R.h }; },
      // the field as a volume: its segments and brightest irradiance (W/cm²), the key, and what a canvas point reads
      field() { if (!R || !active()) return null; sync(); return { busy: !!R.volBusy, segs: R.vol ? R.vol.segs.length : 0, meshes: (R.volMeshes || []).length, peak: R.vol ? R.vol.peak * 100 : null, key: D.vkey.hidden ? null : D.vkey.textContent }; },
      // each piece of the field volume: where it starts, its direction, and its extent along it
      fieldSegs() { if (!R || !R.vol) return null; return R.vol.segs.map(s => { const P = volPlanes(s); return { two: s.two, coh: s.coh, o: s.o, e: s.e, n0: s.n, ta: s.ta, tb: s.tb, ts: [...s.ts], rmax: [...s.rmax], peak: s.peak, pl: P.pl.map(v => v.toArray()), ext: P.ext }; }); },
      fieldAt(px, py) { if (!R) return null; sync(); const b = D.cv.getBoundingClientRect(), r = volUnder({ clientX: b.left + px, clientY: b.top + py }); return r && { I: r.I * 100, p: r.p }; },
      view: name => { if (R) sync(); fit(name, false); return R ? { p: R.camera.position.toArray(), t: R.target.toArray() } : null; },
      // the part a canvas point lands on, the canvas measured in css px from its top left
      pickAt(px, py) { if (!R) return null; sync(); const b = D.cv.getBoundingClientRect(); const hit = pick({ clientX: b.left + px, clientY: b.top + py }, true); return hit ? (getEl(hit.object.userData.id) || {}).name || null : null; },
      // a part's model's size along the bench's x, y and up, mm
      partSize(name) { const el = project.elements.find(e => e.name === name); if (!el || !R) return null; sync(); const p = R.groups.parts.children.find(q => q.userData.id === el.id); if (!p) return null; const s = new T.Box3().setFromObject(p).getSize(new T.Vector3()); return s.toArray(); },
      // what a press at a canvas point would take hold of: 'lift', 'ring', a part's name, or null
      handleAt(px, py) {
        if (!R) return null; sync();
        const b = D.cv.getBoundingClientRect(), e = { clientX: b.left + px, clientY: b.top + py }, k = handleUnder(ndc(e));
        if (k) return k;
        const hit = pick(e, true); return hit ? (getEl(hit.object.userData.id) || {}).name || null : null;
      },
      // which handles the selected part shows: 'move' (arrows) or 'rotate' (rings)
      gizmo: () => { if (R) sync(); return gz.mode; },
      // a handle's grip on the canvas, css px: an arrow's head, a ring's knob
      handleScreen(k) {
        if (!R) return null; sync();
        const G = { x: R.moveX, y: R.moveY, lift: R.lift, ring: R.ring, tip: R.tip, roll: R.roll }[k]; if (!G) return null;
        const v = (G.grab || G.end).clone().project(R.camera); return { x: (v.x + 1) / 2 * R.w, y: (1 - v.y) / 2 * R.h };
      },
      // the middle of the arrow over the selected part, css px
      liftScreen() { return this.handleScreen('lift'); },
      // the screens showing their diffraction pattern on their face, by name, as drawn now
      faceMaps() { if (!R) return null; sync(); const out = []; R.groups.parts.traverse(o => { if (o.userData.faceMap) out.push((getEl(o.userData.faceMap) || {}).name); }); return out; },
      // the tip knob on the canvas, css px, while one mirror is selected
      tipScreen() { return this.handleScreen('tip'); },
      // the ring's knob on the canvas, css px, while one part is selected
      ringScreen() { return this.handleScreen('ring'); },
      // a pointer event on the 3D canvas, at css px from its top left
      pointer(type, px, py, o) {
        if (!D) return;
        const b = D.cv.getBoundingClientRect(), opts = Object.assign({ pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, cancelable: true, clientX: b.left + px, clientY: b.top + py }, o || {});
        D.cv.dispatchEvent(new PointerEvent(type, opts));
      },
      undo: () => undo(),
      // flying: start or land, hold a key down or let it go (by its code), turn by mouse pixels
      fly(on) { if (on) flyStart(); else flyStop(); return !!fly; },
      flying: () => !!fly,
      // the Try me box while flying: its text, and the size of its QR code in modules (0 while it is being made, -1 too big)
      tryMe: () => { if (!D || !D.tryme) return null; const sv = D.tryme.querySelector('svg'); return { text: D.tryme.querySelector('b').textContent, svg: !!sv, note: (D.tryme.querySelector('small') || {}).textContent || '' }; },
      flyKey(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Escape' ? 'Escape' : '', bubbles: true, cancelable: true })); },
      flyTurn(dx, dy) { if (fly) flyTurn(dx, dy); },
      menuShown() { const m = document.getElementById('ctxMenu'); return m && !m.hidden ? [...m.querySelectorAll('button')].map(x => x.textContent) : null; },
      // where on the canvas a part's centre is drawn, css px
      screenOf(name) { const el = project.elements.find(e => e.name === name); if (!el || !R) return null; sync(); const v = new T.Vector3(el.x, el.y, zOf(el)).project(R.camera); return { x: (v.x + 1) / 2 * R.w, y: (1 - v.y) / 2 * R.h }; },
    },
  };
})();

