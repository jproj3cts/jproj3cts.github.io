import { clamp } from '../core/constants.js';
import { fmtFs, fmtFs2, fmtFs3, fmtHz, fmtJ, fmtLen, fmtMw, fmtNum, fmtW, fmtWl } from '../core/format.js';
import { GLASS, glassKey, matLabel, refIndex } from '../core/glass.js';
import { CRYSTALS, CRYSTAL_SHAPES, FILTER_TYPES } from '../core/crystals.js';
import { ATOMS, ATOM_ISO, C_SI, KB } from '../core/cells.js';
import { SPHERE_DENSITY, TRAP_ATOMS, atomLines, trapFLabel } from '../core/traps.js';
import { MU_B } from '../core/zeeman.js';
import { NLC, cellDensity, cellPlan, cellProfile, cellResponse, evalPlan, nlcConvert } from '../core/nlc.js';
import { C_MM } from '../core/modulators.js';
import { DETECTOR_MATERIALS, RF_HORNS, applyRf } from '../core/rf.js';
import { FIBRE_NG } from '../core/coherence.js';
import { PULSE_SAMPLES, applyPulse, fibreDisp, fibreGDD, fibreGamma, pulseDnu } from '../core/pulses.js';
import { PRISM_SHAPES, deg, nextName, normCoat, project, typeLabel } from '../state/project.js';
import { COAT_MATERIALS, coatPreset, qwot, stackAmp } from '../core/coatings.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName, linkPairs, linkPartner } from '../state/tabs.js';
import { MASK_PRESETS, STOP_SHAPES, compileMaskExpr, maskFns, stopSlitLike } from '../core/mask.js';
import { RAY_PATTERNS, lastTrace } from '../engines/trace.js';
import { getCss, removeFibre } from './render.js';
import { groupEls, ungroupEls } from './drawings.js';
import { snapVal } from './pointer.js';
import { CONNS, FC, FIBRE_N, netPower, pkey, portName, portsOf, thruPartner } from '../engines/fibre.js';
import { modReadouts } from '../engines/mods.js';
import { osaSection, signalSection } from './instruments.js';
import { refNm } from './optimise.js';
import {
  bindSync, coherenceFields, coherenceNote, fid, h, numInput, panel, param, renderPanel, selectField,
  setFid, textField, vs
} from './panel.js';
import {
  askForMaterial, axisFont, diffractionSection, drawAxes, materialOptions, pickMaterial, plotArea,
  plotCsv, plotFrame, plotSaveRow, plotZoom, removeSweeps, unknownGlass, unknownGlassNote,
  updateSyncButtons, zoomControls, zoomRange
} from './plots.js';
import { aberCache, aberSource, aberrations, diffractionLater } from '../engines/pd-cavity.js';
import { pulseReport } from '../engines/pulse.js';
import { screenStats, trapReport } from '../engines/screen-stats.js';
import { alignEls, changed, duplicateSel, moveToTab, removeEls, rotateEls, setLocked, zoomToSelection } from './actions.js';
import { addBench, checkpoint, selectEl } from './tabs.js';
import { exportScreen } from '../io/layout.js';
import { modReadoutSection } from '../io/mods.js';

function drawPulse(cv, el, view) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 160;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  cv._csv = null;
  const R = pulseReport(el);
  g.fillStyle = getCss('--jek-ink-soft'); g.font = axisFont();
  if (!R) { g.fillText('no pulse reaches it', 4, 14); return; }
  let xs, ys, sx, sy, xr, yr;
  if (view === 'time') {
    const span = R.t[R.t.length - 1] - R.t[0], u = span > 3e5 ? [1e-3, 'ns'] : span > 3000 ? [1e-3, 'ps'] : [1, 'fs'];
    if (u[1] === 'ns') u[0] = 1e-6;
    xs = R.t.map(t => (t - R.tMin) * u[0]); ys = R.I;
    sx = { kind: 'plain', title: 'time from the first pulse, ' + u[1] }; sy = { kind: 'plain', title: 'power, W' };
    plotCsv(cv, el.name + ' pulse in time', ['time_fs', 'power_W'], () => R.t.map((t, i) => [t - R.tMin, R.I[i]]));
  } else if (view === 'spectrum') {
    const pk = Math.max(...R.S) || 1;
    xs = R.nm; ys = R.S.map(v => v / pk);
    sx = { kind: 'plain', title: 'nm' }; sy = { kind: 'plain', title: 'spectrum, of its peak' };
    plotCsv(cv, el.name + ' spectrum', ['wavelength_nm', 'relative_intensity'], () => R.nm.map((n, i) => [n, ys[i]]));
  } else {
    xs = R.nm; ys = R.spectralPhase;
    sx = { kind: 'plain', title: 'nm' }; sy = { kind: 'plain', title: 'spectral phase less delay, rad' };
    plotCsv(cv, el.name + ' spectral phase', ['wavelength_nm', 'phase_rad'], () => R.nm.map((n, i) => [n, ys[i]]));
  }
  const ok = ys.map((v, i) => isFinite(v) && isFinite(xs[i]));
  const X = xs.filter((v, i) => ok[i]), Y = ys.filter((v, i) => ok[i]);
  if (X.length < 2) { g.fillText('nothing to show', 4, 14); return; }
  xr = [Math.min(...X), Math.max(...X)]; yr = [Math.min(0, ...Y), Math.max(...Y)];
  if (!(yr[1] > yr[0])) yr[1] = yr[0] + 1;
  if (view !== 'time') { const p = 0.05 * (yr[1] - yr[0]); yr = [yr[0] - (view === 'phase' ? p : 0), yr[1] + p]; }
  const A = plotArea(g, w, hgt, yr, sy);
  g.save(); g.beginPath(); g.rect(A.l, A.t - 2, A.w + 2, A.h + 4); g.clip();
  g.strokeStyle = getCss('--jek-cyan'); g.lineWidth = 1.5; g.beginPath();
  let pen = false;
  xs.forEach((x, i) => {
    if (!ok[i]) { pen = false; return; }
    const px = A.l + (x - xr[0]) / (xr[1] - xr[0] || 1) * A.w, py = A.t + A.h - (ys[i] - yr[0]) / (yr[1] - yr[0]) * A.h;
    pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true;
  });
  g.stroke(); g.restore();
  drawAxes(g, A, xr, yr, sx, sy);
}
/* the pulse section of a screen's, photodiode's or fibre tip's panel */
/* with nothing pulsed on the bench, the section is there but greyed, as the screens' Pulse tab is */
function pulseSectionEmpty() {
  panel.append(h('h3', { class: 'rt-muted' }, 'Pulse'),
    h('p', { class: 'note rt-muted' }, 'No pulsed source on the bench. Give a source (or a fibre laser) a pulse duration and the pulse that arrives here shows in this section: its duration, chirp and arrival time.'));
}
function pulseSection(el) {
  const vsEl = vs(el);
  vsEl.pulseView = vsEl.pulseView || 'time';
  if (el.type !== 'screen') panel.append(h('h3', null, 'Pulse'));
  const tabs = h('div', { class: 'rt-tabs' });
  const cv = h('canvas', { height: '160', style: 'width:100%;display:block' });
  const draw = () => drawPulse(cv, el, vsEl.pulseView);
  for (const [k, label] of [['time', 'Time'], ['spectrum', 'Spectrum'], ['phase', 'Phase']]) {
    const b = h('button', { class: 'rt-tab' + (vsEl.pulseView === k ? ' on' : ''), type: 'button', onclick: () => { vsEl.pulseView = k; [...tabs.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, label);
    tabs.append(b);
  }
  panel.append(tabs, h('div', { style: 'margin-top:0.3rem' }, cv), plotSaveRow(cv));
  const box = h('div', { class: 'rt-readout' });
  panel.append(box);
  let sig = '';
  bindSync(cv, () => {
    const R = pulseReport(el);
    const rows = [];
    if (!R) rows.push(['', 'No pulsed source reaches it. Give a source (or a fibre laser) a pulse duration.']);
    else {
      rows.push(['Duration (FWHM)', R.dur ? fmtFs(R.dur) + (R.tl ? ', ' + (+(R.dur / R.tl).toPrecision(3)) + '× its transform limit (' + fmtFs(R.tl) + ')' : '') : 'more than one pulse: see below']);
      rows.push(['Peak power', fmtW(R.peak) + (R.parts.length === 1 ? ', ' + fmtJ(R.parts[0].energy) + ' a pulse' : '')]);
      for (const b of R.branches) {
        rows.push(['Pulse ' + b.n + (R.branches.length > 1 ? ' (' + (+(100 * b.share).toPrecision(3)) + '%)' : ''),
          (R.branches.length > 1 ? 'arrives ' + fmtFs(b.arrive) + ' after the first; ' : 'after ' + fmtFs(b.GD) + '; ') +
          'GDD ' + fmtFs2(b.GDD) + ', TOD ' + fmtFs3(b.TOD) + (b.shown ? '' : ' (not in the plot: too far off)')]);
        const sig3 = (v, eps) => Math.abs(v) < eps ? '0' : String(+v.toPrecision(3));
        if (Math.abs(b.chirpY) > 1e-4 || b.pft > 0.01) rows.push(['', 'spatial chirp ' + sig3(1000 * b.chirpY, 0.05) + ' µm/nm, angular dispersion ' + sig3(1e6 * b.angD, 0.005) + ' µrad/nm, pulse-front tilt ' + sig3(b.pft, 0.005) + '°']);
      }
    }
    const s2 = JSON.stringify(rows);
    if (s2 !== sig) { sig = s2; box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    draw();
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Worked out from reference rays traced at ' + PULSE_SAMPLES + ' wavelengths across each pulsed laser’s spectrum: their optical paths through glass, prisms, gratings, chirped mirrors and fibre are the spectral phase, taken at the centre of the arriving beam with each wavelength’s own wavefront tilt, so prism and grating compressors come out without formulas. Pulses by different paths of one laser add as fields (a delay line shows spectral fringes); separate lasers and the two polarisations add as powers. Group delay dispersion (GDD) and third-order dispersion (TOD) are from a fit to the phase; the plot uses the full fit. A pulse whose spectrum a fibre\u2019s nonlinearity reshaped (self-phase modulation) carries that spectrum and its phase on top.'));
}
/* The screen's Trap tab: an optical trap for a chosen atom or dielectric sphere where the light here is brightest */
function trapSection(el) {
  panel.append(h('h3', null, 'Optical trap'));
  const rows0 = h('div', { class: 'rt-rows' }, selectField('Trap for', [['none', 'Nothing'], ...Object.entries(TRAP_ATOMS).map(([k, a]) => [k, a.name + ' atoms']), ['sphere', 'A dielectric sphere']],
    () => el.trap, v => { el.trap = v; }, { wide: true }));
  if (el.trap in TRAP_ATOMS) rows0.append(selectField('Ground state', [['avg', 'Hyperfine levels averaged'], ['lo', trapFLabel(el.trap, 'lo')], ['hi', trapFLabel(el.trap, 'hi')]],
    () => el.trapF, v => { el.trapF = v; }, { wide: true }));
  if (el.trap === 'sphere') {
    const mats = Object.keys(GLASS).filter(g => g !== 'Water');
    rows0.append(
      selectField('Material', mats.map(g => [g, g]), () => el.trapMat, v => { el.trapMat = v; if (SPHERE_DENSITY[v]) el.trapRho = SPHERE_DENSITY[v]; }),
      param('Radius (nm)', el, 'trapR'),
      param('Density (kg/m³)', el, 'trapRho'),
      param('Temperature (K)', el, 'trapT'),
      selectField('Medium', [['bench', 'As on the bench'], ['vacuum', 'Vacuum'], ['air', 'Air, at a pressure']], () => el.trapMed, v => { el.trapMed = v; }, { wide: el.trapMed !== 'air' }));
    if (el.trapMed === 'air') rows0.append(param('Pressure (mbar)', el, 'trapP'));
  }
  panel.append(rows0);
  if (el.trap === 'none') {
    panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Choose atoms or a dielectric sphere to read the optical trap the light here makes: where the particle sits, how deep the trap is, its trap frequencies each way and how much light it scatters. Put the screen at (or near) the focus and untick “Stop the rays it records” on the Screen tab so the light carries on. Every beam through the screen’s region counts, whichever way it goes: beams from one laser add as fields, so two counter-propagating beams make a standing wave.'));
    return;
  }
  const box = h('div', { class: 'rt-readout' });
  panel.append(box);
  let sig = '';
  const fq = f => f === null || f === undefined ? 'none (not trapped this way)' : f >= 1e3 ? (+(f / 1e3).toPrecision(4)) + ' kHz' : (+f.toPrecision(4)) + ' Hz';
  const tK = K => Math.abs(K) >= 1 ? (+K.toPrecision(4)) + ' K' : Math.abs(K) >= 1e-3 ? (+(K * 1e3).toPrecision(4)) + ' mK' : Math.abs(K) >= 1e-6 ? (+(K * 1e6).toPrecision(4)) + ' µK' : (+(K * 1e9).toPrecision(4)) + ' nK';
  const off = (v, what) => fmtLen(Math.abs(v)) + ' ' + what;
  bindSync(box, () => {
    const { D, busy } = diffractionLater(el), rows = [];
    const T = D && D.trap ? trapReport(el, D.trap) : null;
    if (!T) rows.push(['', busy || (D && !D.trap) ? 'Working out the trap…' : 'No Gaussian beam reaches this screen.']);
    else if (T.error) rows.push(['', 'No trap: ' + (T.error === 'no focused beam' ? 'no beam through here has a field to take.' : T.error)]);
    else {
      const sph = el.trap === 'sphere';
      rows.push(['Light', (T.beams > 1 ? T.beams + ' beams' + (T.launches < T.beams ? ', interfering' : ', from separate lasers') : 'one beam') + ', ' + (T.I >= 1e7 ? (+(T.I / 1e7).toPrecision(4)) + ' kW/cm²' : (+(T.I / 1e4).toPrecision(4)) + ' W/cm²') + ' where it sits']);
      if (sph) rows.push(['Particle', el.trapMat + ', n = ' + (+T.np.toPrecision(5)) + ', radius ' + fmtLen(el.trapR * 1e-6) + ' in a medium of n = ' + (+T.nMed.toPrecision(5)) + (el.trapMed === 'bench' ? ' (the bench’s, where the light is)' : '') + ', mass ' + (+(T.mass * 1e3).toPrecision(3)) + ' g']);
      if (!T.trap && T.depthK < 0) rows.push(['', 'The particle is repelled by the light (' + (sph ? 'its index is below the medium’s' : 'blue of the D lines') + '): a barrier ' + tK(-T.depthK) + ' high at the brightest point, not a trap.']);
      else if (!T.trap && T.away) rows.push(['', 'No trap near the screen: the light pulls the particle away along the beam (' + off(T.dz, T.dz >= 0 ? 'past the screen' : 'before it') + '), as a collimated beam on its own does. A focus, or a second beam against it for a standing wave, would hold it here.']);
      else if (!T.trap) rows.push(['', 'No stable trap: ' + (sph ? 'radiation pressure outweighs the pull of the focus along the beam (a higher numerical aperture, a smaller particle, or a second beam against it would hold it)' : 'the force does not settle to zero here') + '.']);
      else {
        rows.push(['Where', 'along the beam ' + off(T.dz, T.dz >= 0 ? 'past the screen' : 'before it') + (Math.abs(T.dx) > 1e-7 || Math.abs(T.dy) > 1e-7 ? '; across ' + fmtLen(T.dx) + ' in the plane, ' + fmtLen(T.dy) + ' out of it' : '')]);
        rows.push(['Depth', tK(T.depthK) + (sph ? ' (' + (+T.kT.toPrecision(4)) + ' kT at ' + el.trapT + ' K)' : ' (' + fmtHz(T.depthHz) + ')')]);
        rows.push(['Frequencies', 'across ' + fq(T.fx) + ' in the plane, ' + fq(T.fy) + ' out of it; along the beam ' + fq(T.fz)]);
      }
      const pw = v => v >= 1e-3 ? (+(v * 1e3).toPrecision(3)) + ' mW' : v >= 1e-6 ? (+(v * 1e6).toPrecision(3)) + ' \u00b5W' : v >= 1e-9 ? (+(v * 1e9).toPrecision(3)) + ' nW' : (+(v * 1e12).toPrecision(3)) + ' pW';
      if (sph && T.trap) {
        const q = v => v === null ? '\u2013' : v >= 1e4 ? v.toExponential(2).replace('e+', ' \u00d7 10^') : (+v.toPrecision(3)).toString();
        if (T.G > 0) rows.push(['Damping', '\u0393/2\u03c0 = ' + fmtHz(T.G / (2 * Math.PI)) + ' by ' + (T.dampBy === 'air' ? 'the air (mean free path ' + fmtLen(T.mfp * 1e3) + ', Knudsen number ' + (+T.Kn.toPrecision(3)) + ')' : 'the water\u2019s viscosity') +
          '; Q ' + q(T.Q[0]) + ', ' + q(T.Q[1]) + ', ' + q(T.Q[2]) + ' (x, y, z)' + (T.Q.some(v => v !== null && v < 0.5) ? ': overdamped where Q is under \u00bd' : '')]);
        // gas damping is still beta: Gieseler et al.'s own measurements differ from the formula it uses
        if (T.G > 0 && T.dampBy === 'air') rows.push(['Gas damping (beta)', 'Gieseler et al.\u2019s formula for a sphere of the nominal size and density. Their own measurements differ from it by 25 to 55% (see the validation page), so read the damping and Q as estimates.']);
        else rows.push(['Damping', T.dampBy === 'vacuum' ? 'none from a gas (vacuum): only photon recoil and the laser\u2019s noise, not modelled' : 'none from a gas here: set the medium to Air for a pressure']);
      }
      if (sph) rows.push(['Scattering', pw(T.Psc) + ' scattered; radiation pressure ' + (+(T.Fscat * 1e15).toPrecision(3)) + ' fN from one beam of this intensity']);
      else {
        rows.push(['Scattering', (+T.sc.toPrecision(3)) + ' photons/s']);
        rows.push(['Recoil heating', tK(T.heat) + '/s' + (T.trap && T.heat > 0 ? ', the depth in ' + (+(T.depthK / T.heat).toPrecision(3)) + ' s' : '')]);
        if (T.near) rows.push(['', 'Within 1 THz of a D line: hyperfine structure and saturation, left out here, matter.']);
      }
      if (sph && T.ka > 0.6) rows.push(['', 'The sphere is ' + (+T.ka.toPrecision(2)) + ' of a wavelength/2π across (ka): past the Rayleigh regime (ka below about 0.5) these forces are only a guide; a Mie calculation is needed.']);
      if (sph && el.trapMed !== 'bench' && Math.abs(T.nMed - T.nBench) > 1e-3) rows.push(['', 'The medium set here (n = ' + (+T.nMed.toPrecision(4)) + ') is not the bench’s where the light is (n = ' + (+T.nBench.toPrecision(4)) + '): the focus is the bench’s. For a liquid, put the trap in a block of it on the bench (Water is in the catalogue) so the focus is right too.']);
      if (T.skipped) rows.push(['', T.skipped + ' beam' + (T.skipped > 1 ? 's' : '') + ' through here left out: no field could be taken for ' + (T.skipped > 1 ? 'them.' : 'it.')]);
    }
    const s2 = JSON.stringify(rows);
    if (s2 !== sig) { sig = s2; box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Every beam through the screen’s region is taken as its full vector field near the focus (the Rayleigh–Sommerfeld integral from its pupil, so a steep focus and polarisation count); one not converging to a focus ahead (collimated, or past its focus) is taken as its propagated field instead. Beams of one laser added as fields. The particle is a dipole: the force on it is Re(α Σ Eⱼ ∇Eⱼ*)/2, its real part the pull towards bright light, its imaginary part radiation pressure. Beams may come in from any direction in the bench plane (crossed standing waves make a 2D lattice); their relative phases follow their path lengths, which in the lab drift unless locked. Nothing can come in from above or below the bench. Newton’s method finds where the force is zero, starting from the brightest point, and the stiffness there gives the trap frequencies (x across the arriving beam in the bench plane, y out of it, z along it). ' +
    (el.trap === 'sphere' ? 'A sphere’s polarisability is Clausius–Mossotti in its medium, with the radiation reaction that makes it scatter; good for radii well below the wavelength (Rayleigh particles).' : 'An atom’s is from its D lines, counter-rotating terms and core included, for linear polarisation; hyperfine structure and the vector shift of circular light are left out; heating is photon recoil only.')));
}
const pulsedFibreLaser = () => project.elements.find(e => e.type === 'fcomp' && e.kind === 'laser' && e.tau > 0);
/* the checkbox that makes a laser pulsed (mode-locked) or continuous. Turning it on restores
   the last duration (100 fs to start with); turning it off gives back the line it had */
export function pulseToggle(el) {
  const cb = h('input', { type: 'checkbox' });
  cb.checked = el.tau > 0;
  cb.addEventListener('change', () => {
    checkpoint();
    const V = vs(el);
    if (cb.checked) {
      V.cw = { coh: el.coh, lineshape: el.lineshape };
      el.tau = V.lastTau > 0 ? V.lastTau : 100;
      applyPulse(el);
    } else {
      V.lastTau = el.tau; el.tau = 0;
      if (V.cw) { el.coh = V.cw.coh; el.lineshape = V.cw.lineshape; }
    }
    changed(true);
  });
  return h('label', { class: 'rt-check' }, cb, 'Pulsed: a mode-locked laser');
}
/* is any laser pulsed? then screens, photodiodes and fibre tips offer the pulse */
const anyPulse = () => project.elements.some(e => (e.type === 'source' || (e.type === 'fcomp' && e.kind === 'laser')) && e.tau > 0);
/* the pulse a source launches, at the laser: bandwidth, coherence, energy and peak power */
export function pulseLine(el) {
  const P = el.tau > 0 ? el : null;
  if (!P) return 'A duration of 0 is a continuous laser. Give a mode-locked laser its pulse duration (the FWHM at its transform limit) and the tool traces ' + PULSE_SAMPLES + ' wavelengths across its spectrum to work out what the optics do to the pulse: see the Pulse tab of a screen, or a photodiode.';
  const dnu = pulseDnu(P), dl = P.wavelength * P.wavelength * 1e-9 * dnu / 299792458;
  const E = (P.power || 0) * 1e-3 / (P.rep * 1e6), pk = (P.pshape === 'gauss' ? 0.9394 : 0.8814) * E / (P.tau * 1e-15);
  const x = 4 * Math.LN2 * (P.gdd0 || 0) / (P.tau * P.tau);
  return 'Bandwidth ' + (+dl.toPrecision(3)) + ' nm (' + fmtHz(dnu) + ', FWHM), so a coherence length of ' + fmtLen(C_MM / dnu) + ': that sets the line, Gaussian, and fringes between paths wash out as a white-light interferometer\u2019s do. ' +
    'Pulse energy ' + fmtJ(E) + ' at ' + fmtW(E * P.rep * 1e6) + ' average; peak power ' + fmtW(pk) + ' at the transform limit.' +
    (P.gdd0 ? ' With that chirp it leaves ' + fmtFs(P.tau * Math.sqrt(1 + x * x)) + ' long.' : '');
}
export function screenPanel(el) {
  if (readoutTabs(el, [['params', 'Screen'], ['rays', 'Rays'], ['aber', 'Aberrations'], ['plots', 'Diffraction'], ['pulse', 'Pulse'], ['trap', 'Trap'], ...(modReadouts('screen').length ? [['mods', 'Mods']] : [])])) return;
  screenParams(el);
}
/* The tabs of an element that reads the light arriving at it (a screen, a mirror's face):
   its own settings first, then the readouts. Draws the open readout and returns true, or
   false to leave the settings to the caller. */
export function readoutTabs(el, stabs) {
  const tabs = h('div', { class: 'rt-tabs' });
  // every tab is always there; one with nothing to show here is greyed, and says why
  if (!stabs.some(([k]) => k === vs(el).screenTab)) vs(el).screenTab = 'params';
  const btns = {}, what = el.type === 'screen' ? 'this screen' : 'this ' + typeLabel(el).toLowerCase();
  for (const [key, label] of stabs) {
    btns[key] = h('button', { class: 'rt-tab' + (vs(el).screenTab === key ? ' on' : ''), type: 'button',
      onclick: () => { vs(el).screenTab = key; renderPanel(); } }, label);
    tabs.append(btns[key]);
  }
  bindSync(tabs, () => {
    const all = (lastTrace.screens && lastTrace.screens[el.id]) || [];
    const why = {
      rays: all.some(t => !t.chief) ? '' : 'No rays of a fan reach ' + what + ' (a source with \u201cTrace the ray fan\u201d on)',
      aber: all.some(t => !t.chief) ? '' : 'No rays of a fan reach ' + what + ' to sweep across the field',
      plots: all.length ? '' : 'Nothing reaches ' + what,
      pulse: ((lastTrace.pulses && lastTrace.pulses[el.id]) || []).length ? '' : 'No pulse reaches ' + what + ' (a source or fibre laser with \u201cPulsed\u201d ticked)',
      trap: all.some(t => t.chief) ? '' : 'No Gaussian beam reaches ' + what + ' (a source with \u201cPropagate a Gaussian beam\u201d on)',
    };
    for (const [k, w] of Object.entries(why)) if (btns[k]) { btns[k].classList.toggle('empty', !!w); btns[k].title = w; }
  });
  panel.append(tabs);
  const tab = vs(el).screenTab;
  if (tab === 'plots') { screenPlots(el); return true; }
  if (tab === 'rays') { rayPlots(el); return true; }
  if (tab === 'aber') { aberSection(el); return true; }
  if (tab === 'pulse') { pulseSection(el); return true; }
  if (tab === 'trap') { trapSection(el); return true; }
  if (tab === 'mods') { modReadoutSection(el); return true; }                   // the mods' readouts
  return false;
}
function screenParams(el) {

  panel.append(h('h3', null, 'Screen'));
  const stop = h('input', { type: 'checkbox' });
  stop.checked = el.absorb;
  stop.addEventListener('change', () => { checkpoint(); el.absorb = stop.checked; changed(false); });
  // flat or curved: a curved screen takes a radius, and remembers it while flat
  const srows = h('div', { class: 'rt-rows' },
    param('Length (mm)', el, 'length'),
    selectField('Shape', [['flat', 'Flat'], ['curved', 'Curved']], () => el.R ? 'curved' : 'flat', v => {
      if (v === 'curved') el.R = vs(el).lastR || -100;
      else { if (el.R) vs(el).lastR = el.R; el.R = null; }
    }));
  if (el.R) srows.append(param('Radius (mm)', el, 'R', { wide: true }));
  srows.append(h('label', { class: 'rt-check wide' }, stop, 'Stop the rays it records'));
  // its diffraction pattern on its face, in the 3D view
  {
    const fm = h('input', { type: 'checkbox' });
    fm.checked = !!el.faceMap;
    fm.addEventListener('change', () => { checkpoint(); if (fm.checked) el.faceMap = true; else delete el.faceMap; changed(false); });
    srows.append(h('label', { class: 'rt-check wide', title: 'Paints the irradiance map from its Diffraction tab onto the screen\u2019s face in the 3D view, where the light lands on it, in the same colours and scale.' }, fm, 'Show its diffraction pattern on its face (3D view)'));
  }
  panel.append(srows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'The screen records rays arriving on its ticked face; rays reaching it from behind pass straight through. Untick the box to sample a beam without blocking it, which is how to measure a cavity. Its length is how far it reaches across the bench, which sets what it catches and the span of its plots.' +
    (el.R ? ' The radius curves it: negative puts the centre of curvature on the side the light comes from (a retina, or a surface curved round a focus so every point is the same distance from it), positive bulges towards the light (a curved image field).' : ' Make it curved for a retina, a curved image field or a surface the same distance from a focus all round.')));
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'screen' }));
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => exportScreen(el) }, 'Export data (CSV)')));
}

const RAY_PLOTS = [
  ['spot', 'Spot diagram: across and up'],
  ['power', 'Power of each ray against position'],
  ['phase', 'Phase against position'],
  ['wave', 'Wavefront error against position'],
  ['fan', 'Ray fan: position against pupil'],
  ['angle', 'Arrival angle against position'],
  ['opl', 'Optical path against position'],
];
function rayPlots(el) {
  const st = screenStats(el);
  if (!RAY_PLOTS.some(([v]) => v === vs(el).rayView)) vs(el).rayView = 'power';
  const sel = h('select', { id: 'rtf' + (setFid(fid + 1)) });
  for (const [v, t] of RAY_PLOTS) sel.append(h('option', { value: v }, t));
  sel.value = vs(el).rayView;
  sel.addEventListener('change', () => { vs(el).rayView = sel.value; renderPanel(); });
  const rows = h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: sel.id }, 'Plot'), sel));
  panel.append(rows);

  const cv = h('canvas', { height: '170', style: 'width:100%;display:block' });
  const note = h('p', { class: 'note', style: 'margin-top:0.4rem' });
  const getZ = () => plotZoom(el, 'ray-' + vs(el).rayView), redraw = () => drawRayPlot(cv, note, el);
  panel.append(h('div', { style: 'margin-top:0.35rem' }, plotFrame(cv, () => 'ray-' + vs(el).rayView, getZ, redraw)),
    zoomControls(cv, getZ, redraw, () => vs(el).rayView === 'power'), note);
  bindSync(cv, () => drawRayPlot(cv, note, el));
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => exportScreen(el) }, 'Export data (CSV)')));
}

const ABER_PLOTS = [
  ['spots', 'Spot diagram across the field'],
  ['fan', 'Ray fans: landing point against pupil'],
  ['wave', 'Wavefront error against pupil'],
  ['curv', 'Field curvature: best focus against field'],
  ['dist', 'Distortion against field'],
  ['rms', 'RMS wavefront error against field'],
];
function aberSection(el) {
  const { list, src } = aberSource(el);
  if (!ABER_PLOTS.some(([v]) => v === vs(el).aberView)) vs(el).aberView = 'spots';
  const point = src && Math.abs(src.divergence) > 1e-9;
  const rows = h('div', { class: 'rt-rows' },
    selectField('Source', list.map(e => [e.id, e.name]), () => (src ? src.id : ''), v => { el.abSrc = v; }, { wide: true }),
    point ? param('Object height (±mm)', el, 'abH') : param('Field angle (±°)', el, 'abAng'),
    param('Fields', el, 'abN'),
    param('Rays per field', el, 'abRays'));
  panel.append(rows);
  const sel = h('select', { id: 'rtf' + (setFid(fid + 1)) });
  for (const [v, t] of ABER_PLOTS) sel.append(h('option', { value: v }, t));
  sel.value = vs(el).aberView;
  sel.addEventListener('change', () => { vs(el).aberView = sel.value; renderPanel(); });
  panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' }, h('div', { class: 'rt-f wide' }, h('label', { for: sel.id }, 'Plot'), sel)));
  const cv = h('canvas', { height: '200', style: 'width:100%;display:block' });
  const note = h('p', { class: 'note', style: 'margin-top:0.4rem' });
  const box = h('div', { class: 'rt-readout' });
  const getZ = () => plotZoom(el, 'aber-' + vs(el).aberView), redraw = () => drawAberPlot(cv, note, el);
  panel.append(h('div', { style: 'margin-top:0.35rem' }, plotFrame(cv, () => 'aber-' + vs(el).aberView, getZ, redraw)),
    zoomControls(cv, getZ, redraw), note, box);
  let sig = '';
  bindSync(cv, () => {
    drawAberPlot(cv, note, el);
    const A = aberrations(el), s2 = A ? aberCache.key : 'none';
    if (s2 === sig) return;
    sig = s2;
    box.replaceChildren(...aberReadout(el, A));
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'The source is traced again at each field, ' +
    (point ? 'moved across by an object height and aimed back' : 'turned by a field angle') + ' about where its axis first meets an element that bends or cuts the light; with a stop further along, each field\u2019s chief ray is aimed through its centre, so the aperture stop stays filled wherever it is. ' +
    'On this screen, for each field: the chief ray (the fan’s middle) against its paraxial height gives the distortion; the spread about it the spot; the best focus along the normal the tangential field curve. ' +
    'The wavefront is each ray’s optical path carried back to a sphere about where the chief ray lands, through the last element it met (the exit pupil, near enough), in waves: positive where the wave leads, so a positive W040 is under-corrected. The pupil coordinate runs the same way as the image height, as in Welford\u2019s and lens design codes\u2019 convention, so the signs of coma and distortion are the usual ones. ' +
    'Zernike terms are fitted along the meridian (fringe numbering, the tangential ones), and Seidel’s across the fields; H is the field over its largest. The bench is 2D, so this is the tangential section only: astigmatism and field curvature show together as W22T, a focus that moves with the field. One wavelength (the first) down the path most rays take.'));
}
function aberReadout(el, A) {
  if (!A) return [h('p', { class: 'note' }, 'No rays of a fan reach this screen.')];
  const ok = A.fields.filter(f => f.ok);
  if (!ok.length) return [h('p', { class: 'note' }, 'Too few rays of ' + A.srcName + ' reach this screen at any field (five or more are needed).')];
  const w = v => isFinite(v) ? (Math.abs(v) < 5e-6 ? '0' : Math.abs(v) >= 100 ? v.toFixed(0) : (+v.toPrecision(3)).toString()) + ' λ' : '–';
  const fld = f => A.point ? fmtLen(Math.abs(f)).replace(/^/, f < 0 ? '−' : '') : (+f.toPrecision(3)) + '°';
  const f0 = ok.reduce((b, f) => Math.abs(f.H) < Math.abs(b.H) ? f : b);
  const rows = [
    ['Swept', A.srcName + ', ' + A.fields.length + ' fields to ' + (A.point ? '±' + fmtLen(A.max) + ' object height' : '±' + A.max + '°') + ', ' + A.rays + ' rays each, at ' + (+A.nm.toPrecision(5)) + ' nm'],
    ['Aperture', 'NA ' + (+f0.na.toPrecision(3)) + ' (f/' + (+(1 / (2 * Math.tan(Math.asin(Math.min(0.999, f0.na / f0.nImg))))).toPrecision(3)) + ') on axis; exit pupil ' + fmtLen(f0.R) + ' back'],
  ];
  if (A.seidel) {
    const S = A.seidel;
    rows.push(['Seidel', 'W040 ' + w(S.W040) + ' spherical · W131 ' + w(S.W131) + ' coma · W22T ' + w(S.W22T) + ' astigmatism and field curvature · W311 ' + w(S.W311) + ' distortion · W020 ' + w(S.W020) + ' focus on axis']);
    rows.push(['Distortion', (+S.distPct.toPrecision(3)) + '% at the edge of the field']);
    const edge = ok.reduce((b, f) => Math.abs(f.H) > Math.abs(b.H) ? f : b);
    rows.push(['Best focus', fmtLen(Math.abs(f0.dz)) + (f0.dz >= 0 ? ' before' : ' past') + ' the screen on axis; at the edge of the field ' + fmtLen(Math.abs(edge.curv)) + (edge.curv >= 0 ? ' nearer the optics' : ' further on') + ' than that']);
  }
  const dl = h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]));
  const tab = h('table', { class: 'rt-sens' }, h('tr', null, ...['Field', 'Distortion', 'RMS spot', 'Best focus', 'RMS W', 'Strehl'].map(t => h('th', null, t))));
  for (const f of A.fields) tab.append(h('tr', null, h('td', { class: 'n' }, fld(f.f)),
    ...(f.ok ? [(+f.distPct.toPrecision(3)) + '%', fmtLen(f.rms), (f.dz >= 0 ? '+' : '−') + fmtLen(Math.abs(f.dz)), w(f.rmsW), f.rmsWbest < 0.25 ? (+f.strehl.toPrecision(3)).toString() : '–']
      : ['too few rays', '', '', '', '']).map(t => h('td', { class: 'n' }, t))));
  const zt = h('table', { class: 'rt-sens' }, h('tr', null, h('th', null, 'Field'), ...ok[0].zern.slice(1).map(z => h('th', { title: z.what }, z.name + ' ' + z.what))));
  for (const f of ok) zt.append(h('tr', null, h('td', { class: 'n' }, fld(f.f)), ...f.zern.slice(1).map(z => h('td', { class: 'n' }, w(z.c)))));
  const scroll = t => h('div', { style: 'overflow-x:auto;max-width:100%' }, t);
  return [dl, scroll(tab), h('p', { class: 'note' }, 'Best focus: how far before the screen (+) the fan is narrowest. Strehl ratio from the RMS wavefront error about the best focus, exp(−(2πσ)²), where that is small. Zernike terms along the meridian, in waves:'), scroll(zt)];
}
function drawAberPlot(cv, note, el) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 200;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
  cv._full = null; cv._csv = null;
  const A = aberrations(el), view = vs(el).aberView;
  const ok = A ? A.fields.filter(f => f.ok) : [];
  if (!ok.length) { note.textContent = A ? 'Too few rays reach this screen.' : 'No rays of a fan reach this screen.'; return; }
  const fT = A.point ? { kind: 'len', title: 'object height' } : { kind: 'plain', title: 'field angle, °' };
  const col = H => { const t = (H + 1) / 2; return 'hsl(' + Math.round(220 - 220 * t) + ',70%,' + (45 - 10 * Math.abs(H)) + '%)'; };
  let series = [], sx, sy, lines = false, text = '';
  if (view === 'spots') {
    series = ok.map(f => ({ H: f.H, pts: f.spot.map(v => [v, f.f]) }));
    sx = { kind: 'len', title: 'from the chief ray' }; sy = fT;
    text = 'Where each ray lands, from the chief ray, one row a field: the full-field spot diagram of the tangential section.';
  } else if (view === 'fan') {
    series = ok.map(f => ({ H: f.H, pts: f.rho.map((r, i) => [r, f.spot[i]]) })); lines = true;
    sx = { kind: 'plain', title: 'pupil, ρ' }; sy = { kind: 'len', title: 'landing point from the chief ray' };
    text = 'Transverse ray aberration against pupil coordinate, a line a field (blue to red, one edge of the field to the other).';
  } else if (view === 'wave') {
    series = ok.map(f => ({ H: f.H, pts: f.rho.map((r, i) => [r, f.W[i]]) })); lines = true;
    sx = { kind: 'plain', title: 'pupil, ρ' }; sy = { kind: 'plain', title: 'wavefront error, waves' };
    text = 'The wavefront against the sphere about each field’s chief ray landing point, a line a field.';
  } else if (view === 'curv') {
    series = [{ H: 0, pts: ok.filter(f => isFinite(f.curv)).map(f => [f.f, f.dz]) }]; lines = true;
    sx = fT; sy = { kind: 'len', title: 'best focus before the screen' };
    text = 'The tangential field curve: where each field’s fan is narrowest, before the screen (+) or past it.';
  } else if (view === 'dist') {
    series = [{ H: 0, pts: ok.map(f => [f.f, f.distPct]) }]; lines = true;
    sx = fT; sy = { kind: 'plain', title: 'distortion, %' };
    text = 'The chief ray’s height against the paraxial one, as a percentage of it.';
  } else {
    series = [{ H: 0, pts: ok.map(f => [f.f, f.rmsW]) }, { H: 1, pts: ok.map(f => [f.f, f.rmsWbest]) }]; lines = true;
    sx = fT; sy = { kind: 'plain', title: 'RMS wavefront error, waves' };
    text = 'RMS wavefront error at the screen (blue) and at each field’s best focus (red); 0.07 waves is the Maréchal criterion for diffraction-limited.';
  }
  const all = series.flatMap(S => S.pts).filter(q => isFinite(q[0]) && isFinite(q[1]));
  plotCsv(cv, el.name + ' ' + view, ['x', 'y', 'field'], series.flatMap(S => S.pts.map(q => [q[0], q[1], S.H])));
  if (!all.length) { note.textContent = 'Nothing to show.'; return; }
  let x0 = Math.min(...all.map(q => q[0])), x1 = Math.max(...all.map(q => q[0])), y0 = Math.min(...all.map(q => q[1])), y1 = Math.max(...all.map(q => q[1]));
  if (x1 - x0 < 1e-12) { const m = Math.abs(x0) * 0.1 + 1e-6; x0 -= m; x1 += m; }
  if (y1 - y0 < 1e-12) { const m = Math.abs(y0) * 0.1 + 1e-6; y0 -= m; y1 += m; }
  if (view === 'spots') { const m = (y1 - y0) / Math.max(2, ok.length - 1) * 0.6; y0 -= m; y1 += m; }
  const Z = plotZoom(el, 'aber-' + view), [xa, xb] = zoomRange(Z, 'x', x0, x1), [ya, yb] = zoomRange(Z, 'y', y0, y1);
  const Ar = plotArea(c, w, hgt, [ya, yb], sy);
  cv._area = Ar; cv._full = { x: [x0, x1], y: [y0, y1] };
  const X = v => Ar.l + (v - xa) / (xb - xa) * Ar.w, Y = v => Ar.t + Ar.h - (v - ya) / (yb - ya) * Ar.h;
  c.save(); c.beginPath(); c.rect(Ar.l, Ar.t - 3, Ar.w + 3, Ar.h + 6); c.clip();
  if (ya < 0 && yb > 0) { c.strokeStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.moveTo(Ar.l, Y(0)); c.lineTo(Ar.l + Ar.w, Y(0)); c.stroke(); }
  for (const S of series) {
    const cS = series.length === 1 ? getCss('--jek-cyan') : col(S.H);
    c.strokeStyle = cS; c.fillStyle = cS; c.lineWidth = 1.4;
    if (lines) { c.beginPath(); S.pts.forEach(([x, y], i) => { if (i) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y)); }); c.stroke(); }
    if (!lines || series.length === 1) for (const [x, y] of S.pts) { c.beginPath(); c.arc(X(x), Y(y), view === 'spots' ? 1.6 : 2.2, 0, 2 * Math.PI); c.fill(); }
  }
  c.restore();
  drawAxes(c, Ar, [xa, xb], [ya, yb], sx, sy);
  updateSyncButtons();
  note.textContent = text;
}

function drawRayPlot(cv, note, el) {
  const all = (lastTrace.screens[el.id] || []).filter(t => !t.chief);
  const st = screenStats(el);
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 280, hgt = 170;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
  cv.style.height = hgt + 'px';
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hgt);
  cv._full = null; cv._csv = null;
  updateSyncButtons();
  if (!all.length || !st || st.empty) { note.textContent = 'Nothing has reached this screen.'; return; }

  const lam = (st.nm || 633) * 1e-6;
  const centroid = st.centroid;

  const Z = plotZoom(el, 'ray-' + vs(el).rayView);
  let pts = [], xl = 'position (mm)', yl = '', sx = { kind: 'len' }, sy = { kind: 'plain' };
  if (vs(el).rayView === 'spot') {
    // where each ray lands on the face, across it and up it (up is the beam height on a 2D bench)
    pts = all.map(t => [t.y, t.z || 0]); xl = 'across (mm)'; yl = 'up (mm)'; sx = { kind: 'len', title: 'across' }; sy = { kind: 'len', title: 'up' };
  } else if (vs(el).rayView === 'power') {
    pts = all.map(t => [t.y, t.w]); yl = 'power per ray'; sy.title = 'power per ray';
  } else if (vs(el).rayView === 'phase') {
    pts = all.map(t => [t.y, ((t.opl / lam) % 1 + 1) % 1]); yl = 'phase (waves, wrapped)'; sy.title = 'phase, waves (wrapped)';
  } else if (vs(el).rayView === 'wave') {
    const front = all.filter(t => t.nm === st.nm);
    const L = front.map(t => t.opl + t.n * (centroid - t.y) * t.dly);
    const mean = L.reduce((a, b) => a + b, 0) / (L.length || 1);
    pts = front.map((t, i) => [t.y, (L[i] - mean) / lam]); yl = 'wavefront error (waves)'; sy.title = 'wavefront error, waves';
  } else if (vs(el).rayView === 'fan') {
    pts = all.map(t => [t.k, t.y - centroid]); xl = 'ray number across the fan'; yl = 'position from centroid (mm)';
    sx = { kind: 'plain', title: 'ray number' }; sy = { kind: 'len', title: 'from the centroid' };
  } else if (vs(el).rayView === 'angle') {
    pts = all.map(t => [t.y, Math.asin(clamp(t.dly, -1, 1)) / deg]); yl = 'angle from the normal (deg)'; sy.title = 'angle from the normal, °';
  } else {
    pts = all.map(t => [t.y, t.opl]); yl = 'optical path (mm)'; sy = { kind: 'len', title: 'optical path' };
  }
  pts = pts.filter(q => isFinite(q[0]) && isFinite(q[1]));
  plotCsv(cv, el.name + ' ' + yl.replace(/ \(.*\)$/, ''), [xl, yl], pts);
  if (!pts.length) { note.textContent = 'That plot has nothing to show for these rays.'; return; }

  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < 1e-12) { x0 -= 1; x1 += 1; }
  if (y1 - y0 < 1e-12) { y0 -= Math.abs(y0 || 1) * 0.1 + 1e-9; y1 += Math.abs(y1 || 1) * 0.1 + 1e-9; }
  const [xa, xb] = zoomRange(Z, 'x', x0, x1), [ya, yb] = zoomRange(Z, 'y', y0, y1);
  const A = plotArea(c, w, hgt, [ya, yb], sy);
  cv._area = A; cv._full = { x: [x0, x1], y: [y0, y1] };
  const X = v => A.l + (v - xa) / (xb - xa) * A.w;
  const Y = v => A.t + A.h - (v - ya) / (yb - ya) * A.h;
  c.save(); c.beginPath(); c.rect(A.l, A.t - 3, A.w + 3, A.h + 6); c.clip();
  if (ya < 0 && yb > 0) {
    c.strokeStyle = 'rgba(0,0,0,0.15)';
    c.beginPath(); c.moveTo(A.l, Y(0)); c.lineTo(A.l + A.w, Y(0)); c.stroke();
  }
  c.fillStyle = getCss('--jek-cyan');
  for (const [x, y] of pts) { const px = X(x), py = Y(y); if (px < A.l - 3 || px > A.l + A.w + 3) continue; c.beginPath(); c.arc(px, py, 1.8, 0, Math.PI * 2); c.fill(); }
  c.restore();
  drawAxes(c, A, [xa, xb], [ya, yb], sx, sy);
  updateSyncButtons();
  note.textContent = yl + ' against ' + xl + ', ' + pts.length + ' rays' +
    (st.mixed && vs(el).rayView !== 'power' ? ', one wavelength only' : '') + '.' +
    (vs(el).rayView === 'spot' ? (all.some(t => t.z) ? ' Every ray is traced exactly in 3D, up and down as across, so the spot shows the aberrations as they are.'
      : ' Every ray lands at the beam height: give a source a pattern across the beam (a cross, a grid or hexapolar rings, with the 3D view on) to spread them up and down.') : '');
}

function screenPlots(el) {
  panel.append(h('div', { class: 'rt-rows' }, param('MTF quoted at (lp/mm)', el, 'mtfFreq', { wide: true }),
    selectField('Focus model', [['auto', 'Vector when steep (NA above 0.3)'], ['on', 'Always vector'], ['off', 'Paraxial only']],
      () => el.vectorFocus, v => { el.vectorFocus = v; }, { wide: true })));
  diffractionSection(el);
  panel.append(h('div', { class: 'rt-actions' },
    h('button', { class: 'rt-btn', onclick: () => exportScreen(el) }, 'Export data (CSV)')));
}

export function coatingRows(el, holder, label) {
  const box = h('div', null);
  const rows = h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' },
    selectField(label || 'Coating',
      [['bare', 'Bare glass (Fresnel)'], ['ar', 'AR coated'], ['band', 'Coated over a band'],
        ['custom', 'Custom reflectance'], ['stack', 'Thin-film stack']],
      () => holder.coat.mode,
      v => {
        const keep = holder.coat;
        holder.coat = normCoat({ mode: v, R: v === 'ar' ? 0.5 : keep.R, design: keep.design, layers: keep.layers,
          lo: keep.lo, hi: keep.hi, label: keep.label });
        if (v === 'stack' && !holder.coat.layers.length) holder.coat.layers = coatPreset('mgf2', holder.coat.design);
      },
      { wide: holder.coat.mode === 'bare' }));
  if (holder.coat.mode === 'ar' || holder.coat.mode === 'custom') rows.append(param('Reflectance (%)', el, coatPath(el, holder) + '.R'));
  if (holder.coat.mode === 'band') {
    const base = coatPath(el, holder);
    rows.append(param('Reflectance in band (%)', el, base + '.R', { wide: true }),
      param('From (nm)', el, base + '.lo'), param('To (nm)', el, base + '.hi'));
  }
  box.append(rows);
  if (holder.coat.mode === 'band') {
    box.append(h('p', { class: 'note', style: 'margin-top:0.4rem' },
      (holder.coat.label ? holder.coat.label + '. ' : '') +
      'Inside the band the surface reflects this much; outside it the coating is ignored and the bare glass is traced.'));
  }
  if (holder.coat.mode === 'stack') box.append(stackRows(el, holder));
  return box;
}

function stackRows(el, holder) {
  const base = coatPath(el, holder);
  const coat = holder.coat;
  const box = h('div', { class: 'rt-stack' });
  const pre = h('select', { id: 'rtf' + (setFid(fid + 1)) });
  for (const [v, t] of [['', 'Choose a design\u2026'], ['mgf2', 'MgF2 single layer'], ['vcoat', 'Two-layer V-coat'],
    ['bs5050', 'Three-layer 50:50 splitter'], ['hr', 'HR stack, 6 pairs']]) pre.append(h('option', { value: v }, t));
  pre.value = '';
  pre.addEventListener('change', () => {
    if (!pre.value) return;
    checkpoint();
    coat.layers = coatPreset(pre.value, coat.design);
    changed(true);
  });
  box.append(h('div', { class: 'rt-rows' },
    param('Design wavelength (nm)', el, base + '.design', { wide: true }),
    h('div', { class: 'rt-f wide' }, h('label', { for: pre.id }, 'Preset'), pre)));

  coat.layers.forEach((L, k) => {
    const sel = h('select', { id: 'rtf' + (setFid(fid + 1)) });
    for (const [v, t] of COAT_MATERIALS) sel.append(h('option', { value: String(+v) }, t));
    if (!COAT_MATERIALS.some(m => Math.abs(+m[0] - L.n) < 1e-9)) {
      sel.append(h('option', { value: String(+L.n) }, 'n = ' + (+L.n.toPrecision(4))));
    }
    sel.value = String(+L.n);
    sel.addEventListener('change', () => { checkpoint(); L.n = +sel.value; changed(false); });
    const row = h('div', { class: 'rt-rows rt-layer' },
      h('div', { class: 'rt-f' }, h('label', { for: sel.id }, 'Layer ' + (k + 1) + ' material'), sel),
      param('Thickness (nm)', el, base + '.layers.' + k + '.d'),
      h('div', { class: 'rt-inline wide' },
        h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); L.d = qwot(L.n, coat.design); changed(true); } }, 'Quarter wave'),
        h('button', { class: 'rt-link', type: 'button', onclick: () => { checkpoint(); coat.layers.splice(k, 1); changed(true); } }, 'Remove')));
    box.append(row);
  });
  box.append(h('div', { class: 'rt-inline', style: 'margin-top:0.4rem' },
    h('button', { class: 'rt-link', type: 'button', onclick: () => {
      checkpoint(); coat.layers.push({ n: 1.38, d: qwot(1.38, coat.design) }); changed(true);
    } }, 'Add a layer')));

  const note = h('p', { class: 'note', style: 'margin-top:0.5rem' });
  bindSync(note, () => {
    const nm = refNm();
    const n2 = refIndex(el.type === 'lens' ? (el.materials[0] || { glass: 'AIR' }) : el.material, nm);
    const rs = stackAmp(coat.layers, 1, n2, 1, nm, 's');
    const R = 100 * (rs[0] * rs[0] + rs[1] * rs[1]);
    note.textContent = 'Layers run from the outside in, and a ray arriving through the glass meets them in reverse. ' +
      'At normal incidence and ' + nm + ' nm this stack reflects ' + (+R.toPrecision(3)) + '%.';
  });
  box.append(note);
  return box;
}

function coatPath(el, holder) {
  if (el.type === 'lens') return 'surfaces.' + el.surfaces.indexOf(holder) + '.coat';
  return 'coat';
}

function materialRows(el) {
  const m = el.material;
  const rows = h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' },
    selectField('Material', materialOptions(m), () => glassKey(m.glass) || m.glass, v => {
      if (v === 'import') { askForMaterial(mm => { el.material = mm; changed(true); }); return; }
      removeSweeps(el, 'material.');
      el.material = pickMaterial(v, m);
    }, { wide: m.glass !== 'custom' }));
  if (m.glass === 'custom') rows.append(param('Index n', el, 'material.n'));
  if (unknownGlass(m)) rows.append(unknownGlassNote(m));
  rows.append(param('Absorption (per mm)', el, 'material.abs', { wide: true }));
  return rows;
}
function blockNote(el) {
  const wl = project.elements.find(e => e.type === 'source');
  const nm = wl ? wl.wavelength : 587.6;
  return h('p', { style: 'margin-top:0.6rem' }, matLabel(el.material) + ' n = ' + refIndex(el.material, nm).toFixed(4) + ' at ' + fmtWl(nm) + '.' +
    (el.source ? ' Imported from ' + el.source + '.' : ''));
}
export const readoutBox = kind => h('div', { class: 'rt-readout', 'data-readout': kind });
export function gratingPanel(el) {
  panel.append(h('h3', null, 'Grating'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Type', [['reflect', 'Reflection'], ['transmit', 'Transmission']], () => el.mode, v => { el.mode = v; }, { wide: true }),
    param('Lines per mm', el, 'lpmm'), param('Width (mm)', el, 'length'),
    param('Blaze (nm)', el, 'blaze'), param('Efficiency (%)', el, 'eff')));
  panel.append(readoutBox('grating'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each ray leaves in every order that can propagate, along the grating equation sinθₘ = sinθᵢ + mλ/d, each carrying its share of the power; the diffracted field follows each order the same way. The grooves are a sawtooth blazed for the blaze wavelength in order +1, so that is where the power goes there, falling off either side. Peak efficiency covers what the real surface absorbs and scatters.'));
}
export function fibrePanel(el) {
  panel.append(h('h3', null, 'Fibre'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Type', [['sm', 'Single mode'], ['mm', 'Multimode']], () => el.mm ? 'mm' : 'sm', v => {
      el.mm = v === 'mm';
      // the usual fibres of each kind, where the core still has the other kind's size
      if (el.mm && el.core < 20) { el.core = 50; el.na = 0.22; } else if (!el.mm && el.core >= 20) { el.core = 4.4; el.na = 0.12; }
    }, { wide: true }),
    param('Core (µm)', el, 'core'), param('NA', el, 'na'),
    param('Ferrule face (mm)', el, 'length', { wide: true })));
  panel.append(h('h3', null, 'Light from the fibre network'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Rays', el, 'emitRays'),
    // across the beam: the line of the 2D bench, or up and down it too (in 3D), as a source's
    selectField('Rays across the beam', RAY_PATTERNS, () => el.emitPattern || 'line', v => { if (v === 'line') delete el.emitPattern; else el.emitPattern = v; }, { wide: true })));
  panel.append(readoutBox('fibre'));
  if (anyPulse()) pulseSection(el); else pulseSectionEmpty();
  if (el.mm) panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A multimode fibre (50 or 62.5 \u00b5m core, NA 0.22 or 0.275 are usual): it takes in whatever lands on its core inside its acceptance cone, so it is forgiving to align, and sends light out filling its core and NA, a beam of M\u00b2 = \u03c0 a NA / \u03bb (capped at 30). Joined to the network, what it carries keeps its power; its polarisation and phase are scrambled (set the fibre joined to it to Multimode), and the speckle a real one makes is not modelled: think of its output as speckle averaged.'));
  else panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Takes in the overlap of the light arriving on its face with its own mode, for each polarisation, with the beams of one launch added as fields first. The mode size comes from the core and NA (Marcuse’s formula for the fundamental mode), so offset, tilt, a mismatched waist and a wrong focus all cost what they should. It needs a Gaussian source; a ray fan has no field to overlap.'));
}
/* an RF feed horn, sending or receiving: its frequency and power (a source), its type and size;
   the beam it launches, or takes in, from those (Goldsmith's fit of the aperture's field) */
export function rfHornPanel(el) {
  const tx = el.type === 'source';
  panel.append(h('h3', null, tx ? 'Feed horn' : 'Receiving horn'));
  const rows = h('div', { class: 'rt-rows' });
  if (tx) rows.append(param('Frequency (GHz)', el, 'mmw.ghz'), param('Power (dBm)', el, 'mmw.dbm'));
  rows.append(
    selectField('Horn', Object.entries(RF_HORNS).map(([k, v]) => [k, v.name]), () => el.mmw.kind, v => { el.mmw.kind = v; applyRf(el); }, { wide: true }),
    param(el.mmw.kind === 'diagonal' ? 'Aperture half-side (mm)' : 'Aperture radius (mm)', el, 'mmw.a'),
    param('Slant length (mm)', el, 'mmw.L'));
  panel.append(rows);
  if (!tx) {
    panel.append(h('h3', null, 'Detector'));
    panel.append(h('div', { class: 'rt-rows' },
      param('Responsivity (A/W)', el, 'resp'), param('Gain (V/A)', el, 'gain'),
      param('Bandwidth (Hz)', el, 'bandwidth'), param('Noise (pA/√Hz)', el, 'ampNoise')));
  }
  panel.append(readoutBox('rfhorn'));
  if (!tx) signalSection(el);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, tx
    ? 'Launches the Gaussian beam that best fits the field across its aperture: its waist sits a little behind the aperture, and the rest of the power (the share outside that Gaussian) goes into sidelobes, which are left out. The beam then goes through the bench as any Gaussian does: lenses of the RF dielectrics, mirrors, wire grids.'
    : 'Takes in the overlap of the field arriving on its aperture with its own mode (the beam it would launch, sent backwards), so a wrong size, a wrong focus, an offset or a tilt each cost what they should. The power taken in is read by a detector of fixed responsivity.'));
}
export function detectorPanel(el) {
  panel.append(h('h3', null, el.diode ? 'Photodiode' : 'Photodetector'));
  const rows = h('div', { class: 'rt-rows' },
    param('Diameter (mm)', el, 'length'),
    selectField('Material', Object.entries(DETECTOR_MATERIALS).map(([k, v]) => [k, v.name]), () => el.material, v => { el.material = v; }));
  if (el.material === 'custom') rows.append(param('Responsivity (A/W)', el, 'resp', { wide: true }));
  panel.append(rows);
  if (el.diode) panel.append(h('div', { class: 'rt-rows' }, param('Bandwidth (Hz)', el, 'bandwidth'), param('Dark (nA)', el, 'dark')));   // a bare diode: no amplifier
  else {
    panel.append(h('h3', null, 'Amplifier'));
    panel.append(h('div', { class: 'rt-rows' },
      param('Gain (V/A)', el, 'gain'), param('Bandwidth (Hz)', el, 'bandwidth'),
      param('Dark (nA)', el, 'dark'), param('Noise (pA/√Hz)', el, 'ampNoise'),
      param('Output limit (V)', el, 'vmax', { wide: true })));
  }
  panel.append(readoutBox('detector'));
  signalSection(el);
  if (anyPulse()) pulseSection(el); else pulseSectionEmpty();
  if (modReadouts('detector').length) modReadoutSection(el);                     // the mods' readouts
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Integrates the light over the active area: Gaussian beams as fields, so beams of one launch interfere on it and a beam larger than the diode is clipped; ray fans ray by ray. Set each source’s power in its own panel. Noise is shot noise on the photocurrent and dark current, the gain resistor’s Johnson noise and the amplifier’s input current noise, over the bandwidth.'));
}
export function faradayPanel(el) {
  const iso = el.type === 'isolator';
  panel.append(h('h3', null, iso ? 'Isolator' : 'Faraday rotator'));
  const rows = h('div', { class: 'rt-rows' }, param('Aperture (mm)', el, 'length'));
  if (iso) rows.append(param('Extinction (dB)', el, 'extinction'), param('Input polariser from p (°)', el, 'axis', { wide: true }));
  else rows.append(param('Rotation (°)', el, 'rotation'));
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, iso
    ? 'A polariser, a 45° Faraday rotator and a second polariser at 45° to the first. Light going the way of the arrow passes; light coming back is turned a further 45° and stopped, as far as the extinction ratio allows.'
    : 'Turns the polarisation by its rotation, the same way in the lab whichever way the light goes, so a double pass turns it twice as far rather than undoing it. That is what an isolator and a Faraday mirror are built on. The arrow is the direction of its magnetic field.'));
}
export function crystalPanel(el) {
  panel.append(h('h3', null, 'Crystal'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Type', Object.entries(CRYSTAL_SHAPES), () => el.shape, v => { el.shape = v; }, { wide: true }),
    selectField('Material', Object.entries(CRYSTALS).map(([k, v]) => [k, v.name]), () => el.crystal, v => { el.crystal = v; }),
    param('Aperture (mm)', el, 'size'));
  if (el.shape === 'displacer') rows.append(param('Length (mm)', el, 'length'), param('Optic axis from the normal (°)', el, 'axisAngle', { wide: true }));
  if (el.shape === 'wollaston') rows.append(param('Wedge angle (°)', el, 'wedge', { wide: true }));
  panel.append(rows);
  panel.append(readoutBox('crystal'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, {
    displacer: 'The optic axis lies in the bench plane, tilted from the faces, so p light is the extraordinary ray: its energy walks off sideways while s goes straight, and they leave parallel, side by side.',
    wollaston: 'Two wedges with their optic axes crossed: s and p swap between the ordinary and extraordinary index at the join, so they bend opposite ways and leave diverging.',
    glan: 'Two prisms with an air gap cut between the two critical angles: the polarisation with the higher index is totally reflected out of the side, the other passes.',
  }[el.shape]));
}
export function filterPanel(el) {
  panel.append(h('h3', null, 'Filter'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Type', Object.entries(FILTER_TYPES), () => el.ftype, v => { el.ftype = v; }, { wide: true }));
  if (el.ftype === 'longpass' || el.ftype === 'shortpass') rows.append(param('Edge (nm)', el, 'edge'), param('10–90% (nm)', el, 'slope'));
  if (el.ftype === 'bandpass') rows.append(param('Centre (nm)', el, 'centre'), param('FWHM (nm)', el, 'fwhm'));
  if (el.ftype === 'nd') rows.append(param('Optical density', el, 'od'));
  else rows.append(param('Peak T (%)', el, 'tmax'));
  rows.append(param('Aperture (mm)', el, 'length'));
  panel.append(rows);
  const rf = h('input', { type: 'checkbox' });
  rf.checked = el.reflect;
  rf.addEventListener('change', () => { checkpoint(); el.reflect = rf.checked; changed(false); });
  panel.append(h('label', { class: 'rt-check', style: 'margin-top:0.5rem' }, rf, 'Reflect what it blocks (a dichroic)'));
  panel.append(readoutBox('filter'));
}
/* power leaving and entering a port, mW */
export function portPower(el, p) {
  const net = lastTrace.net;
  if (!net) return { out: 0, inn: 0 };
  return { out: netPower(net.out.get(pkey(el.id, p)), net.keys), inn: netPower(net.inn.get(pkey(el.id, p)), net.keys) };
}
export function portRows(el) {
  const rows = [];
  portsOf(el).forEach((P0, i) => {
    if (P0.elec) return;                                   // ELEC hook: the electrical ports' wires are listed with the electronics' readout
    const F = (project.fibres || []).find(G => !G.wire && (pkey(...G.a) === pkey(el.id, i) || pkey(...G.b) === pkey(el.id, i)));
    const other = F ? (pkey(...F.a) === pkey(el.id, i) ? F.b : F.a) : null, oe = other && getEl(other[0]);
    const P = portPower(el, i);
    rows.push(['Port ' + portName(el, i), (oe ? '\u2192 ' + oe.name + (portsOf(oe).length > 1 ? ' ' + portName(oe, other[1]) : '') : 'open') +
      (P.out || P.inn ? ', out ' + fmtMw(P.out) + ', in ' + fmtMw(P.inn) : '')]);
  });
  return rows;
}
export function fcompPanel(el) {
  const K = FC[el.kind];
  panel.append(h('h3', null, typeLabel(el)));
  const rows = h('div', { class: 'rt-rows' });
  // a laser's pulse has a section of its own; while pulsed, the pulse sets its line
  const skip = el.kind === 'laser' ? ['tau', 'rep', 'gdd0', 'polAngle', 'coh'] : [];
  if (el.kind === 'pd') {
    // as a free-space photodetector: its material, then its amplifier (none on a bare photodiode)
    rows.append(selectField('Material', Object.entries(DETECTOR_MATERIALS).map(([k, v]) => [k, v.name]), () => el.material, v => { el.material = v; renderPanel(); }, { wide: el.material !== 'custom' }));
    if (el.material === 'custom') rows.append(param('Responsivity (A/W)', el, 'resp'));
    if (el.balanced) rows.append(param('Common-mode rejection (dB)', el, 'cmrr', { wide: true }));
    panel.append(rows);
    if (el.balanced) panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Two photodiodes, the second\u2019s current taken from the first\u2019s: what is the same on both (the light\u2019s intensity noise, an amplifier\u2019s ASE beating with itself) cancels to the common-mode rejection, what differs (the interference between them, opposite in the two outputs of a coupler) doubles. Shot noise from both adds.'));
    if (el.diode) panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.6rem' }, param('Bandwidth (Hz)', el, 'bandwidth'), param('Dark (nA)', el, 'dark')));
    else panel.append(h('h3', null, 'Amplifier'), h('div', { class: 'rt-rows' }, param('Gain (V/A)', el, 'gain'), param('Bandwidth (Hz)', el, 'bandwidth'),
      param('Dark (nA)', el, 'dark'), param('Noise (pA/\u221aHz)', el, 'ampNoise'), param('Output limit (V)', el, 'vmax', { wide: true })));
  } else for (const [k, label] of K.params) if (!skip.includes(k)) rows.append(k === 'ways' ? param(el.combine ? 'Inputs' : 'Outputs', el, k, { noSweep: true, commit: true })
    : k === 'ins' || k === 'outs' ? param(label, el, k, { noSweep: true, commit: true })
    : el.kind === 'amp' && el.soa && k === 'iso' ? param('Polarisation-dependent gain (dB)', el, 'pdg', { wide: true })
    : k === 'cross' ? selectField('State', [['0', 'Bar: 1 \u2192 3, 2 \u2192 4'], ['1', 'Cross: 1 \u2192 4, 2 \u2192 3']], () => String(el.cross >= 0.5 ? 1 : 0), v => { el.cross = +v; }, { wide: true })
    : param(label, el, k));
  if (el.kind === 'split') {
    const sn = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(sn, () => { const N = el.ways, dB = 10 * Math.log10(N) + el.loss;
      sn.textContent = (el.combine ? 'N\u00d71 combiner: ' : '1\u00d7N splitter: ') + 'each branch carries 1/' + N + ' of the power to or from the common port, ' + (+dB.toPrecision(3)) + ' dB down with its excess loss, in phase. ' +
        (el.combine ? 'Light from unrelated sources on its inputs each reach the output ' + (+dB.toPrecision(3)) + ' dB down (a single-mode combiner keeps one mode); light of one laser adds as fields, so in phase it can all come through. '
          : 'Run backwards it combines, as any splitter does. ') + 'Fewer ' + (el.combine ? 'inputs' : 'outputs') + ' takes the fibres off the branches that go.'; });
    panel.append(rows, sn);
  }
  if (el.kind === 'laser') {
    rows.append(selectField('Polarisation', [['unpolarised', 'Unpolarised'], ['s', 's, out of the plane'], ['p', 'p, in the plane'], ['linear', 'Linear at an angle'], ['rcp', 'Circular, right-handed'], ['lcp', 'Circular, left-handed']],
      () => el.pol, v => { el.pol = v; renderPanel(); }, { wide: el.pol !== 'linear' }));
    if (el.pol === 'linear') rows.append(param('Angle from s (°)', el, 'polAngle'));
    if (!(el.tau > 0)) coherenceFields(el, rows);
  }
  if (el.kind === 'laser') {
    const cn = h('p', { class: 'note', style: 'margin-top:0.5rem' });
    bindSync(cn, () => { cn.textContent = el.tau > 0 ? 'Set by the pulse (below): coherence length ' + fmtLen(el.coh) + ', Gaussian.'
      : (el.led ? 'A fibre-coupled LED: spontaneous emission, broadband and incoherent, its power into the fibre. ' : '') + coherenceNote(el) +
        (el.pol === 'unpolarised' ? ' Unpolarised: s and p halves that never interfere.' : ''); });
    panel.append(rows, cn);
  }
  if (el.kind === 'laser' && !el.led) {
    panel.append(h('h3', null, 'Pulse'), pulseToggle(el));
    if (el.tau > 0) {
      const prow = h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, param('Duration (fs)', el, 'tau'),
        selectField('Shape', [['sech2', 'sech\u00b2 (soliton, Kerr-lens)'], ['gauss', 'Gaussian']], () => el.pshape, v => { el.pshape = v; applyPulse(el); }),
        param('Repetition rate (MHz)', el, 'rep'), param('Chirp at the laser, GDD (fs\u00b2)', el, 'gdd0', { wide: true }));
      const flip = () => { if (!(el.tau > 0)) setTimeout(renderPanel); };
      prow.addEventListener('focusout', flip);
      const pl = h('p', { class: 'note', style: 'margin-top:0.5rem' });
      bindSync(pl, () => { pl.textContent = pulseLine(el); if (!prow.contains(document.activeElement)) flip(); });
      panel.append(prow, pl);
    }
  }
  if (el.kind === 'thru') rows.append(textField('Pair name', () => el.pair, v => { el.pair = v.trim().slice(0, 60) || el.pair; }, { wide: true }));
  if (el.kind !== 'laser' && el.kind !== 'pd' && el.kind !== 'split') panel.append(rows);
  if (el.kind === 'eom') rows.append(selectField('Modulates', [['phase', 'Phase (sidebands J\u2099(\u03b2))'], ['amplitude', 'Amplitude (Mach\u2013Zehnder)']], () => el.emode, v => { el.emode = v; }, { wide: true }));
  if (el.kind === 'thru') {
    const st = h('p', { class: 'note', style: 'margin-top:0.5rem' }), acts = h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' });
    panel.append(st, acts);
    let sig = null;
    bindSync(st, () => {
      const P = thruPartner(el);
      st.textContent = P ? 'Joined to ' + P.name + ' on ' + benchName(P.bench) + ': a fibre goes in here and comes out there, and back.' : 'No partner yet: give a feedthrough on another tab the same pair name, or make one below.';
      const s2 = (P ? P.id : '') + '|' + project.benches.map(b => b.id + b.name).join();
      if (s2 === sig) return;
      sig = s2; acts.replaceChildren();
      if (P) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => selectEl(P) }, 'Go to ' + P.name + ' on ' + benchName(P.bench)));
      else {
        const make = bId => { if (!bId) { addBench(); bId = project.tab; } checkpoint(); const b = project.benches.find(b2 => b2.id === bId);
          const c = normElement({ type: 'fcomp', kind: 'thru', name: nextName('Feedthrough'), x: snapVal(b.view.cx), y: snapVal(b.view.cy), angle: el.angle + 180, pair: el.pair, bench: bId });
          project.elements.push(c); selectEl(c); changed(true); };
        for (const b of project.benches) if (b.id !== el.bench) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => make(b.id) }, 'Make its partner on ' + b.name));
        acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => make(null) }, 'Make its partner on a new tab'));
      }
    });
  }
  panel.append(readoutBox('fcomp'));
  if (el.kind === 'pd') signalSection(el);
  if (el.kind === 'osa') osaSection(el);
  const notes = {
    laser: 'A laser coupled straight into fibre. Its polarisation angle is from s: where a tip meets free space, s is out of the bench plane. Give it a coherence length and the network weighs every pair of paths by it. Give it a pulse duration and each fibre\u2019s dispersion chirps the pulse on its way to the tips.',
    coupler: 'Ports 1 and 2 on one side, 3 and 4 on the other: 1 goes to 3 and, across, to 4; 2 goes to 4 and, across, to 3. The light crossing over picks up a quarter-wave, as in a real coupler, so two equal arms recombine all into one port.',
    wdm: 'The pass band goes between the common port and the pass port; everything else between the common port and the rest port.',
    circ: '1 to 2, and 2 to 3; back the other way only what its isolation lets through.',
    iso: 'Forward from in to out; backward only what its isolation lets through.',
    voa: 'The same loss both ways.',
    pc: 'Three paddles, a quarter-wave, a half-wave and a quarter-wave, each turned about the fibre: any polarisation in to any out. The light going back through it sees the transpose, as in a real fibre.',
    pol: 'Passes the polarisation along its axis (from s) and the crossed one weakened by its extinction.',
    fm: 'A Faraday rotator and a mirror: what comes back is orthogonal to what went in, whatever the fibre did to it on the way, so a Michelson made with two stays at full contrast however its fibres are bent.',
    fbg: 'Reflects a narrow band about its Bragg wavelength, back out of the port the light came in by; passes the rest.',
    term: 'Absorbs what arrives, sending back only its return loss.',
    pd: 'Reads the power arriving, the paths of one laser added as fields (weighted by its coherence), different lasers as powers.',
    thru: 'Carries a fibre to the partner of the same name, on another tab.',
    aom: 'A fibre-coupled Bragg cell: the output fibre takes the shifted order, f higher (order +1) or lower (\u22121); what is not shifted is dumped, part of the insertion loss.',
    amp: 'A fibre amplifier (an erbium-doped one, EDFA, by default): the small-signal gain across its band, saturating as a homogeneous amplifier does, G = G0 / (1 + G Pin / Psat), on all the light reaching it, and amplified spontaneous emission out of both ends (n_sp h \u03bd (G \u2212 1) in each polarisation, from the noise figure), which reaches the photodiodes as broadband light and adds its beat noise to theirs. An isolator inside stops light going back.',
    eom: 'A fibre-coupled lithium niobate modulator. Phase: sidebands at n f_m with amplitudes J\u2099(\u03b2). Amplitude: a Mach\u2013Zehnder of two arms driven in opposition, at its bias (90\u00b0 is quadrature, 0\u00b0 full transmission).',
  };
  panel.append(h('p', { style: 'margin-top:0.6rem' }, notes[el.kind]));
}
/* A fibre: its length, loss and what it carries */
export function fibreLinkPanel(F) {
  const A = getEl(F.a[0]), B = getEl(F.b[0]);
  panel.append(h('h2', null, h('span', null, 'Fibre'), h('span', { class: 'kind' }, (A ? A.name : '?') + ' \u2192 ' + (B ? B.name : '?'))));
  const id1 = 'rtf' + (setFid(fid + 1)), id2 = 'rtf' + (setFid(fid + 1)), id3 = 'rtf' + (setFid(fid + 1));
  panel.append(h('div', { class: 'rt-rows' },
    h('div', { class: 'rt-f' }, h('label', { for: id1 }, 'Length (m)'), numInput(id1, () => F.len, v => { F.len = Math.max(0, v); })),
    h('div', { class: 'rt-f' }, h('label', { for: id2 }, 'Loss (dB/km)'), numInput(id2, () => F.loss, v => { F.loss = Math.max(0, v); })),
    h('div', { class: 'rt-f wide' }, h('label', { for: id3 }, 'Dispersion (ps/(nm km))'), numInput(id3, () => F.disp, v => { F.disp = v === null ? null : v; }, { blank: null, placeholder: 'standard single-mode (SMF-28)', fmt: v => v === null || v === undefined ? '' : fmtNum(v) })),
    (() => { const id4 = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f wide' }, h('label', { for: id4 }, 'Nonlinearity \u03b3 (1/(W km))'), numInput(id4, () => F.gamma, v => { F.gamma = v === null ? null : Math.max(0, v); }, { blank: null, placeholder: 'fused silica, from the mode area', fmt: v => v === null || v === undefined ? '' : fmtNum(v) })); })()));
  // what it does to polarisation
  const tRows = h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, selectField('Polarisation', [['smf', 'Kept (ideal, held still)'], ['random', 'Standard fibre as laid (random)'],
    ['pm', 'Polarisation maintaining'], ['mm', 'Multimode (scrambled)']], () => F.ftype || 'smf', v => { F.ftype = v; }, { wide: true }),
    selectField('Ends', Object.entries(CONNS).map(([k, c]) => [k, c.name]), () => F.conn || 'splice', v => { F.conn = v; }, { wide: true }));
  const fnum = (label, key, set, opts) => { const id = 'rtf' + (setFid(fid + 1)); return h('div', { class: 'rt-f' + (opts && opts.wide ? ' wide' : '') }, h('label', { for: id }, label), numInput(id, () => F[key], set)); };
  if (F.ftype === 'pm') tRows.append(fnum('Key angle (\u00b0 from s)', 'key', v => { F.key = v; }), fnum('Beat length (mm)', 'beat', v => { F.beat = Math.max(0.1, v); }),
    fnum('Extinction ratio (dB)', 'per', v => { F.per = clamp(v, 0, 60); }, { wide: true }));
  if (F.ftype === 'random' || F.ftype === 'mm') tRows.append(fnum('Seed (another lay of the fibre)', 'seed', v => { F.seed = Math.round(v); }, { wide: true }));
  panel.append(tRows);
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, {
    smf: 'Keeps the polarisation it is given, as a short fibre held still or taped down does; a polarisation controller sets it.',
    random: 'Standard single-mode fibre as it really lies: a birefringence set by its bends and twists (a beat length of about 10 m), unknown but fixed, so the state out is some other state, and it drifts as the laser tunes. Change the seed to lay it again. A Faraday mirror undoes it on the way back.',
    pm: 'Polarisation-maintaining fibre (PANDA, bow-tie): light launched along its slow or fast axis stays there, to the extinction ratio. Launched at the key angle to one of them it splits between the two, which drift apart in phase by L / L_b at 1550 nm, so the state out wanders with length and wavelength; align the key with the light to keep it.',
    mm: 'Multimode fibre: many modes, each with its own delay and polarisation; the power arrives, its polarisation does not. Use it with multimode tips; the speckle a real one makes is averaged away here.',
  }[F.ftype || 'smf']));
  const out = h('div', { class: 'rt-readout' });
  panel.append(out);
  bindSync(out, () => {
    const pa = portPower(A, F.a[1]), pb = portPower(B, F.b[1]);
    const rows = [['Delay', (+(FIBRE_NG * F.len / 0.299792458).toPrecision(4)) + ' ns (optical path ' + fmtLen(FIBRE_NG * F.len * 1000) + ')'],
      ['Loss over it', (+(F.loss * F.len / 1000).toPrecision(3)) + ' dB'],
      ...(pulsedFibreLaser() ? (() => { const P = pulsedFibreLaser(); return [['Dispersion at ' + (+P.wavelength.toPrecision(5)) + ' nm', (+fibreDisp(F, P.wavelength).toPrecision(3)) + ' ps/(nm km): GDD ' + fmtFs2(fibreGDD(F, P.wavelength, F.len))]]; })() : []),
      ...(() => { const S = lastTrace.net && lastTrace.net.spm && lastTrace.net.spm.get(F.id);
        return S ? [['Self-phase modulation', 'B-integral ' + (+S.B.toPrecision(3)) + ' rad (peak ' + fmtW(S.peak) + ' in, \u03b3 ' + (+fibreGamma(F, S.nm).toPrecision(3)) + ' /(W km)); the spectrum leaves ' + (+S.broad.toPrecision(3)) + ' times as wide (rms)']]
          : pulsedFibreLaser() ? [['Self-phase modulation', 'under 0.01 rad of nonlinear phase: none to speak of']] : []; })(),
      [(A ? A.name : '?') + ' \u2192 ' + (B ? B.name : '?'), fmtMw(pa.out)], [(B ? B.name : '?') + ' \u2192 ' + (A ? A.name : '?'), fmtMw(pb.out)]];
    out.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])));
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'A pulse strong enough to pick up a nonlinear phase of more than 0.01 rad goes through by the nonlinear Schr\u00f6dinger equation (split-step Fourier, with the loss, dispersion, its slope and \u03b3): self-phase modulation broadens its spectrum, and with anomalous dispersion (standard fibre above 1.31 \u00b5m) it can compress or hold its shape as a soliton. The spectrum it leaves with goes on with it, to a fibre tip and the Pulse tab of a screen beyond. Not modelled: Raman scattering, self-steepening, and nonlinearity in free-space glass.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.35rem' }, 'Index ' + FIBRE_N + ' (group ' + FIBRE_NG + '). Its length is this number, not the length drawn. Drag either end off its port to take it away, or onto another port to move it.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.35rem' }, 'Shaping it: drag the fibre to pull a node out of it; drag a node (square) to move it, and its handles (round) to bend the curve through it, Shift to move one handle on its own; the handle at each port sets how far the fibre runs straight out of it. Double-click the fibre to add a node, a node to remove it.'));
  if ((F.path && F.path.length) || F.ta != null || F.tb != null)
    panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' }, h('button', { class: 'rt-btn wide', type: 'button',
      onclick: () => { checkpoint(); F.path = []; F.ta = null; F.tb = null; changed(true); } }, 'Straighten: remove its nodes')));
  panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, h('button', { class: 'rt-btn danger wide', type: 'button', onclick: () => removeFibre(F) }, 'Delete fibre')));
}
/* several selected: what can be done to them together */
export function groupPanel(list) {
  panel.append(h('h2', null, h('span', null, list.length + ' elements'), h('span', { class: 'kind' }, 'selected')));
  const ul = h('ul', { class: 'rt-list' });
  for (const e of list) ul.append(h('li', null, h('button', { onclick: () => selectEl(e) }, e.name + (e.locked ? ' \u2022 locked' : ''), h('span', { class: 't' }, typeLabel(e)))));
  panel.append(ul);
  const B = (label, fn, title) => h('button', { class: 'rt-btn', type: 'button', title: title || '', onclick: fn }, label);
  panel.append(h('h3', null, 'Arrange'));
  panel.append(h('div', { class: 'rt-inline', style: 'display:flex;flex-wrap:wrap;gap:0.35rem' },
    B('Align on a vertical line', () => alignEls(list, 'x')), B('Align on a horizontal line', () => alignEls(list, 'y')),
    B('Space evenly across', () => alignEls(list, 'dx')), B('Space evenly up', () => alignEls(list, 'dy')),
    B('Rotate 90\u00b0 \u21ba', () => rotateEls(list, 90)), B('Rotate 90\u00b0 \u21bb', () => rotateEls(list, -90))));
  panel.append(h('h3', null, 'Selection'));
  const locked = list.every(e => e.locked);
  panel.append(h('div', { class: 'rt-inline', style: 'display:flex;flex-wrap:wrap;gap:0.35rem' },
    B('Duplicate', duplicateSel, 'Ctrl+D'), B(locked ? 'Unlock' : 'Lock in place', () => setLocked(list, !locked)), B('Zoom to them', zoomToSelection, 'Z'),
    list.every(e => e.group && e.group === list[0].group) ? B('Ungroup', () => ungroupEls(list), 'Ctrl+Shift+G') : B('Group', () => groupEls(list), 'Ctrl+G: picked and moved as one'),

    h('button', { class: 'rt-btn danger', type: 'button', onclick: () => removeEls(list) }, 'Delete')));
  if (project.benches.length > 1) panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' },
    selectField('Move to tab', [['', 'Choose a tab\u2026'], ...project.benches.map(b => [b.id, b.name])], () => '', v => { if (v) moveToTab(list, v); }, { wide: true })));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.6rem' }, 'Drag any of them to move them all; the arrow keys nudge them. Shift- or Ctrl-click an element to add it or take it out; drag across empty bench to pick a boxful (Shift to add to these). Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste, between tabs and projects too; right-click for the rest. Locked elements stay where they are.'));
}
export function modulatorPanel(el) {
  if (el.type === 'aom') {
    panel.append(h('h3', null, 'Acousto-optic modulator'));
    panel.append(h('div', { class: 'rt-rows' },
      param('Drive (MHz)', el, 'rf'), param('Sound speed (m/s)', el, 'v'),
      param('Diffraction efficiency (%)', el, 'eff'),
      selectField('Order', [['1', '+1 (shifted up)'], ['-1', '\u22121 (shifted down)']], () => String(el.order), v => { el.order = +v; }),
      param('Aperture (mm)', el, 'length', { wide: true })));
    panel.append(readoutBox('aom'));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A Bragg cell: sound at the drive frequency makes a moving grating of period v / f in the crystal. The chosen order takes its share of the light, turned by \u03bbf/v and shifted in frequency by the drive; the rest goes straight through, unshifted. Tellurium dioxide carries sound at about 4200 m/s, fused silica 5960 m/s. Shifted light makes no steady fringes with the rest; on a photodiode it beats at the drive frequency.'));
  } else {
    panel.append(h('h3', null, 'Electro-optic modulator'));
    const rows = h('div', { class: 'rt-rows' },
      selectField('Modulates', [['phase', 'Phase (sidebands J\u2099(\u03b2))'], ['amplitude', 'Amplitude (Mach\u2013Zehnder)']], () => el.emode, v => { el.emode = v; }, { wide: true }),
      param('Drive (MHz)', el, 'fm'), param('Depth \u03b2 (rad)', el, 'beta'));
    if (el.emode === 'amplitude') rows.append(param('Bias (\u00b0)', el, 'bias'));
    rows.append(param('Insertion loss (dB)', el, 'loss'), param('Aperture (mm)', el, 'length'));
    panel.append(rows);
    panel.append(readoutBox('eom'));
    panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Each sideband leaves as a branch of its own, n f\u2098 from the light that came in, with its share of the field. Phase modulation at \u03b2 = 1.434 puts equal power in the carrier and each first sideband; at 2.405 the carrier is gone. With a cavity after it and a photodiode on the reflection, demodulated at the drive frequency, it is a Pound\u2013Drever\u2013Hall lock.'));
  }
}
export function linkPanel(el) {
  panel.append(h('h3', null, 'Link'));
  panel.append(h('div', { class: 'rt-rows' },
    textField('Pair name', () => el.pair, v => { el.pair = v.trim().slice(0, 60) || el.pair; }, { wide: true }),
    param('Length (mm)', el, 'length')));
  const st = h('p', { class: 'note', style: 'margin-top:0.5rem' });
  const acts = h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' });
  panel.append(st, acts);
  let sig = null;
  bindSync(st, () => {
    const P = linkPartner(el), L = linkPairs().get(el.pair) || [];
    st.textContent = P ? 'Linked to ' + P.name + ' on ' + benchName(P.bench) + '. The two are one plane seen from two benches: light reaching either leaves the other at the same place along it, going the same way across it, beam and field unchanged.'
      : L.indexOf(el) > 1 ? 'More than two link planes are named \u201c' + el.pair + '\u201d; only the first two are linked, so light stops here.'
      : 'No partner yet, so light stops here. Give a link plane on another tab the same pair name, or make one below.';
    const s2 = (P ? P.id : '') + '|' + project.benches.map(b => b.id + b.name).join();
    if (s2 === sig) return;
    sig = s2;
    acts.replaceChildren();
    if (P) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => selectEl(P) }, 'Go to ' + P.name + ' on ' + benchName(P.bench)));
    else {
      for (const b of project.benches) if (b.id !== el.bench)
        acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => makeLinkPartner(el, b.id) }, 'Make its partner on ' + b.name));
      acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => makeLinkPartner(el, null) }, 'Make its partner on a new tab'));
    }
  });
}
/* a partner for a link plane: same pair, same orientation, in the middle of that tab's view */
function makeLinkPartner(el, benchId) {
  if (!benchId) { addBench(); benchId = project.tab; }
  checkpoint();
  const b = project.benches.find(b2 => b2.id === benchId);
  const c = normElement({ type: 'link', name: nextName('Link plane'), x: snapVal(b.view.cx), y: snapVal(b.view.cy), angle: el.angle, length: el.length, pair: el.pair, bench: benchId });
  project.elements.push(c);
  selectEl(c);
  changed(true);
}
export function gainPanel(el) {
  panel.append(h('h3', null, 'Gain medium'));
  panel.append(h('div', { class: 'rt-rows' },
    param('Gain a pass (×)', el, 'g0'), param('Aperture (mm)', el, 'length'),
    param('Line centre (nm)', el, 'centre'), param('FWHM (nm)', el, 'fwhm'),
    param('Saturation intensity (kW/cm\u00b2)', el, 'isat', { wide: true })));
  panel.append(readoutBox('gain'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Multiplies the power of light crossing it, most at its line centre and less away from it: the gain a pass is the small-signal gain, which the pump sets. In a cavity, the cavity card (on each of its elements) shows whether the round trip gains more than it loses. Above threshold it lases, and the gain saturates until the round trip is exactly one: the card gives the circulating power, the power leaving through each partly transmitting mirror and the best output coupler, and the output leaves those mirrors as a beam on the bench. Saturation is that of a homogeneous line, every beam through the gain saturating it together (Rigrod\u2019s analysis, exact at any gain and coupling), with the power set by the saturation intensity over the cavity mode\u2019s area at the gain (Nd:YAG 2.9 kW/cm\u00b2, Ti:sapphire 200, Yb:YAG 10); 0 turns it off. The laser runs on one mode at the seed\u2019s wavelength: put the seed on the gain line.'));
}
/* A vapour cell's panel: what it holds and how hot, and its spectrum against the laser */
export function nlcPanel(el) {
  panel.append(h('h3', null, 'Nonlinear crystal'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Crystal', Object.entries(NLC).map(([k, v]) => [k, v.name + ' (d_eff ' + (v.d * 1e12) + ' pm/V)']), () => el.material, v => { el.material = v; }, { wide: true }),
    param('Length (mm)', el, 'nlLen'), param('Aperture (mm)', el, 'length'),
    param('Poling period (µm)', el, 'period'), param('Temperature (°C)', el, 'temp'),
    selectField('Its z axis', [['s', 'Out of the bench plane: s light converts'], ['p', 'In the plane: p light converts']], () => el.axis, v => { el.axis = v; }, { wide: true }),
    selectField('End faces', [['ar', 'Anti-reflection coated (0.1%)'], ['bare', 'Bare']], () => el.faces, v => { el.faces = v; }, { wide: true })));
  const box = h('div', { class: 'rt-readout' }), cv = h('canvas', { height: '150', style: 'width:100%;display:block' });
  panel.append(box, h('div', { style: 'margin-top:0.5rem' }, cv), plotSaveRow(cv));
  let sig = '';
  bindSync(box, () => {
    const hits = ((lastTrace.nlc) || []).filter(H => H.id === el.id), rows = [];
    for (const H of hits.slice(0, 4)) {
      const r = H.r, S = getEl(H.src);
      rows.push([(S ? S.name : 'Beam') + ', ' + (+H.nm.toPrecision(6)) + ' nm', fmtW(H.P) + ' along the crystal’s axis → ' + fmtW(r.P2) + ' at ' + (+(H.nm / 2).toPrecision(6)) + ' nm (' + (+(100 * r.conv).toPrecision(3)) + '% converted); ' + (+(r.eta * 100).toPrecision(3)) + ' %/W small-signal']);
      rows.push(['Phase matching', (el.period > 0 ? 'period ' + el.period + ' µm' : 'period ' + (+r.period.toPrecision(5)) + ' µm, the best for this beam') + ' (' + (+r.periodPW.toPrecision(5)) + ' µm for a plane wave at ' + el.temp + ' °C); n = ' + r.n1.toFixed(4) + ', ' + r.n2.toFixed(4)]);
      rows.push(['Focusing', 'ξ = L/b = ' + (+r.xi.toPrecision(3)) + ' (best 2.84), h = ' + (+r.h.toPrecision(3)) + ' of Boyd and Kleinman’s 1.068' + (Math.abs(r.mu) > 0.2 ? '; the waist sits ' + (+(r.mu * 50).toPrecision(2)) + '% of the length from the middle' : '')]);
    }
    if (!hits.length) rows.push(['', 'No Gaussian beam crosses it. Send a laser through it (a source with “Propagate a Gaussian beam”) focused near its middle.']);
    const s2 = JSON.stringify(rows);
    if (s2 !== sig) { sig = s2; box.replaceChildren(h('dl', null, ...rows.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    drawNlcTuning(cv, el, hits);
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Second-harmonic generation in a periodically poled crystal (quasi-phase-matched, type 0: light polarised along the crystal’s z axis makes a harmonic polarised the same way). The harmonic of a Gaussian beam is Boyd and Kleinman’s: it depends on how tightly the beam is focused inside (best when the crystal is 2.84 confocal parameters long) and on how well the poling period cancels the mismatch between the two wavelengths’ indices, which the temperature tunes. The fundamental is used up as P₂ = P₁ tanh²(√(ηP₁)). The harmonic leaves as a beam of its own, with the fundamental’s confocal parameter and waist position. The indices are MgO:LiNbO₃’s (Gayer et al. 2008) and KTP’s (Kato and Takaoka 2002, Emanueli and Arie 2003). The crystal is a block of its own index (along its z axis) with anti-reflection coated faces (0.1%, or bare): it moves a focus inside it by L(1 − 1/n), so focus the beam for its middle inside the glass; the harmonic leaves through the exit face. Left out: absorption and heating, walk-off, the index the other polarisation sees, a laser’s linewidth and a pulse’s peak power (a pulsed laser is taken at its average power). The plot shows the harmonic against the crystal’s temperature, the period held.'));
}
function drawNlcTuning(cv, el, hits) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 150;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  const H = hits.reduce((a, b) => !a || b.P > a.P ? b : a, null);
  if (!H) return;
  // the period held where it is now, the temperature scanned across the acceptance
  const fixed = Object.assign({}, el, { period: H.r.period });
  const span = Math.max(2, Math.min(60, 40 / el.nlLen)), T0 = el.temp - span, T1 = el.temp + span, N = 161, xs = [], ys = [];
  for (let i = 0; i < N; i++) { const T = T0 + (T1 - T0) * i / (N - 1); xs.push(T); ys.push(nlcConvert(Object.assign(fixed, { temp: T }), H.P, H.nm, H.q, H.n, H.cth).P2 * 1e3); }
  plotCsv(cv, el.name + ' temperature tuning', ['temperature_C', 'harmonic_mW'], () => xs.map((x, i) => [x, ys[i]]));
  const top = Math.max(...ys) || 1, yr = [0, top * 1.05];
  const A = plotArea(g, w, hgt, yr, { kind: 'plain', title: 'harmonic, mW' });
  const X = v => A.l + (v - T0) / (T1 - T0) * A.w, Y = v => A.t + A.h - v / yr[1] * A.h;
  g.save(); g.beginPath(); g.rect(A.l, A.t - 2, A.w, A.h + 4); g.clip();
  g.strokeStyle = getCss('--jek-cyan'); g.lineWidth = 1.4; g.beginPath(); ys.forEach((v, i) => i ? g.lineTo(X(xs[i]), Y(v)) : g.moveTo(X(xs[i]), Y(v))); g.stroke();
  g.strokeStyle = getCss('--jek-orange'); g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(el.temp), A.t); g.lineTo(X(el.temp), A.t + A.h); g.stroke(); g.setLineDash([]);
  g.restore();
  drawAxes(g, A, [T0, T1], yr, { kind: 'plain', title: 'crystal temperature, °C' }, { kind: 'plain', title: 'harmonic, mW' });
}
export function cellPanel(el) {
  panel.append(h('h3', null, 'Vapour cell'));
  panel.append(h('div', { class: 'rt-rows' },
    selectField('Atoms', Object.entries(ATOMS).map(([k, v]) => [k, v.name]), () => el.atom, v => { el.atom = v; }, { wide: true }),
    selectField('Line', [['D2', 'D2 (Rb 780, Cs 852, K 767 nm)'], ['D1', 'D1 (Rb 795, Cs 894, K 770 nm)']], () => el.line, v => { el.line = v; }, { wide: true }),
    param('Temperature (°C)', el, 'temp'), param('Length (mm)', el, 'cellLen'),
    param('Window (mm)', el, 'length'), param('Field (G)', el, 'bField')));
  panel.append(readoutBox('cell'));
  const vsEl = vs(el);
  vsEl.cellSpan = vsEl.cellSpan || 'all';
  const tabs = h('div', { class: 'rt-tabs', style: 'margin-top:0.6rem' });
  const cv = h('canvas', { height: '170', style: 'width:100%;display:block' });
  const draw = () => drawCellSpectrum(cv, el, vsEl.cellSpan);
  for (const [k, label] of [['all', 'Whole line'], ['laser', 'Round the laser']]) {
    const b = h('button', { class: 'rt-tab' + (vsEl.cellSpan === k ? ' on' : ''), type: 'button', onclick: () => { vsEl.cellSpan = k; [...tabs.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, label);
    tabs.append(b);
  }
  panel.append(tabs, cv, plotSaveRow(cv));
  bindSync(cv, draw);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'Alkali vapour at the temperature set: its density from the vapour pressure, each hyperfine line of the D line with the Doppler width of the vapour and the natural width of the excited state (a Voigt profile), weighted by how many atoms sit in its lower level and how strong it is. The light is absorbed and delayed by the same lines, so a laser tuned through them sees the familiar Doppler-broadened dips, and a beam off to one side of a line picks up its phase. Tune the laser with its wavelength (a sweep scans it), or shift it with an AOM.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Saturation, worked out slice by slice along the cell and point by point across each beam: a beam bleaches the lines it is on where it is strong (its centre more than its edges, less as it fades), and a beam crossing the cell burns holes in the atoms\u2019 velocities for the others. Head on, a weak probe sees sub-Doppler Lamb dips at each transition and crossovers halfway between two that share a lower level; a pump a few milliradians off head-on broadens them (the atoms moving across it), one going the same way makes no narrow feature at all, and a probe only partly inside the pump, or crossing it at an angle, sees them only where the two overlap. The diffracted field and the photodiodes take all of this across the beam. The plot shows the weakest beam on its axis with the others scanning with it. The holes come from rate equations for each transition alone, with no optical pumping between levels: positions and widths are right, depths (crossovers above all) only roughly. No buffer gas, no windows.'));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'A magnetic field along the cell (positive along its +x axis, as a solenoid or ring magnets would put it) splits each line into its Zeeman components, worked out exactly from the weak field through the Paschen\u2013Back regime by diagonalising each level\u2019s hyperfine and Zeeman energy. Light along the field drives \u03c3+ and \u03c3\u2212 transitions, so the two hands of circular light see lines shifted apart: the cell absorbs them differently (circular dichroism, the signal of a DAVLL lock: a quarter-wave plate at 45\u00b0 and a polarising cube after the cell, a detector on each port, their difference the error signal) and delays them differently (Faraday rotation: between crossed polarisers, a Faraday filter passing light only near the lines). With no field, a circularly polarised pump against the probe saturates one hand more than the other, which is polarisation spectroscopy (the probe through a polariser at 45\u00b0, or a cube with two detectors); that comes from saturation alone here, no optical pumping, so its shape is right and its size only roughly. \u03c0 transitions, which light along the field cannot drive, are left out. With a field, the plot shows each hand\u2019s transmission on its own: \u03c3+ in blue, \u03c3\u2212 in orange.'));
}
/* the cell's lines and the beams through it, relative to the strongest isotope's line centre */
export function cellInfo(el) {
  const lines = atomLines(el.atom, el.line), iso0 = ATOMS[el.atom].iso.slice().sort((a, b) => b[1] - a[1])[0][0];
  const nu0 = ATOM_ISO[iso0][el.line].nu, T = el.temp + 273.15;
  const beams = ((lastTrace.cells || []).filter(c => c.id === el.id));
  const dop = a => 2 * Math.sqrt(Math.LN2) * a.nu / C_SI * Math.sqrt(2 * KB * T / a.m);
  return { lines, nu0, beams, n: cellDensity(el), doppler: dop(lines[0]), natural: lines[0].A / (2 * Math.PI), Isat: lines[0].Isat };
}
function drawCellSpectrum(cv, el, span) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 170;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  const C = cellInfo(el);
  // the probe: the weakest beam through it; the rest scan with it, the ones going the other way as pumps
  const probe = C.beams.length ? C.beams.reduce((a, b) => b.I < a.I ? b : a) : null;
  const pumps = probe ? C.beams.filter(b => b !== probe) : [];
  // the probe, on its axis, with every beam scanning with it by the same shift
  const scanned = d => {
    const sh = r => Object.assign({}, r, { nu: r.nu + d });
    const plan = cellPlan(el, probe.nu + d, probe.dir, sh(probe), pumps.map(r => Object.assign(sh(r), { prof: cellProfile(el, sh(r)) })));
    return evalPlan(plan, probe.ly, 0).amp ** 2;
  };
  const nus = C.lines.map(a => a.nu - C.nu0);
  let lo = Math.min(...nus) - 2 * C.doppler, hi = Math.max(...nus) + 2 * C.doppler;
  const at = probe ? probe.nu - C.nu0 : null;
  if (span === 'laser' && at !== null) { lo = at - 600e6; hi = at + 600e6; }
  const hands = el.bField !== 0;
  if (hands) { const zs = el.bField ? 3 * MU_B * 1e6 * Math.abs(el.bField) : 0; lo -= zs; hi += zs; }
  const N = span === 'laser' ? 2400 : hands ? 3000 : 6000, xs = [], lin = [], sat = [], sp = [], sm = [];
  for (let i = 0; i < N; i++) {
    const d = lo + (hi - lo) * i / (N - 1), shift = probe ? d - at : 0;
    xs.push(d / 1e9);
    if (hands) { sp.push(cellResponse(el, C.nu0 + d, null, 1).amp ** 2); sm.push(cellResponse(el, C.nu0 + d, null, -1).amp ** 2); lin.push(0.5 * (sp[i] + sm[i])); }
    else lin.push(cellResponse(el, C.nu0 + d, null).amp ** 2);
    if (pumps.length && !hands) sat.push(scanned(shift));
  }
  if (hands) plotCsv(cv, el.name + ' transmission', ['detuning_GHz', 'mean', 'sigma_plus', 'sigma_minus'], () => xs.map((x, i) => [x, lin[i], sp[i], sm[i]]));
  else plotCsv(cv, el.name + ' transmission', sat.length ? ['detuning_GHz', 'transmission', 'with_pumps'] : ['detuning_GHz', 'transmission'],
    () => xs.map((x, i) => sat.length ? [x, lin[i], sat[i]] : [x, lin[i]]));
  const yr = [Math.min(0, ...lin, ...(sat.length ? sat : [1])), 1.02];
  const A = plotArea(g, w, hgt, yr, { kind: 'plain', title: 'transmission' });
  const X = v => A.l + (v - lo / 1e9) / ((hi - lo) / 1e9) * A.w, Y = v => A.t + A.h - (v - yr[0]) / (yr[1] - yr[0]) * A.h;
  g.save(); g.beginPath(); g.rect(A.l, A.t - 2, A.w, A.h + 4); g.clip();
  const line = (ys, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); ys.forEach((v, i) => i ? g.lineTo(X(xs[i]), Y(v)) : g.moveTo(X(xs[i]), Y(v))); g.stroke(); };
  if (hands) { line(sp, getCss('--jek-cyan'), 1.3); line(sm, getCss('--jek-orange'), 1.3); }
  else {
    line(lin, sat.length ? 'rgba(160,170,178,0.9)' : getCss('--jek-cyan'), sat.length ? 1 : 1.5);
    if (sat.length) line(sat, getCss('--jek-cyan'), 1.4);
  }
  // where the laser is now
  if (at !== null) { g.strokeStyle = getCss('--jek-orange'); g.lineWidth = 1.2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(at / 1e9), A.t); g.lineTo(X(at / 1e9), A.t + A.h); g.stroke(); g.setLineDash([]); }
  g.restore();
  drawAxes(g, A, [lo / 1e9, hi / 1e9], yr, { kind: 'plain', title: 'GHz from the ' + ATOMS[el.atom].iso.slice().sort((a, b) => b[1] - a[1])[0][0].replace(/(\d+)/, '-$1') + ' ' + el.line + ' centre' }, { kind: 'plain', title: 'transmission' });
}
export function cubePanel(el) {
  panel.append(h('h3', null, 'Beam splitter cube'));
  const rows = h('div', { class: 'rt-rows' },
    param('Size (mm)', el, 'size', { wide: true }),
    selectField('Type', [['npbs', 'Non-polarising'], ['pbs', 'Polarising']], () => el.mode, v => el.mode = v, { wide: true }));
  if (el.mode === 'pbs') {
    rows.append(param('s reflected (%)', el, 'reflectS'), param('p reflected (%)', el, 'reflectP'));
  } else rows.append(param('Reflected (%)', el, 'reflect', { wide: true }));
  panel.append(rows);
  panel.append(materialRows(el));
  panel.append(coatingRows(el, el, 'Face coating'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, el.mode === 'pbs'
    ? 'A polarising cube passes p and reflects s. The defaults leave a little leakage in each arm, which is what an extinction ratio really means.'
    : 'The coated diagonal reflects this share of each ray and transmits the rest. Ray brightness shows the power left in each branch.'));
  panel.append(blockNote(el));
}
export function prismPanel(el) {
  panel.append(h('h3', null, 'Prism'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Shape', Object.entries(PRISM_SHAPES), () => el.shape, v => { removeSweeps(el, 'thickness'); el.shape = v; }, { wide: true }),
    param(el.shape === 'window' || el.shape === 'dove' ? 'Height (mm)' : el.shape === 'right' ? 'Leg length (mm)' : 'Side (mm)', el, 'size', { wide: el.shape !== 'window' }),
  );
  if (el.shape === 'window') rows.append(param('Thickness (mm)', el, 'thickness'));
  panel.append(rows);
  panel.append(materialRows(el));
  panel.append(coatingRows(el, el, 'Face coating'));
  panel.append(blockNote(el));
}

export function jonesPanel(el) {
  const wp = el.type === 'waveplate';
  panel.append(h('h3', null, wp ? 'Waveplate' : 'Polariser'));
  const rows = h('div', { class: 'rt-rows' },
    param('Aperture (mm)', el, 'length', { wide: true }),
    param(wp ? 'Fast axis from p (\u00b0)' : 'Transmission axis from p (\u00b0)', el, 'axis', { wide: true }));
  if (wp) {
    rows.append(selectField('Retardance', [['0.25', 'Quarter wave'], ['0.5', 'Half wave'], ['custom', 'Custom']],
      () => el.retardCustom ? 'custom' : String(el.retard),
      v => {
        if (v === 'custom') el.retardCustom = true;
        else { el.retardCustom = false; el.retard = +v; }
      }, { wide: true }));
    if (el.retardCustom) rows.append(param('Retardance (waves)', el, 'retard', { wide: true }));
  }
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, wp
    ? 'Rays pass straight through; only the polarisation changes. A quarter wave at 45\u00b0 turns linear light circular, and a half wave at \u03b8 rotates linear light by 2\u03b8. Retardance is taken as given at every wavelength.'
    : 'Passes the component along its axis and absorbs the rest. 0\u00b0 passes p, 90\u00b0 passes s.'));
}

export function maskPanel(el) {
  panel.append(h('h3', null, 'Mask'));
  const rows = h('div', { class: 'rt-rows' }, param('Aperture (mm)', el, 'length', { wide: true }),
    selectField('Preset', [...MASK_PRESETS.map(p => [p[0], p[1]]), ['custom', 'Custom']], () => el.preset, v => {
      const p = MASK_PRESETS.find(q => q[0] === v);
      el.preset = v;
      if (p) { el.amp = p[2]; el.delay = p[3]; }
    }, { wide: true }));
  const err = h('p', { class: 'note', style: 'color:var(--jek-red, #b3261e)' });
  const text = (label, key) => {
    const id = 'rtf' + (setFid(fid + 1));
    const inp = h('input', { id, type: 'text', spellcheck: 'false', value: el[key], style: 'font-family:var(--jek-mono)' });
    inp.addEventListener('change', () => {
      const v = inp.value.trim() || (key === 'amp' ? '1' : '0');
      try { compileMaskExpr(v); } catch (e) { err.textContent = label + ': ' + e.message + '.'; return; }
      err.textContent = '';
      checkpoint(); el[key] = v; el.preset = 'custom'; changed(true);
    });
    return h('div', { class: 'rt-f wide' }, h('div', { class: 'rt-lab' }, h('label', { for: id }, label)), inp);
  };
  rows.append(text('Amplitude, A(x, y)', 'amp'), text('Delay in waves, D(x, y)', 'delay'));
  panel.append(rows, err);
  const me = maskFns(el);
  if (me.err) err.textContent = me.err;
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'The mask multiplies the field by A\u00b7exp(\u22122\u03c0iD): A is the amplitude transmission (the intensity goes as A\u00b2), and D delays the light by D waves, so a positive D acts like extra glass. x runs along the mask in the bench plane, y out of it, r and theta are their polar form, all in mm from its centre, and lambda is the wavelength in mm. Functions: sin, cos, tan, asin, acos, atan, atan2, exp, log, sqrt, abs, pow, min, max, floor, ceil, round, sign, hypot, mod, step (1 from 0 up), rect (1 within \u00b10.5), circ (1 up to 1), sinc, gauss (exp(\u2212x\u00b2)); ^ is a power, and ?: < > == && || work too.'));
  panel.append(h('p', { style: 'margin-top:0.4rem' }, 'Rays take A and D where they cross, and bend by the slope of D, so a phase lens focuses them and a grating\u2019s slope steers them; the diffracted field takes the full function. A function that is round about the beam keeps it round; anything else makes it a 2D field.'));
}

export function stopPanel(el) {
  panel.append(h('h3', null, 'Stop'));
  const rows = h('div', { class: 'rt-rows' },
    selectField('Shape', STOP_SHAPES, () => el.shape, v => {
      el.shape = v;
      // slits that would overlap their neighbours get a width that leaves them apart
      if (v === 'double' && el.aperture >= el.sep) el.aperture = +(el.sep / 4).toPrecision(3);
      if (v === 'comb' && el.aperture >= el.pitch) el.aperture = +(el.pitch / 2).toPrecision(3);
    }, { wide: true }));
  const s = el.shape;
  if (s !== 'knife') rows.append(param(s === 'disc' ? 'Block diameter (mm)' : stopSlitLike(el) ? 'Slit width (mm)' : 'Clear aperture (mm)', el, 'aperture'));
  if (s === 'double') rows.append(param('Separation (mm)', el, 'sep'));
  if (s === 'comb') rows.append(param('Pitch (mm)', el, 'pitch'), param('Number of slits', el, 'count'));
  rows.append(param(s === 'knife' ? 'Edge position (mm)' : 'Offset (mm)', el, 'offset'));
  if (stopSlitLike(el)) rows.append(param('Height (mm)', el, 'height', { blank: 0, placeholder: 'unlimited', fmt: v => v ? fmtNum(v) : '' }));
  if (s === 'knife') rows.append(selectField('Covers', [['1', 'The side above the edge'], ['-1', 'The side below the edge']],
    () => String(el.side), v => { el.side = +v; }));
  rows.append(param('Outer size (mm)', el, 'outer'));
  panel.append(rows);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'An opaque plate of the outer size. Rays through an opening carry on untouched; anything striking a blade stops there. The offset moves the opening (or the pair of slits, the comb, the edge or the block) along the stop. A double slit\u2019s separation and a comb\u2019s pitch run centre to centre; a slit\u2019s height is its length out of the bench plane, blank for unlimited. Out of the bench plane an iris and a block are circles and slits run to their height, which matters to the diffracted field: the beam\u2019s reference ray passes through the blades, so the stop acts as a mask on the field wherever it sits across the beam. Sweep the width to watch a system vignette, or the separation to walk Young\u2019s fringes.'));
  panel.append(h('div', { class: 'rt-readout', 'data-readout': 'stop' }));
}

