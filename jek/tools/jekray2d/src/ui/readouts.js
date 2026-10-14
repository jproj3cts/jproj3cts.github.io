import { clamp } from '../core/constants.js';
import { fmtDbm, fmtFreq, fmtGHz, fmtHz, fmtLen, fmtMw, fmtWl } from '../core/format.js';
import { glassKey, matLabel, refIndex } from '../core/glass.js';
import { CRYSTALS, bireMat, filterT, gainAt, walkOff } from '../core/crystals.js';
import { cellPolar } from '../core/zeeman.js';
import { cellPlanFor, evalPlan, gratingOrders } from '../core/nlc.js';
import { eomSidebands } from '../core/modulators.js';
import { C_NM_GHZ, fibrePdNm, hornLam, pdResp, responsivity, rfBeam } from '../core/rf.js';
import { hornComps, hornPattern } from '../core/horns.js';
import { deg, project } from '../state/project.js';
import { benchNms, getEl, selected } from '../state/elements.js';
import { meshSize } from '../core/stl.js';
import { frame, toLocalDir } from '../core/mask.js';
import { lastTrace, paraxial, sourceLines } from '../engines/trace.js';
import { portsInUse } from './render.js';
import { playing } from './sweeps.js';
import { detectorReading, faceArrivals, fibreCoupling, fibreMode, rfCoupling } from '../engines/fibre-face.js';
import { ampASE, ampGain, netPower, pkey } from '../engines/fibre.js';
import { ELEC } from '../engines/elec.js';
import { pdNetMw, pdSignal } from '../engines/detector.js';
import { PIC_UI } from './pic.js';
import { h, mainPanel, pinBoxes } from './panel.js';
import { cellInfo, portPower, portRows } from './panels.js';
import { blockedPct, pctOfSources, viaCavity } from '../engines/pd-cavity.js';
import { screenStats } from '../engines/screen-stats.js';

/* ==========================================================================
   Readouts: the live numbers in a part's panel, refreshed as the bench plays.
   ========================================================================== */

export function updateReadouts() {
  const sel = selected();
  if (mainPanel.style.display !== 'none') updateReadoutsIn(mainPanel, sel);
  for (const [id, box] of pinBoxes) updateReadoutsIn(box, getEl(id));
}

/* a readout's numbers at a steady width: each decimal to four significant figures, zeros kept */
const steadyNums = t => t.replace(/-?\d+\.\d+(?:e[+-]?\d+)?/g, m => { const x = parseFloat(m); return (x < 0 ? '-' : '') + Math.abs(x).toPrecision(4); });

function updateReadoutsIn(container, el) {
  const box = container.querySelector('[data-readout]');
  if (!box) return;
  const live = playing.size > 0;
  let parts;
  if (!el) {
    const T = lastTrace;
    const S = T.system;
    const sysRows = [];
    if (S && !S.collimated && isFinite(S.efl)) {
      sysRows.push(['System focal length', fmtLen(S.efl)]);
      if (S.bfd !== null) sysRows.push(['Back focal distance', fmtLen(S.bfd)]);
      if (S.fnum) sysRows.push(['Working f/number', 'f/' + (+S.fnum.toPrecision(4))]);
      if (S.na) sysRows.push(['Working NA', (+S.na.toPrecision(4))]);
    } else if (S && S.collimated) {
      sysRows.push(['System focal length', 'collimated: the beam leaves parallel']);
    }
    parts = [[...sysRows,
      ['Rays from sources', String(T.emitted || 0)], ['Ray segments drawn', String(T.rays.length)],
      ['Stopped at the limit', String(T.limited || 0)], ['Dropped below the power floor', String(T.dropped || 0)],
      ...(T.absorbed > 0.0001 ? [['Absorbed in glass', (+pctOfSources(T.absorbed).toPrecision(3)) + '% of emitted']] : [])],
      T.truncated ? 'The scene needs more work than one redraw allows, so some rays were cut short. Lower the ray count, the interaction limit, or raise the power floor.'
        : 'First-order figures come from three thin rays sent in parallel to the first source, so they describe the system that source sees. Each reflection, refraction or pass through a screen counts as one interaction.'];
  } else if (el.type === 'screen') {
    const st = screenStats(el);
    let rows;
    if (!st || st.empty) rows = [[el.absorb ? 'Rays hitting' : 'Crossings recorded', '0']];
    else {
      rows = [[el.absorb ? 'Rays hitting' : 'Crossings recorded', String(st.count)],
        [el.absorb ? 'Power received' : 'Power, all crossings', (+st.powerPct.toPrecision(4)) + '% of what its sources emit'],
        ['Centroid', fmtLen(st.centroid)], ['RMS spot', fmtLen(st.rms)], ['Full width', fmtLen(st.full)],
        ['Mean optical path', fmtLen(st.oplMean)]];
      const K = st.stokes;
      if (K.S0 > 0) {
        const s1 = K.S1 / K.S0, s2 = K.S2 / K.S0, s3 = K.S3 / K.S0;
        const dop = Math.hypot(s1, s2, s3);
        const fs = 100 * (1 - s1) / 2;
        rows.push(['s : p', (+fs.toPrecision(3)) + ' : ' + (+(100 - fs).toPrecision(3))]);
        if (Math.abs(s3) > 1e-4) rows.push(['Circular', (+(100 * Math.abs(s3)).toPrecision(3)) + '% ' + (s3 > 0 ? 'right-handed' : 'left-handed')]);
        if (Math.abs(s2) > 1e-4 && Math.abs(s3) < 0.999) rows.push(['Linear at 45\u00b0', (+(100 * s2).toPrecision(3)) + '%']);
        rows.push(['Degree of polarisation', (+(100 * dop).toPrecision(4)) + '%']);
      }
      if (st.visibility !== null && st.visibility > 0.01) rows.push(['Fringe visibility', (+(100 * st.visibility).toPrecision(4)) + '%']);
      if (st.interference !== null && Math.abs(st.interference - 1) > 0.02) {
        rows.push(['Interference', (100 * st.interference).toFixed(1) + '% of the incoherent sum']);
      }
    }
    if (st && st.beam) {
      const B = st.beam;
      rows.push(B.wy ? ['Beam radius w (in, out of plane)', fmtLen(B.w) + ', ' + fmtLen(B.wy)] : ['Beam radius w', fmtLen(B.w)],
        ['Wavefront radius', fmtLen(B.R)],
        ['Waist', fmtLen(B.w0) + (Math.abs(B.waistDist) < 1e-6 ? ' here' : (B.waistDist > 0 ? ' ' + fmtLen(B.waistDist) + ' ahead' : ' ' + fmtLen(-B.waistDist) + ' behind')),
        ], ['Rayleigh range', fmtLen(B.zR)]);
      if (st.wfRMS != null && isFinite(st.wfRMS)) {
        const waves = d => (+(d / (st.nm * 1e-6)).toPrecision(4)) + ' λ';
        rows.push(['Wavefront P–V', waves(st.wfPV) + '  (' + fmtLen(st.wfPV) + ')'], ['Wavefront RMS', waves(st.wfRMS)]);
      }
      if (st.roundTrip > 0 && viaCavity(el)) rows.push(['Round-trip path', fmtLen(st.roundTrip)], ['Free spectral range', fmtFreq(299792458 / (st.roundTrip / 1000))]);
      if (st.perNm && st.perNm.length > 1) {
        for (const q of st.perNm.slice(0, 6)) rows.push([q.nm + ' nm', fmtLen(q.rms) + ' RMS at ' + fmtLen(q.centroid)]);
        const cs = st.perNm.map(q => q.centroid);
        rows.push(['Colour spread', fmtLen(Math.max(...cs) - Math.min(...cs))]);
      }
    }
    parts = [rows, 'Spot statistics are measured along the screen from its centre and weighted by ray power. Wavefront error is the spread in optical path to the centroid.' +
      (st && st.mixed ? ' Path figures use the most common wavelength on this screen.' : '')];
  } else if (el.type === 'pic') {
    parts = PIC_UI.readout(el);                                                                   // PIC hook
  } else if (el.type === 'elec') {
    parts = ELEC.readout(el);                                                                  // ELEC hook
  } else if (el.type === 'fcomp') {
    const rows = portRows(el);
    if (el.kind === 'pd') {
      const net = lastTrace.net, mw = pdNetMw(el), R = pdResp(el), mA = mw * R, V = mA * 1e-3 * el.gain;
      const N = pdSignal(el).noise, f = v => v === 0 ? '0' : Math.abs(v) >= 0.01 ? String(+v.toPrecision(4)) : v.toExponential(3);
      if (el.balanced && net) { const a = netPower(net.pd.get(el.id), net.keys), b = netPower(net.pd.get(el.id + '~'), net.keys); rows.unshift(['On in +, in \u2212', fmtMw(a) + ', ' + fmtMw(b)]); }
      rows.unshift([el.balanced ? 'Optical power, + less \u2212' : 'Optical power', fmtMw(mw)], ['Responsivity', (+R.toPrecision(3)) + ' A/W' + (el.material === 'custom' ? '' : ', at ' + (+fibrePdNm(el).toFixed(1)) + ' nm')],
        ['Photocurrent', (+mA.toPrecision(4)) + ' mA'],
        ...(el.diode ? (N ? [['Noise', f(Math.sqrt(N.i2) * 1e9) + ' nA rms']] : []) : [['Output', (+Math.min(V, el.vmax).toPrecision(4)) + ' V' + (V > el.vmax ? ', at its limit' : '')], ...(N ? [['Noise', f(N.V * 1e3) + ' mV rms']] : [])]),
        ...(N && N.snr !== null ? [['Signal to noise', (+N.snr.toPrecision(4)) + ' dB']] : []));
    }
    if (el.kind === 'amp') {
      const net = lastTrace.net, Pin = net ? netPower(net.inn.get(pkey(el.id, 0)), net.keys) : 0, G = ampGain(el, el.centre), A = ampASE(el);
      rows.unshift(['Gain at ' + el.centre + ' nm', (10 * Math.log10(G)).toFixed(2) + ' dB' + (el.g0 - 10 * Math.log10(G) > 0.05 ? ' (saturated from ' + el.g0 + ' dB)' : '')],
        ['In, total', fmtMw(Pin) + ' (' + (Pin > 0 ? (10 * Math.log10(Pin)).toFixed(1) : '\u2212\u221e') + ' dBm)'],
        ['ASE out, each way', fmtMw(2 * A.perPol * 1e3) + ' over ' + el.bw + ' nm']);
    }
    if (el.kind === 'laser') rows.unshift(['Linewidth', el.coh > 0 ? fmtHz(299792458e3 / el.coh) : 'a single frequency']);
    if (lastTrace.net && lastTrace.net.truncated) rows.push(['Note', 'the light was followed round a very long way: the readings leave out what was left']);
    parts = [rows, 'Powers are for the light leaving each port into its fibre and arriving from it.'];
  } else if (el.type === 'fibre') {
    const r = fibreCoupling(el), nm = benchNms()[0], m = fibreMode(el.core, el.na, nm);
    const rows = el.mm ? [['Core, NA', el.core + ' \u00b5m, ' + el.na + ': accepts ' + (+(Math.asin(Math.min(1, el.na)) / deg).toPrecision(3)) + '\u00b0 half-angle'],
      ['Beam it sends out', 'M\u00b2 ' + (+clamp(Math.PI * el.core / 2e3 * el.na / (nm * 1e-6), 1, 30).toPrecision(3)) + ' at ' + nm + ' nm (a filled core)']] : [['Mode field diameter', fmtLen(2 * m.w) + ' at ' + nm + ' nm'], ['V number', (+m.V.toPrecision(3)) + (m.V < 2.405 ? ', single mode' : ', multimode: the fundamental only is shown')]];
    if (r) rows.push(['Arriving', (+r.inMw.toPrecision(4)) + ' mW'], ['Coupling efficiency', (100 * r.eff).toPrecision(4) + '%'], ['Into the fibre', (+r.mw.toPrecision(4)) + ' mW']);
    else rows.push(['Arriving', 'no Gaussian beam reaches the face']);
    const twisted = faceArrivals(el).some(A => A.QM && A.QM.twisted), twistNote = ['Note', 'a higher-order beam arrives twisted (parts at odd angles to each other turned its axes apart): its modes are only roughly placed; read it from the diffracted field'];
    if (twisted) rows.push(twistNote);
    if (portsInUse().has(pkey(el.id, 0))) {
      const P = portPower(el, 0);
      rows.push(['Into the fibre network', fmtMw(P.out)], ['Out into free space', fmtMw(P.inn)]);
    }
    parts = [rows, el.mm ? 'Efficiency is the share of what arrives that lands on the core within the acceptance cone.' : 'Efficiency is what enters the fibre’s mode against what arrives on its face.'];
  } else if (el.mmw && !el.mmw.part) {
    const f = v => v === 0 ? '0' : Math.abs(v) >= 0.01 ? String(+v.toPrecision(4)) : v.toExponential(3), rf = el.mmw;
    const C = el.type === 'detector' ? rfCoupling(el) : null, ghz = el.type === 'source' ? rf.ghz : C && C.beam ? C_NM_GHZ / (C.beam.lam * 1e6) : null;
    const B = ghz ? rfBeam(rf, ghz) : null, M = hornComps(rf.kind), P = hornPattern(rf.kind, rf.a, rf.L, hornLam(el));
    const beamRows = B ? [['Wavelength at ' + fmtGHz(C_NM_GHZ / ghz), fmtLen(B.lam)], ['Fitted Gaussian at the aperture, w', fmtLen(B.wa)],
      ['Waist, w\u2080', fmtLen(B.w0) + ', ' + fmtLen(B.dz) + ' behind the aperture'], ['Rayleigh range', fmtLen(B.zR)],
      ['Divergence, 1/e\u00b2 half-angle', (B.theta / deg).toPrecision(3) + '\u00b0'],
      ['Gaussicity', (100 * M.gauss).toPrecision(3) + '%' + (M.comps.length > 1 ? '; ' + M.comps.length + ' modes carry ' + (100 * M.carried).toPrecision(3) + '%' + (M.cross > 1e-4 ? ', ' + (100 * M.cross).toPrecision(2) + '% is cross-polar' : '') : '')],
      ['Directivity', P.dir.toFixed(1) + ' dBi']] : [];
    if (el.type === 'source') {
      parts = [[['Power in the beam', fmtDbm(el.power) + ' (' + fmtMw(el.power) + ')' + (rf.tx === 'up' ? ', at its nominal power' : '')], ...beamRows],
        rf.tx === 'up' ? 'An upconverter: the bench is traced at its nominal power, and the electronics scale the link by what comes into its IF port.' : 'The field across its aperture, carried as modes of the fitted Gaussian. Directivity is the far field\u2019s on the axis.'];
    } else {
      const r = detectorReading(el);
      const front = r.mixer ? [...r.lines.map(ln => { const src = getEl(ln.id); return ['IF from ' + (src ? src.name : '?'), fmtHz(ln.fif) + ', ' + fmtDbm(ln.mw * Math.pow(10, -rf.cl / 10))]; }),
        ['System temperature', (+r.tsys.toPrecision(4)) + ' K (' + rf.tant + ' K looked into, ' + rf.trx + ' K receiver)'],
        ['Noise floor', r.floor.toFixed(1) + ' dBm/Hz at the input; ' + fmtDbm(r.mds) + ' in the ' + (+rf.ifbw.toPrecision(4)) + ' MHz IF band'],
        ['Signal to noise', r.snr === null ? 'n/a' : (+r.snr.toPrecision(4)) + ' dB in the IF band']]
        : [['Output', f(r.V) + ' V' + (r.sat ? ', at its limit' : '')], ['Noise', f(r.noiseV * 1e3) + ' mV rms (' + fmtDbm(r.mds) + ' equivalent)'], ['Signal to noise', r.snr === null ? 'n/a' : (+r.snr.toPrecision(4)) + ' dB']];
      parts = [[['Arriving', C ? fmtDbm(C.inMw) : 'nothing'], ['Taken in', C ? fmtDbm(C.mw) + ', ' + (100 * C.eff).toPrecision(4) + '% of what arrives' : '\u2014'], ...front, ...beamRows],
        C ? 'Its mode at the frequency arriving' + (rf.pol === 'both' ? ', either polarisation.' : ', the ' + rf.pol + ' polarisation (the cross-polar field across it).') : 'Nothing arrives on its aperture. The beam figures show once something does.'];
    }
  } else if (el.type === 'detector') {
    const r = detectorReading(el), nm = benchNms()[0];
    const f = v => v === 0 ? '0' : Math.abs(v) >= 0.01 ? String(+v.toPrecision(4)) : v.toExponential(3);
    const twisted = faceArrivals(el).some(A => A.QM && A.QM.twisted), twistNote = ['Note', 'a higher-order beam arrives twisted (parts at odd angles to each other turned its axes apart): its modes are only roughly placed; read it from the diffracted field'];
    parts = [[...(twisted && !r.field ? [twistNote] : []), ...(r.pending ? [['Behind a cavity', 'working out its steady state\u2026']] : r.field ? [['Behind a cavity', 'read from the solved field']] : []),
      ['Optical power', f(r.mw) + ' mW'], r.mw > 0 ? ['Responsivity', (+(r.mA / r.mw).toPrecision(3)) + ' A/W, for the light arriving'] : ['Responsivity at ' + nm + ' nm', (+responsivity(el, nm).toPrecision(3)) + ' A/W'],
      ['Photocurrent', f(r.mA) + ' mA'], ...(el.diode ? [['Noise', f(r.noiseI * 1e9) + ' nA rms']] : [['Output', f(r.V) + ' V' + (r.sat ? ', at its limit' : '')],
      ['Noise', f(r.noiseV * 1e3) + ' mV rms']]), ['Signal to noise', r.snr === null ? 'n/a' : (+r.snr.toPrecision(4)) + ' dB']],
      'Sources count at the power set on each. Noise is over the bandwidth given.'];
  } else if (el.type === 'aom') {
    const nm = benchNms()[0], lam = nm * 1e-6, Lam = el.v * 1e3 / (el.rf * 1e6);
    parts = [[['Acoustic period', fmtLen(Lam)], ['Deflection at ' + nm + ' nm', (Math.asin(clamp(lam / Lam, -1, 1)) / deg * 1000).toPrecision(4) + ' mdeg (' + (lam / Lam * 1000).toPrecision(4) + ' mrad)'],
      ['Bragg angle', (Math.asin(clamp(lam / (2 * Lam), -1, 1)) / deg).toPrecision(4) + '\u00b0'], ['Shift of the diffracted order', (el.order < 0 ? '\u2212' : '+') + fmtHz(el.rf * 1e6)]], 'Angles are in air, from the element\u2019s normal.'];
  } else if (el.type === 'eom') {
    const sb = eomSidebands(el), tot = sb.reduce((a, [, c]) => a + c[0] * c[0] + c[1] * c[1], 0);
    const rows = sb.filter(([n]) => Math.abs(n) <= 4).map(([n, c]) => [n === 0 ? 'Carrier' : 'Sideband ' + (n > 0 ? '+' : '\u2212') + Math.abs(n) + ' (' + (n > 0 ? '+' : '\u2212') + fmtHz(Math.abs(n) * el.fm * 1e6) + ')', (100 * (c[0] * c[0] + c[1] * c[1])).toPrecision(4) + '% of the power']);
    if (tot < 0.999) rows.push(['Lost', (100 * (1 - tot)).toPrecision(3) + '%']);
    parts = [rows, el.emode === 'amplitude' ? 'Shares of the power that goes in, at the bias set.' : 'Shares of the power that goes in: J\u2099(\u03b2)\u00b2.'];
  } else if (el.type === 'grating') {
    const nm = benchNms()[0], arr = (lastTrace.beams || []).find(b => b.endEl === el.id);
    const f = frame(el), ldy = arr ? toLocalDir(f, arr.dx, arr.dy)[1] : 0;
    const rows = gratingOrders(el, nm, ldy, 1).map(o => ['Order ' + (o.m > 0 ? '+' : '') + o.m,
      (Math.asin(o.ty) / deg).toFixed(2) + '°, ' + (100 * o.eff).toPrecision(3) + '%']);
    const lit = Math.asin(clamp(nm * 1e-6 * el.lpmm / 2, -1, 1)) / deg;
    rows.push(['Littrow angle, order 1', lit.toFixed(2) + '°']);
    parts = [rows, 'At ' + nm + ' nm, for the light ' + (arr ? 'arriving' : 'arriving square on') + '. Angles from the grating’s normal.'];
  } else if (el.type === 'stl') {
    const sz = meshSize(el), M = el.mesh, hit = (lastTrace && lastTrace.blocked && lastTrace.blocked[el.id]) || 0;
    parts = [[['Size (along, across, up)', sz.map(v => fmtLen(v)).join(' \u00d7 ')], ['Triangles', M ? String(M.n) : 'none'], ['From', M && M.file ? M.file : '\u2014'],
      ['Stops light', hit > 0 ? 'yes: the rays and beams that meet it end there' : 'none meets it']], null];
  } else if (el.type === 'crystal') {
    const nm = benchNms()[0], C = CRYSTALS[el.crystal], no = C.o(nm / 1000), ne = C.e(nm / 1000);
    const rows = [['nₒ, nₑ at ' + nm + ' nm', no.toFixed(4) + ', ' + ne.toFixed(4)]];
    if (el.shape === 'displacer') {
      const rho = walkOff(bireMat(el.crystal, 'p', el.axisAngle), nm);
      rows.push(['Walk-off angle', (Math.abs(rho) / deg).toFixed(2) + '°'], ['Beams separated by', fmtLen(el.length * Math.abs(Math.tan(rho)))]);
    }
    if (el.shape === 'wollaston') rows.push(['Divergence, about', (2 * Math.abs(Math.asin((no - ne) * Math.tan(el.wedge * deg))) / deg).toFixed(2) + '°']);
    if (el.shape === 'glan') { const sw = Math.abs(((el.roll || 0) % 180 + 180) % 180 - 90) < 45, sP = (no < ne) !== sw;    // rolled near 90\u00b0: s and p swap
      rows.push(['Passes', (el.roll ? 'nearest ' : '') + (sP ? 's' : 'p') + (no < ne ? ' (ordinary)' : ' (extraordinary)')]); }
    parts = [rows, (el.roll || el.tip ? 'Rays entering the crystal split along its own two polarisations, turned with its ' + (el.roll && el.tip ? 'tip and roll' : el.roll ? 'roll' : 'tip') + ' (rolled 90\u00b0, s and p swap)' : 'Rays entering the crystal split into s and p') + ', each with its own index. Dispersion of ' + C.name + ' from its Sellmeier equations.'];
  } else if (el.type === 'cell') {
    const C = cellInfo(el), rows = [['Atoms in the vapour', (+(C.n * 1e-6).toPrecision(3)) + ' per cm\u00b3'], ['Doppler width (FWHM)', fmtHz(C.doppler) + '; natural ' + fmtHz(C.natural)],
      ['Saturation intensity', (+(C.Isat / 10).toPrecision(3)) + ' mW/cm\u00b2 (cycling transition)']];
    C.beams.slice(0, 4).forEach(b => {
      const nm = getEl(b.src) ? getEl(b.src).name : 'Beam', at = (b.nu - C.nu0 >= 0 ? '+' : '') + fmtHz(b.nu - C.nu0) + ' from centre: ', tail = (+(b.I / 10).toPrecision(3)) + ' mW/cm\u00b2 at its centre, w ' + fmtLen(b.w);
      if (cellPolar(el)) {
        // each hand of circular light on its own
        const [P, M] = [1, -1].map(q => evalPlan(cellPlanFor(el, b.nu, b.dir, b.src, q, b.sec), b.ly, 0));
        rows.push([nm, at + 'on its axis, ' + (100 * P.amp ** 2).toPrecision(3) + '% of \u03c3+ light through and ' + (100 * M.amp ** 2).toPrecision(3) + '% of \u03c3\u2212, the hands ' + (+((P.ph - M.ph) / deg).toPrecision(3)) + '\u00b0 apart in phase (a linear polarisation turned by half that); ' + tail]);
      } else {
        const R = evalPlan(cellPlanFor(el, b.nu, b.dir, b.src, undefined, b.sec), b.ly, 0);
        rows.push([nm, at + (100 * R.amp ** 2).toPrecision(3) + '% through on its axis (OD ' + R.od.toPrecision(3) + '), ' + tail]);
      }
    });
    if (!C.beams.length) rows.push(['', 'No Gaussian beam crosses it: the plot shows a weak beam\u2019s transmission.']);
    parts = [rows, ''];
  } else if (el.type === 'filter' || el.type === 'gain') {
    const rows = benchNms().slice(0, 6).map(nm => [el.mmw ? fmtGHz(C_NM_GHZ / nm) : nm + ' nm', el.type === 'filter' ? (100 * filterT(el, nm)).toPrecision(4) + '% through'
      : '×' + (+gainAt(el, nm).toPrecision(4)) + ' a pass']);
    parts = [rows, el.type === 'filter' ? 'Transmission at each source wavelength.' : 'Power gain at each source wavelength.'];
  } else if (el.type === 'stop') {
    const w = lastTrace.blocked[el.id] || 0;
    const pct = blockedPct(el);
    parts = [[['Power stopped', (+pct.toPrecision(4)) + '% of what its sources emit']],
      'How much of the light from the sources that reach it this aperture removes.'];
  } else if (el.type === 'lens') {
    const wls = [...new Set(project.elements.filter(e => e.type === 'source')
      .flatMap(e => sourceLines(e)).map(v => +v.toFixed(2)))];
    if (!wls.length) wls.push(587.6);
    const rows = [];
    for (const nm of wls.slice(0, 4)) {
      const p = paraxial(el, nm);
      rows.push(['EFL at ' + fmtWl(nm), fmtLen(p.efl)], ['BFL', fmtLen(p.bfl)]);
    }
    const n0 = el.materials.filter(m => m.glass !== 'AIR').map(m => matLabel(m) + ' n = ' + refIndex(m, wls[0]).toFixed(4)).join('; ');
    const approx = el.materials.some(m => !glassKey(m.glass) && !m.table && m.glass !== 'custom' && m.glass !== 'AIR');
    parts = [rows, 'Paraxial values' + (el.cyl === 'out' ? ' in the bench plane, where this cylinder has no power' : el.cyl === 'plane' ? ', in the bench plane; out of it this cylinder has none' : '') + '. ' + n0 + ' at ' + fmtWl(wls[0]) + '.' + (approx ? ' Index approximated from the file\u2019s nd and Vd.' : '') +
      (el.source ? ' Imported from ' + el.source + '.' : '')];
  } else if (el.type === 'chopper') {
    parts = ELEC.chopperReadout(el);                                                           // ELEC hook
  } else return;
  if (el && el.type !== 'elec') parts = ELEC.moreReadout(el, parts);                // ELEC hook
  // and while it plays, a line that comes and goes (a reading only shown past a threshold) keeps
  // its place, blank, so the lines below it do not jump; nor does the box shrink and grow
  if (live && box._rows) {
    const have = new Set(parts[0].map(r => r[0]));
    box._rows.forEach((r, i) => { if (!have.has(r[0])) { parts[0].splice(Math.min(i, parts[0].length), 0, [r[0], '\u2014']); have.add(r[0]); } });
  }
  box._rows = live ? parts[0] : null;
  if (!live) box.style.minHeight = '';
  // and every number in it keeps its width: decimals to four figures, trailing zeros kept, and
  // each line padded (on the left, the font being monospaced) to the widest it has been, so the
  // digits change in place rather than the line growing and shrinking under them
  if (live) {
    const W = box._w || (box._w = new Map());
    parts = [parts[0].map(([a, b]) => {
      if (typeof b !== 'string') return [a, b];
      const v = steadyNums(b), w = Math.max(W.get(a) || 0, v.length);
      W.set(a, w);
      return [a, v.padStart(w, '\u2007')];
    }), parts[1]];
  } else box._w = null;
  const sig = JSON.stringify(parts);
  if (sig === box._sig && box.childNodes.length) return;      // each box its own: no rebuilding every frame
  box._sig = sig;
  if (live) box.style.minHeight = Math.max(box.offsetHeight, parseFloat(box.style.minHeight) || 0) + 'px';
  box.replaceChildren(h('dl', null, ...parts[0].flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)])),
    h('p', { class: 'note' }, parts[1]));
}
