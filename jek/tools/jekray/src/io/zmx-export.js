import { glassKey, refIndex } from '../core/glass.js';
import { deg, project, selectOne, typeLabel, uid } from '../state/project.js';
import { benchNms, normElement } from '../state/elements.js';
import { onTab } from '../state/tabs.js';
import { paraxial } from '../engines/trace.js';
import { selection, setSelection } from '../ui/render.js';
import { changed, clipOf, downloadFile, safeFileName, toast } from '../ui/actions.js';
import { checkpoint } from '../ui/tabs.js';
import { asmOfSelection, asmPrescription, normCond } from '../core/assembly.js';
import { designFigures, designPrescription, objectOf } from '../engines/lens-design.js';
import { lensSystem } from '../engines/lens-engine.js';
import { parseZmx, readZmxFile, zmxToElement } from './zmx-import.js';
import { MINE, clipIcon, mineChanged } from '../ui/myparts.js';
import { api, showSubscribe } from './account.js';
import { personalWs } from './cloud.js';
import { openLensDesign } from '../ui/lens-workspace.js';
import { designOne } from '../ui/assembly.js';

/* ==========================================================================
   .zmx lens file export
   A lens, a run of lenses and windows on one axis, or a mirror, written as a sequential
   prescription that lens-design programs read: object at infinity, the stop on the first
   face, each face's curvature, conic and aspheric terms, its glass and its semi-diameter,
   then the image at the paraxial focus. An assembly that folds at a mirror, or has a part tilted or
   decentred, is written with coordinate breaks (below). Coatings are not written.
   ========================================================================== */

// the name a lens-design catalogue knows our glasses by; the rest go as model glasses
const ZMX_CAT = { 'Fused silica': 'F_SILICA', CaF2: 'CAF2', MgF2: 'MGF2', Sapphire: 'SAPPHIRE', ZnSe: 'ZNSE',
  Silicon: 'SILICON', Germanium: 'GERMANIUM', Water: 'WATER', Polystyrene: 'POLYSTYR' };
const zmxNum = v => (Math.abs(v) < 1e-300 ? 0 : v).toExponential(14).toUpperCase();
/* nd and Vd of a material, worked out from its index */
function zmxNdVd(mat) {
  const nd = refIndex(mat, 587.5618), nF = refIndex(mat, 486.1327), nC = refIndex(mat, 656.2725);
  const dn = nF - nC;
  return { nd, vd: dn > 1e-9 ? (nd - 1) / dn : 0 };
}
function zmxGlass(mat) {
  const { nd, vd } = zmxNdVd(mat);
  const tail = ' ' + [zmxNum(nd), zmxNum(vd), 0, 0, 0, 0, 0, 0].join(' ');
  const key = !mat.table && !mat.nlc ? glassKey(mat.glass) : null;
  if (key) return 'GLAS ' + (ZMX_CAT[key] || key) + ' 0 0' + tail;
  // a model glass: its index and dispersion at d
  return 'GLAS ___BLANK 1 0' + tail;
}

/* The faces of the parts chosen, in order along a common axis, or a reason they can't be */
function zmxSystem(els) {
  if (!els.length) throw new Error('Select a lens, a window or a mirror to export.');
  const mirrors = els.filter(e => e.type === 'mirror');
  if (mirrors.length) {
    if (els.length > 1) throw new Error('A mirror can only be exported on its own.');
    return { mirror: mirrors[0], name: mirrors[0].name || 'Mirror', warnings: new Set() };
  }
  const ok = e => (e.type === 'lens' && !e.cyl) || (e.type === 'prism' && e.shape === 'window');
  const bad = els.find(e => !ok(e));
  if (bad) {
    throw new Error(bad.type === 'lens' ? (bad.name || 'A lens') + ' is cylindrical, which a rotationally symmetric prescription can’t hold.'
      : (bad.name || typeLabel(bad)) + ' can’t be exported: only lenses, windows and mirrors can.');
  }
  const a0 = els[0].angle * deg, d = [Math.cos(a0), Math.sin(a0)];
  const warnings = new Set();
  const turned = e => { const da = ((((e.angle - els[0].angle) % 360) + 360) % 360); return Math.abs(da - 180) < 1e-6; };
  // the light goes away from a source on the axis; without one, the way most of them face,
  // or, as many each way, left to right across the bench
  const nt = els.filter(turned).length;
  const half = Math.max(...els.map(e => (e.diameter || e.size || 0) / 2));
  const src = project.elements.filter(e => e.type === 'source' && onTab(e) &&
    Math.abs(-(e.x - els[0].x) * d[1] + (e.y - els[0].y) * d[0]) < half)
    .sort((p, q) => Math.hypot(p.x - els[0].x, p.y - els[0].y) - Math.hypot(q.x - els[0].x, q.y - els[0].y))[0];
  const back = src ? (src.x - els[0].x) * d[0] + (src.y - els[0].y) * d[1] > 0
    : 2 * nt > els.length || (2 * nt === els.length && (d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0)));
  if (back) { d[0] = -d[0]; d[1] = -d[1]; }
  const groups = els.map(e => {
    const da = ((((e.angle - els[0].angle) % 360) + 360) % 360);
    const flip = turned(e) !== back;
    if (!turned(e) && Math.min(da, 360 - da) > 1e-6) throw new Error((e.name || typeLabel(e)) + ' is not on the same axis as ' + (els[0].name || 'the first part') + ': it faces another way.');
    const rx = e.x - els[0].x, ry = e.y - els[0].y;
    if (Math.abs(-rx * d[1] + ry * d[0]) > 1e-3) throw new Error((e.name || typeLabel(e)) + ' is off the axis of ' + (els[0].name || 'the first part') + '. Line them up to export them together.');
    let surfaces, gaps, materials;
    if (e.type === 'lens') {
      surfaces = e.surfaces.map(s => ({ R: s.R, k: s.k, a2: s.a2, A: s.A.slice(), odd: s.odd ? s.odd.slice() : null, semi: s.semi || e.diameter / 2 }));
      gaps = e.gaps.slice(); materials = e.materials.slice();
    } else {
      const s = { R: null, k: 0, a2: 0, A: [], odd: null, semi: e.size / 2 };
      surfaces = [s, Object.assign({}, s)]; gaps = [e.thickness]; materials = [e.material];
    }
    if (flip) {
      // turned round: its faces meet the light in the other order, each sag of the other sign
      surfaces = surfaces.reverse().map(s => ({ R: s.R === null ? null : -s.R, k: s.k, a2: -s.a2, A: s.A.map(v => -v),
        odd: s.odd ? s.odd.map(v => -v) : null, semi: s.semi }));
      gaps.reverse(); materials.reverse();
    }
    const T = gaps.reduce((a, b) => a + b, 0), c = rx * d[0] + ry * d[1];
    const coats = e.type === 'lens' ? e.surfaces.map(s => s.coat) : [e.coat];
    if (coats.some(c => c && c.mode !== 'bare')) warnings.add('coatings are not written');
    if (e.type === 'lens' && e.surfaces.some(t => t.F && Object.values(t.F).some(v => v))) warnings.add('freeform terms are not written');
    if (e.type === 'lens' && e.diffractive && e.surfaces.some(t => t.ph && t.ph.some(v => v))) warnings.add('diffractive phases are not written: the faces go as their substrates');
    if (e.type === 'lens' && e.graded && e.materials.some(m => m.grad && m.grad.some(v => v))) warnings.add('graded glass is not written: it goes as the glass on its axis');
    return { e, z0: c - T / 2, z1: c + T / 2, surfaces, gaps, materials };
  }).sort((a, b) => a.z0 - b.z0);
  const surfaces = [], gaps = [], materials = [];
  groups.forEach((g, i) => {
    if (i) {
      const air = g.z0 - groups[i - 1].z1;
      if (air < -1e-6) throw new Error((g.e.name || typeLabel(g.e)) + ' overlaps ' + (groups[i - 1].e.name || typeLabel(groups[i - 1].e)) + '.');
      gaps.push(Math.max(0, air)); materials.push({ glass: 'AIR' });
    }
    surfaces.push(...g.surfaces); gaps.push(...g.gaps); materials.push(...g.materials);
  });
  return { surfaces, gaps, materials, name: els.length === 1 ? (els[0].name || typeLabel(els[0])) : 'Lens system', warnings };
}

/* The .zmx text for the parts chosen; nms, the wavelengths to list, the first being primary */
/* an assembly's prescription as the exporter takes it: its stop where it is, its design conditions */
function zmxAssemblySystem(asm) {
  const P = asmPrescription(asm), warnings = new Set();
  // a fold or a part off the axis needs coordinate breaks, which this export does not write
  if (P.surfaces.some(s => s.cyl)) throw new Error(asm.name + ' has a cylindrical lens: export its parts from the bench instead (select them, then Export an element), where a cylinder is written as one.');
  if (P.parts.some(p => p.kind === 'lens' && project.elements.find(e => e.id === p.id).surfaces.some(t => t.coat && t.coat.mode !== 'bare'))) warnings.add('coatings are not written');
  if (P.surfaces.some(s => s.F && Object.values(s.F).some(v => v))) warnings.add('freeform terms are not written');
  if (P.surfaces.some(s => s.ph && s.ph.some(v => v))) warnings.add('diffractive phases are not written: the faces go as their substrates');
  if (P.materials.some(m => m && m.grad && m.grad.some(v => v))) warnings.add('graded glass is not written: it goes as the glass on its axis');
  const mc = asm.design && asm.design.mc && asm.design.mc.configs && asm.design.mc.configs.length > 1 ? asm.design.mc : null;
  if (mc) warnings.add('only the configuration shown (' + mc.configs[mc.active].name + ') is written');
  // an object at a finite distance: its entrance pupil worked out (whatever the aperture is given as), and its image distance
  const d = objectOf(asm.cond);
  let fin = null;
  if (d) { const F = designFigures(asm, designPrescription(asm)); fin = { d, epd: F.epd, image: F.S.imageZ - F.S.z[F.S.N - 1] }; }
  // a fold, a tilt or a decentre: written with coordinate breaks, from the design's own geometry
  const broken = P.surfaces.some(s => s.mirror || s.tilt || s.dtilt || (s.dec && s.dec.some(v => v)));
  const DP = designPrescription(asm);
  return { surfaces: P.surfaces, gaps: P.gaps, materials: P.materials, stopIndex: P.stopIndex, cond: asm.cond, name: asm.name, warnings, fin, broken, asm, DP };
}

/* ---------- Coordinate breaks ----------
   Each surface is placed in its own frame, as the lens engine has it (its vertex and axes, turned and moved by the
   part's tilt and decentre, and folded at each mirror). The file's frames are right-handed, and after an odd number
   of mirrors the light runs along their -z: so there each frame's z is the engine's turned round (x and y kept), the
   thicknesses come out negative, and each surface's sag is of the other sign. From one frame to the next: the step
   along the current z is the previous surface's thickness, then a coordinate break decentres along the current x and
   y and tilts about x, then the new y, then the new z (each right-handed, in degrees). */
const v3 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function zmxFrames(S) {
  const out = [];
  let odd = false;
  for (let i = 0; i < S.N; i++) {
    const F = S.fr ? S.fr[i] : null, R = F ? F.R : [1, 0, 0, 0, 1, 0, 0, 0, 1], o = F ? F.o : [0, 0, S.z[i]];
    const X = [R[0], R[3], R[6]], Y = [R[1], R[4], R[7]], Z = [R[2], R[5], R[8]];
    out.push({ o, X, Y, Z: odd ? Z.map(v => -v) : Z, flip: odd });
    if (S.mir && S.mir[i]) odd = !odd;
  }
  const I = S.img || { p: [0, 0, S.imageZ], e1: [1, 0, 0], e2: [0, 1, 0], d: [0, 0, 1] };
  out.push({ o: I.p, X: I.e1, Y: I.e2, Z: odd ? I.d.map(v => -v) : I.d, flip: odd });
  return out;
}
// the move from frame C to frame T: the step along C's z, the decentre along its x and y, the tilts (degrees)
function zmxMove(C, T) {
  const d = [T.o[0] - C.o[0], T.o[1] - C.o[1], T.o[2] - C.o[2]];
  // T's axes in C's: R = Rx(a) Ry(b) Rz(c), its columns T's axes
  const r = (u, w) => d3(u, w), R02 = r(C.X, T.Z), R12 = r(C.Y, T.Z), R22 = r(C.Z, T.Z), R01 = r(C.X, T.Y), R00 = r(C.X, T.X);
  const b = Math.asin(Math.max(-1, Math.min(1, R02))), a = Math.atan2(-R12, R22), c = Math.atan2(-R01, R00);
  const deg = v => { const x = v * 180 / Math.PI; return Math.abs(x) < 1e-12 ? 0 : x; };
  return { dz: d3(d, C.Z), dx: d3(d, C.X), dy: d3(d, C.Y), a: deg(a), b: deg(b), c: deg(c) };
}

export function zmxExport(els, nms) {
  const asm = asmOfSelection(els);
  const S = asm ? zmxAssemblySystem(asm) : zmxSystem(els);
  nms = (nms && nms.length ? nms : [587.56]).slice(0, 24);
  const C = S.cond || null, waves = C ? C.waves : nms.map(nm => ({ nm, w: 1 })), fields = C ? C.fields : [{ deg: 0, w: 1 }];
  const L = [];
  const semiFirst = S.mirror ? S.mirror.length / 2 : S.surfaces[0].semi;
  const aperture = S.fin ? 'ENPD ' + zmxNum(S.fin.epd) : C && C.aperture.kind === 'fno' ? 'FNUM ' + zmxNum(C.aperture.v) + ' 0' : 'ENPD ' + zmxNum(C ? C.aperture.v : 2 * semiFirst);
  L.push('VERS 190000 0 0', 'MODE SEQ', 'NAME ' + S.name.replace(/[\r\n"]+/g, ' '),
    'NOTE 0 Exported from JEKray. Coatings are not included' + (S.broken ? '; folds, tilts and decentres are coordinate breaks.' : '.'),
    'UNIT MM X W X CM MR CPMM', aperture, 'GCAT SCHOTT OHARA MISC',
    'FTYP ' + (S.fin ? 1 : 0) + ' 0 ' + fields.length + ' ' + waves.length + ' 0 0 0', 'XFLN ' + fields.map(() => '0').join(' '), 'YFLN ' + fields.map(f => zmxNum(f.deg)).join(' '), 'FWGN ' + fields.map(f => zmxNum(f.w)).join(' '));
  waves.forEach((v, i) => L.push('WAVM ' + (i + 1) + ' ' + zmxNum(v.nm / 1000) + ' ' + zmxNum(v.w)));
  L.push('PWAV ' + (C ? C.primary + 1 : 1));
  nms = C ? [C.waves[C.primary].nm] : nms;
  let n = 0;
  const surf = (lines) => { L.push('SURF ' + n++); for (const l of lines) L.push('  ' + l); };
  const diam = semi => 'DIAM ' + zmxNum(semi) + ' 1 0 0 1 ""';
  surf(['TYPE STANDARD', 'CURV 0', 'DISZ ' + (S.fin ? zmxNum(S.fin.d) : 'INFINITY')]);
  if (S.mirror) {
    const m = S.mirror;
    if (m.offset) S.warnings.add('the mirror’s off-axis offset is not written');
    if (m.F && Object.values(m.F).some(v => v)) S.warnings.add('the mirror’s freeform terms are not written');
    // its aspheric terms as an even asphere's, the other sign as its curvature (the file's convention)
    const mA = m.A || [], asp = mA.some(v => v);
    const lines = ['STOP', asp ? 'TYPE EVENASPH' : 'TYPE STANDARD', 'CURV ' + zmxNum(m.R === null ? 0 : -1 / m.R), 'CONI ' + zmxNum(m.k),
      ...(asp ? ['PARM 1 0', ...Array.from({ length: 7 }, (_, q) => 'PARM ' + (q + 2) + ' ' + zmxNum(-(mA[q] || 0)))] : []), 'GLAS MIRROR 0 0 0 0 0 0 0 0 0 0',
      'DISZ ' + zmxNum(m.R === null ? 0 : -m.R / 2), diam(m.length / 2)];
    surf(lines);
    surf(['TYPE STANDARD', 'CURV 0', 'DISZ 0', diam(m.length / 2)]);
    return { text: L.join('\r\n') + '\r\n', name: S.name, warnings: S.warnings };
  }
  if (S.broken) return zmxBroken(S, L, n, nms[0], diam);
  const p = paraxial({ surfaces: S.surfaces, gaps: S.gaps, materials: S.materials }, nms[0]);
  if (!isFinite(p.bfl)) S.warnings.add('it is afocal, so the image is placed at the last face');
  const stopAt = S.stopIndex >= 0 ? S.stopIndex : 0;
  S.surfaces.forEach((s, i) => {
    const lines = i === stopAt ? ['STOP'] : [];
    const A = s.A.slice();
    if (s.odd) {
      // all powers r^1 to r^8, the even ones carrying the even terms
      const b = Array.from({ length: 8 }, (_, q) => s.odd[q] || 0);
      b[1] += s.a2; [3, 5, 7].forEach((q, j) => { b[q] += A[j] || 0; });
      if (A.length > 3) S.warnings.add('aspheric terms beyond r⁸ on an odd asphere are not written');
      lines.push('TYPE ODDASPH');
      lines.push('CURV ' + zmxNum(s.R === null ? 0 : 1 / s.R), 'CONI ' + zmxNum(s.k));
      b.forEach((v, q) => lines.push('PARM ' + (q + 1) + ' ' + zmxNum(v)));
    } else if (s.a2 || A.some(v => v)) {
      if (A.length > 7) S.warnings.add('aspheric terms beyond r¹⁶ are not written');
      lines.push('TYPE EVENASPH');
      lines.push('CURV ' + zmxNum(s.R === null ? 0 : 1 / s.R), 'CONI ' + zmxNum(s.k));
      lines.push('PARM 1 ' + zmxNum(s.a2));
      for (let q = 0; q < 7; q++) lines.push('PARM ' + (q + 2) + ' ' + zmxNum(A[q] || 0));
    } else {
      lines.push('TYPE STANDARD', 'CURV ' + zmxNum(s.R === null ? 0 : 1 / s.R), 'CONI ' + zmxNum(s.k));
    }
    const last = i === S.surfaces.length - 1;
    const m = last ? null : S.materials[i];
    if (m && m.glass !== 'AIR') lines.push(zmxGlass(m));
    lines.push('DISZ ' + zmxNum(last ? (S.fin ? S.fin.image : isFinite(p.bfl) ? p.bfl : 0) : S.gaps[i]), diam(s.semi));
    surf(lines);
  });
  surf(['TYPE STANDARD', 'CURV 0', 'DISZ 0', diam(S.surfaces[S.surfaces.length - 1].semi)]);
  return { text: L.join('\r\n') + '\r\n', name: S.name, warnings: S.warnings, efl: p.efl, bfl: p.bfl };
}
/* the surfaces of a folded, tilted or decentred assembly, after the object surface (n, the next surface's number) */
function zmxBroken(S, L, n, nm, diam) {
  const DP = S.DP, Sy = lensSystem(DP, nm, { image: DP.image }), frames = zmxFrames(Sy), recs = [];
  const push = (lines) => { const r = { lines, disz: 0 }; recs.push(r); return r; };
  let cur = { o: [0, 0, 0], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }, prev = null;
  const moveTo = T => {
    const m = zmxMove(cur, T);
    if (Math.abs(m.dz) > 1e-12) { if (prev) prev.disz = m.dz; else prev = push(['TYPE STANDARD', 'CURV 0']), prev.disz = m.dz; }
    if (Math.abs(m.dx) > 1e-12 || Math.abs(m.dy) > 1e-12 || m.a || m.b || m.c)
      prev = push(['TYPE COORDBRK', 'PARM 1 ' + zmxNum(m.dx), 'PARM 2 ' + zmxNum(m.dy), 'PARM 3 ' + zmxNum(m.a), 'PARM 4 ' + zmxNum(m.b), 'PARM 5 ' + zmxNum(m.c), 'PARM 6 0']);
    cur = T;
  };
  const stopAt = S.stopIndex >= 0 ? S.stopIndex : 0;
  DP.surfaces.forEach((s, i) => {
    const T = frames[i], g = T.flip ? -1 : 1;
    moveTo(T);
    const lines = i === stopAt ? ['STOP'] : [];
    const A = (s.A || []).slice();
    if (s.odd) {
      const b = Array.from({ length: 8 }, (_, q) => s.odd[q] || 0);
      b[1] += s.a2 || 0; [3, 5, 7].forEach((q, j) => { b[q] += A[j] || 0; });
      lines.push('TYPE ODDASPH', 'CURV ' + zmxNum(s.R === null ? 0 : g / s.R), 'CONI ' + zmxNum(s.k || 0));
      b.forEach((v, q) => lines.push('PARM ' + (q + 1) + ' ' + zmxNum(g * v)));
    } else if (s.a2 || A.some(v => v)) {
      lines.push('TYPE EVENASPH', 'CURV ' + zmxNum(s.R === null ? 0 : g / s.R), 'CONI ' + zmxNum(s.k || 0), 'PARM 1 ' + zmxNum(g * (s.a2 || 0)));
      for (let q = 0; q < 7; q++) lines.push('PARM ' + (q + 2) + ' ' + zmxNum(g * (A[q] || 0)));
    } else lines.push('TYPE STANDARD', 'CURV ' + zmxNum(s.R === null ? 0 : g / s.R), 'CONI ' + zmxNum(s.k || 0));
    const m = i < DP.surfaces.length - 1 ? DP.materials[i] : null;
    if (s.mirror) lines.push('GLAS MIRROR 0 0 0 0 0 0 0 0 0 0');
    else if (m && m.glass !== 'AIR') lines.push(zmxGlass(m));
    lines.push(diam(isFinite(s.semi) && s.semi > 0 ? s.semi : 10));
    prev = push(lines);
  });
  moveTo(frames[frames.length - 1]);
  push(['TYPE STANDARD', 'CURV 0']);
  for (const r of recs) { L.push('SURF ' + n++); for (const l of r.lines) L.push('  ' + l); L.push('  DISZ ' + zmxNum(r.disz)); }
  S.warnings.add('folds, tilts and decentres are written as coordinate breaks');
  return { text: L.join('\r\n') + '\r\n', name: S.name, warnings: S.warnings, efl: Sy.par.efl, bfl: Sy.par.bfl };
}
export function exportZmx() {
  try {
    const out = zmxExport(selection(), benchNms());
    const fname = safeFileName(out.name) + '.zmx';
    downloadFile(fname, new Blob([out.text], { type: 'text/plain' }));
    const w = [...out.warnings];
    toast('Exported ' + fname + (w.length ? '. Note: ' + w.join('; ') + '.' : ''));
  } catch (err) { toast(err.message, true); }
}

/* the part a parsed file makes, carrying what its import assumed; a glass's missing index is
   checked live instead (see partAssumptions), so it clears once the glass is chosen */
export function zmxPart(Z, fileName, mode) {
  const el = zmxToElement(Z, fileName, mode);
  const kept = [...Z.warnings].filter(w => !/so n = 1\.5 was used/.test(w));
  if (kept.length) el.assumed = kept.map(w => w.charAt(0).toUpperCase() + w.slice(1) + '.');
  return normElement(el);
}
/* a .zmx file read into a part: Z (the parsed file, with its warnings) and the element */
function zmxElement(file, mode) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const F = readZmxFile(r.result, file.name), Z = parseZmx(F.text, file.name, F.agf);
        resolve({ Z, el: zmxPart(Z, file.name, mode) });
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error('Could not read ' + file.name));
    r.readAsArrayBuffer(file);
  });
}
// onto the bench (the first file), or, from My parts, each file into My parts
export let zmxToMine = false;
export function setZmxToMine(v) { return (zmxToMine = v); }
/* A lens file of several lenses (air between them) or with a stop of its own, made into the parts it
   is, on one axis, as an assembly with the file's design conditions; null for a single lens. el: the
   lens the file reads as (all its surfaces, air gaps as AIR), Z: the parsed file. */
export function zmxAssembly(Z, el) {
  if (el.type !== 'lens') return null;
  const segs = [];
  let a = 0;
  el.materials.forEach((m, i) => { if (m.glass === 'AIR') { segs.push([a, i]); a = i + 1; } });
  segs.push([a, el.surfaces.length - 1]);
  const S = Z.stopAt;
  if (segs.length === 1 && !(S && (S.before !== undefined || S.after !== undefined))) return null;
  const T = el.gaps.reduce((p, q) => p + q, 0), zs = [0];
  el.gaps.forEach((g, i) => zs.push(zs[i] + g));
  const g = 'g' + uid().slice(1), els = [], semiOf = s => s.semi || el.diameter / 2;
  let k = 0;
  const stop = (zc, semi) => els.push(normElement({ type: 'stop', id: uid(), name: el.name + ' stop', x: el.x + zc, y: el.y, angle: 0, aperture: 2 * (semi || el.diameter / 2), outer: Math.max(25.4, 2.4 * (semi || el.diameter / 2)), group: g }));
  if (S && S.before !== undefined) stop(-T / 2 - S.before, S.semi);
  for (const [i0, i1] of segs) {
    const zc = (zs[i0] + zs[i1]) / 2 - T / 2;
    if (i0 === i1) {                                   // a surface with air either side: the stop, or a dummy
      if (S && S.at === i0) stop(zc, S.semi || semiOf(el.surfaces[i0]));
      continue;
    }
    const surfaces = el.surfaces.slice(i0, i1 + 1).map(s => Object.assign({}, s)), dia = 2 * Math.max(...surfaces.map(semiOf));
    surfaces.forEach(s => { if (s.semi && Math.abs(2 * s.semi - dia) < 1e-6) s.semi = null; });
    els.push(normElement({ type: 'lens', id: uid(), name: el.name + ' L' + (++k), x: el.x + zc, y: el.y, angle: 0, diameter: dia,
      surfaces, gaps: el.gaps.slice(i0, i1), materials: el.materials.slice(i0, i1), group: g, ...(el.design ? { design: el.design } : {}) }));
  }
  if (S && S.after !== undefined) stop(T / 2 + S.after, S.semi);
  const lenses = els.filter(e => e.type === 'lens');
  if (!lenses.length) return null;
  const c = Z.cond || {};
  const cond = normCond({ ...(c.object ? { object: c.object } : {}), aperture: c.aperture || { kind: 'epd', v: Math.min(...els.map(e => e.type === 'stop' ? e.aperture : e.diameter)) },
    fields: c.fields || undefined, waves: c.waves || undefined, primary: c.primary });
  return { els, asm: { id: g, name: el.name, ref: lenses[0].id, rev: false, cond } };
}
export async function importZmx(files) {
  const errBox = document.getElementById('zmxError');
  const dlg = document.getElementById('zmxDialog');
  const mode = dlg.open ? document.getElementById('zmxAs').value : 'auto';
  files = files instanceof File ? [files] : [...files];
  // the dialog's tick: the file opened in the lens design workspace, as an assembly to design
  const asDesign = dlg.open && !zmxToMine && document.getElementById('zmxDesign').checked;
  if (zmxToMine) { await zmxIntoMine(files, mode); return; }
  try {
    const { Z, el } = await zmxElement(files[0], mode);
    checkpoint();
    const A = zmxAssembly(Z, el);
    if (A) {
      for (const e of A.els) { e.bench = project.tab; if (el.assumed) e.assumed = el.assumed; project.elements.push(e); }
      project.assemblies = (project.assemblies || []).concat([Object.assign(A.asm, { bench: project.tab })]);
      setSelection(A.els);
      changed(true);
      if (dlg.open) dlg.close();
      const w = [...Z.warnings];
      if (asDesign) openLensDesign(A.asm);
      toast('Imported ' + A.asm.name + ' as an assembly of ' + A.els.length + ' parts' + (w.length ? '. Note: ' + w.join('; ') + '.' : ''), w.length > 0);
      return;
    }
    el.bench = project.tab;
    project.elements.push(el);
    selectOne(el.id);
    changed(true);
    if (dlg.open) dlg.close();
    const w = [...Z.warnings];
    // asked for as a design, a single lens or mirror is made an assembly of its own and opened
    if (asDesign && ['lens', 'mirror', 'window'].includes(el.type)) designOne(el);
    toast('Imported ' + el.name + ' (' + typeLabel(el).toLowerCase() + ')' + (w.length ? '. Note: ' + w.join('; ') + '.' : ''), w.length > 0);
  } catch (err) {
    if (dlg.open) { errBox.textContent = err.message; errBox.hidden = false; }
    else toast(err.message, true);
  }
}
// each file kept in My parts, named as the file names it (its part number), with its picture
async function zmxIntoMine(files, mode) {
  const errBox = document.getElementById('zmxError'), dlg = document.getElementById('zmxDialog');
  const done = [], bad = [];
  errBox.hidden = true;
  for (const f of files) {
    try {
      const { Z, el } = await zmxElement(f, mode);
      el.x = 0; el.y = 0; el.bench = project.tab;
      const p = await api('/v1/workspaces/' + personalWs().id + '/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: el.name, summary: typeLabel(el), palette: 'free', content: JSON.stringify(clipOf([el])), icon: clipIcon([el]) || clipIcon([el], 40) }) });
      if (MINE.list) MINE.list.push(p);
      done.push(p.name + (Z.warnings.length ? ' (' + Z.warnings.join('; ') + ')' : ''));
    } catch (err) {
      if (err.status === 402) { dlg.close(); showSubscribe(); return; }
      bad.push(f.name + ': ' + err.message);
    }
  }
  mineChanged();
  if (bad.length) { errBox.textContent = (done.length ? 'Kept ' + done.length + '. ' : '') + 'Not kept: ' + bad.join('; '); errBox.hidden = false; return; }
  dlg.close();
  toast(done.length === 1 ? 'Kept ' + done[0] + ' in My parts' : 'Kept ' + done.length + ' parts in My parts');
}

