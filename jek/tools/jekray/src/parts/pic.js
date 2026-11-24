import { PIC } from '../engines/pic.js';

/* Photonic circuits (PIC, engines/pic.js, has the parts) */
export const PIC_PART = {
  type: 'pic',
  // the Photonic palette (an experimental feature: exp), its rows and its groups
  picker: [{ key: 'pic:gc', short: 'Grating coupler', exp: 'pic' },
    { key: 'pic:dc', short: 'Directional coupler', exp: 'pic' },
    { key: 'pic:mmi12', short: 'MMI 1×2', exp: 'pic' },
    { key: 'pic:mmi22', short: 'MMI 2×2', exp: 'pic' },
    { key: 'pic:ring', short: 'Ring', long: 'Ring resonator, all-pass', exp: 'pic' },
    { key: 'pic:ringad', short: 'Add-drop ring', long: 'Ring resonator, add-drop', exp: 'pic' },
    { key: 'pic:ps', short: 'Phase shifter', exp: 'pic' },
    { key: 'pic:pd', short: 'Photodiode', long: 'On-chip photodiode', exp: 'pic' }],
  groups: [['Couplers', ['pic:gc', 'pic:dc', 'pic:mmi12', 'pic:mmi22']], ['Rings', ['pic:ring', 'pic:ringad']], ['Control and detection', ['pic:ps', 'pic:pd']]],
  norm(e, base) {
    return PIC.norm(e, base);
  },
};
