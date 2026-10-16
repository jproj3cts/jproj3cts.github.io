import { glassKey } from '../core/glass.js';
import { V, bandCoat, coatingFromPart, normCoat } from '../state/project.js';
import { snapVal } from '../ui/pointer.js';

/* ==========================================================================
   .zmx lens file import
   ========================================================================== */

/* ---------- .zar archives ----------
   A Zemax archive holds the .zmx with the files it needs (a glass catalogue, coatings), each
   LZW-compressed: a header (version 1002: 32 bytes, 1004: 48), the file's name (300 bytes of
   ASCII, or 600 of UTF-16), then the compressed bytes. The LZW is the plain variable-width
   kind, codes from 9 bits growing to 14, high bit first, no clear code. */
const isZar = b => b.length > 48 && (b[0] === 0xEA || b[0] === 0xEC) && b[1] === 0x03 && b[2] === 0 && b[3] === 0;
function lzwDecode(data, want) {
  const out = new Uint8Array(want > 0 ? want : data.length * 4);
  let n = 0;
  const dict = [];                                          // each code: [prefix code, last byte, length]
  for (let i = 0; i < 256; i++) dict.push([-1, i, 1]);
  let next = 256, bits = 9, prev = -1, buf = 0, nb = 0, pos = 0;
  const put = code => {                                     // the string of a code, written backwards into place
    const L = dict[code][2];
    if (n + L > out.length) return false;
    let c = code; for (let k = L - 1; k >= 0; k--) { out[n + k] = dict[c][1]; c = dict[c][0]; }
    n += L; return true;
  };
  const firstOf = code => { let c = code; while (dict[c][0] >= 0) c = dict[c][0]; return dict[c][1]; };
  for (;;) {
    while (nb < bits && pos < data.length) { buf = ((buf << 8) | data[pos++]) >>> 0; nb += 8; }
    if (nb < bits) break;
    const code = (buf >>> (nb - bits)) & ((1 << bits) - 1); nb -= bits; buf &= (1 << nb) - 1;
    if (code < next) { if (!put(code)) break; }
    else if (code === next && prev >= 0) { dict.push([prev, firstOf(prev), dict[prev][2] + 1]); if (!put(code)) break; prev = code; next++; if (next >= (1 << bits) && bits < 16) bits++; continue; }
    else break;
    if (prev >= 0 && next < (1 << 16)) { dict.push([prev, firstOf(code), dict[prev][2] + 1]); next++; }
    if (next >= (1 << bits) && bits < 16) bits++;
    prev = code;
  }
  return out.subarray(0, n);
}
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
export function unzar(buf) {
  const b = new Uint8Array(buf), out = [];
  let pos = 0;
  while (pos + 32 <= b.length) {
    const ver = u32(b, pos);
    if (ver !== 1002 && ver !== 1003 && ver !== 1004) break;
    const old = ver === 1002, hdr = old ? 32 : 48, nameLen = old ? 300 : 600;
    const comp = u32(b, pos + (old ? 12 : 16)), raw = old ? 0 : u32(b, pos + 24);
    const nb = b.subarray(pos + hdr, pos + hdr + nameLen);
    const name = (old ? new TextDecoder('windows-1252').decode(nb) : new TextDecoder('utf-16le').decode(nb)).split('\0')[0];
    const data = b.subarray(pos + hdr + nameLen, pos + hdr + nameLen + comp);
    out.push({ name, raw, bytes: /\.LZW$/i.test(name) ? lzwDecode(data, raw) : data });
    pos += hdr + nameLen + comp;
  }
  return out;
}
/* ---------- .agf glass catalogues ----------
   The catalogue an archive carries: each glass NM name formula ... nd Vd, then CD its
   coefficients, in the lens-design program's numbering of the dispersion formulas */
export function parseAgf(text) {
  const out = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim(), tok = t.split(/\s+/);
    if (tok[0] === 'NM' && tok[1]) { cur = { name: tok[1], f: parseInt(tok[2], 10) || 2, nd: parseFloat(tok[4]), vd: parseFloat(tok[5]), c: [] }; out.set(tok[1].toUpperCase(), cur); }
    else if (tok[0] === 'CD' && cur) cur.c = tok.slice(1).map(Number).map(v => isFinite(v) ? v : 0);
  }
  return out;
}
/* a lens file, or the .zmx inside an archive: its text, the name it carries, and the glasses its
   catalogue holds */
export function readZmxFile(buf, fileName) {
  const b = new Uint8Array(buf);
  if (!isZar(b)) return { text: decodeZmx(buf), fileName, agf: null };
  const entries = unzar(b), lens = entries.find(e => /\.zmx(\.lzw)?$/i.test(e.name));
  if (!lens) throw new Error('No .zmx file was found inside ' + fileName + '.');
  let agf = null;
  for (const e of entries) if (/\.agf(\.lzw)?$/i.test(e.name)) { const g = parseAgf(decodeZmx(e.bytes)); agf = agf ? new Map([...agf, ...g]) : g; }
  return { text: decodeZmx(lens.bytes), fileName, inner: lens.name.replace(/\.lzw$/i, ''), agf };
}
export function decodeZmx(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x50 && b[1] === 0x4B) throw new Error('That looks like a zip file. Extract it and choose the .zmx or .zar file inside.');
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  // UTF-16 without BOM: every other byte zero
  if (b.length > 8 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b);
  // most files are plain ASCII; some makers' carry a Windows code page (an O-slash in a name)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1252').decode(b); }
}

export function parseZmx(text, fileName, agf) {
  const lines = text.split(/\r?\n/);
  let unit = 1, title = null, pwav = 1, enpd = null, fnum = null, ftyp = 0;
  const surfs = [], wavm = {}, wwgt = {}, sys = { yfln: [], fwgn: [] };
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
    } else if (key === 'WAVM' && !cur) {
      wavm[parseInt(tok[1], 10)] = parseFloat(tok[2]);       // the design wavelengths, um
      if (isFinite(parseFloat(tok[3]))) wwgt[parseInt(tok[1], 10)] = parseFloat(tok[3]);
    } else if (key === 'ENPD' && !cur) {
      enpd = parseFloat(tok[1]);                              // the entrance pupil's diameter
    } else if (key === 'FNUM' && !cur) {
      fnum = parseFloat(tok[1]);                              // or the image space F-number
    } else if (key === 'FTYP' && !cur) {
      ftyp = parseInt(tok[1], 10) || 0;                       // 0: the fields are angles
    } else if (key === 'YFLN' && !cur) {
      sys.yfln = tok.slice(1).map(Number).filter(isFinite);
    } else if (key === 'FWGN' && !cur) {
      sys.fwgn = tok.slice(1).map(Number).filter(isFinite);
    } else if (key === 'PWAV' && !cur) {
      pwav = parseInt(tok[1], 10) || 1;                       // which of them is the primary
    } else if (key === 'SURF') {
      cur = { type: 'STANDARD', curv: 0, conic: 0, parm: {}, disz: 0, glass: null, diam: 0 };
      surfs.push(cur);
    } else if (!cur) {
      continue;
    } else if (key === 'STOP') cur.stop = true;
    else if (key === 'TYPE') cur.type = (tok[1] || 'STANDARD').toUpperCase();
    else if (key === 'CURV') cur.curv = parseFloat(tok[1]) || 0;
    else if (key === 'CONI') cur.conic = parseFloat(tok[1]) || 0;
    else if (key === 'PARM') cur.parm[parseInt(tok[1], 10)] = parseFloat(tok[2]) || 0;
    else if (key === 'DISZ') cur.disz = /INF/i.test(tok[1]) ? Infinity : (parseFloat(tok[1]) || 0);
    else if (key === 'DIAM') cur.diam = parseFloat(tok[1]) || 0;
    else if (key === 'COAT') cur.coat = (tok[1] || '').replace(/^"|"$/g, '');
    else if (key === 'CLAP') cur.clap = parseFloat(tok[2]) || parseFloat(tok[1]) || 0;
    else if (key === 'FLAP') { /* a floating aperture: the surface's own diameter, as read */ }
    else if (key === 'SQAP' || key === 'OBSC' || key === 'RAAP' || key === 'ELAP') warnings.add('a non-circular or obscuring aperture was ignored');
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
  const design = wavm[pwav] > 0 ? Math.round(wavm[pwav] * 1e6) / 1000 : null;   // nm
  // the conditions it was designed for, for an assembly made from it: aperture, fields (angles only), wavelengths
  const ks = Object.keys(wavm).map(Number).filter(k => wavm[k] > 0).sort((a, b) => a - b);
  // the object: at infinity, or (the object surface's thickness finite) at that distance, its fields then heights
  const od = surfs[0] && isFinite(surfs[0].disz) && surfs[0].disz > 0 && surfs[0].disz * unit < 1e6 ? surfs[0].disz * unit : 0;   // (a kilometre or more is infinity)
  const cond = {
    ...(od ? { object: { kind: 'finite', d: od } } : {}),
    aperture: enpd > 0 ? { kind: 'epd', v: enpd * unit } : fnum > 0 ? { kind: 'fno', v: fnum } : null,
    fields: (ftyp === 0 && !od) || (ftyp === 1 && od) ? (sys.yfln.length ? sys.yfln.map((d, i) => ({ deg: ftyp === 1 ? d * unit : d, w: sys.fwgn[i] !== undefined ? sys.fwgn[i] : 1 })).filter((f, i, all) => all.findIndex(g => g.deg === f.deg) === i) : null) : null,
    waves: ks.length ? ks.map(k => ({ nm: Math.round(wavm[k] * 1e6) / 1000, w: wwgt[k] !== undefined ? wwgt[k] : 1 })) : null,
    primary: Math.max(0, ks.indexOf(pwav)),
  };
  return { title, unit, surfs, warnings, design, cond, agf: agf || null };
}

export const IMPORT_AS = { auto: 'Work it out from the file', lens: 'Lens', mirror: 'Mirror', cube: 'Beam splitter cube', prism: 'Right-angle prism', window: 'Window' };

/* a moulded glass's name: the maker's glass with _MOLD after it, or a CDGM D- glass with an M
   (Thorlabs' and LightPath's aspheres); the moulded index is a little below the glass's, which the
   catalogue carries for D-ZK3M and the file may carry as nd and Vd */
function zmxMaterial(g, warnings, agf) {
  let key = glassKey(g.name);
  if (!key && /_MOLD$/i.test(g.name)) { key = glassKey(g.name.replace(/_MOLD$/i, '')); if (key) warnings.add(g.name + ' was read as ' + key + ', the glass it is moulded from (a moulded glass\u2019s index runs a few parts in a thousand lower)'); }
  if (!key && /^D-.*[A-Z]M$/i.test(g.name) && !isFinite(g.nd)) { key = glassKey(g.name.replace(/M$/i, '')); if (key) warnings.add(g.name + ' was read as ' + key + ', the glass it is moulded from (a moulded glass\u2019s index runs a few parts in a thousand lower)'); }
  if (key) return { glass: key };
  const m = { glass: g.name };
  // a glass the tool does not know, but the archive's catalogue does: its dispersion formula comes along
  const A = agf && agf.get(String(g.name).toUpperCase());
  if (A && A.c.length) { m.agf = { f: A.f, c: A.c }; if (isFinite(A.nd)) m.nd = A.nd; if (isFinite(A.vd)) m.vd = A.vd; warnings.add('glass ' + g.name + ' is not in the glass catalogue: its dispersion was taken from the catalogue in the archive'); return m; }
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
  // a maker's coating by the name its file gives it: Edmund's EO_ codes carry the band
  const EO = [[/^EO_VIS0/i, 0.4, 425, 675, 'VIS 0\u00b0'], [/^EO_VIS_?NIR/i, 0.5, 400, 1000, 'VIS-NIR'], [/^EO_VIS_?EXT/i, 0.5, 350, 700, 'VIS-EXT'], [/^EO_NIR_?I\b|^EO_NIR1/i, 0.5, 600, 1050, 'NIR I'],
    [/^EO_NIR_?II|^EO_NIR2/i, 0.5, 750, 1550, 'NIR II'], [/^EO_SWIR/i, 0.5, 900, 1700, 'SWIR'], [/^EO_UV_?AR|^EO_UVAR/i, 0.5, 250, 425, 'UV-AR'], [/^EO_MGF2/i, 1.75, 400, 700, 'MgF\u2082']];
  const namedCoat = () => {
    for (const t of surfs) { const c = t.coat && EO.find(e => e[0].test(t.coat)); if (c) return c; }
    return null;
  };
  const arCoat = () => {
    if (partCoat && partCoat.kind === 'ar') {
      warnings.add('the part number ends in -' + partCoat.tag + ', so its surfaces were given a nominal ' +
        partCoat.spec.R + '% AR coating over ' + partCoat.spec.lo + '\u2013' + partCoat.spec.hi +
        ' nm; outside that band they trace as bare glass');
      return bandCoat(partCoat.spec, partCoat.tag);
    }
    const nc = namedCoat();
    if (nc) {
      warnings.add('the file names an Edmund ' + nc[4] + ' coating, so its surfaces were given a nominal ' + nc[1] + '% AR over ' + nc[2] + '\u2013' + nc[3] + ' nm; outside that band they trace as bare glass');
      return normCoat({ mode: 'band', R: nc[1], lo: nc[2], hi: nc[3], label: 'AR, ' + nc[4] });
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
    const material = zmxMaterial(block.glass, warnings, Z.agf);
    const coat = arCoat();
    if (mode === 'cube') return Object.assign(pos, { type: 'cube', angle: 0, size: block.t > 0 ? block.t : block.width, reflect: 50, material, coat });
    if (mode === 'prism') return Object.assign(pos, { type: 'prism', shape: 'right', angle: 0, size: block.t > 0 ? block.t : block.width, material, coat });
    return Object.assign(pos, { type: 'prism', shape: 'window', angle: 0, size: block.width, thickness: block.t > 0 ? block.t : 1, material, coat });
  }

  // lens
  if (first < 0) throw new Error(fileName + ' has no glass surfaces to build a lens from.');
  if (tilted) warnings.add('tilted surfaces (coordinate breaks) were ignored');
  // a moulded asphere's file often ends with the laser diode's cover glass, a thin flat window an
  // air gap behind the lens: the part is the lens, so the window goes
  if (range.length >= 4) {
    const n = range.length, w = range[n - 2], gapS = range[n - 3];
    if (isGlass(w) && !isGlass(gapS) && !w.curv && !range[n - 1].curv && isFinite(w.disz) && w.disz * unit <= 1.5 && isFinite(gapS.disz) && gapS.disz > 0 && range.slice(0, n - 3).some(isGlass)) {
      warnings.add('a ' + (+(w.disz * unit).toPrecision(3)) + ' mm ' + (w.glass ? w.glass.name : '') + ' window ' + (+(gapS.disz * unit).toPrecision(3)) + ' mm behind the lens (the laser diode\u2019s cover glass in the design) was left out');
      range.splice(n - 3, 3, range[n - 3]);
      range[range.length - 1] = Object.assign({}, range[range.length - 1], { glass: null });
    }
  }
  // where the file's stop is against the lens: on one of its surfaces, or in front of it or behind
  {
    const si = surfs.findIndex(t => t.stop), dz = (i0, i1) => { let z = 0; for (let i = i0; i < i1; i++) z += isFinite(surfs[i].disz) ? Math.abs(surfs[i].disz) * unit : 0; return z; };
    const ri = si > 0 ? range.indexOf(surfs[si]) : -1, f0 = surfs.indexOf(range[0]), l0 = surfs.indexOf(range[range.length - 1]);
    Z.stopAt = si <= 0 ? null : ri >= 0 ? { at: ri, semi: semiOf(surfs[si]) }
      : si < f0 ? { before: dz(si, f0), semi: semiOf(surfs[si]) } : si > l0 && si < surfs.length - 1 ? { after: dz(l0, si), semi: semiOf(surfs[si]) } : null;
  }
  let cylinder = false;
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
    } else if (s.type === 'TOROIDAL') {
      // CURV is the curvature in the YZ plane, PARM 1 the radius of rotation in XZ: 0 is a cylinder
      if (!(s.parm[1] || 0)) cylinder = true;
      else warnings.add('a toroidal surface was traced with its in-plane curvature only');
    } else if (s.type.startsWith('BICONIC')) {
      warnings.add('biconic surfaces were traced with their in-plane curvature only');
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
  const materials = range.slice(0, -1).map(s => isGlass(s) ? zmxMaterial(s.glass, warnings, Z.agf) : { glass: 'AIR' });
  const semis = surfaces.map(s => s.semi).filter(Boolean);
  const diameter = semis.length ? 2 * Math.max(...semis) : 25.4;
  // keep per-surface apertures only where they differ from the lens diameter
  surfaces.forEach(s => { if (s.semi && Math.abs(s.semi * 2 - diameter) < 1e-6) s.semi = null; });
  return Object.assign(pos, { type: 'lens', angle: 0, diameter, surfaces, gaps, materials, ...(cylinder ? { cyl: 'plane' } : {}), ...(Z.design ? { design: Z.design } : {}) });
}

