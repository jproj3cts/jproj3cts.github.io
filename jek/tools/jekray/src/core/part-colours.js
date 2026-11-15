/* ==========================================================================
   A part's own colours on the bench
   Any part may carry "lineColour" and "fillColour" ("#rrggbb"); one left out is drawn as the tool draws it.
   The renderer (ui/render.js, tinted) draws such a part with every stroke in its line colour and every fill
   in its fill colour, each keeping the opacity of the colour it stands in for: see-through glass stays
   see-through, and what was drawn with nothing stays nothing.
   ========================================================================== */

/* a colour as a part keeps it: "#rrggbb" in lower case ("#rgb" written out), or '' for none */
export function partHex(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return '';
}
/* how opaque a CSS colour is, 0 to 1, read from its text: hex with or without alpha, rgb()/rgba()/hsl()/hsla()
   with commas or spaces and a slash, "transparent"; a named colour, or anything that is not text (a gradient,
   a pattern), is opaque */
export function colourAlpha(c) {
  if (typeof c !== 'string') return 1;
  const s = c.trim().toLowerCase();
  if (s === 'transparent') return 0;
  if (s[0] === '#') {
    const a = s.length === 5 ? parseInt(s[4], 16) / 15 : s.length === 9 ? parseInt(s.slice(7), 16) / 255 : 1;
    return isFinite(a) ? a : 1;
  }
  const m = /^(?:rgb|hsl)a?\(([^)]*)\)$/.exec(s);
  if (!m) return 1;
  const p = m[1].split(/[\s,/]+/).filter(Boolean);
  if (p.length < 4) return 1;
  const a = p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
  return isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
}
/* the colour hex ("#rrggbb") standing in for c, as opaque as c was; c itself where it was nothing at all */
const tintMemoPart = new Map();
export function partTint(c, hex) {
  const key = typeof c === 'string' ? c + '|' + hex : null;
  if (key && tintMemoPart.has(key)) return tintMemoPart.get(key);
  const a = colourAlpha(c);
  const out = a <= 0 ? c : a >= 1 ? hex : 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + (+a.toFixed(4)) + ')';
  if (key) { if (tintMemoPart.size > 4000) tintMemoPart.clear(); tintMemoPart.set(key, out); }
  return out;
}
