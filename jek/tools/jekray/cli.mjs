#!/usr/bin/env node
/* JEKray on the command line: trace a bench file and read its screens, detectors and antennas; sweep a parameter to a
   table; the RF designer's figures for an assembly. Everything is printed as JSON (sweeps as CSV with --csv).
     node cli.mjs trace bench.jekray
     node cli.mjs screen bench.jekray "Screen"           detector … "PD"           antenna … "GRIN lens"
     node cli.mjs paraxial bench.jekray "Lens" [--nm 633]
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
  console.log('JEKray headless. Commands: trace, elements, screen, detector, antenna, paraxial, cavities, rf, rfband, rfsweep, linkbudget, sweep.\n' +
    'node cli.mjs <command> bench.jekray [names…] [--ghz G] [--nm N] [--read kind:Name …] [--csv]\nSee /jek/docs/jekray/scripting/');
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
    case 'trace': return b => pick(b.trace());
    default: throw new Error('--read takes screen:, detector:, antenna:, paraxial:, rf: or trace, not ' + spec);
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
