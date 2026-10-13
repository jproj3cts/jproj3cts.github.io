import { VERSION } from '../core/constants.js';
import { GLASS } from '../core/glass.js';
import { CRYSTALS, CRYSTAL_SHAPES, FILTER_TYPES } from '../core/crystals.js';
import { TRAP_ATOMS } from '../core/traps.js';
import { DETECTOR_MATERIALS } from '../core/rf.js';
import { PRISM_SHAPES, TYPE_LABEL } from '../state/project.js';
import { normElementBase } from '../state/elements.js';
import { STOP_SHAPES } from '../core/mask.js';
import { FC, FC_ORDER } from '../engines/fibre.js';
import { PIC } from '../engines/pic.js';
import { ELEC } from '../engines/elec.js';

/* ==========================================================================
   The guide for AI assistants
   A Markdown file that teaches an assistant the .jekray format well enough to write one.
   The reference half is built from the tool's own tables (every type, field, default,
   glass and fibre component), so it cannot drift from what the tool reads; the prose and
   the field notes below are kept by hand, and the regression suite checks that every
   field the tool has is described here.
   ========================================================================== */
const AI_GUIDE_EXAMPLES = ['michelson', 'fabry-perot', 'pdh-lock', 'split-laser'];
export const AI_ANGLE = {
  draw: 'turns the drawing about its x, y.',
  source: 'the direction the light leaves in (0 = travelling +x).',
  mirror: 'the direction its reflecting face points (its normal, towards the light it reflects).',
  screen: 'the direction its face points: towards the light it records.',
  detector: 'the direction its face points: towards the light.',
  fibre: 'the direction its face points: towards the light it takes in, and the way it sends light out. Its fibre port is on the back.',
  lens: 'the direction of its optical axis. Surface 1 is on the side the axis points away from: at angle 0 light travelling +x meets surfaces[0] first.',
  cube: 'turns its internal diagonal. At 0 the diagonal runs like "/": light travelling +x reflects to +y, travelling −x reflects to −y, and it transmits straight on. At 90 the diagonal is "\\": +x reflects to −y.',
  prism: 'rotates the prism about its centre; check the result on the bench.',
  crystal: 'the direction of its entrance face’s normal (0 for light travelling ±x).',
  grating: 'the direction its ruled face points (like a mirror for mode "reflect").',
  stop: 'its normal: 0 for a beam travelling ±x (the blades then lie along y).',
  waveplate: 'its normal: 0 for a beam travelling ±x.',
  polariser: 'its normal: 0 for a beam travelling ±x.',
  mask: 'its normal: 0 for a beam travelling ±x.',
  filter: 'its normal: 0 for a beam travelling ±x.',
  faraday: 'its normal, and the direction of its magnetic field: the sense of rotation depends on the direction of travel against it.',
  isolator: 'its forward direction: light travelling along the angle passes, light travelling against it is blocked.',
  gain: 'its normal: 0 for a beam travelling ±x.',
  cell: 'its axis: 0 for a beam travelling ±x (the cell lies along x).',
  nlc: 'its axis: 0 for a beam travelling ±x (the crystal lies along x).',
  link: 'its normal. Light crossing one plane of a pair leaves its partner (on another tab) the same way relative to that plane.',
  chopper: 'its blade\u2019s normal: 0 (or 180) across a beam travelling along x, as a stop.',
  stl: 'the way the object\u2019s own +x (as in its file) points; its tip and roll turn it as any part\u2019s.',
  aom: 'its normal: 0 for a beam travelling ±x. Order +1 turns the beam anticlockwise by asin(λ·rf/v); order −1 clockwise.',
  eom: 'its normal: 0 for a beam travelling ±x.',
};
export const AI_WHAT = {
  draw: 'A drawing for figures: a rectangle, an ellipse, a path of Bézier curves or a text, filled and stroked like an SVG shape. The light passes through it as if it were not there. Its shape is in its own frame, centred on x, y.',
  source: 'A light source: a fan of rays and, with "gauss": true, a Gaussian beam whose diffracted field can be shown.',
  mirror: 'A mirror, flat or curved (spherical or conic), partly transmitting if reflect < 100.',
  lens: 'A lens of any number of surfaces (singlet, doublet, asphere, cylinder, axicon) in real glass.',
  screen: 'A screen: records the rays and the field arriving on its face, and gives spot size, profile, PSF, MTF, Strehl and more.',
  stop: 'An aperture: iris, slit, double slit, slit comb, knife edge or beam block.',
  cube: 'A beam-splitter cube: non-polarising ("npbs", reflect %) or polarising ("pbs", reflectS/reflectP %).',
  prism: 'A glass prism or window.',
  waveplate: 'A waveplate (retardance in waves).',
  polariser: 'A linear polariser.',
  mask: 'A thin mask with an amplitude and a delay (in waves) written as formulas: also the way to model an ideal lens or objective.',
  grating: 'A diffraction grating, reflecting or transmitting.',
  fibre: 'A fibre tip: takes free-space light into a fibre by mode overlap, and sends a fibre network’s light out.',
  detector: 'A free-space photodiode with an amplifier: DC, beat notes, RF spectrum, oscilloscope trace and a mixer output.',
  faraday: 'A Faraday rotator (non-reciprocal).',
  isolator: 'An optical isolator (polariser, 45° Faraday rotator, polariser).',
  crystal: 'A birefringent crystal: beam displacer, Wollaston prism or Glan–Taylor polariser.',
  filter: 'A filter: long-pass, short-pass, band-pass or neutral density, optionally reflecting what it rejects (a dichroic).',
  gain: 'A thin gain medium with a Lorentzian gain line that saturates: in a cavity above threshold the laser settles at its output power and the output leaves each partly transmitting mirror as a beam.',
  nlc: 'A periodically poled nonlinear crystal (MgO:PPLN or PPKTP) that doubles the frequency of light polarised along its z axis: the second harmonic leaves as a beam of its own, from Boyd and Kleinman\u2019s theory for the focusing, the poling period and the temperature, and the fundamental leaves depleted. Put a lens before it so the beam focuses in its middle.',
  cell: 'An atomic vapour cell (Rb, Cs or K; D1 or D2): Doppler-broadened hyperfine absorption and dispersion at the light\u2019s frequency, and saturated absorption (Lamb dips and crossovers) for a weak beam crossing a strong one going the other way. Set a source\u2019s wavelength to the line in vacuum nm (Rb D2 780.24, Cs D2 852.35).',
  link: 'One of a pair of link planes joining two tabs: the pair is one plane seen from two benches.',
  chopper: 'An optical chopper: a slotted wheel across the beam, open for the first part of each cycle; photodetectors behind it see the chopped light (the bench draws it open).',
  stl: 'An STL object: an opaque shape brought in from a .stl file (a mount, a housing, a baffle), every ray that meets it stopped where it lands, as a beam block. Its triangles ("mesh") are written by JEKray2D when the person imports the file; you cannot write one, so leave STL objects out of the file and tell the person to bring theirs in with Open \u25be \u2192 Import an object (.stl), or drop the file on the bench.',
  aom: 'A free-space acousto-optic modulator: shifts the diffracted order by the drive frequency.',
  eom: 'A free-space electro-optic modulator: phase (sidebands) or amplitude modulation.',
};
/* each field: its meaning, units and limits, as the tool reads them */
export const AI_FIELDS = {
  draw: { shape: '"rect", "ellipse", "path" or "text".', fill: '"#rrggbb", or "none" (a text’s colour).', fillOpacity: '0 to 1.', stroke: '"#rrggbb", or "none".', strokeOpacity: '0 to 1.',
    strokeWidth: 'mm.', dash: '"solid", "dash", "long", "dot" or "dashdot".', cap: '"butt", "round" or "square".', join: '"miter", "round" or "bevel".', opacity: '0 to 1: the whole drawing.',
    layer: '"under" the beams and parts, or "over" them.', w: 'mm, a rectangle’s width.', h: 'mm, a rectangle’s height.', r: 'mm, a rectangle’s corner radius.',
    rx: 'mm, an ellipse’s radius along x.', ry: 'mm, an ellipse’s radius along y.',
    nodes: 'a path’s nodes, [{"x": mm, "y": mm, "h1": [dx, dy] or null, "h2": [dx, dy] or null}], from x, y; h1 and h2 are the Bézier handles into and out of the node, from it (null: a straight piece). "smooth": true keeps a node’s handles in line when one is dragged.',
    closed: 'true joins a path’s last node to its first.',
    text: 'a text’s words; \\n starts a new line. x, y is where its first line starts, is centred or ends (align), on its baseline.', size: 'mm, a text’s font size.',
    m: 'optional [a, b, c, d]: a skew (or scale) on the shape before its angle, x\u2032 = a x + c y, y\u2032 = b x + d y; left out, none.',
    font: '"sans", "serif" or "mono".', bold: 'true for bold text.', italic: 'true for italic text.', align: '"left", "center" or "right".' },
  source: {
    wavelength: 'nm, 100 to 1000000 (1 mm); longer waves come from an RF feed horn (mmw).', width: 'mm: the full width of the ray fan (follows the beam when gauss is true).',
    divergence: 'degrees, full angle of the fan; negative converges.', rays: 'number of rays in the fan, 1 to 501 (use 1 to 11 with gauss).',
    gauss: 'true for a Gaussian beam: then set w0 and z0.', w0: 'mm: the 1/e² waist radius.', z0: 'mm: how far ahead of the source the waist is (negative: behind it).',
    m2: 'beam quality M² ≥ 1.', tem: '"gauss" (TEM00), "hg" (a Hermite–Gauss mode HG_mn) or "lg" (a Laguerre–Gauss mode LG_pl, a vortex of charge l when l ≠ 0), built on a Gaussian of waist w0; a higher-order mode uses the 2D field model and ignores m2.', hm: 'HG m: nodes across the beam in the bench plane, 0–10.', hn: 'HG n: nodes out of the bench plane, 0–10.', lp: 'LG p: radial order (rings), 0–10.', ll: 'LG l: vortex charge, −10 to 10; its phase is a delay of l·theta/2π waves, as a vortex mask of charge l writes it.',
    popN: 'grid points for the field: 128, 256, 512 or 1024.', popModel: '"auto" (round when it can be) or "2d".',
    traceRays: 'false hides the ray fan.', pol: '"unpolarised", "s" (out of the bench plane), "p" (in the plane) or "linear" (then polAngle).',
    polAngle: 'degrees from p, for pol "linear".', lines: 'extra wavelengths in nm, up to 12.', power: 'mW.',
    coh: 'coherence length in mm, with cmode "line"; 0 for a single frequency.', lineshape: '"lorentz" or "gauss": the laser line’s shape, with coh.',
    cmode: '"single" (one frequency: every path interferes), "line" (a line of its own, from coh and lineshape) or "broad" (incoherent, broadband light of bandwidth bw: only near-equal paths interfere).',
    bw: 'bandwidth in nm (FWHM), with cmode "broad": the coherence length is wavelength² / bw.',
    splitFrom: 'id of another source this one is split from (same laser, so they interfere); null for a laser of its own.',
    splitPhase: 'degrees of phase against the source it is split from.', splitPath: 'mm of extra fibre before this launch, against the other.',
    fibre: 'optional {"core": µm, "na": NA}: a launch from a single-mode fibre, which sets w0 and z0 itself.',
    tau: 'fs: a mode-locked laser’s pulse duration (intensity FWHM at its transform limit); 0 for a continuous laser. Its bandwidth then sets coh.',
    pshape: '"sech2" or "gauss": the pulse’s shape.', rep: 'MHz: the repetition rate (power is the average power).',
    gdd0: 'fs²: the chirp the pulse leaves the laser with (0 at its transform limit).',
  },
  mirror: { length: 'mm: the mirror’s width across the bench.', reflect: '% reflected, 0 to 100 (the rest is transmitted).',
    R: 'mm radius of curvature, null for flat. Positive: concave towards the light it faces (focuses, f = R/2); negative: convex.',
    k: 'conic constant (0 sphere, −1 paraboloid).', offset: 'mm: an off-axis segment of the parent surface, this far from its vertex.',
    gdd: 'fs² added to each reflection (a chirped mirror; negative compresses a pulse); 0 for an ordinary mirror.',
    mapScale: '"lin" or "log": the irradiance map of the light arriving (its Diffraction tab, as a screen’s).', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams arriving.',
    mtfFreq: 'lp/mm at which its Diffraction tab quotes the MTF.' },
  lens: { diameter: 'mm.', surfaces: 'list of surfaces in the order the light meets them at angle 0, each {"R": mm or null for flat, "k": conic, "A": [aspheric a4, a6, …], "coat": coating}. Standard sign convention: R > 0 has its centre of curvature on the far side (downstream).',
    gaps: 'mm: centre thicknesses between successive surfaces (one fewer than surfaces).', materials: 'one material per gap, e.g. {"glass": "N-BK7"}.',
    cyl: 'optional: "plane" for a cylindrical lens with power in the bench plane, "out" for power out of it.' },
  screen: { length: 'mm: the width of its face.', absorb: 'true stops the light it records; false lets it pass (to sample a beam).',
    R: 'mm: a curved screen; negative puts its centre of curvature on the side the light comes from (like a retina); null for flat.', binWidth: 'mm for the binned intensity; 0 chooses.', binInterp: 'true interpolates the rays into the bins.',
    mapScale: '"lin" or "log" irradiance map.', vectorFocus: '"auto", "on" or "off": the vector focus model for steep beams.', trap: '"none", an atom (' + Object.keys(TRAP_ATOMS).map(k => '"' + k + '"').join(', ') + ') or "sphere" (a dielectric sphere) to read an optical trap for near this screen (the Trap tab): where it sits, depth, trap frequencies each way and scattering, from every beam through the screen\u2019s region.', trapF: 'for atoms, the ground hyperfine level they are in: "avg" (the centroid), "lo" or "hi" (F = I \u2213 1/2); it moves the lines by a few GHz, which matters close to them (the tune-out wavelength between D1 and D2 moves by picometres).', trapMat: 'the sphere\u2019s glass ("Fused silica", "Polystyrene" and so on).', trapR: 'the sphere\u2019s radius, nm.', trapRho: 'its density, kg/m\u00b3.', trapMed: '"bench" (the index where the light is: put the focus in a block of "Water" for a liquid), "vacuum" or "air" (with trapP).', trapP: 'air pressure, mbar: sets the gas damping and quality factors.', trapT: 'temperature (K): the depth in kT and the gas.', mtfFreq: 'lp/mm at which the MTF is quoted.', abSrc: 'the id of the fan source the Aberrations tab sweeps across the field ("" for the first reaching the screen).', abAng: 'its largest field angle, degrees, for a collimated source.', abH: 'its largest object height, mm, for a diverging source (a point object).', abN: 'fields across, 3 to 21.', abRays: 'rays in each field\u2019s fan, odd, 11 to 401.' },
  stop: { shape: 'one of the stop shapes below.', aperture: 'mm: the opening (an iris’s diameter, a slit’s width).', outer: 'mm: the outer size (a beam block’s diameter).',
    sep: 'mm: a double slit’s centre-to-centre separation.', pitch: 'mm: a slit comb’s pitch.', count: 'a comb’s number of slits, 2 to 400.',
    offset: 'mm: the opening’s centre along the stop.', height: 'mm: a slit’s height out of the plane (0 unlimited).', side: '1 or −1: which side a knife edge covers.' },
  cube: { size: 'mm edge length.', mode: '"npbs" or "pbs".', reflect: '% reflected, for "npbs".', reflectS: '% of s reflected, for "pbs".', reflectP: '% of p reflected, for "pbs".',
    material: 'e.g. {"glass": "N-BK7"}.', coat: 'coating on its outer faces (see Coatings).' },
  prism: { shape: 'one of the prism shapes below.', size: 'mm.', thickness: 'mm (for a window).', material: 'e.g. {"glass": "N-BK7"}.', coat: 'coating on its faces.' },
  waveplate: { length: 'mm aperture.', retard: 'retardance in waves (0.25 quarter-wave, 0.5 half-wave, or any value).', axis: 'degrees: the fast axis from p.' },
  polariser: { length: 'mm aperture.', axis: 'degrees: the transmission axis from p (0 passes p, 90 passes s).' },
  mask: { length: 'mm aperture.', amp: 'amplitude transmission as a formula in x (mm along the mask), y (mm out of the plane), r, theta, lambda (mm) and pi; e.g. "1" or "circ(r/2)".',
    delay: 'delay in waves as a formula in the same variables. An ideal lens of focal length f mm: "-(sqrt(r^2+f^2)-f)/lambda" (write f as a number).',
    preset: 'leave "custom".' },
  grating: { length: 'mm.', lpmm: 'lines per mm.', mode: '"reflect" or "transmit".', blaze: 'nm blaze wavelength.', eff: '% into the first order at the blaze.' },
  fibre: { length: 'mm: the ferrule face width.', core: 'µm core diameter (mode field set from core and NA).', na: 'numerical aperture.',
    emitRays: 'rays in the fan it sends out, 0 to 51.', emitPattern: '"line" (the default, in the bench plane), "cross", "grid" or "hex": its rays across the beam, up and down it too, as a source\'s pattern.',
    mm: 'true for a multimode fibre (give it core 50 or 62.5 and na 0.22): it takes in what lands on its core inside its NA, and sends out a beam filling core and NA.' },
  nlc: { length: 'mm: the aperture across the beam.', nlLen: 'mm along the beam (10 to 50 is usual).', material: '"ppln" (MgO:PPLN, d_eff 14 pm/V) or "ppktp" (d_eff 9.5 pm/V).', period: 'poling period, µm; 0 (the default) picks the best period for the beam through it.', temp: '°C: tunes the phase matching (PPLN is usually run hot, 40 to 200).', axis: '"s" (z axis out of the bench plane: s light converts) or "p".', faces: '"ar" (end faces anti-reflection coated, 0.1%; the default) or "bare".' },
  cell: { length: 'mm: the window diameter.', cellLen: 'mm along the beam (75 is usual).', atom: '"Rb" (natural), "Rb85", "Rb87", "Cs" or "K".', line: '"D2" or "D1".',
    temp: '°C: sets the vapour density (25 for room temperature; heat a potassium cell to about 60).', bField: 'gauss, a magnetic field along the cell (+ along its angle): Zeeman-split sigma+ and sigma- lines, so circular dichroism (DAVLL) and Faraday rotation (Faraday filters). 0 for none.' },
  detector: { length: 'mm: the active area’s diameter.', material: 'one of the detector materials below.', resp: 'A/W, used when material is "custom".', gain: 'V/A transimpedance.',
    bandwidth: 'Hz.', dark: 'nA dark current.', ampNoise: 'pA/√Hz input noise.', vmax: 'V output limit.',
    demodF: 'MHz: mix the output down at this frequency (0: no mixer). With an EOM at fm, this gives a PDH error signal.', demodPhase: 'degrees: the mixer’s phase.' },
  faraday: { length: 'mm aperture.', rotation: 'degrees of rotation.' },
  isolator: { length: 'mm aperture.', axis: 'degrees: the input polariser from p.', extinction: 'dB, 0 to 80.' },
  crystal: { shape: 'one of the crystal shapes below.', crystal: 'one of the crystals below.', size: 'mm aperture.', length: 'mm length along the beam.',
    axisAngle: 'degrees: the optic axis from the normal, for a displacer.', wedge: 'degrees: the wedge angle, for Wollaston and Glan–Taylor.' },
  filter: { length: 'mm aperture.', ftype: 'one of the filter types below.', edge: 'nm: the edge of a long- or short-pass.', slope: 'nm: the 10–90% width of the edge.',
    centre: 'nm: a band-pass centre.', fwhm: 'nm: a band-pass width.', od: 'optical density of an "nd" filter: it transmits 10^−od.', tmax: '% peak transmission.',
    reflect: 'true: what it rejects is reflected (a dichroic) rather than absorbed.' },
  gain: { length: 'mm: its aperture across the beam (it is a thin sheet).', g0: 'small-signal single-pass power gain at the line centre (×); the pump sets it.', centre: 'nm line centre.', fwhm: 'nm line width.',
    isat: 'kW/cm² saturation intensity (Nd:YAG 2.9, Ti:sapphire 200, Yb:YAG 10); 0: no saturation. Above threshold the cavity settles at the power where the saturated gain balances the loss, and the output leaves each partly transmitting mirror as a beam.' },
  link: { length: 'mm width.', pair: 'the pair’s name: exactly two link planes share it, one on each tab.' },
  chopper: { length: 'mm aperture across the beam.', f: 'Hz, the chopping frequency.', duty: '% of each cycle open.', phase: 'degrees: when in the cycle it opens, against t = 0 (0: opens at t = 0).' },
  stl: { mesh: 'its triangles, written by the tool when a .stl file is imported: leave it out.', units: 'the file\u2019s units: "mm", "cm", "m", "in", or "other" with "scale".', scale: 'mm per unit of the file, with "units": "other".', colour: '"#rrggbb": how it is drawn.' },
  aom: { length: 'mm aperture.', rf: 'MHz drive: the order is shifted by this.', v: 'm/s sound speed (4200 for TeO₂ shear is typical of fibre AOMs; 650 slow shear).',
    eff: '% into the order.', order: '+1 or −1.' },
  eom: { length: 'mm aperture.', fm: 'MHz drive.', beta: 'modulation depth in radians.', emode: '"phase" (sidebands) or "amplitude".', bias: 'degrees, for "amplitude".', loss: 'dB insertion loss.' },
};
const AI_SKIP = new Set(['beamView', 'beamScale', 'emitView', 'id', 'type', 'name', 'x', 'y', 'z', 'angle', 'bench', 'sweeps', 'colour', 'colourAuto', 'absorb', 'retardCustom', 'source', 'locked', 'group', 'label']);
function aiDefaults(type) { return normElementBase({ type, name: 'x' }); }
/* the fields of each type that the guide must describe: what the tool itself reads */
export function aiFieldsOf(type) {
  const d = aiDefaults(type), keys = Object.keys(d).filter(k => !AI_SKIP.has(k));
  if (type === 'source' && !keys.includes('fibre')) keys.push('fibre');
  if (type === 'lens' && !keys.includes('cyl')) keys.push('cyl');
  if (type === 'draw') keys.push('rx', 'ry', 'nodes', 'closed', 'text', 'size', 'font', 'bold', 'italic', 'align', 'm');
  if (type === 'detector' || type === 'fibre') { const i = keys.indexOf('absorb'); if (i >= 0) keys.splice(i, 1); }
  return keys;
}
const mdCell = v => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function aiReference() {
  const L = [];
  L.push('## Element reference', '',
    'Every element has "type", "id" (any unique string), "name", "x", "y" (mm) and "angle" (degrees), and "bench" (a tab id) when there are several tabs. The other fields are listed with the value the tool uses if you leave them out. Leave out anything you do not need to change.', '');
  for (const t of Object.keys(TYPE_LABEL)) {
    const d = aiDefaults(t), F = AI_FIELDS[t] || {};
    L.push('### "' + t + '": ' + TYPE_LABEL[t], '', AI_WHAT[t] || '', '', '**angle:** ' + (AI_ANGLE[t] || ''), '', '| field | default | meaning |', '|---|---|---|');
    for (const k of aiFieldsOf(t)) {
      const j = JSON.stringify(d[k]);
      const v = d[k] === undefined ? '(none)' : k === 'surfaces' ? 'two flat surfaces' : k === 'materials' ? '`[{"glass":"N-BK7"}]`' : j.length > 48 ? '(see meaning)' : '`' + j + '`';
      L.push('| ' + k + ' | ' + mdCell(v) + ' | ' + mdCell(F[k] || '') + ' |');
    }
    L.push('');
  }
  L.push('## Fibre components ("type": "fcomp")', '',
    'Fibre components sit on the bench like any element (x, y, angle, name, id) and are joined by fibres from port to port. Give "kind" and its parameters; each port takes one fibre. At angle 0 the ports on the left are inputs and those on the right outputs, numbered from 0 in the order listed.', '');
  for (const k of FC_ORDER) {
    const K = FC[k];
    L.push('### kind "' + k + '": ' + K.label, '', '**ports:** ' + (k === 'split' ? '0 = common, then 1 to ways = the branches. "combine": true turns it round, an N\u00d71 combiner with its common port on the right' : K.names.map((n, i) => i + ' = ' + n).join(', ')) + (k === 'thru' ? '. Also "pair": a name shared by exactly two feedthroughs on different tabs, which then join as if by one fibre.' : ''), '');
    if (K.params.length) {
      L.push('| field | default | meaning |', '|---|---|---|');
      for (const [p, label, def] of K.params) L.push('| ' + p + ' | `' + JSON.stringify(def) + '` | ' + mdCell(label) + ' |');
      if (k === 'laser') L.push('| pol | `"s"` | "s" (out of the plane), "p" (in it), "linear" (at polAngle from s), "rcp" or "lcp" (circular, right- or left-handed), or "unpolarised" |', '| lineshape | `"lorentz"` | "lorentz" or "gauss" |',
        '| cmode | `"single"` | "single", "line" (coh and lineshape) or "broad" (incoherent, bandwidth bw) |', '| bw | `40` | nm, FWHM, with cmode "broad" |',
        '| led | `false` | true: a fibre-coupled LED (always "broad", never pulsed; unpolarised unless pol says otherwise) |', '| pshape | `"sech2"` | "sech2" or "gauss": a pulse’s shape, with tau above 0 |');
      if (k === 'eom') L.push('| emode | `"phase"` | "phase" or "amplitude" |');
      if (k === 'pd') L.push('| balanced | `false` | true: a balanced photodetector, ports 0 = in + and 1 = in \u2212, reading the first\u2019s light less the second\u2019s |', '| cmrr | `30` | dB, a balanced detector\u2019s common-mode rejection of excess noise |');
      if (k === 'amp') L.push('| soa | `false` | true: a semiconductor optical amplifier, gaining both ways (no isolator) |', '| pdg | `0.5` | dB, an SOA\u2019s polarisation-dependent gain: p gains less than s by it |');
      if (k === 'stretch') L.push('| (electrical) | | its drive input: \u03c0 of phase per Vpi volts on top of "phase" |');
      L.push('');
    }
  }
  L.push('## Electronics ("type": "elec")', '',
    'Electronic parts sit on the bench like fibre components (x, y, angle, name, id) and are joined by wires: entries in "fibres" with "wire": true, from an output to an input, "a" the output\u2019s end and "b" the input\u2019s. An output may feed several inputs; an input takes one wire. A part\u2019s ports are numbered from 0, its inputs first, then its outputs. Each signal is worked out in steady state: DC, tones and noise.',
    '', 'Optical parts have electrical ports after their fibre ports: a "detector" (free space) its output at 0; an fcomp "pd" its output after its input (after both inputs if "balanced"); a "source" or fibre laser with "ext": true its power and frequency inputs ("mod", %/V by "modk"; "fm", GHz/V by "fmk") after its fibre port; an "aom" its RF level, an "eom" its drive, an fcomp "stretch" its drive; a "chopper" its 0 to 5 V reference output; on a photonic chip (experimental), a "pic" "pd" its output after its input, and a "pic" "ps" its drive after its two ports (\u03c0 of phase per "vpi" volts, 5 by default).', '');
  for (const [k, K] of Object.entries(ELEC.KINDS)) {
    const ports = k === 'node' ? '0 = the node (one wire in, any number out)' : [...K.ins.map((n, i) => i + ' = ' + n + ' (in)'), ...K.outs.map((n, j) => (K.ins.length + j) + ' = ' + n + ' (out)')].join(', ');
    L.push('### kind "' + k + '": ' + K.label, '', '**ports:** ' + ports, '');
    if (K.params.length) {
      L.push('| field | default | meaning |', '|---|---|---|');
      for (const [f, label, def, opts] of K.params) L.push('| ' + f + ' | `' + JSON.stringify(def) + '` | ' + mdCell(label) + (opts ? ': ' + opts.map(([v, t]) => JSON.stringify(v) + ' (' + t + ')').join(', ') : '') + ' |');
      L.push('');
    }
  }
  L.push('## Catalogues', '',
    '**Glasses** ("material": {"glass": name}): ' + Object.keys(GLASS).join(', ') + '. Also "AIR"; {"glass": "custom", "n": 1.52} for a fixed index; {"glass": name, "nd": 1.52, "vd": 64} from catalogue nd and Vd. Common aliases (BK7, UVFS, F_SILICA, CAF2) are understood.', '',
    '**Crystals** ("crystal"): ' + Object.entries(CRYSTALS).map(([k, c]) => '"' + k + '" (' + c.name + ')').join(', ') + '.', '',
    '**Crystal shapes** ("shape" of a crystal): ' + Object.entries(CRYSTAL_SHAPES).map(([k, v]) => '"' + k + '" (' + v + ')').join(', ') + '.', '',
    '**Prism shapes**: ' + Object.entries(PRISM_SHAPES).map(([k, v]) => '"' + k + '" (' + v + ')').join(', ') + '.', '',
    '**Stop shapes**: ' + STOP_SHAPES.map(([k, v]) => '"' + k + '" (' + v + ')').join(', ') + '.', '',
    '**Filter types** ("ftype"): ' + Object.entries(FILTER_TYPES).map(([k, v]) => '"' + k + '" (' + v + ')').join(', ') + '.', '',
    '**Detector materials**: ' + Object.entries(DETECTOR_MATERIALS).map(([k, v]) => '"' + k + '" (' + v.name + ')').join(', ') + '.', '',
    '**Coatings** ("coat", on lens surfaces, cubes and prisms): {"mode": "bare"} (Fresnel), {"mode": "ar", "R": 0.5} (% reflected), {"mode": "custom", "R": %}, {"mode": "band", "R": %, "lo": nm, "hi": nm} (coated over a band, bare outside), {"mode": "stack", "design": nm, "layers": [{"n": 1.38, "d": nm}, …]}.', '');
  return L.join('\n');
}
/* The parameter tables of the online documentation (jek/docs/jekray2d), as data: every element
   type's fields with their defaults and meanings, every fibre component's, electronic part's
   and chip part's settings, from the same tables as the AI guide, so the documentation's
   tables cannot drift from what the tool reads (the suite compares them with the published copy) */
export function docsParams() {
  const cell = v => v === undefined ? null : JSON.stringify(v).length > 48 ? '(see meaning)' : JSON.stringify(v);
  const free = {};
  for (const t of Object.keys(TYPE_LABEL)) {
    const d = aiDefaults(t), F = AI_FIELDS[t] || {};
    free[t] = { label: TYPE_LABEL[t], what: AI_WHAT[t] || '', angle: AI_ANGLE[t] || '',
      fields: aiFieldsOf(t).map(k => ({ k, def: k === 'surfaces' ? 'two flat surfaces' : k === 'materials' ? '[{"glass":"N-BK7"}]' : cell(d[k]), meaning: F[k] || '' })) };
  }
  const fibre = {};
  for (const k of FC_ORDER) {
    const K = FC[k];
    fibre[k] = { label: K.label, ports: K.names.slice(), fields: K.params.map(([p, label, def]) => ({ k: p, def: JSON.stringify(def), meaning: label })) };
  }
  const elec = {};
  for (const [k, K] of Object.entries(ELEC.KINDS)) elec[k] = { label: K.label, ins: K.ins.slice(), outs: K.outs.slice(),
    fields: K.params.map(([p, label, def, opts]) => ({ k: p, def: JSON.stringify(def), meaning: label + (opts ? ': ' + opts.map(([v, t]) => JSON.stringify(v) + ' (' + t + ')').join(', ') : '') })) };
  const pic = {};
  for (const [k, K] of Object.entries(PIC.KINDS)) pic[k] = { label: K.label, ports: K.names.slice(), fields: K.params.map(([p, label, def]) => ({ k: p, def: JSON.stringify(def), meaning: label })) };
  return { version: VERSION, free, fibre, elec, pic };
}
/* an example as short as it can be: only what differs from the defaults, readable ids */
function aiCompact(data) {
  const d = JSON.parse(JSON.stringify(data)), ids = new Map(), used = new Set();
  const slug = n => { let s = String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el'; let t = s, i = 2; while (used.has(t)) t = s + '-' + i++; used.add(t); return t; };
  d.elements.forEach((e, i) => { const k = slug(e.name); ids.set('#' + i, k); if (e.id) ids.set(e.id, k); });
  const els = d.elements.map((e0, i) => {
    const e = Object.assign(normElementBase(e0) || e0, { id: e0.id });
    const def = e.type === 'fcomp' ? normElementBase({ type: 'fcomp', kind: e.kind, name: 'x' }) : normElementBase({ type: e.type, name: 'x' });
    const o = { type: e.type };
    if (e.kind) o.kind = e.kind;
    o.id = ids.get('#' + i); o.name = e.name; o.x = e.x; o.y = e.y; o.angle = e.angle;
    for (const [k, v] of Object.entries(e)) {
      if (k in o || ['sweeps', 'colour', 'colourAuto', 'bench', 'absorb', 'retardCustom', 'source'].includes(k)) continue;
      if (v === null || v === undefined) continue;
      if (def && JSON.stringify(def[k]) === JSON.stringify(v) && !(e.type === 'lens' && ['surfaces', 'gaps', 'materials'].includes(k))) continue;
      o[k] = k === 'splitFrom' ? ids.get(v) || v : v;
    }
    if (o.material && o.material.abs === 0) delete o.material.abs;
    if (o.materials) o.materials = o.materials.map(m => { const q = Object.assign({}, m); if (q.abs === 0) delete q.abs; return q; });
    if (o.surfaces) o.surfaces = o.surfaces.map(sf => { const q = {}; for (const [k, v] of Object.entries(sf)) if (!(k === 'k' && v === 0) && !(k === 'a2' && v === 0) && !(k === 'A' && !v.length) && v !== null && v !== undefined && !(k === 'coat' && v.mode === 'bare')) q[k] = v; if (!('R' in q)) q.R = null; return q; });
    return o;
  });
  const out = { format: 'jekray', version: VERSION, name: d.name };
  if (d.notes) out.notes = d.notes;
  if (d.maxBounces && d.maxBounces !== 200) out.maxBounces = d.maxBounces;
  if (d.minPower && d.minPower !== 0.1) out.minPower = d.minPower;
  out.elements = els;
  if (d.fibres && d.fibres.length) out.fibres = d.fibres.map(F => {
    if (F.wire) return { a: [ids.get(F.a[0]), F.a[1]], b: [ids.get(F.b[0]), F.b[1]], wire: true };
    const o = { a: [ids.get(F.a[0]), F.a[1]], b: [ids.get(F.b[0]), F.b[1]], len: F.len };
    if (F.wg) o.wg = F.wg;
    if (F.loss !== 0.2) o.loss = F.loss;
    if (F.path && F.path.length) o.path = F.path.map(n => ({ x: n.x, y: n.y }));
    return o;
  });
  // one element to a line: short enough to read, and to copy
  return '{\n' + Object.entries(out).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + (Array.isArray(v) && typeof v[0] === 'object'
    ? '[\n' + v.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]' : JSON.stringify(v))).join(',\n') + '\n}';
}
const AI_EXAMPLE_NOTES = {
  michelson: 'A laser, a 50/50 cube, two arms and two screens. Note the cube at angle 0 sends the reflected arm up (+y), the mirrors face back along their arms, and the screens face the light.',
  'fabry-perot': 'A linear cavity. The end mirror’s R = 500 mm is concave towards the cavity (it faces −x at angle 180), so with the flat input coupler 250 mm away the cavity is stable. The tool finds the cavity itself and solves its steady state.',
  'pdh-lock': 'Pound–Drever–Hall: an EOM’s 20 MHz sidebands, a pick-off cube sending the cavity’s reflection to a detector demodulated at 20 MHz, its mixer at 90°: the quadrature that crosses zero steeply at resonance. Its mixer output is the error signal.',
  'split-laser': 'A fibre network on the bench: a fibre laser, a coupler and two fibre tips, each launching through a collimating lens (each tip 50.6 mm behind a biconvex N-BK7 lens of f \u2248 50 mm at 1550 nm). Fibres join [id, port] to [id, port]; "len" is in metres. The two launches are one laser, so they interfere on the cube.',
};
export function aiGuideText(examples) {
  const ex = AI_GUIDE_EXAMPLES.map(k => '### ' + (examples[k] ? JSON.parse(examples[k]).name : k) + '\n\n' + (AI_EXAMPLE_NOTES[k] || '') + '\n\n```json\n' + (examples[k] ? aiCompact(JSON.parse(examples[k])) : '') + '\n```\n').join('\n');
  return AI_GUIDE_PROSE.replace('{{VERSION}}', VERSION) + '\n' + aiReference() + '\n## Examples\n\nFour complete projects from the tool’s own examples, shortened to what differs from the defaults. Each opens as it is.\n\n' + ex;
}
async function aiGuide() {
  const ex = {};
  for (const k of AI_GUIDE_EXAMPLES) { try { ex[k] = await (await fetch('demos/' + k + '.jekray')).text(); } catch (err) { /* left out */ } }
  return aiGuideText(ex);
}
const AI_GUIDE_PROSE = "# JEKray2D: a guide for AI assistants\n\nThis file teaches you, an AI assistant, how to write projects for **JEKray2D**, a free optical bench simulator that runs in the browser (https://jeksys.net/jek/tools/jekray2d.html). A person has given it to you so that you can design an optical system for them, or rebuild one from a paper or thesis, as a `.jekray` file they can open. It describes file format version {{VERSION}}.\n\nRead all of it before writing a file. The parts that matter most are **Coordinates and angles** and the **Checklist**.\n\n## What JEKray2D is\n\n- A 2D optical bench: everything lies in one plane, the bench, seen from above. x is to the right, y is up, lengths are in millimetres and angles in degrees, anticlockwise from +x.\n- It traces rays exactly through real surfaces and glass, with polarisation (s is out of the bench plane, p is in it), optical path, Fresnel losses and coatings.\n- A source can also be a Gaussian beam. Its diffracted field is propagated through the system by physical optics, so interference, diffraction, cavities (found and solved automatically), fibre coupling and photodiode signals come out as on a real bench.\n- Fibre subsystems (fibre lasers, couplers, circulators, AOMs, EOMs, photodiodes and more) sit on the bench too, joined port to port by fibres.\n- A project can have several tabs (benches), joined by pairs of link planes or fibre feedthroughs.\n\nIt works in 3D: every free-space part is placed freely in space, by its x and y, its height \"z\" and its facing, tip and roll (below), and light is followed through all of it: up a periscope, along a raised beam, through a part rolled about it. So a periscope, a beam raised to another height or a beam sent up into a vertical microscope is built as it is. What it cannot do: put fibre, electronic or chip parts in 3D (the 3D view leaves them out), or model mechanics (no forces on particles, no thermal effects).\n\n## How to work\n\n1. **Understand the system.** List every source, optic and detector with its numbers: wavelengths, powers, focal lengths, beam sizes, distances, reflectivities, frequencies. If you are rebuilding a published setup, take the numbers from the text, the figures, the methods and the supplementary material, and write down which you had to assume.\n2. **Lay it out on paper first.** Choose the optical axis, place elements in order along it with their real spacings, and work out every angle from the rules below. Keep folds at 45 degrees where the real setup has them. Leave room between elements; two parts share an x and y only when one is above the other at a different \"z\", as in a periscope.\n3. **Write the file.** Use only the types, fields and values in the reference. Leave out any field whose default is right.\n4. **Record your assumptions.** Put in \"notes\" what the bench is, its source (a citation), each assumption and simplification, and any catalogue part numbers the person should check.\n5. **Hand it over.** Give the whole file in one fenced `json` block. Tell the person to open JEKray2D and either paste it with **Open ▾ → Pasted text** (or Ctrl+V on the bench), or save it as `name.jekray` and use **Open ▾ → A .jekray file**.\n6. **Fix what the tool reports.** When a file opens with changes, the tool lists them in an import report. If the person pastes that report back to you, correct every line and give the whole file again.\n\n## The file\n\nA `.jekray` file is one JSON object:\n\n```json\n{\n  \"format\": \"jekray\",\n  \"version\": 1,\n  \"name\": \"Short title of the bench\",\n  \"notes\": \"What it is, where it comes from, what was assumed.\",\n  \"elements\": [ ... ],\n  \"fibres\": [ ... ]\n}\n```\n\n| field | meaning |\n|---|---|\n| format | always \"jekray\" |\n| version | {{VERSION}} |\n| name | the project's title |\n| notes | free text shown on the Bench panel: purpose, citation, assumptions, parts to check |\n| elements | the elements (see the reference) |\n| fibres | optional: fibres between ports, each {\"a\": [element id, port], \"b\": [element id, port], \"len\": metres, \"loss\": dB/km, \"disp\": ps/(nm km) or leave out for standard single-mode fibre, \"gamma\": the Kerr nonlinearity in 1/(W km) or leave out (1.3 for standard fibre at 1550 nm; pulses strong enough undergo self-phase modulation), \"ftype\": \"smf\" (keeps polarisation, the default) or \"random\" (standard fibre as laid, with a \"seed\") or \"pm\" (with \"key\" degrees, \"beat\" mm and \"per\" dB) or \"mm\" (multimode), \"conn\": its ends, \"splice\" (no reflection, the default), \"pc\" or \"apc\" connectors (45 or 65 dB return loss) or \"flat\" cleaves (4%), \"path\": [{\"x\", \"y\"}, ...]} |\n| benches | optional, for several tabs: [{\"id\": \"b1\", \"name\": \"Laser table\"}, ...]; then give each element \"bench\": its tab's id |\n| maxBounces | optional: interactions per ray (default 200). Raise it for high-finesse cavities |\n| minPower | optional: rays weaker than this % of their source are dropped (default 0.1). Lower it (to 1e-4) for cavities and faint ports |\n| view | optional: {\"cx\", \"cy\", \"scale\"}. Leave it out and the tool fits the view |\n| style | optional: the bench's look, {\"bg\": a colour \"#rrggbb\" (dark as it is; light, such as \"#ffffff\" for a figure, drawn light with dark lines), \"holes\": false to hide the grid holes}. Leave it out for the dark breadboard |\n| light | optional: how the light is shown, for every source alike: {\"rays\": false to hide the rays, \"envelope\": false to hide the Gaussian beams' outlines, \"field\": true to show the diffracted field, \"scale\": \"lin\", \"log\" (30 dB) or \"log60\" (60 dB) for the field}. Leave it out for rays and envelopes |\n\nGive every element a unique \"id\" (short words like \"laser\" or \"m1\" are best) and a clear \"name\". Fibres and split sources refer to elements by id; a name also works.\n\nA free-space part may also take \"z\": the height of its optical centre above the breadboard, in mm (75, the beam height, by default). Leave it out unless the setup really has parts at different heights: light passing above or below a part misses it, and a curved surface met off its centre turns the light up or down. Any free-space part but a link plane may take \"tip\": degrees it is tipped up (positive) or down out of the plane about its own across axis (a mirror as a mount's vertical knob tips it; a source sends its light up at that angle); leave it out for an upright part. It may also take \"roll\": degrees it is turned about its own axis (the way it faces, right-handed), which turns a cylindrical lens\u2019s power, a grating\u2019s grooves (rolled 90°, its orders go up and down), a waveplate\u2019s or polariser\u2019s axis (as for an isolator\u2019s polarisers: a roll r acts as \"axis\" less r, so rolling one with a rolled source keeps them aligned), a crystal\u2019s optic axis (a beam displacer rolled 90\u00b0 walks its beam up; a doubling crystal converts the light along its turned axis) or a Dove prism\u2019s image (by twice the roll); a rolled source turns its rays and its polarisation with it. A periscope is two mirrors one over the other at the same x and y, the lower \"tip\": 45 and the upper, at its own \"z\", \"tip\": -45, facing the way the beam is to leave. A source may take \"pattern\": \"cross\", \"grid\" or \"hex\" (hexapolar rings) to spread its rays up and down the beam as well as across it (\"line\", the default, keeps them in the plane).\n\n## Coordinates and angles\n\nThis is where most mistakes happen. \"angle\" means different things for different elements:\n\n| elements | \"angle\" is |\n|---|---|\n| source | the direction the light leaves in |\n| mirror, grating | the direction the reflecting face points: its normal, towards the light |\n| screen, detector, fibre tip | the direction the face points: towards the light arriving |\n| lens | the direction of its axis; light travelling that way meets surfaces[0] first |\n| stop, waveplate, polariser, mask, filter, gain, aom, eom, link | the plane's normal: 0 (or 180) for a beam travelling along x, 90 for one along y |\n| isolator | its forward direction: light travelling along it passes |\n| cube | turns the diagonal: at 0 it runs like \"/\" |\n\nRules for folding a beam:\n\n- **Mirror:** to turn light travelling in direction a (degrees) into direction b, give the mirror angle (a + 180 + b) / 2, and add 180 if the result points away from the incoming light. For example, a beam travelling +x (a = 0) sent up to +y (b = 90) needs a mirror at 135; sent down to −y (b = 270, or −90) it needs 225 (or −135). A mirror sending light straight back along −x faces 180.\n- **Cube at angle 0** (\"/\"): light travelling +x is split into +x (transmitted) and +y (reflected); travelling −x into −x and −y; travelling +y into +y and +x. **At angle 90** (\"\\\"): +x reflects to −y.\n- **Screens and detectors** face the light: a beam travelling +x is caught by a screen at angle 180.\n- **Plane elements** (waveplates, polarisers and so on) at angle 0 sit across a beam travelling along x.\n\nSigns:\n\n- **Mirror \"R\"** is positive when concave towards the light it faces (focal length R/2) and negative when convex.\n- **Lens surfaces** follow the usual optical convention along the lens axis: R > 0 has its centre downstream. A biconvex lens is [{\"R\": 51.5}, {\"R\": −51.5}]; a plano-convex lens with its curved side first is [{\"R\": 51.5}, {\"R\": null}].\n- A source's **\"z0\"** is how far ahead of the source its waist is.\n- **Polarisation:** s is out of the bench plane and p is in it. A free-space source takes \"pol\": \"s\" or \"p\" (or \"linear\" with \"polAngle\" counted from p); a fibre laser takes \"pol\": \"s\", \"p\", \"linear\" (with \"polAngle\" counted from s), \"rcp\" or \"lcp\". When a paper's polarisation lies along the direction you have drawn in the plane, that is p.\n\n## Building blocks\n\n- **Lens from a catalogue:** a singlet is two surfaces, one gap and one material. Thorlabs LA1509 (N-BK7, f = 100 mm, Ø25.4 mm) is {\"type\": \"lens\", \"diameter\": 25.4, \"surfaces\": [{\"R\": 51.5}, {\"R\": null}], \"gaps\": [3.6], \"materials\": [{\"glass\": \"N-BK7\"}]}. Take R, the centre thickness, the glass and the diameter from the catalogue, put the part number in the name, and list parts you are unsure of in the notes. An achromatic doublet is three surfaces, two gaps and two materials.\n- **Ideal lens or microscope objective:** when the prescription is unknown, use a mask with a perfect-lens delay: {\"type\": \"mask\", \"name\": \"Objective, f 3 mm, NA 0.8\", \"length\": 2 × f × tan(asin(NA)), \"delay\": \"-(sqrt(r^2+9)-3)/lambda\"}. Here 9 is f² and 3 is f, in mm; the length is the entrance pupil's diameter. It focuses without aberration, and a screen at its focus shows the vector focal field.\n- **Gaussian laser:** {\"type\": \"source\", \"gauss\": true, \"w0\": waist radius mm, \"z0\": mm to the waist, \"wavelength\": nm, \"power\": mW, \"pol\": \"s\", \"rays\": 1, \"width\": 2 × w0}. To see the diffracted beam, give the file \"light\": {\"field\": true} (it is the bench's, for every source), and use a few rays (1 to 5) with gauss.\n- **Collimated launch from a fibre:** a fibre tip (\"fibre\") joined to a fibre network, facing a lens one focal length away.\n- **Two beams from one laser:** give the second source \"splitFrom\": the first's id. They then interfere, with \"splitPhase\" (degrees) and \"splitPath\" (mm of extra fibre) between them, and fringes wash out over the laser's \"coh\".\n- **Beam dump:** a small screen facing the beam. A closed stop masks the field, but the thin guide line of a Gaussian beam still passes it.\n- **Cavity:** two or more mirrors facing each other. The tool finds it, reports finesse, FSR, modes and stability, and solves the steady state. Set \"maxBounces\" to about 40 and \"minPower\" to 1e-4.\n- **Photodiode signals:** a \"detector\" (free space) or an fcomp \"pd\" (fibre) reads DC and beat notes. \"demodF\" in MHz mixes the output down: with an EOM at the same frequency on the light going to a cavity, the reflected light gives a Pound–Drever–Hall error signal.\n- **Short pulses:** give a source (or a fibre laser) \"tau\" in fs, with \"pshape\", \"rep\" and \"power\" as the average power. Glass, prisms, gratings, chirped mirrors (\"gdd\" on a mirror) and fibres then disperse it, and screens and detectors show the pulse that arrives: its duration, chirp (GDD, TOD) and arrival time. A grating compressor is two parallel gratings facing each other, the order chosen by \"blaze\"; a prism compressor is two equilateral prisms near minimum deviation, the second turned by 180 degrees with its faces parallel to the first's. Use few rays (1 to 3): each pulsed source also traces 33 reference rays across its spectrum.\n- **A laser from parts:** a gain element (\"g0\", \"isat\", \"centre\" on the lasing line) between two mirrors, one partly transmitting, and a weak seed source at the lasing wavelength to find the cavity. Above threshold the output leaves the partly transmitting mirror as a beam.\n- **Vapour cell spectroscopy:** a \"cell\" on the beam, the source's wavelength on the line in vacuum nm. For saturated absorption, a weak probe and a strong pump from one laser (\"splitFrom\") crossing the cell in opposite directions along the same line, the probe onto a detector. A magnetic field along the cell (\"bField\", gauss) splits the lines: for a DAVLL lock, a linearly polarised probe through a cell at about 50 to 100 G, a quarter-wave plate at 45 degrees, a polarising cube and a detector on each port; for a Faraday filter, the cell (heated, a few hundred gauss) between crossed polarisers. Polarisation spectroscopy needs no field: a circularly polarised pump (a quarter-wave plate on it) against a linearly polarised probe, the probe then through a cube at 45 degrees onto two detectors.\n- **Higher-order and vortex beams:** give a Gaussian source \"tem\": \"hg\" with \"hm\" and \"hn\", or \"tem\": \"lg\" with \"lp\" and \"ll\" (the vortex charge); \"w0\" is the waist of the Gaussian the mode is built on. For an SLM, use a mask: \"delay\" \"theta/(2*pi)\" is a spiral phase plate of charge 1, \"mod(x/0.1 + theta/(2*pi), 1)\" a fork hologram of period 0.1 mm, and \"mod(x/0.1, 1)\" a blazed grating. Raise the source's \"popN\" if the tool flags the mask's detail as finer than its grid.\n- **Optical traps (atoms, nanoparticles):** focus the trapping light and put a small screen at the focus with \"absorb\": false and \"trap\" set to the atom (\"Rb87\", \"Cs133\" and so on) or to \"sphere\" with \"trapMat\", \"trapR\" (nm) and \"trapMed\". Its Trap tab finds where the particle sits and gives the depth, trap frequencies each way and scattering, from every beam through the screen's region (so two counter-propagating beams of one laser make a standing-wave trap). For a sphere in water, put the focus inside a block of \"Water\" so the optics are right too.\n- **Aberrations of an imaging system:** a fan source (collimated for an object at infinity, or with a \"divergence\" for a point object), the optics, and a screen at the image. The screen's Aberrations tab sweeps the source across the field (\"abAng\" degrees, or \"abH\" mm of object height) and gives Seidel's coefficients (W040, W131, W22T, W311), Zernike terms along the meridian, spot diagrams, field curvature and distortion, for the tangential section. Put a \"stop\" where the system's aperture stop is (in front of, between or behind the lenses): each field's chief ray is aimed through its centre.\n- **Frequency doubling:** a Gaussian laser focused into an \"nlc\" (a periodically poled crystal: \"material\" \"ppln\" or \"ppktp\", \"nlLen\" mm, \"temp\" °C, \"axis\" the polarisation that converts), its waist in the crystal's middle (the crystal is a block of index n, about 2.1 for PPLN, so a focus aimed at its middle in air lands further in: aim L/(2n) past its entrance face); leave \"period\" at 0 for the best period for that beam, or give it in µm (then the temperature tunes it). The second harmonic leaves as its own beam; separate it with a short-pass \"filter\". Focus so the crystal is about 2.84 confocal parameters long for the most harmonic.\n- **Self-phase modulation and solitons:** a pulsed fibre laser (\"tau\", \"rep\", \"power\") into fibre long and strong enough for a nonlinear phase (standard fibre has \"gamma\" 1.3 /(W km)); the fibre tip's beam carries the reshaped spectrum to a screen's Pulse tab. Anomalous dispersion (standard fibre at 1.55 µm) with peak power |β₂|/(γT₀²) makes a soliton.\n- **Fibre amplifier:** an fcomp \"amp\" between fibres; its spontaneous emission reaches the fibre photodiodes and sets their noise.\n- **Millimetre waves (RF):** a feed horn is a source with \"mmw\": {\"kind\": \"corrugated\" (or \"smooth\", \"diagonal\", \"gauss\"), \"ghz\": frequency, 1 to 3000, \"dbm\": power, \"a\": aperture radius mm, \"L\": slant length mm}; it sets its own wavelength, waist and power, so leave those out. A receiving horn is a detector with \"mmw\": {\"kind\", \"a\", \"L\"}, \"material\": \"custom\" and \"resp\" in A/W; it reads the power its mode takes in. An RF lens is a lens with \"mmw\": {}, drawn white, and takes the RF dielectrics as its glass: \"HDPE\", \"PTFE\", \"Rexolite\", \"TPX\", \"HR silicon\", \"Fused quartz (RF)\", \"Alumina\", \"Nylon\". Other parts (mirrors, polarisers as wire grids, screens as loads) are used as they are; give them \"mmw\": {} to list them under the RF tab. An optical source cannot go past 1 mm (1e6 nm).\n- **Several tabs:** give \"benches\" and each element's \"bench\". Join tabs with two \"link\" elements sharing a \"pair\" name (free space), or two fibre feedthroughs (fcomp \"thru\") sharing a \"pair\" (fibre).\n\n## Checklist\n\nBefore you answer, check each of these:\n\n- [ ] Every element's \"type\" and every field is in the reference below, spelt exactly, with values in range and the listed options for strings.\n- [ ] Every \"id\" is unique; every fibre end and \"splitFrom\" names an existing element; every fibre uses a port that exists, and no port twice.\n- [ ] Every angle follows the rules above. Trace the main beam by hand, element by element, and check where it goes after each one.\n- [ ] Mirrors face the light they reflect, and screens and detectors face the light they catch.\n- [ ] Distances and focal lengths match the source material, and lenses sit at the right distance from foci and waists.\n- [ ] No two elements share a position (x, y and height); elements are not inside each other. Parts one over the other, such as a periscope's two mirrors, differ in \"z\".\n- [ ] \"notes\" records the source, every assumption, anything simplified to fit the plane, and parts to check.\n- [ ] The output is a single valid JSON object: no comments, no trailing commas.\n\n## The import report\n\nWhen a file is opened, JEKray2D lists anything it could not use as written: an unknown type or field, a value out of range, an unknown glass (which falls back to n = 1.5), a fibre that could not be joined, a link plane without a partner, two elements in one place (the same x, y and height). The person can copy this report back to you. Fix every item and give the whole corrected file again.\n\n## Part packs\n\nA person may instead ask for a **part pack**: a set of ready-made parts and glasses (a catalogue, a course kit) that they install with **File \u2192 Part packs\u2026** and then add from **+ Add part \u2192 Packs**. A pack is one JSON object, {\"format\": \"jekpack\", \"version\": 1, \"id\": \"maker.name\" (2 to 64 lower-case letters, digits, dots, dashes or underscores), \"name\", \"author\", \"packVersion\", \"description\", \"licence\", \"glasses\": [{\"glass\": a name, \"table\": {\"wl\": [\u00b5m], \"n\": [...]}} or {\"glass\", \"nd\", \"vd\"}], \"parts\": [{\"name\", \"summary\", \"group\", \"elements\": [elements exactly as in a .jekray file, positioned about (0, 0)], \"fibres\": [...]}]}. A material naming one of the pack's glasses gets its data. Packs hold data only: never add \"code\" or \"scripts\", which make the tool refuse the pack.\n";

