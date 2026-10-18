#!/usr/bin/env node
/* JEKray on the command line: trace a bench file and read its screens, detectors and antennas; sweep a parameter to a
   table; the RF designer's figures for an assembly. Everything is printed as JSON (sweeps as CSV with --csv).
     node cli.mjs trace bench.jekray
     node cli.mjs screen bench.jekray "Screen"           detector … "PD"           antenna … "GRIN lens"
     node cli.mjs paraxial bench.jekray "Lens" [--nm 633]
     node cli.mjs assemblies bench.jekray                prescription … "Triplet"   lens … "Triplet" [--nm 587.6]   merit … "Triplet"
     node cli.mjs spot bench.jekray "Triplet" [--deg 10]  wavefront … [--deg 10]    mtf … [--deg 10] [--freq 20 --freq 50]   fieldcurves … | relillum …
     node cli.mjs zmx bench.jekray "Lens" ["Lens 2" …] [--nm 633] > lens.zmx          arrivals bench.jekray "Screen"
     node cli.mjs rf bench.jekray ["RF"] [--ghz 24]      rfband … ["RF"]          rfsweep … "Receiver"      linkbudget … "Receiver"
     node cli.mjs sweep bench.jekray "Horn" mmw.ghz 20:28:9 --read antenna:"GRIN lens" [--read screen:"Screen"] [--csv]
     node cli.mjs elements bench.jekray                  cavities bench.jekray
   The docs: /jek/docs/jekray/scripting/ */
import { openFile, parseValues } from './headless.mjs';

const args = process.argv.slice(2), opts = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--csv' || a === '--help' || a === '-h') opts[a.replace(/^-+/, '')] = true;
  else if (a.startsWith('--')) { const k = a.slice(2); opts[k] = opts[k] ? [].concat(opts[k], args[++i]) : args[++i]; }
  else pos.push(a);
}
const [cmd, file, ...rest] = pos;
if (!cmd || opts.help || (cmd !== 'help' && !file)) {
  console.log('JEKray headless. Commands: trace, elements, screen, detector, antenna, paraxial, cavities, arrivals, assemblies, prescription, lens, spot, wavefront, mtf, fieldcurves, relillum, merit, zmx, rf, rfband, rfsweep, linkbudget, sweep.\n' +
    'node cli.mjs <command> bench.jekray [names…] [--ghz G] [--nm N] [--deg D] [--freq F …] [--read kind:Name …] [--csv]\nSee /jek/docs/jekray/scripting/');
  process.exit(opts.help || cmd === 'help' ? 0 : 1);
}
const B = await openFile(file);
/* what a --read asks for: kind:Name, kind one of screen, detector, antenna, paraxial, rf (the assembly's name, or none) */
function reader(spec) {
  const i = spec.indexOf(':'), kind = i < 0 ? spec : spec.slice(0, i), name = i < 0 ? undefined : spec.slice(i + 1);
  const flat = (pre, o, out) => { for (const k in o) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) flat(pre + k + '.', v, out); else if (typeof v === 'number' || typeof v === 'string' || v === null) out[pre + k] = v; } return out; };
  const pick = o => flat((name ? name + '.' : kind + '.'), o || {}, {});
  switch (kind) {
    case 'screen': return b => pick(b.screen(name));
    case 'detector': return b => pick(b.detector(name));
    case 'antenna': return b => pick(b.antenna(name));
    case 'paraxial': return b => pick(b.paraxial(name, opts.nm ? +opts.nm : undefined));
    case 'rf': return b => pick(b.rf(name, opts.ghz ? +opts.ghz : undefined));
    case 'lens': return b => pick(b.lens(name, opts.nm ? +opts.nm : undefined));
    case 'spot': return b => pick(b.spot(name, opts.deg ? +opts.deg : 0));
    case 'wavefront': return b => pick(b.wavefront(name, opts.deg ? +opts.deg : 0));
    case 'mtf': return b => { const m = b.mtf(name, opts.deg ? +opts.deg : 0, opts.freq ? [].concat(opts.freq).map(Number) : undefined), o = {}; for (const a of m.at) { o[(name || 'mtf') + '.tan' + a.nu] = a.tan; o[(name || 'mtf') + '.sag' + a.nu] = a.sag; } return o; };
    case 'merit': return b => ({ [(name || 'merit') + '.merit']: b.merit(name) });
    case 'trace': return b => pick(b.trace());
    default: throw new Error('--read takes screen:, detector:, antenna:, paraxial:, rf:, lens:, spot:, wavefront:, mtf:, merit: or trace, not ' + spec);
  }
}
let out;
switch (cmd) {
  case 'trace': out = B.trace(); break;
  case 'elements': out = B.elements(); break;
  case 'screen': out = B.screen(rest[0]); break;
  case 'detector': out = B.detector(rest[0]); break;
  case 'antenna': out = B.antenna(rest[0]); break;
  case 'paraxial': out = B.paraxial(rest[0], opts.nm ? +opts.nm : undefined); break;
  case 'cavities': out = B.cavities(); break;
  case 'assemblies': out = B.assemblies(); break;
  case 'prescription': out = B.prescription(rest[0]); break;
  case 'lens': out = B.lens(rest[0], opts.nm ? +opts.nm : undefined); break;
  case 'spot': out = B.spot(rest[0], opts.deg ? +opts.deg : 0); break;
  case 'wavefront': out = B.wavefront(rest[0], opts.deg ? +opts.deg : 0); break;
  case 'mtf': out = B.mtf(rest[0], opts.deg ? +opts.deg : 0, opts.freq ? [].concat(opts.freq).map(Number) : undefined); break;
  case 'fieldcurves': out = B.fieldCurves(rest[0]); break;
  case 'relillum': out = B.relIllum(rest[0]); break;
  case 'merit': out = B.merit(rest[0]); break;
  case 'zmx': { const z = B.zmx(rest, opts.nm ? [].concat(opts.nm).map(Number) : undefined); if (z.warnings.length) console.error('Note: ' + z.warnings.join('; ')); console.log(z.text); process.exit(0); break; }
  case 'arrivals': out = B.arrivals(rest[0]); break;
  case 'rf': out = B.rf(rest[0], opts.ghz ? +opts.ghz : undefined); break;
  case 'rfband': out = B.rfBand(rest[0]); break;
  case 'rfsweep': out = B.rfSweep(rest[0]); break;
  case 'linkbudget': out = B.linkBudget(rest[0]); break;
  case 'sweep': {
    const [name, path, values] = rest;
    if (!name || !path || !values) throw new Error('sweep takes a part, a parameter path and values (a:b:n or a,b,c)');
    const reads = [].concat(opts.read || ['trace']).map(reader);
    out = B.sweep(name, path, parseValues(values), b => Object.assign({}, ...reads.map(r => r(b))));
    if (opts.csv) {
      const cols = ['value', ...Object.keys(out[0] || {}).filter(k => k !== 'value')];
      console.log(cols.join(',')); for (const r of out) console.log(cols.map(c => r[c] === undefined || r[c] === null ? '' : r[c]).join(','));
      process.exit(0);
    }
    break;
  }
  default: throw new Error('Unknown command ' + cmd);
}
console.log(JSON.stringify(out, null, 1));
