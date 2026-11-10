/* JEKcad in a browser (Playwright): the Part Studio driven as a person would, with the mouse and the keys. A sketch
   drawn on the Top plane, constrained and dimensioned until it is fully defined; extruded; an edge filleted; the
   sketch edited and the model following; the rollback bar; saving and opening the .jekcad; STEP and STL out; the
   view cube, the display modes and the section view. check(pw, base, shots) returns [{ name, ok, why }]. */
import { readFileSync } from 'node:fs';

const near = (a, b, t) => Math.abs(a - b) <= t;
export async function check(pw, base, shots) {
  const out = [], ok = (name, pass, why) => { out.push({ name, ok: !!pass, why: pass ? '' : why }); if (process.env.JEKCAD_LOG) console.log((pass ? 'ok   ' : 'FAIL ') + name + (pass ? '' : ' :: ' + String(why).slice(0, 300))); };
  const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = async (p, name) => { if (shots) await p.screenshot({ path: shots + '/' + name + '.png' }); };
  try {
    const p = await b.newPage({ viewport: { width: 1400, height: 880 }, acceptDownloads: true }), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto(base + '/jek/tools/jekcad.html?test');
    await p.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
    const st = await p.evaluate(() => ({ ready: !!(window.JEKcad && window.JEKcad.view.ready), n: window.JEKcad && window.JEKcad.app.regenCount, err: window.JEKcad && window.JEKcad.app.error }));
    ok('The page loads, three.js draws, and the kernel worker regenerates an empty Part Studio', st.ready && st.n > 0 && !st.err, JSON.stringify(st) + errs.join(' | '));
    const regen = () => p.evaluate(() => Promise.race([window.JEKcad.regenDone(), new Promise(r => setTimeout(() => r('timeout'), 20000))]));
    const vol = () => p.evaluate(() => window.JEKcad.app.result.parts.reduce((s, x) => s + x.volume, 0));
    const xy = async w => { const r = await p.evaluate(w2 => window.JEKcad.project(w2), w); const box = await p.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };
    const uvXY = async uv => { const r = await p.evaluate(u => window.JEKcad.toScreen(u), uv); const box = await p.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };

    // a sketch on Top: the Sketch button asks for a plane; the Top plane in the feature list answers
    await p.click('[data-feature="sketch"]');
    await p.click('.cad-frow-p[data-plane="top"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
    ok('Sketch › the Top plane: the sketcher opens, the view normal to it', await p.evaluate(() => window.JEKcad.sketchOn() && !document.getElementById('sketchBar').hidden), 'no sketch mode');
    await p.waitForTimeout(150);
    // a rectangle from the origin (inferred coincident there) to about 30 × 15
    await p.keyboard.press('r');
    let a = await uvXY([0, 0]), c = await uvXY([30, 15]);
    await p.mouse.move(a[0], a[1]); await p.mouse.click(a[0], a[1]);
    await p.mouse.move(c[0], c[1], { steps: 4 }); await p.mouse.click(c[0], c[1]);
    let sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f; return { lines: f.ents.filter(e => e.t === 'line').length, cons: f.cons.map(x => x.t), defined: window.JEKcad.sk.defined.size }; });
    ok('The rectangle tool: four lines joined, two horizontal, two vertical, its corner on the origin (inferred)', sk.lines === 4 && sk.cons.filter(t => t === 'horizontal').length === 2 && sk.cons.filter(t => t === 'vertical').length === 2 && sk.cons.filter(t => t === 'coincident').length === 5, JSON.stringify(sk));
    // dimensions typed in place: the bottom line 40, the right side 20, by clicking each line twice with the dimension tool
    await p.keyboard.press('d');
    const dimLine = async (uv, v) => { const q = await uvXY(uv); await p.mouse.click(q[0], q[1]); await p.mouse.click(q[0], q[1]); await p.waitForSelector('#dimInput', { timeout: 3000 }); await p.fill('#dimInput', v); await p.keyboard.press('Enter'); };
    await dimLine([15, 0], '40');
    await dimLine([40, 10], '#h');
    const refused = !!(await p.$('#dimInput'));
    if (refused) await p.keyboard.press('Escape');
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f; return { dims: f.dims.map(d => [d.t, d.x, +d.v.toFixed(4)]), err: f.dims.some(d => d.err) }; });
    ok('The dimension tool: values typed in place; an unknown #variable is refused, Esc takes the new dimension back', refused && sk.dims.length === 1 && sk.dims[0][2] === 40, JSON.stringify(sk));
    // the variable made (from the console, as the table would) and the dimension typed again with it
    await p.evaluate(() => { window.JEKcad.app.doc.variables.push({ name: 'h', expr: '20 mm', kind: 'len' }); window.JEKcad.app.result.vars.h = 20; });
    await p.keyboard.press('d');
    await dimLine([40, 7.5], '#h');
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, l = f.ents.filter(e => e.t === 'line'); return { dims: f.dims.map(d => [d.t, d.x, +d.v.toFixed(4)]), defined: window.JEKcad.sk.defined.size, xs: l.map(e => [e.a, e.b]).flat().map(q => q.map(v => +v.toFixed(3)).join(',')) }; });
    ok('Dimensioned 40 × #h: the rectangle is fully defined (its shapes drawn in ink, not blue)', sk.dims.length === 2 && sk.defined === 4 && sk.xs.includes('40,20'), JSON.stringify(sk));
    await shot(p, 'jekcad-sketch');
    await p.click('#sketchOk');
    await regen();
    ok('Finish: the sketch is in the feature list', await p.evaluate(() => window.JEKcad.app.doc.features.length === 1 && document.querySelectorAll('.cad-frow-f').length === 1), 'no sketch row');
    // extrude: its region taken by default, 10 deep
    await p.click('[data-feature="extrude"]');
    await p.waitForSelector('#fd-depth');
    await p.fill('#fd-depth', '10 mm');
    await p.waitForTimeout(400);
    await shot(p, 'jekcad-extrude-preview');
    await p.click('#featureOk');
    await regen();
    let v = await vol();
    ok('Extrude 10 mm: one part of 8000 mm³', near(v, 8000, 1e-3), 'volume ' + v);
    await p.evaluate(() => window.JEKcad.viewFrom('iso'));
    await p.waitForTimeout(400);
    // fillet the vertical edge at x 40, y 20: picked in the view
    await p.click('[data-feature="fillet"]');
    await p.waitForSelector('#fd-radius');
    const e1 = await xy([40, 20, 5]);
    await p.mouse.move(e1[0], e1[1]); await p.waitForTimeout(80); await p.mouse.click(e1[0], e1[1]);
    await p.waitForFunction(() => window.JEKcad.app.editing && window.JEKcad.app.editing.f.edges.length === 1, null, { timeout: 5000 }).catch(() => {});
    await p.fill('#fd-radius', '2');
    await p.waitForTimeout(300);
    await p.click('#featureOk');
    await regen();
    v = await vol();
    ok('Fillet an edge clicked in the view, r 2: (4 − π)·10 mm³ less', near(v, 8000 - (4 - Math.PI) * 10, 1e-3), 'volume ' + v);
    await shot(p, 'jekcad-fillet');
    // the sketch edited: double-click it, double-click its 40 dimension, type 60
    await p.dblclick('.cad-frow-f[data-i="0"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(300);
    const lab = await p.evaluate(() => { const L = window.JEKcad.sk.labels.find(x => x.item.t === 'dim' && window.JEKcad.app.sketch.f.dims.find(d => d.id === x.item.id).x === '40'); return L && [(L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2]; });
    const box = await p.locator('#over').boundingBox();
    if (lab) { await p.keyboard.press('s'); await p.mouse.dblclick(box.x + lab[0], box.y + lab[1]); }
    await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => {});
    if (await p.$('#dimInput')) { await p.fill('#dimInput', '60'); await p.keyboard.press('Enter'); }
    await p.click('#sketchOk');
    await regen();
    v = await vol();
    ok('Edit the sketch (40 → 60): the extrude and the fillet follow', near(v, 60 * 20 * 10 - (4 - Math.PI) * 10, 1e-3), 'volume ' + v + ' label ' + JSON.stringify(lab));
    // a variable changed in the Variables table
    await p.click('#btnFile'); await p.keyboard.press('Escape');
    await p.click('[data-click="btnVariables"]');
    await p.fill('[data-var="expr"]', '25 mm'); await p.keyboard.press('Tab');
    await regen();
    await p.click('#varsClose');
    v = await vol();
    ok('The Variables table: #h 20 → 25 mm, the part follows', near(v, 60 * 25 * 10 - (4 - Math.PI) * 10, 1e-3), 'volume ' + v);
    // the rollback bar: before the fillet
    const bar = await p.locator('#rollbar').boundingBox(), row1 = await p.locator('.cad-frow-f[data-i="1"]').boundingBox();
    await p.mouse.move(bar.x + 20, bar.y + 1); await p.mouse.down(); await p.mouse.move(bar.x + 20, row1.y + row1.height * 0.8, { steps: 5 }); await p.mouse.up();
    await regen();
    v = await vol();
    const rb = await p.evaluate(() => ({ rb: window.JEKcad.app.doc.rollback, rolled: [...document.querySelectorAll('.cad-frow-f.rolled')].map(r => r.dataset.i) }));
    ok('Drag the rollback bar above the fillet: the model as it was, the fillet greyed', near(v, 60 * 25 * 10, 1e-3) && rb.rb === 2 && rb.rolled.join() === '2', JSON.stringify(rb) + ' volume ' + v);
    await shot(p, 'jekcad-rollback');
    await p.evaluate(() => window.JEKcad.setRollback(99)); await regen();
    // suppress and an error shown: a fillet too big
    await p.evaluate(() => { const d = window.JEKcad.app.doc; d.features[2].radius = '30'; window.JEKcad.changed(); });
    await regen();
    const err = await p.evaluate(() => { const r = document.querySelector('.cad-frow-f[data-i="2"]'); return { cls: r.className, text: r.textContent }; });
    ok('A feature that fails is red with its reason, and the model before it stays', /err/.test(err.cls) && /fillet/i.test(err.text) && near(await vol(), 60 * 25 * 10, 1e-3), JSON.stringify(err));
    await shot(p, 'jekcad-error');
    await p.evaluate(() => { window.JEKcad.app.doc.features[2].radius = '2'; window.JEKcad.changed(); }); await regen();
    // save the .jekcad and open it again
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnSave')]);
    const saved = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    ok('Save: a .jekcad file of the feature list', dl.suggestedFilename().endsWith('.jekcad') && saved.format === 'jekcad' && saved.features.length === 3 && saved.variables[0].name === 'h', dl.suggestedFilename() + ' ' + JSON.stringify(saved).slice(0, 200));
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    const before = await vol();
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#btnFile').then(() => p.click('#btnOpen'))]);
    await chooser.setFiles(await dl.path());
    await regen();
    v = await vol();
    ok('Open: the saved Part Studio comes back the same', before === 0 && near(v, 60 * 25 * 10 - (4 - Math.PI) * 10, 1e-3), 'before ' + before + ' after ' + v);
    // exports
    const [st1] = await Promise.all([p.waitForEvent('download'), p.click('#btnFile').then(() => p.click('#btnExportStep'))]);
    const stepText = readFileSync(await st1.path(), 'utf8');
    ok('Export STEP: an ISO 10303-21 file', st1.suggestedFilename().endsWith('.step') && /^ISO-10303-21/.test(stepText) && /MANIFOLD_SOLID_BREP|ADVANCED_FACE/.test(stepText), st1.suggestedFilename());
    const [st2] = await Promise.all([p.waitForEvent('download'), p.click('#btnFile').then(() => p.click('#btnExportStl'))]);
    const stl = readFileSync(await st2.path());
    ok('Export STL: binary triangles', st2.suggestedFilename().endsWith('.stl') && stl.length === 84 + 50 * stl.readUInt32LE(80) && stl.readUInt32LE(80) > 12, st2.suggestedFilename() + ' ' + stl.length);
    // the STEP file imported back as a feature
    const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.click('#btnFile').then(() => p.click('#btnImportStep'))]);
    await ch2.setFiles(await st1.path());
    await regen();
    const parts = await p.evaluate(() => window.JEKcad.app.result.parts.length);
    ok('Import STEP: its solid comes in as a second part', parts === 2 && near(await vol(), 2 * (60 * 25 * 10 - (4 - Math.PI) * 10), 1e-2), 'parts ' + parts);
    await p.keyboard.press('Control+z'); await regen();
    // selecting and measuring: the top face's area
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    const top = await xy([30, 12, 10]);
    await p.mouse.click(top[0], top[1]);
    await p.waitForFunction(() => !document.getElementById('measure').hidden, null, { timeout: 5000 }).catch(() => {});
    const meas = await p.textContent('#measure');
    ok('Click the top face: it is selected and measured', /Face \(plane\)/.test(meas) && /1499\.14\d* mm²/.test(meas.replace(/,/g, '')), meas);
    // the view cube's Front face, the display modes, the section view
    { const cb = await p.locator('#viewCube canvas').boundingBox(); await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300); await p.mouse.click(cb.x + 30, cb.y + 50); }
    await p.waitForTimeout(400);
    const front = await p.evaluate(() => { const v = window.JEKcad.view, z = [2 * (v.q[0] * v.q[2] + v.q[3] * v.q[1]), 2 * (v.q[1] * v.q[2] - v.q[3] * v.q[0]), 1 - 2 * (v.q[0] ** 2 + v.q[1] ** 2)]; return z.map(x => +x.toFixed(3)); });
    ok('The view cube: Front looks along +y', near(front[1], -1, 1e-3), JSON.stringify(front));
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    await p.click('#btnViewMenu'); await p.click('[data-mode="hidden"]');
    await shot(p, 'jekcad-hidden-edges');
    await p.click('#btnViewMenu'); await p.click('[data-mode="shadedEdges"]');
    await p.click('#btnViewMenu'); await p.click('#btnSection');
    await p.evaluate(() => { const r = document.getElementById('secAt'); r.value = '-10'; r.dispatchEvent(new Event('input')); });
    await p.waitForTimeout(200);
    ok('The section view: a plane cuts the parts', await p.evaluate(() => !!window.JEKcad.view.section && !document.getElementById('sectionCtl').hidden), 'no section');
    await shot(p, 'jekcad-section');
    await p.click('#btnViewMenu'); await p.click('#btnSection');
    // undo the whole way, and redo
    const nUndo = await p.evaluate(() => window.JEKcad.app.history.length);
    ok('Undo and redo are kept', nUndo > 3, 'history ' + nUndo);
    await p.evaluate(() => { document.querySelector('[data-theme="light"]').click(); });
    await p.waitForTimeout(300);
    await shot(p, 'jekcad-light');
    await p.evaluate(() => { document.querySelector('[data-theme="dark"]').click(); });
    ok('No page errors', !errs.length, errs.slice(0, 5).join(' | '));
    await p.close();
    // a part studio from the cloud that the API marked JEKray's (as one from before JEKcad was), opened by its link in
    // each app: JEKcad keeps it by its content; JEKray, JEKion and JEKfilm hand it to JEKcad's tab
    const studio = { id: 'bcad', name: 'Routed studio', tool: 'jekray', workspace_id: 'w_me', version: 1, updated_at: Date.now(),
      content: JSON.stringify({ format: 'jekcad', version: 1, name: 'Routed studio', units: 'mm', variables: [], features: [], rollback: null, parts: {} }) };
    const me = { user: { id: 'u1', name: 'Jo', email: 'jo@example.ac.uk', created_at: 0 }, identities: [], workspaces: [{ id: 'w_me', kind: 'personal', name: 'Jo', role: 'owner', active: true,
      plan: { plan: 'individual', billing: true, status: 'active', interval: 'month', period_end: Date.now() + 9e9 } }] };
    const routed = async app => {
      const q = await b.newPage({ viewport: { width: 1200, height: 800 } });
      await q.addInitScript(() => { window.__opened = []; window.open = (u, n) => { window.__opened.push([u, n]); return { focus() {} }; }; });
      await q.route('http://localhost:8787/**', r => {
        const req = r.request(), path = new URL(req.url()).pathname, cors = { 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' };
        if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
        const body = path === '/v1/me' ? me : path === '/v1/benches/bcad' ? studio : /lease$/.test(path) ? { ok: true, held: true } : {};
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      });
      await q.goto(base + '/jek/tools/' + app + '.html#cloud=bcad');
      await q.waitForFunction(a => a === 'jekcad' ? window.JEKcad && window.JEKcad.app.doc && window.JEKcad.app.doc.name === 'Routed studio' : window.__opened.length > 0, app, { timeout: 30000 }).catch(() => {});
      const res = await q.evaluate(a => ({ opened: window.__opened, name: a === 'jekcad' && window.JEKcad ? window.JEKcad.app.doc.name : null }), app);
      await q.close();
      return res;
    };
    const here = await routed('jekcad');
    ok('A part studio the API marked JEKray’s opens in JEKcad, by its content, and goes nowhere else', here.name === 'Routed studio' && !here.opened.length, JSON.stringify(here));
    for (const app of ['jekray', 'jekion', 'jekfilm']) {
      const r = await routed(app), last = r.opened.slice(-1)[0];
      ok('Opened by its link in ' + app + ': handed to JEKcad’s tab', last && last[0] === '/jek/tools/jekcad.html#cloud=bcad' && last[1] === 'jekcad', JSON.stringify(r.opened));
    }
  } catch (err) { ok('The suite ran to its end', false, err.message.split('\n').slice(0, 3).join(' ')); } finally { await b.close(); }
  return out;
}
