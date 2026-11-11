/* A free account's share links (io/tasters.js; jek-api src/links.js FREE_LINKS, reported by GET /v1/tasters as
   'share'): kept at once, not a month's uses. Everything else that was once a taster of JEKrayPro's work (the
   optimiser, tolerancing, scripts, reports, drawings, exports) is a free account's outright now (ui/pro.js freeWork). */
export const TASTER_NAMES = { share: 'share links' };
// the work, as the gates name it, to its taster
export const tasterOf = what => (/share a link|QR code/.test(String(what || '')) ? 'share' : '');
