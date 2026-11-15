// Small, fast, seedable PRNG (mulberry32) + helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over a (sparse) sample of bytes — gives the same seed for the same photo/crop.
export function hashBytes(arr, step = 7) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < arr.length; i += step) {
    h ^= arr[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
