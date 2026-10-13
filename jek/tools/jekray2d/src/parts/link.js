import { nextName, num, project } from '../state/project.js';

/* Link plane: One of a pair of link planes joining two tabs: the pair is one plane seen from two benches. */
export const LINK = {
  type: 'link', label: 'Link plane',
  picker: [{ key: 'link', short: 'Link plane', long: 'Link plane (to another tab)' }],
  keys: ['link'],
  make(x, y) {
    const used = new Set(project.elements.filter(e => e.type === 'link').map(e => e.pair));
    let n = 1; while (used.has('Link ' + n)) n++;
    return { type: 'link', name: nextName('Link plane'), x, y, angle: 0, length: 25, pair: 'Link ' + n };
  },
  norm(e, base) {
    return Object.assign(base, { length: Math.max(0.1, num(e.length, 25)), pair: String(e.pair || 'Link 1').slice(0, 60) });
  },
  zSquare: true,
  guide: {
    what: 'One of a pair of link planes joining two tabs: the pair is one plane seen from two benches.',
    angle: 'its normal. Light crossing one plane of a pair leaves its partner (on another tab) the same way relative to that plane.',
    fields: { length: 'mm width.', pair: 'the pair’s name: exactly two link planes share it, one on each tab.' },
  },
};
