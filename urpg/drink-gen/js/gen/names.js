// Syllable-based fantasy name generator with a few "cultures", plus drink-themed flavour.
import { pick } from './rng.js';

const LANGS = [
  { // northern
    on: ['b', 'br', 'd', 'dr', 'f', 'fj', 'g', 'gr', 'h', 'hr', 'k', 'kn', 'l', 'm', 'n', 'r', 's', 'sk', 'st', 'sv', 't', 'th', 'v', 'y'],
    nu: ['a', 'e', 'i', 'o', 'u', 'ei', 'au', 'y', 'aa'],
    co: ['', '', 'n', 'r', 'rn', 'ld', 'nd', 'k', 'g', 'm', 'st', 'll'],
    suf: ['heim', 'vik', 'by', 'fjord', 'holm', 'stad', 'gard', 'ness', 'borg', 'vald', 'havn'],
  },
  { // anglo
    on: ['b', 'br', 'c', 'ch', 'd', 'f', 'g', 'h', 'l', 'm', 'n', 'p', 'r', 's', 'sh', 'st', 't', 'th', 'w', 'wh', 'ash', 'el'],
    nu: ['a', 'e', 'i', 'o', 'u', 'ea', 'ee', 'ow', 'ay'],
    co: ['', 'n', 'r', 'l', 'ck', 'm', 'nd', 'rd', 'th', 'sh'],
    suf: ['ton', 'ford', 'bury', 'wick', 'field', 'mouth', 'ham', 'cott', 'dale', 'moor', 'port', 'well', 'stead', 'brook', 'haven'],
  },
  { // elvish / romance
    on: ['', 'l', 'm', 'n', 'r', 's', 't', 'v', 'th', 'el', 'al', 'c', 'd', 'f', 'g', 'ph', 'sil', 'gal'],
    nu: ['a', 'e', 'i', 'o', 'ia', 'ae', 'ie', 'ea', 'io', 'y'],
    co: ['', '', 'n', 'l', 'r', 's', 'th', 'nd', 'll', 'nn'],
    suf: ['ia', 'ara', 'ion', 'iel', 'oria', 'enne', 'ador', 'ond', 'ith', 'ost', 'anor', 'imar', 'essa'],
  },
  { // harsh / dwarven
    on: ['k', 'kr', 'g', 'gr', 'z', 'zh', 'dr', 't', 'th', 'v', 'b', 'm', 'r', 'kh', 'd'],
    nu: ['a', 'o', 'u', 'ar', 'ur', 'e', 'au'],
    co: ['k', 'g', 'th', 'z', 'rk', 'sh', 'x', 'n', 'm', 'r', 'dd'],
    suf: ['gar', 'mok', 'dun', 'zar', 'gul', 'khaz', 'rok', 'bur', 'thar', 'nak', 'grim'],
  },
  { // desert / sun
    on: ['', 'q', 'k', 'z', 's', 'sh', 'h', 'j', 'm', 'n', 'r', 't', 'd', 'b', 'al'],
    nu: ['a', 'aa', 'i', 'u', 'e', 'ai', 'ou'],
    co: ['', '', 'r', 'n', 'l', 'm', 'sh', 'h', 'z', 'b'],
    suf: ['abad', 'esh', 'ara', 'un', 'ira', 'ah', 'ir', 'oum', 'adar'],
  },
];
export const LANG_COUNT = LANGS.length;

const THEMES = {
  coffee: {
    adj: ['Crema', 'Roasted', 'Arabica', 'Mocha', 'Robusta', 'Dark', 'Bitter', 'Bean', 'Ristretto', 'Umber', 'Bronze', 'Smoky'],
    title: ['Archipelago', 'Isles', 'Reaches', 'Shoals', 'Expanse', 'Dominions'],
    subtitle: 'as charted in the crema of a cup of coffee',
  },
  beer: {
    adj: ['Amber', 'Barley', 'Hopsworn', 'Malted', 'Golden', 'Frothing', 'Stout', 'Copper', 'Foaming', 'Russet', 'Bitter'],
    title: ['Archipelago', 'Isles', 'Reaches', 'Kingdoms', 'Expanse', 'Marches'],
    subtitle: 'as charted in the foam of a pint',
  },
  tea: {
    adj: ['Steeped', 'Jade', 'Oolong', 'Misty', 'Leafen', 'Earl', 'Herbal', 'Pale', 'Smoky'],
    title: ['Isles', 'Archipelago', 'Reaches', 'Provinces'],
    subtitle: 'as read in the leaves of a cup of tea',
  },
  other: {
    adj: ['Sunken', 'Whispering', 'Shattered', 'Pale', 'Storm', 'Mirror', 'Hollow', 'Drowned', 'Silver', 'Gilded'],
    title: ['Archipelago', 'Isles', 'Reaches', 'Realms', 'Expanse'],
    subtitle: 'as charted in the bottom of a glass',
  },
};
const GENERIC_ADJ = ['Sunken', 'Whispering', 'Silent', 'Shattered', 'Pale', 'Storm', 'Mirror', 'Bitter', 'Hollow', 'Restless', 'Glass', 'Lantern', 'Weeping'];

const VOWEL = /[aeiouy]/;
function tidy(w) {
  w = w.replace(/(.)\1\1+/g, '$1$1');
  w = w.replace(/([^aeiouy])\1(?=[^aeiouy])/g, '$1');
  return w;
}
function ok(w) {
  if (w.length < 3 || w.length > 11) return false;
  if (!VOWEL.test(w)) return false;
  if (/[^aeiouy]{4}/.test(w)) return false;
  if (/[aeiou]{3}/.test(w)) return false;
  if ((w.match(/[aeiouy]{2}/g) || []).length > 1) return false; // "Sheareebeal" → too vowelly
  if (/[^aeiouy]{2}$/.test(w) && w.length > 8) return false;
  return true;
}
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export class NameGen {
  constructor(rng, theme) {
    this.rng = rng;
    this.used = new Set();
    this.theme = THEMES[theme] || THEMES.other;
    this.themeKey = theme;
  }
  word(L, minS, maxS) {
    const rng = this.rng;
    const n = minS + Math.floor(rng() * (maxS - minS + 1));
    let s = '';
    for (let k = 0; k < n; k++) {
      s += pick(rng, L.on) + pick(rng, L.nu);
      if (k === n - 1 || rng() < 0.3) s += pick(rng, L.co);
    }
    return s;
  }
  unique(fn) {
    let w = '';
    for (let tries = 0; tries < 40; tries++) {
      w = tidy(fn());
      if (ok(w) && !this.used.has(w)) { this.used.add(w); return cap(w); }
    }
    return cap(w);
  }
  place(lang) {
    const L = LANGS[lang % LANGS.length];
    return this.unique(() => (this.rng() < 0.55 ? this.word(L, 1, 1) + pick(this.rng, L.suf) : this.word(L, 2, 3)));
  }
  root(lang) {
    const L = LANGS[lang % LANGS.length];
    return this.unique(() => this.word(L, 2, 3));
  }
  island(lang, area) {
    const r = this.rng();
    const base = this.root(lang);
    if (area === 'small' && r < 0.45) return `Isle of ${base}`;
    if (r < 0.15) return `${base} Isle`;
    if (r < 0.3 && area !== 'small') return `The ${base} Lands`;
    return base;
  }
  adjective() {
    return this.rng() < 0.5 ? pick(this.rng, this.theme.adj) : pick(this.rng, GENERIC_ADJ);
  }
  sea(lang, size) {
    const r = this.rng();
    const A = this.adjective();
    if (size === 'big') {
      if (r < 0.45) return `The ${A} Sea`;
      if (r < 0.75) return `Sea of ${this.root(lang)}`;
      return `The ${A} Deep`;
    }
    if (r < 0.3) return `Gulf of ${this.root(lang)}`;
    if (r < 0.55) return `${this.root(lang)} Sound`;
    if (r < 0.8) return `${A} Bay`;
    return `The ${A} Strait`;
  }
  lake(lang) {
    return this.rng() < 0.6 ? `Lake ${this.root(lang)}` : `${this.root(lang)} Mere`;
  }
  title(lang) {
    const r = this.rng();
    const A = pick(this.rng, this.theme.adj);
    const T = pick(this.rng, this.theme.title);
    if (r < 0.55) return `The ${A} ${T}`;
    if (r < 0.8) return `The ${T} of ${this.root(lang)}`;
    return `The Realm of ${this.root(lang)}`;
  }
  subtitle() {
    return this.theme.subtitle;
  }
}
