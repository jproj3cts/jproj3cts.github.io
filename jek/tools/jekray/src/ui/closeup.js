import { mkCanvas } from '../core/constants.js';
import { fmtLen } from '../core/format.js';
import { V, project } from '../state/project.js';
import { fieldDec, lightOf } from '../state/elements.js';
import { lastTrace } from '../engines/trace.js';
import { H, W, ctx, getCss, glowOp, lightLayer, requestRender } from './render.js';
import { benchFrame, fieldFrames } from './sweeps.js';
import { popKeyOf, popSources, popState } from '../engines/beam-tree.js';
import { CLOSEUP_MM, CLOSEUP_STEP, closeupImage } from '../engines/closeup.js';
import { schedulePop } from './heavy.js';
import { fieldWorker, fwMismatch, fwRequest } from '../page/workers.js';

/* ==========================================================================
   The close-up on the page: drawn over the bench when the view is close enough, worked out in
   the field worker when there is one. The pixels themselves: engines/closeup.js.
   ========================================================================== */

const closeState = { key: '', img: null, info: null, step: 2, timer: null };

/* Draws the close-up; returns true when it has taken over from the ordinary overlay. A new
   view is drawn coarse first, then refined once it has been still for a moment. */
export function drawCloseup() {
  const s = V().scale, wmm = W / s;
  if (wmm >= CLOSEUP_MM) return false;
  const srcs = popSources();
  if (!srcs.length) return false;
  const key = popKeyOf(lastTrace.beams, srcs);
  if (key !== popState.key && fieldFrames.bench.has(key)) { popState.key = key; popState.result = benchFrame(key); popState.job = null; }
  if (key !== popState.key || !popState.result) { schedulePop(); return false; }
  const vkey = closeupKey(key);
  // a sweep rendered ahead has this frame's close-up already
  const pre = closeState.key !== vkey && fieldFrames.closeup.get(vkey);
  if (pre) { Object.assign(closeState, pre, { key: vkey, asked: vkey }); clearTimeout(closeState.timer); }
  if (closeState.key !== vkey && closeState.asked !== vkey) {
    closeState.asked = vkey;
    closeupCompute(vkey, srcs, 2 * CLOSEUP_STEP);
    clearTimeout(closeState.timer);
    closeState.timer = setTimeout(() => {
      if (closeState.asked === vkey && !(closeState.key === vkey && closeState.step <= CLOSEUP_STEP)) { closeupCompute(vkey, srcs, CLOSEUP_STEP); requestRender(); }
    }, 180);
  }
  // until the new one is ready (from the field worker), the last image, put where its view was
  if (!closeState.img) return false;
  const v0 = closeState.view, k = s / v0.s;
  ctx.save();
  ctx.globalCompositeOperation = glowOp();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(closeState.img, W / 2 + (v0.cx - V().cx) * s - v0.W / 2 * k, H / 2 - (v0.cy - V().cy) * s - v0.H / 2 * k,
    closeState.img.width * closeState.step * k, closeState.img.height * closeState.step * k);
  ctx.restore();
  const inf = closeState.info;
  ctx.fillStyle = lightLayer ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)';
  ctx.font = '11px ' + getCss('--jek-mono');
  ctx.textAlign = 'left';
  ctx.fillText('Close-up: the field on each pixel' + (inf.beams ? ', ' + inf.beams + ' beam' + (inf.beams === 1 ? '' : 's') : ', no beam here') +
    (inf.contrast !== null && inf.beams > 1 ? ' \u00b7 fringe contrast ' + inf.contrast.toFixed(3) : '') +
    (inf.lamN ? ' \u00b7 \u03bb/2n = ' + fmtLen(inf.lamN / 2) : ''), 14, closeupCaptionY());
  return true;
}

export const closeupKey = key => key.length + '|' + key.slice(0, 64) + '|' + [project.tab, V().cx, V().cy, V().scale, W, H].join(',');

export const closeupOnShow = () => W / V().scale < CLOSEUP_MM && popSources().length > 0;

/* a close-up for the sweep's frames: the current view, its field, stored as drawCloseup keeps it */
export function closeupFrame(r, step) {
  const cv = mkCanvas(r.img.width, r.img.height);
  cv.getContext('2d').putImageData(r.img, 0, 0);
  return { img: cv, step, info: r.info, view: { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab } };
}

/* the close-up's caption: just below the bench tabs, which sit over the top left corner */
const closeupCaptionY = () => { const tb = document.getElementById('benchTabs'); return (tb && tb.offsetHeight ? tb.offsetHeight : 0) + 18; };

function closeupCompute(vkey, srcs, step) {
  const view = { cx: V().cx, cy: V().cy, s: V().scale, W, H, tab: project.tab }, log = fieldDec(lightOf().scale);
  const done = r => {
    const cv = mkCanvas(r.img.width, r.img.height);
    cv.getContext('2d').putImageData(r.img, 0, 0);
    Object.assign(closeState, { key: vkey, img: cv, step, info: r.info, view });
  };
  if (fieldWorker()) {
    fwRequest('closeup', 'closeup' + step, { key: popState.key, view, step, log }).then(r => {
      // a coarse answer never replaces a fine one of the same view
      if (!r || r.mismatch) {                       // dropped: ask again
        if (r) fwMismatch(false);
        if (closeState.asked === vkey && closeState.key !== vkey) { closeState.asked = null; requestRender(); }
        return;
      }
      fwMismatch(true);
      if (closeState.asked !== vkey || (closeState.key === vkey && closeState.step <= step)) return;
      done(r); requestRender();
    }).catch(() => { closeState.asked = null; requestRender(); });
    return;
  }
  done(closeupImage(popState.result.segs, view, step, log));
}
