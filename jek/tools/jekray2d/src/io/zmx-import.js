import { glassKey } from '../core/glass.js';
import { V, bandCoat, coatingFromPart, normCoat } from '../state/project.js';
import { snapVal } from '../ui/pointer.js';

/* ==========================================================================
   .zmx lens file import
   ========================================================================== */

export function decodeZmx(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x50 && b[1] === 0x4B) throw new Error('That looks like a zip or .zar archive. Extract it and choose the .zmx file inside.');
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  // UTF-16 without BOM: every other byte zero
  if (b.length > 8 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b);
  return new TextDecoder('utf-8').decode(b);
}

export function parseZmx(text, fileName) {
  const lines = text.split(/\r?\n/);
  let unit = 1, title = null;
  const surfs = [];
  let cur = null;
  const warnings = new Set();
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    const tok = t.split(/\s+/);
    const key = tok[0];
    if (key === 'UNIT') {
      const u = (tok[1] || 'MM').toUpperCase();
      unit = { MM: 1, CM: 10, IN: 25.4, METER: 1000, M: 1000 }[u] || 1;
    } else if (key === 'MODE') {
      if (!/SEQ/i.test(tok[1] || '')) throw new Error('This is a non-sequential (' + tok[1] + ') file, which the importer can\u2019t read. Use the sequential .zmx for the part if there is one.');
    } else if (key === 'MNUM' && parseInt(tok[1], 10) > 1) {
      warnings.add('the file holds ' + tok[1] + ' configurations; the first was used');
    } else if (key === 'NAME' && !cur) {
      title = t.slice(5).trim().replace(/^"|"$/g, '') || title;
    } else if (key === 'SURF') {
      cur = { type: 'STANDARD', curv: 0, conic: 0, parm: {}, disz: 0, glass: null, diam: 0 };
      surfs.push(cur);
    } else if (!cur) {
      continue;
    } else if (key === 'TYPE') cur.type = (tok[1] || 'STANDARD').toUpperCase();
    else if (key === 'CURV') cur.curv = parseFloat(tok[1]) || 0;
    else if (key === 'CONI') cur.conic = parseFloat(tok[1]) || 0;
    else if (key === 'PARM') cur.parm[parseInt(tok[1], 10)] = parseFloat(tok[2]) || 0;
    else if (key === 'DISZ') cur.disz = /INF/i.test(tok[1]) ? Infinity : (parseFloat(tok[1]) || 0);
    else if (key === 'DIAM') cur.diam = parseFloat(tok[1]) || 0;
    else if (key === 'COAT') cur.coat = (tok[1] || '').replace(/^"|"$/g, '');
    else if (key === 'CLAP') cur.clap = parseFloat(tok[2]) || parseFloat(tok[1]) || 0;
    else if (key === 'SQAP' || key === 'OBSC' || key === 'FLAP') warnings.add('a non-circular or obscuring aperture was ignored');
    else if (key === 'GLAS') {
      const name = tok[1];
      const nums = tok.slice(2).map(Number);
      let nd = NaN, vd = NaN;
      const i = nums.findIndex(v => v > 1.2 && v < 2.8);
      if (i >= 0) { nd = nums[i]; vd = nums[i + 1]; }
      cur.glass = { name, nd, vd };
    }
  }
  if (surfs.length < 2) throw new Error('No surfaces were found in ' + fileName + '.');
  return { title, unit, surfs, warnings };
}

export const IMPORT_AS = { auto: 'Work it out from the file', lens: 'Lens', mirror: 'Mirror', cube: 'Beam splitter cube', prism: 'Right-angle prism', window: 'Window' };

function zmxMaterial(g, warnings) {
  const key = glassKey(g.name);
  if (key) return { glass: key };
  const m = { glass: g.name };
  if (isFinite(g.nd)) m.nd = g.nd;
  if (isFinite(g.vd) && g.vd > 0) m.vd = g.vd;
  if (!isFinite(m.nd)) warnings.add('glass ' + g.name + ' has no index in the file, so n = 1.5 was used');
  return m;
}

/* Turn a parsed prescription into an element, as `mode` asks or by inspection */
export function zmxToElement(Z, fileName, mode) {
  const { unit, surfs, warnings } = Z;
  const name = (Z.title && Z.title.length < 60 ? Z.title : null) || fileName.replace(/\.zmx$/i, '');
  // Thorlabs put the coating band in the part number; the file itself only names a coating
  const partCoat = coatingFromPart(fileName.replace(/\.zmx$/i, '')) || coatingFromPart(name);
  const anyCoatLine = surfs.some(t => t.coat);
  const arCoat = () => {
    if (partCoat && partCoat.kind === 'ar') {
      warnings.add('the part number ends in -' + partCoat.tag + ', so its surfaces were given a nominal ' +
        partCoat.spec.R + '% AR coating over ' + partCoat.spec.lo + '\u2013' + partCoat.spec.hi +
        ' nm; outside that band they trace as bare glass');
      return bandCoat(partCoat.spec, partCoat.tag);
    }
    if (anyCoatLine) {
      warnings.add('the file names a coating but not its design, so a nominal 0.5% AR was assumed across the visible and near infrared');
      return normCoat({ mode: 'band', R: 0.5, lo: 350, hi: 1700, label: 'AR, assumed' });
    }
    return normCoat({ mode: 'bare' });
  };
  const inner = surfs.slice(1, -1).length ? surfs.slice(1, -1) : surfs;
  const isMirror = s => s.glass && /^MIRR/i.test(s.glass.name);
  const isGlass = s => s.glass && !isMirror(s);
  const tilted = surfs.some(s => s.type === 'COORDBRK');
  const semiOf = s => (s.clap > 0 ? s.clap : s.diam) > 0 ? (s.clap > 0 ? s.clap : s.diam) * unit : null;
  const cbAngle = s => s.type === 'COORDBRK' ? (s.parm[3] || 0) : 0;      // tilt about x, in our plane
  const cbShift = s => s.type === 'COORDBRK' ? (s.parm[2] || 0) * unit : 0;

  // glass run: first glass surface through the one after the last glass surface
  let first = -1, last = -1;
  for (let i = 1; i < surfs.length - 1; i++) if (isGlass(surfs[i])) { if (first < 0) first = i; last = i; }
  const range = first >= 0 ? surfs.slice(first, last + 2).filter(s => s.type !== 'COORDBRK') : [];
  const mirrorSurf = inner.find(isMirror);

  // a flat-faced block of one glass: a cube, window or prism candidate
  let block = null;
  if (range.length === 2 && range.every(s => s.curv === 0)) {
    const t = isFinite(range[0].disz) ? range[0].disz * unit : 0;
    const semis = range.map(semiOf).filter(Boolean);
    block = { t, width: semis.length ? 2 * Math.max(...semis) : t, glass: range[0].glass };
  } else if (tilted && first >= 0) {
    // prisms and cubes are usually folded with coordinate breaks; use the first glass and its aperture
    const g = surfs[first];
    const t = surfs.slice(first).find(s => isFinite(s.disz) && s.disz > 0);
    const w = semiOf(g) ? 2 * semiOf(g) : (t ? t.disz * unit : 10);
    block = { t: t ? t.disz * unit : w, width: w, glass: g.glass, folded: true };
  }

  if (mode === 'auto') {
    if (mirrorSurf && first < 0) mode = 'mirror';
    else if (block && block.folded) {
      mode = 'cube';
      warnings.add('the file folds the beam with tilted surfaces, which the importer can\u2019t follow, so it was treated as a beam splitter cube. Choose another type under Import as if that\u2019s wrong');
    }
    else if (block && block.t > 0 && block.t / block.width > 0.75 && block.t / block.width < 1.33) {
      mode = 'cube';
      warnings.add('a glass block as deep as it is wide was treated as a 50:50 beam splitter cube');
    }
    else if (block) mode = 'window';
    else if (first >= 0) mode = 'lens';
    else throw new Error(fileName + ' has no glass or mirror surfaces to import.');
  }
  const pos = { x: snapVal(V().cx), y: snapVal(V().cy), source: fileName, name };

  if (mode === 'mirror') {
    const m = mirrorSurf || inner.find(s => s.curv !== 0) || inner[0];
    if (!mirrorSurf) warnings.add('no mirror surface was found, so the first curved surface was used');
    const c = m.curv / unit;
    // tilts and decentres ahead of the mirror describe an off-axis segment
    let tilt = 0, shift = 0;
    for (const t of surfs) { if (t === m) break; tilt += cbAngle(t); shift += cbShift(t); }
    if (tilt || shift) warnings.add('a tilt of ' + (+tilt.toPrecision(4)) + '\u00b0 and an offset of ' + (+shift.toPrecision(4)) +
      ' mm were read from the coordinate breaks; check the orientation and the sign of the offset');
    let reflect = 100;
    if (partCoat && partCoat.kind === 'mirror') {
      reflect = partCoat.spec.R;
      warnings.add('the part number ends in -' + partCoat.tag + ', a ' + partCoat.spec.label +
        ' coating, so the mirror was set to a nominal ' + reflect + '% over ' + partCoat.spec.lo + '\u2013' + partCoat.spec.hi + ' nm');
    }
    return Object.assign(pos, { type: 'mirror', angle: 180 - tilt, R: c === 0 ? null : -1 / c,
      k: m.conic, offset: shift,
      length: semiOf(m) ? 2 * semiOf(m) : 25.4, reflect });
  }
  if (mode === 'cube' || mode === 'prism' || mode === 'window') {
    if (!block) {
      if (first < 0) throw new Error(fileName + ' has no glass to build a ' + IMPORT_AS[mode].toLowerCase() + ' from.');
      const g = surfs[first];
      const w = semiOf(g) ? 2 * semiOf(g) : 12.7;
      block = { t: isFinite(g.disz) ? g.disz * unit : w, width: w, glass: g.glass };
      warnings.add('the surfaces are curved, so only the glass and size were used');
    }
    const material = zmxMaterial(block.glass, warnings);
    const coat = arCoat();
    if (mode === 'cube') return Object.assign(pos, { type: 'cube', angle: 0, size: block.t > 0 ? block.t : block.width, reflect: 50, material, coat });
    if (mode === 'prism') return Object.assign(pos, { type: 'prism', shape: 'right', angle: 0, size: block.t > 0 ? block.t : block.width, material, coat });
    return Object.assign(pos, { type: 'prism', shape: 'window', angle: 0, size: block.width, thickness: block.t > 0 ? block.t : 1, material, coat });
  }

  // lens
  if (first < 0) throw new Error(fileName + ' has no glass surfaces to build a lens from.');
  if (tilted) warnings.add('tilted surfaces (coordinate breaks) were ignored');
  const lensCoat = arCoat();
  const surfaces = range.map((s, si) => {
    const c = s.curv / unit;
    // only the outer faces meet air, so only they carry the coating
    const outer = si === 0 || si === range.length - 1;
    const out = { R: c === 0 ? null : 1 / c, k: s.conic, a2: 0, A: [], semi: semiOf(s),
      coat: outer ? lensCoat : normCoat({ mode: 'bare' }) };
    if (s.type === 'ODDASPH' || s.type === 'ODDASPHE') {
      const odd = [];
      for (let q = 1; q <= 8; q++) odd.push((s.parm[q] || 0) * Math.pow(unit, 1 - q));
      while (odd.length && odd[odd.length - 1] === 0) odd.pop();
      out.odd = odd.length ? odd : undefined;
    } else if (s.type === 'EVENASPH') {
      out.a2 = (s.parm[1] || 0) * Math.pow(unit, -1);
      const A = [];
      for (let q = 2; q <= 8; q++) A.push((s.parm[q] || 0) * Math.pow(unit, 1 - 2 * q));
      while (A.length && A[A.length - 1] === 0) A.pop();
      out.A = A;
    } else if (s.type === 'TOROIDAL' || s.type.startsWith('BICONIC')) {
      warnings.add('toroidal or biconic surfaces were traced with their in-plane curvature only');
    } else if (s.type === 'PARAXIAL') {
      warnings.add('a paraxial (ideal lens) surface was skipped; it has no real shape to trace');
    } else if (s.type !== 'STANDARD') {
      warnings.add(s.type + ' surfaces were traced as standard surfaces, so any extra terms were dropped');
    }
    return out;
  });
  const gaps = range.slice(0, -1).map(s => {
    if (!isFinite(s.disz)) { warnings.add('an infinite spacing inside the group was read as zero'); return 0; }
    if (s.disz < 0) { warnings.add('a negative spacing (a fold in the prescription) was read as its magnitude'); return -s.disz * unit; }
    return s.disz * unit;
  });
  const materials = range.slice(0, -1).map(s => isGlass(s) ? zmxMaterial(s.glass, warnings) : { glass: 'AIR' });
  const semis = surfaces.map(s => s.semi).filter(Boolean);
  const diameter = semis.length ? 2 * Math.max(...semis) : 25.4;
  // keep per-surface apertures only where they differ from the lens diameter
  surfaces.forEach(s => { if (s.semi && Math.abs(s.semi * 2 - diameter) < 1e-6) s.semi = null; });
  return Object.assign(pos, { type: 'lens', angle: 0, diameter, surfaces, gaps, materials });
}

