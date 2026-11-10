/* JEKspace in a browser (Playwright), against the stand-in API (fake-api.mjs): what a person sees signed out and
   signed in, and where each thing they do sends them. check(pw, base) returns [{ name, ok, why }]; shots, when
   given a folder, keeps pictures of the page signed in, dark and light. */
import { route } from './fake-api.mjs';

export async function check(pw, base, shots) {
  const out = [], ok = (name, pass, why) => out.push({ name, ok: !!pass, why: pass ? '' : why });
  const b = await pw.chromium.launch();
  try {
    // signed out: the ways in, and the apps
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: false });
      await p.goto(base + '/jek/tools/jekspace.html');
      await p.waitForSelector('#homeSignIn', { timeout: 10000 }).catch(() => {});
      const s = await p.evaluate(() => ({ signIn: !!document.getElementById('homeSignIn'), apps: [...document.querySelectorAll('.rt-happlinks button')].map(a => a.textContent), cards: document.querySelectorAll('.rt-happ').length, appsBtn: !!document.getElementById('homeApps'), btn: document.getElementById('btnAcct').textContent }));
      ok('Signed out: a sign-in panel, and the apps under it as buttons (no cards, no Apps button)', s.signIn && s.apps.join() === 'Open JEKray,Open JEKion,Open JEKfilm' && !s.cards && !s.appsBtn && s.btn === 'Sign in', JSON.stringify(s));
      await p.click('#homeSignIn');
      const menu = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].map(x => x.textContent));
      ok('Signed out: Sign in offers Google, Microsoft and email', ['Continue with Google', 'Continue with Microsoft (university or work)', 'Continue with email'].every(t => menu.includes(t)), menu.join(' | '));
      await p.keyboard.press('Escape');
      await p.evaluate(() => [...document.querySelectorAll('.rt-happlinks button')].find(x => x.textContent === 'Open JEKion').click());
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Signed out: an app opens in its own tab', op && op[0] === '/jek/tools/jekion.html' && op[1] === 'jekion', JSON.stringify(op));
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKray bench').click());
      const nw = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Signed out: New › JEKray bench starts one in the app itself (#new)', nw && nw[0] === '/jek/tools/jekray.html#new', JSON.stringify(nw));
      // an app's launch page, signed out: what it does, the ways to start, and a sign-in line for its benches
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'JEKray').click());
      await p.waitForSelector('.rt-happhead', { timeout: 5000 }).catch(() => {});
      const so = await p.evaluate(() => ({ hash: location.hash, head: !!document.querySelector('.rt-happhead.jekray'), open: !!document.getElementById('appOpen'), signIn: /Sign in to see your JEKray benches/.test(document.getElementById('homeList').textContent), opened: window.__opened.length }));
      ok('Signed out: the rail’s JEKray opens its launch page here, with a sign-in line for its benches', so.hash === '#app=jekray' && so.head && so.open && so.signIn, JSON.stringify(so));
      if (shots) await p.screenshot({ path: shots + '/jekspace-launch-signed-out.png' });
      ok('Signed out: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // signed in: benches of both apps, the filter, opening, New, the account menu, history
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      const calls = await route(p, { signedIn: true });
      await p.addInitScript(() => { try { localStorage.removeItem('jek-home-view'); } catch (e) { /* fine */ } });
      await p.goto(base + '/jek/tools/jekspace.html');
      await p.waitForSelector('.rt-hcard[data-bench]', { timeout: 10000 }).catch(() => {});
      const s = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), tools: [...document.querySelectorAll('.rt-hcard[data-bench] .rt-htool')].map(t => t.textContent),
        folders: document.querySelectorAll('.rt-hcard.folder').length, cards: document.querySelectorAll('.rt-happ').length, acct: document.getElementById('btnAcct').classList.contains('in') }));
      ok('Signed in: the benches of both apps and the folders, no app cards', s.benches.join() === 'b1,b2' && s.tools.join() === 'JEKray,JEKion' && s.folders === 2 && !s.cards && s.acct, JSON.stringify(s));
      if (shots) await p.screenshot({ path: shots + '/jekspace-dark.png' });
      const rail = await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].map(x => x.textContent));
      ok('My benches: no filter by app (the launch pages are), and no folders in the rail (they are in the page)', !(await p.$('#homeApp')) && !rail.includes('Levisense') && !rail.includes('Absorption') && rail.includes('Bin'), rail.join('|'));
      // the rail's JEKion: its launch page here (not a new tab), its benches alone, the last changed picked, Open in JEKion
      const n0 = await p.evaluate(() => window.__opened.length);
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'JEKion').click());
      await p.waitForSelector('.rt-happhead.jekion', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const ion = await p.evaluate(() => ({ hash: location.hash, opened: window.__opened.length, benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench),
        prev: (document.querySelector('#appPreview h3') || {}).textContent, cur: [...document.querySelectorAll('#homeRail button[aria-current=true]')].map(x => x.textContent) }));
      ok('The rail’s JEKion opens its launch page here: its benches alone, the last changed shown beside them', ion.hash === '#app=jekion' && ion.opened === n0 && ion.benches.join() === 'b2' && /Quadrupole trap/.test(ion.prev) && ion.cur.join() === 'JEKion', JSON.stringify(ion));
      if (shots) await p.screenshot({ path: shots + '/jekspace-launch-jekion.png' });
      await p.click('#appPreviewOpen'); await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Open in JEKion: the bench in JEKion’s tab, at #cloud=<id>', op && op[0] === '/jek/tools/jekion.html#cloud=b2' && op[1] === 'jekion', JSON.stringify(op));
      // JEKray's: a click picks a bench (it does not open it), a double-click or Enter opens it; its folders count its benches
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'JEKray').click());
      await p.waitForSelector('.rt-happhead.jekray', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      const n1 = await p.evaluate(() => window.__opened.length);
      await p.click('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(150);
      const ray = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), sel: !!document.querySelector('.rt-hcard[data-bench=b1].sel'), opened: window.__opened.length,
        counts: [...document.querySelectorAll('.rt-hcard.folder .rt-hcount')].map(x => x.textContent), starts: [...document.querySelectorAll('.rt-happhead .rt-btn')].map(x => x.textContent) }));
      ok('JEKray’s launch page: its benches alone, a click picks one, its folders count its benches, its designers to start', ray.benches.join() === 'b1' && ray.sel && ray.opened === n1 && ray.counts.join() === '0 benches,1 bench'
        && ray.starts.join('|') === 'Open JEKray|New bench|Optical design|RF design', JSON.stringify(ray));
      if (shots) await p.screenshot({ path: shots + '/jekspace-launch-dark.png' });
      await p.dblclick('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(150);
      const dbl = await p.evaluate(() => window.__opened.slice(-1)[0]);
      await p.focus('.rt-hcard[data-bench=b1] .rt-hopen'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const ent = await p.evaluate(() => [window.__opened.slice(-1)[0], window.__opened.length]);
      ok('A double-click, or Enter, opens the bench in JEKray', dbl && dbl[0] === '/jek/tools/jekray.html#cloud=b1' && ent[0][0] === '/jek/tools/jekray.html#cloud=b1' && ent[1] >= n1 + 2, JSON.stringify([dbl, ent]));
      // anything else in the rail leaves it; the back button comes back to it
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'My benches' || x.textContent === 'All benches').click());
      await p.waitForTimeout(300);
      const left = await p.evaluate(() => ({ hash: location.hash, head: !!document.querySelector('.rt-happhead'), benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench) }));
      await p.goBack(); await p.waitForTimeout(400);
      const back = await p.evaluate(() => ({ hash: location.hash, head: !!document.querySelector('.rt-happhead.jekray') }));
      ok('My benches in the rail leaves the launch page; Back returns to it', !left.hash && !left.head && left.benches.join() === 'b1,b2' && back.hash === '#app=jekray' && back.head, JSON.stringify([left, back]));
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'All benches' || x.textContent === 'My benches').click());
      await p.waitForTimeout(300);
      await p.click('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(200);
      const op2 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A JEKray bench opens in JEKray’s tab', op2 && op2[0] === '/jek/tools/jekray.html#cloud=b1' && op2[1] === 'jekray', JSON.stringify(op2));
      // New: the apps to open, then five kinds; a JEKion bench made in the cloud, then opened in JEKion
      await p.click('#homeNew');
      const kinds = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].map(x => x.textContent));
      ok('New opens each app, and offers a bench or coating in each app and JEKray’s two designers', kinds.join('|') === 'JEKray|JEKion|JEKfilm|JEKray bench|Optical design (JEKray)|RF design (JEKray)|JEKion bench|JEKfilm coating', kinds.join('|'));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKion').click());
      const opA = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › Open › JEKion: the app in its own tab', opA && opA[0] === '/jek/tools/jekion.html' && opA[1] === 'jekion', JSON.stringify(opA));
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Optical design (JEKray)').click());
      await p.click('#spaceNewMake'); await p.waitForTimeout(400);
      const op3 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › Optical design: a cloud bench made, opened in JEKray into the designer', op3 && op3[0] === '/jek/tools/jekray.html#cloud=bnew:lens' && calls.some(c => c === 'POST /v1/workspaces/w_me/benches'), JSON.stringify(op3));
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKion bench').click());
      await p.click('#spaceNewMake'); await p.waitForTimeout(400);
      const op4 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › JEKion bench: made in the cloud and opened in JEKion', op4 && op4[0] === '/jek/tools/jekion.html#cloud=bnew', JSON.stringify(op4));
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKfilm coating').click());
      const film = await p.evaluate(() => ({ title: document.getElementById('spaceNewTitle').textContent, name: document.getElementById('spaceNewName').value }));
      const posted = p.waitForRequest(r => r.method() === 'POST' && /\/v1\/workspaces\/w_me\/benches$/.test(r.url()));
      await p.click('#spaceNewMake');
      const body = JSON.parse((await posted).postData()); await p.waitForTimeout(300);
      const op5 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › JEKfilm coating: an untitled coating made in the cloud (a .jekfilm) and opened in JEKfilm’s tab', film.title === 'New JEKfilm coating' && film.name === 'Untitled coating' && JSON.parse(body.content).format === 'jekfilm'
        && op5 && op5[0] === '/jek/tools/jekfilm.html#cloud=bnew' && op5[1] === 'jekfilm', JSON.stringify([film, op5]));
      // the account menu: plan, teams, theme
      await p.click('#btnAcct');
      const acct = await p.evaluate(() => document.querySelector('.rt-hmenu').innerText);
      ok('The account menu: plans, teams, billing, theme', /Levitation lab…/.test(acct) && /Create a team…/.test(acct) && /Billing and invoices…/.test(acct) && /Theme/.test(acct), acct.slice(0, 300));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Levitation lab…').click());
      await p.waitForSelector('#teamDialog[open] table', { timeout: 5000 }).catch(() => {});
      ok('A team opens with its members', await p.evaluate(() => document.getElementById('teamDialog').open && /Jo Kelly/.test(document.getElementById('teamBody').textContent)), 'no team dialog');
      await p.click('#teamClose');
      // a bench's history
      await p.click('.rt-hcard[data-bench=b1] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'History').click());
      await p.waitForSelector('.rt-hevs', { timeout: 5000 }).catch(() => {});
      const hist = await p.evaluate(() => document.querySelectorAll('.rt-hev').length);
      ok('A bench’s history: its versions', hist === 2, 'rows ' + hist);
      // the team's workspace
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'Levitation lab').click());
      await p.waitForSelector('.rt-hcard[data-bench=b4]', { timeout: 5000 }).catch(() => {});
      ok('A team’s workspace: its benches', await p.evaluate(() => !!document.querySelector('.rt-hcard[data-bench=b4]')), 'no b4');
      if (shots) {
        await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'My benches').click());
        await p.evaluate(() => { localStorage.setItem('jekray-theme', 'light'); document.documentElement.dataset.rtTheme = 'light'; });
        await p.waitForTimeout(500);
        await p.screenshot({ path: shots + '/jekspace-light.png' });
        await p.evaluate(() => { location.hash = 'app=jekray'; }); await p.waitForTimeout(600);
        await p.screenshot({ path: shots + '/jekspace-launch-light.png' });
        await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
        await p.screenshot({ path: shots + '/jekspace-launch-phone.png', fullPage: true });
        await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(500);
        await p.screenshot({ path: shots + '/jekspace-phone.png' });
      }
      ok('Signed in: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // a link to an app's launch page: #app=jekion
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jekspace.html#app=jekion');
      await p.waitForSelector('.rt-happhead.jekion', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(200);
      const d = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), where: document.getElementById('homeWhere').textContent }));
      ok('#app=jekion opens JEKion’s launch page', d.benches.join() === 'b2' && d.where === 'JEKion' && !errs.length, JSON.stringify(d) + errs.join(' | '));
      await p.close();
    }
    // JEKfilm's launch page: its coatings alone, in their folders, counted as coatings; one opens in JEKfilm
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jekspace.html#app=jekfilm');
      await p.waitForSelector('.rt-happhead.jekfilm', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
      const d = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), counts: [...document.querySelectorAll('.rt-hcard.folder .rt-hcount')].map(x => x.textContent),
        starts: [...document.querySelectorAll('.rt-happhead .rt-btn')].map(x => x.textContent), about: !!document.querySelector('.rt-happhead a') }));
      ok('#app=jekfilm: JEKfilm’s launch page, its coatings counted in their folders, New coating, About JEKfilm', !d.benches.length && d.counts.join() === '1 coating,0 coatings' && d.starts.join('|') === 'Open JEKfilm|New coating' && d.about, JSON.stringify(d));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hcard.folder .rt-hopen')].find(x => /Absorption/.test(x.textContent)).click());
      await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const tag = await p.evaluate(() => { const t = document.querySelector('.rt-hcard[data-bench=b5] .rt-htool'); return t ? [t.textContent, t.className, t.title] : null; });
      await p.click('#appPreviewOpen'); await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A coating in its folder, marked JEKfilm, opens in JEKfilm’s tab', tag && tag[0] === 'JEKfilm' && /jekfilm/.test(tag[1]) && /JEKfilm coating/.test(tag[2]) && op && op[0] === '/jek/tools/jekfilm.html#cloud=b5' && op[1] === 'jekfilm', JSON.stringify([tag, op]));
      if (shots) await p.screenshot({ path: shots + '/jekspace-launch-jekfilm.png' });
      ok('JEKfilm’s launch page: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  } finally { await b.close(); }
  return out;
}
