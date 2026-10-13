import { clamp } from '../core/constants.js';
import { num } from '../state/project.js';
import { STL_UNITS, stlMeshNorm } from '../core/stl.js';

/* STL object: An STL object: an opaque shape brought in from a .stl file (a mount, a housing, a baffle), every ray that meets it stopped where it lands, as a beam block. Its triangles ("mesh") are written by JEKray2D when the person imports the file; you cannot write one, so leave STL objects out of the file and tell the person to bring theirs in with Open ▾ → Import an object (.stl), or drop the file on the bench. */
export const STL = {
  type: 'stl', label: 'STL object',
  norm(e, base) {
    const M = e.mesh && typeof e.mesh === 'object' && typeof e.mesh.data === 'string' && /^[A-Za-z0-9+/=]*$/.test(e.mesh.data) ? e.mesh : null;
    const units = Object.prototype.hasOwnProperty.call(STL_UNITS, e.units) ? e.units : e.units === 'other' ? 'other' : 'mm';
    return Object.assign(base, {
      mesh: M ? stlMeshNorm(M) : null,
      units, scale: units === 'other' ? clamp(num(e.scale, 1), 1e-6, 1e6) : STL_UNITS[units],
      colour: /^#[0-9a-fA-F]{6}$/.test(e.colour) ? e.colour : '#8a8f96',
    });
  },
  guide: {
    what: 'An STL object: an opaque shape brought in from a .stl file (a mount, a housing, a baffle), every ray that meets it stopped where it lands, as a beam block. Its triangles ("mesh") are written by JEKray2D when the person imports the file; you cannot write one, so leave STL objects out of the file and tell the person to bring theirs in with Open \u25be \u2192 Import an object (.stl), or drop the file on the bench.',
    angle: 'the way the object\u2019s own +x (as in its file) points; its tip and roll turn it as any part\u2019s.',
    fields: { mesh: 'its triangles, written by the tool when a .stl file is imported: leave it out.', units: 'the file\u2019s units: "mm", "cm", "m", "in", or "other" with "scale".', scale: 'mm per unit of the file, with "units": "other".', colour: '"#rrggbb": how it is drawn.' },
  },
};
