/* ==========================================================================
   What a lens or window is made to, beyond its prescription: the part's make settings (element field `make`), kept with
   the part on the bench and written on its drawing and specification (ui/lens-drawing.js, ui/lens-make.js).
     the part:  qty, the quantity ordered; diaTol, its diameter's tolerance (+0 / −diaTol mm, so it fits its mount);
                ctTol, ± mm on each centre thickness; cent, centring (4/) in arcminutes, each surface's tilt to the axis
     each face: finish, 'polished' or 'ground' (fine ground: no form or surface quality asked of it);
                form and irr, surface form 3/A(B), fringes of power and of irregularity at 632.8 nm over the clear
                aperture; sd, surface quality as scratch-dig to MIL-PRF-13830B ('60-40'); chamfer, the widest
                protective chamfer at its edge, mm at 45°
   A value not set follows the design's tolerance settings where they give one (asm.design.tol), else the commercial
   grade below; only what was set is kept, so a part saved before this had no `make` and loads as it was.
   ========================================================================== */
export const PART_FINISHES = { polished: 'Polished', ground: 'Fine ground' };
export const PART_MAKE_DEFAULT = { qty: 10, diaTol: 0.1, ctTol: 0.1, cent: 3, finish: 'polished', form: 5, irr: 1, sd: '60-40', chamfer: 0.2 };
const PM_LIMITS = { qty: [1, 1e6], diaTol: [0, 10], ctTol: [0, 10], cent: [0, 600], form: [0, 100], irr: [0, 100], chamfer: [0, 10] };
const pmNum = (v, k) => (v === null || v === undefined || v === '' || !isFinite(+v) ? undefined : Math.min(PM_LIMITS[k][1], Math.max(PM_LIMITS[k][0], k === 'qty' ? Math.round(+v) : +v)));
/* scratch-dig as MIL-PRF-13830B writes it: the scratch number, a dash, the dig number (60-40, 20-10, 10-5) */
export const sdValid = v => typeof v === 'string' && /^\d{1,3}-\d{1,3}$/.test(v.trim());
function normFaceMake(f) {
  f = f && typeof f === 'object' ? f : {};
  const out = {};
  if (PART_FINISHES[f.finish]) out.finish = f.finish;
  for (const k of ['form', 'irr', 'chamfer']) { const v = pmNum(f[k], k); if (v !== undefined) out[k] = v; }
  if (sdValid(f.sd)) out.sd = f.sd.trim();
  return out;
}
/* a part's make settings as kept: only what was set; faces one per surface (n of them); undefined when nothing is */
export function normPartMake(m, n) {
  if (!m || typeof m !== 'object') return undefined;
  const out = {};
  for (const k of ['qty', 'diaTol', 'ctTol', 'cent']) { const v = pmNum(m[k], k); if (v !== undefined) out[k] = v; }
  const faces = Array.from({ length: n }, (_, j) => normFaceMake(Array.isArray(m.faces) ? m.faces[j] : null));
  if (faces.some(f => Object.keys(f).length)) out.faces = faces;
  return Object.keys(out).length ? out : undefined;
}
/* the settings in force for a part of n surfaces: each value its own, else the tolerance settings' (T), else the
   default; with where each came from ('set', 'tol', 'default') for the panel */
export function partMakeOf(make, n, T) {
  const tolV = k => (T && T[k] && T[k].on && T[k].v > 0 ? T[k].v : undefined);
  const m = make || {}, from = {}, pick = (key, own, tol) => { if (own !== undefined) { from[key] = 'set'; return own; } if (tol !== undefined) { from[key] = 'tol'; return tol; } from[key] = 'default'; return PART_MAKE_DEFAULT[key]; };
  const tilt = tolV('tilt');
  const out = { qty: pick('qty', m.qty), diaTol: pick('diaTol', m.diaTol), ctTol: pick('ctTol', m.ctTol, tolV('thk')), cent: pick('cent', m.cent, tilt), from };
  out.faces = Array.from({ length: n }, (_, j) => {
    const f = (m.faces && m.faces[j]) || {}, fr = {};
    const fp = (key, own, tol) => { if (own !== undefined) { fr[key] = 'set'; return own; } if (tol !== undefined) { fr[key] = 'tol'; return tol; } fr[key] = 'default'; return PART_MAKE_DEFAULT[key]; };
    const face = { finish: fp('finish', f.finish), form: fp('form', f.form, tolV('rad')), irr: fp('irr', f.irr, tolV('irr')), sd: fp('sd', f.sd), chamfer: fp('chamfer', f.chamfer), from: fr };
    return face;
  });
  return out;
}
/* surface form as ISO 10110 writes it: 3/A(B) */
export const formText = f => '3/' + (+f.form.toFixed(2)) + '(' + (+f.irr.toFixed(2)) + ')';
