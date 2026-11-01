import { PRISM_SHAPES, nextName, normCoat, normMat, num } from '../state/project.js';

/* Prism: A glass prism or window. */
export const PRISM = {
  type: 'prism', label: 'Prism',
  picker: [{ key: 'prism', short: 'Prism' }],
  keys: ['prism'],
  make: (x, y) => ({ type: 'prism', name: nextName('Prism'), x, y, shape: 'right', size: 20, material: { glass: 'N-BK7' } }),
  norm(e, base) {
    // a polygon's corners kept: 3 to 16 finite x, y pairs, else a small triangle
    const polyCorners = v => {
      const P = Array.isArray(v) ? v.filter(p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])).slice(0, 16).map(p => [+p[0], +p[1]]) : [];
      return P.length >= 3 ? P : [[-10, -10], [10, -10], [0, 10]];
    };
    return Object.assign(base, {
      shape: PRISM_SHAPES[e.shape] ? e.shape : 'right',
      // a polygon's corners (mm, about its middle; 3 to 16), and the faces silvered (their indices from the first corner)
      ...(e.shape === 'polygon' ? { verts: polyCorners(e.verts) } : {}),
      ...(Array.isArray(e.mirrored) ? { mirrored: [...new Set(e.mirrored.map(Math.round).filter(i => i >= 0 && i < 16))].sort((a, b) => a - b) } : {}),
      size: Math.max(0.1, num(e.size, 20)),
      thickness: Math.max(0.1, num(e.thickness, 5)),
      material: normMat(e.material),
      coat: normCoat(e.coat),
      source: typeof e.source === 'string' ? e.source : undefined,
    });
  },
  zHalf: el => el.size / 2,
  zSquare: true,
  guide: {
    what: 'A glass prism or window.',
    angle: 'rotates the prism about its centre; check the result on the bench.',
    fields: { shape: 'one of the prism shapes below. The equilateral prism\'s apex points along +x at angle 0, so a beam along +x meets the apex; a pentaprism or Pellin–Broca prism takes light in along +x through its first face.', size: 'mm (a pentaprism\'s or Pellin–Broca\'s first face; ignored for a polygon).', thickness: 'mm (for a window).',
      verts: 'a polygon\'s corners, [[x, y], ...] in mm, 3 to 16, in order round it.', mirrored: 'the faces silvered, by index from the first corner\'s face (a pentaprism\'s two are by default).',
      material: 'e.g. {"glass": "N-BK7"}.', coat: 'coating on its faces.' },
  },
};
