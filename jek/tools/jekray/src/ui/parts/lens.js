import { orderRow } from '../../io/order.js';
import { glassKey } from '../../core/glass.js';
import { deg, project } from '../../state/project.js';
import { lensStacks, lensSurfaces, sagFn } from '../../core/geometry.js';
import { elementSurfaces } from '../../core/stl.js';
import { frame } from '../../core/mask.js';
import { ctx, drawMount, getCss, lightLayer, pathLocal, selInk, surfPoints } from '../render.js';
import { bindSync, fid, h, numInput, panel, param, paramCell, selectBox, selectField, setFid } from '../panel.js';
import { paraxial } from '../../engines/trace.js';
import { coatingRows, coatingSelect, mountSection, rfLensPatternSection } from '../panels.js';
import { RF_MAT } from '../../core/rf.js';
import { clipNote } from '../heavy.js';
import {
  askForGlass, askForMaterial, flipLens, glassNote, materialOptions, pickMaterial, removeSweeps, unknownGlass,
  unknownGlassNote
} from '../plots.js';
import { changed, toast } from '../actions.js';
import { FF_KEYS, ffLabel } from '../../core/freeform.js';
import { DP_N, dpLabel, normOrder } from '../../core/diffractive.js';
import { GR_N, grLabel } from '../../core/gradient.js';
import { checkpoint } from '../tabs.js';
import { asmOf } from '../../core/assembly.js';
import { makeAssembly } from '../assembly.js';
import { openLensDesign } from '../lens-workspace.js';

/* Lens on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/lens.js */

/* a stack's face across, [x, y] in the part's frame: sampled over its width, with a point either side of each member's edge */
function stackPoints(st, n, reverse) {
  const ys = []; for (let i = 0; i <= n; i++) ys.push(st.semi * (2 * i / n - 1));
  for (const r of st.edges) for (const sg of [1, -1]) ys.push(sg * (r - 1e-6), sg * (r + 1e-6));
  ys.sort((a, b) => a - b); if (reverse) ys.reverse();
  return ys.map(y => { const v = st.sag(y); return [st.z + (isFinite(v) ? v : 0), y]; });
}
function drawLens(el, sel) {
  const f = frame(el);
  const ss = lensSurfaces(el), stacks = lensStacks(ss);
  const glass = getCss('--rt-glass');
  // the glass between one face and the next (a face is a stack of the surfaces sharing a vertex, each where it reaches)
  for (let i = 0; i < stacks.length - 1; i++) {
    if (el.materials[stacks[i].last].glass === 'AIR') continue;
    const pts = stackPoints(stacks[i], 48, false).concat(stackPoints(stacks[i + 1], 48, true));
    pathLocal(f, pts, true);
    // an RF lens is white plastic (PTFE, HDPE), not glass
    ctx.fillStyle = el.mmw ? 'rgba(242,242,236,0.5)' : 'rgba(115,185,202,0.16)';
    ctx.fill();
    ctx.strokeStyle = sel ? selInk() : el.mmw ? (lightLayer ? '#8f8f88' : '#f2f2ec') : glass;
    ctx.lineWidth = sel ? 2 : 1.4;
    ctx.stroke();
  }
  // a mirror-coated surface: silvered, a thick bright line along it between its hole and its edge
  for (const s of ss) {
    if (!s.silver) continue;
    for (const sg of [1, -1]) {
      const pts = []; for (let q = 0; q <= 32; q++) { const y = sg * ((s.hole || 0) + (s.semi - (s.hole || 0)) * q / 32); pts.push([s.z + sagFn(s, y), y]); }
      pathLocal(f, pts); ctx.save(); ctx.lineWidth = sel ? 4 : 3.2; ctx.strokeStyle = sel ? selInk() : '#dfe5ea'; ctx.lineCap = 'butt'; ctx.stroke(); ctx.restore();
    }
  }
  // a diffractive face: its zones, as a broken line along it
  for (const s of ss) {
    if (!s.ph) continue;
    pathLocal(f, surfPoints(s, 48, false, f));
    ctx.save(); ctx.setLineDash([1.5, 2.5]); ctx.lineWidth = 3.2; ctx.strokeStyle = sel ? selInk() : glass; ctx.stroke(); ctx.restore();
  }
  if (el.mount) {
    // the flange about the middle of the rim: where the first and last faces meet the edge
    const rimX = s => { const P = surfPoints(s, 8, false, null); return P.reduce((b, p) => (Math.abs(p[1]) > Math.abs(b[1]) ? p : b))[0]; };
    drawMount(f, (rimX(ss[0]) + rimX(ss[ss.length - 1])) / 2, el.diameter / 2, el.mount, sel);
  }
}

/* a fold for a part's less used settings: a summary that opens it (kept open as it was across redraws, and open to
   start with when any of them is set) */
const foldOpen = new Map();
export function moreFold(key, label, set, body) {
  const d = h('details', { class: 'rt-morefold' }, h('summary', null, label), body);
  if (foldOpen.has(key) ? foldOpen.get(key) : set) d.open = true;
  d.addEventListener('toggle', () => foldOpen.set(key, d.open));
  return d;
}
/* a lens's glass after face i, as a list (searching and importing from it as before) */
function glassSelect(el, i, bare) {
  const m = el.materials[i];
  const set = v => {
    const old = el.materials[i];
    if (v === 'import') { askForMaterial(mm => { el.materials[i] = mm; changed(true); }); return; }
    if (v === 'search') { askForGlass(k => { checkpoint(); removeSweeps(el, `materials.${i}.`); el.materials[i] = pickMaterial(k, el.materials[i]); changed(true); }); return; }
    removeSweeps(el, `materials.${i}.`);
    el.materials[i] = pickMaterial(v, old);
  };
  const opts = materialOptions(m, !!el.mmw), get = () => glassKey(m.glass) || m.glass;
  return bare ? selectBox(opts, get, set, { aria: bare }) : selectField('Glass', opts, get, set);
}
/* its focal length, typed: every face's radius scaled by one factor (found by the secant method on the paraxial EFL,
   thickness kept), so the lens keeps its form; a flat face stays flat */
export function setLensFocal(el, f, nm) {
  const R0 = el.surfaces.map(q => q.R), efl = k => { el.surfaces.forEach((q, j) => { q.R = R0[j] === null ? null : R0[j] * k; }); return paraxial(el, nm).efl; };
  if (!(isFinite(f) && f !== 0) || R0.every(r => r === null)) return false;
  let k0 = 1, f0 = efl(1), k1 = f / f0, f1 = efl(k1);
  for (let it = 0; it < 30 && isFinite(f1) && Math.abs(f1 - f) > 1e-9 * Math.abs(f); it++) {
    const k2 = k1 + (f - f1) * (k1 - k0) / ((f1 - f0) || 1e-30);
    if (!isFinite(k2) || k2 <= 0) break;
    k0 = k1; f0 = f1; k1 = k2; f1 = efl(k1);
  }
  if (!isFinite(f1) || Math.abs(f1 - f) > 1e-4 * Math.abs(f)) { el.surfaces.forEach((q, j) => { q.R = R0[j]; }); return false; }
  el.surfaces.forEach(q => { if (q.R !== null) q.R = +q.R.toPrecision(10); });
  return true;
}
// the wavelength a lens's focal length is given at: the bench's first source's
const lensNm = () => { const s0 = project.elements.find(e => e.type === 'source'); return s0 ? s0.wavelength : 587.6; };
function focalRow(el) {
  const id = 'rtf' + (setFid(fid + 1)), nm = lensNm();
  const inp = numInput(id, () => { const v = paraxial(el, nm).efl; return isFinite(v) ? +v.toPrecision(6) : ''; }, v => {
    if (!setLensFocal(el, v, nm)) toast('That focal length cannot be reached by scaling its faces');
  }, { commit: true, placeholder: 'none' });
  return h('div', { class: 'rt-f wide', title: 'Its effective focal length at ' + nm + ' nm (the bench\u2019s first source). Type one to have it: every face\u2019s radius is scaled together, so it keeps its form; its thickness stays.' },
    h('label', { for: id }, 'Focal length (mm)'), inp);
}
/* the lens to scale, in its own frame (light from the left): each glass tinted, each face's outline (a coated face in
   its coating's colour, a mirror in silver), its radius beside it, its thickness and diameter dimensioned, and a warning
   where faces cross. A face clicked: its radius */
function lensDiagram(el, rIn) {
  const cv = h('canvas', { class: 'rt-lensdiag', role: 'img', 'aria-label': 'The lens drawn to scale' });
  const warn = h('p', { class: 'rt-lenswarn', hidden: '' });
  const box = h('div', { class: 'rt-lensbox' }, cv, warn);
  let faces = [];
  const draw = () => {
    let ss;
    try { ss = elementSurfaces(el).filter(q => q.kind === 'refract' || q.kind === 'mirror' || q.stack !== undefined); } catch (err) { return; }
    // a face that draws no outline (nothing of it left between its hole and its rim) is left out
    const P = [];
    ss = ss.filter(q => { const pts = surfPoints(q, 64, false, null); if (!pts || pts.length < 2) return false; P.push(pts); return true; });
    if (!ss.length) return;
    const W = Math.max(200, box.clientWidth || 280), Hh = 132, dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    const a = el.diameter / 2;
    let x0 = Infinity, x1 = -Infinity;
    for (const pts of P) for (const [x] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const padL = 34, padR = 34, padT = 12, padB = 26, sc = Math.min((W - padL - padR) / Math.max(1e-6, x1 - x0), (Hh - padT - padB) / (2 * a));
    const cx = padL + ((W - padL - padR) - (x1 - x0) * sc) / 2 - x0 * sc, cy = padT + (Hh - padT - padB) / 2;
    const X = x => cx + x * sc, Y = y => cy - y * sc;
    const ink = getCss('--jek-ink') || '#222', soft = getCss('--jek-ink-soft') || '#777';
    // the light's way, along the axis
    g.strokeStyle = soft; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(6, cy); g.lineTo(W - 6, cy); g.stroke(); g.setLineDash([]);
    g.fillStyle = soft; g.beginPath(); g.moveTo(14, cy - 4); g.lineTo(22, cy); g.lineTo(14, cy + 4); g.fill();
    // each glass between one face and the next, tinted
    for (let i = 0; i + 1 < ss.length; i++) {
      const m = el.materials[Math.min(i, el.materials.length - 1)];
      if (!m || m.glass === 'AIR') continue;
      g.beginPath(); P[i].forEach(([x, y], j) => (j ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); [...P[i + 1]].reverse().forEach(([x, y]) => g.lineTo(X(x), Y(y))); g.closePath();
      g.fillStyle = 'rgba(115, 185, 202, ' + (0.22 + 0.1 * (i % 2)) + ')'; g.fill();
    }
    // the faces: a coated one in its colour, a mirror silver, a plain one in ink
    faces = [];
    ss.forEach((q, i) => {
      const mode = q.coat && q.coat.mode;
      g.strokeStyle = mode === 'mirror' ? '#9aa4ab' : mode && mode !== 'bare' ? '#8a5cc7' : ink; g.lineWidth = mode && mode !== 'bare' ? 2.2 : 1.4;
      g.beginPath(); P[i].forEach(([x, y], j) => (j ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke();
      faces.push(P[i].map(([x, y]) => [X(x), Y(y)]));
    });
    // the outline's top and bottom edges, face to face
    g.strokeStyle = ink; g.lineWidth = 1;
    for (let i = 0; i + 1 < ss.length; i++) for (const end of [false, true]) { const A = P[i][end ? P[i].length - 1 : 0], B = P[i + 1][end ? P[i + 1].length - 1 : 0]; g.beginPath(); g.moveTo(X(A[0]), Y(A[1])); g.lineTo(X(B[0]), Y(B[1])); g.stroke(); }
    // its radii, by its faces; its thickness under the axis; its diameter at the side
    g.font = '11px ' + (getCss('--jek-sans') || 'sans-serif'); g.fillStyle = ink; g.textBaseline = 'middle';
    el.surfaces.forEach((sd, i) => {
      const q = P[i]; if (!q) return;
      const top = q[q.length - 1], lbl = 'R' + (i + 1) + ' ' + (sd.R === null ? 'flat' : (+sd.R.toPrecision(4)) + '') + (sd.fresnel ? ' (Fresnel)' : '');
      g.textAlign = i === 0 ? 'right' : i === el.surfaces.length - 1 ? 'left' : 'center';
      const tx = i === 0 ? X(top[0]) - 4 : i === el.surfaces.length - 1 ? X(top[0]) + 4 : X(top[0]);
      g.fillText(lbl, tx, Math.max(7, Y(top[1]) - (i > 0 && i < el.surfaces.length - 1 ? 7 : -8)));
    });
    const T = el.gaps.reduce((p, q) => p + q, 0);
    const xa = X(ss[0].z), xb = X(ss[ss.length - 1].z), yb = Hh - 9;
    g.strokeStyle = soft; g.fillStyle = soft; g.beginPath(); g.moveTo(xa, yb); g.lineTo(xb, yb); g.stroke();
    for (const xx of [xa, xb]) { g.beginPath(); g.moveTo(xx, yb - 3); g.lineTo(xx, yb + 3); g.stroke(); }
    g.textAlign = 'center'; g.fillText((+T.toPrecision(4)) + ' mm', (xa + xb) / 2, yb - 8);
    const xd = W - 12; g.beginPath(); g.moveTo(xd, Y(a)); g.lineTo(xd, Y(-a)); g.stroke();
    for (const yy of [Y(a), Y(-a)]) { g.beginPath(); g.moveTo(xd - 3, yy); g.lineTo(xd + 3, yy); g.stroke(); }
    g.save(); g.translate(xd - 7, cy); g.rotate(-Math.PI / 2); g.fillText('\u00d8 ' + (+(2 * a).toPrecision(4)), 0, 0); g.restore();
    // faces that cross before the rim: the edge thinner than nothing
    let cross = '';
    for (let i = 0; i + 1 < ss.length; i++) {
      const A = P[i], B = P[i + 1], m = el.materials[Math.min(i, el.materials.length - 1)];
      if (!m || m.glass === 'AIR' || el.gaps[i] === 0) continue;
      const e = Math.min(B[0][0] - A[0][0], B[B.length - 1][0] - A[A.length - 1][0]);
      if (e < -1e-9) cross = 'Faces ' + (i + 1) + ' and ' + (i + 2) + ' cross before its rim (its edge would be ' + (+e.toPrecision(3)) + ' mm thick): make it thicker, or smaller across.';
    }
    warn.textContent = cross; warn.hidden = !cross;
  };
  bindSync(cv, () => requestAnimationFrame(draw));
  // a face clicked: its radius field
  cv.addEventListener('click', ev => {
    const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
    let best = -1, bd = 14;
    faces.forEach((pts, i) => { for (const [x, y] of pts) { const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = i; } } });
    if (best < 0) return;
    const inp = rIn[best];
    if (inp) { inp.focus(); inp.select(); }
  });
  return box;
}
function lensPanel(el) {
  panel.append(h('h3', null, el.mmw ? 'RF lens' : 'Lens'));
  // the lens drawn to scale, its faces' radii, its thickness and diameter on it; a face clicked goes to its radius
  const rIn = [];
  panel.append(lensDiagram(el, rIn));
  const N = el.surfaces.length, two = N === 2;
  const shapeSel = selectField('Shape', [['round', 'Round'], ['plane', 'Cylinder, power in the bench plane'], ['out', 'Cylinder, power out of the plane']],
    () => el.cyl || 'round', v => { el.cyl = v === 'round' ? undefined : v; });
  // two to a row: its shape and (one glass) its glass; its diameter and (one glass) its thickness; more glasses: theirs in the face table
  const dia = param('Diameter (mm)', el, 'diameter');
  if (two) panel.append(h('div', { class: 'rt-pgrid2' }, shapeSel, glassSelect(el, 0)),
    h('div', { class: 'rt-pgrid2' }, dia, param('Thickness (mm)', el, 'gaps.0', el.gaps[0] === 0 ? { blank: 0, placeholder: 'stacked' } : {})));
  else panel.append(h('div', { class: 'rt-pgrid2' }, shapeSel, dia));
  // its focal length, to set: the faces' radii scaled together, so its form stays (biconvex, plano-convex, meniscus)
  if (!el.mmw && !el.graded) panel.append(h('div', { class: 'rt-rows' }, focalRow(el)));
  const clip = clipNote(el);
  if (clip) panel.append(h('p', { class: 'rt-assumed' }, clip));
  if (el.diffractive) {
    // a diffractive lens: the order its faces send the light into (all of it, as a blaze would)
    const oid = 'rtf' + (setFid(fid + 1));
    panel.append(h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide', title: 'The order of diffraction its zones are blazed for: all the light is taken to go into it' },
      h('label', { for: oid }, 'Diffraction order'), numInput(oid, () => el.diffOrder || 1, v => { const m = normOrder(Math.round(v)); el.diffOrder = m === 1 ? undefined : m; }))));
  }

  // the glass after surface i (its thickness and material are up top for a lens of one glass, else its row in the face
  // table): its index, absorption and grading
  const glassMore = i => {
    const m = el.materials[i], mrows = h('div', { class: 'rt-rows' });
    const gn = glassNote(m); if (gn) mrows.append(gn);
    if (m.glass === 'custom') mrows.append(param('Index n', el, `materials.${i}.n`, { wide: true }));
    if (unknownGlass(m)) mrows.append(unknownGlassNote(m));
    if (m.glass !== 'AIR') mrows.append(param('Absorption (per mm)', el, `materials.${i}.abs`, { wide: true }));
    // a graded lens's glass: its index's terms in r from the axis, those it has and one more to add
    if (el.graded && m.glass !== 'AIR') {
      const G = m.grad || [], unit = ['mm⁻²', 'mm⁻⁴', 'mm⁻⁶'];
      G.forEach((_, j) => mrows.append(param('Gradient ' + grLabel(j) + ' (' + unit[j] + ')', el, `materials.${i}.grad.${j}`, { blank: 0, wide: true })));
      mrows.append(h('div', { class: 'rt-inline wide', title: 'The index n(r) = n + g₂r² + g₄r⁴ + g₆r⁶ in this glass, r mm from the lens’s axis: below 0, it falls away from the axis and focuses' },
        G.length < GR_N ? h('button', { class: 'rt-link', type: 'button', 'aria-label': 'Add a gradient term to glass ' + (i + 1), onclick: () => { checkpoint(); m.grad = G.concat(0); changed(true); } },
          G.length ? 'Add ' + grLabel(G.length) + ' gradient term' : 'Grade this glass') : null,
        G.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
          checkpoint(); removeSweeps(el, `materials.${i}.grad.${G.length - 1}`); m.grad = G.slice(0, -1); if (!m.grad.length) delete m.grad; changed(true);
        } }, 'Remove ' + grLabel(G.length - 1) + ' term') : null));
    }
    const out = [mrows];
    if (el.gaps[i] === 0) out.push(h('p', { class: 'note' }, 'Surface ' + (i + 2) + ' is stacked on this one, at the same vertex: the two make one face, each applying between its hole and its clear radius. Give the thickness a value to part them.'));
    return out;
  };
  // a lens of one glass: its glass's index, absorption and grading, under its glass
  if (two) panel.append(...glassMore(0));
  panel.append(h('h3', null, 'Faces'));
  // the faces as a table, a row each: its number, radius and coating, and a ▸ opening the rest (clear radius, Fresnel
  // rings, the coating's own numbers, an asphere's terms), open by itself when any of those is set; a lens of more than
  // one glass has a row for each glass between its faces, its thickness and glass, its ▸ its index and absorption
  const grid = h('div', { class: 'rt-facegrid' }, h('span'), h('span', { class: 'rt-facecol' }, two ? 'Radius (mm)' : 'Radius, thickness (mm)'), h('span', { class: 'rt-facecol' }, two ? 'Coating' : 'Coating, glass'), h('span'));
  const swept = pre => Object.keys(el.sweeps || {}).some(k => k.startsWith(pre));
  const moreRow = (key, what, set, nodes, cells) => {
    const body = h('div', { class: 'rt-facemore' }, ...nodes);
    const open = foldOpen.has(key) ? foldOpen.get(key) : set;
    body.hidden = !open;
    const btn = h('button', { class: 'rt-facebtn' + (open ? ' open' : ''), type: 'button', 'aria-expanded': String(open), title: what, 'aria-label': what,
      onclick: () => { const o = body.hidden; body.hidden = !o; foldOpen.set(key, o); btn.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o)); } }, '▸');
    grid.append(...cells, btn, body);
  };
  for (let i = 0; i < N; i++) {
    const s = el.surfaces[i], c = s.coat || { mode: 'bare' };
    const R = paramCell('Radius of face ' + (i + 1) + ' (mm)', el, `surfaces.${i}.R`, { blank: null, placeholder: 'flat', prefix: 'R' + (i + 1) });
    rIn[i] = R.inp;
    const rCell = h('div', { class: 'rt-facer' + (R.sw ? ' swept' : '') }, R.inp, R.toggle || null);
    const more = [];
    if (s.hole > 0) more.push(h('p', { class: 'rt-hint' }, 'A hole ' + (+s.hole.toPrecision(4)) + ' mm in radius at its centre: no surface there. Set in the Optical designer (Design as an assembly…).'));
    // where the surface reaches to (the lens's own unless given), and a Fresnel face's rings (a curved face only)
    const geo = h('div', { class: 'rt-rows' }, param('Clear radius (mm)', el, `surfaces.${i}.semi`, { blank: null, placeholder: (el.diameter / 2).toPrecision(4) }));
    if (!el.cyl && !el.zoned && (s.R !== null || s.fresnel)) geo.append(param('Fresnel rings (mm)', el, `surfaces.${i}.fresnel`, { blank: null, placeholder: 'solid' }));
    // a conic and aspheric terms are an asphere's: a plain lens's surfaces are spheres
    if (el.asphere) geo.append(param('Conic k', el, `surfaces.${i}.k`, { blank: 0 }));
    if (s.a2 !== 0) geo.append(param('A2 (mm⁻¹)', el, `surfaces.${i}.a2`, { blank: 0 }));
    if (s.odd && s.odd[0]) {
      // an axicon's cone, given as its base angle; stored as the odd r^1 sag term
      const cid = 'rtf' + (setFid(fid + 1));
      const cone = numInput(cid, () => +(Math.atan(s.odd[0]) / deg).toPrecision(6), v => { if (Math.abs(v) < 80) s.odd[0] = Math.tan(v * deg); });
      geo.append(h('div', { class: 'rt-f wide' }, h('label', { for: cid }, 'Cone angle (°)'), cone));
    }
    if (el.asphere) s.A.forEach((_, j) => geo.append(param('A' + (4 + 2 * j), el, `surfaces.${i}.A.${j}`, { blank: 0 })));
    if (el.asphere) geo.append(h('div', { class: 'rt-inline wide' },
      h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); s.A.push(0); changed(true); } },
        s.A.length ? 'Add A' + (4 + 2 * s.A.length) + ' term' : 'Add aspheric terms'),
      s.A.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
        checkpoint(); removeSweeps(el, `surfaces.${i}.A.${s.A.length - 1}`); s.A.pop(); changed(true);
      } }, 'Remove A' + (2 + 2 * s.A.length)) : null,
    ));
    // an asphere's freeform terms, c x^m y^n on the sag (x up, y across): those it has, and one more to add
    if (el.asphere) geo.append(...ffRows(el, s, `surfaces.${i}.F`, 'surface ' + (i + 1)));
    // a diffractive lens's phase on this face, c ρ² … in radians: those it has, and one more to add
    if (el.diffractive) {
      const ph = s.ph || [];
      ph.forEach((_, j) => geo.append(param('Phase ' + dpLabel(j) + ' (rad)', el, `surfaces.${i}.ph.${j}`, { blank: 0 })));
      geo.append(h('div', { class: 'rt-inline wide', title: 'The phase written on this face, φ = c₁ρ² + c₂ρ⁴ + …, radians at ρ mm from the axis' },
        ph.length < DP_N ? h('button', { class: 'rt-link', type: 'button', 'aria-label': 'Add a phase term to surface ' + (i + 1), onclick: () => { checkpoint(); s.ph = ph.concat(0); changed(true); } },
          ph.length ? 'Add ' + dpLabel(ph.length) + ' phase term' : 'Add a diffractive phase') : null,
        ph.length ? h('button', { class: 'rt-link', type: 'button', onclick: () => {
          checkpoint(); removeSweeps(el, `surfaces.${i}.ph.${ph.length - 1}`); s.ph = ph.slice(0, -1); if (!s.ph.length) delete s.ph; changed(true);
        } }, 'Remove ' + dpLabel(ph.length - 1) + ' term') : null));
    }
    more.push(geo, coatingRows(el, s, null, { noSelect: true }));
    if (c.mode === 'mirror') more.push(h('p', { class: 'note' }, 'A mirror coating: light meeting this surface reflects and stays in the glass it came from (a surface stacked in its hole, or round it, takes the rest).'));
    if (R.box) more.unshift(R.box);
    const set = !!(R.box || s.hole > 0 || s.semi || s.fresnel || s.k || (s.A && s.A.length) || s.F || (s.ph && s.ph.length) || s.a2 || (s.odd && s.odd[0]) ||
      (c.mode !== 'bare' && c.mode !== 'ar') || (c.mode === 'ar' && c.R !== 0.5) || swept(`surfaces.${i}.`));
    moreRow(el.id + '|s' + i, 'More for face ' + (i + 1) + ': clear radius, Fresnel rings' + (el.asphere ? ', aspheric terms' : '') + ', the coating’s numbers', set, more,
      [h('span', { class: 'rt-facenum', title: 'Face ' + (i + 1) }, String(i + 1)), rCell, coatingSelect(el, s, 'Coating of face ' + (i + 1))]);
    // the glass between this face and the next, for a lens of more than one glass
    if (i < N - 1 && !two) {
      const T = paramCell('Thickness to face ' + (i + 2) + ' (mm)', el, `gaps.${i}`, Object.assign({ prefix: 't' + (i + 1) }, el.gaps[i] === 0 ? { blank: 0, placeholder: 'stacked' } : {}));
      const gm = glassMore(i);
      if (T.box) gm.unshift(T.box);
      const m = el.materials[i];
      moreRow(el.id + '|g' + i, 'More for the glass to face ' + (i + 2) + ': its index and absorption', !!(T.box || el.gaps[i] === 0 || m.abs || m.grad || m.glass === 'custom' || unknownGlass(m) || swept(`materials.${i}.`)), gm,
        [h('span', { class: 'rt-facenum rt-faceglass', title: 'The glass to face ' + (i + 2) }, '↕'), h('div', { class: 'rt-facer' + (T.sw ? ' swept' : '') }, T.inp, T.toggle || null), glassSelect(el, i, 'Glass to face ' + (i + 2))]);
    }
  }
  panel.append(grid);
  // a made-to-order RF lens: how it is mounted
  if (el.mmw && el.materials.length === 1 && RF_MAT[el.materials[0].glass] && RF_MAT[el.materials[0].glass].print) mountSection(el);
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'lens' }));
  // an RF lens: the system it is part of designed in the RF designer (made an assembly of its own first if it is not one)
  if (el.mmw) panel.append(h('div', { class: 'rt-rows' }, h('button', { class: 'rt-btn', type: 'button', title: 'Its feed horn’s beam through it to the goal: design the lens and the system in the RF designer',
    onclick: () => { const a = asmOf(el) || makeAssembly([el]); if (a) openLensDesign(a); } }, 'Design as an RF assembly…')));
  if (el.mmw) rfLensPatternSection(el);                                     // an RF lens with its horn, as an antenna
  if (el.mmw) { const o = orderRow(el); if (o) panel.append(o); }          // an RF lens that can be made: ask for a quote
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => { checkpoint(); flipLens(el); changed(true); } }, 'Flip'),
  ));
}

/* a surface's freeform terms on the bench: each a number, taken off with its ×, and a list of those it has not */
export function ffRows(el, obj, path, what) {
  const F = obj.F || {}, out = FF_KEYS.filter(k => k in F).map(k => {
    const row = param(ffLabel(k) + ' (freeform)', el, path + '.' + k, { blank: 0 });
    row.append(h('button', { type: 'button', class: 'rt-link', title: 'Take this term off', 'aria-label': 'Take ' + ffLabel(k) + ' off ' + what, onclick: () => {
      checkpoint(); removeSweeps(el, path + '.' + k); const G = Object.assign({}, obj.F); delete G[k]; if (Object.keys(G).length) obj.F = G; else delete obj.F; changed(true);
    } }, '×'));
    return row;
  });
  const left = FF_KEYS.filter(k => !(k in F));
  if (left.length) {
    const pick = h('select', { 'aria-label': 'Freeform term to add to ' + what }, h('option', { value: '' }, 'Add a freeform term…'), ...left.map(k => h('option', { value: k }, ffLabel(k))));
    pick.addEventListener('change', () => { if (!pick.value) return; checkpoint(); obj.F = Object.assign({}, obj.F || {}, { [pick.value]: 0 }); changed(true); });
    out.push(h('div', { class: 'rt-inline wide', title: 'Terms c x^m y^n added to its sag: x up out of the bench plane, y across the part' }, pick));
  }
  return out;
}

function hitLens(el, lx, ly, tol) {
  const ss = elementSurfaces(el), a = ss[0], b = ss[ss.length - 1], r = el.diameter / 2 + tol;
  return Math.abs(ly) <= r && lx >= a.xmin - tol && lx <= b.xmax + tol;
}

export const LENS_UI = {
  draw: drawLens, hit: hitLens, panel: lensPanel, rank: 3,
};
