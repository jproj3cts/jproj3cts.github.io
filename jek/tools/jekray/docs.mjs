#!/usr/bin/env node
/* Writes the files the documentation takes from the tool: _data/jekray_params.json (the docs' parameter tables,
   docsParams()), jek/tools/jekray-ai-guide.md (the AI guide, aiGuideText()) and jek/docs/jekray/release-notes.md
   (every release note, from news.mjs). The browser suite holds both against the tool, so run this after changing a
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
// the release notes, every one (news.mjs): the docs' own page of them, the tool carrying only the latest
const NOTES = path.join(ROOT, 'jek/docs/jekray/release-notes.md');
const { NEWS_ALL } = await import('./news.mjs');
const ul = items => '<ul>\n' + items.map(t => '<li>' + t + '</li>').join('\n') + '\n</ul>';
const notes = '---\nlayout: docs\ntitle: Release notes\npermalink: /jek/docs/jekray/release-notes/\ndescription: "Every change to JEKray, version by version, the newest first."\n---\n\n' +
  '<p class="dx-lead">Every change to JEKray, version by version, the newest first. The tool shows the latest of them under <strong>Help › What\u2019s new</strong>.</p>\n\n' +
  '<!-- Written by jek/tools/jekray/docs.mjs from jek/tools/jekray/news.mjs. Do not edit: add an entry there. -->\n\n{% raw %}\n' +
  NEWS_ALL.map(([v, date, items, top]) => '## ' + (/^\d/.test(v) ? 'Version ' + v : v) + '\n\n<p class="note">' + date + (items.length > 20 ? ', ' + items.length + ' changes' : '') + '</p>\n\n' +
    (top ? '<h3>The few that matter most</h3>\n\n' + ul(top) + '\n\n<h3>Every change</h3>\n\n' : '') + ul(items)).join('\n\n') + '\n{% endraw %}\n';
const oldN = fs.existsSync(NOTES) ? fs.readFileSync(NOTES, 'utf8') : '', sameN = oldN === notes;
const oldP = fs.readFileSync(PARAMS, 'utf8'), oldM = fs.readFileSync(GUIDE, 'utf8');
const sameP = JSON.stringify(JSON.parse(oldP)) === JSON.stringify(P), sameM = oldM === md;
if (process.argv.includes('--check')) {
  console.log((sameP ? 'parameter tables current' : 'parameter tables STALE') + '; ' + (sameM ? 'AI guide current' : 'AI guide STALE') + '; ' + (sameN ? 'release notes current' : 'release notes STALE'));
  process.exit(sameP && sameM && sameN ? 0 : 1);
}
// the file's own indent kept
const ind = /^\{\n( +)/.exec(oldP);
if (!sameP) fs.writeFileSync(PARAMS, JSON.stringify(P, null, ind ? ind[1].length : 1) + (oldP.endsWith('\n') ? '\n' : ''));
if (!sameM) fs.writeFileSync(GUIDE, md);
if (!sameN) fs.writeFileSync(NOTES, notes);
console.log((sameP ? 'parameter tables unchanged' : 'wrote ' + path.relative(ROOT, PARAMS)) + '; ' + (sameM ? 'AI guide unchanged' : 'wrote ' + path.relative(ROOT, GUIDE)) + (sameN ? '' : '; wrote ' + path.relative(ROOT, NOTES)));
