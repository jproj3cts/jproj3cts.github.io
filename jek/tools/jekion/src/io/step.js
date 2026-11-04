import { stepImportBytes } from '../../../jekray/src/io/step-reader.js';
import { nf } from '../core/units.js';
import { meshPack, meshUnpack, parseStl } from '../core/mesh.js';
import { project } from '../state/project.js';
import { checkpoint } from '../state/elements.js';
import { normElectrode } from '../parts/electrodes.js';
import { changed, selectOne, toast } from '../ui/actions.js';
import { fitArray } from '../ui/panels.js';

/* ==========================================================================
   CAD into electrodes: each body of a STEP file (read by OpenCascade in JEKray's shared reader, tessellated) becomes
   an electrode of its own, named from the file's parts, at 0 V, placed as in the file; an STL file becomes one
   electrode. Their triangles are kept with the bench (core/mesh.js) and painted into the array by their voxels.
   A trap designed in CAD comes in whole: set each electrode's voltage and fly.
   ========================================================================== */
const UNIT_MM = { mm: 1, cm: 10, m: 1000, in: 25.4 };
/* bodies (each { name, T (triangles, file units), colour }) onto the bench as electrodes, in millimetres */
export function bodiesToElectrodes(bodies, fileName, scale, at) {
  const els = [], names = project.electrodes.map(e => e.name);
  // the whole's centre, to put it where asked (or where it is in the file)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) for (let i = 0; i < b.T.length; i++) { const k = i % 3, v = b.T[i] * scale; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  const shift = at ? [at[0] - (lo[0] + hi[0]) / 2, at[1] - (lo[1] + hi[1]) / 2, project.grid.sym === '3d' ? at[2] - (lo[2] + hi[2]) / 2 : -(lo[2] + hi[2]) / 2] : [0, 0, 0];
  bodies.forEach((b, i) => {
    const T = new Float32Array(b.T.length);
    for (let q = 0; q < T.length; q++) T[q] = b.T[q] * scale + shift[q % 3];
    const M = meshPack(T, fileName), el = normElectrode({ shape: 'mesh', name: b.name, x: M.centre[0], y: M.centre[1], z: M.centre[2], V: 0, colour: b.colour || undefined, mesh: M }, project.electrodes.length + i);
    el.name = uniqueName(el.name, names); names.push(el.name);
    el.meshT = meshUnpack(M);
    els.push(el);
  });
  return els;
}
const uniqueName = (name, names) => { if (!names.includes(name)) return name; let i = 2; while (names.includes(name + ' (' + i + ')')) i++; return name + ' (' + i + ')'; };
export async function importCad(file, at) {
  const n = file.name.toLowerCase();
  try {
    toast('Reading ' + file.name + '…');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bodies, units = 'mm', declared = false;
    if (/\.stl$/.test(n)) bodies = [{ name: file.name.replace(/\.stl$/i, '').slice(0, 60), T: parseStl(bytes), colour: null }];
    else { const res = await stepImportBytes(bytes, file.name, msg => toast(msg)); bodies = res.bodies; units = res.units; declared = res.declared; }
    checkpoint();
    const els = bodiesToElectrodes(bodies, file.name, UNIT_MM[units] || 1, at);
    const G = project.grid;
    if (G.sym !== '3d' && els.length) { G.sym = '3d'; toast('The array is now three-dimensional, for the CAD bodies'); }
    project.electrodes.push(...els);
    if (!at || els.length > 1) fitArray();
    selectOne(els[0].id);
    changed(true);
    const tris = els.reduce((a, e) => a + e.mesh.n, 0);
    toast('Brought in ' + (els.length > 1 ? els.length + ' electrodes from ' + file.name : els[0].name) + ': ' + tris + ' triangles, in ' + ({ mm: 'millimetres', cm: 'centimetres', m: 'metres', in: 'inches' }[units] || units) + (declared ? ' as the file says' : '') + '. Set each one’s voltage; the array spacing is ' + nf(G.h) + ' mm.');
    return els;
  } catch (err) { toast(/^(The|OpenCascade|\S+ is not|No triangles|This is not)/.test(err.message) ? err.message : 'Could not read ' + file.name + ': ' + err.message, true); return null; }
}
