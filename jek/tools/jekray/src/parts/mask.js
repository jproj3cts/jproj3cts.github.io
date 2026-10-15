import { nextName, num } from '../state/project.js';
import { applyGrin } from '../core/grin.js';

/* Mask: A thin mask with an amplitude and a delay (in waves) written as formulas: also the way to model an ideal lens or objective. */
export const MASK = {
  type: 'mask', label: 'Mask',
  picker: [{ key: 'mask', short: 'Mask' }],
  keys: ['mask'],
  make: (x, y) => ({ type: 'mask', name: nextName('Mask'), x, y, angle: 0, amp: '1', delay: '0', preset: 'clear' }),
  norm(e, base) {
    const o = Object.assign(base, {
      length: Math.max(0.1, num(e.length, 25.4)),
      amp: typeof e.amp === 'string' && e.amp.trim() ? e.amp : '1',
      delay: typeof e.delay === 'string' && e.delay.trim() ? e.delay : '0',
      preset: typeof e.preset === 'string' ? e.preset : 'custom',
    });
    // a graded-index RF lens: its delay and amplitude follow from its design (core/grin.js)
    if (e.grin && typeof e.grin === 'object') { o.grin = e.grin; applyGrin(o); }
    return o;
  },
  guide: {
    what: 'A thin mask with an amplitude and a delay (in waves) written as formulas: also the way to model an ideal lens or objective.',
    angle: 'its normal: 0 for a beam travelling ±x.',
    fields: { length: 'mm aperture.', amp: 'amplitude transmission as a formula in x (mm along the mask), y (mm out of the plane), r, theta, lambda (mm) and pi; e.g. "1" or "circ(r/2)".',
    delay: 'delay in waves as a formula in the same variables. An ideal lens of focal length f mm: "-(sqrt(r^2+f^2)-f)/lambda" (write f as a number).',
    preset: 'leave "custom".' },
  },
};
