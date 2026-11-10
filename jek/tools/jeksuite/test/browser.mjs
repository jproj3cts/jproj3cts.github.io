/* JEKsuite in a browser (Playwright), against the stand-in API (fake-api.mjs): what a person sees signed out and
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
      await p.goto(base + '/jek/tools/jeksuite.html');
      await p.waitForSelector('#homeSignIn', { timeout: 10000 }).catch(() => {});
      const s = await p.evaluate(() => ({ signIn: !!document.getElementById('homeSignIn'), apps: [...document.querySelectorAll('.rt-happlinks button')].map(a => a.textContent), cards: document.querySelectorAll('.rt-happ').length, appsBtn: !!document.getElementById('homeApps'), btn: document.getElementById('btnAcct').textContent }));
      ok('Signed out: a sign-in panel, and the apps under it as buttons (no cards, no Apps button)', s.signIn && s.apps.join() === 'Open JEKray,Open JEKion,Open JEKfilm,Open JEKcad' && !s.cards && !s.appsBtn && s.btn === 'Sign in', JSON.stringify(s));
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
      if (shots) await p.screenshot({ path: shots + '/jeksuite-launch-signed-out.png' });
      ok('Signed out: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // signed in: benches of both apps, the filter, opening, New, the account menu, history
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      const calls = await route(p, { signedIn: true });
      await p.addInitScript(() => { try { localStorage.removeItem('jek-home-view'); } catch (e) { /* fine */ } });
      await p.goto(base + '/jek/tools/jeksuite.html');
      await p.waitForSelector('.rt-hcard[data-bench]', { timeout: 10000 }).catch(() => {});
      const s = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), tools: [...document.querySelectorAll('.rt-hcard[data-bench] .rt-htool')].map(t => t.textContent),
        folders: document.querySelectorAll('.rt-hcard.folder').length, cards: document.querySelectorAll('.rt-happ').length, acct: document.getElementById('btnAcct').classList.contains('in') }));
      ok('Signed in: the benches of both apps and the folders, no app cards', s.benches.join() === 'b1,b2' && s.tools.join() === 'JEKray,JEKion' && s.folders === 2 && !s.cards && s.acct, JSON.stringify(s));
      if (shots) await p.screenshot({ path: shots + '/jeksuite-dark.png' });
      const rail = await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].map(x => x.textContent));
      const tree = await p.evaluate(() => [...document.querySelectorAll('#homeRail .rt-htnode .rt-htgo')].map(x => x.textContent));
      const chips0 = await p.evaluate(() => [...document.querySelectorAll('#homeChips .rt-hchip')].map(x => x.textContent));
      ok('My benches: the workspace’s folders as a tree in the rail, each with what it holds, and a chip for each app with benches here', tree.join() === 'Absorption3,Levisense2' && rail.includes('My benches') && rail.includes('Bin') && !rail.includes('All benches') && chips0.join() === 'All2,JEKray1,JEKion1', JSON.stringify([rail, tree, chips0]));
      // the rail's JEKion: its launch page here (not a new tab), its benches alone, the last changed picked, Open in JEKion
      const n0 = await p.evaluate(() => window.__opened.length);
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'JEKion').click());
      await p.waitForSelector('.rt-happhead.jekion', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const ion = await p.evaluate(() => ({ hash: location.hash, opened: window.__opened.length, benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench),
        prev: (document.querySelector('#appPreview h3') || {}).textContent, cur: [...document.querySelectorAll('#homeRail button[aria-current=true]')].map(x => x.textContent) }));
      ok('The rail’s JEKion opens its launch page here: its benches alone, the last changed shown beside them', ion.hash === '#app=jekion' && ion.opened === n0 && ion.benches.join() === 'b2' && /Quadrupole trap/.test(ion.prev) && ion.cur.join() === 'JEKion', JSON.stringify(ion));
      if (shots) await p.screenshot({ path: shots + '/jeksuite-launch-jekion.png' });
      await p.click('#appPreviewOpen'); await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Open in JEKion: the bench in JEKion’s tab, at #cloud=<id>', op && op[0] === '/jek/tools/jekion.html#cloud=b2' && op[1] === 'jekion', JSON.stringify(op));
      // JEKray's: the bench under the pointer is shown beside the list, a click or Enter opens it; its folders count its benches
      await p.evaluate(() => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent === 'JEKray').click());
      await p.waitForSelector('.rt-happhead.jekray', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      const n1 = await p.evaluate(() => window.__opened.length);
      await p.hover('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(150);
      const ray = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), sel: !!document.querySelector('.rt-hcard[data-bench=b1].sel'), opened: window.__opened.length,
        counts: [...document.querySelectorAll('.rt-hcard.folder .rt-hcount')].map(x => x.textContent), starts: [...document.querySelectorAll('.rt-happhead .rt-btn')].map(x => x.textContent) }));
      ok('JEKray’s launch page: its benches alone, the one under the pointer shown (not opened), its folders count its benches (Absorption the one in its folder Old runs), its designers to start', ray.benches.join() === 'b1' && ray.sel && ray.opened === n1 && ray.counts.join() === '1 bench,1 bench'
        && ray.starts.join('|') === 'Open JEKray|New bench|Optical design|RF design', JSON.stringify(ray));
      if (shots) await p.screenshot({ path: shots + '/jeksuite-launch-dark.png' });
      await p.click('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(150);
      const dbl = await p.evaluate(() => window.__opened.slice(-1)[0]);
      await p.focus('.rt-hcard[data-bench=b1] .rt-hopen'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      const ent = await p.evaluate(() => [window.__opened.slice(-1)[0], window.__opened.length]);
      ok('A single click, or Enter, opens the bench in JEKray', dbl && dbl[0] === '/jek/tools/jekray.html#cloud=b1' && ent[0][0] === '/jek/tools/jekray.html#cloud=b1' && ent[1] === n1 + 2, JSON.stringify([dbl, ent]));
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
      // New: only what can be started (opening an app is on its page), a bench in each app first, then JEKray's designers
      await p.click('#homeNew');
      const kinds = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].map(x => x.textContent));
      ok('New offers a bench in each app (a coating in JEKfilm, a part studio in JEKcad), then JEKray’s two designers, and no way to merely open an app', kinds.join('|') === 'JEKray bench|JEKion bench|JEKfilm coating|JEKcad part studio|Optical design (JEKray)|RF design (JEKray)', kinds.join('|'));
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
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKcad part studio').click());
      const cad = await p.evaluate(() => ({ title: document.getElementById('spaceNewTitle').textContent, name: document.getElementById('spaceNewName').value }));
      const postedCad = p.waitForRequest(r => r.method() === 'POST' && /\/v1\/workspaces\/w_me\/benches$/.test(r.url()));
      await p.click('#spaceNewMake');
      const cadBody = JSON.parse((await postedCad).postData()); await p.waitForTimeout(300);
      const op6 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › JEKcad part studio: an empty .jekcad made in the cloud and opened in JEKcad’s tab', cad.title === 'New JEKcad part studio' && cad.name === 'Untitled part studio' && JSON.parse(cadBody.content).format === 'jekcad'
        && op6 && op6[0] === '/jek/tools/jekcad.html#cloud=bnew' && op6[1] === 'jekcad', JSON.stringify([cad, op6]));
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
        await p.screenshot({ path: shots + '/jeksuite-light.png' });
        await p.evaluate(() => { location.hash = 'app=jekray'; }); await p.waitForTimeout(600);
        await p.screenshot({ path: shots + '/jeksuite-launch-light.png' });
        await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
        await p.screenshot({ path: shots + '/jeksuite-launch-phone.png', fullPage: true });
        await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(500);
        await p.screenshot({ path: shots + '/jeksuite-phone.png' });
      }
      ok('Signed in: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // a link to an app's launch page: #app=jekion
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jeksuite.html#app=jekion');
      await p.waitForSelector('.rt-happhead.jekion', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(200);
      const d = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), where: document.getElementById('homeWhere').textContent }));
      ok('#app=jekion opens JEKion’s launch page', d.benches.join() === 'b2' && d.where === 'JEKion' && !errs.length, JSON.stringify(d) + errs.join(' | '));
      await p.close();
    }
    // JEKfilm's launch page: its coatings alone, in their folders, counted as coatings; one opens in JEKfilm
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jeksuite.html#app=jekfilm');
      await p.waitForSelector('.rt-happhead.jekfilm', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
      const d = await p.evaluate(() => ({ benches: [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench), counts: [...document.querySelectorAll('.rt-hcard.folder:not([hidden]) .rt-hcount')].map(x => x.textContent), put: [...document.querySelectorAll('.rt-hcard.folder[hidden]')].map(c => c.dataset.folder),
        starts: [...document.querySelectorAll('.rt-happhead .rt-btn')].map(x => x.textContent), about: !!document.querySelector('.rt-happhead a') }));
      ok('#app=jekfilm: JEKfilm’s launch page, its coatings counted in their folders, a folder with none of them not shown, New coating, About JEKfilm', !d.benches.length && d.counts.join() === '1 coating' && d.put.join() === 'f1' && d.starts.join('|') === 'Open JEKfilm|New coating' && d.about, JSON.stringify(d));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hcard.folder .rt-hopen')].find(x => /Absorption/.test(x.textContent)).click());
      await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const tag = await p.evaluate(() => { const t = document.querySelector('.rt-hcard[data-bench=b5] .rt-htool'); return t ? [t.textContent, t.className, t.title] : null; });
      await p.click('#appPreviewOpen'); await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A coating in its folder, marked JEKfilm, opens in JEKfilm’s tab', tag && tag[0] === 'JEKfilm' && /jekfilm/.test(tag[1]) && /JEKfilm coating/.test(tag[2]) && op && op[0] === '/jek/tools/jekfilm.html#cloud=b5' && op[1] === 'jekfilm', JSON.stringify([tag, op]));
      if (shots) await p.screenshot({ path: shots + '/jeksuite-launch-jekfilm.png' });
      ok('JEKfilm’s launch page: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // JEKcad's launch page: its part studios alone, counted in their folders; one opens in JEKcad's tab
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jeksuite.html#app=jekcad');
      await p.waitForSelector('.rt-happhead.jekcad', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
      const d = await p.evaluate(() => ({ counts: [...document.querySelectorAll('.rt-hcard.folder .rt-hcount')].map(x => x.textContent), starts: [...document.querySelectorAll('.rt-happhead .rt-btn')].map(x => x.textContent), where: document.getElementById('homeWhere').textContent }));
      ok('#app=jekcad: JEKcad’s launch page, its part studios counted in their folders (one the API marked JEKray’s among them, known by its content), New part studio', d.where === 'JEKcad' && d.counts.join() === '1 part studio,1 part studio' && d.starts.join('|') === 'Open JEKcad|New part studio', JSON.stringify(d));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hcard.folder .rt-hopen')].find(x => /Levisense/.test(x.textContent)).click());
      await p.waitForSelector('.rt-hcard[data-bench=b6]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const tag = await p.evaluate(() => { const t = document.querySelector('.rt-hcard[data-bench=b6] .rt-htool'); return t ? [t.textContent, t.className] : null; });
      await p.click('#appPreviewOpen'); await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A part studio in its folder, marked JEKcad, opens in JEKcad’s tab', tag && tag[0] === 'JEKcad' && /jekcad/.test(tag[1]) && op && op[0] === '/jek/tools/jekcad.html#cloud=b6' && op[1] === 'jekcad', JSON.stringify([tag, op]));
      if (shots) await p.screenshot({ path: shots + '/jeksuite-launch-jekcad.png' });
      ok('JEKcad’s launch page: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
    // the file system: the tree, the chips, the table, picking, dragging, names typed in place
    {
      const p = await b.newPage({ viewport: { width: 1300, height: 860 } }), errs = []; p.on('pageerror', e => errs.push(e.message));
      const calls = await route(p, { signedIn: true });
      await p.goto(base + '/jek/tools/jeksuite.html');
      await p.waitForSelector('.rt-hcard[data-bench]', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
      const benchesNow = () => p.evaluate(() => [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench));
      const railGo = t => p.evaluate(t => [...document.querySelectorAll('#homeRail button')].find(x => x.textContent.startsWith(t)).click(), t);
      const sent = re => calls.filter(c => re.test(c));
      // a folder's card says what it holds; a bench with no picture has its app's mark
      const cards = await p.evaluate(() => ({ counts: [...document.querySelectorAll('.rt-hcard.folder')].map(c => c.querySelector('.rt-hcount').textContent + ':' + [...c.querySelectorAll('.rt-hdots i')].map(i => i.className).join('+')),
        pics: [...document.querySelectorAll('.rt-hcard[data-bench] .rt-happpic')].map(x => x.className.split(' ').pop() + (x.querySelector('svg') ? '' : '?')) }));
      ok('A folder’s card: how many benches are in it and which apps’; a bench with no picture: its app’s mark', cards.counts.join() === '3 benches:jekray+jekfilm+jekcad,2 benches:jekray+jekcad' && cards.pics.join() === 'jekray,jekion', JSON.stringify(cards));
      // a chip: that app's benches alone, and again for all
      await p.click('#homeChips .rt-hchip.jekion'); await p.waitForSelector('#homeChips .rt-hchip.jekion[aria-pressed=true]', { timeout: 5000 }).catch(() => {});
      const one = await benchesNow();
      await p.click('#homeChips .rt-hchip.jekion'); await p.waitForTimeout(300);
      ok('A chip shows one app’s benches; pressed again, all of them', one.join() === 'b2' && (await benchesNow()).join() === 'b1,b2', JSON.stringify(one));
      // the tree: a folder with folders in it opens; a folder in it goes there
      await p.click('#homeRail .rt-htnode[data-tree=f2] .rt-htwist'); await p.waitForSelector('#homeRail .rt-htnode[data-tree=f3]', { timeout: 5000 }).catch(() => {});
      await p.click('#homeRail .rt-htnode[data-tree=f3] .rt-htgo'); await p.waitForSelector('.rt-hcard[data-bench=b7]', { timeout: 5000 }).catch(() => {});
      const deep = await p.evaluate(() => ({ crumbs: document.getElementById('homeCrumbs').textContent, cur: [...document.querySelectorAll('#homeRail [aria-current=true]')].map(x => x.textContent) }));
      ok('The tree opens a folder’s folders and goes to one', (await benchesNow()).join() === 'b7' && deep.crumbs === 'My benches › Absorption › Old runs' && deep.cur.join() === 'Old runs1', JSON.stringify(deep));
      // Recent as cards: where each bench is, as a link there
      await railGo('Recent'); await p.waitForSelector('.rt-hcard[data-bench=b7]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      const where = await p.evaluate(() => (document.querySelector('.rt-hcard[data-bench=b7] .rt-hwhere') || {}).textContent);
      // picking: a tick, Shift for a run, Ctrl+A for all, Escape for none
      await p.click('.rt-hcard[data-bench=b1] .rt-hpick'); await p.click('.rt-hcard[data-bench=b6] .rt-hopen', { modifiers: ['Shift'] });
      const run = await p.evaluate(() => ({ picked: [...document.querySelectorAll('.rt-hcard.picked')].map(c => c.dataset.bench), bar: document.querySelector('#homePicked b').textContent, opened: window.__opened.length }));
      await p.keyboard.press('Control+a');
      const all = await p.evaluate(() => document.querySelectorAll('.rt-hcard.picked').length);
      await p.keyboard.press('Escape');
      const none = await p.evaluate(() => [document.querySelectorAll('.rt-hcard.picked').length, document.getElementById('homePicked').hidden]);
      ok('Recent: a bench’s folder in full, as a link; a tick and a Shift-click pick a run (nothing opens), Ctrl+A all, Escape none', where === 'in Absorption › Old runs' && run.picked.join() === 'b1,b5,b6' && run.bar === '3 benches picked' && run.opened === 0 && all === 7 && none[0] === 0 && none[1], JSON.stringify([where, run, all, none]));
      // the list: a table, sorted by a heading, turned round by pressing it again
      await p.click('#homeTools .rt-btn'); await p.waitForSelector('.rt-htable', { timeout: 5000 }).catch(() => {});
      const heads = await p.evaluate(() => [...document.querySelectorAll('.rt-hth .rt-hsort')].map(x => x.textContent.trim()));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hth .rt-hsort')].find(x => x.textContent.startsWith('Name')).click()); await p.waitForTimeout(300);
      const az = await benchesNow();
      await p.evaluate(() => [...document.querySelectorAll('.rt-hth .rt-hsort')].find(x => x.textContent.startsWith('Name')).click()); await p.waitForTimeout(300);
      const za = await benchesNow();
      await p.evaluate(() => [...document.querySelectorAll('.rt-hth .rt-hsort')].find(x => x.textContent.startsWith('App')).click()); await p.waitForTimeout(300);
      const byApp = await p.evaluate(() => [...document.querySelectorAll('.rt-hcard[data-bench] .rt-htool')].map(t => t.textContent));
      ok('The list is a table: Name, App, Folder, Changed and Size, each heading sorting by its column and turning it round', heads.join() === 'Name,App,Folder,Changed ▾,Size' && az.join() === 'b8,b5,b7,b6,b3,b2,b1' && za.join() === az.slice().reverse().join()
        && byApp.join() === 'JEKcad,JEKcad,JEKfilm,JEKion,JEKray,JEKray,JEKray', JSON.stringify([heads, az, za, byApp]));
      // picked benches moved with the bar, then binned with Delete
      await p.click('.rt-hcard[data-bench=b1] .rt-hpick'); await p.click('.rt-hcard[data-bench=b2] .rt-hpick');
      await p.evaluate(() => [...document.querySelectorAll('#homePicked .rt-btn')].find(x => /Move to/.test(x.textContent)).click());
      await p.selectOption('.rt-hmenu select', 'f1'); await p.waitForTimeout(400);
      const movedBar = sent(/^PATCH \/v1\/benches\/b[12]$/).length;
      await p.click('.rt-hcard[data-bench=b2] .rt-hpick'); await p.keyboard.press('Delete'); await p.waitForTimeout(400);
      ok('The picked benches move together from the bar, and Delete bins them', movedBar === 2 && sent(/^DELETE \/v1\/benches\/b2$/).length === 1 && !(await benchesNow()).includes('b2'), JSON.stringify(calls.slice(-8)));
      await p.click('#homeTools .rt-btn'); await p.waitForTimeout(300);
      // dragging: a bench onto a folder's card, onto a folder in the tree, onto the top in the breadcrumbs; a folder into a folder
      await railGo('My benches'); await p.waitForSelector('.rt-hcard.folder[data-folder=f1]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await railGo('Levisense'); await p.waitForSelector('.rt-hcard[data-bench=b1]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      await p.dragAndDrop('.rt-hcard[data-bench=b1]', '#homeRail .rt-htnode[data-tree=f2] .rt-htgo'); await p.waitForTimeout(400);
      const toTree = sent(/^PATCH \/v1\/benches\/b1$/).length === 2 && !(await benchesNow()).includes('b1');
      await p.dragAndDrop('.rt-hcard[data-bench=b3]', '#homeCrumbs .rt-link'); await p.waitForTimeout(400);
      const toTop = sent(/^PATCH \/v1\/benches\/b3$/).length === 1;
      await railGo('My benches'); await p.waitForSelector('.rt-hcard[data-bench=b3]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      await p.dragAndDrop('.rt-hcard[data-bench=b3]', '.rt-hcard.folder[data-folder=f2]'); await p.waitForTimeout(400);
      const toCard = sent(/^PATCH \/v1\/benches\/b3$/).length === 2 && !(await benchesNow()).includes('b3');
      await p.dragAndDrop('.rt-hcard.folder[data-folder=f1]', '.rt-hcard.folder[data-folder=f2]'); await p.waitForTimeout(400);
      const folderIn = sent(/^PATCH \/v1\/workspaces\/w_me\/folders\/f1$/).length === 1 && !(await p.$('.rt-hcard.folder[data-folder=f1]'));
      ok('Dragging: a bench onto a folder in the tree, onto the top in the breadcrumbs and onto a folder’s card; a folder into a folder', toTree && toTop && toCard && folderIn, JSON.stringify([toTree, toTop, toCard, folderIn, calls.slice(-6)]));
      // names typed in place: a folder made, a folder and a bench renamed (F2, or the menu), Escape leaving it as it was
      await p.click('#homeNewFolder'); await p.fill('.rt-hnewfolder input', 'Traps'); await p.keyboard.press('Enter'); await p.waitForSelector('.rt-hcard.folder[data-folder^=fnew]', { timeout: 5000 }).catch(() => {});
      const made = sent(/^POST \/v1\/workspaces\/w_me\/folders$/).length === 1;
      await p.focus('.rt-hcard.folder[data-folder=f2] .rt-hopen'); await p.keyboard.press('F2'); await p.fill('.rt-hcard.folder[data-folder=f2] .rt-hrename', 'Absorption cell'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      const fname = await p.evaluate(() => document.querySelector('.rt-hcard.folder[data-folder=f2] .rt-hopen span').textContent);
      await railGo('Absorption cell'); await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(200);
      await p.click('.rt-hcard[data-bench=b5] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Rename').click());
      await p.waitForSelector('.rt-hcard[data-bench=b5] .rt-hrename', { timeout: 5000 }).catch(() => {});
      await p.fill('.rt-hcard[data-bench=b5] .rt-hrename', 'Not this'); await p.keyboard.press('Escape');
      const kept = await p.evaluate(() => document.querySelector('.rt-hcard[data-bench=b5] .rt-hname').textContent);
      await p.focus('.rt-hcard[data-bench=b5] .rt-hopen'); await p.keyboard.press('F2'); await p.fill('.rt-hcard[data-bench=b5] .rt-hrename', 'BBAR visible'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      const bname = await p.evaluate(() => document.querySelector('.rt-hcard[data-bench=b5] .rt-hname').textContent);
      ok('Names are typed in place: a new folder, a folder and a bench renamed with F2 or the menu, Escape leaving the name alone', made && fname === 'Absorption cell' && kept === 'JEKfilmBBAR 450–650' && bname === 'JEKfilmBBAR visible' && sent(/^PATCH \/v1\/benches\/b5$/).length === 1, JSON.stringify([made, fname, kept, bname]));
      // a folder moved from its menu; folders picked with benches; a bench binned and brought back with Undo
      await railGo('My benches'); await p.waitForSelector('.rt-hcard.folder[data-folder=f2]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      const newF = await p.evaluate(() => document.querySelector('.rt-hcard.folder[data-folder^=fnew]').dataset.folder);
      await p.click('.rt-hcard.folder[data-folder=' + newF + '] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Move to…').click());
      await p.waitForSelector('.rt-hmenu select', { timeout: 5000 }).catch(() => {});
      const offered = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu select option')].map(o => o.textContent));
      await p.selectOption('.rt-hmenu select', 'f2'); await p.waitForTimeout(400);
      const fmoved = sent(new RegExp('^PATCH /v1/workspaces/w_me/folders/' + newF + '$')).length === 1 && !(await p.$('.rt-hcard.folder[data-folder=' + newF + ']'));
      ok('A folder’s menu moves it into another folder (not into itself, nor where it is)', fmoved && offered.join('|') === 'Choose…|Absorption cell|Absorption cell › Levisense|Absorption cell › Old runs', JSON.stringify([fmoved, offered]));
      await railGo('Absorption cell'); await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await p.click('.rt-hcard.folder[data-folder=f3] .rt-hpick'); await p.click('.rt-hcard[data-bench=b5] .rt-hpick');
      const mixed = await p.evaluate(() => document.querySelector('#homePicked b').textContent);
      await p.keyboard.press('Escape');
      const n0 = sent(/^POST \/v1\/benches\/b5\/undelete$/).length;
      await p.click('.rt-hcard[data-bench=b5] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Delete').click());
      await p.waitForSelector('#homeToast.act button', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      const gone = !(await benchesNow()).includes('b5'), note = await p.evaluate(() => document.getElementById('homeToast').textContent);
      await p.click('#homeToast button'); await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {});
      ok('Folders are picked with benches; a bench binned has an Undo in its note, which brings it back', mixed === '1 bench and 1 folder picked' && gone && /moved to the bin for 30 days Undo$/.test(note) && sent(/^POST \/v1\/benches\/b5\/undelete$/).length === n0 + 1 && (await benchesNow()).includes('b5'), JSON.stringify([mixed, gone, note]));
      // to another workspace: a bench dragged onto it in the rail, or chosen in Move to…
      await railGo('My benches'); await p.waitForSelector('.rt-hcard[data-bench]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await railGo('Absorption cell'); await p.waitForSelector('.rt-hcard[data-bench=b8]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await p.dragAndDrop('.rt-hcard[data-bench=b8]', '#homeRail button:has-text("Levitation lab")'); await p.waitForTimeout(500);
      const draggedOut = !(await benchesNow()).includes('b8'), said = await p.evaluate(() => document.getElementById('homeToast').textContent);
      await p.click('.rt-hcard[data-bench=b1] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Move to…').click());
      await p.waitForSelector('.rt-hmenu select', { timeout: 5000 }).catch(() => {});
      await p.selectOption('.rt-hmenu select', 'ws:w_lab'); await p.waitForTimeout(500);
      await railGo('Levitation lab'); await p.waitForSelector('.rt-hcard[data-bench=b4]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      const inTeam = await benchesNow();
      await railGo('My benches'); await p.waitForSelector('.rt-hcard.folder', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      await railGo('Absorption cell'); await p.waitForSelector('.rt-hcard[data-bench=b5]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300);
      ok('A bench goes to another workspace: dragged onto it in the rail, or chosen in Move to…', draggedOut && /^Moved “Alignment cap” to Levitation lab/.test(said) && ['b1', 'b4', 'b8'].every(id => inTeam.includes(id)), JSON.stringify([draggedOut, said, inTeam]));
      // the arrows go from card to card; a fork's name is asked for in the page; the chip pressed is kept; dark and light
      await p.focus('.rt-hcard[data-bench=b5] .rt-hopen'); await p.keyboard.press('ArrowRight');
      const right = await p.evaluate(() => (document.activeElement.closest('.rt-hcard') || {}).dataset.bench);
      await p.keyboard.press('ArrowUp');
      const up = await p.evaluate(() => (document.activeElement.closest('.rt-hcard') || {}).dataset.folder);
      await p.keyboard.press('End');
      const end = await p.evaluate(() => (document.activeElement.closest('.rt-hcard') || {}).dataset.bench);
      const here = await benchesNow();
      ok('The arrow keys go from card to card, up to the folders, End to the last', right === here[here.indexOf('b5') + 1] && !!up && end === here[here.length - 1], JSON.stringify([here, right, up, end]));
      let asked = 0; p.on('dialog', d => { asked++; d.dismiss(); });
      await p.click('.rt-hcard[data-bench=b5] .rt-hmore');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Fork…').click());
      await p.waitForSelector('#spaceNameDialog[open]', { timeout: 5000 }).catch(() => {});
      await p.fill('#spaceNameInput', 'BBAR try'); await p.click('#spaceNameOk'); await p.waitForTimeout(400);
      const forked = calls.includes('POST /v1/benches/b5/fork') && !(await p.$('#spaceNameDialog'));
      ok('A fork’s name is asked for in the page, not in the browser’s own box', forked && !asked, JSON.stringify([forked, asked]));
      await p.click('#homeChips .rt-hchip.jekfilm'); await p.waitForTimeout(300);
      await p.reload(); await p.waitForSelector('#homeChips', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(400);
      const keptChip = await p.evaluate(() => (document.querySelector('#homeChips .rt-hchip[aria-pressed=true]') || {}).textContent);
      await p.evaluate(() => document.querySelector('#homeChips .rt-hchip').click());
      const t0 = await p.evaluate(() => document.documentElement.dataset.rtTheme);
      await p.click('#homeTheme');
      const t1 = await p.evaluate(() => [document.documentElement.dataset.rtTheme, localStorage.getItem('jekray-theme')]);
      await p.click('#homeTheme');
      const t2 = await p.evaluate(() => document.documentElement.dataset.rtTheme);
      ok('The chip pressed is kept for the next visit; the bar’s button turns the page light and dark', /^JEKfilm/.test(keptChip || '') && t0 === 'dark' && t1.join() === 'light,light' && t2 === 'dark', JSON.stringify([keptChip, t0, t1, t2]));
      if (shots) { await railGo('Recent'); await p.waitForTimeout(400); await p.screenshot({ path: shots + '/jeksuite-recent.png' }); await p.click('#homeTools .rt-btn'); await p.waitForTimeout(400); await p.screenshot({ path: shots + '/jeksuite-table.png' }); }
      ok('The file system: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  } finally { await b.close(); }
  return out;
}
