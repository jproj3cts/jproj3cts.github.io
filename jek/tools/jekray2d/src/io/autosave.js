import { EMBED, STORE_KEY, TEST_MODE, cloud } from '../core/constants.js';
import { project } from '../state/project.js';
import { serialize } from '../state/elements.js';
import { setStatus } from '../ui/actions.js';
import { cloudChanged, cloudNote, cloudOn } from './cloud.js';

/* ==========================================================================
   Autosave in this browser, and the earlier versions kept alongside it.
   ========================================================================== */
/* Earlier versions: a copy of the project every few minutes while it changes, and one just
   before something replaces it, the newest first, kept in this browser */
const SNAP_KEY = 'jek-raytracer-snapshots', SNAP_MAX = 12, SNAP_EVERY = 5 * 60e3;
export function readSnaps() {
  try { const v = JSON.parse(localStorage.getItem(SNAP_KEY)); return Array.isArray(v) ? v : []; } catch (err) { return []; }
}
export function keepSnapshot(why, now) {
  if (TEST_MODE || EMBED || !project || !project.elements.length) return;
  const list = readSnaps(), json = JSON.stringify(serialize());
  if (list.length && list[0].json === json) return;
  if (!now && list.length && Date.now() - list[0].t < SNAP_EVERY) return;
  list.unshift({ t: Date.now(), why, name: project.name, n: project.elements.length, json });
  list.length = Math.min(list.length, SNAP_MAX);
  // a full store: give up the oldest until it fits
  for (;;) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return; } catch (err) { if (list.length <= 1) return; list.pop(); } }
}

/* Autosave in this browser */
export let saveTimer = null;
export function scheduleSave() {
  if (TEST_MODE || EMBED) return;
  if (cloud) cloudChanged();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(serialize()));
      setStatus(cloud ? (cloud.dirty && cloudOn() ? 'Saving to the cloud shortly' : cloudNote || 'Linked to the cloud') : 'Autosaved in this browser');
      keepSnapshot('Autosave');
    } catch (err) {
      setStatus('This browser is blocking autosave. Use Save .jekray to keep your work.');
    }
  }, 350);
}

