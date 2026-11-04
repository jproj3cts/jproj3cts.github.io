/* ==========================================================================
   A CAD body's triangles as a file keeps them: each coordinate a 16-bit step across the body's own box (a tenth
   of a micron on a 6 mm part), base64, about a body's centre. Triangles come in as a Float32Array of 9 numbers
   each (core/step.js); meshPack keeps them, meshUnpack gives them back, centred.
   ========================================================================== */
export function meshPack(T, file) {
  const n = Math.floor(T.length / 9), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 9 * n; i++) { const k = i % 3; if (!isFinite(T[i])) throw new Error('The file has a vertex that is not a number.'); if (T[i] < lo[k]) lo[k] = T[i]; if (T[i] > hi[k]) hi[k] = T[i]; }
  if (!n) return { enc: 'q16', data: '', n: 0, size: [0, 0, 0], centre: [0, 0, 0], file: file || '' };
  const size = hi.map((v, k) => v - lo[k]), S = size.map(v => (v > 0 ? v : 1e-9)), centre = lo.map((v, k) => v + size[k] / 2);
  const Q = new Uint16Array(9 * n);
  for (let i = 0; i < 9 * n; i++) { const k = i % 3; Q[i] = Math.round((T[i] - lo[k]) / S[k] * 65535); }
  return { enc: 'q16', data: b64OfBytes(new Uint8Array(Q.buffer)), n, size: size.map(v => +v.toPrecision(9)), centre: centre.map(v => +v.toPrecision(9)), file: String(file || '').slice(0, 160) };
}
/* the triangles, 9 numbers each, about the body's centre */
export function meshUnpack(M) {
  if (!M || !M.data || !M.n) return new Float32Array(0);
  const u8 = bytesOfB64(M.data), Q = new Uint16Array(u8.buffer, 0, Math.floor(u8.length / 2)), n = Math.min(M.n, Math.floor(Q.length / 9)), S = (M.size || [0, 0, 0]).map(v => (v > 0 ? v : 1e-9)), T = new Float32Array(9 * n);
  for (let i = 0; i < 9 * n; i++) { const k = i % 3; T[i] = Q[i] / 65535 * S[k] - S[k] / 2; }
  return T;
}
export function meshNorm(M) {
  if (!M || typeof M !== 'object' || typeof M.data !== 'string' || !/^[A-Za-z0-9+/=]*$/.test(M.data)) return null;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  return { enc: 'q16', data: M.data, n: Math.max(0, num(M.n, 0) | 0), size: Array.isArray(M.size) && M.size.length === 3 ? M.size.map(v => Math.max(0, num(v, 0))) : [0, 0, 0],
    centre: Array.isArray(M.centre) && M.centre.length === 3 ? M.centre.map(v => num(v, 0)) : [0, 0, 0], file: String(M.file || '').slice(0, 160) };
}
export function b64OfBytes(u8) {
  if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') return Buffer.from(u8).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function bytesOfB64(b64) {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
/* an STL file's triangles, binary or text, 9 numbers each */
export const STL_MAX_TRIS = 400000;
export function parseStl(bytes) {
  const n = bytes.length >= 84 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true) : -1;
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!(n >= 0 && bytes.length === 84 + 50 * n) && /^\s*solid/.test(head) && /facet/.test(new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536))))) {
    const text = new TextDecoder().decode(bytes), out = [], re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
    let m;
    while ((m = re.exec(text))) { out.push(+m[1], +m[2], +m[3]); if (out.length > 9 * STL_MAX_TRIS) throw new Error('The STL file has more than ' + STL_MAX_TRIS + ' triangles. Export it more coarsely.'); }
    if (!out.length || out.length % 9) throw new Error('No triangles found in the STL file.');
    return new Float32Array(out);
  }
  if (!(n > 0 && bytes.length >= 84 + 50 * n)) throw new Error('This is not an STL file: its triangle count does not match its length.');
  if (n > STL_MAX_TRIS) throw new Error('The STL file has ' + n + ' triangles; up to ' + STL_MAX_TRIS + ' can be brought in. Export it more coarsely.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), T = new Float32Array(9 * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) T[9 * i + k] = dv.getFloat32(84 + 50 * i + 12 + 4 * k, true);
  return T;
}
