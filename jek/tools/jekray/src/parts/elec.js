import { ELEC } from '../engines/elec.js';

/* Electronics (ELEC, engines/elec.js, has the parts) */
export const ELEC_PART = {
  type: 'elec',
  // the Circuits palette: its rows and its groups
  picker: [{ key: 'elec:node', short: 'Node', long: 'Node: a wire junction, to route and fan out wires' },
    { key: 'elec:dc', short: 'DC source' },
    { key: 'elec:sig', short: 'Signal generator' },
    { key: 'elec:noise', short: 'Noise source' },
    { key: 'elec:amp', short: 'Amplifier' },
    { key: 'elec:tia', short: 'TIA', long: 'Transimpedance amplifier' },
    { key: 'elec:lpf', short: 'Low-pass', long: 'Low-pass filter' },
    { key: 'elec:hpf', short: 'High-pass', long: 'High-pass filter' },
    { key: 'elec:bpf', short: 'Band-pass', long: 'Band-pass filter' },
    { key: 'elec:att', short: 'Attenuator' },
    { key: 'elec:mixer', short: 'Mixer' },
    { key: 'elec:sum', short: 'Summing junction' },
    { key: 'elec:biastee', short: 'Bias tee' },
    { key: 'elec:comp', short: 'Comparator' },
    { key: 'elec:scope', short: 'Oscilloscope' },
    { key: 'elec:spec', short: 'Spectrum analyser' },
    { key: 'elec:lockin', short: 'Lock-in', long: 'Lock-in amplifier' },
    { key: 'elec:daq', short: 'DAQ', long: 'DAQ (analogue-to-digital converter)' },
    { key: 'elec:thru', short: 'Feedthrough', long: 'Electrical feedthrough (to another tab)' }],
  groups: [['Sources', ['elec:dc', 'elec:sig', 'elec:noise']], ['Amplifiers', ['elec:amp', 'elec:tia', 'elec:att']], ['Filters', ['elec:lpf', 'elec:hpf', 'elec:bpf']],
    ['Signal handling', ['elec:mixer', 'elec:sum', 'elec:biastee', 'elec:comp', 'elec:node', 'elec:thru']], ['Instruments', ['elec:scope', 'elec:spec', 'elec:lockin', 'elec:daq']]],
  norm(e, base) {
    return ELEC.norm(e, base);
  },
};
