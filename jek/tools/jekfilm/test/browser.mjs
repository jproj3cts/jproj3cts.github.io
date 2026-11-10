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
      await p.click('#filmNeedle'); await p.waitForFunction(() => !document.getElementById('filmNeedle').disabled, null, { timeout: 15000 }).catch(() => {});
      const nd = await p.evaluate(() => ({ n: window.JEKfilm.film().layers.length, toast: document.getElementById('filmToast').textContent }));
      ok('Add layers (needle): layers put in where they help, or said that none does', nd.n >= 3 && /^Merit .* layers$|^No layer added helps/.test(nd.toast), JSON.stringify(nd));
      if (nd.n > 3) { await p.click('#btnUndo'); await p.waitForTimeout(100); }
      const undone = await p.evaluate(() => window.JEKfilm.film().layers.map(L => L.d));
      ok('A preset, then Optimise thicknesses: the merit falls; Undo puts the thicknesses back', before === 3 && /^Merit .* to .* in \d+ tries$/.test(opt.toast) && JSON.stringify(opt.d) !== JSON.stringify(undone) && undone.length === 3, JSON.stringify([opt, undone]));
      await p.selectOption('select[aria-label="What the coating is for"]', 'edge');
      const edge = await p.evaluate(() => ({ turns: !!document.querySelector('input[aria-label="Edge wavelength (nm)"]'), passes: !!document.querySelector('select[aria-label="Which side passes"]') }));
      ok('A dichroic edge asks where it turns and which side passes', edge.turns && edge.passes, JSON.stringify(edge));
      await p.selectOption('select[aria-label="How the angles are judged"]', 'band'); await p.waitForTimeout(100);
      const band = await p.evaluate(() => ({ from: (document.querySelector('input[aria-label="Smallest angle of incidence (degrees)"]') || {}).value, to: (document.querySelector('input[aria-label="Largest angle of incidence (degrees)"]') || {}).value,
        rows: [...document.querySelectorAll('#filmFigures tbody th')].map(t => t.textContent), angs: [...document.querySelectorAll('#filmAngleFigures tbody th')].map(t => t.textContent), spec: window.JEKfilm.spec() }));
      ok('Angles as a band: from and to (40° to 50° to start), judged and shown there', band.from === '40' && band.to === '50' && band.spec.theta0 === 40 && band.spec.theta === 50 && band.rows.join() === '40°,50°' && band.angs.join() === '0°,40°,50°', JSON.stringify(band));
      await p.selectOption('select[aria-label="How the angles are judged"]', 'upto');
      await p.selectOption('select[aria-label="A preset stack"]', 'agp'); await p.waitForTimeout(100);
      const ag = await p.evaluate(() => ({ cells: [...document.querySelectorAll('#filmLayers tbody tr.film-metal td')].map(t => t.textContent), sel: [...document.querySelectorAll('#filmLayers tbody tr.film-metal select')].map(s => s.value), R: document.getElementById('filmFigures').innerText }));
      ok('Protected silver: the silver layer marked a metal, its n − ik at λ₀ shown, no quarter waves for it', ag.sel.join() === 'metal:Ag' && /^0\.\d{3} − \d\.\d{3}i$/.test(ag.cells[2]) && ag.cells[4] === '—', JSON.stringify(ag));
      await p.selectOption('select[aria-label="The substrate"]', 'g:Germanium');
      ok('Germanium in the visible: said to be opaque there', /Germanium is not transparent at 550 nm/.test(await p.evaluate(() => document.querySelector('.film-warn') ? document.querySelector('.film-warn').textContent : '')), 'no warning');
      await p.evaluate(c => window.JEKfilm.load(c), COATING);
      const l = await p.evaluate(() => ({ name: document.getElementById('filmName').value, rows: document.querySelectorAll('#filmLayers tbody tr').length, fig: document.getElementById('filmAngleFigures').innerText, heads: [...document.querySelectorAll('#filmFigures thead th')].map(t => t.textContent), csv: window.JEKfilm.csv().split('\r\n').slice(0, 2) }));
      ok('A coating opened: its name, layers and figures at its design wavelength; its curves as CSV with units', l.name === 'V-coat 1064' && l.rows === 2 && /At λ₀ = 1064 nm/.test(l.fig) && l.heads.join('|') === 'Angle|R mean (%)|R max (%)|R min (%)' && l.csv[0] === '﻿wavelength (nm),R square on (%),target R (%)' && /^1000,/.test(l.csv[1]), JSON.stringify(l));
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
      // a coating through a link (no accounts here: the coating in the link itself) and back
      const link = await p.evaluate(async () => { const before = JSON.stringify(window.JEKfilm.film()); const h = await window.JEKfilm.shareHash(); window.JEKfilm.load({ format: 'jekfilm', version: 1, name: 'Other', layers: [] }); await window.JEKfilm.openHash(h); return { kind: h[0], same: JSON.stringify(window.JEKfilm.film()) === before, len: h.length }; });
      ok('A coating through a share link and back is the same coating (deflated, “f”)', link.kind === 'f' && link.same, JSON.stringify(link));
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
      ok('Its picture sent for JEKsuite', api.calls.includes('PUT /v1/benches/c1/thumb'), api.calls.join(' '));
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
      // a short link: made with JEKrayPro (/f/<id>), and opened by anyone (#s=<id>) as a copy linked to nothing
      await p.click('#btnFile'); await p.click('#btnShare');
      await p.waitForSelector('#filmShare[open]', { timeout: 3000 }).catch(() => {});
      const url = await p.evaluate(() => (document.getElementById('filmShareUrl') || {}).value), posted = api.bodies.slice(-1)[0];
      ok('Copy a share link…: a short link on /f/, holding the coating', /\/f\/ABCDEFGHJK$/.test(url || '') && posted && posted.data[0] === 'f' && posted.name === 'AR 1064', JSON.stringify([url, posted && posted.name]));
      ok('JEKrayPro: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // a coating marked as a JEKray bench (saved by an API from before JEKfilm): opened here all the same
    {
      const { p, errs } = await page('#cloud=c3', { signedIn: true, pro: true });
      await p.waitForFunction(() => window.JEKfilm.link(), null, { timeout: 8000 }).catch(() => {});
      const o = await p.evaluate(() => ({ name: window.JEKfilm.film().name, link: window.JEKfilm.link(), opened: window.__opened.length }));
      ok('A coating marked JEKray’s by an old API opens in JEKfilm, by its content', o.name === '1550-5%' && o.link && o.link.id === 'c3' && !o.opened, JSON.stringify(o));
      ok('Mismarked coating: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // someone else editing a coating: said, saving refused until taken over; the lease let go when the page goes
    {
      const { p, errs, api } = await page('#cloud=c2', { signedIn: true, pro: true, othersEditing: true });
      await p.waitForSelector('#filmLock[open]', { timeout: 8000 }).catch(() => {});
      const asked = await p.evaluate(() => ({ open: !!document.querySelector('#filmLock[open]'), h: (document.querySelector('#filmLock h2') || {}).textContent, where: document.getElementById('filmWhere').textContent }));
      ok('A coating someone else is editing: who, and look, take over or copy', asked.open && asked.h === 'Sam Reid is editing this coating' && /Sam Reid is editing/.test(asked.where), JSON.stringify(asked));
      await p.click('#flLook');
      await p.click('#filmAddLayer'); await p.keyboard.press('Control+s'); await p.waitForTimeout(300);
      const refused = !api.calls.some(c => c === 'PUT /v1/benches/c2') && await p.evaluate(() => !!document.querySelector('#filmLock[open]'));
      await p.click('#flTake'); await p.waitForTimeout(500);
      const took = api.calls.filter(c => c === 'POST /v1/benches/c2/lease').length >= 2 && api.calls.includes('PUT /v1/benches/c2') && api.benches.c2.version === 3;
      ok('Looking, Ctrl+S saves nothing and asks again; Take over takes the lease and saves', refused && took, JSON.stringify([refused, api.calls.filter(c => /c2/.test(c))]));
      await p.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await p.waitForTimeout(200);
      ok('Leaving the page lets the lease go', api.calls.includes('DELETE /v1/benches/c2/lease'), api.calls.filter(c => /lease/.test(c)).join(' '));
      ok('Editing leases: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // from a JEKray face (#design=…): its glass, wavelength and stack to start; saved to the bench's folder, sent back to the face
    {
      const pass = { seed: { format: 'jekfilm', version: 1, name: 'Window, surface 1 coating', spec: { target: 'ar', sub: { glass: 'Fused silica', n: 1.4496 }, design: 1064, lo: 904, hi: 1224 }, layers: [{ n: 1.38, d: 192.75 }] },
        face: 'fabc123', label: 'Window, surface 1', ws: 'w_me', folder: 'f2' };
      const hash = '#design=' + Buffer.from(JSON.stringify(pass), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const { p, errs, api } = await page(hash, { signedIn: true, pro: true });
      await p.waitForSelector('#filmFor:not([hidden])', { timeout: 8000 }).catch(() => {});
      await p.evaluate(() => { window.__said = []; const ch = new BroadcastChannel('jek-film'); ch.onmessage = e => window.__said.push(e.data); });
      const s = await p.evaluate(() => ({ f: window.JEKfilm.film(), bar: document.getElementById('filmFor').textContent, hash: location.hash }));
      ok('#design=… from a JEKray face: the face’s glass, wavelength and stack, and a line saying which face it is for', s.f.spec.sub.glass === 'Fused silica' && s.f.spec.design === 1064 && s.f.layers.length === 1 && /For JEKray: Window, surface 1/.test(s.bar) && !s.hash, JSON.stringify(s));
      await p.click('#btnFile'); await p.click('#btnCloudSave');
      await p.waitForSelector('#filmCloudNew[open]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(400);
      const place = await p.evaluate(() => [document.getElementById('filmCloudWhere').value, document.getElementById('filmCloudFolder').value]);
      await p.click('#filmCloudMake'); await p.waitForTimeout(500);
      const said = await p.evaluate(() => window.__said), post = api.bodies.slice(-1)[0];
      const gone = await p.evaluate(() => document.getElementById('filmFor').hidden);
      ok('Saved to the cloud: the bench’s own folder chosen, and the coating sent back to that face (its token on jek-film); the line goes', place.join() === 'w_me,f2' && post.folder_id === 'f2'
        && said.length === 1 && said[0].face === 'fabc123' && said[0].id === 'cnew' && gone, JSON.stringify([place, said]));
      ok('From a JEKray face: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // a short link opened signed out: the coating, a copy linked to nothing
    {
      const hash = await (async () => { const p0 = await b.newPage(); await p0.goto(base + '/jek/tools/jekfilm.html?test'); await p0.waitForSelector('#filmLayers'); const hh = await p0.evaluate(async c => { window.JEKfilm.load(c); return window.JEKfilm.shareHash(); }, COATING); await p0.close(); return hh; })();
      const { p, errs } = await page('#s=ABCDEFGHJK', { signedIn: false, links: { ABCDEFGHJK: hash } });
      await p.waitForFunction(() => window.JEKfilm.film().name === 'V-coat 1064', null, { timeout: 8000 }).catch(() => {});
      const o = await p.evaluate(() => ({ name: window.JEKfilm.film().name, layers: window.JEKfilm.film().layers.length, link: window.JEKfilm.link(), hash: location.hash }));
      ok('#s=<id>, signed out: the shared coating opens here, linked to nothing', o.name === 'V-coat 1064' && o.layers === 2 && !o.link && !o.hash, JSON.stringify(o));
      ok('A shared link: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // the coatings JEKray's coating designer kept in this browser: offered in File, each opened as a coating
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 900 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(() => { try { localStorage.setItem('JEK_COATINGS', JSON.stringify([{ id: 'c1', name: 'BBAR 450–650', coat: { mode: 'stack', design: 550, layers: [{ n: 1.38, d: 99.6 }, { n: 2.1, d: 32.7 }, { n: 1.63, d: 84.4 }] }, spec: { target: 'ar', n0: 1, ns: 1.5168, lo: 450, hi: 650, theta: 20, pol: 'avg' } }])); } catch (e) { /* fine */ } });
      await p.goto(base + '/jek/tools/jekfilm.html?test'); await p.waitForSelector('#filmLayers', { timeout: 10000 }).catch(() => {});
      const shown = await p.evaluate(() => { const k = document.getElementById('btnKept'); return k && !k.hidden ? k.textContent : null; });
      await p.click('#btnFile'); await p.click('#btnKept'); await p.waitForTimeout(150);
      await p.evaluate(() => [...document.querySelectorAll('#filmKept button')].find(x => x.textContent === 'Open').click()); await p.waitForTimeout(150);
      const f = await p.evaluate(() => window.JEKfilm.film());
      ok('Coatings kept in JEKray (1)…: one opens as a coating, its layers, band, angles and substrate index kept', /Coatings kept in JEKray \(1\)/.test(shown || '') && f.name === 'BBAR 450–650' && f.layers.length === 3 && f.spec.lo === 450 && f.spec.theta === 20 && f.spec.sub.n === 1.5168, JSON.stringify([shown, f]));
      ok('Kept coatings: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  } finally { await b.close(); }
  return out;
}
