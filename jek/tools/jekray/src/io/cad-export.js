import { getEl } from '../state/elements.js';
import { designPrescription } from '../engines/lens-design.js';
import { lensSystem } from '../engines/lens-engine.js';
import { downloadFile, safeFileName, toast } from '../ui/actions.js';
import { sagR2 } from '../core/sag.js';

/* ==========================================================================
   CAD export: a design's parts as solids, placed as the design has them
   Each lens (each glass between two faces, so a cemented lens gives one solid a glass), each window, each mirror
   (a disk, its back flat) and each stop (a washer) is a solid of revolution about its own axis, in the design's own
   frame: the first vertex at the origin, the light along +z, folds, tilts and decentres as the design has them. A lens
   face runs out to the part's diameter; where its sag cannot reach that far it stops at its clear radius and a flat
   shoulder runs on to the edge. In STEP (ISO 10303-21, the automotive design protocol, AP214) each solid is a boundary
   representation: a sphere as a sphere, a flat as a plane, a conic or asphere as its profile (a cubic B-spline through
   the sag, its tangents the sag's slope, 32 spans) turned about the axis, the edge a cylinder; in millimetres. In STL
   each is the same solid in triangles.
   ========================================================================== */

/* a face's sag (mm, along its axis) at radius r, and its slope, as the lens engine has it */
function cadSagOf(s) {
  const c = s.R === null || s.R === undefined || !isFinite(s.R) || !s.R ? 0 : 1 / s.R, k = s.k || 0, a2 = s.a2 || 0, A = s.A || [], odd = s.odd || null;
  const f = r => sagR2(c, k, a2, A, odd, r * r, false);
  const df = r => { const h = 1e-6 * Math.max(1, r); return (f(r + h) - f(Math.max(0, r - h))) / (r + h - Math.max(0, r - h)); };
  const plain = !A.some(v => v) && !a2 && !(odd && odd.some(v => v));
  return { f, df, c, k, flat: !c && plain, sphere: c && !k && plain, R: c ? 1 / c : null };
}
/* the largest radius up to want at which the sag is defined */
function cadReach(sg, want) {
  if (isFinite(sg.f(want))) return want;
  let lo = 0, hi = want;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (isFinite(sg.f(m))) lo = m; else hi = m; }
  return lo * 0.999;
}
const cadFrameOf = (S, i) => {
  const F = S.fr ? S.fr[i] : null;
  if (!F) return { o: [0, 0, S.z[i]], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  // the axes right-handed (after a mirror the engine's are reflected): y = z × x
  const R = F.R, X = [R[0], R[3], R[6]], Z = [R[2], R[5], R[8]];
  return { o: F.o, X, Y: [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]], Z };
};

/* the solids of an assembly: each { name, kind, frame, profile } with profile a closed run of segments in its meridian
   half-plane ([r, z] about the frame), each segment a face: { face: 'cap' (a lens face from the axis), 'ann' (a flat ring),
   'cyl' (an edge), sg (the cap's sag), r0, r1 (cap and ring), z0, z1 (cylinder), z (ring), out (its outward side: -1 or +1
   along z for caps and rings; +1 or -1 radially for cylinders) } */
export function cadSolids(asm) {
  const P = designPrescription(asm), nm = asm.cond && asm.cond.waves ? asm.cond.waves[asm.cond.primary].nm : 587.56;
  const S = lensSystem(P, nm, { image: P.image }), out = [], warn = new Set();
  let i = 0;
  for (const part of P.parts) {
    const e = getEl(part.id), first = i;
    i += part.n;
    if (!e) continue;
    const name = e.name || part.kind;
    const surfs = P.surfaces.slice(first, first + part.n);
    if (surfs.some(s => s.cyl || (s.F && s.F.length))) { warn.add((e.name || 'A part') + ' is not round (a cylinder or a freeform face): left out'); continue; }
    if (part.kind === 'stop') {
      const ri = (e.aperture || 10) / 2, ro = Math.max(ri * 1.2, (e.outer || 25.4) / 2), t = 1;
      out.push({ name, kind: 'stop', frame: cadFrameOf(S, first), washer: { ri, ro, z0: -t / 2, z1: t / 2 } });
      continue;
    }
    if (part.kind === 'mirror') {
      const s = surfs[0], sg = cadSagOf(s), R = (e.length || e.diameter || 25.4) / 2, rs = cadReach(sg, R), t = Math.max(2, R / 4);
      const ze = sg.f(rs), zb = Math.max(0, ze) + t;
      const prof = [{ face: 'cap', sg, r0: 0, r1: rs, out: -1, s }];
      if (rs < R - 1e-9) prof.push({ face: 'ann', z: ze, r0: rs, r1: R, out: -1 });
      prof.push({ face: 'cyl', r: R, z0: ze, z1: zb, out: 1 }, { face: 'flat', z: zb, r1: R, out: 1 });
      out.push({ name, kind: 'mirror', frame: cadFrameOf(S, first), profile: prof });
      continue;
    }
    // a lens or a window: a solid for each glass between two of its faces
    const R = (part.kind === 'lens' ? e.diameter : e.size || e.diameter || 25.4) / 2;
    for (let k = 0; k + 1 < surfs.length; k++) {
      const m = P.materials[first + k];
      if (!m || m.glass === 'AIR') continue;
      const F0 = cadFrameOf(S, first + k), F1 = cadFrameOf(S, first + k + 1);
      const a = cadSagOf(surfs[k]), b = cadSagOf(surfs[k + 1]);
      // the back face's vertex along the front face's axis (the faces of a part share it)
      const d = [F1.o[0] - F0.o[0], F1.o[1] - F0.o[1], F1.o[2] - F0.o[2]], tz = d[0] * F0.Z[0] + d[1] * F0.Z[1] + d[2] * F0.Z[2];
      const ra = cadReach(a, R), rb = cadReach(b, R), za = a.f(ra), zb = tz + b.f(rb);
      if (zb <= za + 1e-6 && Math.abs(ra - R) < 1e-9 && Math.abs(rb - R) < 1e-9) warn.add(name + ' has no edge left at its diameter (its faces meet): written as it is');
      const prof = [{ face: 'cap', sg: a, r0: 0, r1: ra, out: -1, s: surfs[k], dz: 0 }];
      if (ra < R - 1e-9) prof.push({ face: 'ann', z: za, r0: ra, r1: R, out: -1 });
      prof.push({ face: 'cyl', r: R, z0: za, z1: zb, out: 1 });
      if (rb < R - 1e-9) prof.push({ face: 'ann', z: zb, r0: rb, r1: R, out: 1 });
      prof.push({ face: 'cap', sg: b, r0: 0, r1: rb, out: 1, s: surfs[k + 1], dz: tz });
      out.push({ name: surfs.length > 2 ? name + ' ' + (k + 1) : name, kind: part.kind, frame: F0, profile: prof });
    }
  }
  return { solids: out, warnings: warn, name: asm.name };
}

/* ---------- STL ---------- */
/* the meridian profile of a solid as a closed polygon of [r, z], from the axis round and back (or a ring for a washer) */
function cadPolygonOf(sol, n) {
  if (sol.washer) { const w = sol.washer; return [[w.ri, w.z0], [w.ro, w.z0], [w.ro, w.z1], [w.ri, w.z1]]; }
  const pts = [], seg = sol.profile;
  for (const s of seg) {
    if (s.face === 'cap' && s.out < 0) for (let j = 0; j <= n; j++) { const r = s.r1 * j / n; pts.push([r, s.sg.f(r) + (s.dz || 0)]); }
    else if (s.face === 'ann') pts.push(s.out < 0 ? [s.r1, s.z] : [s.r0, s.z]);
    else if (s.face === 'cap' && s.out > 0) for (let j = n; j >= 0; j--) { const r = s.r1 * j / n; pts.push([r, s.sg.f(r) + (s.dz || 0)]); }
    else if (s.face === 'flat') pts.push([s.r1, s.z], [0, s.z]);
    else if (s.face === 'cyl') pts.push([s.r, s.z0], [s.r, s.z1]);
  }
  // the cylinder joins what comes before it to what comes after it; drop repeats
  return pts.filter((p, j) => !j || Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1]) > 1e-12);
}
/* each solid turned about its axis: triangles, outward, in the design's frame */
export function cadTriangles(sol, n, m) {
  n = n || 48; m = m || 96;
  const poly = cadPolygonOf(sol, n), F = sol.frame, T = [];
  const at = (r, z, th) => { const c = Math.cos(th), s = Math.sin(th); return [0, 1, 2].map(q => F.o[q] + r * (c * F.X[q] + s * F.Y[q]) + z * F.Z[q]); };
  const L = poly.length, closed = !!sol.washer;
  for (let j = 0; j < (closed ? L : L - 1); j++) {
    const [ra, za] = poly[j], [rb, zb] = poly[(j + 1) % L];
    for (let q = 0; q < m; q++) {
      const t0 = 2 * Math.PI * q / m, t1 = q + 1 === m ? 0 : 2 * Math.PI * (q + 1) / m;      // the seam's points the same both sides
      const A0 = at(ra, za, t0), A1 = at(ra, za, t1), B0 = at(rb, zb, t0), B1 = at(rb, zb, t1);
      // the profile runs so that the solid lies to its left in the (r, z) plane: these turn outward
      if (ra > 1e-12) T.push([A0, A1, B1]);
      if (rb > 1e-12) T.push([A0, B1, B0]);
    }
  }
  return T;
}
export function cadSTL(asm) {
  const C = cadSolids(asm), lines = ['solid ' + (C.name || 'design').replace(/\s+/g, '_')];
  for (const sol of C.solids) for (const t of cadTriangles(sol)) {
    const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...nrm) || 1;
    lines.push(' facet normal ' + nrm.map(x => (x / l).toExponential(6)).join(' '), '  outer loop', ...t.map(p => '   vertex ' + p.map(x => x.toExponential(9)).join(' ')), '  endloop', ' endfacet');
  }
  lines.push('endsolid ' + (C.name || 'design').replace(/\s+/g, '_'));
  return { text: lines.join('\n') + '\n', warnings: C.warnings, solids: C.solids.length };
}

/* ---------- STEP ---------- */
const cadNum = v => { const x = Math.abs(v) < 1e-14 ? 0 : v; let t = x.toPrecision(15); if (!/[.eE]/.test(t)) t += '.'; return t.replace(/e/, 'E').replace(/^(-?\d+)E/, '$1.E'); };
const cadStr = t => "'" + String(t).replace(/[^\x20-\x7e]/g, '_').replace(/'/g, "''") + "'";
export function cadSTEP(asm, opts) {
  const C = cadSolids(asm), E = [];
  const add = s => { E.push(s); return '#' + E.length; };
  const pt = p => add('CARTESIAN_POINT(\'\',(' + p.map(cadNum).join(',') + '))');
  const dir = d => add('DIRECTION(\'\',(' + d.map(cadNum).join(',') + '))');
  const ax2 = (o, z, x) => add('AXIS2_PLACEMENT_3D(\'\',' + pt(o) + ',' + dir(z) + ',' + dir(x) + ')');
  const solids = [];
  for (const sol of C.solids) {
    const F = sol.frame, P3 = (r, z, th) => { const c = Math.cos(th || 0), s = Math.sin(th || 0); return [0, 1, 2].map(q => F.o[q] + r * (c * F.X[q] + s * F.Y[q]) + z * F.Z[q]); };
    const AX = z => [0, 1, 2].map(q => F.o[q] + z * F.Z[q]);
    // a circle about the axis at height z, radius r: its edge (counterclockwise seen from +z), on one vertex
    const circles = new Map();
    const circle = (r, z) => {
      const key = r.toFixed(12) + '|' + z.toFixed(12);
      if (circles.has(key)) return circles.get(key);
      const v = add('VERTEX_POINT(\'\',' + pt(P3(r, z)) + ')'), cu = add('CIRCLE(\'\',' + ax2(AX(z), F.Z, F.X) + ',' + cadNum(r) + ')');
      const ed = add('EDGE_CURVE(\'\',' + v + ',' + v + ',' + cu + ',.T.)');
      circles.set(key, ed);
      return ed;
    };
    const loop = (edges, outer) => add((outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND') + '(\'\',' + add('EDGE_LOOP(\'\',(' + edges.map(([e, s]) => add('ORIENTED_EDGE(\'\',*,*,' + e + ',' + (s ? '.T.' : '.F.') + ')')).join(',') + '))') + ',.T.)');
    const face = (bounds, surf, sense) => add('ADVANCED_FACE(\'\',(' + bounds.join(',') + '),' + surf + ',' + (sense ? '.T.' : '.F.') + ')');
    const plane = z => add('PLANE(\'\',' + ax2(AX(z), F.Z, F.X) + ')');
    const cyl = r => add('CYLINDRICAL_SURFACE(\'\',' + ax2(AX(0), F.Z, F.X) + ',' + cadNum(r) + ')');
    // a lens face as a surface: a plane, a sphere, or its profile turned about the axis (normal towards -z there)
    const capSurf = (s, dz) => {
      if (s.sg.flat) return { surf: plane(dz), normal: 1 };
      if (s.sg.sphere) return { surf: add('SPHERICAL_SURFACE(\'\',' + ax2(AX(dz + s.sg.R), F.Z, F.X) + ',' + cadNum(Math.abs(s.sg.R)) + ')'), normal: s.sg.R > 0 ? -1 : 1 };
      const n = 32, h = s.r1 / n, ctrl = [];
      const Pp = r => P3(r, s.sg.f(r) + dz), Dp = r => { const g = s.sg.df(r); return [0, 1, 2].map(q => F.X[q] + g * F.Z[q]); };
      for (let j = 0; j < n; j++) {
        const r0 = j * h, r1 = (j + 1) * h, p0 = Pp(r0), p1 = Pp(r1), d0 = Dp(r0), d1 = Dp(r1);
        if (!j) ctrl.push(p0);
        ctrl.push(p0.map((v, q) => v + h / 3 * d0[q]), p1.map((v, q) => v - h / 3 * d1[q]), p1);
      }
      const knots = Array.from({ length: n + 1 }, (_, j) => cadNum(j)), mult = Array.from({ length: n + 1 }, (_, j) => (j === 0 || j === n ? 4 : 3));
      const curve = add('B_SPLINE_CURVE_WITH_KNOTS(\'\',3,(' + ctrl.map(pt).join(',') + '),.UNSPECIFIED.,.F.,.F.,(' + mult.join(',') + '),(' + knots.join(',') + '),.UNSPECIFIED.)');
      return { surf: add('SURFACE_OF_REVOLUTION(\'\',' + curve + ',' + add('AXIS1_PLACEMENT(\'\',' + pt(AX(0)) + ',' + dir(F.Z) + ')') + ')'), normal: -1, curve };
    };
    const faces = [];
    if (sol.washer) {
      const w = sol.washer, ci0 = circle(w.ri, w.z0), co0 = circle(w.ro, w.z0), ci1 = circle(w.ri, w.z1), co1 = circle(w.ro, w.z1);
      faces.push(face([loop([[co0, false]], true), loop([[ci0, true]])], plane(w.z0), false));
      faces.push(face([loop([[co1, true]], true), loop([[ci1, false]])], plane(w.z1), true));
      faces.push(face([loop([[co0, true]], true), loop([[co1, false]])], cyl(w.ro), true));
      faces.push(face([loop([[ci0, false]], true), loop([[ci1, true]])], cyl(w.ri), false));
    } else {
      for (const s of sol.profile) {
        if (s.face === 'cap') {
          const z = s.sg.f(s.r1) + (s.dz || 0), e = circle(s.r1, z), cs = capSurf(s, s.dz || 0);
          // the boundary counterclockwise seen from outside: from -z (out -1) reversed, from +z as it is; a profile turned
          // about the axis closes on a seam, its profile from the pole on the axis to the edge, met both ways
          if (cs.curve) {
            const vEdge = E[e.slice(1) - 1].match(/EDGE_CURVE\('',(#\d+)/)[1], vPole = add('VERTEX_POINT(\'\',' + pt(AX(s.sg.f(0) + (s.dz || 0))) + ')');
            const seam = add('EDGE_CURVE(\'\',' + vPole + ',' + vEdge + ',' + cs.curve + ',.T.)');
            faces.push(face([loop(s.out > 0 ? [[e, true], [seam, false], [seam, true]] : [[e, false], [seam, false], [seam, true]], true)], cs.surf, cs.normal === s.out));
          } else faces.push(face([loop([[e, s.out > 0]], true)], cs.surf, cs.normal === s.out));
        } else if (s.face === 'ann') {
          const ei = circle(s.r0, s.z), eo = circle(s.r1, s.z);
          faces.push(face([loop([[eo, s.out > 0]], true), loop([[ei, s.out < 0]])], plane(s.z), s.out > 0));
        } else if (s.face === 'flat') {
          const e = circle(s.r1, s.z);
          faces.push(face([loop([[e, s.out > 0]], true)], plane(s.z), s.out > 0));
        } else if (s.face === 'cyl') {
          const e0 = circle(s.r, s.z0), e1 = circle(s.r, s.z1);
          faces.push(face([loop([[e0, true]], true), loop([[e1, false]])], cyl(s.r), true));
        }
      }
    }
    solids.push(add('MANIFOLD_SOLID_BREP(' + cadStr(sol.name) + ',' + add('CLOSED_SHELL(\'\',(' + faces.join(',') + '))') + ')'));
  }
  // the product, its units and its shape
  const head = [];
  const H = s => { head.push(s); return '#' + (E.length + head.length); };
  const appc = H("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  H("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000," + appc + ')');
  const pc = H("PRODUCT_CONTEXT(''," + appc + ",'mechanical')");
  const prod = H('PRODUCT(' + cadStr(C.name || 'design') + ',' + cadStr(C.name || 'design') + ",''," + '(' + pc + '))');
  const pdf = H("PRODUCT_DEFINITION_FORMATION(''," + "''," + prod + ')');
  const pdc = H("PRODUCT_DEFINITION_CONTEXT('part definition'," + appc + ",'design')");
  const pd = H("PRODUCT_DEFINITION('design',''," + pdf + ',' + pdc + ')');
  const pds = H("PRODUCT_DEFINITION_SHAPE(''," + "''," + pd + ')');
  const mm = H('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const rad = H('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const sr = H('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const unc = H('UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),' + mm + ",'distance_accuracy_value','confusion accuracy')");
  const ctx = H('( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((' + unc + ')) GLOBAL_UNIT_ASSIGNED_CONTEXT((' + mm + ',' + rad + ',' + sr + ')) REPRESENTATION_CONTEXT(\'\',\'\') )');
  const origin = '#' + (E.length + head.length + 1);
  head.push("AXIS2_PLACEMENT_3D(''," + '#' + (E.length + head.length + 2) + ',#' + (E.length + head.length + 3) + ',#' + (E.length + head.length + 4) + ')');
  head.push("CARTESIAN_POINT('',(0.,0.,0.))", "DIRECTION('',(0.,0.,1.))", "DIRECTION('',(1.,0.,0.))");
  const rep = '#' + (E.length + head.length + 1);
  head.push('ADVANCED_BREP_SHAPE_REPRESENTATION(' + cadStr(C.name || 'design') + ',(' + solids.concat([origin]).join(',') + '),' + ctx + ')');
  head.push('SHAPE_DEFINITION_REPRESENTATION(' + pds + ',' + rep + ')');
  const all = E.concat(head).map((s, j) => '#' + (j + 1) + '=' + s + ';');
  const stamp = (opts && opts.date) || new Date().toISOString().slice(0, 19);
  const text = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('" + 'JEKray design, ' + C.solids.length + " solids'),'2;1');",
    'FILE_NAME(' + cadStr(C.name || 'design') + ",'" + stamp + "',(''),(''),'JEKray','JEKray','');", "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;', ...all, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n') + '\n';
  return { text, warnings: C.warnings, solids: C.solids.length };
}

/* the download: STEP or STL of an assembly */
export function exportCad(asm, kind) {
  try {
    const out = kind === 'stl' ? cadSTL(asm) : cadSTEP(asm), fname = safeFileName(asm.name || 'design') + (kind === 'stl' ? '.stl' : '.step');
    if (!out.solids) { toast('There is nothing round to export in ' + asm.name + '.', true); return null; }
    downloadFile(fname, new Blob([out.text], { type: kind === 'stl' ? 'model/stl' : 'model/step' }));
    const w = [...out.warnings];
    toast('Exported ' + fname + ', ' + out.solids + ' solid' + (out.solids === 1 ? '' : 's') + (w.length ? '. Note: ' + w.join('; ') + '.' : ''), w.length > 0);
    return out;
  } catch (err) { toast(err.message, true); return null; }
}
