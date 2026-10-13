import { NLC } from './nlc.js';
import { RF_MAT } from './rf.js';

/* ==========================================================================
   Glass: Sellmeier B1 B2 B3 C1 C2 C3, wavelength in µm
   ========================================================================== */

export const GLASS = {
  'N-BK7':        [1.03961212, 0.231792344, 1.01046945, 0.00600069867, 0.0200179144, 103.560653],
  'Fused silica': [0.6961663, 0.4079426, 0.8974794, 0.00467914826, 0.0135120631, 97.9340025],
  'CaF2':         [0.5675888, 0.4710914, 3.8484723, 0.00252643, 0.0100783, 1200.556],
  'N-LAK22':      [1.14229781, 0.535138441, 1.04088385, 0.00585778594, 0.0198546147, 100.834017],
  'N-SF6':        [1.77931763, 0.338149866, 2.08734474, 0.0133714182, 0.0617533621, 174.01759],
  'N-SF10':       [1.62153902, 0.256287842, 1.64447552, 0.0122241457, 0.0595736775, 147.468793],
  'N-SF11':       [1.73759695, 0.313747346, 1.89878101, 0.013188707, 0.0623068142, 155.23629],
  'S-LAH64':      [1.83021453, 0.29156359, 1.28544024, 0.0090482329, 0.0330756689, 89.3675501],
  'N-SK5':        [0.991463823, 0.495982121, 0.987393925, 0.00522730467, 0.0172733646, 98.3594579],
  // CDGM's moulding glass (Thorlabs' C350TMD and others), as moulded: nd 1.5864, Vd 60.714 from its
  // datasheet, the N-SK5 curve (its unmoulded twin, D-ZK3) scaled to them; f = 4.50 mm at 980 nm for the C350TMD
  'D-ZK3M':       [0.986113808, 0.493305763, 1.10663096, 0.00522730467, 0.0172733646, 98.3594579],
  'N-FK51A':      [0.971247817, 0.216901417, 0.904651666, 0.00472301995, 0.0153575612, 168.68133],
  'N-PK51':       [1.15610775, 0.153229344, 0.785618966, 0.00585597402, 0.0194072416, 140.537046],
  'N-BAK1':       [1.12365662, 0.309276848, 0.881511957, 0.00644742752, 0.0222284402, 107.297751],
  'N-BAK4':       [1.28834642, 0.132817724, 0.945395373, 0.00779980626, 0.0315631177, 105.965875],
  'N-BAF10':      [1.5851495, 0.143559385, 1.08521269, 0.00926681282, 0.0424489805, 105.613573],
  'N-KZFS4':      [1.35055424, 0.197575506, 1.09962992, 0.0087628207, 0.0371767201, 90.3866994],
  'N-LAK10':      [1.72878017, 0.169257825, 1.19386956, 0.00886014635, 0.0363416509, 82.9009069],
  'N-LASF9':      [2.00029547, 0.298926886, 1.80691843, 0.0121426017, 0.0538736236, 156.530829],
  'N-F2':         [1.39757037, 0.159201403, 1.2686543, 0.00995906143, 0.0546931752, 119.248346],
  'N-SF2':        [1.47343127, 0.163681849, 1.36920899, 0.0109019098, 0.0585683687, 127.404933],
  'N-SF5':        [1.52481889, 0.187085527, 1.42729015, 0.011254756, 0.0588995392, 129.141675],
  'N-SF8':        [1.55075812, 0.209816918, 1.46205491, 0.0114338344, 0.0582725652, 133.24165],
  'N-SF57':       [1.87543831, 0.37375749, 2.30001797, 0.0141749518, 0.0640509927, 177.389795],
  'F2':           [1.34533359, 0.209073176, 0.937357162, 0.00997743871, 0.0470450767, 111.886764],
  'SF2':          [1.40301821, 0.231767504, 0.939056586, 0.0105795466, 0.0493226978, 112.405955],
  'SF5':          [1.46141885, 0.247713019, 0.949995832, 0.0111826126, 0.0508594669, 112.041888],
  'SF10':         [1.61625977, 0.259229334, 1.07762317, 0.0127534559, 0.0581983954, 116.60768],
  'SF11':         [1.73848403, 0.311168974, 1.17490871, 0.0136068604, 0.0615960463, 121.922711],
  'Sapphire':     [1.4313493, 0.65054713, 5.3414021, 0.0052799261, 0.0142382647, 325.017834],
  'MgF2':         [0.48755108, 0.39875031, 2.3120353, 0.001882178, 0.008951888, 566.13559],
  'ZnSe':         [4.45813734, 0.467216334, 2.8956629, 0.0403446215, 0.153171194, 2221.82944],
  'Silicon':      [10.6684293, 0.0030434748, 1.54133408, 0.0909120621, 1.28765977, 1218816],
  'Germanium':    [0.4886331, 14.5142535, 0.0091224, 1.393959, 0.1626427, 752.19],
  // four terms and a constant in n^2 (the first value): Daimon and Masumura's fit, set to the
  // standard 20 C values (1.33712, 1.33299, 1.33115 at the F, D and C lines); 0.2 to 1.1 um
  'Water':        [-0.00095737512, 0.5684027565, 0.1726177391, 0.02086189578, 0.1130748688, 0.005101829712, 0.01821153936, 0.02620722293, 10.69792721],
  'Polystyrene':  [1.4435, 0, 0, 0.020216, 0, 0],       // Sultanova et al. 2009
};
const GLASS_ALIAS = {
  'BK7': 'N-BK7', 'NBK7': 'N-BK7', 'H-K9L': 'N-BK7', 'HK9L': 'N-BK7',
  'D-ZK3': 'N-SK5', 'H-ZK3': 'N-SK5', 'ZK3': 'N-SK5', 'SK5': 'N-SK5',
  'F_SILICA': 'Fused silica', 'SILICA': 'Fused silica', 'FUSED SILICA': 'Fused silica',
  'UVFS': 'Fused silica', 'FUSEDSILICA': 'Fused silica', 'SIO2': 'Fused silica',
  'CORNING7980': 'Fused silica', 'INFRASIL': 'Fused silica', 'SUPRASIL': 'Fused silica',
  'CAF2': 'CaF2', 'CALCIUM FLUORIDE': 'CaF2',
  'MGF2': 'MgF2', 'AL2O3': 'Sapphire', 'SAPPHIRE': 'Sapphire',
  'SI': 'Silicon', 'SILICON': 'Silicon', 'GE': 'Germanium', 'GERMANIUM': 'Germanium',
  'ZNSE': 'ZnSe', 'ZNSE_BROAD': 'ZnSe',
  'WATER': 'Water', 'H2O': 'Water', 'PS': 'Polystyrene', 'POLYSTYRENE': 'Polystyrene',
};
export function glassKey(name) {
  if (!name) return null;
  if (GLASS[name]) return name;
  const u = String(name).toUpperCase().trim();
  const tries = [u, u.replace(/[_\s]+/g, ''), u.replace(/[_\s]+/g, '-'),
    u.replace(/(HTULTRA|HT|_SCHOTT|_OHARA|_CDGM|_HOYA)$/, '')];
  for (const t of tries) {
    if (GLASS[t]) return t;
    if (GLASS_ALIAS[t]) return GLASS_ALIAS[t];
    for (const k of Object.keys(GLASS)) if (k.toUpperCase() === t) return k;
  }
  return null;
}
function sellmeier(c, um) {
  // B1..Bk then C1..Ck; an odd count leads with a constant added to n^2
  const l2 = um * um, a0 = c.length % 2 ? 1 : 0, k = (c.length - a0) / 2;
  let n2 = 1 + (a0 ? c[0] : 0);
  for (let i = 0; i < k; i++) { const B = c[a0 + i]; if (B) n2 += B * l2 / (l2 - c[a0 + k + i]); }
  return Math.sqrt(n2);
}
/* Linear interpolation in a measured table, wavelengths in micrometres */
function tableAt(wl, vals, um) {
  if (!vals || !vals.length) return null;
  if (um <= wl[0]) return vals[0];
  if (um >= wl[wl.length - 1]) return vals[vals.length - 1];
  let i = 1;
  while (i < wl.length - 1 && wl[i] < um) i++;
  const t = (um - wl[i - 1]) / ((wl[i] - wl[i - 1]) || 1);
  return vals[i - 1] + t * (vals[i] - vals[i - 1]);
}

/* material: {glass:'N-BK7'} | {glass:'AIR'} | {glass:'custom', n} | {glass:name, nd, vd}
   | {glass:name, table:{wl, n, k}} from refractiveindex.info */
export function refIndex(mat, nm) {
  if (!mat || mat.glass === 'AIR') return 1;
  if (mat.nlc && NLC[mat.nlc]) return NLC[mat.nlc].n(nm / 1000, mat.temp);    // a nonlinear crystal's own index (see NLC)
  if (mat.table) {
    const v = tableAt(mat.table.wl, mat.table.n, nm / 1000);
    if (v !== null) return v;
  }
  const key = glassKey(mat.glass);
  if (key) return sellmeier(GLASS[key], nm / 1000);
  if (RF_MAT[mat.glass]) return RF_MAT[mat.glass].n;                 // an RF dielectric: its index near 100 to 300 GHz
  if (mat.glass === 'custom') return isFinite(mat.n) ? +mat.n : 1.5;
  if (isFinite(mat.nd)) {
    if (!isFinite(mat.vd) || mat.vd <= 0) return +mat.nd;
    // Two-term Cauchy fitted to nd and Vd
    const lF = 0.4861327, lC = 0.6562725, ld = 0.5875618;
    const B = ((mat.nd - 1) / mat.vd) / (1/(lF*lF) - 1/(lC*lC));
    const A = mat.nd - B / (ld*ld);
    const um = nm / 1000;
    return A + B / (um*um);
  }
  return 1.5;
}
/* Absorption coefficient in 1/mm: intensity falls as exp(-alpha * path) */
const absorbOf = mat => (mat && mat.abs > 0) ? mat.abs : 0;
/* Absorption at a wavelength: from the measured k where there is one, else the fixed value */
export function absorbAt(mat, nm) {
  if (!mat) return 0;
  if (mat.table && mat.table.k && mat.table.k.some(v => v > 0)) {
    const k = tableAt(mat.table.wl, mat.table.k, nm / 1000);
    if (k !== null && k > 0) return 4 * Math.PI * k / (nm * 1e-6);   // per mm
  }
  if (mat.abs > 0) return mat.abs;
  // an RF dielectric by its loss tangent: power absorbed per mm, 2 pi n tan(delta) / lambda
  if (RF_MAT[mat.glass]) return 2 * Math.PI * RF_MAT[mat.glass].n * RF_MAT[mat.glass].tand / (nm * 1e-6);
  return 0;
}

export function matLabel(mat) {
  if (!mat || mat.glass === 'AIR') return 'Air';
  if (mat.glass === 'custom') return 'n = ' + mat.n;
  if (RF_MAT[mat.glass]) return mat.glass;
  return glassKey(mat.glass) || mat.glass;
}

