import { ELEC } from '../engines/elec.js';
import { lastTraceMs, traceScene } from '../engines/trace.js';
import { project } from '../state/project.js';
import { requestRender } from './render.js';

/* Steering mirrors on the page: a mirror whose drive has a slow tone (up to STEER_SLOW_HZ) is shown moving. The bench
   is traced again at the page's clock while one plays, as often as its trace allows (never more than a third of the
   time), and left at the drives' mean when none does. A quicker drive is not drawn: the mirror stands at its mean and
   the photodiodes follow it (engines/elec.js). */
let steerPlaying = false, steerNext = 0;
function steerTick() {
  if (typeof document !== 'undefined' && document.hidden) return;
  const moving = project && project.elements.some(e => e.type === 'mirror' && e.steer) && ELEC.steerMoving();
  if (!moving) {
    if (steerPlaying) { steerPlaying = false; ELEC.setSteerTime(null); traceScene(); requestRender(); }
    return;
  }
  const now = performance.now();
  if (now < steerNext) return;
  steerPlaying = true;
  ELEC.setSteerTime(now / 1000);
  traceScene(); requestRender();
  steerNext = now + Math.max(40, 3 * (lastTraceMs || 0));
}
export const steerIsPlaying = () => steerPlaying;
export function wireSteer() { setInterval(steerTick, 40); }
