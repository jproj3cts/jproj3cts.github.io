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
      const s = await p.evaluate(() => ({ signIn: !!document.getElementById('homeSignIn'), apps: [...document.querySelectorAll('.rt-happ')].map(a => a.dataset.app), btn: document.getElementById('btnAcct').textContent }));
      ok('Signed out: a sign-in panel and the apps', s.signIn && s.apps.join() === 'jekray,jekion' && s.btn === 'Sign in', JSON.stringify(s));
      await p.click('#homeSignIn');
      const menu = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].map(x => x.textContent));
      ok('Signed out: Sign in offers Google, Microsoft and email', ['Continue with Google', 'Continue with Microsoft (university or work)', 'Continue with email'].every(t => menu.includes(t)), menu.join(' | '));
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.querySelector('.rt-happ[data-app=jekion] .rt-btn.primary').click());
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Signed out: an app opens in its own tab', op && op[0] === '/jek/tools/jekion.html' && op[1] === 'jekion', JSON.stringify(op));
      await p.evaluate(() => [...document.querySelectorAll('.rt-happ[data-app=jekray] .rt-btn')].find(x => x.textContent === 'New bench').click());
      const nw = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('Signed out: New bench starts one in the app itself (#new)', nw && nw[0] === '/jek/tools/jekray.html#new', JSON.stringify(nw));
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
        folders: document.querySelectorAll('.rt-hcard.folder').length, apps: document.querySelectorAll('.rt-happ').length, acct: document.getElementById('btnAcct').classList.contains('in') }));
      ok('Signed in: the benches of both apps, the folders and the apps', s.benches.join() === 'b1,b2' && s.tools.join() === 'JEKray,JEKion' && s.folders === 2 && s.apps === 2 && s.acct, JSON.stringify(s));
      if (shots) await p.screenshot({ path: shots + '/jekspace-dark.png' });
      await p.selectOption('#homeApp', 'jekion'); await p.waitForTimeout(300);
      const only = await p.evaluate(() => [...document.querySelectorAll('.rt-hcard[data-bench]')].map(c => c.dataset.bench));
      ok('The app filter: JEKion alone', only.join() === 'b2', only.join());
      await p.click('.rt-hcard[data-bench=b2] .rt-hopen');
      await p.waitForTimeout(200);
      const op = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A JEKion bench opens in JEKion’s tab, at #cloud=<id>', op && op[0] === '/jek/tools/jekion.html#cloud=b2' && op[1] === 'jekion', JSON.stringify(op));
      await p.selectOption('#homeApp', 'all'); await p.waitForTimeout(300);
      await p.click('.rt-hcard[data-bench=b1] .rt-hopen'); await p.waitForTimeout(200);
      const op2 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('A JEKray bench opens in JEKray’s tab', op2 && op2[0] === '/jek/tools/jekray.html#cloud=b1' && op2[1] === 'jekray', JSON.stringify(op2));
      // New: five kinds; a JEKion bench made in the cloud, then opened in JEKion
      await p.click('#homeNew');
      const kinds = await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].map(x => x.textContent));
      ok('New offers a bench in each app and JEKray’s three designers', kinds.join('|') === 'JEKray bench|Optical design (JEKray)|RF design (JEKray)|Coating design (JEKray)|JEKion bench', kinds.join('|'));
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'Optical design (JEKray)').click());
      await p.click('#spaceNewMake'); await p.waitForTimeout(400);
      const op3 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › Optical design: a cloud bench made, opened in JEKray into the designer', op3 && op3[0] === '/jek/tools/jekray.html#cloud=bnew:lens' && calls.some(c => c === 'POST /v1/workspaces/w_me/benches'), JSON.stringify(op3));
      await p.click('#homeNew');
      await p.evaluate(() => [...document.querySelectorAll('.rt-hmenu button')].find(x => x.textContent === 'JEKion bench').click());
      await p.click('#spaceNewMake'); await p.waitForTimeout(400);
      const op4 = await p.evaluate(() => window.__opened.slice(-1)[0]);
      ok('New › JEKion bench: made in the cloud and opened in JEKion', op4 && op4[0] === '/jek/tools/jekion.html#cloud=bnew', JSON.stringify(op4));
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
        await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
        await p.screenshot({ path: shots + '/jekspace-phone.png' });
      }
      ok('Signed in: no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  } finally { await b.close(); }
  return out;
}
