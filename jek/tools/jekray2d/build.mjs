#!/usr/bin/env node
/* Builds jek/tools/jekray2d.html, the page JEKray2D is served as, from the sources here:
   page.html (the markup, with {{STYLE}} and {{SCRIPT}} where they go), style.css, and the
   modules under src/ in the order of order.json. The modules are ES modules; the page joins
   them into one script in one scope, as the tool has always run, so the build drops each
   module's import lines and export keywords and nothing else. The page is committed: run
   `node build.mjs` after editing a module, or `node build.mjs --check` to see it is current.
   The lint checks that every name a module takes from another is imported from where it
   is declared (or listed in src/state/shared.md), so the modules stay honest about what
   they depend on. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blank } from './jstok.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PAGE = path.resolve(HERE, '../jekray2d.html');
const WORKER_LINE = 'if (IN_WORKER) { workerMain(); return; }';     // the worker branch, between the worker's and the page's modules
const read = f => fs.readFileSync(path.join(HERE, f), 'utf8');
export const order = () => JSON.parse(read('order.json'));

/* a module's header (its imports and the shared-state note) and its body: the header is
   everything before the first blank line, when the file opens with an import or the note */
function split(text) {
  const lines = text.split('\n');
  if (!/^(import |\/\/ Shared mutable state)/.test(lines[0])) return { header: '', body: lines };
  const k = lines.indexOf('');
  return { header: lines.slice(0, k).join('\n'), body: lines.slice(k + 1) };
}
/* a module's code as the page carries it */
export function stripModule(text) {
  return split(text).body.map(l => l.startsWith('export ') ? l.slice(7) : l).join('\n');
}
export function build() {
  let script = "(() => {\n'use strict';\n\n";
  for (const f of order()) { script += stripModule(read('src/' + f)); if (f === 'worker/main.js') script += WORKER_LINE + '\n'; }
  script += '})();';
  return read('page.html').replace('{{STYLE}}', () => read('style.css').replace(/\n$/, '')).replace('{{SCRIPT}}', () => script);
}

const DECL = /^(?:async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
/* the names a column-0 declaration line declares (a `const a = 1, b = 2` declares two) */
function declared(line) {
  const m = line.match(DECL);
  if (!m) return null;
  const names = [m[2]];
  if (m[1] === 'const' || m[1] === 'let' || m[1] === 'var') {
    let d = 0, buf = '';
    for (const ch of line.slice(m[0].length)) {
      if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--;
      if (ch === ',' && d === 0) { const n = buf.match(/^\s*([A-Za-z_$][\w$]*)\s*=/); if (n) names.push(n[1]); buf = ''; } else buf += ch;
    }
    const n = buf.match(/^\s*([A-Za-z_$][\w$]*)\s*=/); if (n && !names.includes(n[1])) names.push(n[1]);
  }
  return { kind: m[1], names };
}
/* what each module declares, exports, imports and uses */
export function scan() {
  const mods = new Map();
  for (const f of order()) {
    const { header, body } = split(read('src/' + f)), blanked = blank(body.join('\n')).split('\n');
    const decls = new Map(), exported = new Set(), imports = new Map(), uses = new Set();
    body.forEach((l, i) => { const ex = l.startsWith('export '); const d = declared(ex ? l.slice(7) : l); if (!d) return; for (const n of d.names) { decls.set(n, d.kind); if (ex) exported.add(n); } void i; });
    for (const m of header.matchAll(/import \{([^}]*)\} from '([^']+)';/g)) for (const n of m[1].split(',').map(s => s.trim()).filter(Boolean)) imports.set(n, path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2])));
    for (const s of blanked) for (const w of s.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const n = w[0], pre = s.slice(0, w.index).replace(/\s+$/, ''), post = s.slice(w.index + n.length).replace(/^\s+/, '');
      if (pre.endsWith('.')) continue;                                        // a property
      if (post.startsWith(':') && !post.startsWith('::') && /[{,]$/.test(pre)) continue;   // an object key
      uses.add(n);
    }
    mods.set(f, { decls, exported, imports, uses });
  }
  return mods;
}
export function lint() {
  const errors = [], warnings = [], mods = scan();
  const shared = new Set([...read('src/state/shared.md').matchAll(/^- `([\w$]+)`/gm)].map(m => m[1]));
  const home = new Map();
  for (const [f, m] of mods) for (const [n, kind] of m.decls) { if (home.has(n)) errors.push(n + ' is declared in both ' + home.get(n).f + ' and ' + f); home.set(n, { f, kind }); }
  for (const n of shared) { const h = home.get(n); if (!h) errors.push('shared.md lists ' + n + ', which no module declares'); else if (h.kind !== 'let' && h.kind !== 'var') errors.push('shared.md lists ' + n + ', a ' + h.kind + ', which should be imported instead'); }
  for (const [f, m] of mods) {
    for (const [n, from] of m.imports) {
      const h = home.get(n);
      if (!h) errors.push(f + ' imports ' + n + ', which no module declares');
      else if (h.f !== from) errors.push(f + ' imports ' + n + ' from ' + from + ', but it is declared in ' + h.f);
      else if (!mods.get(h.f).exported.has(n)) errors.push(f + ' imports ' + n + ', which ' + h.f + ' does not export');
      if (!m.uses.has(n)) warnings.push(f + ' imports ' + n + ' and does not use it');
    }
    for (const n of m.uses) {
      if (m.decls.has(n) || m.imports.has(n) || shared.has(n)) continue;
      const h = home.get(n);
      if (h) errors.push(f + ' uses ' + n + ' from ' + h.f + ' without importing it');
    }
  }
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors, warnings } = lint();
  for (const w of warnings) console.warn('warning: ' + w);
  if (errors.length) { for (const e of errors) console.error('error: ' + e); process.exit(1); }
  const html = build();
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(PAGE) && fs.readFileSync(PAGE, 'utf8') === html;
    console.log(same ? 'jekray2d.html is current' : 'jekray2d.html is out of date: run node build.mjs');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(PAGE, html);
  console.log('wrote ' + path.relative(process.cwd(), PAGE) + ', ' + html.length + ' bytes from ' + order().length + ' modules');
}
