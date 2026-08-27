/**
 * Product catalogue.
 *
 * Maps a Stripe *price* ID to the file that should be delivered for it.
 * This is the only file you need to touch when adding a new digital product.
 *
 * To add a product:
 *   1. Create the product + price in Stripe, copy the price ID (price_...).
 *   2. Upload the file to the R2 bucket.
 *   3. Add an entry below.
 *
 * Use the PRICE id, not the product id. A product can have several prices
 * (currencies, sale pricing); each one that should deliver a file needs an
 * entry here. Two prices can point at the same file.
 */

export const CATALOGUE = {
  // ---- μRPG -------------------------------------------------------------
  'price_1U8rAc3K18Mm3wzNHMXAKuwG': {
    name: 'Terror of Echo Station',
    // Object key inside the R2 bucket
    r2Key: 'urpg/terror-of-echo-station-v1.pdf',
    // Filename the customer sees on the attachment
    filename: 'Terror of Echo Station - uRPG.pdf',
  },

  // ---- add further products here ---------------------------------------
  // 'price_xxx': {
  //   name: 'Perk Pack: One',
  //   r2Key: 'urpg/perk-pack-one-v1.pdf',
  //   filename: 'Perk Pack One - uRPG.pdf',
  // },
};

/**
 * Look up a price ID. Returns null for anything not in the catalogue, which
 * is how physical goods and any future non-delivering line items fall
 * through harmlessly.
 */
export function lookup(priceId) {
  return CATALOGUE[priceId] ?? null;
}
