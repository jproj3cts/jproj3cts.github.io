#!/usr/bin/env node
/* Writes the two files the documentation takes from the tool's own tables: _data/jekray_params.json
   (the docs' parameter tables, docsParams()) and jek/tools/jekray-ai-guide.md (the AI guide,
   aiGuideText()). The browser suite holds both against the tool, so run this after changing a
   part's fields or guide text:
     node docs.mjs            # writes them
     node docs.mjs --check    # says whether they are current, writes nothing */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..');
const PARAMS = path.join(ROOT, '_data/jekray_params.json'), GUIDE = path.join(ROOT, 'jek/tools/jekray-ai-guide.md');
// the modules run as the worker runs them: no page
const { workerShim } = await import('./src/worker/shim.js');
globalThis.self = globalThis;
globalThis.location = { hostname: '', hash: '', search: '', href: '' };
workerShim();
const G = await import('./src/io/guide.js');
// the worked examples the guide quotes, as the page reads them
const ex = {};
for (const k of ['michelson', 'fabry-perot', 'pdh-lock', 'split-laser']) ex[k] = fs.readFileSync(path.join(ROOT, 'jek/tools/demos', k + '.jekray'), 'utf8');
const md = G.aiGuideText(ex), P = G.docsParams();
const oldP = fs.readFileSync(PARAMS, 'utf8'), oldM = fs.readFileSync(GUIDE, 'utf8');
const sameP = JSON.stringify(JSON.parse(oldP)) === JSON.stringify(P), sameM = oldM === md;
if (process.argv.includes('--check')) {
  console.log((sameP ? 'parameter tables current' : 'parameter tables STALE') + '; ' + (sameM ? 'AI guide current' : 'AI guide STALE'));
  process.exit(sameP && sameM ? 0 : 1);
}
// the file's own indent kept
const ind = /^\{\n( +)/.exec(oldP);
if (!sameP) fs.writeFileSync(PARAMS, JSON.stringify(P, null, ind ? ind[1].length : 1) + (oldP.endsWith('\n') ? '\n' : ''));
if (!sameM) fs.writeFileSync(GUIDE, md);
console.log((sameP ? 'parameter tables unchanged' : 'wrote ' + path.relative(ROOT, PARAMS)) + '; ' + (sameM ? 'AI guide unchanged' : 'wrote ' + path.relative(ROOT, GUIDE)));
