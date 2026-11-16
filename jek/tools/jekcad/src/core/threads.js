/* ==========================================================================
   Screw threads: ISO metric, coarse pitch (ISO 261 and 262) with three fine ones in common use. Each size: its major
   diameter, its pitch, the drill for a tapped hole (major less one pitch, as tap makers give it), and the clearance
   hole for a screw of that size, close and normal fit (ISO 273). Threads in JEKcad are cosmetic, as most CAD's are:
   the hole is drilled at the tap size and the thread is noted on its wall, shown on drawings and in the measure
   readout, and not modelled as a helix.
   ========================================================================== */
export const THREADS = [
  ['M1.6', 1.6, 0.35, 1.25, 1.7, 1.8], ['M2', 2, 0.4, 1.6, 2.2, 2.4], ['M2.5', 2.5, 0.45, 2.05, 2.7, 2.9], ['M3', 3, 0.5, 2.5, 3.2, 3.4],
  ['M4', 4, 0.7, 3.3, 4.3, 4.5], ['M5', 5, 0.8, 4.2, 5.3, 5.5], ['M6', 6, 1, 5, 6.4, 6.6], ['M8', 8, 1.25, 6.8, 8.4, 9],
  ['M8x1', 8, 1, 7, 8.4, 9], ['M10', 10, 1.5, 8.5, 10.5, 11], ['M10x1.25', 10, 1.25, 8.75, 10.5, 11], ['M12', 12, 1.75, 10.2, 13, 13.5],
  ['M12x1.5', 12, 1.5, 10.5, 13, 13.5], ['M14', 14, 2, 12, 15, 15.5], ['M16', 16, 2, 14, 17, 17.5], ['M20', 20, 2.5, 17.5, 21, 22], ['M24', 24, 3, 21, 25, 26],
].map(([size, major, pitch, tap, close, normal]) => ({ size, major, pitch, tap, close, normal }));
export const threadOf = size => THREADS.find(t => t.size === size) || null;
/* how a thread is written on a drawing: M6×1, and its depth when it does not go right through */
export const threadLabel = (t, depth) => (t ? t.size.replace(/x[\d.]+$/, '') + '×' + t.pitch : '') + (depth ? ' ▾' + String(+(+depth).toFixed(2)) : '');
/* the minor diameter of an external thread (ISO 68: major less 1.22687 pitches) */
export const extMinor = t => t.major - 1.22687 * t.pitch;
