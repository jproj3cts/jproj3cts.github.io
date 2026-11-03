import { fmtFs, fmtLen } from '../../core/format.js';
import { FIBRE_NG, cohGamma, lagOf, splitChain, splitRoot } from '../../core/coherence.js';
import { applyPulse, gsmModes, m2Of } from '../../core/pulses.js';
import { fanFromGauss, isHigherMode, lgComps, modeM2 } from '../../core/beams-hom.js';
import { wavelengthColour } from '../../core/colour.js';
import { fanEdgeAuto } from '../../core/fan-edge.js';
import { V, project } from '../../state/project.js';
import { getEl, lampFootprint, lampRaysOf, lightOf, srcBody } from '../../state/elements.js';
import { frame } from '../../core/mask.js';
import { RAY_PATTERNS, rayPattern } from '../../engines/trace.js';
import { bodyFill, ctx, drawHorn, getCss, pathLocal, selInk, sx, sy } from '../render.js';
import { applyFibre } from '../../engines/fibre-face.js';
import {
  beginEdit, bindSync, coherenceFields, coherenceNote, endEdit, fid, grid2, h, panel, param, renderPanel,
  selectField, setFid, textField, helpLine
} from '../panel.js';
import { pulseLine, pulseToggle } from '../panels.js';
import { gaussFromFan } from '../../engines/cavity.js';
import { popNote } from '../heavy.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Source on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/source.js */

/* a Lamp: its shape seen from above at its size (a circle, or a tube's rectangle), filled with its light, and short
   strokes round it for its glow; drawn at least a few pixels across, so a millimetre's lamp can be found and picked */
const LAMP_MIN_PX = 5;
function lampHalf(el) {
  const k = 1 / V().scale, m = LAMP_MIN_PX * k, F = lampFootprint(el);
  return [Math.max(F.a, m), Math.max(F.b, m), F.round];
}
function drawLamp(el, sel) {
  const f = frame(el), [a, b, round] = lampHalf(el), k = 1 / V().scale;
  ctx.save();
  if (!round) pathLocal(f, [[a, -b], [a, b], [-a, b], [-a, -b]], true);
  else { ctx.beginPath(); ctx.arc(sx(el.x), sy(el.y), a * V().scale, 0, 2 * Math.PI); }
  ctx.fillStyle = el.colour; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;            // its light, gently: a lit surface, not a glare
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-source'); ctx.lineWidth = sel ? 2 : 1.5; ctx.stroke();
  // the glow: eight short strokes out from the outline
  ctx.strokeStyle = el.colour; ctx.lineWidth = 1.5; ctx.beginPath();
  const g0 = 3 * k, g1 = 7 * k;
  for (let i = 0; i < 8; i++) {
    const t = i * Math.PI / 4, c = Math.cos(t), s = Math.sin(t);
    // from the outline's edge in that direction (a rectangle's, or the circle's)
    const e = !round ? Math.min(Math.abs(c) > 1e-9 ? a / Math.abs(c) : Infinity, Math.abs(s) > 1e-9 ? b / Math.abs(s) : Infinity) : a;
    pathLocal(f, [[c * (e + g0), s * (e + g0)], [c * (e + g1), s * (e + g1)]]);
    ctx.stroke(); ctx.beginPath();
  }
  ctx.restore();
}
/* a Circular lamp: a point shining round the bench plane only, the quick flat fan of a 2D bench */
/* a light's more wavelengths, for white light: typed, beside a list of the usual sets (each fires the same rays) */
const WL_SETS = [['', 'None'], ['486.1,656.3', 'F and C lines'], ['450,550,650', 'Visible (3)'], ['1530,1565', 'Telecom C-band']];
function wlPair(el) {
  const txt = textField('More wavelengths', () => el.lines.join(', '), v => {
    const a = v.split(/[,;\s]+/).filter(Boolean).map(Number);
    if (a.every(q => isFinite(q) && q >= 100 && q <= 20000)) el.lines = a.slice(0, 12);
  }, { placeholder: 'nm, as 486, 656' });
  txt.title = 'Wavelengths besides the first (nm), comma separated: each fires the same rays, so chromatic focal shift and lateral colour show directly';
  const cur = el.lines.join(','), known = WL_SETS.some(q => q[0] === cur);
  const pre = selectField('Or a set', known ? WL_SETS : [['custom', 'Typed'], ...WL_SETS], () => (known ? cur : 'custom'), v => {
    if (v !== 'custom') el.lines = v ? v.split(',').map(Number) : [];
  });
  return [txt, pre];
}
function flatLampPanel(el) {
  panel.append(h('h3', null, 'Circular lamp'));
  panel.append(grid2(param('Wavelength (nm)', el, 'wavelength'), param('Power (mW)', el, 'power')),
    grid2(param('Rays round it', el, 'rays'), h('span')), grid2(wlPair(el)));
  panel.append(helpLine('A point shining round the bench plane only: quick, for 2D benches.', ['A point whose rays leave round the bench plane only, 360° over their number apart, the first along its direction: the plain fan of a 2D bench, traced quickly. For light every way, from a lamp with a shape and size, use the Lamp. Its power is shared by its rays, so a detector reads the share that reaches it.'], 'note', 'margin-top:0.2rem'));
}
function lampPanel(el) {
  if (el.lampFlat) return flatLampPanel(el);
  // its shape and size
  panel.append(h('h3', null, 'Lamp'));
  panel.append(grid2(selectField('Shape', [['sphere', 'Sphere'], ['cylinder', 'Cylinder']], () => el.lampShape, v => { el.lampShape = v; if (v === 'cylinder' && !isFinite(el.lampTip)) el.lampTip = 90; renderPanel(); }),
    param('Diameter (mm)', el, 'lampD', { placeholder: '0: a point' })));
  if (el.lampShape === 'cylinder') panel.append(grid2(param('Length (mm)', el, 'lampL'), param('Axis tipped up (°)', el, 'lampTip', { placeholder: '90: standing' })));
  panel.append(helpLine('It shines all round from its surface; its body takes light that comes back to it.', ['A lamp with a size sends each ray from its face as seen that way, from all across it, as a glowing surface looks: so its size shows, a lens imaging it as a patch its size times the magnification, and a lighthouse’s beam spreading by the lamp’s size over the lens’s focal length. A cylinder’s axis lies along the lamp’s direction tipped up by its tip: 90° stands it up, 0° lays it along its direction. Each ray starts from across the face the lamp shows its way, in 3D: a sphere’s disc, a cylinder’s side and ends, so rays leave from all its heights too. A diameter of 0 makes it a point. Its body absorbs light that comes back to it, as a bulb in front of a mirror does.'], 'note', 'margin-top:0.1rem'));
  // its light
  panel.append(h('h3', null, 'Light'));
  panel.append(grid2(param('Wavelength (nm)', el, 'wavelength'), param('Power (mW)', el, 'power')), grid2(wlPair(el)));
  // its rays: spread evenly over the directions it shines in, rings of them above and below the plane (0: a flat fan)
  panel.append(h('h3', null, 'Rays'));
  panel.append(grid2(param('Rays in all', el, 'rays'), param('Up and down to (°)', el, 'elev', { placeholder: '0: flat' }),
    el.elev > 0 ? param('Rings each way', el, 'rings', { placeholder: 'auto', blank: 0, fmt: v => (v > 0 ? String(v) : '') }) : null));
  const tot = h('p', { class: 'note', style: 'margin-top:0.1rem' });
  bindSync(tot, () => { const W = 1 + (el.lines || []).length, L = lampRaysOf(el), rings = new Set(L.map(q => q[4].toFixed(6))).size; tot.textContent = L.length + ' rays' + (rings > 1 ? ' over ' + rings + ' rings' + (el.elev >= 90 ? ', every way' : ', to ' + el.elev + '° up and down') : ' round it') + (W > 1 ? ', at each of ' + W + ' wavelengths' : '') + (el.pol === 'unpolarised' ? ', each in two halves (unpolarised)' : '') + '.'; });
  panel.append(tot);
  panel.append(h('p', null, 'Its rays in all are spread evenly over the directions it shines in: every way (Up and down to 90°), or a band about the bench plane, in rings of latitude, each ring given rays by its share of the sphere and every other ring turned half a step, so they pack evenly. Its power is shared by them all; more wavelengths each fire the same rays.'));
}

function drawSource(el, sel) {
  if (el.lamp) return drawLamp(el, sel);
  if (el.mmw && !el.mmw.part) return drawHorn(el, sel);
  const f = frame(el);
  const k = 1 / V().scale;             // px → mm
  const { L, hw } = srcBody(el);
  const body = [[-L, -hw], [0, -hw], [0, hw], [-L, hw]];
  pathLocal(f, body, true);
  ctx.fillStyle = bodyFill('#2b2622');
  ctx.fill();
  ctx.strokeStyle = sel ? selInk() : getCss('--rt-source');
  ctx.lineWidth = sel ? 2 : 1.5;
  ctx.stroke();
  // emitter face in the ray colour
  pathLocal(f, [[0, -el.width / 2 - 0.5*k], [0, el.width / 2 + 0.5*k]]);
  ctx.strokeStyle = el.colour;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/* the fan's soft edge: automatic (enough for the field grid) until a value is typed, 0 included */

function edgeRows(el) {
  if (el.softAuto !== false) el.soft = fanEdgeAuto(el.width, el.popN);
  const row = param('Edge softness (mm)', el, 'soft');
  // typing a value, 0 included, ends the automatic one: caught on the way down, before the field takes the value
  row.addEventListener('input', ev => { if (ev.target.tagName === 'INPUT' && ev.target.type === 'text') { el.softAuto = false; auto.checked = false; } }, true);
  const auto = h('input', { type: 'checkbox' });
  auto.checked = el.softAuto !== false;
  auto.addEventListener('change', () => { checkpoint(); el.softAuto = auto.checked; if (el.softAuto) el.soft = fanEdgeAuto(el.width, el.popN); changed(true); });
  bindSync(auto, () => { const a = fanEdgeAuto(el.width, el.popN); if (el.softAuto !== false && el.soft !== a) el.soft = a; });
  return [row, h('label', { class: 'rt-check' }, auto, 'Automatic: just enough for the field grid')];
}

/* a source's polarisation as seen looking along its beam: the bench plane across (p in it, s out of it), and its electric
   field's swing: one line for a linear state (s, p or at its angle from p), lines every way for unpolarised light */
function polDiagram(el) {
  const cv = h('canvas', { class: 'rt-poldiag', width: 96, height: 96, role: 'img' });
  const txt = h('span'), cap = h('p', { class: 'rt-polcap' }, h('b', null, 'Looking along the beam'), h('br'), txt);
  const box = h('div', { class: 'rt-polbox' }, cv, cap);
  const draw = () => {
    const g = cv.getContext && cv.getContext('2d');
    const P = el, pol = P.pol, ang = pol === 's' ? 90 : pol === 'p' ? 0 : pol === 'linear' ? (+P.polAngle || 0) : null;
    txt.textContent = pol === 'unpolarised' ? 'Unpolarised: its field swings every way across the beam, half s and half p.'
      : pol === 's' ? 's: its field swings out of the bench plane.' : pol === 'p' ? 'p: its field swings in the bench plane.'
        : 'Linear, ' + (+(+P.polAngle || 0).toPrecision(4)) + '° from p (the bench plane) towards s.';
    cv.setAttribute('aria-label', 'Its polarisation, looking along the beam: ' + txt.textContent);
    if (!g) return;
    const dpr = window.devicePixelRatio || 1, W = 96;
    cv.width = W * dpr; cv.height = W * dpr; cv.style.width = W + 'px'; cv.style.height = W + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
    const ink = getCss('--jek-ink') || '#222', soft = getCss('--jek-ink-soft') || '#777', c = W / 2, r = 34;
    // the beam's cross-section, the bench plane through it, and the two directions named
    g.fillStyle = (el.colour || '#d33') + '22'; g.beginPath(); g.arc(c, c, r, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = soft; g.lineWidth = 1; g.stroke();
    g.setLineDash([3, 3]); g.beginPath(); g.moveTo(4, c); g.lineTo(W - 4, c); g.stroke(); g.setLineDash([]);
    g.fillStyle = soft; g.font = '10px ' + (getCss('--jek-sans') || 'sans-serif'); g.textBaseline = 'middle';
    g.textAlign = 'right'; g.fillText('p', W - 3, c - 8); g.textAlign = 'center'; g.fillText('s', c + 8, 7);
    // its field's swing: a double-headed arrow (or one each way, faint, for unpolarised light)
    const arrow = (deg, a) => {
      const t = deg * Math.PI / 180, dx = Math.cos(t) * (r - 6), dy = -Math.sin(t) * (r - 6);
      g.globalAlpha = a; g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(c - dx, c - dy); g.lineTo(c + dx, c + dy); g.stroke();
      for (const sg of [1, -1]) {
        const x = c + sg * dx, y = c + sg * dy, ux = sg * Math.cos(t), uy = -sg * Math.sin(t);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7 * ux - 4 * uy, y - 7 * uy + 4 * ux); g.lineTo(x - 7 * ux + 4 * uy, y - 7 * uy - 4 * ux); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    };
    if (ang === null) for (const d of [0, 45, 90, 135]) arrow(d, 0.45); else arrow(ang, 1);
    // a linear state's angle from p, marked
    if (pol === 'linear' && Math.abs(ang) > 1) {
      const t = ang * Math.PI / 180;
      g.strokeStyle = soft; g.lineWidth = 1; g.beginPath(); g.arc(c, c, 15, -Math.max(t, 0), -Math.min(t, 0)); g.stroke();
    }
  };
  bindSync(box, draw);
  return box;
}
function sourcePanel(el) {
  if (el.lamp) return lampPanel(el);
  panel.append(h('h3', null, 'Light'));
  const colId = 'rtf' + setFid(fid + 1);
  const col = h('input', { id: colId, type: 'color' });
  col.addEventListener('input', () => { beginEdit(); el.colour = col.value; el.colourAuto = false; chk.checked = false; changed(false); });
  col.addEventListener('change', endEdit);
  bindSync(col, () => { col.value = el.colour; });
  const chk = h('input', { type: 'checkbox' });
  chk.checked = el.colourAuto;
  chk.addEventListener('change', () => {
    checkpoint(); el.colourAuto = chk.checked;
    if (el.colourAuto) el.colour = wavelengthColour(el.wavelength);
    changed(true);
  });
  const root = splitRoot(el), linked = root !== el;
  const wlId = 'rtf' + setFid(fid + 1);
  // its wavelength (a copy split from a laser has the laser's) and power; more wavelengths; the colour it is drawn in
  panel.append(grid2(linked ? h('div', { class: 'rt-f' }, h('label', { for: wlId }, 'Wavelength (nm)'), h('input', { id: wlId, type: 'text', value: String(root.wavelength), disabled: '', title: 'Set on ' + root.name })) : param('Wavelength (nm)', el, 'wavelength'),
    param('Power (mW)', el, 'power')), grid2(wlPair(el)));
  panel.append(h('div', { class: 'rt-inline rt-colrow' }, h('label', { class: 'rt-check' }, chk, 'Colour from its wavelength'), el.colourAuto ? null : col));
  col.setAttribute('aria-label', 'Colour');
  panel.append(h('p', null, 'Each extra wavelength fires the same fan of rays, so chromatic focal shift and lateral colour show up directly. Set width to 0 for a point source, or divergence to 0 for a collimated beam.'));

  // the ray fan: on its own, and hidden with its settings when it is off
  panel.append(h('h3', null, 'Rays'));
  const tr = h('input', { type: 'checkbox' });
  tr.checked = el.traceRays;
  tr.addEventListener('change', () => { checkpoint(); el.traceRays = tr.checked; changed(true); });
  panel.append(h('label', { class: 'rt-check' }, tr, 'Trace the ray fan'));
  if (el.traceRays) {
    const dv = param('Divergence (°)', el, 'divergence'); dv.title = 'Its full angle of spread: 0 collimated, negative converging';
    panel.append(grid2(param('Beam width (mm)', el, 'width'), dv, param('Rays', el, 'rays'),
      // how wide the source looks (the sun, half a degree): rays across that angle from each point of the beam
      param('Angular size (°)', el, 'angularSize', { placeholder: 'a point', blank: 0 }),
      el.angularSize > 0 ? param('Rays across it', el, 'angularRays') : null));
    if (!el.gauss && lightOf().field) panel.append(h('div', { class: 'rt-rows' }, ...edgeRows(el)));
    if (Math.abs(el.divergence) >= 360) panel.append(h('p', { class: 'note', style: 'margin-top:0.3rem' }, 'A lamp: its rays all round, evenly spaced.'));
    if (el.angularSize > 0) panel.append(h('p', { class: 'note', style: 'margin-top:0.3rem' }, (el.angularRays || 5) + ' rays across its ' + el.angularSize + '\u00b0 from each point: ' + rayPattern(el, el.rays).length * (el.angularRays || 5) + ' in all.'));
    // the pattern across the beam: the line of the 2D bench, or spread up and down too
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.1rem' }, selectField('Rays across the beam', RAY_PATTERNS, () => el.pattern || 'line', v => { if (v === 'line') delete el.pattern; else el.pattern = v; }, { wide: true })));
    // a line of rays standing for a round beam's power (an f-stop halves it, as in 3D)
    if (!el.pattern) {
      const rb = h('input', { type: 'checkbox' }); rb.checked = !!el.round;
      rb.addEventListener('change', () => { checkpoint(); if (rb.checked) el.round = true; else delete el.round; changed(); });
      panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.35rem', title: 'Each ray carries the ring of a round beam it stands for, so an iris at half the width passes a quarter of the light, and one f-stop halves it' }, rb, 'Power as across a round beam'));
    }
    const pn = h('p', { class: 'note', style: 'margin-top:0.3rem' });
    bindSync(pn, () => { const N = rayPattern(el, el.rays).length; pn.textContent = N + ' rays' + (el.pattern ? ' across the beam, up and down it too' : ' in the bench plane') + ', each traced in 3D; a screen\u2019s Rays tab shows where they land.'; });
    panel.append(pn);
  }
  else if (!el.gauss) {
    // without a Gaussian beam the fan's width and divergence still shape the diffracted field
    panel.append(grid2(param('Beam width (mm)', el, 'width'), param('Divergence (°)', el, 'divergence')));
    if (lightOf().field) panel.append(h('div', { class: 'rt-rows' }, ...edgeRows(el)));
    panel.append(helpLine('No rays are traced, so ray measurements are not available.', ['No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The width and divergence still set the uniform pupil the diffracted field starts from; its numerical aperture, Airy radius and cut-off come from the rays and are not shown.'], 'note', 'margin-top:0.5rem'));
  } else panel.append(helpLine('No rays are traced, so ray measurements are not available.', ['No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The Gaussian beam and the diffracted field still work, from their own reference rays.'], 'note', 'margin-top:0.5rem'));

  panel.append(h('h3', null, 'Gaussian beam'));
  const gb = h('input', { type: 'checkbox' });
  gb.checked = el.gauss;
  gb.addEventListener('change', () => {
    checkpoint();
    el.gauss = gb.checked;
    if (el.gauss) gaussFromFan(el);    // start from the fan that is already there
    changed(true);
  });
  panel.append(h('label', { class: 'rt-check' }, gb, 'Propagate a Gaussian beam along the axis'));
  if (el.gauss) {
    const fb = h('input', { type: 'checkbox' });
    fb.checked = !!el.fibre;
    fb.addEventListener('change', () => {
      checkpoint();
      if (fb.checked) { el.fibre = { core: 4.4, na: 0.12 }; applyFibre(el); } else delete el.fibre;
      changed(true);
    });
    panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.5rem' }, fb, 'Launch from a single-mode fibre'));
    if (el.fibre) panel.append(grid2(param('Fibre core (µm)', el, 'fibre.core'), param('Fibre NA', el, 'fibre.na')));
    else {
      const mode = selectField('Beam mode', [['gauss', 'Gaussian TEM\u2080\u2080'], ['hg', 'Hermite\u2013Gauss'], ['lg', 'Laguerre\u2013Gauss']],
        () => el.tem, v => { el.tem = v; fanFromGauss(el); });
      mode.title = 'Gaussian (TEM\u2080\u2080); Hermite\u2013Gauss HG\u2098\u2099, m and n nodes in and out of the bench plane; Laguerre\u2013Gauss LG\u209a\u2097, a vortex of charge l';
      panel.append(grid2(param('Waist radius (mm)', el, 'w0'), (() => { const z = param('Waist at (mm)', el, 'z0'); z.title = 'How far ahead of the source its waist sits; negative puts it behind'; return z; })(), mode,
        ...(el.tem === 'gauss' ? [param('M\u00b2 (beam quality)', el, 'm2')] : el.tem === 'hg' ? [param('m (in the plane)', el, 'hm'), param('n (out of it)', el, 'hn')]
          : [param('p (radial order)', el, 'lp'), param('l (vortex charge)', el, 'll')])));
    }
    const line = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(line, () => {
      if (isHigherMode(el)) {
        const lam = el.wavelength * 1e-6, [mx, my] = modeM2(el), zR = Math.PI * el.w0 * el.w0 / lam;
        line.textContent = (el.tem === 'hg' ? 'HG' + el.hm + el.hn : 'LG' + el.lp + (el.ll < 0 ? '\u2212' : '') + Math.abs(el.ll)) + ' of a Gaussian of waist ' + fmtLen(el.w0) +
          ': M\u00b2 ' + mx + (my !== mx ? ' in the bench plane, ' + my + ' out of it' : '') + ', so its second-moment waist is ' + fmtLen(el.w0 * Math.sqrt(mx)) + (my !== mx ? ' (' + fmtLen(el.w0 * Math.sqrt(my)) + ' out of the plane)' : '') +
          ' and its far-field half-angle ' + (+(1000 * Math.sqrt(mx) * lam / (Math.PI * el.w0)).toPrecision(3)) + ' mrad; Rayleigh range ' + fmtLen(zR) + '. ' +
          (el.tem === 'lg' ? 'It is carried as a coherent sum of ' + lgComps(el.lp, el.ll).length + ' Hermite\u2013Gauss modes, each with its own Gouy phase, so a pair of cylindrical lenses converts it as in the lab. ' : '') +
          'The diffracted field uses the 2D model.';
        return;
      }
      const lam = el.wavelength * 1e-6, M2 = m2Of(el);
      const zR = Math.PI * el.w0 * el.w0 / (M2 * lam);
      line.textContent = 'Rayleigh range ' + fmtLen(zR) + ', far-field half-angle ' +
        (+(1000 * M2 * lam / (Math.PI * el.w0)).toPrecision(3)) + ' mrad.' +
        (M2 > 1 ? ' With M\u00b2 above 1 the beam is partly coherent across itself: a sum of ' + gsmModes(M2).length +
          ' Hermite\u2013Gauss modes of a Gaussian ' + (+Math.sqrt(M2).toPrecision(3)) + '\u00d7 narrower, added as powers (a Gaussian Schell-model beam, as from a multimode laser or an LED). The diffracted field runs once per mode, so it is that much slower.' : '');
    });
    panel.append(line);
    // how it is shown (envelope, field) is the bench's, for every source alike; how its field is worked out is its own
    const fm = selectField('Field model', [['auto', 'Round if it can'], ['2d', 'Always 2D']], () => el.popModel, v => { el.popModel = v; });
    fm.title = 'Round if it can: a radial profile while the beam stays round, 2D once it is not; Always 2D: a 2D field throughout, with polarisation';
    panel.append(grid2(fm, selectField('Grid points', [128, 256, 512, 1024].map(v => [String(v), String(v)]), () => String(el.popN), v => { el.popN = +v; })));
    panel.append(helpLine('Rays, envelope and field are shown or hidden for the whole bench.', ['Whether the rays, the beams\u2019 envelope and their diffracted field show is set for the whole bench: the ticks under the Bench panel\u2019s Light (click empty bench).'], 'note', 'margin-top:0.4rem'));
    if (lightOf().field) {
      const pn = h('p', { class: 'note', style: 'margin-top:0.5rem' });
      bindSync(pn, () => { pn.textContent = popNote(el); });
      panel.append(pn);
      panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The field is propagated by diffraction, physical optics propagation with a pilot Gaussian choosing between near- and far-field steps. Each surface is a phase screen found by tracing rays through the real surface, so aberrations and clear apertures are included. While the beam stays round it is a radial profile moved with Hankel transforms; a tilted curved face, a tilted refracting face, an off-axis segment or an off-centre hit makes it a 2D field with separate pilots in and out of the bench plane, and what you see is the cut through the plane. Each slice is scaled to its own peak; the dashed lines are the 1/e\u00b2 radius of the Gaussian envelope for comparison.'));
    }
    panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The waist sits this far ahead of the source; negative puts it behind. The ray fan\u2019s width and divergence (under Rays) stay in step with this: the rays are the wavefront normals, so the fan spans the beam diameter and a converging beam gives a negative divergence.'));
  }

  panel.append(h('h3', null, 'Polarisation and coherence'));
  // its polarisation drawn, as seen along the beam; then its state, the laser it is split from, its spectrum
  panel.append(polDiagram(el));
  // its polarisation; the laser it is split from, if any (one launch with it); its spectrum: two to a row
  const others = project.elements.filter(e => e.type === 'source' && e !== el && !splitChain(e).includes(el));
  const pol = selectField('State', [['unpolarised', 'Unpolarised'], ['s', 's (out of plane)'], ['p', 'p (in plane)'], ['linear', 'Linear, at angle']], () => el.pol, v => el.pol = v);
  const split = selectField('Split from', [['', 'Its own laser'], ...others.map(e => [e.id, e.name])], () => el.splitFrom && getEl(el.splitFrom) ? el.splitFrom : '', v => { el.splitFrom = v || null; });
  split.title = 'Another source this one’s light is split from before the bench (a fibre coupler): the two interfere';
  const pulsed = !linked && el.tau > 0, coh = [];
  if (!linked && !pulsed) coherenceFields(el, { append: (...n) => coh.push(...n) });
  panel.append(grid2(pol, el.pol === 'linear' ? param('Angle from p (°)', el, 'polAngle') : null, split,
    linked ? [param('Phase against it (°)', el, 'splitPhase'), param('Extra fibre (mm)', el, 'splitPath')] : null, coh));
  panel.append(h('p', null, 'Everything here happens in one plane, so s and p never mix: each surface simply splits their power differently.'));
  if (linked) {
    const sl = h('p', { class: 'note', style: 'margin-top:0.2rem' });
    bindSync(sl, () => {
      const r = splitRoot(el), lag = lagOf(el), g = cohGamma(r);
      sl.textContent = 'Light from ' + r.name + ', split before it reaches the bench (a fibre coupler, say): the two add as fields wherever they meet, so they interfere. ' +
        'This one keeps its own power, place, beam and polarisation; its wavelength and line are ' + r.name + '’s. ' +
        'The phase between them is set by the fibres to within a wavelength, which in practice drifts: sweep it to see the fringes move. ' +
        'The extra fibre is counted at a group index of ' + FIBRE_NG + ': ' + fmtLen(Math.abs(lag)) + ' of optical path against ' + r.name +
        (g ? ', so fringes with its light have at most ' + (+g(lag).toPrecision(3)) + ' of full contrast.' : ', which matters only once the laser has a coherence length (set on ' + r.name + ').');
    });
    panel.append(sl);
  }
  const cl = h('p', { class: 'note', style: 'margin-top:0.2rem' });
  bindSync(cl, () => {
    if (linked) { cl.textContent = 'The line is ' + splitRoot(el).name + '\u2019s' + (el.coh > 0 ? ': coherence length ' + fmtLen(el.coh) + '.' : ': a single frequency.'); return; }
    if (el.tau > 0) { cl.textContent = 'Set by the pulse (below): coherence length ' + fmtLen(el.coh) + ', Gaussian.'; return; }
    cl.textContent = coherenceNote(el);
  });
  panel.append(cl);
  // a pulse: folded until it is one (sectionise opens a section marked shut only when asked)
  panel.append(h('h3', el.tau > 0 || (linked && splitRoot(el).tau > 0) ? null : { 'data-shut': '' }, 'Pulse'));
  if (linked) {
    const pl = h('p', { class: 'note' });
    bindSync(pl, () => { const r = splitRoot(el); pl.textContent = r.tau > 0 ? 'The pulse is ' + r.name + '\u2019s: ' + fmtFs(r.tau) + ', ' + (r.pshape === 'gauss' ? 'Gaussian' : 'sech\u00b2') + '. The extra fibre above delays it.' : r.name + ' is continuous.'; });
    panel.append(pl);
  } else {
    panel.append(pulseToggle(el));
    const prow = h('div', { class: 'rt-pgrid2', style: 'margin-top:0.4rem' });
    if (el.tau > 0) {
      const shape = selectField('Shape', [['sech2', 'sech\u00b2'], ['gauss', 'Gaussian']], () => el.pshape, v => { el.pshape = v; applyPulse(el); });
      shape.title = 'sech\u00b2: a soliton\u2019s, as from a Kerr-lens mode-locked laser; or Gaussian';
      prow.append(param('Duration (fs)', el, 'tau'), shape, param('Rep. rate (MHz)', el, 'rep'), param('Chirp, GDD (fs\u00b2)', el, 'gdd0'));
    }
    panel.append(prow);
    // turning a laser pulsed or continuous changes the panel: redraw it once the field is left
    const built = el.tau > 0, flip = () => { if ((el.tau > 0) !== built) setTimeout(renderPanel); };
    prow.addEventListener('focusout', flip);
    const pl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(pl, () => { pl.textContent = pulseLine(el); if (!prow.contains(document.activeElement)) flip(); });
    if (el.tau > 0) panel.append(pl);
  }

}

function hitSource(el, lx, ly, tol) { if (el.lamp) { const [a, b, round] = lampHalf(el); return !round ? Math.abs(lx) <= a + tol && Math.abs(ly) <= b + tol : Math.hypot(lx, ly) <= a + tol; } const { L, hw } = srcBody(el); return lx <= tol && lx >= -L - tol && Math.abs(ly) <= hw + tol; }

export const SOURCE_UI = {
  draw: drawSource, hit: hitSource, panel: sourcePanel, rank: 0,
};
