#!/usr/bin/env node
/* Run the tests that cover a change, or all of them.
     node test/run.mjs                      the tests for what has changed since the last commit (the working tree)
     node test/run.mjs --changed main       … since a branch, tag or commit
     node test/run.mjs --areas bench,field  the tests for these areas (test/areas.mjs lists them)
     node test/run.mjs --full               everything
     node test/run.mjs --list               what each area covers, and what would run for the change
     --no-browser  Node tests only      --dry  plan only, run nothing      --port N  serve the repository on this port
   Every fifth smaller run is made a full one (the count is kept in test/.runs.json); --full resets the count. */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, areasOf, planFor } from './areas.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), repo = resolve(root, '../../..');
const args = process.argv.slice(2), flag = n => args.includes(n), val = n => { const i = args.indexOf(n); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : null; };
const FULL_EVERY = 5, runsFile = join(here, '.runs.json');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.stl': 'application/octet-stream', '.zmx': 'text/plain', '.jekray': 'application/json', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const nodeFiles = readdirSync(join(here, 'node')).filter(f => f.endsWith('.test.mjs')).sort();

// what changed: the working tree against a commit (default HEAD), as paths relative to this folder
function changedFiles(ref) {
  const out = execFileSync('git', ['diff', '--name-only', ref || 'HEAD', '--'], { cwd: repo, encoding: 'utf8' }) + execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' });
  return [...new Set(out.split('\n').filter(Boolean))].map(f => relative(root, join(repo, f)).replace(/\\/g, '/'));
}
const runs = existsSync(runsFile) ? JSON.parse(readFileSync(runsFile, 'utf8')) : { smaller: 0 };

let areas, why, extraNode = [];
if (flag('--full')) { areas = null; why = 'asked for everything'; }
else if (val('--areas')) { areas = val('--areas').split(',').map(s => s.trim()).filter(Boolean); why = 'the areas asked for'; }
else {
  const ref = val('--changed'), files = changedFiles(ref), A = areasOf(files);
  areas = A.areas; extraNode = A.node;
  why = files.length ? (areas ? 'the change touches ' + files.length + ' file(s) in: ' + (areas.join(', ') || 'test files only') : A.unclaimed ? 'no area claims ' + A.unclaimed : 'the change touches a shared file') : 'nothing has changed';
  if (!files.length) areas = [];
  if (flag('--list')) { console.log('changed:', files.join(', ') || '(nothing)'); }
}
if (flag('--list')) {
  for (const [k, a] of Object.entries(AREAS)) console.log(`${k.padEnd(12)} ${a.what}\n${''.padEnd(13)}node: ${a.node.join(', ') || '-'}\n${''.padEnd(13)}browser: ${a.browser.join(' | ') || '-'}`);
}
let plan = planFor(areas, nodeFiles, extraNode);
if (!plan.full && runs.smaller >= FULL_EVERY - 1) { plan = planFor(null, nodeFiles); why += `; this is the ${FULL_EVERY}th smaller run in a row, so everything runs`; }
console.log(`plan: ${plan.full ? 'everything' : plan.node.length + ' Node test file(s), ' + plan.browser.length + ' browser group(s)'} (${why})`);
if (!plan.full) { console.log('  node:    ' + plan.node.join(', ')); console.log('  browser: ' + (plan.browser.join(' | ') || '-')); }
if (flag('--dry') || (flag('--list') && !flag('--run'))) process.exit(0);
if (!plan.node.length && !(plan.browser && plan.browser.length) && !plan.full) { console.log('nothing to run'); process.exit(0); }

// the page the browser suite loads is the built one: build first
let failed = false;
const t0 = Date.now();
try { execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' }); } catch { failed = true; console.log('the build failed'); }

// Node tests
if (!failed && plan.node.length) {
  console.log(`\n== Node: ${plan.node.length} file(s)`);
  const r = spawn(process.execPath, ['--test', ...plan.node.map(f => join('test', 'node', f))], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; r.stdout.on('data', d => { out += d; });
  await new Promise(res => r.on('close', code => { const m = /# pass (\d+)\s+# fail (\d+)/.exec(out); console.log(m ? `Node: ${m[1]} passed, ${m[2]} failed` : out.slice(-400)); if (code) { failed = true; console.log(out.split('\n').filter(l => /^not ok/.test(l)).join('\n')); } res(); }));
}

// the browser suite: the chosen groups, on the repository served locally
if (!failed && !flag('--no-browser') && (plan.full || plan.browser.length)) {
  const pw = await loadPlaywright();
  if (!pw) { console.log('Playwright is not installed where Node can find it (npm i -g playwright, or npm i playwright here): the browser suite was not run'); failed = true; }
  else {
    const { server, port } = await serve(+val('--port') || 8765);
    const url = `http://localhost:${port}/jek/tools/jekray-tests.html` + (plan.full ? '' : '?groups=' + encodeURIComponent(plan.browser.join('|')));
    console.log(`\n== browser: ${plan.full ? 'all groups' : plan.browser.length + ' group(s)'} at ${url}`);
    const b = await pw.chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url);
    try { await p.waitForFunction(() => /passed|failed|did not/.test(document.getElementById('summary').textContent), null, { timeout: 1800000 }); } catch { console.log('the browser suite did not finish in 30 minutes'); failed = true; }
    const sum = await p.textContent('#summary'); console.log('browser: ' + sum);
    if (!/^all /.test(sum)) failed = true;
    const bad = await p.$$eval('tbody#rows tr.failed', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 220)));
    bad.slice(0, 30).forEach(x => console.log('  FAIL ' + x));
    errs.slice(0, 10).forEach(e => console.log('  page error: ' + e.slice(0, 200)));
    // the groups' times, for keeping the areas honest
    const times = await p.evaluate(() => (window.__tt && window.__tt.groups) || null);
    if (times) console.log('  slowest groups: ' + Object.entries(times).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, ms]) => `${g} ${(ms / 1000).toFixed(1)}s`).join(' · '));
    await b.close(); server.close();
  }
}
runs.smaller = plan.full ? 0 : runs.smaller + 1;
writeFileSync(runsFile, JSON.stringify(runs));
console.log(`\n${failed ? 'FAILED' : 'passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s` + (plan.full ? '' : ` (smaller run ${runs.smaller} of ${FULL_EVERY}; the next full run is ${FULL_EVERY - runs.smaller} run(s) away)`));
process.exit(failed ? 1 : 0);

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  try { const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); return await import(join(g, 'playwright', 'index.mjs')); } catch {}
  return null;
}
/* the repository as a static site on the port asked for, or the next free one */
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
