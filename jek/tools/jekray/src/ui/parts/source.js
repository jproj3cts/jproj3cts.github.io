import { fmtFs, fmtLen } from '../../core/format.js';
import { FIBRE_NG, cohGamma, lagOf, splitChain, splitRoot } from '../../core/coherence.js';
import { applyPulse, gsmModes, m2Of } from '../../core/pulses.js';
import { fanFromGauss, isHigherMode, lgComps, modeM2 } from '../../core/beams-hom.js';
import { wavelengthColour } from '../../core/colour.js';
import { fanEdgeAuto } from '../../core/fan-edge.js';
import { V, project } from '../../state/project.js';
import { getEl, lightOf, srcBody } from '../../state/elements.js';
import { frame } from '../../core/mask.js';
import { RAY_PATTERNS, rayPattern } from '../../engines/trace.js';
import { bodyFill, ctx, drawHorn, getCss, pathLocal, selInk } from '../render.js';
import { applyFibre } from '../../engines/fibre-face.js';
import {
  beginEdit, bindSync, coherenceFields, coherenceNote, endEdit, fid, h, panel, param, renderPanel,
  selectField, setFid, textField, helpLine
} from '../panel.js';
import { pulseLine, pulseToggle } from '../panels.js';
import { gaussFromFan } from '../../engines/cavity.js';
import { popNote } from '../heavy.js';
import { changed } from '../actions.js';
import { checkpoint } from '../tabs.js';

/* Source on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/source.js */

function drawSource(el, sel) {
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
  const row = param('Edge softness (mm)', el, 'edge');
  const inp = row.querySelector('input');
  if (inp) inp.addEventListener('change', () => { el.edgeAuto = false; auto.checked = false; });
  const auto = h('input', { type: 'checkbox' });
  auto.checked = el.edgeAuto !== false;
  auto.addEventListener('change', () => { checkpoint(); el.edgeAuto = auto.checked; if (el.edgeAuto) el.edge = fanEdgeAuto(el.width, el.popN); changed(true); });
  bindSync(auto, () => { const a = fanEdgeAuto(el.width, el.popN); if (el.edgeAuto !== false && el.edge !== a) el.edge = a; });
  return [row, h('label', { class: 'rt-check' }, auto, 'Automatic: just enough for the field grid')];
}

function sourcePanel(el) {
  panel.append(h('h3', null, 'Beam'));
  const rows = h('div', { class: 'rt-rows' });
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
    changed(false);
  });
  const root = splitRoot(el), linked = root !== el;
  const wlId = 'rtf' + setFid(fid + 1);
  rows.append(
    // a copy split from a laser has the laser's wavelength
    linked ? h('div', { class: 'rt-f' }, h('label', { for: wlId }, 'Wavelength (nm)'), h('input', { id: wlId, type: 'text', value: String(root.wavelength), disabled: '', title: 'Set on ' + root.name })) : param('Wavelength (nm)', el, 'wavelength'),
    param('Power (mW)', el, 'power'),
    h('div', { class: 'rt-f' }, h('label', { for: colId }, 'Colour'), col),
    h('label', { class: 'rt-check wide' }, chk, 'Match colour to wavelength'),
  );
  panel.append(rows);

  // the ray fan: on its own, and hidden with its settings when it is off
  panel.append(h('h3', null, 'Rays'));
  const tr = h('input', { type: 'checkbox' });
  tr.checked = el.traceRays;
  tr.addEventListener('change', () => { checkpoint(); el.traceRays = tr.checked; changed(true); });
  panel.append(h('label', { class: 'rt-check' }, tr, 'Trace the ray fan'));
  if (el.traceRays) {
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Beam width (mm)', el, 'width'),
      ...(el.gauss ? [] : edgeRows(el)),
      param('Divergence, full (°)', el, 'divergence'),
      param('Rays', el, 'rays')));
    // the pattern across the beam: the line of the 2D bench, or spread up and down too
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' }, selectField('Rays across the beam', RAY_PATTERNS, () => el.pattern || 'line', v => { if (v === 'line') delete el.pattern; else el.pattern = v; }, { wide: true })));
    const pn = h('p', { class: 'note', style: 'margin-top:0.3rem' });
    bindSync(pn, () => { const N = rayPattern(el, el.rays).length; pn.textContent = (el.pattern ? N + ' rays across the beam, up and down it too, ' : 'In the bench plane only, ') + 'its width (and divergence) the same both ways, each traced exactly in 3D. Screens show where they land on a spot diagram (Rays tab).'; });
    panel.append(pn);
  }
  else if (!el.gauss) {
    // without a Gaussian beam the fan's width and divergence still shape the diffracted field
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Beam width (mm)', el, 'width'),
      ...edgeRows(el),
      param('Divergence, full (°)', el, 'divergence')));
    panel.append(helpLine('No rays are traced, so ray measurements are not available.', ['No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The width and divergence still set the uniform pupil the diffracted field starts from; its numerical aperture, Airy radius and cut-off come from the rays and are not shown.'], 'note', 'margin-top:0.5rem'));
  } else panel.append(helpLine('No rays are traced, so ray measurements are not available.', ['No rays are traced, so the ray measurements (spot, wavefront, ray interference) have nothing to go on. The Gaussian beam and the diffracted field still work, from their own reference rays.'], 'note', 'margin-top:0.5rem'));

  panel.append(h('h3', null, 'Beam propagation'));
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
    if (el.fibre) panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Fibre core (µm)', el, 'fibre.core'), param('Fibre NA', el, 'fibre.na')));
    else panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      param('Waist radius (mm)', el, 'w0'),
      param('Waist distance (mm)', el, 'z0'),
      ...(el.tem === 'gauss' ? [param('M\u00b2 (beam quality)', el, 'm2')] : [])));
    if (!el.fibre) {
      panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
        selectField('Beam mode', [['gauss', 'Gaussian (TEM\u2080\u2080)'], ['hg', 'Hermite\u2013Gauss HG\u2098\u2099'], ['lg', 'Laguerre\u2013Gauss LG\u209a\u2097 (vortex)']],
          () => el.tem, v => { el.tem = v; fanFromGauss(el); }, { wide: el.tem === 'gauss' }),
        ...(el.tem === 'hg' ? [param('m, nodes in the bench plane', el, 'hm'), param('n, nodes out of it', el, 'hn')]
          : el.tem === 'lg' ? [param('p, radial order', el, 'lp'), param('l, vortex charge', el, 'll')] : [])));
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
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
      selectField('Field model', [['auto', 'Round when it can be'], ['2d', 'Always 2D, with polarisation']], () => el.popModel, v => { el.popModel = v; }),
      selectField('Grid points', [128, 256, 512, 1024].map(v => [String(v), String(v)]), () => String(el.popN), v => { el.popN = +v; })));
    panel.append(helpLine('Rays, envelope and field are shown or hidden for the whole bench.', ['Whether the rays, the beams\u2019 envelope and their diffracted field show is set for the whole bench: the ticks under the Bench panel\u2019s Light (click empty bench).'], 'note', 'margin-top:0.4rem'));
    if (lightOf().field) {
      const pn = h('p', { class: 'note', style: 'margin-top:0.5rem' });
      bindSync(pn, () => { pn.textContent = popNote(el); });
      panel.append(pn);
      panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The field is propagated by diffraction, physical optics propagation with a pilot Gaussian choosing between near- and far-field steps. Each surface is a phase screen found by tracing rays through the real surface, so aberrations and clear apertures are included. While the beam stays round it is a radial profile moved with Hankel transforms; a tilted curved face, a tilted refracting face, an off-axis segment or an off-centre hit makes it a 2D field with separate pilots in and out of the bench plane, and what you see is the cut through the plane. Each slice is scaled to its own peak; the dashed lines are the 1/e\u00b2 radius of the Gaussian envelope for comparison.'));
    }
    panel.append(h('p', { style: 'margin-top:0.5rem' }, 'The waist sits this far ahead of the source; negative puts it behind. The ray fan\u2019s width and divergence (under Rays) stay in step with this: the rays are the wavefront normals, so the fan spans the beam diameter and a converging beam gives a negative divergence.'));
  }

  panel.append(h('h3', null, 'Polarisation'));
  const prows = h('div', { class: 'rt-rows' },
    selectField('State', [['unpolarised', 'Unpolarised'], ['s', 's, out of the plane'], ['p', 'p, in the plane'], ['linear', 'Linear at an angle']],
      () => el.pol, v => el.pol = v, { wide: el.pol !== 'linear' }));
  if (el.pol === 'linear') prows.append(param('Angle from p (°)', el, 'polAngle'));
  panel.append(prows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Everything here happens in one plane, so s and p never mix: each surface simply splits their power differently.'));

  // the laser's own line: how far apart two paths can be and still interfere
  panel.append(h('h3', null, 'Coherence'));
  // split from another laser's source: one launch with it
  const others = project.elements.filter(e => e.type === 'source' && e !== el && !splitChain(e).includes(el));
  const srows = h('div', { class: 'rt-rows' }, selectField('Split from', [['', 'Nothing: a laser of its own'], ...others.map(e => [e.id, e.name])],
    () => el.splitFrom && getEl(el.splitFrom) ? el.splitFrom : '', v => { el.splitFrom = v || null; }, { wide: true }));
  if (linked) srows.append(param('Phase against it (\u00b0)', el, 'splitPhase'), param('Extra fibre (mm)', el, 'splitPath'));
  panel.append(srows);
  if (linked) {
    const sl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(sl, () => {
      const r = splitRoot(el), lag = lagOf(el), g = cohGamma(r);
      sl.textContent = 'Light from ' + r.name + ', split before it reaches the bench (a fibre coupler, say): the two add as fields wherever they meet, so they interfere. ' +
        'This one keeps its own power, place, beam and polarisation; its wavelength and line are ' + r.name + '\u2019s. ' +
        'The phase between them is set by the fibres to within a wavelength, which in practice drifts: sweep it to see the fringes move. ' +
        'The extra fibre is counted at a group index of ' + FIBRE_NG + ': ' + fmtLen(Math.abs(lag)) + ' of optical path against ' + r.name +
        (g ? ', so fringes with its light have at most ' + (+g(lag).toPrecision(3)) + ' of full contrast.' : ', which matters only once the laser has a coherence length (set on ' + r.name + ').');
    });
    panel.append(sl);
  }
  const crows = h('div', { class: 'rt-rows' });
  const pulsed = !linked && el.tau > 0;
  if (!linked && !pulsed) coherenceFields(el, crows);
  panel.append(crows);
  const cl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
  bindSync(cl, () => {
    if (linked) { cl.textContent = 'The line is ' + splitRoot(el).name + '\u2019s' + (el.coh > 0 ? ': coherence length ' + fmtLen(el.coh) + '.' : ': a single frequency.'); return; }
    if (el.tau > 0) { cl.textContent = 'Set by the pulse (below): coherence length ' + fmtLen(el.coh) + ', Gaussian.'; return; }
    cl.textContent = coherenceNote(el);
  });
  panel.append(cl);
  panel.append(h('h3', null, 'Pulse'));
  if (linked) {
    const pl = h('p', { class: 'note' });
    bindSync(pl, () => { const r = splitRoot(el); pl.textContent = r.tau > 0 ? 'The pulse is ' + r.name + '\u2019s: ' + fmtFs(r.tau) + ', ' + (r.pshape === 'gauss' ? 'Gaussian' : 'sech\u00b2') + '. The extra fibre above delays it.' : r.name + ' is continuous.'; });
    panel.append(pl);
  } else {
    panel.append(pulseToggle(el));
    const prow = h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' });
    if (el.tau > 0) prow.append(param('Duration (fs)', el, 'tau'),
      selectField('Shape', [['sech2', 'sech\u00b2 (soliton, Kerr-lens)'], ['gauss', 'Gaussian']], () => el.pshape, v => { el.pshape = v; applyPulse(el); }),
      param('Repetition rate (MHz)', el, 'rep'),
      param('Chirp at the laser, GDD (fs\u00b2)', el, 'gdd0', { wide: true }));
    panel.append(prow);
    // turning a laser pulsed or continuous changes the panel: redraw it once the field is left
    const built = el.tau > 0, flip = () => { if ((el.tau > 0) !== built) setTimeout(renderPanel); };
    prow.addEventListener('focusout', flip);
    const pl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(pl, () => { pl.textContent = pulseLine(el); if (!prow.contains(document.activeElement)) flip(); });
    if (el.tau > 0) panel.append(pl);
  }

  panel.append(h('h3', null, 'Extra wavelengths'));
  const presets = [['', 'Just the one above'], ['486.1,656.3', 'F and C lines (486.1, 656.3)'],
    ['450,550,650', 'Visible (450, 550, 650)'], ['1530,1565', 'Telecom C-band (1530, 1565)']];
  const pre = h('select', { id: 'rtf' + setFid(fid + 1) });
  for (const [v, t] of presets) pre.append(h('option', { value: v }, t));
  pre.value = presets.some(q => q[0] === el.lines.join(',')) ? el.lines.join(',') : '';
  pre.addEventListener('change', () => {
    checkpoint();
    el.lines = pre.value ? pre.value.split(',').map(Number) : [];
    changed(true);
  });
  panel.append(h('div', { class: 'rt-rows' },
    h('div', { class: 'rt-f wide' }, h('label', { for: pre.id }, 'Preset'), pre),
    textField('Wavelengths (nm), comma separated', () => el.lines.join(', '), v => {
      const a = v.split(/[,;\s]+/).filter(Boolean).map(Number);
      if (a.every(q => isFinite(q) && q >= 100 && q <= 20000)) el.lines = a.slice(0, 12);
    }, { wide: true, placeholder: 'none' })));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each extra wavelength fires the same fan of rays, so chromatic focal shift and lateral colour show up directly. Set width to 0 for a point source, or divergence to 0 for a collimated beam.'));
}

function hitSource(el, lx, ly, tol) { const { L, hw } = srcBody(el); return lx <= tol && lx >= -L - tol && Math.abs(ly) <= hw + tol; }

export const SOURCE_UI = {
  draw: drawSource, hit: hitSource, panel: sourcePanel, rank: 0,
};
