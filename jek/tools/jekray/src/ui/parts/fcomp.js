import { clamp } from '../../core/constants.js';
import { fmtLen } from '../../core/format.js';
import { DETECTOR_MATERIALS } from '../../core/rf.js';
import { applyPulse } from '../../core/pulses.js';
import { wavelengthColour } from '../../core/colour.js';
import { V, nextName, project, typeLabel } from '../../state/project.js';
import { normElement } from '../../state/elements.js';
import { benchName } from '../../state/tabs.js';
import { frame } from '../../core/mask.js';
import { FSYM, bodyFill, ctx, drawPorts, getCss, pathLocal, roundRect, selInk, sx, sy } from '../render.js';
import { snapVal } from '../pointer.js';
import { FC, FC_W, fcH, thruPartner } from '../../engines/fibre.js';
import { osaSection, signalSection } from '../instruments.js';
import { helpLine, bindSync, coherenceFields, coherenceNote, h, panel, param, renderPanel, selectField, textField } from '../panel.js';
import { pulseLine, pulseToggle, readoutBox } from '../panels.js';
import { changed } from '../actions.js';
import { addBench, checkpoint, selectEl } from '../tabs.js';

/* Fibre component on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/fcomp.js */

function drawFcomp(el, sel) {
  if (FSYM.draw(el, sel)) { drawPorts(el); return; }
  const f = frame(el), K = FC[el.kind], w = FC_W / 2, hh = fcH(el) / 2, s = V().scale;
  const laser = el.kind === 'laser';
  pathLocal(f, roundRect(w, hh, 1.6), true);
  ctx.fillStyle = bodyFill(laser ? 'rgba(0,0,0,0.35)' : '#2b373d'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : laser ? wavelengthColour(el.wavelength) : '#9fb1b8'; ctx.lineWidth = sel ? 2.4 : 1.4; ctx.stroke();
  const tag = typeof K.tag === 'function' ? K.tag(el) : K.tag, fs = clamp(2.6 * s, 7, 14);
  if (fs * tag.length * 0.62 < FC_W * s) {
    ctx.save(); ctx.fillStyle = laser ? wavelengthColour(el.wavelength) : 'rgba(255,255,255,0.8)'; ctx.font = '600 ' + fs + 'px ' + getCss('--jek-mono');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tag, sx(el.x), sy(el.y)); ctx.restore();
  }
  drawPorts(el);
}

function fcompPanel(el) {
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
    if (el.balanced) panel.append(helpLine('What is common to both cancels; what differs doubles.', ['Two photodiodes, the second\u2019s current taken from the first\u2019s: what is the same on both (the light\u2019s intensity noise, an amplifier\u2019s ASE beating with itself) cancels to the common-mode rejection, what differs (the interference between them, opposite in the two outputs of a coupler) doubles. Shot noise from both adds.'], 'note', 'margin-top:0.5rem'));
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

const hitFcomp = (el, lx, ly, tol) => Math.abs(lx) <= FC_W / 2 + tol && Math.abs(ly) <= fcH(el) / 2 + tol;

export const FCOMP_UI = {
  draw: drawFcomp, hit: hitFcomp, panel: fcompPanel, rank: 1, noModPanel: true,
};
