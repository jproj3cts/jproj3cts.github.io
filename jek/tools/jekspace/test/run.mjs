#!/usr/bin/env node
/* Run JEKspace's tests: the build (and its lint), the Node tests, then the browser check (test/browser.mjs) on the
   repository served locally, in Playwright, against the stand-in API. --no-browser runs the Node tests only;
   --port N serves on that port; --shots <folder> keeps pictures of the page. */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './browser.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), repo = resolve(root, '../../..');
const args = process.argv.slice(2), flag = n => args.includes(n), val = n => { const i = args.indexOf(n); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : null; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
let failed = false;
const t0 = Date.now();
try { execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' }); } catch { failed = true; console.log('the build failed'); }
if (!failed) {
  const files = readdirSync(join(here, 'node')).filter(f => f.endsWith('.test.mjs')).sort();
  console.log(`\n== Node: ${files.length} file(s)`);
  const r = spawn(process.execPath, ['--test', ...files.map(f => join('test', 'node', f))], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; r.stdout.on('data', d => { out += d; });
  await new Promise(res => r.on('close', code => { const m = /# pass (\d+)\s+# fail (\d+)/.exec(out); console.log(m ? `Node: ${m[1]} passed, ${m[2]} failed` : out.slice(-400)); if (code) { failed = true; console.log(out.split('\n').filter(l => /^not ok/.test(l)).join('\n')); } res(); }));
}
if (!failed && !flag('--no-browser')) {
  const pw = await loadPlaywright();
  if (!pw) { console.log('Playwright is not installed where Node can find it: the browser check was not run'); failed = true; }
  else {
    const { server, port } = await serve(+val('--port') || 8767);
    console.log(`\n== browser: http://localhost:${port}/jek/tools/jekspace.html`);
    const res = await check(pw, `http://localhost:${port}`, val('--shots'));
    const bad = res.filter(r => !r.ok);
    console.log(`browser: ${bad.length ? bad.length + ' failed, ' + (res.length - bad.length) + ' passed' : 'all ' + res.length + ' checks passed'}`);
    for (const r of bad) console.log('  FAIL ' + r.name + ': ' + r.why);
    if (bad.length) failed = true;
    server.close();
  }
}
console.log(`\n${failed ? 'FAILED' : 'passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  try { const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); return await import(join(g, 'playwright', 'index.mjs')); } catch {}
  return null;
}
function serve(port) {
  return new Promise(res => {
    const server = createServer((req, rs) => {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      let f = join(repo, p); if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
      if (!f.startsWith(repo) || !existsSync(f)) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(rs);
    });
    server.on('error', () => serve(port + 1).then(res));
    server.listen(port, () => res({ server, port }));
  });
}
