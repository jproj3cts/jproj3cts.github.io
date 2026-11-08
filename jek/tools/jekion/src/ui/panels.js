import { hooks } from '../../../jekray/src/core/hooks.js';
import { fmtEv, fmtMHz, fmtMm, fmtUs, nf, SPECIES, FREQ_UNITS, freqUnitOf } from '../core/units.js';
import { SHAPES, AXES } from '../core/geom.js';
import { BCS, FACES, SYMS } from '../core/grid.js';
import { project, selectedItem, V } from '../state/project.js';
import { checkpoint, gridNodes } from '../state/elements.js';
import { SHAPE_FIELDS } from '../parts/electrodes.js';
import { DISTS } from '../parts/ions.js';
import { END_WORDS } from '../engines/fly.js';
import { checkField, colourField, h, helpLine, numInput, param, readout, rows, section, selectField, setPanelBody, panelClosed } from './panel.js';
import { changed, duplicateSel, removeSel } from './actions.js';
import { SIM, flyNow, trapNow, potentialLine, potentialAtPoints, pickedLine, setPickedLine } from './sim.js';
import { setPointTool } from './pointer.js';
import { toast } from './actions.js';
import { histogram, linePlot, scatter } from './plots.js';
import { arrayBox } from './render.js';

/* ==========================================================================
   The panels: an electrode's, an ion group's, a detector's, and, with nothing selected, the bench's (the array,
   the gas, the magnetic field, flying, display) with the results of the last flight and the trap analysis.
   ========================================================================== */
/* a panel's own choices for a thing (the unit a frequency is shown in), kept while the page lives */
const viewState = new Map();
const vsOf = el => { if (!viewState.has(el.id)) viewState.set(el.id, {}); return viewState.get(el.id); };
const head = (kind, name, onName) => {
  const inp = h('input', { class: 'rt-name ion-pname', type: 'text', value: name, 'aria-label': 'Name', spellcheck: 'false' });
  inp.addEventListener('change', () => { checkpoint(); onName(inp.value.trim().slice(0, 60) || name); changed(true); });
  return h('h2', null, inp, h('span', { class: 'kind' }, kind));
};
const actionsRow = () => h('div', { class: 'rt-actions', style: 'margin-top:0.6rem' },
  h('button', { type: 'button', class: 'rt-btn', onclick: () => duplicateSel(false) }, 'Duplicate'),
  h('button', { type: 'button', class: 'rt-btn', onclick: () => duplicateSel(true), title: 'A copy mirrored through x = 0' }, 'Mirror in x'),
  h('button', { type: 'button', class: 'rt-btn danger', onclick: removeSel }, 'Delete'));
const posFields = (el, isElectrode) => {
  const G = project.grid, items = [param('x (mm)', el, 'x')];
  if (!(G.sym === 'cyl' && isElectrode)) items.push(param(G.sym === 'cyl' ? 'y (mm, off the axis)' : 'y (mm)', el, 'y'));
  if (G.sym === '3d') items.push(param('z (mm)', el, 'z'));
  return items;
};
function electrodePanel(el) {
  const box = document.getElementById('panel');
  box.append(head(SHAPES[el.shape].label, el.name, v => { el.name = v; }));
  const volt = [param('Voltage (V)', el, 'V', { fmt: v => nf(v, 6) }),
    checkField('RF: swing about it', () => el.rf.on, v => { el.rf.on = v; }, { wide: true })];
  if (el.rf.on) {
    // the frequency in the unit that suits it (kept in MHz), the unit changeable: down to single hertz for a slow drive
    const vs0 = vsOf(el), unit = () => vs0.fUnit || freqUnitOf(el.rf.mhz), k = () => FREQ_UNITS.find(u => u[0] === unit())[1];
    volt.push(param('Amplitude (V)', el.rf, 'amp', { min: 0 }),
      h('div', { class: 'rt-f wide' }, h('label', null, 'Frequency'), h('div', { style: 'display:flex;gap:0.3rem' },
        (() => { const inp = numInput(() => el.rf.mhz / k(), v => { el.rf.mhz = Math.max(1e-9, v * k()); }, { fmt: v => nf(v, 6) }); inp.style.flex = '1'; inp.style.minWidth = '0'; return inp; })(),
        (() => { const sel = h('select', { 'aria-label': 'Frequency unit', style: 'width:5.2rem' }, ...FREQ_UNITS.map(u => h('option', { value: u[0] }, u[2]))); sel.value = unit(); sel.addEventListener('change', () => { vs0.fUnit = sel.value; hooks.renderPanel(); }); return sel; })())),
      param('Phase (°)', el.rf, 'phase'));
  }
  box.append(section('Voltage', 'el.volt', [rows(volt), helpLine('The static voltage, and an RF swing added to it.', 'The potential is solved once for the geometry, each electrode at 1 V in turn; a voltage changes nothing but a scale, so the ions fly again at once. The RF term is amp·cos(2πft + φ) on top of the voltage: an electrode of a Paul trap, a quadrupole mass filter, an RF funnel. Electrodes with the same frequency and phase are summed into one array for speed.')]));
  const G = project.grid;
  const geo = [];
  if (el.shape !== 'box' && el.shape !== 'mesh' && G.sym !== 'cyl') geo.push(selectField('Axis', AXES.map(a => [a, a]), () => el.axis, v => { el.axis = v; }));
  for (const [key, , lo, hi, label, unit] of SHAPE_FIELDS[el.shape]) geo.push(param(label + (unit ? ' (' + unit + ')' : ''), el, key, { min: lo, max: hi }));
  if (el.shape === 'mesh' && el.mesh) geo.push(h('p', { class: 'note wide' }, el.mesh.n + ' triangles from ' + (el.mesh.file || 'a CAD file') + ', ' + el.mesh.size.map(v => nf(v, 4)).join(' × ') + ' mm. Its voxels are painted into the array; the cut shows them.'));
  box.append(section('Shape and place', 'el.geo', [rows(posFields(el, true), geo), colourField('Colour', () => el.colour, v => { el.colour = v; }),
    helpLine(G.sym === 'cyl' ? 'In a cylindrical array every electrode is a body of revolution about the x axis.' : 'A body of revolution about its axis, or a box.',
      el.shape === 'ring' ? 'A Paul trap’s ring: its inner face is the hyperboloid r² − 2z² = r₀² about the trap’s centre (this electrode’s position), out to its outer radius, over its height. With endcaps at z₀ = r₀/√2 the potential inside is the ideal quadrupole.'
        : el.shape === 'endcap' ? 'A Paul trap’s endcap on one side (+1 or −1): its face is the hyperboloid 2z² − r² = 2z₀² about the trap’s centre, L tall, out to its outer radius.'
        : 'The grid paints the nodes inside it; a curved face comes out as a staircase, a few per cent off at a coarse spacing. The tests put a cylinder, spheres and a Paul trap against closed forms.')]));
  box.append(section('In the array', 'el.on', [rows(checkField('In the array', () => el.on !== false, v => { el.on = v; }), checkField('Transparent grid: ions pass through it', () => !!el.transparent, v => { el.transparent = v; }, { wide: true, title: 'A mesh of high transmission: it shapes the field as any electrode, but particles fly through it (the grids of a time-of-flight source, a reflectron\u2019s entrance)' }), checkField('Locked in place', () => !!el.locked, v => { el.locked = v; }))], false));
  if (SIM.result) {
    const k = project.electrodes.filter(e => e.on !== false).indexOf(el), hits = SIM.result.particles.filter(p => (p.end.why === 'splat' || p.end.why === 'start') && p.end.el === k);
    box.append(section('Last flight', 'el.res', [readout([['Ions landing on it', hits.length + ' of ' + SIM.result.particles.length], ['Mean energy at impact', hits.length ? fmtEv(hits.reduce((a, p) => a + p.end.ke, 0) / hits.length) : '—']])]));
  }
  box.append(actionsRow());
}
function ionPanel(g) {
  const box = document.getElementById('panel');
  box.append(head('Ion group', g.name, v => { g.name = v; }));
  const spOpts = [...Object.entries(SPECIES).map(([k, s]) => [k, s.label + ' (' + k + ')']), ['custom', 'Custom mass and charge']];
  const what = [selectField('Species', spOpts, () => g.species, v => { g.species = v; if (SPECIES[v]) { g.mass = SPECIES[v].mass; g.charge = SPECIES[v].charge; } }, { wide: true })];
  if (g.species === 'custom') what.push(param('Mass (u)', g, 'mass', { min: 1e-6 }), param('Charge (e)', g, 'charge'));
  what.push(param('Count', g, 'n', { min: 1, max: 5000, fmt: v => String(Math.round(v)) }), param('Energy (eV)', g, 'ke', { min: 0 }), param('Energy spread, FWHM (eV)', g, 'keSpread', { min: 0 }));
  box.append(section('What flies', 'ion.what', [rows(what)]));
  const G = project.grid;
  const where = [...posFields(g, false), selectField('Spread', Object.entries(DISTS), () => g.dist, v => { g.dist = v; }, { wide: true })];
  if (g.dist !== 'point') where.push(param(g.dist === 'gauss' ? 'σ (mm)' : g.dist === 'line' || g.dist === 'grid' ? 'Half-length (mm)' : 'Radius (mm)', g, 'size', { min: 0 }));
  where.push(param('Direction, in the x–y plane (°)', g, 'dirAz'));
  if (G.sym === '3d') where.push(param('Direction, out of the plane (°)', g, 'dirEl'));
  where.push(param('Cone half-angle (°)', g, 'cone', { min: 0, max: 180 }), param('Start time (µs)', g, 't0', { min: 0 }), param('Start spread (µs)', g, 'tSpread', { min: 0 }));
  if (project.fly.spaceCharge) where.push(param('Real charges a particle', g, 'weight', { min: 0 }));
  box.append(section('Where from', 'ion.where', [rows(where), colourField('Colour', () => g.colour, v => { g.colour = v; }),
    helpLine('Each particle starts at the group’s point, spread as chosen, heading along the direction within the cone.', 'The energies are Gaussian about the energy with that FWHM; the directions uniform over the cone’s solid angle; the start times uniform over the spread, so a time-of-flight spectrum shows its source’s width. The same seed gives the same particles each time (Bench settings › Flying).')]));
  box.append(section('In the flight', 'ion.on', [rows(checkField('Flown', () => g.on !== false, v => { g.on = v; }), checkField('Locked in place', () => !!g.locked, v => { g.locked = v; }))], false));
  if (SIM.result) {
    const gi = project.ions.indexOf(g), P = SIM.result.particles.filter(p => p.group === gi);
    if (P.length) {
      const ends = {}; for (const p of P) ends[p.end.why] = (ends[p.end.why] || 0) + 1;
      box.append(section('Last flight', 'ion.res', [readout(Object.entries(ends).map(([w, n]) => [END_WORDS[w] || w, n + ' of ' + P.length])),
        histogram(P.map(p => p.end.ke), { title: 'Energy at the end', unit: 'eV', colour: g.colour }), histogram(P.map(p => p.end.t - p.t0), { title: 'Time flown', unit: 'µs', colour: g.colour })]));
    }
  }
  box.append(actionsRow());
}
function detectorPanel(d) {
  const box = document.getElementById('panel');
  box.append(head('Detector', d.name, v => { d.name = v; }));
  const G = project.grid;
  const where = [selectField('Across', AXES.map(a => [a, 'the ' + a + ' axis']), () => d.axis, v => { d.axis = v; d.at = d[v]; }), ...posFields(d, false).map(f => { const inp = f.querySelector('input'); inp.addEventListener('input', () => { d.at = d[d.axis]; }); return f; }),
    param('Half-width (mm, 0: no edges)', d, 'half', { min: 0 }), checkField('Stops the ions it catches', () => d.stop, v => { d.stop = v; }, { wide: true })];
  box.append(section('Where', 'det.where', [rows(where), colourField('Colour', () => d.colour, v => { d.colour = v; }),
    helpLine('A plane across one axis, recording every crossing.', 'Each particle through it is recorded with its position, time, energy and direction; a detector that stops them is a screen or a multiplier’s face, one that does not is a slice through the beam (a phase space at that plane). The export has the records; the plots below the spot, the time-of-flight spectrum and the energy spectrum.')]));
  box.append(section('In the flight', 'det.on', [rows(checkField('Active', () => d.on !== false, v => { d.on = v; }), checkField('Locked in place', () => !!d.locked, v => { d.locked = v; }))], false));
  if (SIM.result) {
    const di = project.detectors.filter(x => x.on !== false).indexOf(d), hits = SIM.result.particles.flatMap(p => p.hits.filter(hh => hh.det === di).map(hh => Object.assign({ p }, hh)));
    const [u, v] = d.axis === 'x' ? ['y', 'z'] : d.axis === 'y' ? ['x', 'z'] : ['x', 'y'];
    const tofs = hits.map(hh => hh.t), kes = hits.map(hh => hh.ke);
    const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN), sd = a => (a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0);
    box.append(section('Last flight', 'det.res', [readout([['Hits', hits.length + ' of ' + SIM.result.particles.length + ' ions'], ['Mean time of flight', hits.length ? fmtUs(mean(tofs)) : '—'], ['Spread (σ)', hits.length > 1 ? fmtUs(sd(tofs)) : '—'], ['Mean energy', hits.length ? fmtEv(mean(kes)) : '—'],
      ['Spot (rms radius)', hits.length ? fmtMm(Math.sqrt(mean(hits.map(hh => (hh[u] - mean(hits.map(q => q[u]))) ** 2 + (hh[v] - mean(hits.map(q => q[v]))) ** 2)))) : '—']]),
      G.sym === 'cyl' && d.axis === 'x' ? scatter(hits.map(hh => hh.y), hits.map(hh => hh.z), { title: d.name + ' spot', xl: 'y (mm)', yl: 'z (mm)', colours: hits.map(hh => hh.p.colour) }) : scatter(hits.map(hh => hh[u]), hits.map(hh => hh[v]), { title: d.name + ' spot', xl: u + ' (mm)', yl: v + ' (mm)', colours: hits.map(hh => hh.p.colour) }),
      histogram(tofs, { title: d.name + ' time of flight', unit: 'µs' }), histogram(kes, { title: d.name + ' energy', unit: 'eV' })]));
  }
  box.append(actionsRow());
}
function benchPanel() {
  const box = document.getElementById('panel'), G = project.grid;
  box.append(h('h2', null, h('span', { class: 'kind' }, 'Bench'), project.name));
  // the array
  const nodes = gridNodes(G), tooMany = nodes > 2e6;
  const arr = [selectField('Symmetry', Object.entries(SYMS), () => G.sym, v => { G.sym = v; if (v !== '3d') { V().plane = 'xy'; V().slice = 0; } if (v === 'cyl') for (const e of project.electrodes) { e.y = 0; e.axis = 'x'; e.z = 0; } if (v !== '3d') { for (const e of project.electrodes) e.z = 0; for (const e of project.ions) { e.z = 0; e.dirEl = 0; } } }, { wide: true }),
    param('Spacing h (mm)', G, 'h', { min: 1e-4, commit: true }), h('p', { class: 'note' }, nodes.toLocaleString() + ' nodes' + (tooMany ? ': a coarser spacing would solve faster' : '')),
    param('x from (mm)', G, 'x0', { commit: true }), param('x to (mm)', G, 'x1', { commit: true })];
  if (G.sym === 'cyl') arr.push(param('r to (mm)', G, 'y1', { min: 1e-3, commit: true })); else arr.push(param('y from (mm)', G, 'y0', { commit: true }), param('y to (mm)', G, 'y1', { commit: true }));
  if (G.sym === '3d') arr.push(param('z from (mm)', G, 'z0', { commit: true }), param('z to (mm)', G, 'z1', { commit: true }));
  const faces = FACES.filter(f => G.sym === '3d' || (f !== 'zlo' && f !== 'zhi' && !(G.sym === 'cyl' && f === 'ylo')));
  for (const f of faces) arr.push(selectField({ xlo: 'x low edge', xhi: 'x high edge', ylo: 'y low edge', yhi: G.sym === 'cyl' ? 'r outer edge' : 'y high edge', zlo: 'z low edge', zhi: 'z high edge' }[f], Object.entries(BCS), () => G.bc[f], v => { G.bc[f] = v; }));
  arr.push(h('button', { type: 'button', class: 'rt-btn wide', onclick: () => { checkpoint(); fitArray(); changed(true); } }, 'Fit the array round the electrodes'));
  box.append(section('The array', 'bench.array', [rows(arr), helpLine('The grid the potential is solved on: its symmetry, spacing, extent and edges.', 'Planar: the x–y plane, every electrode running the same along z without end (a slit lens, a sector). Cylindrical: x is an axis of symmetry and y the radius, so a tube lens or a Paul trap is solved in two dimensions, exactly. Three dimensions: everything, at the cost of the cube of the spacing. An open edge lets the field run out flat (∂φ/∂n = 0); a grounded edge is a wall at 0 V; a mirror edge is a plane of symmetry, so half a symmetric system can be solved.')]));
  // the gas
  const gas = project.gas;
  const gasF = [checkField('Background gas', () => gas.on, v => { gas.on = v; }, { wide: true })];
  if (gas.on) gasF.push(param('Gas mass (u)', gas, 'mass', { min: 1e-3 }), param('Pressure (Pa)', gas, 'pressure', { min: 0 }), param('Temperature (K)', gas, 'temp', { min: 1 }), param('Cross-section (Å²)', gas, 'sigma', { min: 0 }));
  box.append(section('Background gas', 'bench.gas', [rows(gasF), helpLine('Hard-sphere collisions with a gas at rest in the array.', 'At each step a gas molecule is drawn from the Maxwell distribution at the temperature, and the chance of a collision in the step is 1 − exp(−nσv_rel dt) with n the number density P/kT. A collision is elastic and isotropic in the centre-of-mass frame. Helium at a few pascals cools ions in a trap in milliseconds; 1 Pa is 7.5 mTorr.')], false));
  // the magnetic field
  const B = project.bfield;
  box.append(section('Magnetic field', 'bench.b', [rows(param('Bx (gauss)', B, 'bx'), param('By (gauss)', B, 'by'), param('Bz (gauss)', B, 'bz')), helpLine('A uniform field over the whole array, in gauss (10⁴ gauss = 1 T).', 'The force q v × B bends every path: a Penning trap’s field, a magnetic sector’s. The trap analysis gives the cyclotron, modified cyclotron and magnetron frequencies when the field is on and no electrode has RF.')], false));
  // flying
  const F = project.fly;
  box.append(section('Flying', 'bench.fly', [rows(param('Time limit (µs)', F, 'tMax', { min: 1e-6 }), param('Step (grid cells)', F, 'quality', { min: 0.05, max: 2 }), param('Points kept a path', F, 'maxPts', { min: 200, max: 20000, fmt: v => String(Math.round(v)) }), param('Random seed', F, 'seed', { min: 1, fmt: v => String(Math.round(v)) }),
    checkField('Space charge (Coulomb repulsion)', () => F.spaceCharge, v => { F.spaceCharge = v; }, { wide: true }), checkField('Fly after every change', () => F.auto, v => { F.auto = v; }, { wide: true, rebuild: false })),
    h('div', { class: 'rt-actions', style: 'margin-top:0.5rem' }, h('button', { type: 'button', class: 'rt-btn primary', onclick: () => flyNow() }, 'Fly the ions')),
    helpLine('An adaptive Runge–Kutta step, never longer than the chosen fraction of a grid cell, nor a fortieth of an RF period.', 'The step is Dormand–Prince 5(4); its error estimate shortens the step where the field changes quickly. With space charge on, every particle flies on one clock and feels the Coulomb field of the others, each standing for its group’s weight in real charges; softened within half a cell.')]));
  // the species and analysis point
  const sp = project.species;
  const spOpts = [...Object.entries(SPECIES).map(([k, s]) => [k, s.label + ' (' + k + ')']), ['custom', 'Custom']];
  const spF = [selectField('Species for the analysis', spOpts, () => (SPECIES[sp.name] ? sp.name : 'custom'), v => { sp.name = v; if (SPECIES[v]) { sp.mass = SPECIES[v].mass; sp.charge = SPECIES[v].charge; } }, { wide: true })];
  if (!SPECIES[sp.name]) spF.push(param('Mass (u)', sp, 'mass', { min: 1e-6 }), param('Charge (e)', sp, 'charge'));
  spF.push(h('p', { class: 'note' }, project.point ? 'Analysis point at ' + project.point.map(v => nf(v, 4)).join(', ') + ' mm (right-click the bench to move it).' : 'Analysis point: the array’s centre (right-click the bench to set one).'));
  box.append(section('Trap analysis', 'bench.trap', [rows(spF), trapBlock(), h('div', { class: 'rt-actions', style: 'margin-top:0.4rem' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => trapNow().then(() => hooks.renderPanel()) }, 'Analyse now'))]));
  // potential plots
  box.append(potentialSection());
  // display
  const S = project.show;
  // the display: the View menu holds the toggles (cut plane, potential, |E|, paths and their colouring, the outline); here only the numbers
  box.append(section('Display', 'bench.show', [rows(param('Equipotentials', S, 'contours', { min: 2, max: 200, fmt: v => String(Math.round(v)) }), G.sym === '3d' ? param('Cut at (mm)', V(), 'slice') : null)], false));
  // results
  if (SIM.result) box.append(resultsSection());
}
/* the array's box set round the electrodes, with a margin */
export function fitArray() {
  const G = project.grid, els = project.electrodes.filter(e => e.on !== false);
  if (!els.length) return;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const el of els) { const [a, b] = hooks.ionBounds(el); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], b[k]); } }
  const m = Math.max(2 * G.h, 0.15 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
  G.x0 = +(lo[0] - m).toPrecision(6); G.x1 = +(hi[0] + m).toPrecision(6);
  if (G.sym === 'cyl') { G.y0 = 0; G.y1 = +(Math.max(Math.abs(lo[1]), Math.abs(hi[1]), Math.abs(lo[2]), Math.abs(hi[2])) + m).toPrecision(6); }
  else { G.y0 = +(lo[1] - m).toPrecision(6); G.y1 = +(hi[1] + m).toPrecision(6); }
  if (G.sym === '3d') { G.z0 = +(lo[2] - m).toPrecision(6); G.z1 = +(hi[2] + m).toPrecision(6); }
}
/* ---------- potential plots ----------
   The potential along the axis, across it at an x, along a line picked with two clicks on the bench, or along a flown
   particle's path against time; the last one asked for is drawn again when the panel is rebuilt. */
let potPlot = null;                 // { kind: 'axis' | 'across' | 'line' | 'path', x, a, b, gi, i }
export function setPotPlot(v) { potPlot = v; hooks.renderPanel(); }
function potentialSection() {
  const G = project.grid, out = h('div'), plotBox = h('div');
  const [u0, u1] = arrayBox(), yMid = G.sym === 'cyl' ? 0 : (G.y0 + G.y1) / 2, zMid = G.sym === '3d' ? (G.z0 + G.z1) / 2 : 0;
  const across = { x: potPlot && potPlot.kind === 'across' ? potPlot.x : +(((G.x0 + G.x1) / 2).toPrecision(4)) };
  const btn = (label, title, fn) => h('button', { type: 'button', class: 'rt-btn', title, onclick: fn }, label);
  const acts = h('div', { class: 'rt-actions', style: 'margin:0.3rem 0 0.5rem' },
    btn('Along the x axis', 'The potential along y = ' + nf(yMid, 3) + ', z = ' + nf(zMid, 3) + ' from one edge of the array to the other', () => setPotPlot({ kind: 'axis' })),
    btn('Across, at x', 'The potential along y (the radius, in a cylindrical array) at the x given', () => setPotPlot({ kind: 'across', x: across.x })),
    btn('Along a line…', 'Click two points on the bench: the potential along the line between them', () => { setPotPlot(null); toast('Click two points on the bench (Shift: not snapped; Esc: never mind)'); setPointTool({ n: 2, pts: [], done: pts => { setPickedLine({ a: pts[0], b: pts[1] }); setPotPlot({ kind: 'line', a: pts[0], b: pts[1] }); } }); }));
  out.append(rows(param('x for the plot across (mm)', across, 'x', { after: v => { if (potPlot && potPlot.kind === 'across') potPlot.x = v; } })), acts);
  if (SIM.result && SIM.result.particles.length) {
    const ps = SIM.result.particles.slice(0, 200), sel = selectField('Along a particle\u2019s path', ps.map((p, k) => [String(k), ((project.ions[p.group] || {}).name || p.group) + ' #' + p.i]), () => String(potPlot && potPlot.kind === 'path' ? potPlot.k : 0), v => { setPotPlot({ kind: 'path', k: +v }); }, { wide: true, rebuild: false });
    out.append(rows(sel), h('div', { class: 'rt-actions', style: 'margin:0.3rem 0 0.5rem' }, btn('Plot along the path', 'The potential the particle saw, against time', () => setPotPlot({ kind: 'path', k: +sel.querySelector('select').value }))));
  }
  out.append(plotBox);
  if (potPlot) drawPotPlot(potPlot, plotBox, u0, u1, yMid, zMid);
  else if (pickedLine) setPickedLine(null);
  out.append(helpLine('The potential between the nodes, interpolated as the ions see it.', 'Along the axis and across it the line runs from edge to edge of the array; a picked line is kept on the bench (dashed) until another plot is asked for. A line is plotted at t = 0, an RF electrode at its peak. A particle\u2019s path gives the potential at each kept point of it, at the time it was there, against time, so a trap\u2019s RF shows as the swing and an electrode\u2019s voltage as the step it climbs.'));
  return section('Potential plots', 'bench.pot', [out], true);
}
const rfNote = () => (project.electrodes.some(e => e.on !== false && e.rf && e.rf.on) ? ', at t = 0 (the RF at its peak)' : '');
async function drawPotPlot(spec, box, u0, u1, yMid, zMid) {
  box.replaceChildren(h('p', { class: 'note' }, 'Plotting\u2026'));
  try {
    if (spec.kind === 'axis') { const L = await potentialLine([u0, yMid, zMid], [u1, yMid, zMid], 400); if (L && potPlot === spec) box.replaceChildren(linePlot(L.s.map(s => u0 + s), L.v, { title: 'Potential along the x axis', xl: 'x (mm)', yl: 'V', note: 'along y = ' + nf(yMid, 3) + ', z = ' + nf(zMid, 3) + rfNote() })); }
    else if (spec.kind === 'across') { const G = project.grid, lo = G.sym === 'cyl' ? -G.y1 : G.y0, hi = G.y1; const L = await potentialLine([spec.x, lo, zMid], [spec.x, hi, zMid], 400); if (L && potPlot === spec) box.replaceChildren(linePlot(L.s.map(s => lo + s), L.v, { title: 'Potential across, at x = ' + nf(spec.x, 4) + ' mm', xl: (G.sym === 'cyl' ? 'r' : 'y') + ' (mm)', yl: 'V', note: 'at x = ' + nf(spec.x, 4) + ', z = ' + nf(zMid, 3) + rfNote() })); }
    else if (spec.kind === 'line') { const L = await potentialLine(spec.a, spec.b, 400); if (L && potPlot === spec) box.replaceChildren(linePlot(L.s, L.v, { title: 'Potential along the line', xl: 'distance (mm)', yl: 'V', note: 'from ' + spec.a.map(v => nf(v, 4)).join(', ') + ' to ' + spec.b.map(v => nf(v, 4)).join(', ') + rfNote() })); if (!pickedLine) setPickedLine({ a: spec.a, b: spec.b }); }
    else if (spec.kind === 'path') {
      const p = SIM.result && SIM.result.particles[spec.k]; if (!p) { box.replaceChildren(); return; }
      const pts = [], ts = []; for (let i = 0; i < p.pts.length; i += 4) { pts.push([p.pts[i], p.pts[i + 1], p.pts[i + 2]]); ts.push(p.pts[i + 3]); }
      // the potential at the time it was there (an RF electrode swings): one request a time
      const vs = []; for (let i = 0; i < pts.length; i += 400) { const R = await potentialAtPoints(pts.slice(i, i + 400), 0, ts.slice(i, i + 400)); if (!R) return; vs.push(...R.v); }
      if (potPlot === spec) box.replaceChildren(linePlot(ts, vs, { title: 'Potential along the path of ' + ((project.ions[p.group] || {}).name || p.group) + ' #' + p.i, xl: 't (\u00b5s)', yl: 'V', note: 'the potential at each kept point of the path, at the time it was there; ' + (p.end ? END_WORDS[p.end.why] : '') }));
    }
  } catch (err) { box.replaceChildren(h('p', { class: 'note' }, 'Could not plot: ' + err.message)); }
}
/* the trap analysis as a block (the dialog shows the same) */
export function trapBlock() {
  const T = SIM.trap;
  if (!T) return h('p', { class: 'note' }, 'Fly, or press Analyse, for the Mathieu parameters, stability and frequencies at the analysis point.');
  const stab = ok => h('span', { class: 'ion-stab ' + (ok ? 'ok' : 'no') }, ok ? 'stable' : 'unstable');
  const tbl = h('table', { class: 'ion-table' });
  if (T.rf.length) {
    tbl.append(h('tr', null, h('th', null, 'Axis'), h('th', null, 'a'), h('th', null, 'q'), h('th', null, 'β'), h('th', null, 'Secular'), h('th', null, '')));
    for (const a of T.axes) tbl.append(h('tr', null, h('td', null, a.axis), h('td', { class: 'n' }, nf(a.a, 3)), h('td', { class: 'n' }, nf(a.q, 3)), h('td', { class: 'n' }, nf(a.beta, 3)), h('td', { class: 'n' }, fmtMHz(a.secMHz)), h('td', null, stab(a.stable))));
  } else {
    tbl.append(h('tr', null, h('th', null, 'Axis'), h('th', null, '∂²φ/∂x² (V/mm²)'), h('th', null, 'Harmonic'), h('th', null, '')));
    for (const a of T.axes) tbl.append(h('tr', null, h('td', null, a.axis), h('td', { class: 'n' }, nf(a.dc, 4)), h('td', { class: 'n' }, a.harmMHz === null ? 'anti-trapping' : fmtMHz(a.harmMHz)), h('td', null, stab(a.stable))));
  }
  const out = h('div', { class: 'ion-res' }, h('p', { class: 'note' }, 'At ' + T.point.map(v => nf(v, 4)).join(', ') + ' mm for ' + (project.species.name || 'm = ' + nf(T.species.mass) + ' u') + ': |E| = ' + nf(T.Emag, 3) + ' V/mm' + (T.rf.length ? ', RF at ' + T.rf.map(fmtMHz).join(', ') : '') + '.'), tbl);
  if (T.penning) out.append(readout([['Cyclotron', fmtMHz(T.penning.cyclMHz)], ['Axial', T.penning.axialMHz === null ? 'not confining' : fmtMHz(T.penning.axialMHz)], ['Modified cyclotron', T.penning.plusMHz === null ? '—' : fmtMHz(T.penning.plusMHz)], ['Magnetron', T.penning.minusMHz === null ? '—' : fmtMHz(T.penning.minusMHz)], ['Penning trap', T.penning.stable ? 'stable (ωc² > 2ωz²)' : 'unstable']]));
  out.append(helpLine(T.rf.length ? 'Mathieu parameters from the field’s curvature: a from the static potential, q from the RF amplitude.' : 'The static potential’s curvature along each axis; a magnetic field adds the Penning frequencies.',
    'a_i = 4(q/m)∂²φ_dc/∂x_i² / Ω² and q_i = −2(q/m)∂²φ_rf/∂x_i² / Ω², the second derivatives by a five-point difference at the node nearest the point. β ≈ √(a + q²/2) and the secular frequency βΩ/2, good while a and q are small; stable in the first region while 0 < β < 1 and |q| < 0.908. In an ideal Paul trap the two transverse q are equal and the axial one twice as large with the opposite sign.'));
  return out;
}
function resultsSection() {
  const R = SIM.result, P = R.particles, n = P.length;
  const ends = {}; for (const p of P) ends[p.end.why] = (ends[p.end.why] || 0) + 1;
  const colours = { det: '#2a7de8', splat: '#d33', start: '#d33', out: '#999', time: '#e0a020' };
  const bar = h('div', { class: 'ion-bar' }, ...Object.entries(ends).map(([w, k]) => h('span', { style: 'width:' + (100 * k / n) + '%;background:' + colours[w], title: END_WORDS[w] + ': ' + k })));
  const live = project.electrodes.filter(e => e.on !== false), perEl = live.map((el, k) => [el, P.filter(p => (p.end.why === 'splat' || p.end.why === 'start') && p.end.el === k).length]).filter(x => x[1]);
  const body = [h('div', { class: 'ion-res' }, readout([['Ions flown', n + ' in ' + nf(R.ms / 1000, 2) + ' s'], ...Object.entries(ends).map(([w, k]) => [END_WORDS[w], k + ' (' + nf(100 * k / n, 3) + '%)'])]), bar)];
  if (perEl.length) body.push(h('table', { class: 'ion-table' }, h('tr', null, h('th', null, 'Electrode'), h('th', null, 'Hit by')), ...perEl.map(([el, k]) => h('tr', null, h('td', null, h('span', { class: 'ion-sw', style: 'background:' + el.colour }), el.name), h('td', { class: 'n' }, String(k))))));
  if (n >= 3) body.push(histogram(P.map(p => p.end.t), { title: 'Time at the end', unit: '\u00b5s' }));    // a spread needs a few
  return section('Results of the last flight', 'bench.res', body);
}
/* what the panel shows: the selection's panel, else the bench's unless it was put away */
function body() {
  const s = selectedItem();
  if (s) { (s.kind === 'electrode' ? electrodePanel : s.kind === 'ion' ? ionPanel : detectorPanel)(s.el); return 'sel'; }
  if (panelClosed) return false;
  benchPanel();
  return 'bench';
}
export function wirePanels() {
  setPanelBody(body);
  document.getElementById('btnTrap').addEventListener('click', async () => {
    const T = await trapNow();
    const dlg = document.getElementById('trapDialog'), b = document.getElementById('trapBody');
    b.replaceChildren(T ? trapBlock() : h('p', null, 'Nothing to analyse yet: add electrodes first.'));
    dlg.showModal();
  });
  document.getElementById('trapClose').addEventListener('click', () => document.getElementById('trapDialog').close());
}
