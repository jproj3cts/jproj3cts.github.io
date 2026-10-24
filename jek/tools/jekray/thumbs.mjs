#!/usr/bin/env node
/* Draws the examples gallery's pictures (demos/thumbs/*.webp, 640 × 400) from the built page, in
   Chromium through Playwright: each example opened, fitted and drawn as the bench draws it, its
   overlays left out. The Light theme's pictures go in demos/thumbs/light/, the Dark theme's in
   demos/thumbs/ itself.
     node thumbs.mjs                     # every example, Light
     node thumbs.mjs --dark              # every example, Dark
     node thumbs.mjs michelson pdh-lock  # just these */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..'), demos = join(repo, 'jek/tools/demos');
const args = process.argv.slice(2), dark = args.includes('--dark'), only = args.filter(a => !a.startsWith('--'));
const ids = only.length ? only : readdirSync(demos).filter(f => f.endsWith('.jekray')).map(f => f.slice(0, -7)).sort();
const out = join(demos, 'thumbs', dark ? '' : 'light');
mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webp': 'image/webp', '.png': 'image/png', '.jekray': 'application/json' };

const server = createServer((req, rs) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(repo, p); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!f.startsWith(repo) || !existsSync(f)) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(rs);
});
await new Promise(r => server.listen(0, r));
const base = 'http://localhost:' + server.address().port;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 1100 }, deviceScaleFactor: 1 });
await page.addInitScript(t => { localStorage.setItem('jekray-theme', t); localStorage.setItem('jek-raytracer-welcomed', '1'); }, dark ? 'dark' : 'light');
// the bench alone: no panel, rail, tabs, switches or notes over it
await page.addInitScript(() => addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent:
  '.rt-grid{grid-template-columns:1fr!important}.rt-app .rt-stage{height:600px!important;min-height:0!important}.rt-panel,.rt-rail,.rt-flyout,.rt-benchtabs,.rt-v3dswitch,.rt-gear,.rt-coords,#minimap,.rt-welcome,.rt-toast,.rt-drawhint{display:none!important}' }))));
await page.goto(base + '/jek/tools/jekray.html');
await page.waitForFunction(() => window.JEKray && document.getElementById('bench'));
// the stage 960 × 600, drawn down to the pictures' 640 × 400: the names as large as in the gallery's first pictures

for (const id of ids) {
  const demo = JSON.parse(readFileSync(join(demos, id + '.jekray'), 'utf8'));
  await page.evaluate(d => { window.JEKray.load(d); document.getElementById('btnFit').click(); }, demo);
  await page.waitForTimeout(2500);
  // a diffracted field still being worked out: waited for (up to 30 s)
  for (let k = 0; k < 60 && await page.evaluate(() => /Computing/.test(document.getElementById('stage').innerText)); k++) await page.waitForTimeout(500);
  await page.waitForTimeout(500);
  const url = await page.evaluate(() => {
    const src = document.getElementById('bench'), c = document.createElement('canvas');
    c.width = 640; c.height = 400;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, 640, 400);
    return c.toDataURL('image/webp', 0.85);
  });
  writeFileSync(join(out, id + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('drew ' + join('demos/thumbs', dark ? '' : 'light', id + '.webp'));
}
await browser.close();
server.close();
