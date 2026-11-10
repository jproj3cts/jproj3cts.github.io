import { project } from '../state/project.js';
import { NET_3D, getEl } from '../state/elements.js';
import { tippable } from '../engines/trace.js';
import {
  MATE_KINDS, MATE_TYPES, featKeep, liveMates, mateAdd, mateDelete, mateRun, mateSpread, mateWhy, matesOf, meshFeature, partTris,
  poseMiddle, poseMove, poseSnap, poseTurn
} from '../core/mates.js';
import { V3D } from './view3d.js';
import { selection } from './render.js';
import { helpLine, numInput, panel, renderPanel } from './panel.js';
import { h } from './dom.js';
import { changed, editCommand, toast } from './actions.js';
import { checkpointWith, selectEl, snapshot } from './tabs.js';

/* ==========================================================================
   Mates in the 3D view: two parts' bodies held together
   ==========================================================================
   The bar's Mate button: pick a face on one part (a flat face, a round one, or a straight edge pressed close to), then
   one on another, and say how they meet (core/mates.js: coincident, concentric, parallel, a distance, an angle). The
   second part, with its group and whatever is mated to it, is moved to meet the first, and the mate is kept with the
   bench: the two move together until it is deleted (in either part's panel, where its flip, distance or angle change).
   A face is found from the triangles of the part's 3D model (an STL object's own): the flat region it is in, or the
   cylinder its smoothly curving neighbours make. */

const MT = { on: false, first: null, second: null, hover: null, g: null, card: null, q: 0 };
const kit = () => V3D.kit();
const kindWord = k => ({ plane: 'flat face', axis: 'round face', edge: 'edge' }[k] || 'face');

/* ---------- a face under the pointer ---------- */
// the triangles of a part's model in its own frame (mm), from the mesh that was hit, kept while that mesh is
const TRIS = new WeakMap();
function objTris(K, part, obj) {
  const el = getEl(part.userData.id);
  if (el && el.type === 'stl' && obj.geometry && !obj.geometry.index && obj.geometry.attributes.position.count === 3 * ((partTris(el) || []).length / 9)) return partTris(el);
  const hit = TRIS.get(obj.geometry); if (hit && hit.part === part && hit.v === part.matrixWorld.elements.join()) return hit.T;
  part.updateMatrixWorld(true);
  const m = new K.T.Matrix4().copy(part.matrixWorld).invert().multiply(obj.matrixWorld), P = obj.geometry.attributes.position, I = obj.geometry.index;
  const n = I ? I.count : P.count, T = new Float32Array(3 * n), v = new K.T.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, I ? I.getX(i) : i).applyMatrix4(m); T[3 * i] = v.x; T[3 * i + 1] = v.y; T[3 * i + 2] = v.z; }
  TRIS.set(obj.geometry, { part, v: part.matrixWorld.elements.join(), T });
  return T;
}
/* what a press there would pick: { el, f (as kept), F (with its triangles, to show), part, T } or { error } */
function faceAt(e) {
  const K = kit(); if (!K) return { error: 'The 3D view is not open' };
  const hit = K.pick(e, true);
  if (!hit || !hit.object || hit.faceIndex === undefined || hit.faceIndex === null) return { error: 'Pick a face of a part' };
  let part = hit.object; while (part && part.parent !== K.R.groups.parts) part = part.parent;
  const el = part && getEl(part.userData.id);
  if (!el || !project.elements.includes(el)) return { error: 'Pick a face of a part' };
  if (NET_3D.has(el.type)) return { error: el.name + ' stays on the table: mate free-space parts and imported objects' };
  const T = objTris(K, part, hit.object), q = part.worldToLocal(hit.point.clone());
  const d = K.R.camera.position.distanceTo(hit.point), mmPx = 2 * d * Math.tan(K.R.camera.fov * Math.PI / 360) / Math.max(1, K.R.h);
  const F = meshFeature(T, hit.faceIndex, q.toArray(), { edgeTol: e.altKey ? 0 : 6 * mmPx });
  if (F.error) return { error: F.error, el };
  return { el, f: featKeep(F), F, part, T };
}
// a face drawn over its part: its triangles shaded, an edge or an axis as a line
function faceMesh(K, P, colour) {
  const g = new K.T.Group(), mat = new K.T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: K.T.DoubleSide });
  const line = (a, b) => { const geo = new K.T.BufferGeometry().setFromPoints([new K.T.Vector3(...a), new K.T.Vector3(...b)]); const l = new K.T.Line(geo, new K.T.LineBasicMaterial({ color: colour, depthTest: false, transparent: true })); l.renderOrder = 12; g.add(l); };
  if (P.F.tris) {
    const pos = new Float32Array(9 * P.F.tris.length);
    P.F.tris.forEach((t, i) => { for (let k = 0; k < 9; k++) pos[9 * i + k] = P.T[9 * t + k]; });
    const geo = new K.T.BufferGeometry(); geo.setAttribute('position', new K.T.BufferAttribute(pos, 3));
    const m = new K.T.Mesh(geo, mat); m.renderOrder = 11; g.add(m);
  }
  if (P.F.k === 'edge') line(P.F.seg[0], P.F.seg[1]);
  if (P.F.k === 'axis') { const L = Math.max(10, 3 * P.F.r); line(P.F.p.map((v, i) => v - P.F.d[i] * L), P.F.p.map((v, i) => v + P.F.d[i] * L)); }
  P.part.updateMatrixWorld(true);
  g.matrixAutoUpdate = false; g.matrix.copy(P.part.matrixWorld); g.matrixWorldNeedsUpdate = true;
  return g;
}
function redraw() {
  const K = kit(); if (!K) return;
  if (MT.g) { K.R.scene.remove(MT.g); MT.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  MT.g = new K.T.Group();
  if (MT.first) MT.g.add(faceMesh(K, MT.first, 0xf47742));
  if (MT.second) MT.g.add(faceMesh(K, MT.second, 0x0092b2));
  else if (MT.hover && !MT.hover.error && !(MT.first && MT.hover.el === MT.first.el)) MT.g.add(faceMesh(K, MT.hover, MT.first ? 0x0092b2 : 0xf47742));
  K.R.scene.add(MT.g); K.need();
}

/* ---------- the tool: on, picking, off ---------- */
const btn = () => document.getElementById('btn3dMate');
const TOOL = {
  noParts: () => true,
  hintText: () => MT.second ? 'Choose how they meet, then Mate · Esc: stop' : MT.first ? 'Mate: now a face, round face or edge of the part to move (' + MT.first.el.name + ' stays) · Alt: a face, not its edge · Esc: stop'
    : 'Mate: click a face, a round face or near a straight edge of the part that stays put · Right-drag turns the view · Esc: stop',
  pointerdown(e) {
    if (e.button !== 0 || MT.second) return e.button === 0 && !!MT.second;
    const P = faceAt(e);
    if (P.error) { toast(P.error, true); return true; }
    pickFace(P);
    return true;
  },
  pointermove(e) {
    if (e.buttons || MT.second || MT.q) return false;
    MT.q = requestAnimationFrame(() => { MT.q = 0; if (!MT.on) return; MT.hover = faceAt(e); redraw(); });
    return false;
  },
  key(e) { if (e.key === 'Escape') { if (MT.second) { MT.second = null; closeCard(); V3D.setTool(TOOL); redraw(); } else stopMate(); return true; } return false; },
  off: () => stopMate(),
};
function pickFace(P) {
  if (!MT.first) { MT.first = P; V3D.setTool(TOOL); redraw(); return; }
  if (P.el === MT.first.el) { toast('Pick a face on another part: ' + MT.first.el.name + ' is the one that stays', true); return; }
  MT.second = P; redraw(); openCard(); V3D.setTool(TOOL);
}
export async function startMate() {
  if (!V3D.active()) await V3D.setOn(true);
  if (!kit()) return false;
  MT.on = true; MT.first = null; MT.second = null; MT.hover = null;
  V3D.setTool(TOOL);
  const b = btn(); if (b) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
  return true;
}
export function stopMate() {
  if (!MT.on) return;
  MT.on = false; MT.first = MT.second = MT.hover = null; closeCard();
  if (V3D.tool() === TOOL) V3D.setTool(null);
  const K = kit(); if (K && MT.g) { K.R.scene.remove(MT.g); K.need(); } MT.g = null;
  const b = btn(); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
}

/* ---------- the card: how they meet ---------- */
function closeCard() { if (MT.card) { MT.card.remove(); MT.card = null; } }
const defaultType = (a, b) => (a !== 'plane' && b !== 'plane' ? 'concentric' : 'coincident');
function openCard() {
  closeCard();
  const K = kit(), A = MT.first, B = MT.second, st = { type: defaultType(A.f.k, B.f.k), flip: false, offset: 10, angle: 90 };
  const body = h('div', { class: 'rt-matebody' });
  const card = h('div', { class: 'rt-matecard', role: 'dialog', 'aria-label': 'Mate' },
    h('p', { class: 'rt-matehead' }, h('b', null, A.el.name), ' ' + kindWord(A.f.k) + ' stays; ', h('b', null, B.el.name), ' ' + kindWord(B.f.k) + ' moves'), body);
  const fill = () => {
    const types = h('div', { class: 'rt-matetypes', role: 'radiogroup', 'aria-label': 'How they meet' }, ...Object.entries(MATE_TYPES).map(([k, name]) => {
      const why = mateWhy(k, A.f.k, B.f.k);
      return h('button', { type: 'button', role: 'radio', 'data-mate': k, class: 'rt-btn' + (st.type === k ? ' on' : ''), 'aria-checked': st.type === k ? 'true' : 'false', disabled: why ? '' : null, title: why || name,
        onclick: () => { st.type = k; fill(); } }, name);
    }));
    const flip = h('input', { type: 'checkbox', checked: st.flip ? '' : null }); flip.addEventListener('change', () => { st.flip = flip.checked; });
    const extra = [];
    if (st.type === 'distance') { const i = h('input', { type: 'text', inputmode: 'decimal', value: String(st.offset), 'aria-label': 'Distance (mm)', 'data-mate-offset': '' }); i.addEventListener('input', () => { const v = Number(i.value); if (isFinite(v)) st.offset = v; }); extra.push(h('label', { class: 'rt-matef' }, 'Distance (mm) ', i)); }
    if (st.type === 'angle') { const i = h('input', { type: 'text', inputmode: 'decimal', value: String(st.angle), 'aria-label': 'Angle (°)', 'data-mate-angle': '' }); i.addEventListener('input', () => { const v = Number(i.value); if (isFinite(v)) st.angle = v; }); extra.push(h('label', { class: 'rt-matef' }, 'Angle (°) ', i)); }
    body.replaceChildren(types, h('div', { class: 'rt-materow' }, ...extra, h('label', { class: 'rt-check' }, flip, 'Flip')),
      h('div', { class: 'rt-materow' }, h('button', { type: 'button', class: 'rt-btn primary', 'data-mate-go': '', onclick: () => applyMate(st) }, 'Mate'),
        h('button', { type: 'button', class: 'rt-btn', onclick: () => { MT.second = null; closeCard(); V3D.setTool(TOOL); redraw(); } }, 'Pick again')));
  };
  fill();
  K.D.stage.append(card); MT.card = card;
}
function applyMate(st) {
  const A = MT.first, B = MT.second; if (!A || !B) return null;
  const before = snapshot();
  const r = mateAdd({ type: st.type, a: { el: A.el.id, f: A.f }, b: { el: B.el.id, f: B.f }, flip: st.flip, offset: st.offset, angle: st.angle });
  if (r.error) { toast(r.error, true); return r; }
  checkpointWith(before);
  toast(MATE_TYPES[st.type] + ': ' + B.el.name + ' to ' + A.el.name);
  stopMate();
  selectEl(B.el);
  changed(true);
  return r;
}

/* ---------- a part's mates, in its panel ---------- */
const mateLine = (m, el) => {
  const mine = m.a.el === el.id ? m.a : m.b, other = getEl(m.a.el === el.id ? m.b.el : m.a.el);
  return { other, text: MATE_TYPES[m.type] + ' with ' + (other ? other.name : '?') + ': its ' + kindWord(mine.f.k) + (m.a.el === el.id ? ' (stays)' : ' (moved)') };
};
// a mate changed (its flip, distance or angle) and met again; put back as it was when it cannot be
function mateEdit(m, change) {
  const keep = JSON.stringify(m), before = snapshot();
  change(m);
  const r = mateRun(m);
  if (r.error) { Object.keys(m).forEach(k => delete m[k]); Object.assign(m, JSON.parse(keep)); toast(r.error, true); renderPanel(); return; }
  checkpointWith(before); changed(true);
}
export function matesPanel(el) {
  const list = matesOf(el); if (!list.length) return;
  panel.append(h('h3', null, 'Mates'));
  const box = h('div', { class: 'rt-mates' });
  for (const m of list) {
    const L = mateLine(m, el), row = h('div', { class: 'rt-mate', 'data-mate-id': m.id });
    row.append(h('span', null, L.other ? h('button', { type: 'button', class: 'rt-link', onclick: () => selectEl(L.other) }, L.text) : L.text));
    const ctl = h('span', { class: 'rt-matectl' });
    if (m.type === 'distance') { const id = 'mate-off-' + m.id; ctl.append(h('label', { for: id }, 'mm'), numInput(id, () => m.offset, v => mateEdit(m, q => { q.offset = v; }), { commit: true })); }
    if (m.type === 'angle') { const id = 'mate-ang-' + m.id; ctl.append(h('label', { for: id }, '°'), numInput(id, () => m.angle, v => mateEdit(m, q => { q.angle = Math.max(0, Math.min(180, v)); }), { commit: true })); }
    const fl = h('input', { type: 'checkbox', checked: m.flip ? '' : null, 'aria-label': 'Flip' });
    fl.addEventListener('change', () => mateEdit(m, q => { if (fl.checked) q.flip = true; else delete q.flip; }));
    ctl.append(h('label', { class: 'rt-check' }, fl, 'Flip'),
      h('button', { type: 'button', class: 'rt-link', title: 'Delete the mate: the parts stay where they are, free of each other', 'aria-label': 'Delete the mate', onclick: () => { const before = snapshot(); mateDelete(m.id); checkpointWith(before); toast('Mate deleted'); changed(true); } }, '×'));
    row.append(ctl); box.append(row);
  }
  panel.append(box, helpLine('Mated parts move together, as a group does.', ['A mate holds a face of one part to a face of another. Moving or turning either moves the rest with it, until the mate is deleted (×). Flip turns the second part’s face the other way; a distance or an angle typed here moves it to match. Mate more parts with Mate on the 3D view’s bar.'], 'note', 'margin-top:0.35rem'));
}

/* ---------- several selected: moved and turned by numbers ---------- */
export function groupMovePanel(list) {
  const free = list.filter(e => V3D.free(e)), on3 = free.length === list.length;
  const wrap = h('div', { class: 'rt-rows rt-gmove' });
  const val = {};
  const field = (k, label) => { const id = 'gmove-' + k; val[k] = 0; const inp = h('input', { id, type: 'text', inputmode: 'decimal', value: '0', 'data-gmove': k }); inp.addEventListener('input', () => { const v = Number(inp.value); val[k] = isFinite(v) ? v : 0; }); return h('div', { class: 'rt-pcell' }, h('div', { class: 'rt-plab' }, h('label', { for: id }, label)), inp); };
  const net = list.some(e => NET_3D.has(e.type)), tips = on3 && !net && list.every(tippable);
  const B = (label, fn, attr) => h('button', Object.assign({ type: 'button', class: 'rt-btn', onclick: fn }, attr || {}), label);
  wrap.append(h('div', { class: 'rt-pgrid' }, field('dx', 'Move x (mm)'), field('dy', 'Move y (mm)'), on3 && !net ? field('dz', 'Move up (mm)') : h('span')),
    h('div', { class: 'rt-inline', style: 'display:flex;justify-content:flex-end;margin:0.2rem 0 0.4rem' }, B('Move them', () => groupMove(list, [val.dx, val.dy, val.dz || 0]), { 'data-gmove-go': 'move' })),
    h('div', { class: 'rt-pgrid' }, field('az', 'Turn about up (°)'), tips ? field('ay', 'About y (°)') : h('span'), tips ? field('ax', 'About x (°)') : h('span')),
    h('div', { class: 'rt-inline', style: 'display:flex;justify-content:flex-end;margin-top:0.2rem' }, B('Turn them', () => groupTurn(list, [[0, 0, 1, val.az], [0, 1, 0, val.ay || 0], [1, 0, 0, val.ax || 0]]), { 'data-gmove-go': 'turn' })));
  return wrap;
}
// the selection with what is mated to it, or null (said why) when a part of it is locked
function bodyOf(list) {
  const body = mateSpread(list).filter(e => e.bench === project.tab), locked = body.find(e => e.locked);
  if (locked) { toast(locked.name + ' is locked in place', true); return null; }
  return body;
}
export function groupMove(list, d) {
  const body = bodyOf(list); if (!body || !d.some(v => v)) return false;
  const before = snapshot();
  poseMove(body, body.map(poseSnap), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0], d);
  checkpointWith(before); changed(true);
  return true;
}
// turned about their middle by each [axis x, y, z, degrees] in turn
export function groupTurn(list, turns) {
  const body = bodyOf(list); if (!body) return false;
  const T = turns.filter(t => t[3]); if (!T.length) return false;
  if (T.some(t => t[2] !== 1) && body.some(e => !tippable(e) || NET_3D.has(e.type))) { toast('Some of them turn only on the table: they can be turned about the vertical only', true); return false; }
  const before = snapshot(), c = poseMiddle(body);
  for (const t of T) poseTurn(body, body.map(poseSnap), t.slice(0, 3), t[3], c);
  checkpointWith(before); changed(true);
  return true;
}

/* ---------- the page's wiring ---------- */
export function wireMate3d() {
  const b = btn(); if (b) b.addEventListener('click', () => { if (MT.on) stopMate(); else startMate(); });
  for (const [id, k] of [['btnQGroup', 'group'], ['btnQUngroup', 'ungroup']]) {
    const q = document.getElementById(id);
    if (q) q.addEventListener('click', () => { if (k === 'group' && selection().length < 2) { toast('Select two or more parts to group (Shift-click, or drag a box)'); return; } if (k === 'ungroup' && !selection().some(e => e.group)) { toast('Nothing selected is in a group'); return; } editCommand(k); });
  }
}

/* for the tests: the tool driven by canvas points (css px from the canvas's top left) */
const at = (px, py, o) => { const K = kit(); const r = K.D.cv.getBoundingClientRect(); return Object.assign({ clientX: r.left + px, clientY: r.top + py, button: 0, altKey: false }, o || {}); };
export const MATE3D_API = {
  start: () => startMate(),
  stop: () => stopMate(),
  state: () => ({ on: MT.on, first: MT.first ? { el: MT.first.el.name, f: MT.first.f } : null, second: MT.second ? { el: MT.second.el.name, f: MT.second.f } : null, card: !!MT.card }),
  // what a click there would pick, and clicking there
  faceAt: (px, py, o) => { const P = faceAt(at(px, py, o)); return P.error ? { error: P.error } : { el: P.el.name, f: P.f, n: P.F.tris ? P.F.tris.length : 0 }; },
  click(px, py, o) { V3D.api.pointer('pointerdown', px, py, o); V3D.api.pointer('pointerup', px, py, Object.assign({ buttons: 0 }, o || {})); return this.state(); },
  // the card: a type chosen, its distance or angle typed, Flip, and Mate
  choose(type, o = {}) {
    const C = MT.card; if (!C) return null;
    const tb = C.querySelector('[data-mate="' + type + '"]'); if (!tb || tb.disabled) return { error: 'not offered' };
    tb.click();
    const set = (sel, v) => { const i = MT.card.querySelector(sel); if (i && v !== undefined) { i.value = String(v); i.dispatchEvent(new Event('input')); } };
    set('[data-mate-offset]', o.offset); set('[data-mate-angle]', o.angle);
    if (o.flip) { const f = MT.card.querySelector('.rt-check input'); f.checked = true; f.dispatchEvent(new Event('change')); }
    MT.card.querySelector('[data-mate-go]').click();
    return { mates: liveMates().length };
  },
  list: () => JSON.parse(JSON.stringify(liveMates())),
  kinds: () => Object.assign({}, MATE_KINDS),
  groupMove: (names, d) => groupMove(names.map(n => project.elements.find(e => e.name === n)), d),
  groupTurn: (names, turns) => groupTurn(names.map(n => project.elements.find(e => e.name === n)), turns),
};
