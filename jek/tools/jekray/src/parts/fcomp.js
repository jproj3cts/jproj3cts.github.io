import { clamp } from '../core/constants.js';
import { DETECTOR_MATERIALS } from '../core/rf.js';
import { CMODES } from '../core/pulses.js';
import { nextName, num, project } from '../state/project.js';
import { FC, FIBRE_POLS } from '../engines/fibre.js';

/* Fibre components (engines/fibre.js has each kind, FC) */
export const FCOMP = {
  type: 'fcomp',
  keys: ['splitter', 'combiner', 'led', 'bpd', 'soa', 'pbs', 'fmir', 'switch', 'delay', 'stretch', 'tbf', 'osa', 'depol', 'star', 'fcomp', 'laser', 'coupler', 'wdm', 'circ', 'iso', 'voa', 'pc', 'pol', 'fm', 'fbg', 'term', 'pd', 'thru', 'amp', 'faom', 'feom'],
  make(x, y, kind) {
    switch (kind) {
      case 'splitter': case 'combiner':
        return { type: 'fcomp', kind: 'split', combine: kind === 'combiner', name: nextName(kind === 'combiner' ? 'Combiner' : 'Splitter'), x, y, angle: 0, ways: 4 };
      case 'led':
        return { type: 'fcomp', kind: 'laser', led: true, name: nextName('LED'), x, y, angle: 0, wavelength: 1550, bw: 40, power: 0.1, pol: 'unpolarised' };
      case 'bpd':
        return { type: 'fcomp', kind: 'pd', balanced: true, material: 'ingaas', name: nextName('Balanced detector'), x, y, angle: 0 };
      case 'soa':
        return { type: 'fcomp', kind: 'amp', soa: true, name: nextName('SOA'), x, y, angle: 0, g0: 25, psat: 10, nf: 8, centre: 1550, bw: 60, iso: 0, pdg: 0.5 };
      case 'pbs': case 'fmir': case 'switch': case 'delay': case 'stretch': case 'tbf': case 'osa': case 'depol': case 'star': case 'fcomp': case 'laser': case 'coupler': case 'wdm': case 'circ': case 'iso': case 'voa': case 'pc': case 'pol': case 'fm': case 'fbg': case 'term': case 'pd': case 'thru': case 'amp': case 'faom': case 'feom':
        if (kind === 'faom') kind = 'aom'; else if (kind === 'feom') kind = 'eom';
        const k = FC[kind] ? kind : 'coupler', used = new Set(project.elements.filter(e => e.kind === 'thru').map(e => e.pair));
        let n = 1; while (used.has('Feedthrough ' + n)) n++;
        return Object.assign({ type: 'fcomp', kind: k, name: nextName(FC[k].label), x, y, angle: 0, pair: 'Feedthrough ' + n }, k === 'pd' ? { material: 'ingaas' } : {});
    }
  },
  norm(e, base) {
    const K = FC[e.kind];
    if (!K) return null;
    Object.assign(base, { kind: e.kind });
    for (const [k, , d] of K.params) base[k] = num(e[k], d);
    if (e.kind === 'laser') { base.pshape = e.pshape === 'gauss' ? 'gauss' : 'sech2'; base.tau = Math.max(0, base.tau); base.rep = Math.max(0.001, base.rep); base.lineshape = e.lineshape === 'gauss' ? 'gauss' : 'lorentz'; base.wavelength = clamp(base.wavelength, 100, 20000); base.power = Math.max(0, base.power); base.coh = Math.max(0, base.coh);
      // its polarisation: s, p, linear at polAngle from s, or circular; a file from before
      // there was a choice gave only the angle, which is s or p when it is one of them
      const a = ((base.polAngle % 360) + 360) % 360;
      base.pol = FIBRE_POLS.includes(e.pol) ? e.pol : e.led ? 'unpolarised' : a % 180 === 0 ? 's' : a % 180 === 90 ? 'p' : 'linear';
      // a fibre-coupled LED: a laser's ports and drives, broadband light, unpolarised to start with, never pulsed
      base.led = !!e.led;
      base.cmode = base.led ? 'broad' : CMODES.includes(e.cmode) ? e.cmode : base.coh > 0 ? 'line' : 'single';
      base.bw = Math.max(0.001, num(e.bw, 40));
      if (base.led) base.tau = 0; }
    if (e.kind === 'thru') base.pair = String(e.pair || 'Feedthrough 1').slice(0, 60);
    if (e.kind === 'pd') { base.balanced = !!e.balanced; base.cmrr = Math.max(0, num(e.cmrr, 30)); }
    if (e.kind === 'switch') base.cross = base.cross >= 0.5 ? 1 : 0;
    if (e.kind === 'amp') { base.soa = !!e.soa; base.pdg = Math.max(0, num(e.pdg, 0.5)); }
    if (e.kind === 'star') { base.ins = Math.round(clamp(base.ins, 1, 32)); base.outs = Math.round(clamp(base.outs, 1, 32)); }
    if (e.kind === 'depol') base.dgd = Math.max(0, base.dgd);
    if (e.kind === 'split') { base.ways = Math.round(clamp(base.ways, 2, 64)); base.loss = Math.max(0, base.loss); base.combine = !!e.combine; }
    if (e.kind === 'eom') base.emode = e.emode === 'amplitude' ? 'amplitude' : 'phase';
    // a fibre photodetector's material, as a free-space one's; a file from before there was one keeps its fixed responsivity
    if (e.kind === 'pd') base.material = DETECTOR_MATERIALS[e.material] ? e.material : 'custom';
    return base;
  },
};
