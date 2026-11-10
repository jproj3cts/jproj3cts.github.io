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
    // ---- a new Part Studio, for what 0.2 added ----
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    const lay = await p.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), sd = document.getElementById('side').getBoundingClientRect(); return { bottom: Math.round(innerHeight - st.bottom), right: Math.round(innerWidth - st.right), gap: Math.round(st.left - sd.right) }; });
    await p.click('#sideTab');
    const wide = await p.evaluate(() => ({ left: Math.round(document.getElementById('stage').getBoundingClientRect().left), off: document.getElementById('cadMain').classList.contains('side-off'), exp: document.getElementById('sideTab').getAttribute('aria-expanded') }));
    await p.click('#sideTab');
    ok('The view fills the window to its edges; the tab on the feature list closes it (the view takes its room) and opens it again', lay.bottom === 0 && lay.right === 0 && lay.gap === 0 && wide.left === 0 && wide.off && wide.exp === 'false' && await p.evaluate(() => !document.getElementById('cadMain').classList.contains('side-off')), JSON.stringify([lay, wide]));
    // a centre rectangle, sized by typing straight after it is drawn
    await p.click('[data-feature="sketch"]'); await p.click('.cad-frow-p[data-plane="top"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(150);
    await p.click('[data-skgroup="rect"]');
    const rmenu = await p.evaluate(() => ({ shown: !document.getElementById('skMenu-rect').hidden, items: [...document.querySelectorAll('#skMenu-rect [data-skpick]')].map(b => b.dataset.skpick).join() }));
    await p.click('[data-skpick="crect"]');
    const rbtn = await p.evaluate(() => ({ tool: window.JEKcad.sk.tool, on: !!document.querySelector('.cad-toolgroup [data-sktool="crect"].on'), hidden: document.getElementById('skMenu-rect').hidden }));
    ok('The rectangle button’s arrow lists the corner and the centre rectangle; the one chosen becomes the button', rmenu.shown && rmenu.items === 'rect,crect' && rbtn.tool === 'crect' && rbtn.on && rbtn.hidden, JSON.stringify([rmenu, rbtn]));
    const clickUV = async (uv, o) => { const q = await uvXY(uv); await p.mouse.move(q[0], q[1], { steps: 3 }); await p.mouse.click(q[0], q[1], o); };
    await clickUV([0, 0]); await clickUV([27, 17]);
    await p.keyboard.type('60'); await p.keyboard.press('Enter'); await p.keyboard.type('40'); await p.keyboard.press('Enter');
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f; return { dims: f.dims.map(d => d.t + '=' + d.x), defined: window.JEKcad.sk.defined.size, n: f.ents.length }; });
    ok('Numbers typed straight after a rectangle is drawn dimension its width and its height: 60 × 40, fully defined', sk.dims.join() === 'len=60,len=40' && sk.defined === sk.n, JSON.stringify(sk));
    await p.click('#sketchOk'); await regen();
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '10'); await p.waitForTimeout(300); await p.click('#featureOk'); await regen();
    // Sketch on a face selected beforehand; a line drawn to the part's edge locks on it; right-click ends the chain
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    const tf = await xy([10, 5, 10]);
    await p.mouse.click(tf[0], tf[1]); await p.waitForTimeout(150);
    await p.click('[data-feature="sketch"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300);
    const onFace = await p.evaluate(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F.o[2]);
    await clickUV([0, 0]); await clickUV([-29.7, 8]);
    await clickUV([-29.8, -19.8]);
    const rq = await uvXY([-10, -10]); await p.mouse.move(rq[0], rq[1]); await p.mouse.click(rq[0], rq[1], { button: 'right' });
    await p.waitForTimeout(100);
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, own = f.ents.filter(e => !e.ref); return { ents: f.ents.map(e => e.t + (e.ref ? '*' : '')), cons: f.cons.map(c => c.t), ends: own.map(e => e.b.map(v => +v.toFixed(4))), tool: window.JEKcad.sk.tool, draft: !!window.JEKcad.sk.draft, src: f.ents.filter(e => e.ref && e.src).length }; });
    ok('Sketch on a face chosen first; a line drawn to the part’s edge is held on it (the edge brought in as a fixed construction line, with its ref) and the next to the part’s corner, the end of that line; a right-click ends what is being drawn',
      onFace === 10 && sk.ends.length === 2 && sk.ends[0][0] === -30 && sk.ends[1].join() === '-30,-20' && sk.ents.includes('line*') && sk.cons.includes('oncurve') && sk.cons.filter(t => t === 'coincident').length === 3 && sk.src === 1 && !sk.draft, JSON.stringify([onFace, sk]));
    await p.mouse.click(rq[0], rq[1], { button: 'right' });
    // the dimension tool reaches the model: the line's far end 5 from the part's front edge (y −20)
    await p.keyboard.press('d');
    await clickUV([-30, 8]); await clickUV([5, -20]);
    const dimIn = await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => null);
    if (dimIn) { await p.fill('#dimInput', '25'); await p.keyboard.press('Enter'); }
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f; return { tool: window.JEKcad.sk.tool, dims: f.dims.map(d => d.t + '=' + d.x), y: +f.ents.filter(e => !e.ref)[0].b[1].toFixed(4) }; });
    ok('The dimension tool measures from an edge of the model: the point 25 from the front edge', sk.dims.join() === 'pl=25' && sk.y === 5, JSON.stringify(sk));
    // the middle of an edge of the model: a line ended there is held to the edge's middle
    await p.keyboard.press('l');
    await clickUV([10, 10]); await clickUV([0.3, 19.7]);
    await p.mouse.click(rq[0], rq[1], { button: 'right' });
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, l = f.ents.filter(e => !e.ref).pop(); return { end: l.b.map(v => +v.toFixed(4)), mid: f.cons.filter(c => c.t === 'midpoint').length }; });
    ok('A line ended near the middle of an edge of the model is held to its middle', sk.end.join() === '0,20' && sk.mid === 1, JSON.stringify(sk));
    // the other lines and circles: a line from its middle, a centre line, a circle through three points
    await p.click('[data-skgroup="line"]'); await p.click('[data-skpick="mline"]');
    await clickUV([10, -10]); await clickUV([16, -6]);
    await p.click('[data-skgroup="line"]'); await p.click('[data-skpick="cline"]');
    await clickUV([-20, 14]); await clickUV([-8, 14]); await p.mouse.click(rq[0], rq[1], { button: 'right' });
    await p.click('[data-skgroup="circle"]'); await p.click('[data-skpick="circle3"]');
    await clickUV([14, 5]); await clickUV([18, 9]); await clickUV([22, 5]);
    sk = await p.evaluate(() => { const es = window.JEKcad.app.sketch.f.ents.filter(e => !e.ref).slice(-3); return es.map(e => (e.t === 'line' ? [e.k ? 'k' : '', ...e.a, ...e.b] : [e.t, ...e.c, e.r]).map(v => (typeof v === 'number' ? +v.toFixed(3) : v)).join()); });
    ok('Midpoint line (its middle, then an end), centre line (construction) and 3-point circle, from the arrows by Line and Circle', sk[0] === ',4,-14,16,-6' && sk[1] === 'k,-20,14,-8,14' && sk[2] === 'circle,18,5,4', JSON.stringify(sk));
    await p.click('#sketchCancel'); await regen();
    // a feature picked in the list shows its sketch's dimensions on the model; one double-clicked is typed again
    await p.click('.cad-frow-f[data-i="1"] .nm'); await p.waitForTimeout(200);
    const ml = await p.evaluate(() => { const J = window.JEKcad, f = J.app.doc.features[0]; return J.sk.mlabels.map(b => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, v: f.dims.find(d => d.id === b.dim).x })); });
    const m60 = ml.find(x => x.v === '60'), ob = await p.locator('#over').boundingBox();
    if (m60) { await p.mouse.dblclick(ob.x + m60.x, ob.y + m60.y); await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => {}); if (await p.$('#dimInput')) { await p.fill('#dimInput', '80'); await p.keyboard.press('Enter'); await regen(); } }
    v = await vol();
    ok('The feature picked in the list shows its sketch’s dimensions on the model; the 60 double-clicked and typed as 80, the part follows', ml.length === 2 && near(v, 80 * 40 * 10, 1e-3), JSON.stringify(ml) + ' volume ' + v);
    // a part made far bigger from the model: the view fits it again, every dimension still inside the view
    const big = await p.evaluate(() => { const J = window.JEKcad, f = J.app.doc.features[0], b = J.sk.mlabels.find(x => f.dims.find(d => d.id === x.dim).x === '80'); return b && [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; });
    if (big) { await p.mouse.dblclick(ob.x + big[0], ob.y + big[1]); await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => {}); if (await p.$('#dimInput')) { await p.fill('#dimInput', '400'); await p.keyboard.press('Enter'); await regen(); await p.waitForTimeout(300); } }
    const inView = await p.evaluate(() => { const J = window.JEKcad; return { n: J.sk.mlabels.length, in: J.sk.mlabels.every(b => b.x0 > 0 && b.x1 < J.view.w && b.y0 > 0 && b.y1 < J.view.h) }; });
    ok('A dimension typed on the model that grows the part past the view’s edge: the view fits it again', inView.n === 2 && inView.in && near(await vol(), 400 * 40 * 10, 1e-3), JSON.stringify(inView));
    await p.keyboard.press('Control+z'); await regen();
    // the eyes: a plane, the origin, and the parts a feature made
    await p.hover('.cad-frow-p[data-plane="top"]'); await p.click('.cad-frow-p[data-plane="top"] .cad-eye');
    await p.hover('.cad-frow-p[data-plane="origin"]'); await p.click('.cad-frow-p[data-plane="origin"] .cad-eye');
    await p.hover('.cad-frow-f[data-i="1"]'); await p.click('.cad-frow-f[data-i="1"] .cad-eye'); await regen();
    const eyes = await p.evaluate(() => { const J = window.JEKcad; return { hide: J.app.doc.hide, shown: J.view.parts.size, planes: ['top', 'front'].map(k => !!J.overlayPick(...J.project([k === 'top' ? 200 : 0, k === 'top' ? 0 : 0, k === 'top' ? 0 : 0]).slice(0, 2), 'plane')), off: document.querySelectorAll('.cad-eye.off').length }; });
    ok('The eye on a row hides the Top plane, the origin, and the part Extrude 1 made (the sketch it used is hidden already)', eyes.hide.top && eyes.hide.origin && !eyes.hide.front && eyes.shown === 0 && eyes.off === 4, JSON.stringify(eyes));
    await p.hover('.cad-frow-f[data-i="1"]'); await p.click('.cad-frow-f[data-i="1"] .cad-eye'); await regen();
    // fly: a camera of its own, moved with W, turned, and landed with Esc
    await p.keyboard.press('Escape');
    await p.click('#btnFly'); await p.waitForTimeout(200);
    const f0 = await p.evaluate(() => { const f = window.JEKcad.view.fly; return f && { pos: f.pos.slice(), cls: document.getElementById('stage').classList.contains('cad-flying'), hint: document.getElementById('flyHint').textContent }; });
    await p.keyboard.down('KeyW'); await p.waitForTimeout(400); await p.keyboard.up('KeyW');
    await p.evaluate(() => window.JEKcad.flyTurn(100, 30)); await p.waitForTimeout(100);
    const f1 = await p.evaluate(() => { const f = window.JEKcad.view.fly; return f && { pos: f.pos.slice(), yaw: f.yaw }; });
    await shot(p, 'jekcad-fly');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    const f2 = await p.evaluate(() => ({ fly: !!window.JEKcad.view.fly, cls: document.getElementById('stage').classList.contains('cad-flying'), hh: window.JEKcad.view.hh }));
    ok('Fly (the bird in the bar): W moves the camera forwards, the mouse turns it, Esc lands and the view carries on from there', f0 && f0.cls && /W A S D/.test(f0.hint) && f1 && Math.hypot(...f1.pos.map((x, i) => x - f0.pos[i])) > 1 && !f2.fly && !f2.cls && f2.hh > 0, JSON.stringify([f0, f1, f2]));
    // ---- a double-click on a plane starts a sketch on it; what a point is inferred from ----
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    // a plane is picked anywhere in it, and where two overlap on screen, the one in front there
    const inPl = await p.evaluate(() => { const J = window.JEKcad, at = w => J.project(w).slice(0, 2), k = w => { const h = J.pickHere(...at(w)); return h && h.kind === 'plane' ? h.std : null; }; return [k([12, -12, 0]), k([12, 0, 12]), k([0, -12, 12]), k([-12, 12, 0])]; });
    ok('A plane is picked anywhere inside it; where planes overlap on screen, the one nearest the eye', inPl[0] === 'top' && inPl[1] === 'front' && inPl[2] === 'right' && !!inPl[3], JSON.stringify(inPl));
    // the Front plane's border, in the view: found as a person's eye finds it
    const edgePt = await p.evaluate(() => { const J = window.JEKcad; for (let x = 20; x < J.view.w - 20; x += 3) for (let y = 20; y < J.view.h - 20; y += 3) { const k = J.overlayPick(x, y, 'any'); if (k && k.kind === 'plane' && k.std === 'front') return [x, y]; } return null; });
    const ob2 = await p.locator('#over').boundingBox();
    if (edgePt) await p.mouse.dblclick(ob2.x + edgePt[0], ob2.y + edgePt[1]);
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    const onFront = await p.evaluate(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.f.plane.std);
    await p.click('#sketchCancel'); await regen();
    await p.dblclick('.cad-frow-p[data-plane="top"] .nm');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(200);
    const onTop = await p.evaluate(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.f.plane.std);
    ok('A double-click on a plane starts a sketch on it: the Front plane’s border in the view, the Top plane’s row in the list', onFront === 'front' && onTop === 'top', JSON.stringify([edgePt, onFront, onTop]));
    // a circle, then a line that comes to it nearly touching: ended where it touches, and tangent
    await p.keyboard.press('c'); await clickUV([0, 0]); await clickUV([10, 0]);
    await p.keyboard.press('l'); await clickUV([-30, 10.4]); await clickUV([0.5, 10.3]);
    await p.mouse.click(ob2.x + 60, ob2.y + ob2.height - 60, { button: 'right' });
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, l = f.ents.find(e => e.t === 'line'), c = f.ents.find(e => e.t === 'circle'); const d = [l.b[0] - l.a[0], l.b[1] - l.a[1]], n = Math.hypot(...d); return { cons: f.cons.map(x => x.t), gap: +(Math.abs((c.c[0] - l.a[0]) * d[1] - (c.c[1] - l.a[1]) * d[0]) / n - c.r).toFixed(6), on: +(Math.hypot(l.b[0] - c.c[0], l.b[1] - c.c[1]) - c.r).toFixed(6) }; });
    ok('A line drawn to a circle, nearly touching it, ends where it touches and is held tangent', sk.cons.includes('tangent') && sk.cons.includes('oncurve') && sk.gap === 0 && sk.on === 0, JSON.stringify(sk));
    // a point placed nearly level with the circle's centre and nearly above the line's start: held level and in line
    await p.keyboard.press('p'); await clickUV([-30.3, 0.3]);
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, q = f.ents.find(e => e.t === 'point'), l = f.ents.find(e => e.t === 'line'); return { c: q.c.map(v => +v.toFixed(5)), lx: +l.a[0].toFixed(5), cons: f.cons.slice(-2).map(x => x.t).sort().join() }; });
    ok('A point placed nearly level with one point and nearly above another is held level with the one and in line with the other', sk.c[1] === 0 && sk.c[0] === sk.lx && sk.cons === 'horizontal,vertical', JSON.stringify(sk));
    await shot(p, 'jekcad-inference');
    await p.click('#sketchCancel'); await regen();
    // sizes typed as a shape is drawn: a line 35 long the way the pointer goes, then 20 up; a rectangle 50 by 30; a circle of 12
    await p.dblclick('.cad-frow-p[data-plane="top"] .nm');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(200);
    const moveUV = async uv => { const q = await uvXY(uv); await p.mouse.move(q[0], q[1], { steps: 3 }); await p.waitForTimeout(40); };
    await clickUV([0, 0]); await moveUV([22, 0.3]); await p.keyboard.type('35'); await p.keyboard.press('Enter');
    await moveUV([35.2, 12]); await p.keyboard.type('20'); await p.keyboard.press('Enter');
    await p.mouse.click(ob2.x + 60, ob2.y + ob2.height - 60, { button: 'right' });
    await p.keyboard.press('r'); await clickUV([-40, -30]); await moveUV([-20, -22]); await p.keyboard.type('50'); await p.keyboard.press('Tab'); await p.keyboard.type('30'); await p.keyboard.press('Enter');
    await p.keyboard.press('c'); await clickUV([-30, 30]); await moveUV([-25, 31]); await p.keyboard.type('12'); await p.keyboard.press('Enter');
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, r = v => +v.toFixed(4); return { lines: f.ents.filter(e => e.t === 'line').slice(0, 2).map(e => [...e.a, ...e.b].map(r).join()), rect: f.ents.filter(e => e.t === 'line')[2].b.map(r).join(), circ: r(f.ents.find(e => e.t === 'circle').r), dims: f.dims.map(d => d.t + '=' + d.x).join(), box: !!document.getElementById('sizeInput') }; });
    ok('Sizes typed while drawing: a line 35 long then one 20 up, each dimensioned; a rectangle 50 × 30 (Tab between); a circle of diameter 12', sk.lines[0] === '0,0,35,0' && sk.lines[1] === '35,0,35,20' && sk.rect === '10,-30' && sk.circ === 6 && sk.dims === 'len=35,len=20,len=50,len=30,dia=12' && !sk.box, JSON.stringify(sk));
    // Shift held: nothing inferred (a line that would have been horizontal is left as drawn)
    await p.keyboard.press('l'); await p.keyboard.down('Shift'); await clickUV([-40, 10]); await clickUV([-20, 10.2]); await p.keyboard.up('Shift');
    await p.mouse.click(ob2.x + 60, ob2.y + ob2.height - 60, { button: 'right' });
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, l = f.ents.filter(e => e.t === 'line').pop(); return { y: +l.b[1].toFixed(3), cons: f.cons.filter(c => c.r.some(r => r.e === l.id)).map(c => c.t).join() }; });
    ok('Shift held while drawing: nothing is inferred', sk.y === 10.2 && sk.cons === '', JSON.stringify(sk));
    await p.click('#sketchCancel'); await regen();
    // two circles that overlap, extruded: every region starts chosen, and a click in the view takes one out
    await p.dblclick('.cad-frow-p[data-plane="top"] .nm');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(200);
    await p.keyboard.press('c'); await clickUV([-10, 0]); await moveUV([-5, 3]); await p.keyboard.type('30'); await p.keyboard.press('Enter');
    await clickUV([10, 0]); await moveUV([15, 3]); await p.keyboard.type('30'); await p.keyboard.press('Enter');
    await p.click('#sketchOk'); await regen();
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '10'); await p.waitForTimeout(400);
    const r0 = await p.evaluate(() => ({ n: window.JEKcad.app.editing.f.regions.length, field: window.JEKcad.app.editing.field && window.JEKcad.app.editing.field.key }));
    const lens = await xy([0, 0, 0]); await p.mouse.move(lens[0], lens[1], { steps: 3 }); await p.waitForTimeout(80); await p.mouse.click(lens[0], lens[1]);
    await p.waitForTimeout(400);
    const r1 = await p.evaluate(() => window.JEKcad.app.editing.f.regions.length);
    await p.click('#featureOk'); await regen();
    const lensA = 2 * 225 * Math.acos(10 / 15) - 20 * Math.sqrt(225 - 100);
    v = await vol();
    ok('Extrude starts with every region of the sketch and its regions ready to click: the middle one clicked is left out', r0.n === 3 && r0.field === 'regions' && r1 === 2 && near(v, (2 * Math.PI * 225 - 2 * lensA) * 10, 2), JSON.stringify([r0, r1]) + ' volume ' + v);

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
