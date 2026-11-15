// Biome classification shared by the generator (for glyph placement) and the renderer.

export const BIOME = {
  SEA: 0, LAKE: 1, BEACH: 2, GRASS: 3, FOREST: 4, RAINFOREST: 5, DESERT: 6,
  STEPPE: 7, TUNDRA: 8, TAIGA: 9, SNOW: 10, ROCK: 11, SWAMP: 12, SCRUB: 13,
};

// Muted "parchment atlas" palette, indexed by BIOME id.
export const PALETTE = [
  [176, 204, 198], // SEA (shallow; renderer shades by depth)
  [156, 194, 198], // LAKE
  [234, 220, 178], // BEACH
  [214, 214, 160], // GRASS
  [178, 192, 132], // FOREST
  [150, 176, 118], // RAINFOREST
  [238, 216, 164], // DESERT
  [226, 214, 168], // STEPPE
  [216, 214, 192], // TUNDRA
  [170, 180, 144], // TAIGA
  [247, 245, 238], // SNOW
  [204, 188, 158], // ROCK
  [168, 178, 138], // SWAMP
  [222, 208, 156], // SCRUB
];

// h: elevation (>0 land), m: moisture 0..1, t: temperature 0..1
export function biomeAt(h, m, t) {
  if (h <= 0) return BIOME.SEA;
  if (h < 0.02) return BIOME.BEACH;
  if (h > 0.62) return t < 0.32 ? BIOME.SNOW : BIOME.ROCK;
  if (t < 0.2) return m > 0.5 ? BIOME.TAIGA : BIOME.TUNDRA;
  if (m < 0.24) return t > 0.55 ? BIOME.DESERT : BIOME.STEPPE;
  if (m < 0.36) return t > 0.6 ? BIOME.SCRUB : BIOME.GRASS;
  if (m < 0.5) return BIOME.GRASS;
  if (h < 0.1 && m > 0.82) return BIOME.SWAMP;
  if (m < 0.78) return t < 0.38 ? BIOME.TAIGA : BIOME.FOREST;
  return t > 0.6 ? BIOME.RAINFOREST : BIOME.FOREST;
}
