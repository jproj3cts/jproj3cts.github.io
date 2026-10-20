/* ==========================================================================
   JEKray without the page: the same engine the bench runs, in Node.
   import { openBench } from './headless.mjs' (or from a bench file: openFile), then trace it, read its screens,
   detectors and antennas, set a part's parameter and trace again, or sweep one and get a table. Nothing here
   draws; everything is the number the panel would show. The docs: /jek/docs/jekray/scripting/.
   ========================================================================== */
import fs from 'node:fs';
import { workerShim } from './src/worker/shim.js';

let ENGINE = null;
/* the engine, loaded once: the page's stand-ins first (the modules reach for the page as they load), then the modules */
export async function engine() {
  if (ENGINE) return ENGINE;
  globalThis.self = globalThis;
  if (!globalThis.location) globalThis.location = { hostname: '', hash: '', search: '', href: '' };
  workerShim();
  const [ST, EL, TRACE, SS, FF, ANT, DET, CAV, PRM, LD, RF, RS, HORN, LA, ASM, ZMX, LO, LE, SPEC] = await Promise.all([
    import('./src/state/project.js'), import('./src/state/elements.js'), import('./src/engines/trace.js'), import('./src/engines/screen-stats.js'),
    import('./src/engines/fibre-face.js'), import('./src/engines/antenna-field.js'), import('./src/engines/detector.js'), import('./src/engines/cavity.js'),
    import('./src/state/params.js'), import('./src/engines/lens-design.js'), import('./src/engines/rf-design.js'), import('./src/engines/rf-sweep.js'), import('./src/core/horns.js'),
    import('./src/engines/lens-analysis.js'), import('./src/core/assembly.js'), import('./src/io/zmx-export.js'), import('./src/engines/lens-opt.js'), import('./src/engines/lens-engine.js'), import('./src/engines/spectrometer.js')]);
  ENGINE = { ST, EL, TRACE, SS, FF, ANT, DET, CAV, PRM, LD, RF, RS, HORN, LA, ASM, ZMX, LO, LE, SPEC };
  return ENGINE;
}
const round = (v, p = 6) => (typeof v === 'number' && isFinite(v) ? +v.toPrecision(p) : v);
const plain = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? round(v) : v instanceof Float64Array || v instanceof Float32Array ? Array.from(v, x => round(x)) : v)));

/* a bench, opened from its data (the object a .jekray file holds); one bench is open at a time */
export async function openBench(data) {
  const E = await engine();
  E.EL.loadProject(JSON.parse(JSON.stringify(data)));
  let traced = false;
  const byName = name => { const el = E.ST.project.elements.find(e => e.name === name || e.id === name); if (!el) throw new Error('No part called ' + JSON.stringify(name)); return el; };
  const asmByName = name => { const A = E.ST.project.assemblies || [], a = name ? A.find(x => x.name === name || x.id === name) : A.find(x => x.kind === 'rf') || A[0]; if (!a) throw new Error(name ? 'No assembly called ' + JSON.stringify(name) : 'No assembly on this bench'); return a; };
  const ensure = () => { if (!traced) B.trace(); };
  const B = {
    /* trace the bench: the rays and beams, what was dropped or absorbed */
    trace() {
      E.TRACE.setLastTraceKey(null); E.TRACE.traceScene(); traced = true;
      const T = E.TRACE.lastTrace;
      return plain({ rays: T.rays.length, rayPower: T.rays.reduce((a, r) => a + r.w, 0), beams: T.beams.length, dropped: T.dropped, absorbed: T.absorbed, truncated: !!T.truncated });
    },
    /* the parts: name, type and place */
    elements() { return E.ST.project.elements.map(e => ({ name: e.name, type: e.type, x: e.x, y: e.y, angle: e.angle })); },
    element(name) { return plain(byName(name)); },
    /* a parameter by its path (as the panels and sweeps name it: "x", "surfaces.0.R", "mmw.ghz"); setting one traces again */
    get(name, path) { return E.PRM.getPath(byName(name), path); },
    set(name, path, v) { E.PRM.setParam(byName(name), path, v); traced = false; return this; },
    /* a screen's spot: count, centroid, rms, full width and the rest */
    screen(name) { ensure(); return plain(E.SS.screenStats(byName(name))); },
    /* a photodetector's or receiving horn's reading */
    detector(name) { ensure(); const el = byName(name), r = E.FF.detectorReading(el); return plain({ mw: r.mw, V: r.V, snr: r.snr, ifMw: r.ifMw, mds: r.mds, field: r.field }); },
    /* a spectrometer's reading: the peak and its width (nm), the resolution, the power through its entrance (mW) and its share, counts, SNR */
    spectrometer(name) { ensure(); const r = E.SPEC.specReading(byName(name)); return plain({ peak: r.peak, fwhm: r.fwhm, resolution: r.R, mw: r.mw, share: r.share, counts: r.counts, saturated: r.sat, snr: r.snr, lines: r.lines.map(L => ({ nm: L.nm, mw: L.mw })) }); },
    /* an RF lens, disc or mirror on its axis as an antenna, from the bench's diffracted field */
    antenna(name) { ensure(); const A = E.ANT.antennaNow(byName(name), 'ant'); return A && plain({ Gdbi: A.Gdbi, Ddbi: A.Ddbi, hpbw: A.hpbw, hpbwY: A.hpbwY, lobe: A.lobe, eta: A.eta, hornDbi: A.hornDbi, focus: A.focus, farField: A.farField, beam: A.beam, feed: A.feed }); },
    /* a lens's paraxial focal lengths at a wavelength (nm; the bench's first source's when left out) */
    paraxial(name, nm) { const el = byName(name); return plain(E.TRACE.paraxial(el, nm || (E.EL.benchNms()[0] || 587.6))); },
    /* a receiving horn against frequency, and its link budget (RF) */
    rfSweep(name) { ensure(); return plain(E.RS.rfSweep(byName(name))); },
    linkBudget(name) { ensure(); return plain(E.RS.linkBudget(byName(name))); },
    /* ---------- the lens designer: an assembly's prescription and analyses ---------- */
    /* the assemblies on the bench: name, kind (lens or rf) and their parts */
    assemblies() { return (E.ST.project.assemblies || []).map(a => ({ name: a.name, kind: a.kind === 'rf' ? 'rf' : 'lens', parts: E.ASM.asmMembers(a).map(e => e.name) })); },
    /* its prescription as the designer reads it: surfaces (R, k, aspheric terms, semi-aperture), gaps, materials, the stop */
    prescription(asmName) { const P = E.LD.designPrescription(asmByName(asmName)); return plain({ surfaces: P.surfaces, gaps: P.gaps, materials: P.materials, stopIndex: P.stopIndex, image: P.image }); },
    /* first order: focal lengths, the entrance pupil, the working F-number and NA, at the primary wavelength (or nm) */
    lens(asmName, nm) {
      const asm = asmByName(asmName), P = E.LD.designPrescription(asm), A = E.LA.anaSystems(asm, P), w = nm || A.nm0;
      // (a design with mirrors in it, a telescope's, is followed along the light's own path: the bench's probe rays down its middle meet its secondary)
      const px = P.folded ? E.LE.lensSystem(P, w, {}).par : E.ASM.asmParaxial(P, w, E.TRACE.paraxial);
      return plain({ nm: w, efl: px.efl, bfl: px.bfl, epd: A.epd, fNumber: A.fw, na: A.na, finite: A.finite, fields: A.c.fields.map(f => f.deg), waves: A.c.waves.map(x => x.nm) });
    },
    /* the spot at a field angle (degrees; an object height for a finite object): rms and largest radius, the Airy radius */
    spot(asmName, deg, n) { const asm = asmByName(asmName), A = E.LA.anaSystems(asm, E.LD.designPrescription(asm)), S = E.LA.spotDiagram(A, deg || 0, n); return plain({ deg: S.deg, rms: S.rms, geo: S.geo, airy: S.airy, centroid: S.centroid, rays: S.rays, lost: S.waves.reduce((a, w) => a + w.lost, 0) }); },
    /* the wavefront at a field angle, at the primary wavelength (or wave index wi): rms and peak-to-valley in waves, the first Zernike terms */
    wavefront(asmName, deg, wi) { const asm = asmByName(asmName), A = E.LA.anaSystems(asm, E.LD.designPrescription(asm)), W = E.LA.wavefrontMap(A, deg || 0, wi); return plain({ deg: W.deg, nm: W.nm, rms: W.rms, pv: W.pv, zernike: W.coef }); },
    /* the diffraction MTF at a field angle: tangential and sagittal at the frequencies given (cycles/mm), and the cutoff */
    mtf(asmName, deg, freqs) {
      const asm = asmByName(asmName), A = E.LA.anaSystems(asm, E.LD.designPrescription(asm)), M = E.LA.mtfAnalysis(A, deg || 0);
      const at = nu => { const i = M.freqs.findIndex(f => f >= nu); if (i < 0) return [0, 0]; if (i === 0) return [M.tan[0], M.sag[0]]; const f = (nu - M.freqs[i - 1]) / (M.freqs[i] - M.freqs[i - 1]); return [M.tan[i - 1] + f * (M.tan[i] - M.tan[i - 1]), M.sag[i - 1] + f * (M.sag[i] - M.sag[i - 1])]; };
      const fs = freqs && freqs.length ? freqs : [10, 20, 50, 100].filter(v => v < M.cutoff);
      return plain({ deg: M.deg, cutoff: M.cutoff, at: fs.map(nu => { const [t, s] = at(nu); return { nu, tan: t, sag: s }; }) });
    },
    /* field curvature (tangential and sagittal focus shift, mm) and distortion (%) across the field */
    fieldCurves(asmName) { const asm = asmByName(asmName); return plain(E.LA.fieldCurves(E.LA.anaSystems(asm, E.LD.designPrescription(asm)))); },
    /* relative illumination across the field, and the vignetting */
    relIllum(asmName) { const asm = asmByName(asmName); return plain(E.LA.relIllum(E.LA.anaSystems(asm, E.LD.designPrescription(asm)))); },
    /* the designer's merit function, as its optimiser scores the design */
    merit(asmName) { const asm = asmByName(asmName); return plain(E.LO.meritReport(E.LO.optProblem(asm, E.LD.designPrescription(asm))).merit); },
    /* parts (or an assembly's) as a lens file: the text, and any warnings */
    zmx(names, nms) { const els = (Array.isArray(names) ? names : [names]).map(byName), out = E.ZMX.zmxExport(els, nms); return { name: out.name, text: out.text, warnings: [...out.warnings] }; },
    /* the Gaussian beams arriving at a part's face: each one's q, direction and power (the bench's beam view) */
    arrivals(name) { ensure(); return plain(E.FF.faceArrivals(byName(name)).map(A => ({ qx: A.qx, qy: A.qy, u0: A.u0, ldx: A.ldx, ldy: A.ldy, opl: A.opl, J: A.J }))); },
    /* the RF designer's figures for an RF assembly at a frequency (GHz; its design frequency when left out) */
    rf(asmName, ghz) {
      const asm = asmByName(asmName), P = E.LD.designPrescription(asm); E.RF.rfSyncCond(asm, P);
      const t = E.RF.rfTrace(asm, P, ghz || asm.rf.ghz);
      return plain({ ghz: t.ghz, gain: t.gain, eff: t.eff, apEff: t.apEff, refl: t.refl, absorb: t.absorb, spill: t.spill, phaseEff: t.phaseEff, sigma: t.sigma, shadow: t.shadow, coupling: t.coupling, waist: t.waist, theta: t.theta, D: t.D });
    },
    rfBand(asmName) { const asm = asmByName(asmName), P = E.LD.designPrescription(asm); E.RF.rfSyncCond(asm, P); const b = E.RF.rfBand(asm, P); return plain({ lo: { ghz: b.lo.ghz, gain: b.lo.gain, eff: b.lo.eff }, mid: { ghz: b.mid.ghz, gain: b.mid.gain, eff: b.mid.eff }, hi: { ghz: b.hi.ghz, gain: b.hi.gain, eff: b.hi.eff } }); },
    /* the cavities the trace finds: surfaces, FSR, finesse */
    cavities() { ensure(); return plain(E.CAV.findCavities().map(c => ({ surfaces: c.surfaces.length, fsr: c.fsr, finesse: c.finesse }))); },
    /* a sweep: the part's parameter set to each value, the bench traced, read(bench) recorded; the parameter is put back after */
    sweep(name, path, values, read) {
      const el = byName(name), was = E.PRM.getPath(el, path), rows = [];
      try { for (const v of values) { this.set(name, path, v); rows.push({ value: v, ...read(this) }); } }
      finally { E.PRM.setParam(el, path, was); traced = false; }
      return rows;
    },
    /* the bench as a .jekray object */
    serialize() { return JSON.parse(JSON.stringify(E.ST.project)); },
  };
  return B;
}
/* a bench from a .jekray file */
export async function openFile(path) { return openBench(JSON.parse(fs.readFileSync(path, 'utf8'))); }
/* a:b:n (n values from a to b), or a comma-separated list */
export function parseValues(s) {
  if (/^[^,]+:[^,]+:\d+$/.test(s)) { const [a, b, n] = s.split(':').map(Number); return Array.from({ length: n }, (_, i) => (n > 1 ? a + (b - a) * i / (n - 1) : a)); }
  return s.split(',').map(Number);
}
