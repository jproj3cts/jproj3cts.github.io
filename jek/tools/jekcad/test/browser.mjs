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
    const cubeClick = async (k, su, sv) => { const cb = await p.locator('#viewCube canvas').boundingBox(); const at = await p.evaluate(([k2, su2, sv2]) => { let sx = 0, sy = 0, n = 0; for (let x = 1; x < 76; x += 1) for (let y = 1; y < 76; y += 1) { const h = window.JEKcad.cubePart(x, y); if (h && h.k === k2 && h.su === su2 && h.sv === sv2) { sx += x; sy += y; n++; } } return n ? [sx / n, sy / n, n] : null; }, [k, su, sv]); if (at) { await p.mouse.move(cb.x + at[0] * cb.width / 76, cb.y + at[1] * cb.height / 76); await p.mouse.click(cb.x + at[0] * cb.width / 76, cb.y + at[1] * cb.height / 76); } await p.waitForTimeout(400); return at; };
    const zOut = () => p.evaluate(() => { const v = window.JEKcad.view, z = [2 * (v.q[0] * v.q[2] + v.q[3] * v.q[1]), 2 * (v.q[1] * v.q[2] - v.q[3] * v.q[0]), 1 - 2 * (v.q[0] ** 2 + v.q[1] ** 2)]; return z.map(x => +x.toFixed(3)); });
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    await cubeClick('front', 0, 0);
    await p.waitForTimeout(400);
    const front = await p.evaluate(() => { const v = window.JEKcad.view, z = [2 * (v.q[0] * v.q[2] + v.q[3] * v.q[1]), 2 * (v.q[1] * v.q[2] - v.q[3] * v.q[0]), 1 - 2 * (v.q[0] ** 2 + v.q[1] ** 2)]; return z.map(x => +x.toFixed(3)); });
    ok('The view cube: Front looks along +y', near(front[1], -1, 1e-3), JSON.stringify(front));
    // an edge and a corner of the cube look from between its faces; the arrows turn the view 15° at a time
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    const edgeAt = await cubeClick('top', 0, -1) || await cubeClick('top', -1, 0) || await cubeClick('top', 1, 0) || await cubeClick('top', 0, 1);
    const zEdge = await zOut();
    await p.evaluate(() => window.JEKcad.viewFrom('front')); await p.waitForTimeout(300);
    await p.click('.cad-turn.right'); await p.waitForTimeout(100);
    const zTurn = await zOut();
    await p.click('.cad-turn.up'); await p.waitForTimeout(100);
    const zUp = await zOut();
    ok('The view cube: a strip along an edge looks from between two faces; the arrows turn the view 15° across and up', !!edgeAt && near(Math.abs(zEdge[2]), Math.SQRT1_2, 2e-3) && zEdge.filter(v => Math.abs(v) < 1e-3).length === 1 && near(Math.abs(zTurn[0]), Math.sin(15 * Math.PI / 180), 2e-3) && near(zTurn[2], 0, 2e-3) && near(Math.abs(zUp[2]), Math.sin(15 * Math.PI / 180), 2e-3), JSON.stringify([edgeAt, zEdge, zTurn, zUp]));
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
    if (big) { await p.mouse.dblclick(ob.x + big[0], ob.y + big[1]); await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => {}); if (await p.$('#dimInput')) { await p.fill('#dimInput', '400'); await p.keyboard.press('Enter'); await p.waitForFunction(() => { const J = window.JEKcad; return !J.app.busy && J.app.result && Math.abs(J.app.result.parts.reduce((t, x) => t + x.volume, 0) - 160000) < 1; }, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(400); } }
    const inView = await p.evaluate(() => { const J = window.JEKcad; return { n: J.sk.mlabels.length, in: J.sk.mlabels.every(b => b.x0 > 0 && b.x1 < J.view.w && b.y0 > 0 && b.y1 < J.view.h) }; });
    { const vBig = await vol(); ok('A dimension typed on the model that grows the part past the view’s edge: the view fits it again', inView.n === 2 && inView.in && near(vBig, 400 * 40 * 10, 1e-3), JSON.stringify(inView) + ' volume ' + vBig); }
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
    // regions clicked in the view: each click adds one or takes it out, the others stay; a click on nothing empties
    await p.evaluate(() => window.JEKcad.viewFrom('top')); await p.waitForTimeout(300);
    const cl = async w => { const q = await xy(w); await p.mouse.move(q[0], q[1], { steps: 2 }); await p.waitForTimeout(60); await p.mouse.click(q[0], q[1]); await p.waitForTimeout(60); };
    const nsel = () => p.evaluate(() => window.JEKcad.app.sel.filter(x => x.kind === 'region').length);
    await cl([-20, 0, 0]); await cl([20, 0, 0]); const s2 = await nsel();
    await cl([0, 0, 0]); const s3 = await nsel();
    await cl([-20, 0, 0]); const s2b = await nsel();
    await p.mouse.click(ob2.x + 40, ob2.y + ob2.height - 40); await p.waitForTimeout(60); const s0 = await p.evaluate(() => window.JEKcad.app.sel.length);
    ok('Clicking regions adds each to the selection, clicking one again takes it out, and a click on nothing empties it', s2 === 2 && s3 === 3 && s2b === 2 && s0 === 0, JSON.stringify([s2, s3, s2b, s0]));
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '10'); await p.waitForTimeout(400);
    const r0 = await p.evaluate(() => ({ n: window.JEKcad.app.editing.f.regions.length, field: window.JEKcad.app.editing.field && window.JEKcad.app.editing.field.key }));
    const lens = await xy([0, 0, 0]); await p.mouse.move(lens[0], lens[1], { steps: 3 }); await p.waitForTimeout(80); await p.mouse.click(lens[0], lens[1]);
    await p.waitForTimeout(400);
    const r1 = await p.evaluate(() => window.JEKcad.app.editing.f.regions.length);
    await p.click('#featureOk'); await regen();
    const lensA = 2 * 225 * Math.acos(10 / 15) - 20 * Math.sqrt(225 - 100);
    v = await vol();
    ok('Extrude starts with every region of the sketch and its regions ready to click: the middle one clicked is left out', r0.n === 3 && r0.field === 'regions' && r1 === 2 && near(v, (2 * Math.PI * 225 - 2 * lensA) * 10, 2), JSON.stringify([r0, r1]) + ' volume ' + v);

    // ---- a plate with a hole; a sketch on it round the hole; mirror by its panel; the hole kept; the rest ----
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    await p.dblclick('.cad-frow-p[data-plane="top"] .nm');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(200);
    await p.click('[data-skgroup="rect"]'); await p.click('[data-skpick="crect"]');
    await clickUV([0, 0]); await moveUV([20, 12]); await p.keyboard.type('80'); await p.keyboard.press('Tab'); await p.keyboard.type('50'); await p.keyboard.press('Enter');
    await p.keyboard.press('c'); await clickUV([20, 0]); await moveUV([23, 2]); await p.keyboard.type('6'); await p.keyboard.press('Enter');
    await p.click('#sketchOk'); await regen();
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '5'); await p.waitForTimeout(300); await p.click('#featureOk'); await regen();
    // the material list stays open when clicked (the row is not redrawn under it), and the part is not selected by it
    await p.click('.cad-part select'); await p.waitForTimeout(150);
    const matOpen = await p.evaluate(() => ({ focus: document.activeElement && document.activeElement.tagName, sel: window.JEKcad.app.sel.length }));
    await p.keyboard.press('Escape');
    ok('The material list in a part’s row stays open when clicked', matOpen.focus === 'SELECT' && matOpen.sel === 0, JSON.stringify(matOpen));
    // orbit: about the part's upright axis, its middle staying where it is on the screen, though the view was panned
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    const ob3 = await p.locator('#over').boundingBox(), cx = ob3.x + ob3.width / 2, cy = ob3.y + ob3.height / 2;
    await p.mouse.move(cx, cy); await p.mouse.down({ button: 'middle' }); await p.mouse.move(cx + 180, cy - 120, { steps: 4 }); await p.mouse.up({ button: 'middle' });
    const eye = () => p.evaluate(() => { const J = window.JEKcad, q = J.view.q, mid = J.project([0, 0, 2.5]); return { up: +(1 - 2 * (q[0] * q[0] + q[1] * q[1])).toFixed(3), mid: mid.slice(0, 2).map(Math.round) }; });
    const ey0 = await eye();
    await p.mouse.move(cx, cy + 150); await p.mouse.down({ button: 'right' }); await p.mouse.move(cx - 160, cy + 90, { steps: 8 }); await p.mouse.up({ button: 'right' });
    const ey1 = await eye();
    await p.mouse.move(cx, cy + 100); await p.mouse.down({ button: 'right' }); await p.mouse.move(cx, cy + 900, { steps: 10 }); await p.mouse.up({ button: 'right' });
    const ey2 = await eye();
    ok('Right-drag turns the part about the screen’s own axes through its middle: the middle stays put on the screen (the view panned first), dragging up lowers the eye, and dragging on carries the view round', Math.hypot(ey1.mid[0] - ey0.mid[0], ey1.mid[1] - ey0.mid[1]) <= 2 && ey1.up < ey0.up && ey2.up !== ey1.up && Math.hypot(ey2.mid[0] - ey0.mid[0], ey2.mid[1] - ey0.mid[1]) <= 2, JSON.stringify([ey0, ey1, ey2]));
    // a sketch on the top face: a slot drawn round the hole; a loose line from it, its length then its angle typed
    await p.evaluate(() => window.JEKcad.viewFrom('iso')); await p.waitForTimeout(300);
    const tf2 = await xy([-20, -15, 5]); await p.mouse.click(tf2[0], tf2[1]); await p.waitForTimeout(100);
    await p.click('[data-feature="sketch"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(300);
    const rcl = async () => { const b = await p.locator('#over').boundingBox(); await p.mouse.click(b.x + 50, b.y + b.height - 50, { button: 'right' }); };
    await p.click('[data-sktool="slot"]'); await clickUV([8, 0.2]); await clickUV([30, 0.2]); await clickUV([30, 8]);
    await p.keyboard.press('l'); await p.keyboard.down('Shift'); await clickUV([-10, -20]); await clickUV([-25, -5]); await p.keyboard.up('Shift'); await rcl();
    await p.keyboard.press('l'); await clickUV([-10, -20]); await p.keyboard.down('Shift'); await clickUV([5, -12]); await p.keyboard.up('Shift'); await rcl();
    const pos = () => p.evaluate(() => { const f = window.JEKcad.app.sketch.f, ls = f.ents.filter(e => e.t === 'line' && !e.k && !e.ref); return { first: [...ls[ls.length - 2].a, ...ls[ls.length - 2].b], second: [...ls[ls.length - 1].a, ...ls[ls.length - 1].b] }; });
    const q0 = await pos();
    await p.keyboard.press('d'); await clickUV([-17.5, -12.5]); await clickUV([-2.5, -16]);
    const angShown = await p.evaluate(() => { const i = document.getElementById('dimInput'); return i ? parseFloat(i.value) : null; });
    if (await p.$('#dimInput')) { await p.fill('#dimInput', '60'); await p.keyboard.press('Enter'); }
    const q1 = await pos();
    const angNow = await p.evaluate(() => { const J = window.JEKcad, f = J.app.sketch.f, d = f.dims.find(x => x.t === 'ang'), b = J.sk.labels.find(x => x.item.t === 'dim' && x.item.id === d.id); return { v: d.v, label: !!b }; });
    ok('An angle between two lines that meet is the one inside their corner (about 107° as drawn), and typing 60 turns the line picked second while the first stays', angShown > 105 && angShown < 109 && angNow.v === 60 && angNow.label && q1.first.every((v, i) => Math.abs(v - q0.first[i]) < 1e-6) && Math.hypot(q1.second[2] - q0.second[2], q1.second[3] - q0.second[3]) > 1, JSON.stringify([angShown, angNow, q0, q1]));
    await shot(p, 'jekcad-angle');
    // Mirror: the tool, then the shapes, then the line, then Mirror
    await p.click('[data-skgroup="line"]'); await p.click('[data-skpick="cline"]'); await p.keyboard.down('Shift'); await clickUV([-35, 10]); await clickUV([-35, -22]); await p.keyboard.up('Shift'); await rcl();
    await p.keyboard.press('s'); await p.keyboard.press('Escape');
    await p.click('[data-sktool="mirror"]'); await p.waitForSelector('#skPanel', { timeout: 3000 }).catch(() => {});
    const mp0 = await p.evaluate(() => ({ ok: document.getElementById('mirrorOk').disabled, field: window.JEKcad.sk.mirror.field }));
    { const mids = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f, ls = f.ents.filter(e => e.t === 'line' && !e.k && !e.ref).slice(-2); return ls.map(l => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]); }); for (const q of mids) await clickUV(q); }
    await p.click('[data-mirror="line"]'); await clickUV([-35, 0]);
    const mp1 = await p.evaluate(() => ({ text: document.getElementById('skPanel').textContent, ok: document.getElementById('mirrorOk').disabled, n: window.JEKcad.app.sketch.f.ents.length }));
    await p.click('#mirrorOk'); await p.waitForTimeout(150);
    const mp2 = await p.evaluate(() => ({ n: window.JEKcad.app.sketch.f.ents.length, panel: !!document.getElementById('skPanel'), tool: window.JEKcad.sk.tool, sym: window.JEKcad.app.sketch.f.cons.filter(c => c.t === 'symmetric').length }));
    ok('Mirror opens a panel: the shapes clicked into it, then the mirror line, and nothing made until Mirror is pressed', mp0.ok && mp0.field === 'shapes' && /2 shapes/.test(mp1.text) && !mp1.ok && mp2.n === mp1.n + 2 && !mp2.panel && mp2.tool === 'select' && mp2.sym >= 2, JSON.stringify([mp0, mp1, mp2]));
    // finishing: the face's hole inside the slot is brought in, so the extrude of the slot leaves it open
    await p.click('#sketchOk'); await regen();
    const holeIn = await p.evaluate(() => { const f = window.JEKcad.app.doc.features[2]; return f.ents.filter(e => e.t === 'circle' && e.ref && !e.k).map(e => [...e.c, e.r].map(v => +v.toFixed(3)).join()); });
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '4'); await p.waitForTimeout(400);
    const exr = await p.evaluate(() => window.JEKcad.app.editing.f.regions.length);
    await p.click('#featureOk'); await regen();
    v = await vol();
    const slotA = 22 * 16 + Math.PI * 64 - Math.PI * 9;
    ok('A hole of the face inside what is drawn on it is brought into the sketch, and the extrude leaves it open', holeIn.join() === '20,0,3' && exr === 1 && near(v, 80 * 50 * 5 - Math.PI * 9 * 5 + slotA * 4, 2), JSON.stringify([holeIn, exr]) + ' volume ' + v);
    // a sketch double-clicked in the view opens to edit
    await p.hover('.cad-frow-f[data-i="2"]'); await p.click('.cad-frow-f[data-i="2"] .cad-eye'); await regen();
    await p.evaluate(() => window.JEKcad.viewFrom('top')); await p.waitForTimeout(300);
    const sl = await xy([-35, 0, 5]); await p.mouse.dblclick(sl[0], sl[1]);
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    ok('A double-click on a sketch in the view opens it to edit', await p.evaluate(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.f.name === 'Sketch 2'), 'not editing');
    await p.click('#sketchCancel').catch(() => {}); await regen();
    // a double-click on any row of the list edits it: two real clicks on the same row (the first picks it, and must not
    // replace the row under the pointer), a sketch and then an extrude
    const rowEl = await p.$('.cad-frow-f[data-i="2"]'), rb2 = await rowEl.boundingBox();
    await p.mouse.move(rb2.x + 60, rb2.y + rb2.height / 2); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(60);
    const sameRow = await p.evaluate(el => el.isConnected && el.classList.contains('picked'), rowEl);
    await p.mouse.down({ clickCount: 2 }); await p.mouse.up({ clickCount: 2 });
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    const rowSk = await p.evaluate(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.f.name);
    await p.click('#sketchCancel').catch(() => {}); await regen();
    await p.dblclick('.cad-frow-f[data-i="3"] .nm'); await p.waitForSelector('#featureOk', { timeout: 5000 }).catch(() => {});
    const rowEx = await p.evaluate(() => window.JEKcad.app.editing && window.JEKcad.app.editing.f.name), rowField = await p.evaluate(() => window.JEKcad.app.editing && window.JEKcad.app.editing.field && window.JEKcad.app.editing.field.key);
    if (await p.$('#featureCancel')) await p.click('#featureCancel');
    await regen();
    ok('A double-click on a row of the feature list edits it (the first click marks the row without remaking it): a sketch, an extrude, its regions ready to click', sameRow && rowSk === 'Sketch 2' && rowEx === 'Extrude 2' && rowField === 'regions', JSON.stringify([sameRow, rowSk, rowEx, rowField]));
    // a part deleted from its row's menu: a Delete part feature, and Undo brings the part back
    { const n0 = await p.evaluate(() => [window.JEKcad.app.result.parts.length, window.JEKcad.app.doc.features.length]);
      await p.click('.cad-part .cad-more[aria-label^="More for"]'); await p.click('.cad-rowmenu button:has-text("Delete part")'); await regen();
      const n1 = await p.evaluate(() => [window.JEKcad.app.result.parts.length, window.JEKcad.app.doc.features.length, window.JEKcad.app.doc.features.slice(-1)[0].type]);
      await p.keyboard.press('Escape'); await p.keyboard.press('Control+z'); await regen();
      const n2 = await p.evaluate(() => [window.JEKcad.app.result.parts.length, window.JEKcad.app.doc.features.length]);
      ok('Delete part, in a part’s menu: the part goes, a Delete part feature is in the list, and Undo brings it back', n1[0] === n0[0] - 1 && n1[1] === n0[1] + 1 && n1[2] === 'delete' && n2[0] === n0[0] && n2[1] === n0[1], JSON.stringify([n0, n1, n2])); }
    // a share link: the Part Studio written into the link, and read back from it by a fresh page
    const shBefore = await p.evaluate(async () => JSON.stringify(await window.JEKcad.readShare(await window.JEKcad.shareHash())));
    await p.click('#btnFile'); await p.click('#btnShare');
    await p.waitForFunction(() => document.getElementById('shareDialog').open, null, { timeout: 5000 }).catch(() => {});
    const link = await p.evaluate(() => document.getElementById('shareUrl').value);
    await p.click('#shareClose');
    const q2 = await b.newPage({ viewport: { width: 1200, height: 800 } });
    await q2.goto(link.replace('#p=', '?test#p='));
    await q2.waitForFunction(n => window.JEKcad && window.JEKcad.app.doc.features.length === n && window.JEKcad.app.regenCount > 0, JSON.parse(shBefore).features.length, { timeout: 60000 }).catch(() => {});
    const shAfter = await q2.evaluate(() => ({ text: window.JEKcad.text(), hash: location.hash }));
    await q2.close();
    ok('Share a link: the Part Studio travels in the link, and a fresh page opened at it has the same Part Studio', /#p=c[A-Za-z0-9_-]+$/.test(link) && shAfter.text === shBefore && !shAfter.hash, link.slice(0, 60) + ' … ' + link.length + ' chars; ' + (() => { let k = 0; while (k < shBefore.length && shBefore[k] === shAfter.text[k]) k++; return 'differs at ' + k + ': …' + shBefore.slice(Math.max(0, k - 60), k + 60) + '… / …' + shAfter.text.slice(Math.max(0, k - 60), k + 60) + '…'; })());
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
    // signed out for sure: looking is free, changing is not (Sketch asks for an account and nothing is started)
    {
      const q = await b.newPage({ viewport: { width: 1200, height: 800 } });
      await q.route('http://localhost:8787/**', r => { const req = r.request(), cors = { 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, If-Match' }; if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors }); return r.fulfill({ status: new URL(req.url()).pathname === '/v1/me' ? 401 : 200, contentType: 'application/json', headers: cors, body: JSON.stringify(new URL(req.url()).pathname === '/v1/me' ? { error: { code: 'signed_out', message: 'Sign in' } } : {}) }); });
      await q.goto(base + '/jek/tools/jekcad.html');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      await q.waitForTimeout(1500);
      await q.click('[data-feature="sketch"]'); await q.waitForTimeout(300);
      const gate = await q.evaluate(() => ({ dlg: !!(document.getElementById('cadSignIn') && document.getElementById('cadSignIn').open), title: (document.querySelector('#cadSignIn h2') || {}).textContent, editing: !!window.JEKcad.app.editing, sketch: window.JEKcad.sketchOn() }));
      await q.close();
      ok('Signed out: Sketch asks for a free account and starts nothing', gate.dlg && /needs a free account/.test(gate.title || '') && !gate.editing && !gate.sketch, JSON.stringify(gate));
    }
    const here = await routed('jekcad');
    ok('A part studio the API marked JEKray’s opens in JEKcad, by its content, and goes nowhere else', here.name === 'Routed studio' && !here.opened.length, JSON.stringify(here));
    for (const app of ['jekray', 'jekion', 'jekfilm']) {
      const r = await routed(app), last = r.opened.slice(-1)[0];
      ok('Opened by its link in ' + app + ': handed to JEKcad’s tab', last && last[0] === '/jek/tools/jekcad.html#cloud=bcad' && last[1] === 'jekcad', JSON.stringify(r.opened));
    }
  } catch (err) { ok('The suite ran to its end', false, err.message.split('\n').slice(0, 3).join(' ')); } finally { await b.close(); }
  return out;
}
