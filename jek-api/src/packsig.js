// Part pack signatures: what is signed and how, with nothing of the routes in
// it. The app has its own copy of canon() and the message (jek/tools/jekray
// src/core/packsig.js); a Node test there checks the two agree.
//
// A pack's hash is the SHA-256 of its canonical JSON (keys sorted, no
// whitespace) without its `sig`. The signature is Ed25519 over the canonical
// JSON of { v, id, hash, by, at }, so it says who signed which pack and when.

export const SIG_V = 1;

// JSON with every object's keys sorted and no whitespace. Written out as text,
// never rebuilt as objects, so a key such as "__proto__" stays a plain key.
export function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : canon(x))).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

export const unsigned = (pack) => {
  const o = {};
  for (const k of Object.keys(pack)) if (k !== 'sig') Object.defineProperty(o, k, { value: pack[k], enumerable: true });
  return o;
};

export async function packHash(pack) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon(unsigned(pack))));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const sigMessage = (s) => new TextEncoder().encode(canon({ v: s.v, id: s.id, hash: s.hash, by: s.by, at: s.at }));

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// The key pair from PACK_SIGNING_KEY (PKCS8, base64), kept for the isolate's
// life; null when the secret is not set (signing is then off).
let cached = null;
export async function signingKey(env) {
  const secret = env.PACK_SIGNING_KEY;
  if (!secret) return null;
  if (cached && cached.secret === secret) return cached;
  const der = Uint8Array.from(atob(secret.trim()), (c) => c.charCodeAt(0));
  const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', priv);
  const pub = await crypto.subtle.importKey('raw', unb64u(jwk.x), { name: 'Ed25519' }, true, ['verify']);
  cached = { secret, priv, pub, publicKey: jwk.x };
  return cached;
}

export async function signWith(key, s) {
  return b64u(await crypto.subtle.sign({ name: 'Ed25519' }, key.priv, sigMessage(s)));
}

export async function verifyWith(key, s) {
  if (!s || s.alg !== 'Ed25519' || s.v !== SIG_V || typeof s.s !== 'string') return false;
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, key.pub, unb64u(s.s), sigMessage(s));
  } catch {
    return false;
  }
}
