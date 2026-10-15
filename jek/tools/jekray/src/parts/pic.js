import { PIC } from '../engines/pic.js';

/* Photonic circuits (PIC, engines/pic.js, has the parts) */
export const PIC_PART = {
  type: 'pic',
  norm(e, base) {
    return PIC.norm(e, base);
  },
};
