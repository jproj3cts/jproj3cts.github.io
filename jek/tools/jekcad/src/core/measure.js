import { fmtNum } from './units.js';

/* ==========================================================================
   What the measure readout says of a selection (pure: the kernel's measurement in, labelled values out).
   m: { items: [{ kind, … }], distance, from, to, angle } as the kernel measures one pick or several. Each item is a
   part, a face (a plane with its normal and middle; a cylinder with its axis and radius), an edge (a line with a
   point and its direction; a circle with its centre and axis) or a corner. The readout leads with the one value
   most likely wanted: between two faces that are parallel, how far apart they are; of one round thing, its
   diameter; of one edge, its length. The rest follow: the least distance and its parts along x, y and z, the
   distance between centres, the angle, totals of the lengths and areas chosen, then each thing's own numbers.
   { head: [label, text, value], rows: [[label, text, value] | [heading]] }
   ========================================================================== */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len3 = a => Math.hypot(a[0], a[1], a[2]);
const mm = v => fmtNum(v, 3) + ' mm', mm2 = v => fmtNum(v, 3) + ' mm²', deg1 = v => fmtNum(v, 3) + '°';
const PAR = 1e-6;
/* how a thing lies, for telling what is parallel to what: a plane (n, p), a line (d, p; round: an axis), a point (p) */
function lieOf(it) {
  if (it.kind === 'face' && it.type === 'plane' && it.normal && it.centroid) return { t: 'plane', n: it.normal, p: it.centroid };
  if (it.kind === 'face' && it.axis) return { t: 'line', d: it.axis.d, p: it.axis.p, round: true };
  if (it.kind === 'edge' && it.type === 'line' && it.dir && it.at) return { t: 'line', d: it.dir, p: it.at };
  if (it.kind === 'edge' && it.axis) return { t: 'line', d: it.axis.d, p: it.axis.p, round: true, centre: it.axis.p };
  if (it.kind === 'vertex' && it.pt) return { t: 'point', p: it.pt };
  return null;
}
const offLine = (L, q) => { const v = sub(q, L.p), a = dot3(v, L.d); return len3([v[0] - a * L.d[0], v[1] - a * L.d[1], v[2] - a * L.d[2]]); };
const itemName = it => (it.kind === 'part' ? it.name || 'Part' : it.kind === 'face' ? 'Face (' + it.type + ')' : it.kind === 'edge' ? 'Edge (' + it.type + ')' : 'Vertex');
/* one thing's own numbers */
function ownRows(it) {
  const R = [];
  if (it.kind === 'part') R.push(['Volume', fmtNum(it.volume, 3) + ' mm³', it.volume], ['Surface area', mm2(it.area), it.area], ['Mass', it.mass !== null && it.mass !== undefined ? fmtNum(it.mass, 3) + ' g (' + it.density + ' g/cm³)' : 'choose a material', it.mass], ['Centre of mass', it.centroid.map(v => fmtNum(v, 3)).join(', ')]);
  else if (it.kind === 'face') { R.push(['Area', mm2(it.area), it.area]); if (it.radius) R.push(['Diameter', mm(2 * it.radius), 2 * it.radius], ['Radius', mm(it.radius), it.radius]); }
  else if (it.kind === 'edge') { R.push(['Length', mm(it.length), it.length]); if (it.radius) R.push(['Diameter', mm(2 * it.radius), 2 * it.radius], ['Radius', mm(it.radius), it.radius]); if (it.axis) R.push(['Centre', it.axis.p.map(v => fmtNum(v, 3)).join(', ')]); }
  else if (it.pt) R.push(['X', mm(it.pt[0]), it.pt[0]], ['Y', mm(it.pt[1]), it.pt[1]], ['Z', mm(it.pt[2]), it.pt[2]]);
  return R;
}
export function measureReadout(m) {
  const items = (m && m.items) || [], rows = [];
  if (!items.length) return null;
  let head = null;
  if (items.length === 1) {
    const it = items[0], own = ownRows(it);
    // of one thing: a round one's diameter, an edge's length, a face's area, a part's volume, a corner's place
    head = it.radius ? own.find(r => r[0] === 'Diameter') : it.kind === 'vertex' ? ['Point', it.pt.map(v => fmtNum(v, 3)).join(', ')] : own[0];
    rows.push([itemName(it)], ...own);
    return { head, rows };
  }
  if (items.length === 2) {
    const [a, b] = items, A = lieOf(a), B = lieOf(b);
    let par = null, centre = null, ang = m.angle;
    if (A && B) {
      const P = A.t === 'plane' ? A : B.t === 'plane' ? B : null, O = P === A ? B : A;
      if (A.t === 'plane' && B.t === 'plane') { if (Math.abs(Math.abs(dot3(A.n, B.n)) - 1) < PAR) par = Math.abs(dot3(sub(B.p, A.p), A.n)); }
      else if (P && O.t === 'line') { const c = Math.abs(dot3(P.n, O.d)); if (c < PAR) par = Math.abs(dot3(sub(O.p, P.p), P.n)); else if (ang === undefined) ang = Math.asin(Math.min(1, c)) * 180 / Math.PI; }
      else if (P && O.t === 'point') par = Math.abs(dot3(sub(O.p, P.p), P.n));
      else if (A.t === 'line' && B.t === 'line') {
        if (Math.abs(Math.abs(dot3(A.d, B.d)) - 1) < PAR) { const d = offLine(A, B.p); if (A.round && B.round) centre = d; else par = d; }
        else if (ang === undefined) ang = Math.acos(Math.min(1, Math.abs(dot3(A.d, B.d)))) * 180 / Math.PI;
        // two round edges: their centres, whichever way their axes run
        if (centre === null && A.centre && B.centre) centre = len3(sub(A.centre, B.centre));
      }
      else if (A.t === 'line' && B.t === 'point') { const d = offLine(A, B.p); if (A.round) centre = d; else par = d; }
      else if (A.t === 'point' && B.t === 'line') { const d = offLine(B, A.p); if (B.round) centre = d; else par = d; }
    }
    if (par !== null) rows.push(['Parallel distance', mm(par), par]);
    if (centre !== null) rows.push(['Centre distance', mm(centre), centre]);
    if (m.distance !== undefined) {
      rows.push(['Minimum distance', mm(m.distance), m.distance]);
      if (m.from && m.to) { const d = sub(m.to, m.from).map(Math.abs); rows.push(['dX', mm(d[0]), d[0]], ['dY', mm(d[1]), d[1]], ['dZ', mm(d[2]), d[2]]); }
    }
    // (between things that are parallel there is no angle to tell)
    if (ang !== undefined && !(Math.abs(ang) < 1e-6 || Math.abs(ang - 180) < 1e-6)) rows.push(['Angle', deg1(ang), ang]);
    head = rows[0] || null;
  }
  // totals of what is chosen: every edge's length, every face's area
  const edges = items.filter(it => it.kind === 'edge'), faces = items.filter(it => it.kind === 'face');
  if (edges.length > 1) { const t = edges.reduce((s, it) => s + it.length, 0); rows.push(['Total length', mm(t), t]); }
  if (faces.length > 1) { const t = faces.reduce((s, it) => s + it.area, 0); rows.push(['Total area', mm2(t), t]); }
  if (!head) head = rows[0] || [items.length + ' things chosen', ''];
  for (const it of items) rows.push([itemName(it)], ...ownRows(it));
  return { head, rows };
}
