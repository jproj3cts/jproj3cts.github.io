import { clamp } from '../core/constants.js';
import { fmtDbm, fmtFs, fmtFs2, fmtFs3, fmtHz, fmtJ, fmtLen, fmtMw, fmtNum, fmtW, fmtWl } from '../core/format.js';
import { GLASS, glassKey, matLabel, refIndex } from '../core/glass.js';
import { ATOMS, ATOM_ISO, C_SI, KB } from '../core/cells.js';
import { SPHERE_DENSITY, TRAP_ATOMS, atomLines, trapFLabel } from '../core/traps.js';
import { MU_B } from '../core/zeeman.js';
import { cellDensity, cellPlan, cellProfile, cellResponse, evalPlan, nlcConvert } from '../core/nlc.js';
import { C_MM } from '../core/modulators.js';
import { RF_HORNS, RF_RX, RF_TX, applyRf, hornLam, normRf } from '../core/rf.js';
import { hornComps, hornPattern } from '../core/horns.js';
import { FIBRE_NG } from '../core/coherence.js';
import { PULSE_SAMPLES, applyPulse, fibreDisp, fibreGDD, fibreGamma, pulseDnu } from '../core/pulses.js';
import { deg, nextName, normCoat, project, typeLabel } from '../state/project.js';
import { COAT_MATERIALS, coatPreset, qwot, stackAmp } from '../core/coatings.js';
import { benchNms, getEl, normElement } from '../state/elements.js';
import { lastTrace } from '../engines/trace.js';
import { linkBudget, rfSweep } from '../engines/rf-sweep.js';
import { getCss, removeFibre } from './render.js';
import { groupEls, ungroupEls } from './drawings.js';
import { snapVal } from './pointer.js';
import { CONNS, FIBRE_N, netPower, pkey, portName, portsOf } from '../engines/fibre.js';
import { signalSection } from './instruments.js';
import { refNm } from './optimise.js';
import { bindSync, fid, h, numInput, panel, param, renderPanel, selectField, setFid, vs } from './panel.js';
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
export function pulseSectionEmpty() {
  panel.append(h('h3', { class: 'rt-muted' }, 'Pulse'),
    h('p', { class: 'note rt-muted' }, 'No pulsed source on the bench. Give a source (or a fibre laser) a pulse duration and the pulse that arrives here shows in this section: its duration, chirp and arrival time.'));
}
export function pulseSection(el) {
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
export const anyPulse = () => project.elements.some(e => (e.type === 'source' || (e.type === 'fcomp' && e.kind === 'laser')) && e.tau > 0);
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
export function screenParams(el) {

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
      [['bare', el.mmw ? 'Bare face (Fresnel)' : 'Bare glass (Fresnel)'], ['ar', 'AR coated'], ['band', 'Coated over a band'],
        ['custom', 'Custom reflectance'], ['stack', 'Thin-film stack'], ...(el.mmw ? [['match', 'Matching layer (\u03bb/4 at the bench frequency)']] : [])],
      () => holder.coat.mode,
      v => {
        const keep = holder.coat;
        if (v === 'match') { holder.coat = matchLayer(refIndex((el.materials || [])[0] || { glass: 'HDPE' }, benchNms()[0]), benchNms()[0]); return; }
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

export function materialRows(el) {
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
export function blockNote(el) {
  const wl = project.elements.find(e => e.type === 'source');
  const nm = wl ? wl.wavelength : 587.6;
  return h('p', { style: 'margin-top:0.6rem' }, matLabel(el.material) + ' n = ' + refIndex(el.material, nm).toFixed(4) + ' at ' + fmtWl(nm) + '.' +
    (el.source ? ' Imported from ' + el.source + '.' : ''));
}
export const readoutBox = kind => h('div', { class: 'rt-readout', 'data-readout': kind });
/* a receiving horn's frequency sweep (S21 against frequency, the bench traced at each step) and
   its link budget down the strongest beam that reaches it */
function rfReceiverSections(el) {
  panel.append(h('h3', null, 'Frequency sweep'));
  panel.append(h('div', { class: 'rt-rows' }, param('Span (% of the frequency)', el, 'mmw.span'), param('Points', el, 'mmw.points')));
  const cv = h('canvas', { height: '190', style: 'width:100%;display:block' });
  const info = h('p', { class: 'note' });
  panel.append(cv, plotSaveRow(cv), info);
  bindSync(cv, () => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 190, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const S = rfSweep(el);
    if (!S) { info.textContent = 'No feed horn on the bench to sweep.'; return; }
    const lo = S.ghz[0], hi = S.ghz[S.ghz.length - 1], vals = S.s21.filter(v => v > -199);
    const top = vals.length ? Math.ceil(Math.max(...vals) / 5) * 5 : 0, bot = Math.max(top - 60, vals.length ? Math.floor(Math.min(...vals) / 5) * 5 : -60);
    const sy = { kind: 'plain', title: 'S21, dB' }, sx = { kind: 'plain', title: 'frequency, GHz' };
    const A = plotArea(c, w, hgt, [bot, top], sy), X = x => A.l + (x - lo) / (hi - lo) * A.w, Y = v => A.t + A.h - (Math.max(bot, Math.min(top, v)) - bot) / (top - bot) * A.h;
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    c.strokeStyle = '#e0a030'; c.lineWidth = 1.5; c.beginPath();
    S.ghz.forEach((x, i) => { const y = Y(S.s21[i]); i ? c.lineTo(X(x), y) : c.moveTo(X(x), y); }); c.stroke();
    // the frequency the bench is at
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(X(S.f0), A.t); c.lineTo(X(S.f0), A.t + A.h); c.stroke(); c.setLineDash([]);
    c.restore();
    drawAxes(c, A, [lo, hi], [bot, top], sx, sy);
    plotCsv(cv, el.name + ' sweep', ['frequency_GHz', 'S21_dB', 'coupling'], () => S.ghz.map((x, i) => [x, S.s21[i], S.eff[i]]));
    const at = S.ghz.reduce((m, x, i) => (Math.abs(x - S.f0) < Math.abs(S.ghz[m] - S.f0) ? i : m), 0);
    info.textContent = 'The power into this horn\u2019s mode over the power launched, every feed horn swept together; ' + S.ghz.length + ' points, the bench traced at each (' + Math.round(S.ms) + ' ms). At ' + (+S.f0.toPrecision(4)) + ' GHz: ' + S.s21[at].toFixed(2) + ' dB.';
  });
  panel.append(h('h3', null, 'Link budget'));
  const box = h('div', { class: 'rt-readout' });
  panel.append(box);
  bindSync(box, () => {
    const L = linkBudget(el);
    if (!L) { box.replaceChildren(h('p', { class: 'note' }, 'Nothing reaches this horn.')); return; }
    const f = v => (isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + ' dB' : '\u2212\u221e');
    box.replaceChildren(h('table', null, h('tbody', null,
      ...L.rows.map(r => h('tr', null, h('td', null, r.what + (r.note ? ', ' + r.note : '')), h('td', null, r.note === 'launched' ? fmtDbm(L.inMw) : f(r.db)))),
      h('tr', null, h('td', null, h('b', null, 'Received')), h('td', null, h('b', null, f(L.total) + ', ' + fmtDbm(L.mw)))))),
      h('p', { class: 'note' }, 'Down the strongest beam that reaches it: what each part did to the power (a dielectric\u2019s absorption is in the step after it), then the overlap with the horn\u2019s mode.'));
  });
}
/* a dielectric face matched at the bench's frequency: a quarter wave of index \u221an */
export function matchLayer(nGlass, nm) {
  const n1 = Math.sqrt(nGlass);
  return normCoat({ mode: 'stack', design: nm, layers: [{ n: n1, d: nm / (4 * n1) }], label: 'Matching layer' });
}
/* a horn's far-field pattern: cuts through it along and across the polarisation and the
   cross-polar field between, in dB against the angle, from the aperture field itself */
function rfPatternSection(el) {
  panel.append(h('h3', null, 'Far-field pattern'));
  const cv = h('canvas', { height: '200', style: 'width:100%;display:block' });
  const box = h('div', { class: 'rt-readout' });
  panel.append(cv, plotSaveRow(cv), box);
  bindSync(cv, () => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 200, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const lam = hornLam(el), P = hornPattern(el.mmw.kind, el.mmw.a, el.mmw.L, lam), lo = P.th[0], hi = P.th[P.th.length - 1];
    const sy = { kind: 'plain', title: 'dB' }, sx = { kind: 'plain', title: 'angle from the axis, \u00b0' };
    const A = plotArea(c, w, hgt, [-50, 0], sy), X = x => A.l + (x - lo) / (hi - lo) * A.w, Y = v => A.t + A.h - (Math.max(-50, Math.min(0, v)) + 50) / 50 * A.h;
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    const line = (ys, col, dash) => { c.strokeStyle = col; c.lineWidth = 1.5; c.setLineDash(dash || []); c.beginPath(); P.th.forEach((x, i) => { const y = Y(ys[i]); i ? c.lineTo(X(x), y) : c.moveTo(X(x), y); }); c.stroke(); c.setLineDash([]); };
    line(P.E, '#e0a030'); line(P.H, '#7ee0a1'); line(P.X, 'rgba(255,255,255,0.55)', [3, 3]);
    c.restore();
    drawAxes(c, A, [lo, hi], [-50, 0], sx, sy);
    c.font = '11px system-ui, sans-serif'; c.textAlign = 'left';
    [['E-plane (along the field)', '#e0a030'], ['H-plane', '#7ee0a1'], ['cross-polar, 45\u00b0 plane', 'rgba(255,255,255,0.7)']].forEach(([t, col], k) => { c.fillStyle = col; c.fillText(t, A.l + 8, A.t + 14 + 13 * k); });
    plotCsv(cv, el.name + ' pattern', ['angle_deg', 'E_dB', 'H_dB', 'xpol_dB'], () => P.th.map((x, i) => [x, P.E[i], P.H[i], P.X[i]]));
    const M = hornComps(el.mmw.kind), f1 = v => v === null ? 'none' : v.toFixed(1) + ' dB';
    box.replaceChildren(h('table', null, h('tbody', null,
      h('tr', null, h('td', null, 'Directivity'), h('td', null, P.dir.toFixed(1) + ' dBi')),
      h('tr', null, h('td', null, 'Half-power width, E / H'), h('td', null, P.hpbw[0].toFixed(2) + '\u00b0 / ' + P.hpbw[1].toFixed(2) + '\u00b0')),
      h('tr', null, h('td', null, 'First sidelobe, E / H'), h('td', null, f1(P.lobes[0]) + ' / ' + f1(P.lobes[1]))),
      h('tr', null, h('td', null, 'Cross-polar peak'), h('td', null, P.xpol < -100 ? 'none' : P.xpol.toFixed(1) + ' dB')),
      h('tr', null, h('td', null, 'Gaussicity'), h('td', null, (100 * M.gauss).toPrecision(3) + '% of the power in the fitted Gaussian')),
      h('tr', null, h('td', null, 'Carried on the bench'), h('td', null, M.comps.length === 1 ? 'the Gaussian' : M.comps.length + ' Hermite\u2013Gauss modes, ' + (100 * M.carried).toPrecision(3) + '% of the power' + (M.cross > 1e-4 ? ' (' + (100 * M.cross).toPrecision(2) + '% is cross-polar)' : ''))))),
      h('p', { class: 'note' }, 'The Fourier transform of the field across the aperture (horn type, size and slant length) at ' + fmtWl(lam * 1e6) + ', relative to its peak.'));
  });
}
/* an RF feed horn, sending or receiving: its frequency and power (a source), its type and size;
   the beam it launches, or takes in, from those (the field across its aperture, as modes) */
export function rfHornPanel(el) {
  const tx = el.type === 'source', rf = el.mmw;
  const reset = () => { el.mmw = normRf(el.mmw, el.type); applyRf(el); };
  panel.append(h('h3', null, tx ? 'Feed horn' : 'Receiving horn'));
  const rows = h('div', { class: 'rt-rows' });
  if (tx) rows.append(param(rf.tx === 'up' ? 'Nominal power (dBm), traced at' : 'Power (dBm)', el, 'mmw.dbm'), param('Frequency (GHz)', el, 'mmw.ghz'));
  rows.append(
    selectField('Horn', Object.entries(RF_HORNS).map(([k, v]) => [k, v.name]), () => rf.kind, v => { rf.kind = v; applyRf(el); }, { wide: true }),
    param(rf.kind === 'diagonal' ? 'Aperture half-side (mm)' : 'Aperture radius (mm)', el, 'mmw.a'),
    param('Slant length (mm)', el, 'mmw.L'));
  panel.append(rows);
  panel.append(h('h3', null, tx ? 'Drive' : 'Front end'));
  const fe = h('div', { class: 'rt-rows' });
  if (tx) {
    fe.append(selectField('Carrier', Object.entries(RF_TX), () => rf.tx, v => {
      rf.tx = v;
      // its inputs change: the wires to them go
      project.fibres = (project.fibres || []).filter(F => !(F.wire && F.b[0] === el.id));
      reset();
    }, { wide: true }));
    if (rf.tx === 'up') fe.append(param('Conversion loss (dB)', el, 'mmw.cl'));
  } else {
    fe.append(selectField('Takes in', [['both', 'Both polarisations'], ['s', 's: the field out of the bench plane'], ['p', 'p: the field in the bench plane']], () => rf.pol, v => { rf.pol = v; reset(); }, { wide: true }),
      selectField('Front end', Object.entries(RF_RX), () => rf.rx, v => { rf.rx = v; reset(); }, { wide: true }));
    if (rf.rx === 'video') fe.append(param('Responsivity (V/W)', el, 'mmw.rv'), param('NEP (pW/\u221aHz)', el, 'mmw.nep'), param('Video bandwidth (MHz)', el, 'mmw.vbw'), param('Output limit (V)', el, 'vmax'));
    else fe.append(param('Local oscillator (GHz)', el, 'mmw.lo'), param('Conversion loss (dB)', el, 'mmw.cl'), param('Noise temperature (K)', el, 'mmw.trx'), param('IF bandwidth (MHz)', el, 'mmw.ifbw'), param('Looks into (K)', el, 'mmw.tant'));
  }
  panel.append(fe);
  panel.append(readoutBox('rfhorn'));
  if (!tx) rfReceiverSections(el);
  rfPatternSection(el);
  if (!tx) signalSection(el);
  panel.append(h('p', { style: 'margin-top:0.6rem' }, tx
    ? 'Launches the field across its aperture (the waveguide mode its type leaves there, on a phase front from its apex), carried as Hermite\u2013Gauss modes of the Gaussian that fits it best: the Gaussian itself, and the modes that give its sidelobes. The cross-polar field, and the sharp edge at the wall that the modes stop short of, are left out and counted. The beam then goes through the bench as any beam does.'
    + (rf.tx === 'up' ? ' As an upconverter it sends up what comes into its IF port: the carrier\u2019s power is the IF voltage squared over 50 \u03a9, less the conversion loss, and a mixer behind a receiving horn brings it down again.' : ' Under external control its power and frequency follow the electronics.')
    : 'Takes in the overlap of the field arriving on its aperture with its own mode (the field its horn would launch, sent backwards), so a wrong size, a wrong focus, an offset or a tilt each cost what they should. '
    + (rf.rx === 'mixer' ? 'The mixer puts out each carrier at its IF, |f \u2212 f\u2097\u2092|, less the conversion loss, as volts across 50 \u03a9, over the noise of its temperature and what it looks into.' : 'The video detector puts out its responsivity times the power, over its NEP.')));
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
/* a partner for a link plane: same pair, same orientation, in the middle of that tab's view */
export function makeLinkPartner(el, benchId) {
  if (!benchId) { addBench(); benchId = project.tab; }
  checkpoint();
  const b = project.benches.find(b2 => b2.id === benchId);
  const c = normElement({ type: 'link', name: nextName('Link plane'), x: snapVal(b.view.cx), y: snapVal(b.view.cy), angle: el.angle, length: el.length, pair: el.pair, bench: benchId });
  project.elements.push(c);
  selectEl(c);
  changed(true);
}
export function drawNlcTuning(cv, el, hits) {
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
/* the cell's lines and the beams through it, relative to the strongest isotope's line centre */
export function cellInfo(el) {
  const lines = atomLines(el.atom, el.line), iso0 = ATOMS[el.atom].iso.slice().sort((a, b) => b[1] - a[1])[0][0];
  const nu0 = ATOM_ISO[iso0][el.line].nu, T = el.temp + 273.15;
  const beams = ((lastTrace.cells || []).filter(c => c.id === el.id));
  const dop = a => 2 * Math.sqrt(Math.LN2) * a.nu / C_SI * Math.sqrt(2 * KB * T / a.m);
  return { lines, nu0, beams, n: cellDensity(el), doppler: dop(lines[0]), natural: lines[0].A / (2 * Math.PI), Isat: lines[0].Isat };
}
export function drawCellSpectrum(cv, el, span) {
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

