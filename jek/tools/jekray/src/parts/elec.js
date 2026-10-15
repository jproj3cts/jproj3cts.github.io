import { ELEC } from '../engines/elec.js';

/* Electronics (ELEC, engines/elec.js, has the parts) */
export const ELEC_PART = {
  type: 'elec',
  norm(e, base) {
    return ELEC.norm(e, base);
  },
};
