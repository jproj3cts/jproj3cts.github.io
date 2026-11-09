/* JEKfilm in a browser (Playwright): the designer on its own (?test, no accounts), then against the stand-in API
   (fake-api.mjs) signed out, with a free account, and with JEKrayPro: what is gated, and the cloud. check(pw, base,
   shots) returns [{ name, ok, why }]; shots, when given a folder, keeps pictures of the page. */
import { COATING, route } from './fake-api.mjs';

export async function check(pw, base, shots) {
  const out = [], ok = (name, pass, why) => out.push({ name, ok: !!pass, why: pass ? '' : why });
  const b = await pw.chromium.launch();
  const page = async (url, opts) => {
    const p = await b.newPage({ viewport: { width: 1300, height: 900 } }), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    const api = opts ? await route(p, opts) : null;
    await p.goto(base + '/jek/tools/jekfilm.html' + url);
    await p.waitForSelector('#filmLayers', { timeout: 10000 }).catch(() => {});
    return { p, errs, api };
  };
  const figures = p => p.evaluate(() => document.getElementById('filmFigures').innerText);
  try {
    // the designer alone: a new coating, the optimiser and undo, a preset, the targets, the curves as CSV
    {
      const { p, errs } = await page('?test');
      const s = await p.evaluate(() => ({ title: document.title, name: document.getElementById('filmName').value, rows: document.querySelectorAll('#filmLayers tbody tr').length, plots: document.querySelectorAll('svg.film-plot path.line').length, f: window.JEKfilm.film() }));
      ok('A new coating: one MgF2 layer on N-BK7, its two plots drawn', s.title === 'Untitled coating | JEKfilm' && s.name === 'Untitled coating' && s.rows === 1 && s.plots === 4 && s.f.layers[0].n === 1.38, JSON.stringify(s));
      await p.selectOption('select[aria-label="A preset stack"]', 'bb3');
      const before = await p.evaluate(() => window.JEKfilm.film().layers.length);
      await p.click('#filmOptimise'); await p.waitForTimeout(200);
      const opt = await p.evaluate(() => ({ toast: document.getElementById('filmToast').textContent, d: window.JEKfilm.film().layers.map(L => L.d) }));
      await p.click('#btnUndo'); await p.waitForTimeout(100);
      const undone = await p.evaluate(() => window.JEKfilm.film().layers.map(L => L.d));
      ok('A preset, then Optimise thicknesses: the merit falls; Undo puts the thicknesses back', before === 3 && /^Merit .* to .* in \d+ tries$/.test(opt.toast) && JSON.stringify(opt.d) !== JSON.stringify(undone) && undone.length === 3, JSON.stringify([opt, undone]));
      await p.selectOption('select[aria-label="What the coating is for"]', 'edge');
      const edge = await p.evaluate(() => ({ turns: !!document.querySelector('input[aria-label="Edge wavelength (nm)"]'), passes: !!document.querySelector('select[aria-label="Which side passes"]') }));
      ok('A dichroic edge asks where it turns and which side passes', edge.turns && edge.passes, JSON.stringify(edge));
      await p.selectOption('select[aria-label="The substrate"]', 'g:Germanium');
      ok('Germanium in the visible: said to be opaque there', /Germanium is not transparent at 550 nm/.test(await p.evaluate(() => document.querySelector('.film-warn') ? document.querySelector('.film-warn').textContent : '')), 'no warning');
      await p.evaluate(c => window.JEKfilm.load(c), COATING);
      const l = await p.evaluate(() => ({ name: document.getElementById('filmName').value, rows: document.querySelectorAll('#filmLayers tbody tr').length, fig: document.getElementById('filmFigures').innerText, csv: window.JEKfilm.csv().split('\r\n').slice(0, 2) }));
      ok('A coating opened: its name, layers and figures at its design wavelength; its curves as CSV with units', l.name === 'V-coat 1064' && l.rows === 2 && /R at 1064 nm/.test(l.fig) && l.csv[0] === '﻿wavelength (nm),R square on (%),target R (%)' && /^1000,/.test(l.csv[1]), JSON.stringify(l));
      // renamed in the bar
      await p.fill('#filmName', 'V-coat, fused silica'); await p.press('#filmName', 'Enter'); await p.waitForTimeout(100);
      ok('Renamed in the bar: the coating and the tab', await p.evaluate(() => window.JEKfilm.film().name === 'V-coat, fused silica' && document.title === 'V-coat, fused silica | JEKfilm'), 'not renamed');
      if (shots) await p.screenshot({ path: shots + '/jekfilm-dark.png' });
      await p.click('#btnTheme'); await p.click('#themeMenu [role=menuitemradio]:nth-child(2)'); await p.waitForTimeout(200);
      ok('The light theme', await p.evaluate(() => document.documentElement.dataset.rtTheme === 'light'), 'still dark');
      if (shots) await p.screenshot({ path: shots + '/jekfilm-light.png' });
      await p.evaluate(() => { try { localStorage.removeItem('jekray-theme'); } catch (e) { /* fine */ } });
      await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(200);
      const wide = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('filmBody').scrollWidth <= document.getElementById('filmBody').clientWidth + 1);
      ok('At phone width: nothing wider than the screen', wide, 'scrolls sideways');
      if (shots) await p.screenshot({ path: shots + '/jekfilm-phone.png', fullPage: true });
      ok('The designer alone: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // signed out: optimising and saving ask to sign in; exporting asks for a free account
    {
      const { p, errs } = await page('', { signedIn: false });
      await p.waitForSelector('#btnAcct', { timeout: 5000 }); await p.waitForTimeout(400);
      const marks = await p.evaluate(() => ({ opt: document.getElementById('filmOptimise').classList.contains('rt-proneed'), save: document.getElementById('btnSaveFile').classList.contains('rt-proneed'), csv: document.getElementById('btnExportCsv').classList.contains('rt-acctneed') }));
      ok('Signed out: Optimise and Save as .jekfilm marked Pro, Export the curves Free account', marks.opt && marks.save && marks.csv, JSON.stringify(marks));
      const d0 = await p.evaluate(() => window.JEKfilm.film().layers[0].d);
      await p.click('#filmOptimise'); await p.waitForTimeout(200);
      const so = await p.evaluate(() => ({ open: !!document.querySelector('#filmSignIn[open]'), h: (document.querySelector('#filmSignIn h2') || {}).textContent, d: window.JEKfilm.film().layers[0].d }));
      ok('Signed out: Optimise asks to sign in, and changes nothing', so.open && so.h === 'Sign in first' && so.d === d0, JSON.stringify(so));
      await p.keyboard.press('Escape');
      await p.click('#btnFile'); await p.click('#btnExportCsv'); await p.waitForTimeout(200);
      ok('Signed out: Export the curves asks for a free account', await p.evaluate(() => (document.querySelector('#filmSignIn[open] h2') || {}).textContent === 'Exporting needs a free account'), 'no prompt');
      ok('Signed out: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // a free account: Pro's work offers the plans
    {
      const { p, errs } = await page('', { signedIn: true, pro: false });
      await p.waitForSelector('#btnAcct.in', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await p.keyboard.press('Control+s'); await p.waitForTimeout(200);
      const s = await p.evaluate(() => ({ h: (document.querySelector('#filmSignIn[open] h2') || {}).textContent, plans: !!document.querySelector('#filmSignIn[open] .rt-btn.primary') }));
      ok('A free account: Ctrl+S (Save as .jekfilm) says JEKrayPro is needed, with the plans', s.h === 'JEKrayPro is needed' && s.plans, JSON.stringify(s));
      ok('A free account: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // JEKrayPro: a cloud coating opened, edited and saved; a new one saved into a folder; another app's bench sent to it
    {
      const { p, errs, api } = await page('#cloud=c1', { signedIn: true, pro: true });
      await p.waitForFunction(() => window.JEKfilm.link(), null, { timeout: 8000 }).catch(() => {});
      const o = await p.evaluate(() => ({ name: window.JEKfilm.film().name, link: window.JEKfilm.link(), where: document.getElementById('filmWhere').textContent, hash: location.hash }));
      ok('#cloud=<id>: the coating opened from the cloud and linked to it', o.name === 'V-coat 1064' && o.link && o.link.id === 'c1' && o.link.version === 3 && o.where === 'In the cloud' && !o.hash, JSON.stringify(o));
      await p.click('#filmAddLayer'); await p.waitForTimeout(100);
      const dirty = await p.evaluate(() => document.getElementById('filmWhere').textContent);
      await p.keyboard.press('Control+s'); await p.waitForTimeout(400);
      const put = api.bodies.slice(-1)[0], saved = await p.evaluate(() => window.JEKfilm.link());
      ok('Edited, then Ctrl+S: saved to the cloud as a version, with three layers', dirty === 'In the cloud, not saved yet' && put && put.checkpoint && JSON.parse(put.content).layers.length === 3 && saved.version === 4 && !saved.dirty, JSON.stringify([dirty, put && put.checkpoint, saved]));
      ok('Its picture sent for JEKspace', api.calls.includes('PUT /v1/benches/c1/thumb'), api.calls.join(' '));
      // a newer version saved elsewhere: the person chooses
      api.benches.c1.version = 9;
      await p.click('#filmAddLayer'); await p.keyboard.press('Control+s'); await p.waitForTimeout(400);
      ok('Saved elsewhere since: asked which to keep', await p.evaluate(() => !!document.querySelector('#filmConflict[open]')), 'no dialog');
      await p.evaluate(() => [...document.querySelectorAll('#filmConflict button')].find(x => x.textContent === 'Keep mine').click()); await p.waitForTimeout(400);
      ok('Keep mine: saved over theirs', await p.evaluate(() => window.JEKfilm.link().version) === 10, 'version ' + await p.evaluate(() => window.JEKfilm.link().version));
      // a new coating, saved into a folder
      await p.click('#btnFile'); await p.click('#btnNew'); await p.waitForTimeout(100);
      await p.click('#btnFile'); await p.click('#btnCloudSave');
      await p.waitForSelector('#filmCloudNew[open]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(300);
      const folders = await p.evaluate(() => [...document.querySelectorAll('#filmCloudFolder option')].map(o => o.textContent));
      await p.selectOption('#filmCloudFolder', 'f2'); await p.fill('#filmCloudName', 'AR 1064'); await p.click('#filmCloudMake'); await p.waitForTimeout(400);
      const post = api.bodies.slice(-1)[0], nl = await p.evaluate(() => window.JEKfilm.link());
      ok('Save to the cloud…: a new coating named and put in a folder (its path shown), then linked', folders.join('|') === 'The top folder|Nd:YAG laser|Nd:YAG laser › Cavity' && post.folder_id === 'f2' && post.name === 'AR 1064'
        && JSON.parse(post.content).format === 'jekfilm' && nl && nl.id === 'cnew', JSON.stringify([folders, post && post.folder_id, nl]));
      if (shots) await p.screenshot({ path: shots + '/jekfilm-cloud.png' });
      // a JEKray bench sent here goes to JEKray
      await p.evaluate(() => { location.hash = 'cloud=b1'; }); await p.waitForTimeout(500);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A JEKray bench’s link opens it in JEKray’s tab', op && op[0] === '/jek/tools/jekray.html#cloud=b1' && op[1] === 'jekray', JSON.stringify(op));
      ok('JEKrayPro: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  } finally { await b.close(); }
  return out;
}
