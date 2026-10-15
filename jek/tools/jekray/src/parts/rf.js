import { nextName } from '../state/project.js';

/* The RF palette: horns, and the optics of millimetre-wave benches, each an ordinary part marked
   as the palette's, with its sizes and materials */
export const RF = {
  family: 'rf',
  picker: [{ key: 'rf:horn', short: 'Horn', long: 'Feed horn (source)' }, { key: 'rf:rx', short: 'Receiver', long: 'Receiving horn and detector' }, { key: 'rf:lens', short: 'RF lens', long: 'RF lens (HDPE)' }, { key: 'rf:mirror', short: 'Mirror', long: 'Flat metal mirror' }, { key: 'rf:fmirror', short: 'Focusing mirror', long: 'Focusing metal mirror' }, { key: 'rf:grid', short: 'Wire grid', long: 'Wire-grid polariser' }, { key: 'rf:bs', short: 'Beam splitter', long: 'Film beam splitter' }, { key: 'rf:grin', short: 'GRIN lens', long: 'Graded-index lens, printed' }, { key: 'rf:mesh', short: 'Mesh filter', long: 'Metal mesh filter' }, { key: 'rf:load', short: 'Load', long: 'Absorber load' }],
  groups: [['Horns', ['rf:horn', 'rf:rx']],
  ['Lenses and mirrors', ['rf:lens', 'rf:grin', 'rf:mirror', 'rf:fmirror']],
  ['Polarisation, splitting and filtering', ['rf:grid', 'rf:bs', 'rf:mesh']],
  ['Loads', ['rf:load']]],
  make(x, y, kind) {
    const rf = { part: true };
    switch (kind) {
      case 'horn': return ({ type: 'source', name: nextName('Horn'), x, y, angle: 0, rays: 3, mmw: { kind: 'corrugated', ghz: 100, dbm: 0, a: 7.5, L: 60 } });
      case 'rx': return ({ type: 'detector', name: nextName('Receiver'), x, y, angle: 180, material: 'custom', resp: 0.5, gain: 1e4, mmw: { kind: 'corrugated', a: 7.5, L: 60 } });
      case 'lens': return ({ type: 'lens', name: nextName('RF lens'), x, y, diameter: 100, surfaces: [{ R: 78.9 }, { R: null }], gaps: [22], materials: [{ glass: 'HDPE' }], mmw: rf });
      case 'mirror': return ({ type: 'mirror', name: nextName('Flat mirror'), x, y, angle: 135, length: 100, metal: 'Al', mmw: rf });
      case 'fmirror': return ({ type: 'mirror', name: nextName('Focusing mirror'), x, y, angle: 180, length: 100, R: 300, metal: 'Al', mmw: rf });
      case 'grid': return ({ type: 'polariser', name: nextName('Wire grid'), x, y, angle: 135, axis: 0, length: 100, grid: { g: 0.025, a: 0.005 }, mmw: rf });
      case 'bs': return ({ type: 'mirror', name: nextName('Film beam splitter'), x, y, angle: 135, length: 100, reflect: 50, film: { n: 1.73, t: 0.1 }, mmw: rf });
      case 'mesh': return ({ type: 'filter', name: nextName('Mesh filter'), x, y, angle: 0, length: 100, ftype: 'mesh', mesh: 'bandpass', meshG: 0.5, meshA: 0.05, meshF0: 150, meshQ: 5, meshLoss: 0.2, reflect: true, mmw: rf });
      case 'grin': return ({ type: 'mask', name: nextName('GRIN lens'), x, y, angle: 0, length: 120, mmw: rf, grin: { f: 150, ghz: 24, mat: 'PLA', fillMax: 100, fillMin: 15, profile: 'ideal' } });
      case 'load': return ({ type: 'screen', name: nextName('Absorber load'), x, y, angle: 180, length: 50, mmw: rf });
    }
    return null;
  },
};
