import { TEST_MODE } from '../core/constants.js';
import { STL_UNITS } from '../core/stl.js';
import { stepPlan } from '../core/step.js';
import { stepImportBytes } from './step-reader.js';
import { V, extraSel, project, selectOne, uid } from '../state/project.js';
import { canvas, wx, wy } from '../ui/render.js';
import { snapVal } from '../ui/pointer.js';
import { V3D } from '../ui/view3d.js';
import { changed, toast } from '../ui/actions.js';
import { checkpoint } from '../ui/tabs.js';
import { stlElement } from '../ui/experimental.js';

const STEP_AS_KEY = 'jek-raytracer-step-as';

/* ==========================================================================
   STEP import: a .step or .stp file as STL objects (the reader itself: io/step-reader.js)
   ========================================================================== */

/* the STL objects for what was read, onto the bench at (x, y): 'one' object, or 'parts' (one each, grouped) */
export function stepElements(res, fileName, x, y, as) {
  const sc = STL_UNITS[res.units] || 1, plan = stepPlan(res.bodies, fileName, as, res.units, sc), g = plan.length > 1 ? 'g' + uid().slice(1) : null;
  return plan.map(p => {
    const el = stlElement(p.T, p.name, x + p.dx, y + p.dy, res.units, { budget: p.budget, z: p.z, file: fileName, colour: p.colour });
    if (g) el.group = g;
    el.bench = project.tab;
    return el;
  });
}

/* the choice, when a file has several bodies: 'parts', 'one', or null (cancelled); the last kept as the default */
export const stepAsDefault = () => { try { return !TEST_MODE && localStorage.getItem(STEP_AS_KEY) === 'one' ? 'one' : 'parts'; } catch (err) { return 'parts'; } };
let stepAsk = null;
export function stepChoose(n, fileName) {
  const dlg = document.getElementById('stepDialog');
  document.getElementById('stepText').textContent = n + ' parts in ' + fileName;
  const def = stepAsDefault(), bParts = document.getElementById('stepParts'), bOne = document.getElementById('stepOne');
  bParts.classList.toggle('primary', def === 'parts'); bOne.classList.toggle('primary', def === 'one');
  return new Promise(resolve => {
    stepAsk = v => {
      stepAsk = null;
      if (v && !TEST_MODE) try { localStorage.setItem(STEP_AS_KEY, v); } catch (err) { /* not kept: fine */ }
      resolve(v);
    };
    dlg.showModal();
    (def === 'one' ? bOne : bParts).focus();
  });
}
export function wireStep() {
  const dlg = document.getElementById('stepDialog'), pick = v => { if (stepAsk) stepAsk(v); dlg.close(); };
  document.getElementById('stepParts').addEventListener('click', () => pick('parts'));
  document.getElementById('stepOne').addEventListener('click', () => pick('one'));
  document.getElementById('stepCancel').addEventListener('click', () => pick(null));
  dlg.addEventListener('close', () => { if (stepAsk) stepAsk(null); });
}

/* A STEP file from the file picker or dropped on the bench (at: the screen point it was dropped at) */
export async function importStep(file, at) {
  let res;
  try {
    toast('Reading ' + file.name + '…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    res = await stepImportBytes(bytes, file.name, msg => toast(msg));
  } catch (err) { toast(/^(The|OpenCascade|\S+ is not)/.test(err.message) ? err.message : 'Could not read ' + file.name + ': ' + err.message, true); return null; }
  const n = res.bodies.length, as = n > 1 ? await stepChoose(n, file.name) : 'one';
  if (!as) { toast('Nothing brought in.'); return null; }
  let x = V().cx, y = V().cy;
  if (at) { const r = canvas.getBoundingClientRect(), q = V3D.active() ? V3D.tablePoint(at[0], at[1]) : [wx(at[0] - r.left), wy(at[1] - r.top)]; if (q) [x, y] = q; }
  checkpoint();
  const els = stepElements(res, file.name, snapVal(x), snapVal(y), as);
  project.elements.push(...els);
  selectOne(els[0].id); for (const e of els.slice(1)) extraSel.add(e.id);
  const kept = els.reduce((a, e) => a + e.mesh.n, 0), simpl = els.some(e => e.mesh.orig);
  const kb = Math.round(els.reduce((a, e) => a + e.mesh.data.length, 0) / 1024);
  toast('Brought in ' + (els.length > 1 ? els.length + ' parts of ' + file.name + ', grouped' : els[0].name) + ': ' + kept + ' triangles' + (simpl ? ' (simplified from ' + res.tris + ')' : '') +
    ', in ' + ({ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches' }[res.units]) + (res.declared ? ' as the file says' : '') + ', resting on the breadboard' + (kb > 1024 ? ' (' + (kb / 1024).toFixed(1) + ' MB with the bench: a share link to it will be long)' : ''));
  changed(true);
  return els;
}
