import { clamp } from '../core/constants.js';
import { num } from '../state/project.js';
import { STL_UNITS, stlMeshNorm } from '../core/stl.js';

/* STL object: An STL object: an opaque shape brought in from a .stl or STEP (.step, .stp) file (a mount, a housing, a baffle), every ray that meets it stopped where it lands, as a beam block. Its triangles ("mesh") are written by JEKray when the person imports the file; you cannot write one, so leave STL objects out of the file and tell the person to bring theirs in with Open ▾ → Import an object (.stl, .step), or drop the file on the bench. */
export const STL = {
  type: 'stl', label: 'STL object',
  norm(e, base) {
    const M = e.mesh && typeof e.mesh === 'object' && typeof e.mesh.data === 'string' && /^[A-Za-z0-9+/=]*$/.test(e.mesh.data) ? e.mesh : null;
    // a part modelled in the 3D view's old Model tools (up to 1.x) kept how it was made ("model") beside its triangles,
    // centred on them as any STL object's, in mm: it comes in as the fixed object its triangles make, where it stood
    const units = e.model ? 'mm' : Object.prototype.hasOwnProperty.call(STL_UNITS, e.units) ? e.units : e.units === 'other' ? 'other' : 'mm';
    const mesh = M ? stlMeshNorm(M) : null;
    if (mesh && e.model && (!mesh.file || mesh.file === 'model')) mesh.file = 'a part modelled in JEKray';
    return Object.assign(base, {
      mesh,
      units, scale: units === 'other' ? clamp(num(e.scale, 1), 1e-6, 1e6) : STL_UNITS[units],
      colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : '#8a8f96',
    });
  },
  guide: {
    what: 'An STL object: an opaque shape brought in from a .stl or STEP (.step, .stp) file (a mount, a housing, a baffle), every ray that meets it stopped where it lands, as a beam block. Its triangles ("mesh") are written by JEKray when the person imports the file (a STEP file\u2019s solids are tessellated by OpenCascade, as one object or one for each part, grouped); you cannot write one, so leave STL objects out of the file and tell the person to bring theirs in with Open \u25be \u2192 Import an object (.stl, .step), or drop the file on the bench.',
    angle: 'the way the object\u2019s own +x (as in its file) points; its tip and roll turn it as any part\u2019s.',
    fields: { mesh: 'its triangles, written by the tool when a .stl file is imported: leave it out.', units: 'the file\u2019s units: "mm", "cm", "m", "in", or "other" with "scale" (a STEP file\u2019s own, as it declares them).', scale: 'mm per unit of the file, with "units": "other".', colour: '"#rrggbb": how it is drawn.' },
  },
};
