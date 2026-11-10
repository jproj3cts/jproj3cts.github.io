import { STD_PLANES, TOOL_FEATURES, appliedCount, fieldValue, normDoc, partLook, prepareDoc } from '../core/doc.js';
import { WELD, arcSweep, carryPt, curvePts, distToEnt, entCross, regionAt, regionsOf, weldEnts } from '../core/sketch-tools.js';
import { entKeys, hpt, inside, solveSketch } from '../core/sketch.js';

/* ==========================================================================
   The kernel: the feature list regenerated with OpenCascade (the vendored replicad-opencascadejs build), in the
   kernel worker on the page and as it is in the Node tests. makeKernel(oc) closes over the library; its regen(doc)
   runs every applied feature in order on the state the ones before it left (the parts, the sketches' planes, each
   tool feature's tool body), each in its own try, so a feature that fails is shown in red with its reason and the
   ones after it still regenerate where they can. The states are kept by the feature list up to each one, so an
   edit lower down regenerates only from there.

   Naming, so a feature's choices survive the model changing: every face carries names, given by the feature that
   made it (an extrude's side faces after the sketch shape they came from, its caps start and end; a fillet's after
   the feature) and carried through every later operation by OCCT's history (Modified, IsDeleted, Generated). A
   face is chosen by its names and a point on it (the point picks among several of the same name); an edge by the
   names of its two faces and its midpoint. When no face of the name is left, the nearest face to the point within a
   small distance stands in.
   ========================================================================== */
const HMAX = 2147483647, DEGR = Math.PI / 180;
export const v3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]), unit: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };

/* a plane's frame from its normal: y as near world z as it can be (x across), or x along world x for a level plane */
export function frameOfNormal(o, n) {
  n = v3.unit(n);
  let x, y;
  if (Math.abs(n[2]) < 0.99) { y = v3.unit(v3.sub([0, 0, 1], v3.mul(n, n[2]))); x = v3.cross(y, n); }
  else { x = [1, 0, 0]; y = v3.cross(n, x); }
  const o2 = v3.mul(n, v3.dot(o, n));        // the world origin, onto the plane
  return { o: o2, x, y, n };
}
export const toWorld = (F, p) => [F.o[0] + F.x[0] * p[0] + F.y[0] * p[1], F.o[1] + F.x[1] * p[0] + F.y[1] * p[1], F.o[2] + F.x[2] * p[0] + F.y[2] * p[1]];
export const toPlane = (F, q) => { const d = v3.sub(q, F.o); return [v3.dot(d, F.x), v3.dot(d, F.y)]; };

export function makeKernel(oc) {
  const TA = oc.TopAbs_ShapeEnum;
  let tmp = [];
  const T = o => { tmp.push(o); return o; };
  const flush = () => { for (const o of tmp) { try { o.delete(); } catch (err) { /* already gone */ } } tmp = []; };
  const pnt = p => T(new oc.gp_Pnt(p[0], p[1], p[2])), gdir = v => T(new oc.gp_Dir(v[0], v[1], v[2])), gvec = v => T(new oc.gp_Vec(v[0], v[1], v[2]));
  const prog = () => T(new oc.Message_ProgressRange());
  const xyz = p => [p.X(), p.Y(), p.Z()];
  const errText = e => {
    if (e instanceof Error) return e.message;
    try { const m = oc.getExceptionMessage(e); return (Array.isArray(m) ? m.filter(Boolean).join(': ') : String(m)) || 'the kernel could not do it'; } catch (err) { return 'the kernel could not do it'; }
  };
  const listOf = L => { const out = []; while (L.Size() > 0) { out.push(L.First()); L.RemoveFirst(); } L.delete(); return out; };
  const listFrom = arr => { const L = T(new oc.NCollection_List_TopoDS_Shape()); for (const s of arr) L.Append(s); return L; };
  const hash = s => oc.ReplicadShapeHasher.HashCode(s, HMAX);
  const CAST = { [TA.TopAbs_FACE]: 'Face', [TA.TopAbs_EDGE]: 'Edge', [TA.TopAbs_VERTEX]: 'Vertex', [TA.TopAbs_SOLID]: 'Solid', [TA.TopAbs_WIRE]: 'Wire', [TA.TopAbs_SHELL]: 'Shell' };
  /* a shape's faces (edges, solids…), each once, in the explorer's order */
  function subShapes(shape, type) {
    const out = [], seen = new Map(), ex = new oc.TopExp_Explorer(shape, type, TA.TopAbs_SHAPE);
    for (; ex.More(); ex.Next()) {
      const c = ex.Current(), h = hash(c), L = seen.get(h);
      if (L && L.some(o => o.IsSame(c))) { c.delete(); continue; }
      const s = CAST[type] ? oc.TopoDS[CAST[type]](c) : c;
      if (s !== c) c.delete();
      if (L) L.push(s); else seen.set(h, [s]);
      out.push(s);
    }
    ex.delete();
    return out;
  }
  /* the index of a shape in a list of them (by hash, then IsSame) */
  function indexer(list) {
    const m = new Map();
    list.forEach((s, i) => { const h = hash(s); if (!m.has(h)) m.set(h, []); m.get(h).push(i); });
    return s => { const L = m.get(hash(s)); if (!L) return -1; for (const i of L) if (list[i].IsSame(s)) return i; return -1; };
  }
  const props = (s, kind) => { const g = T(new oc.GProp_GProps()); if (kind === 'v') oc.BRepGProp.VolumeProperties(s, g, false, false, false); else if (kind === 'a') oc.BRepGProp.SurfaceProperties(s, g, false, false); else oc.BRepGProp.LinearProperties(s, g, false, false); return { m: g.Mass(), c: xyz(T(g.CentreOfMass())) }; };
  const bbox = s => { const b = T(new oc.Bnd_Box()); oc.BRepBndLib.Add(s, b, false); if (b.IsVoid()) return null; return [xyz(T(b.CornerMin())), xyz(T(b.CornerMax()))]; };
  const distance = (a, b) => { const d = T(new oc.BRepExtrema_DistShapeShape(a, b)); if (!d.IsDone()) return { d: Infinity }; return { d: d.Value(), p: xyz(T(d.PointOnShape1(1))), q: xyz(T(d.PointOnShape2(1))) }; };
  const vertexAt = p => T(new oc.BRepBuilderAPI_MakeVertex(pnt(p))).Vertex();
  const compound = shapes => { const c = new oc.TopoDS_Compound(), b = T(new oc.TopoDS_Builder()); b.MakeCompound(c); for (const s of shapes) b.Add(c, s); return c; };
  const solidsOf = s => subShapes(s, TA.TopAbs_SOLID);

  /* ---------- bodies: a shape with its faces and their names ---------- */
  function mkBody(id, shape, faces, names) { return { id, shape, faces, names, ix: indexer(faces) }; }
  /* faces that have no name of their own are numbered by where they are (their middles in x, y, z order, then
     their areas), not by the order the kernel lists them in, which is not the same from one visit to the next:
     the place in that order of each of the faces asked about */
  function stableRank(faces, which) {
    const key = which.map(i => { const p = props(faces[i], 'a'); return [i, ...p.c.map(v => Math.round(v * 1e5) / 1e5), Math.round(p.m * 1e5) / 1e5]; });
    key.sort((p, q) => { for (let k = 1; k < 5; k++) if (p[k] !== q[k]) return p[k] - q[k]; return p[0] - q[0]; });
    const rank = new Map(); key.forEach((k, r) => rank.set(k[0], r));
    return rank;
  }
  function fresh(id, shape, nameOf) {
    const faces = subShapes(shape, TA.TopAbs_FACE), rank = nameOf.length >= 2 ? stableRank(faces, faces.map((f, i) => i)) : null;
    return mkBody(id, shape, faces, faces.map((f, i) => [].concat(nameOf(f, rank ? rank.get(i) : i) || [])));
  }
  /* the names carried through an operation op from the bodies that went into it to its result: Modified faces take
     the names of what they came from, faces untouched keep theirs, generated faces are named as given, the rest
     after the feature and their place */
  function carried(op, inputs, shape, fid, generated) {
    const faces = subShapes(shape, TA.TopAbs_FACE), ix = indexer(faces), names = faces.map(() => []);
    const give = (f, ns) => { const i = ix(f); if (i >= 0) for (const n of ns) if (!names[i].includes(n)) names[i].push(n); };
    for (const b of inputs) b.faces.forEach((f, i) => {
      let mods = [];
      try { mods = listOf(op.Modified(f)); } catch (err) { mods = []; }
      if (mods.length) { for (const m of mods) { give(m, b.names[i]); m.delete(); } return; }
      let gone = false;
      try { gone = op.IsDeleted(f); } catch (err) { gone = false; }
      if (!gone) give(f, b.names[i]);
    });
    for (const [src, nm] of generated || []) {
      let g = [];
      try { g = listOf(op.Generated(src)); } catch (err) { g = []; }
      g.forEach((s, k) => { give(s, [nm + (g.length > 1 ? '.' + k : '')]); s.delete(); });
    }
    { const bare = faces.map((f, i) => i).filter(i => !names[i].length), rank = bare.length ? stableRank(faces, bare) : null; for (const i of bare) names[i].push(fid + '.m' + rank.get(i)); }
    return { faces, names };
  }
  /* a body split into its solids, each a body of its own (names kept face by face) */
  function splitBody(b, idOf) {
    return solidsOf(b.shape).map((s, k) => { const faces = subShapes(s, TA.TopAbs_FACE); return mkBody(idOf(k), s, faces, faces.map(f => { const i = b.ix(f); return i >= 0 ? b.names[i].slice() : []; })); });
  }
  /* edges of a body and the faces each lies on (made once a body is asked) */
  function edgesOf(b) {
    if (b.edges) return b.edges;
    b.edges = subShapes(b.shape, TA.TopAbs_EDGE);
    const eix = indexer(b.edges);
    b.edgeFaces = b.edges.map(() => []);
    b.faces.forEach((f, i) => { for (const e of subShapes(f, TA.TopAbs_EDGE)) { const j = eix(e); if (j >= 0 && !b.edgeFaces[j].includes(i)) b.edgeFaces[j].push(i); e.delete(); } });
    return b.edges;
  }
  const centreOf = (b, i) => { b.cent = b.cent || []; if (!b.cent[i]) { const p = props(b.faces[i], 'a'); b.cent[i] = p.c; } return b.cent[i]; };
  function edgeMid(e) { const c = T(new oc.BRepAdaptor_Curve(e)); return xyz(T(c.Value((c.FirstParameter() + c.LastParameter()) / 2))); }
  const midOf = (b, j) => { b.mids = b.mids || []; if (!b.mids[j]) b.mids[j] = edgeMid(edgesOf(b)[j]); return b.mids[j]; };
  /* ---------- picks to refs, and refs back to faces and edges ---------- */
  function refOf(S, pick) {
    const b = S.parts.find(p => p.id === pick.part);
    if (!b) throw new Error('that part is not there');
    if (pick.kind === 'part') return { kind: 'part', part: b.id };
    if (pick.kind === 'face') { const i = pick.index; if (!b.faces[i]) throw new Error('no such face'); return { kind: 'face', part: b.id, names: b.names[i].slice(0, 4), pt: centreOf(b, i).map(r6), type: surfType(b.faces[i]) }; }
    if (pick.kind === 'edge') {
      const j = pick.index; edgesOf(b);
      if (!b.edges[j]) throw new Error('no such edge');
      const fs = b.edgeFaces[j];
      return { kind: 'edge', part: b.id, faces: fs.map(i => b.names[i][0]), pt: midOf(b, j).map(r6), type: curveType(b.edges[j]) };
    }
    if (pick.kind === 'vertex') { const vs = vertsOf(b); return { kind: 'vertex', part: b.id, faces: vertFaces(b)[pick.index].map(i => b.names[i][0]).slice(0, 6), pt: xyz(T(oc.BRep_Tool.Pnt(vs[pick.index]))).map(r6) }; }
    throw new Error('not a pick');
  }
  const r6 = v => +v.toFixed(6);
  const near = (a, b) => v3.len(v3.sub(a, b));
  function bodyFor(S, ref) { return S.parts.find(p => p.id === ref.part) || null; }
  function findFace(S, ref) {
    const cands = [];
    for (const b of [bodyFor(S, ref), ...S.parts].filter(Boolean)) {
      b.faces.forEach((f, i) => { if (b.names[i].some(n => ref.names.includes(n))) cands.push([b, i]); });
      if (cands.length) break;
    }
    if (cands.length === 1) return { b: cands[0][0], i: cands[0][1] };
    if (cands.length) { let best = null, bd = Infinity; for (const [b, i] of cands) { const d = distance(vertexAt(ref.pt), b.faces[i]).d + 1e-9 * near(centreOf(b, i), ref.pt); if (d < bd) { bd = d; best = { b, i }; } } return best; }
    // the name gone: the nearest face to the point, if it is on it
    let best = null, bd = Infinity;
    for (const b of S.parts) b.faces.forEach((f, i) => { const d = distance(vertexAt(ref.pt), f).d; if (d < bd) { bd = d; best = { b, i }; } });
    if (best && bd < 1e-4) return best;
    throw new Error('a chosen face is no longer there');
  }
  function findEdge(S, ref, byName) {
    const cands = [];
    for (const b of [bodyFor(S, ref), ...S.parts].filter(Boolean)) {
      edgesOf(b);
      b.edgeFaces.forEach((fs, j) => {
        const [n0, n1] = ref.faces;
        const has = (i, n) => b.names[i].includes(n);
        const ok = fs.length === 2 ? (has(fs[0], n0) && has(fs[1], n1)) || (has(fs[0], n1) && has(fs[1], n0)) : fs.length === 1 && has(fs[0], n0) && (n1 === undefined || n1 === n0);
        if (ok) cands.push([b, j]);
      });
      if (cands.length) break;
    }
    if (cands.length) { let best = null, bd = Infinity; for (const [b, j] of cands) { const d = near(midOf(b, j), ref.pt); if (d < bd) { bd = d; best = { b, j }; } } return best; }
    // (byName: for a sketch that follows this edge, only an edge still known by its faces will do)
    if (byName) throw new Error('a chosen edge is no longer there');
    let best = null, bd = Infinity;
    for (const b of S.parts) { edgesOf(b); b.edges.forEach((e, j) => { const d = near(midOf(b, j), ref.pt); if (d < bd) { bd = d; best = { b, j }; } }); }
    if (best && bd < 1e-4) return best;
    throw new Error('a chosen edge is no longer there');
  }
  const vertsOf = b => (b.verts || (b.verts = subShapes(b.shape, TA.TopAbs_VERTEX)));
  /* the faces that meet at each vertex of a body (made once asked) */
  function vertFaces(b) {
    if (b.vertFaces) return b.vertFaces;
    const vs = vertsOf(b), vix = indexer(vs);
    b.vertFaces = vs.map(() => []);
    b.faces.forEach((f, i) => { for (const v of subShapes(f, TA.TopAbs_VERTEX)) { const j = vix(v); if (j >= 0 && !b.vertFaces[j].includes(i)) b.vertFaces[j].push(i); v.delete(); } });
    return b.vertFaces;
  }
  /* a corner found again by the faces that met at it (the nearest to where it was, if several do) */
  function findVertex(S, ref) {
    let best = null, bd = Infinity;
    for (const b of [bodyFor(S, ref), ...S.parts].filter(Boolean)) {
      const vs = vertsOf(b), vf = vertFaces(b);
      vs.forEach((v, j) => { if (!ref.faces.every(n => vf[j].some(i => b.names[i].includes(n)))) return; const q = xyz(T(oc.BRep_Tool.Pnt(v))), d = near(q, ref.pt); if (d < bd) { bd = d; best = q; } });
      if (best) break;
    }
    if (!best) throw new Error('a chosen corner is no longer there');
    return best;
  }
  function surfType(f) {
    const s = T(new oc.BRepAdaptor_Surface(f, true)), t = s.GetType(), G = oc.GeomAbs_SurfaceType;
    return t === G.GeomAbs_Plane ? 'plane' : t === G.GeomAbs_Cylinder ? 'cylinder' : t === G.GeomAbs_Cone ? 'cone' : t === G.GeomAbs_Sphere ? 'sphere' : t === G.GeomAbs_Torus ? 'torus' : 'surface';
  }
  function curveType(e) { const c = T(new oc.BRepAdaptor_Curve(e)), t = c.GetType(), G = oc.GeomAbs_CurveType; return t === G.GeomAbs_Line ? 'line' : t === G.GeomAbs_Circle ? 'circle' : 'curve'; }
  /* a planar face's frame, its normal out of the material */
  function faceFrame(f) {
    const s = T(new oc.BRepAdaptor_Surface(f, true));
    if (s.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) throw new Error('the face is not flat');
    const ax = T(T(s.Plane()).Position());
    let n = xyz(T(ax.Direction()));
    if (f.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED) n = v3.mul(n, -1);
    return frameOfNormal(xyz(T(ax.Location())), n);
  }
  function lineOfEdge(e) {
    const c = T(new oc.BRepAdaptor_Curve(e)), G = oc.GeomAbs_CurveType;
    if (c.GetType() === G.GeomAbs_Line) { const a = xyz(T(c.Value(c.FirstParameter()))), b = xyz(T(c.Value(c.LastParameter()))); return { p: a, d: v3.unit(v3.sub(b, a)) }; }
    if (c.GetType() === G.GeomAbs_Circle) { const ax = T(T(c.Circle()).Axis()); return { p: xyz(T(ax.Location())), d: xyz(T(ax.Direction())) }; }
    throw new Error('the edge is neither straight nor round');
  }
  /* ---------- planes ---------- */
  function planeFrame(S, ref) {
    if (!ref) throw new Error('no plane chosen');
    if (ref.std) return STD_PLANES[ref.std];
    if (ref.feature) { const F = S.frames[ref.feature]; if (!F) throw new Error('its plane is not there (it failed, or is after the rollback bar)'); return F; }
    const { b, i } = findFace(S, ref);
    return faceFrame(b.faces[i]);
  }
  /* ---------- sketches: their shapes as edges, and their regions as faces ---------- */
  /* a smooth curve through points of the sketch's plane (an ellipse's or a spline's, taken finely along it): one
     edge, within a thousandth of a micron of them */
  function curveEdge(F, pts) {
    if (pts.length < 2) throw new Error('a curve of one point');
    if (pts.length === 2) return T(new oc.BRepBuilderAPI_MakeEdge(pnt(toWorld(F, pts[0])), pnt(toWorld(F, pts[1])))).Edge();
    const arr = T(new oc.NCollection_Array1_gp_Pnt(1, pts.length));
    pts.forEach((q, i) => arr.SetValue(i + 1, pnt(toWorld(F, q))));
    const mk = T(new oc.GeomAPI_PointsToBSpline(arr, Math.min(3, pts.length - 1), 8, oc.GeomAbs_Shape.GeomAbs_C1, 1e-7));
    if (!mk.IsDone()) throw new Error('a curve could not be made through its points');
    return T(new oc.BRepBuilderAPI_MakeEdge(mk.Curve())).Edge();
  }
  /* the same curve as several edges end to end, a dozen points to each: the kernel measures a face's area and a
     solid's volume by sampling each edge of its outline, and one long edge of many bends is sampled too thinly */
  function curveEdges(F, pts) {
    const out = [], per = 12;
    for (let i = 0; i + 1 < pts.length; i += per) out.push(curveEdge(F, pts.slice(i, Math.min(pts.length, i + per + 1))));
    return out;
  }
  function entEdges(F, ents) {
    const out = [];
    for (const e of ents) {
      if (e.k || e.t === 'point') continue;
      if (e.t === 'ellipse' || e.t === 'spline') { const P = curvePts(e, 1.5); if (e.t === 'ellipse' || e.closed) P.push(P[0]); try { for (const edge of curveEdges(F, P)) out.push({ e, edge }); } catch (err) { /* left out */ } continue; }
      let edge;
      if (e.t === 'line') { if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 1e-9) continue; edge = T(new oc.BRepBuilderAPI_MakeEdge(pnt(toWorld(F, e.a)), pnt(toWorld(F, e.b)))).Edge(); }
      else {
        const circ = T(new oc.gp_Circ(T(new oc.gp_Ax2(pnt(toWorld(F, e.c)), gdir(F.n), gdir(F.x))), e.r));
        edge = e.t === 'circle' ? T(new oc.BRepBuilderAPI_MakeEdge(circ)).Edge() : T(new oc.BRepBuilderAPI_MakeEdge(circ, e.a0 * DEGR, (e.a0 + arcSweep(e)) * DEGR)).Edge();
      }
      out.push({ e, edge });
    }
    return out;
  }
  /* a region's outline (its corners where the page found them, each side knowing its shape) as a wire of true
     lines and arcs: each corner set exactly where its two shapes cross or end, each run of steps along one arc
     made one arc */
  function ringWire(F, ring) {
    const n = ring.length, src = ring.src, mw = T(new oc.BRepBuilderAPI_MakeWire());
    const circOf = e => T(new oc.gp_Circ(T(new oc.gp_Ax2(pnt(toWorld(F, e.c)), gdir(F.n), gdir(F.x))), e.r));
    const turn = [];
    for (let i = 0; i < n; i++) if (src[(i - 1 + n) % n] !== src[i]) turn.push(i);
    const free = e => e.t === 'ellipse' || e.t === 'spline';
    if (!turn.length) {
      if (!src[0] || src[0].t === 'line') throw new Error('an outline of one line');
      // an ellipse or a closed spline all the way round: through the points the page drew it with
      if (free(src[0])) for (const ed of curveEdges(F, ring.concat([ring[0]]))) mw.Add(ed); else mw.Add(T(new oc.BRepBuilderAPI_MakeEdge(circOf(src[0]))).Edge());
      return mw.Wire();
    }
    const ends = e => (e.t === 'line' ? [e.a, e.b] : e.t === 'arc' ? [e.a0, e.a0 + arcSweep(e)].map(a => [e.c[0] + e.r * Math.cos(a * DEGR), e.c[1] + e.r * Math.sin(a * DEGR)]) : []);
    const exact = i => {
      const A = src[(i - 1 + n) % n], B = src[i], q = ring[i], reach = 0.02 + 0.002 * Math.max(A.r || 0, B.r || 0);
      let best = q, bd = reach;
      for (const c of [...entCross(A, B), ...ends(A), ...ends(B)]) { const d = Math.hypot(c[0] - q[0], c[1] - q[1]); if (d < bd) { bd = d; best = c; } }
      // shapes that only just touch here (or miss by a hair): the corner is put on the round one, and the other's side ends there
      if (best === q) { const round = e => e.t === 'arc' || e.t === 'circle', Rn = round(A) ? A : round(B) ? B : null; if (Rn) { const d = Math.hypot(q[0] - Rn.c[0], q[1] - Rn.c[1]) || 1; best = [Rn.c[0] + (q[0] - Rn.c[0]) / d * Rn.r, Rn.c[1] + (q[1] - Rn.c[1]) / d * Rn.r]; } }
      return best;
    };
    const P = turn.map(exact), m2pi = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // where a side truly starts and stops: a line at its corners; an arc on its own circle, which a corner shared with
    // another arc a hair off it is not quite on (the hair is then bridged by a line as short)
    const onRound = (E, z) => { const d = Math.hypot(z[0] - E.c[0], z[1] - E.c[1]) || 1; return [E.c[0] + (z[0] - E.c[0]) / d * E.r, E.c[1] + (z[1] - E.c[1]) / d * E.r]; };
    const span = turn.map((i0, k) => { const E = src[i0], p = P[k], q = P[(k + 1) % turn.length]; return E.t === 'line' || free(E) ? [p, q] : [onRound(E, p), onRound(E, q)]; });
    turn.forEach((i0, k) => {
      { const was = span[(k - 1 + turn.length) % turn.length][1], now = span[k][0], gap = Math.hypot(now[0] - was[0], now[1] - was[1]); if (gap > 1e-9 && gap < 4 * WELD) mw.Add(T(new oc.BRepBuilderAPI_MakeEdge(pnt(toWorld(F, was)), pnt(toWorld(F, now)))).Edge()); }
      const i1 = turn[(k + 1) % turn.length], E = src[i0], p = P[k], q = P[(k + 1) % turn.length], gap = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (E.t === 'line') { if (gap > 1e-9) mw.Add(T(new oc.BRepBuilderAPI_MakeEdge(pnt(toWorld(F, p)), pnt(toWorld(F, q)))).Edge()); return; }
      // a stretch of an ellipse or a spline: a curve through the corners the page stepped along it, from one true end to the other
      if (free(E)) { const steps2 = (i1 - i0 + n) % n || n, mids = []; for (let j = 1; j < steps2; j++) mids.push(ring[(i0 + j) % n]); for (const ed of curveEdges(F, [p, ...mids, q])) mw.Add(ed); return; }
      // the way round the circle the outline goes: by a corner in the middle of the run (or the middle of its one step)
      const steps = (i1 - i0 + n) % n || n, mid = steps > 1 ? ring[(i0 + Math.floor(steps / 2)) % n] : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const an = z => Math.atan2(z[1] - E.c[1], z[0] - E.c[0]), ap = an(p), aq = an(q), am = an(mid);
      const whole = gap < 1e-9, ccw = whole ? true : m2pi(am - ap) < m2pi(aq - ap), a0 = ccw ? ap : aq, sweep = whole ? 2 * Math.PI : ccw ? m2pi(aq - ap) : m2pi(ap - aq);
      if (sweep > 1e-12) mw.Add(T(new oc.BRepBuilderAPI_MakeEdge(circOf(E), a0, a0 + sweep)).Edge());
    });
    if (!mw.IsDone()) throw new Error('an outline that does not close');
    return mw.Wire();
  }
  /* a face of an outline and the holes in it, checked against the area it should have */
  function ringFace(F, outer, holes, area) {
    let face = T(new oc.BRepBuilderAPI_MakeFace(ringWire(F, outer), true)).Face();
    for (const hole of holes) {
      const hf = T(new oc.BRepBuilderAPI_MakeFace(ringWire(F, hole), true)).Face(), op = T(new oc.BRepAlgoAPI_Cut());
      op.SetArguments(listFrom([face])); op.SetTools(listFrom([hf])); op.Build(prog());
      // (a hole that touches the outline leaves the region in pieces that meet at a point: kept together as one region)
      const fs = op.IsDone() ? subShapes(op.Shape(), TA.TopAbs_FACE) : [];
      if (!fs.length) throw new Error('a hole that does not cut');
      face = fs.length === 1 ? fs[0] : compound(fs);
    }
    if (Math.abs(props(face, 'a').m - area) > 0.02 * area + 1e-3) throw new Error('a face of the wrong size');
    return face;
  }
  /* several regions chosen that touch: one face of each group of them, its outline what is left of theirs when
     the sides they share are taken away. (One face pushed makes one solid; pushing each region and joining the
     solids is where the joining goes wrong, on sides that are arcs.) */
  function unionFaces(sk, idx) {
    const ids = new Map(), id = v => { if (!ids.has(v)) ids.set(v, ids.size); return ids.get(v); }, sides = [];
    for (const i of idx) for (const ring of [sk.regions[i].outer, ...sk.regions[i].holes]) ring.forEach((v, k) => sides.push({ a: id(v), b: id(ring[(k + 1) % ring.length]), p: v, src: ring.src[k] }));
    const have = new Set(sides.map(x => x.a + '>' + x.b)), left = sides.filter(x => !have.has(x.b + '>' + x.a)), from = new Map();
    for (const x of left) { if (!from.has(x.a)) from.set(x.a, []); from.get(x.a).push(x); }
    const area = P => { let t = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; t += p[0] * q[1] - q[0] * p[1]; } return t / 2; };
    const loops = [];
    for (const x0 of left) {
      if (x0.used) continue;
      const ring = [], src = [];
      for (let x = x0, guard = 0; x && !x.used && guard < 100000; guard++) { x.used = true; ring.push(x.p); src.push(x.src); x = (from.get(x.b) || []).find(y => !y.used); }
      if (ring.length >= 3) loops.push(Object.assign(ring, { src, area: area(ring) }));
    }
    const outers = loops.filter(r => r.area > 0).map(r => ({ outer: r, holes: [] }));
    for (const h of loops.filter(r => r.area < 0)) { let best = null; for (const o of outers) if (o.outer.area > -h.area && inside(o.outer, h[0]) && (!best || o.outer.area < best.outer.area)) best = o; if (best) best.holes.push(h); }
    return outers.map(o => ringFace(sk.frame, o.outer, o.holes, o.outer.area + o.holes.reduce((t, h) => t + h.area, 0)));
  }
  /* a sketch's regions as faces: the regions the page finds (core/sketch.js, the same ones it shows and lets be
     chosen), each made of true lines and arcs, its holes cut out. (OpenCascade's own splitting of the plane by
     the sketch's edges gives wrong faces where a line meets two arcs it is tangent to, as slots laid end on end do.) */
  function regionFaces(sk) {
    if (sk.faces) return sk.faces;
    const made = [];
    let Rs = [];
    try { Rs = regionsOf(sk.ents); for (const R of Rs) { try { made.push(ringFace(sk.frame, R.outer, R.holes, R.area)); } catch (err) { /* left to the splitter below */ made.push(null); } } } catch (err) { made.length = 0; made.push(null); }
    if (made.length && made.every(Boolean)) { sk.regions = Rs; return (sk.faces = made); }
    // (shapes a hair apart made the same first, and the split told how near counts as touching: curves that all but
    // coincide otherwise give faces that cut nothing, or everything)
    const F = sk.frame, es = entEdges(F, weldEnts(sk.ents));
    if (!es.length) return (sk.faces = []);
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const { e } of es) for (const p of e.t === 'line' ? [e.a, e.b] : [[e.c[0] - e.r, e.c[1] - e.r], [e.c[0] + e.r, e.c[1] + e.r]]) { lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])]; hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])]; }
    const m = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * 0.25 + 1, U = [lo[0] - m, hi[0] + m], W = [lo[1] - m, hi[1] + m];
    const pln = T(new oc.gp_Pln(T(new oc.gp_Ax3(pnt(F.o), gdir(F.n), gdir(F.x)))));
    const big = T(new oc.BRepBuilderAPI_MakeFace(pln, U[0], U[1], W[0], W[1])).Face();
    const sp = T(new oc.BRepAlgoAPI_Splitter());
    sp.SetArguments(listFrom([big])); sp.SetTools(listFrom(es.map(x => x.edge)));
    try { sp.SetFuzzyValue(WELD); } catch (err) { /* this build has no fuzzy value: exact */ }
    sp.Build(prog());
    const eps = m * 0.1;
    sk.faces = subShapes(sp.Shape(), TA.TopAbs_FACE).filter(f => { const b = oc.BRepTools.UVBounds(f); return b.UMin > U[0] + eps && b.UMax < U[1] - eps && b.VMin > W[0] + eps && b.VMax < W[1] - eps; });
    return sk.faces;
  }
  /* A cut's regions, with the model's own holes in them taken too: a region of the sketch that is a hole of a chosen
     region, drawn only by edges of the model brought into the sketch (ref), where the parts have nothing in what the
     cut would take of it. Left out, the cut's side there lies on the hole's own wall, and the two all but
     coinciding leave slivers of face and thin tubes standing where the hole was. A region with anything in it (a
     boss the cut goes round, a hole not as deep as the cut) stays out, as chosen. pieces(faces) gives the bodies
     the cut would make of them. */
  function withEmptyHoles(S, sk, pts, targets, pieces) {
    regionFaces(sk);
    const Rs = sk.regions;
    if (!Rs || !pts || !pts.length) return pts;
    const chosen = new Set(pts.map(q => (sk.was && regionAt(Rs, carryPt(sk.was, sk.ents, q))) || regionAt(Rs, q)).filter(Boolean));
    const parts = targets && targets.length ? S.parts.filter(p => targets.includes(p.id)) : S.parts;
    const more = [];
    for (const r of Rs) {
      if (chosen.has(r) || !r.outer.src || !r.outer.src.every(e => e && e.ref)) continue;
      if (![...chosen].some(c => (c.holes || []).some(hole => inside(hole, r.pt)))) continue;
      try {
        let has = 0;
        for (const b of pieces(subShapes(sk.faces[Rs.indexOf(r)], TA.TopAbs_FACE))) for (const part of parts) {
          const op = T(new oc.BRepAlgoAPI_Common());
          op.SetArguments(listFrom([part.shape])); op.SetTools(listFrom([b.shape])); op.Build(prog());
          if (!op.IsDone()) { has = Infinity; break; }
          has += Math.abs(props(op.Shape(), 'v').m);
        }
        // (nothing: less than a hundredth of a millimetre's depth of it, all told)
        if (has < Math.abs(r.area) * 0.01) more.push(r.pt);
      } catch (err) { /* not known to be empty: left as chosen */ }
    }
    return more.length ? pts.concat(more) : pts;
  }
  function sketchOf(S, id) {
    const sk = S.sketches[id];
    if (!sk) throw new Error(id ? 'its sketch is not there (it failed, or is after the rollback bar)' : 'no sketch chosen');
    return sk;
  }
  function pickRegions(sk, pts) {
    const faces = regionFaces(sk);
    if (!faces.length) throw new Error('the sketch has no closed regions');
    if (!pts || !pts.length) throw new Error('no region of the sketch is chosen');
    const out = [];
    // (where the faces are the page's regions, the region a point is in is found as the page finds it: its point for a
    // sliver beside a circle can be a hair inside the true circle, the page's circle being drawn in short steps)
    const at = q => { if (sk.regions) { const r = regionAt(sk.regions, q); return r ? faces[sk.regions.indexOf(r)] : undefined; } const v = vertexAt(toWorld(sk.frame, q)); return faces.find(ff => distance(v, ff).d < 1e-6); };
    for (const pt of pts) {
      // a sketch that has just followed the model: the point as it follows its shape, else where it was
      const f = (sk.was && at(carryPt(sk.was, sk.ents, pt))) || at(pt);
      if (!f) throw new Error('a chosen region of the sketch is no longer there: choose the regions again');
      if (!out.includes(f)) out.push(f);
    }
    // regions that touch pushed as one face (where the faces are the page's regions, each known by its outline)
    const each = L => L.flatMap(f => subShapes(f, TA.TopAbs_FACE));
    if (out.length > 1 && sk.regions) { try { return each(unionFaces(sk, out.map(f => faces.indexOf(f)))); } catch (err) { /* each on its own, as before */ } }
    return each(out);
  }
  /* the sketch shape an edge of a region face came from (its middle on the shape) */
  function entOfEdge(sk, edge, shift) {
    const q = toPlane(sk.frame, v3.sub(edgeMid(edge), shift || [0, 0, 0]));
    let best = null, bd = Infinity;
    for (const e of sk.ents) { if (e.k || e.t === 'point') continue; const d = distToEnt(e, q); if (d < bd) { bd = d; best = e; } }
    return best && bd < 1e-4 ? best.id : null;
  }
  /* ---------- the size of everything: how far "through all" goes ---------- */
  function bigLength(S, F) {
    let d = 100;
    for (const b of S.parts) { const bb = bbox(b.shape); if (!bb) continue; d = Math.max(d, near(bb[0], bb[1]) + near(F.o, bb[0]) + near(F.o, bb[1])); }
    return 2 * d;
  }
  /* ---------- solids from faces ---------- */
  function moved(shape, trsf) { return T(new oc.BRepBuilderAPI_Transform(shape, trsf, true, false)).Shape(); }
  const shift = v => { const t = T(new oc.gp_Trsf()); t.SetTranslation(gvec(v)); return t; };
  /* a region face pushed from a to b along d, its faces named: the sketch shape's id for a side, capA and capB the ends */
  function prism(sk, face, d, a, b, fid, capA, capB) {
    const base = Math.abs(a) > 1e-12 ? oc.TopoDS.Face(moved(face, shift(v3.mul(d, a)))) : face;
    const mk = T(new oc.BRepPrimAPI_MakePrism(base, gvec(v3.mul(d, b - a)), false, true));
    const shape = mk.Shape(), first = T(mk.FirstShape()), last = T(mk.LastShape());
    const sideNames = new Map();
    for (const e of subShapes(base, TA.TopAbs_EDGE)) {
      const ent = entOfEdge(sk, e, v3.mul(d, a)), nm = fid + '.' + (ent || 'side');
      for (const g of listOf(mk.Generated(e))) { sideNames.set(hash(g), [g, nm]); }
    }
    return fresh(fid, shape, f => { if (f.IsSame(first)) return fid + '.' + capA; if (f.IsSame(last)) return fid + '.' + capB; const s = sideNames.get(hash(f)); return s && s[0].IsSame(f) ? s[1] : null; });
  }
  /* bodies fused into one (names carried) */
  function fuseAll(bodies, fid, id) {
    if (bodies.length === 1) return Object.assign({}, bodies[0], { id: id || bodies[0].id });
    const op = T(new oc.BRepAlgoAPI_Fuse());
    op.SetArguments(listFrom([bodies[0].shape])); op.SetTools(listFrom(bodies.slice(1).map(b => b.shape))); op.Build(prog());
    if (!op.IsDone()) throw new Error('the pieces could not be joined');
    op.SimplifyResult(true, true, 1e-6);
    const shape = op.Shape(), c = carried(op, bodies, shape, fid);
    return mkBody(id || bodies[0].id, shape, c.faces, c.names);
  }
  function cutBody(target, tool, fid, kind) {
    const op = T(kind === 'common' ? new oc.BRepAlgoAPI_Common() : new oc.BRepAlgoAPI_Cut());
    op.SetArguments(listFrom([target.shape])); op.SetTools(listFrom([tool.shape])); op.Build(prog());
    if (!op.IsDone()) throw new Error(kind === 'common' ? 'the intersection could not be made' : 'the cut could not be made');
    op.SimplifyResult(true, true, 1e-6);
    const shape = op.Shape(), c = carried(op, [target, tool], shape, fid);
    return mkBody(target.id, shape, c.faces, c.names);
  }
  const touches = (a, b) => distance(a.shape, b.shape).d < 1e-6;
  /* a tool body applied to the parts: new parts, added to them, cut from them, or kept where it meets them */
  function applyTool(S, fid, tool, op, targets) {
    const parts = S.parts.slice(), made = [];
    const pick = () => (targets && targets.length ? parts.filter(p => targets.includes(p.id)) : parts.filter(p => op !== 'add' || touches(p, tool)));
    if (op === 'new' || (op === 'add' && !pick().length)) {
      const bs = splitBody(tool, k => (k ? fid + '.' + k : fid));
      for (const b of bs) { let id = b.id; while (parts.some(p => p.id === id)) id += "'"; b.id = id; parts.push(b); made.push(id); }
      return { parts, made };
    }
    const tg = pick();
    if (!tg.length) throw new Error('there are no parts here to ' + (op === 'remove' ? 'cut' : 'intersect'));
    if (op === 'add') {
      const all = fuseAll(tg.concat([tool]), fid, tg[0].id);
      const bs = splitBody(all, k => (k ? tg[0].id + '.' + fid + '.' + k : tg[0].id));
      // solids that hold another target's faces keep that target's id
      for (const b of bs.slice(1)) { const t = tg.slice(1).find(x => x.names.some(ns => b.names.some(bn => bn[0] === ns[0]))); if (t && !bs.some(o => o !== b && o.id === t.id)) b.id = t.id; }
      const at = parts.indexOf(tg[0]);
      const rest = parts.filter(p => !tg.includes(p));
      rest.splice(Math.min(at, rest.length), 0, ...bs);
      return { parts: rest, made: [] };
    }
    const out = [];
    for (const p of parts) {
      if (!tg.includes(p)) { out.push(p); continue; }
      const r = cutBody(p, tool, fid, op === 'intersect' ? 'common' : 'cut');
      out.push(...splitBody(r, k => (k ? p.id + '.' + fid + '.' + k : p.id)));
    }
    return { parts: out, made: [] };
  }
  const nextState = S => ({ parts: S.parts.slice(), frames: Object.assign({}, S.frames), tools: Object.assign({}, S.tools), sketches: Object.assign({}, S.sketches) });

  /* a sketch's shapes that came from edges of the model (src: the edge's ref) follow those edges: each is found
     again in the model as it is now and flattened onto the sketch's plane; if any has moved, the sketch is solved
     again, so what was drawn on it or dimensioned from it moves with it. True if the sketch changed. */
  function followRefs(S, f, F) {
    let moved = false;
    const far = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7;
    for (const e of f.ents) {
      if (!e.ref || !e.src) continue;
      if (e.src.kind === 'vertex') {
        if (e.t !== 'point') continue;
        let q; try { q = toPlane(F, findVertex(S, e.src)); } catch (err) { continue; }
        if (!far(q, e.c)) continue;
        e.c = q;
        for (const c of f.cons) if (c.t === 'fix' && c.r[0].e === e.id) c.at = q.slice();
        moved = true; continue;
      }
      let g;
      try { const hit = findEdge(S, e.src, true), sh = edgeShapes(hit.b.edges[hit.j], F); if (sh.length !== 1 || sh[0].t !== e.t) continue; g = sh[0]; } catch (err) { continue; }
      if (e.t === 'line') {
        // the same way round as it was drawn
        if (Math.hypot(g.a[0] - e.a[0], g.a[1] - e.a[1]) + Math.hypot(g.b[0] - e.b[0], g.b[1] - e.b[1]) > Math.hypot(g.b[0] - e.a[0], g.b[1] - e.a[1]) + Math.hypot(g.a[0] - e.b[0], g.a[1] - e.b[1])) [g.a, g.b] = [g.b, g.a];
        if (!far(g.a, e.a) && !far(g.b, e.b)) continue;
        e.a = g.a; e.b = g.b;
      } else {
        if (!far(g.c, e.c) && Math.abs(g.r - e.r) < 1e-7 && (e.t === 'circle' || (Math.abs(g.a0 - e.a0) < 1e-6 && Math.abs(g.a1 - e.a1) < 1e-6))) continue;
        e.c = g.c; e.r = g.r; if (e.t === 'arc') { e.a0 = g.a0; e.a1 = g.a1; }
        for (const d of f.dims) if ((d.t === 'rad' || d.t === 'dia') && d.r[0].e === e.id) { d.v = d.t === 'dia' ? 2 * e.r : e.r; d.x = String(+d.v.toFixed(6)); }
      }
      const Em = new Map([[e.id, e]]);
      for (const c of f.cons) if (c.t === 'fix' && c.r[0].e === e.id && entKeys(e).includes(c.r[0].k)) c.at = hpt(Em, c.r[0]).slice();
      moved = true;
    }
    if (moved) solveSketch(f.ents, f.cons, f.dims, null, { iters: 80 });
    return moved;
  }
  /* ---------- the features ---------- */
  const FEAT = {
    sketch(S, f) {
      const frame = planeFrame(S, f.plane);
      const was = f.ents.some(e => e.ref && e.src) ? JSON.parse(JSON.stringify(f.ents)) : null, moved = followRefs(S, f, frame);
      S.sketches[f.id] = { frame, ents: f.ents, was: moved ? was : null };
      S.frames[f.id] = frame;
      return Object.assign({ frame, regions: regionFaces(S.sketches[f.id]).length }, moved ? { ents: f.ents, cons: f.cons, dims: f.dims, was } : {});
    },
    plane(S, f, V) {
      const base = planeFrame(S, f.ref), off = fieldValue(f, 'offset', V, 'len') * (f.flip ? -1 : 1);
      S.frames[f.id] = Object.assign({}, base, { o: v3.add(base.o, v3.mul(base.n, off)) });
      return { frame: S.frames[f.id] };
    },
    extrude(S, f, V) {
      const sk = sketchOf(S, f.sketch);
      // a depth below 0 goes the other way (as Opposite direction does for the ends that have no depth)
      const L = bigLength(S, sk.frame), dv = f.end === 'through' || f.end === 'upto' ? L : fieldValue(f, 'depth', V, 'len'), d1 = Math.abs(dv);
      const n = v3.mul(sk.frame.n, (f.flip ? -1 : 1) * (dv < 0 && f.end !== 'symmetric' ? -1 : 1) * (f.op === 'remove' ? -1 : 1));
      if (!(d1 > 1e-9)) throw new Error('the depth cannot be 0');
      const range1 = f.end === 'symmetric' ? [-d1 / 2, d1 / 2] : [0, d1];
      const piecesOf = faces => {
        const pieces = [];
        for (const face of faces) {
          let b = prism(sk, face, n, range1[0], range1[1], f.id, 'start', 'end');
          if (f.end === 'upto') b = uptoTrim(S, b, f.upto, n, f.id);
          pieces.push(b);
          if (f.second && f.end !== 'symmetric') {
            const d2 = f.end2 === 'through' || f.end2 === 'upto' ? L : fieldValue(f, 'depth2', V, 'len');
            if (!(d2 > 1e-9)) throw new Error('the second depth must be more than 0');
            let b2 = prism(sk, face, v3.mul(n, -1), 0, d2, f.id, 'start2', 'end2');
            if (f.end2 === 'upto') b2 = uptoTrim(S, b2, f.upto2, v3.mul(n, -1), f.id);
            pieces.push(b2);
          }
        }
        return pieces;
      };
      // (a cut takes in the holes of the model that lie in what it takes, where they are empty already)
      const faces = pickRegions(sk, f.op === 'remove' ? withEmptyHoles(S, sk, f.regions, f.targets, piecesOf) : f.regions);
      let tool = fuseAll(piecesOf(faces), f.id, f.id);
      const draft = fieldValue(f, 'draft', V, 'ang');
      if (Math.abs(draft) > 1e-9) tool = drafted(tool, sk.frame, n, draft, f.id);
      S.tools[f.id] = { tool, op: f.op, targets: f.targets };
      const r = applyTool(S, f.id, tool, f.op, f.targets);
      S.parts = r.parts;
      return { made: r.made };
    },
    revolve(S, f, V) {
      const sk = sketchOf(S, f.sketch), faces = pickRegions(sk, f.regions);
      let p, d;
      if (f.axis && typeof f.axis === 'string' && /^[xyz]$/.test(f.axis)) { p = [0, 0, 0]; d = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[f.axis]; }
      else {
        const L = f.axis && sk.ents.find(e => e.id === (f.axis.e || f.axis));
        if (!L || L.t !== 'line') throw new Error('choose a line of the sketch to revolve about');
        p = toWorld(sk.frame, L.a); d = v3.unit(v3.sub(toWorld(sk.frame, L.b), p));
      }
      const full = f.kind === 'full', ang = full ? 360 : fieldValue(f, 'angle', V, 'ang');
      if (!(Math.abs(ang) > 1e-9)) throw new Error('the angle must not be 0');
      const ax = T(new oc.gp_Ax1(pnt(p), gdir(d))), sgn = f.flip ? -1 : 1;
      const pieces = faces.map(face => {
        let base = face;
        if (f.kind === 'sym') { const t = T(new oc.gp_Trsf()); t.SetRotation(ax, -ang / 2 * DEGR); base = oc.TopoDS.Face(moved(face, t)); }
        const mk = T(new oc.BRepPrimAPI_MakeRevol(base, ax, sgn * Math.min(360, Math.abs(ang)) * DEGR * Math.sign(ang), false));
        const shape = mk.Shape(), names = new Map();
        let first = null, last = null;
        if (!full) { first = T(mk.FirstShape()); last = T(mk.LastShape()); }
        for (const e of subShapes(base, TA.TopAbs_EDGE)) { const nm = f.id + '.' + (entOfEdge(sk, e, [0, 0, 0]) || 'side'); try { for (const g of listOf(mk.Generated(e))) names.set(hash(g), [g, nm]); } catch (err) { /* an edge on the axis generates nothing */ } }
        return fresh(f.id, shape, fc => { if (first && fc.IsSame(first)) return f.id + '.start'; if (last && fc.IsSame(last)) return f.id + '.end'; const s = names.get(hash(fc)); return s && s[0].IsSame(fc) ? s[1] : null; });
      });
      const tool = fuseAll(pieces, f.id, f.id);
      S.tools[f.id] = { tool, op: f.op, targets: f.targets };
      const r = applyTool(S, f.id, tool, f.op, f.targets);
      S.parts = r.parts;
      return { made: r.made };
    },
    sweep(S, f) {
      const sk = sketchOf(S, f.sketch), faces = pickRegions(sk, f.regions), path = sketchOf(S, f.path);
      const spine = chainWire(path);
      const pieces = faces.map(face => {
        const mk = T(new oc.BRepOffsetAPI_MakePipeShell(spine));
        mk.Add(oc.BRepTools.OuterWire(face), false, true);
        mk.Build(prog());
        if (!mk.IsDone()) throw new Error('the profile could not be swept along that path');
        mk.MakeSolid();
        return fresh(f.id, mk.Shape(), (fc, i) => f.id + '.m' + i);
      });
      const tool = fuseAll(pieces, f.id, f.id);
      S.tools[f.id] = { tool, op: f.op, targets: f.targets };
      const r = applyTool(S, f.id, tool, f.op, f.targets);
      S.parts = r.parts;
      return { made: r.made };
    },
    loft(S, f) {
      if ((f.sections || []).length < 2) throw new Error('choose two profiles or more');
      const mk = T(new oc.BRepOffsetAPI_ThruSections(true, !!f.ruled, 1e-6));
      for (const s of f.sections) { const sk = sketchOf(S, s.sketch), fs = pickRegions(sk, s.regions && s.regions.length ? s.regions : null); mk.AddWire(oc.BRepTools.OuterWire(fs[0])); }
      mk.CheckCompatibility(false);
      mk.Build(prog());
      if (!mk.IsDone()) throw new Error('the profiles could not be lofted');
      const tool = fresh(f.id, mk.Shape(), (fc, i) => f.id + '.m' + i);
      S.tools[f.id] = { tool, op: f.op, targets: f.targets };
      const r = applyTool(S, f.id, tool, f.op, f.targets);
      S.parts = r.parts;
      return { made: r.made };
    },
    fillet(S, f, V) { return edgeOp(S, f, fieldValue(f, 'radius', V, 'len'), 'fillet'); },
    chamfer(S, f, V) { return edgeOp(S, f, fieldValue(f, 'distance', V, 'len'), 'chamfer'); },
    shell(S, f, V) {
      const t = fieldValue(f, 'thickness', V, 'len');
      if (!(t > 1e-9)) throw new Error('the thickness must be more than 0');
      if (!f.faces.length) throw new Error('choose the faces to remove');
      const found = f.faces.map(r => findFace(S, r)), b = found[0].b;
      if (found.some(x => x.b !== b)) throw new Error('the faces must all be on one part');
      const mk = T(new oc.BRepOffsetAPI_MakeThickSolid());
      mk.MakeThickSolidByJoin(b.shape, listFrom(found.map(x => b.faces[x.i])), f.outward ? t : -t, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false, prog());
      if (!mk.IsDone()) throw new Error('the shell could not be made: the thickness may be too big for the part');
      const shape = mk.Shape(), c = carried(mk, [b], shape, f.id);
      replacePart(S, b, mkBody(b.id, shape, c.faces, c.names));
      return {};
    },
    hole(S, f, V) {
      const sk = sketchOf(S, f.sketch), pts = sk.ents.filter(e => e.t === 'point' && !e.k);
      if (!pts.length) throw new Error('the sketch has no points: put a point where each hole goes');
      const d = fieldValue(f, 'dia', V, 'len'), r = d / 2;
      if (!(r > 1e-9)) throw new Error('the diameter must be more than 0');
      const w = v3.mul(sk.frame.n, -1), u = sk.frame.x, L = bigLength(S, sk.frame);
      const D = f.end === 'through' ? L : fieldValue(f, 'depth', V, 'len'), z0 = -Math.max(0.5, d * 0.2);
      if (!(D > 1e-9)) throw new Error('the depth must be more than 0');
      // the profile, (radius, depth into the material), from the axis round
      let prof = [[0, z0]];
      if (f.kind === 'cbore') {
        const R = fieldValue(f, 'cbDia', V, 'len') / 2, cd = fieldValue(f, 'cbDepth', V, 'len');
        if (!(R > r) || !(cd > 0) || cd >= D) throw new Error('the counterbore must be wider than the hole and shallower than it');
        prof.push([R, z0], [R, cd], [r, cd]);
      } else if (f.kind === 'csink') {
        const R = fieldValue(f, 'csDia', V, 'len') / 2, ca = fieldValue(f, 'csAngle', V, 'ang');
        if (!(R > r) || !(ca > 0 && ca < 180)) throw new Error('the countersink must be wider than the hole, its angle between 0 and 180°');
        const zc = (R - r) / Math.tan(ca / 2 * DEGR);
        prof.push([R - z0 * Math.tan(ca / 2 * DEGR), z0], [r, zc]);
      } else prof.push([r, z0]);
      prof.push([r, D]);
      if (f.end !== 'through' && f.tip) prof.push([0, D + r / Math.tan(59 * DEGR)]); else prof.push([0, D]);
      const tools = pts.map((pe, k) => {
        const c = toWorld(sk.frame, pe.c), P3 = q => v3.add(c, v3.add(v3.mul(u, q[0]), v3.mul(w, q[1])));
        const wire = T(new oc.BRepBuilderAPI_MakeWire());
        const segs = [];
        for (let i = 0; i < prof.length; i++) {
          const a = prof[i], b = prof[(i + 1) % prof.length];
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
          const e = T(new oc.BRepBuilderAPI_MakeEdge(pnt(P3(a)), pnt(P3(b)))).Edge(); wire.Add(e); segs.push(e);
        }
        const face = T(new oc.BRepBuilderAPI_MakeFace(wire.Wire(), true)).Face();
        const mk = T(new oc.BRepPrimAPI_MakeRevol(face, T(new oc.gp_Ax1(pnt(c), gdir(w))), 2 * Math.PI, false));
        const names = new Map();
        segs.forEach((e, si) => { try { for (const g of listOf(mk.Generated(e))) names.set(hash(g), [g, f.id + '.h' + k + '.' + si]); } catch (err) { /* on the axis */ } });
        return fresh(f.id, mk.Shape(), fc => { const s = names.get(hash(fc)); return s && s[0].IsSame(fc) ? s[1] : null; });
      });
      const tool = fuseAll(tools, f.id, f.id);
      S.tools[f.id] = { tool, op: 'remove', targets: f.targets };
      const r2 = applyTool(S, f.id, tool, 'remove', f.targets);
      S.parts = r2.parts;
      return { holes: pts.length };
    },
    lpattern(S, f, V) {
      const n = Math.round(fieldValue(f, 'count', V, 'num')), s = fieldValue(f, 'spacing', V, 'len');
      if (!(n >= 1 && n <= 500)) throw new Error('the instances must be from 1 to 500');
      let d = f.dirRef ? lineOfEdge(edgeOfRef(S, f.dirRef)).d : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[f.dir] || [1, 0, 0];
      if (f.flip) d = v3.mul(d, -1);
      const trs = []; for (let k = 1; k < n; k++) trs.push(shift(v3.mul(d, s * k)));
      return patterned(S, f, trs);
    },
    cpattern(S, f, V) {
      const n = Math.round(fieldValue(f, 'count', V, 'num')), A = fieldValue(f, 'angle', V, 'ang');
      if (!(n >= 1 && n <= 500)) throw new Error('the instances must be from 1 to 500');
      const ax = f.axisRef ? lineOfEdge(edgeOfRef(S, f.axisRef)) : { p: [0, 0, 0], d: { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[f.axis] || [0, 0, 1] };
      const step = Math.abs(A) >= 360 - 1e-9 ? 360 / n : n > 1 ? A / (n - 1) : 0;
      const g = T(new oc.gp_Ax1(pnt(ax.p), gdir(ax.d))), trs = [];
      for (let k = 1; k < n; k++) { const t = T(new oc.gp_Trsf()); t.SetRotation(g, step * k * DEGR); trs.push(t); }
      return patterned(S, f, trs);
    },
    mirror(S, f) {
      const F = planeFrame(S, f.plane), t = T(new oc.gp_Trsf());
      t.SetMirror(T(new oc.gp_Ax2(pnt(F.o), gdir(F.n))));
      return patterned(S, f, [t]);
    },
    delete(S, f) {
      if (!f.targets.length) throw new Error('choose the parts to delete');
      const gone = f.targets.filter(id => S.parts.some(p => p.id === id));
      if (!gone.length) throw new Error('a chosen part is not there');
      S.parts = S.parts.filter(p => !gone.includes(p.id));
      return { deleted: gone.length };
    },
    boolean(S, f) {
      const get = ids => ids.map(id => { const p = S.parts.find(x => x.id === id); if (!p) throw new Error('a chosen part is not there'); return p; });
      const tg = get(f.targets), tl = get(f.tools.filter(id => !f.targets.includes(id)));
      if (!tg.length) throw new Error('choose the parts to change');
      if (f.op === 'union') {
        if (tg.length + tl.length < 2) throw new Error('choose two parts or more');
        const all = fuseAll(tg.concat(tl), f.id, tg[0].id), bs = splitBody(all, k => (k ? tg[0].id + '.' + f.id + '.' + k : tg[0].id));
        const at = S.parts.indexOf(tg[0]), rest = S.parts.filter(p => !tg.includes(p) && !tl.includes(p));
        rest.splice(Math.min(at, rest.length), 0, ...bs); S.parts = rest;
        return {};
      }
      if (!tl.length) throw new Error('choose the tool parts');
      const tool = fuseAll(tl, f.id, tl[0].id), out = [];
      for (const p of S.parts) {
        if (tl.includes(p)) { if (f.keep) out.push(p); continue; }
        if (!tg.includes(p)) { out.push(p); continue; }
        const r = cutBody(p, tool, f.id, f.op === 'intersect' ? 'common' : 'cut');
        out.push(...splitBody(r, k => (k ? p.id + '.' + f.id + '.' + k : p.id)));
      }
      S.parts = out;
      return {};
    },
    import(S, f) {
      if (!f.data) throw new Error('the file is empty');
      const path = '/import-' + f.id + '.step';
      oc.FS.writeFile(path, f.data);
      const rd = T(new oc.STEPControl_Reader());
      const st = rd.ReadFile(path);
      try { oc.FS.unlink(path); } catch (err) { /* gone */ }
      if (st !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('that is not a STEP file JEKcad can read');
      rd.TransferRoots(prog());
      const shape = rd.OneShape(), sols = solidsOf(shape);
      if (!sols.length) throw new Error('the STEP file has no solids');
      const made = [];
      sols.forEach((s, k) => { const id = k ? f.id + '.' + k : f.id; S.parts.push(fresh(id, s, (fc, i) => id + '.g' + i)); made.push(id); });
      return { made, solids: sols.length };
    },
  };
  function uptoTrim(S, b, ref, n, fid) {
    if (!ref) throw new Error('choose the face to extrude up to');
    const { b: tb, i } = findFace(S, ref), face = tb.faces[i];
    // the half of space beyond the face (its surface carried on), cut away
    const c = centreOf(tb, i), far = v3.add(c, v3.mul(n, bigLength(S, { o: c }) * 2));
    const hs = T(new oc.BRepPrimAPI_MakeHalfSpace(face, pnt(far))).Solid();
    const hsBody = fresh(fid, hs, () => fid + '.end');
    return cutBody(b, hsBody, fid, 'cut');
  }
  function drafted(tool, F, n, ang, fid) {
    const mk = T(new oc.BRepOffsetAPI_DraftAngle(tool.shape));
    const pln = T(new oc.gp_Pln(pnt(F.o), gdir(F.n)));
    let any = false;
    tool.faces.forEach((f, i) => { if (!tool.names[i].some(nm => /\.(start|end|start2|end2)$/.test(nm))) { mk.Add(f, gdir(n), ang * DEGR, pln, true); any = true; } });
    if (!any) return tool;
    mk.Build(prog());
    if (!mk.IsDone()) throw new Error('the draft could not be made');
    const shape = mk.Shape(), faces = subShapes(shape, TA.TopAbs_FACE), ix = indexer(faces), names = faces.map(() => []);
    tool.faces.forEach((f, i) => { let m = f; try { m = mk.ModifiedShape(f); } catch (err) { m = f; } const k = ix(m); if (k >= 0) names[k].push(...tool.names[i]); });
    { const bare = faces.map((f, i) => i).filter(i => !names[i].length), rank = bare.length ? stableRank(faces, bare) : null; for (const i of bare) names[i].push(fid + '.dm' + rank.get(i)); }
    return mkBody(tool.id, shape, faces, names);
  }
  function edgeOfRef(S, ref) { const { b, j } = findEdge(S, ref); return edgesOf(b)[j]; }
  function replacePart(S, old, nb) { S.parts = S.parts.map(p => (p === old ? nb : p)); }
  function edgeOp(S, f, size, kind) {
    if (!(size > 1e-9)) throw new Error((kind === 'fillet' ? 'the radius' : 'the distance') + ' must be more than 0');
    if (!f.edges.length) throw new Error('choose the edges' + (kind === 'fillet' ? ' to round' : ' to bevel'));
    const by = new Map();
    for (const r of f.edges) {
      if (r.kind === 'face') { const { b, i } = findFace(S, r); edgesOf(b); const L = by.get(b) || new Set(); b.edgeFaces.forEach((fs, j) => { if (fs.includes(i)) L.add(j); }); by.set(b, L); }
      else { const { b, j } = findEdge(S, r); const L = by.get(b) || new Set(); L.add(j); by.set(b, L); }
    }
    for (const [b, js] of by) {
      const mk = T(kind === 'fillet' ? new oc.BRepFilletAPI_MakeFillet(b.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational) : new oc.BRepFilletAPI_MakeChamfer(b.shape));
      const gen = [];
      // each new face named after the edge it rounds: by the two faces that met there (and, where two edges lie
      // between one pair of faces, their order along x, y, z), not by the order the kernel happens to list edges in,
      // which is not the same from one visit to the next
      const keyOf = j => b.edgeFaces[j].map(i => b.names[i][0]).sort().join('|'), seen = new Map();
      const ordered = [...js].sort((p, q) => { const kp = keyOf(p), kq = keyOf(q); if (kp !== kq) return kp < kq ? -1 : 1; const mp = midOf(b, p), mq = midOf(b, q); for (let i = 0; i < 3; i++) if (Math.abs(mp[i] - mq[i]) > 1e-7) return mp[i] - mq[i]; return 0; });
      for (const j of ordered) { const key = keyOf(j), n = seen.get(key) || 0; seen.set(key, n + 1); mk.Add(size, b.edges[j]); gen.push([b.edges[j], f.id + '.r' + hashText([2166136261, 1], key)[0].toString(36) + (n ? '.' + n : '')]); }
      let shape;
      try { mk.Build(prog()); shape = mk.Shape(); } catch (err) { throw new Error('the ' + kind + ' could not be made: the ' + (kind === 'fillet' ? 'radius' : 'distance') + ' may be too big for the edges chosen'); }
      if (!mk.IsDone()) throw new Error('the ' + kind + ' could not be made');
      const c = carried(mk, [b], shape, f.id, gen);
      replacePart(S, b, mkBody(b.id, shape, c.faces, c.names));
    }
    return { edges: [...by.values()].reduce((s, L) => s + L.size, 0) };
  }
  /* a path sketch's shapes as one wire, in order end to end */
  function chainWire(sk) {
    const es = entEdges(sk.frame, sk.ents);
    if (!es.length) throw new Error('the path sketch has no shapes');
    const ends = x => { const e = x.e; if (e.t === 'line') return [e.a, e.b]; if (e.t === 'circle') return [null, null]; const s = arcSweep(e); return [[e.c[0] + e.r * Math.cos(e.a0 * DEGR), e.c[1] + e.r * Math.sin(e.a0 * DEGR)], [e.c[0] + e.r * Math.cos((e.a0 + s) * DEGR), e.c[1] + e.r * Math.sin((e.a0 + s) * DEGR)]]; };
    const same = (p, q) => p && q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
    const left = es.slice(), order = [left.shift()];
    let head = ends(order[0])[0], tail = ends(order[0])[1];
    for (let guard = 0; left.length && guard < 10000; guard++) {
      const i = left.findIndex(x => { const [a, b] = ends(x); return same(a, tail) || same(b, tail) || same(a, head) || same(b, head); });
      if (i < 0) break;
      const x = left.splice(i, 1)[0], [a, b] = ends(x);
      if (same(a, tail)) { order.push(x); tail = b; } else if (same(b, tail)) { order.push(x); tail = a; } else if (same(b, head)) { order.unshift(x); head = a; } else { order.unshift(x); head = b; }
    }
    if (left.length) throw new Error('the path’s shapes do not join end to end');
    const mw = T(new oc.BRepBuilderAPI_MakeWire());
    for (const x of order) mw.Add(x.edge);
    if (!mw.IsDone()) throw new Error('the path could not be made into one wire');
    return mw.Wire();
  }
  /* copies of tool features, or of parts, each moved by one of trs */
  function patterned(S, f, trs) {
    if (!f.items.length) throw new Error(f.of === 'parts' ? 'choose the parts' : 'choose the features');
    const copyOf = (b, t, sfx, id) => {
      const mt = T(new oc.BRepBuilderAPI_Transform(b.shape, t, true, false)), shape = mt.Shape(), faces = subShapes(shape, TA.TopAbs_FACE), ix = indexer(faces), names = faces.map(() => []);
      b.faces.forEach((fc, i) => { const k = ix(T(mt.ModifiedShape(fc))); if (k >= 0) names[k].push(...b.names[i].map(n => n + sfx)); });
      { const bare = faces.map((fc, i) => i).filter(i => !names[i].length), rank = bare.length ? stableRank(faces, bare) : null; for (const i of bare) names[i].push(f.id + '.m' + rank.get(i) + sfx); }
      return mkBody(id, shape, faces, names);
    };
    let made = 0;
    if (f.of === 'parts') {
      for (const pid of f.items) {
        const b = S.parts.find(p => p.id === pid);
        if (!b) throw new Error('a chosen part is not there');
        trs.forEach((t, k) => { S.parts.push(copyOf(b, t, '~' + f.id + '.' + (k + 1), pid + '~' + f.id + '.' + (k + 1))); made++; });
      }
      return { copies: made };
    }
    for (const fid of f.items) {
      const tr = S.tools[fid];
      if (!tr) throw new Error('only extrudes, revolves, sweeps, lofts and holes that regenerated can be patterned as features; pattern the part instead');
      trs.forEach((t, k) => {
        const sfx = '~' + f.id + '.' + (k + 1), tool = copyOf(tr.tool, t, sfx, f.id + '.' + (k + 1));
        const r = applyTool(S, f.id + '.' + (k + 1), tool, tr.op, tr.targets);
        S.parts = r.parts; made++;
      });
    }
    return { copies: made };
  }
  void TOOL_FEATURES;

  /* ---------- the regeneration, kept by the feature list up to each feature ---------- */
  let cache = new Map();
  const hashText = (h, s) => { let a = h[0], b = h[1]; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b + c, 2246822519) >>> 0; } return [a, b]; };
  const EMPTY = () => ({ parts: [], frames: {}, tools: {}, sketches: {} });
  let last = { S: EMPTY(), doc: null, vars: {} };
  function runFeature(S0, f, vars) {
    const S = nextState(S0);
    try {
      if (!FEAT[f.type]) throw new Error('JEKcad cannot make a ' + f.type + ' feature');
      const info = FEAT[f.type](S, f, vars) || {};
      return { S, rep: { id: f.id, ok: true, info } };
    } catch (err) {
      return { S: S0, rep: { id: f.id, ok: false, error: errText(err) } };
    } finally { flush(); }
  }
  /* the document regenerated up to the rollback bar (or opts.upto): every feature's outcome, the parts, the planes;
     opts.preview = { at, feature } also regenerates that feature (being edited) on the state before place at */
  function regen(doc0, opts) {
    opts = opts || {};
    const doc = normDoc(JSON.parse(JSON.stringify(doc0))), { vars, errors } = prepareDoc(doc);
    const upto = Math.min(doc.features.length, opts.upto != null ? opts.upto : appliedCount(doc));
    const fresh2 = new Map(), reports = [];
    let S = EMPTY(), h = hashText([2166136261, 1], JSON.stringify(vars));
    for (let i = 0; i < upto; i++) {
      const f = doc.features[i];
      h = hashText(h, JSON.stringify(f));
      const key = h.join(':');
      if (f.suppressed) { reports.push({ id: f.id, suppressed: true }); continue; }
      let hit = cache.get(key);
      if (!hit) hit = runFeature(S, f, vars);
      fresh2.set(key, hit);
      S = hit.S; reports.push(hit.rep);
    }
    for (let i = upto; i < doc.features.length; i++) reports.push({ id: doc.features[i].id, rolledBack: true });
    // what the old cache held and the new one does not: let go
    const keep = new Set();
    for (const v of fresh2.values()) for (const p of v.S.parts) keep.add(p.shape);
    for (const v of cache.values()) for (const p of v.S.parts) if (!keep.has(p.shape)) { try { p.shape.delete(); } catch (err) { /* shared */ } keep.add(p.shape); }
    cache = fresh2;
    last = { S, doc, vars };
    let preview = null;
    if (opts.preview && opts.preview.feature) {
      const pf = JSON.parse(JSON.stringify(opts.preview.feature));
      if (pf.type === 'sketch') { const pd = { features: [pf] }; prepareDoc(Object.assign({ variables: doc.variables }, pd)); }
      const r = runFeature(S, pf, vars);
      preview = { rep: r.rep, frame: r.S.frames[pf.id] || null };
      if (r.rep.ok) {
        const tool = r.S.tools[pf.id];
        if (tool) preview.tool = meshBody(tool.tool, 'tool');
        else if (pf.type !== 'sketch' && pf.type !== 'plane') preview.parts = r.S.parts.filter(p => !S.parts.includes(p)).map(p => meshBody(p, 'preview'));
      }
      flush();
    }
    const frames = {};
    for (const [k, F] of Object.entries(S.frames)) frames[k] = F;
    return { features: reports, parts: S.parts.map((b, i) => Object.assign(meshBody(b, b.id), { look: partLook(doc, b.id, i) })), frames, preview, vars, errors };
  }
  /* ---------- meshes for the page: triangles grouped by face, edges by edge, the vertices ---------- */
  const meshes = new WeakMap();
  function meshBody(b, id) {
    const had = meshes.get(b);
    if (had) return Object.assign({}, had, { id });
    const bb = bbox(b.shape) || [[0, 0, 0], [1, 1, 1]], size = near(bb[0], bb[1]) || 1, tol = Math.max(0.005, size * 0.0015);
    const raw = oc.ReplicadMeshExtractor.extract(b.shape, tol, 0.25, false);
    let buf = oc.wasmMemory.buffer;
    const pos = new Float32Array(buf, raw.getVerticesPtr(), raw.getVerticesSize()).slice(), nrm = new Float32Array(buf, raw.getNormalsPtr(), raw.getNormalsSize()).slice();
    const idx = new Uint32Array(buf, raw.getTrianglesPtr(), raw.getTrianglesSize()).slice(), fg = new Int32Array(buf, raw.getFaceGroupsPtr(), raw.getFaceGroupsSize()).slice();
    raw.delete();
    const fh = new Map(); b.faces.forEach((f, i) => { const k = hash(f); if (!fh.has(k)) fh.set(k, i); });
    const faceGroups = new Int32Array(b.faces.length * 2);
    for (let g = 0; g < fg.length; g += 3) { const i = fh.get(fg[g + 2]); if (i !== undefined) { faceGroups[2 * i] = fg[g]; faceGroups[2 * i + 1] = fg[g + 1]; } }
    edgesOf(b);
    const er = oc.ReplicadEdgeMeshExtractor.extract(b.shape, tol, 0.25);
    buf = oc.wasmMemory.buffer;
    const lines = new Float32Array(buf, er.getLinesPtr(), er.getLinesSize()).slice(), eg = new Int32Array(buf, er.getEdgeGroupsPtr(), er.getEdgeGroupsSize()).slice();
    er.delete();
    const eh = new Map(); b.edges.forEach((e, j) => { const k = hash(e); if (!eh.has(k)) eh.set(k, j); });
    // each edge's polyline as segments, grouped
    let nseg = 0; for (let g = 0; g < eg.length; g += 3) nseg += Math.max(0, eg[g + 1] - 1);
    const seg = new Float32Array(nseg * 6), edgeGroups = new Int32Array(b.edges.length * 2);
    // a seam (where a round face of a solid closes on itself: one face on both sides) is no edge to see or pick
    const solid = solidsOf(b.shape).length > 0;
    let at = 0;
    for (let g = 0; g < eg.length; g += 3) {
      const s = eg[g], c = eg[g + 1], j = eh.get(eg[g + 2]), start = at;
      if (solid && j !== undefined && b.edgeFaces[j].length < 2) continue;
      for (let k = 0; k + 1 < c; k++) { for (let q = 0; q < 6; q++) seg[at * 6 + q] = lines[(s + k) * 3 + q]; at++; }
      if (j !== undefined) { edgeGroups[2 * j] = start; edgeGroups[2 * j + 1] = at - start; }
    }
    const vs = vertsOf(b), verts = new Float32Array(vs.length * 3);
    vs.forEach((v, i) => { const p = xyz(T(oc.BRep_Tool.Pnt(v))); verts.set(p, i * 3); });
    const vp = props(b.shape, 'v'), ap = props(b.shape, 'a');
    const faceKinds = b.faces.map(f => surfType(f)), edgeKinds = b.edges.map(e => curveType(e));
    flush();
    const m = { id, pos, nrm, idx, faceGroups, seg: seg.subarray(0, at * 6), edgeGroups, verts, faceKinds, edgeKinds, faceNames: b.names.map(n => n[0]), volume: vp.m, area: ap.m, centroid: vp.c, bbox: bb };
    meshes.set(b, m);
    return m;
  }
  /* ---------- what the page asks of the model as last regenerated ---------- */
  function measure(picks, doc) {
    const S = last.S, out = { items: [] };
    try {
      const shapes = picks.map(p => {
        const b = S.parts.find(x => x.id === p.part);
        if (!b) throw new Error('that part is not there');
        if (p.kind === 'part') return { b, s: b.shape, kind: 'part' };
        if (p.kind === 'face') return { b, s: b.faces[p.index], kind: 'face' };
        if (p.kind === 'edge') return { b, s: edgesOf(b)[p.index], kind: 'edge' };
        return { b, s: vertsOf(b)[p.index], kind: 'vertex' };
      });
      for (const x of shapes) {
        const it = { kind: x.kind, part: x.b.id };
        if (x.kind === 'part') {
          const v = props(x.s, 'v'), a = props(x.s, 'a'), i = S.parts.indexOf(x.b), look = partLook(doc || last.doc, x.b.id, i);
          Object.assign(it, { volume: v.m, area: a.m, centroid: v.c, density: look.density, mass: look.density ? v.m / 1000 * look.density : null, name: look.name, bbox: bbox(x.s) });
        } else if (x.kind === 'face') { const a = props(x.s, 'a'); Object.assign(it, { area: a.m, centroid: a.c, type: surfType(x.s) }); if (it.type === 'cylinder') { const s = T(new oc.BRepAdaptor_Surface(x.s, true)); it.radius = T(s.Cylinder()).Radius(); } if (it.type === 'plane') it.normal = faceFrame(x.s).n; }
        else if (x.kind === 'edge') { const l = props(x.s, 'l'); Object.assign(it, { length: l.m, type: curveType(x.s) }); if (it.type === 'circle') { const c = T(new oc.BRepAdaptor_Curve(x.s)); it.radius = T(c.Circle()).Radius(); } if (it.type === 'line') it.dir = lineOfEdge(x.s).d; }
        else it.pt = xyz(T(oc.BRep_Tool.Pnt(x.s)));
        out.items.push(it);
      }
      if (shapes.length === 2) {
        const d = distance(shapes[0].s, shapes[1].s);
        out.distance = d.d; out.from = d.p; out.to = d.q;
        const [a, b] = out.items, da = a.normal || a.dir, db = b.normal || b.dir;
        if (da && db) { const c = Math.abs(v3.dot(da, db)); out.angle = Math.acos(Math.min(1, a.normal && b.normal ? v3.dot(da, db) : c)) / DEGR; if (a.normal && b.normal) out.angle = 180 - out.angle; }
      }
    } finally { flush(); }
    return out;
  }
  /* the parts as one STEP file (each part a solid of it), or as STL */
  function exportShapes(ids) {
    const S = last.S, bs = ids && ids.length ? S.parts.filter(p => ids.includes(p.id)) : S.parts;
    if (!bs.length) throw new Error('there are no parts to export');
    return bs.length === 1 ? bs[0].shape : compound(bs.map(b => b.shape));
  }
  function exportStep(ids) {
    const shape = exportShapes(ids);
    try {
      oc.Interface_Static.SetCVal('write.step.unit', 'MM'); oc.Interface_Static.SetIVal('write.step.schema', 5);
      const w = T(new oc.STEPControl_Writer());
      w.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, prog());
      if (w.Write('/export.step') !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('the STEP file could not be written');
      const bytes = oc.FS.readFile('/export.step'); oc.FS.unlink('/export.step');
      return bytes;
    } finally { flush(); }
  }
  function exportStl(ids, fine) {
    const shape = exportShapes(ids);
    try {
      const bb = bbox(shape), size = bb ? near(bb[0], bb[1]) : 100;
      T(new oc.BRepMesh_IncrementalMesh(shape, Math.max(0.002, size * (fine ? 2e-4 : 1e-3)), false, fine ? 0.1 : 0.3, false));
      if (!oc.StlAPI.Write(shape, '/export.stl', false)) throw new Error('the STL file could not be written');
      const bytes = oc.FS.readFile('/export.stl'); oc.FS.unlink('/export.stl');
      return bytes;
    } finally { flush(); }
  }
  function refs(picks) { try { return picks.map(p => refOf(last.S, p)); } finally { flush(); } }
  /* an edge flattened onto a plane, as sketch shapes: a line or a circle where it is, else steps */
  function edgeShapes(e, F) {
    const out = [], c = T(new oc.BRepAdaptor_Curve(e)), t0 = c.FirstParameter(), t1 = c.LastParameter(), G = oc.GeomAbs_CurveType;
    if (c.GetType() === G.GeomAbs_Line) return [{ t: 'line', a: toPlane(F, xyz(T(c.Value(t0)))), b: toPlane(F, xyz(T(c.Value(t1)))) }];
    if (c.GetType() === G.GeomAbs_Circle) {
      const ci = T(c.Circle()), ax = xyz(T(T(ci.Axis()).Direction()));
      if (Math.abs(Math.abs(v3.dot(ax, F.n)) - 1) < 1e-6) {
        const cc = toPlane(F, xyz(T(ci.Location()))), r = ci.Radius();
        if (Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6) return [{ t: 'circle', c: cc, r }];
        const pa = toPlane(F, xyz(T(c.Value(t0)))), pb = toPlane(F, xyz(T(c.Value(t1)))), pm = toPlane(F, xyz(T(c.Value((t0 + t1) / 2))));
        let a0 = Math.atan2(pa[1] - cc[1], pa[0] - cc[0]) / DEGR, a1 = Math.atan2(pb[1] - cc[1], pb[0] - cc[0]) / DEGR;
        const am = Math.atan2(pm[1] - cc[1], pm[0] - cc[0]) / DEGR;
        const ccw = ((am - a0) % 360 + 360) % 360 < ((a1 - a0) % 360 + 360) % 360;
        if (!ccw) [a0, a1] = [a1, a0];
        return [{ t: 'arc', c: cc, r, a0, a1 }];
      }
    }
    const n = 16; let prev = toPlane(F, xyz(T(c.Value(t0))));
    for (let k = 1; k <= n; k++) { const q = toPlane(F, xyz(T(c.Value(t0 + (t1 - t0) * k / n)))); out.push({ t: 'line', a: prev, b: q }); prev = q; }
    return out;
  }
  /* where a part (or one face of it) cuts the sketch's plane, as sketch shapes: lines, circles and arcs where the
     cut is one, else short steps */
  function sectionEdges(picks, F) {
    const out = [];
    try {
      const pln = T(new oc.gp_Pln(T(new oc.gp_Ax3(pnt(F.o), gdir(F.n), gdir(F.x)))));
      for (const p of picks) {
        const b = last.S.parts.find(x => x.id === p.part);
        if (!b) continue;
        const sc = T(new oc.BRepAlgoAPI_Section(p.kind === 'face' ? b.faces[p.index] : b.shape, pln, false));
        sc.Build(prog());
        if (!sc.IsDone()) continue;
        for (const e of subShapes(sc.Shape(), TA.TopAbs_EDGE)) out.push(...edgeShapes(e, F));
      }
    } finally { flush(); }
    return out;
  }
  /* model edges flattened onto a sketch's plane, as sketch shapes (Use); one that is a single shape carries its
     edge's ref (src), so the sketch can follow the edge when the model changes */
  function projectEdges(picks, F) {
    const out = [];
    try {
      for (const p of picks) {
        const b = last.S.parts.find(x => x.id === p.part);
        if (!b) continue;
        const es = p.kind === 'edge' ? [edgesOf(b)[p.index]] : p.kind === 'face' ? subShapes(b.faces[p.index], TA.TopAbs_EDGE) : [];
        for (const e of es) {
          const sh = edgeShapes(e, F);
          if (sh.length === 1) { edgesOf(b); const j = p.kind === 'edge' ? p.index : indexer(b.edges)(e); if (j >= 0) { const r = refOf(last.S, { part: b.id, kind: 'edge', index: j }); sh[0].src = { kind: 'edge', part: r.part, faces: r.faces, pt: r.pt }; } }
          out.push(...sh);
        }
      }
    } finally { flush(); }
    return out;
  }
  return { regen, refs, measure, exportStep, exportStl, project: projectEdges, section: sectionEdges, state: () => last.S };
}
