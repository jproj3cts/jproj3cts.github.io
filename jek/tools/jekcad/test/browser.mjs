/* JEKcad in a browser (Playwright): the Part Studio driven as a person would, with the mouse and the keys. A sketch
   drawn on the Top plane, constrained and dimensioned until it is fully defined; extruded; an edge filleted; the
   sketch edited and the model following; the rollback bar; saving and opening the .jekcad; STEP and STL out; the
   view cube, the display modes and the section view. check(pw, base, shots) returns [{ name, ok, why }]. */
import { readFileSync } from 'node:fs';
import { newDoc, newFeature } from '../src/core/doc.js';
import { rectSketch } from './node/helpers.mjs';

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
    // the curved arrows roll the view about the line of sight: the part turns the way the arrow points
    await p.evaluate(() => window.JEKcad.viewFrom('front')); await p.waitForTimeout(300);
    const rollAng = () => p.evaluate(() => { const o = window.JEKcad.project([0, 0, 0]), x = window.JEKcad.project([10, 0, 0]); return Math.atan2(x[1] - o[1], x[0] - o[0]) * 180 / Math.PI; });
    const roll0 = await rollAng(), zr0 = await zOut();
    await p.click('.cad-turn.cw'); await p.waitForTimeout(100);
    const roll1 = await rollAng(), zr1 = await zOut();
    await p.click('.cad-turn.ccw'); await p.click('.cad-turn.ccw'); await p.waitForTimeout(100);
    const roll2 = await rollAng();
    ok('The view cube: the curved arrows roll the view 15° clockwise and anticlockwise, the line of sight kept', near(roll1 - roll0, 15, 0.05) && near(roll2 - roll0, -15, 0.05) && zr0.every((v, i) => near(v, zr1[i], 1e-6)), JSON.stringify([roll0, roll1, roll2, zr0, zr1]));
    await p.evaluate(() => window.JEKcad.viewFrom('front')); await p.waitForTimeout(300);
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
    const lay = await p.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), sd = document.getElementById('side').getBoundingClientRect(); return { bottom: Math.round(innerHeight - st.bottom), tabs: Math.round(document.getElementById('tabBar').getBoundingClientRect().height), right: Math.round(innerWidth - st.right), gap: Math.round(st.left - sd.right) }; });
    await p.click('#sideTab');
    const wide = await p.evaluate(() => ({ left: Math.round(document.getElementById('stage').getBoundingClientRect().left), off: document.getElementById('cadMain').classList.contains('side-off'), exp: document.getElementById('sideTab').getAttribute('aria-expanded') }));
    await p.click('#sideTab');
    ok('The view fills the window to its edges, the tabs at its foot; the tab on the feature list closes it (the view takes its room) and opens it again', lay.bottom === 0 && lay.tabs > 20 && lay.tabs < 40 && lay.right === 0 && lay.gap === 0 && wide.left === 0 && wide.off && wide.exp === 'false' && await p.evaluate(() => !document.getElementById('cadMain').classList.contains('side-off')), JSON.stringify([lay, wide]));
    // a centre rectangle, sized by typing straight after it is drawn
    await p.click('[data-feature="sketch"]'); await p.click('.cad-frow-p[data-plane="top"]');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(150);
    await p.click('[data-skgroup="rect"]');
    const rmenu = await p.evaluate(() => ({ shown: !document.getElementById('skMenu-rect').hidden, items: [...document.querySelectorAll('#skMenu-rect [data-skpick]')].map(b => b.dataset.skpick).join() }));
    await p.click('[data-skpick="crect"]');
    const rbtn = await p.evaluate(() => ({ tool: window.JEKcad.sk.tool, on: !!document.querySelector('.cad-toolgroup [data-sktool="crect"].on'), hidden: document.getElementById('skMenu-rect').hidden }));
    ok('The rectangle button’s arrow lists the corner, the centre and the aligned rectangle and the slot; the one chosen becomes the button', rmenu.shown && rmenu.items === 'rect,crect,arect,slot' && rbtn.tool === 'crect' && rbtn.on && rbtn.hidden, JSON.stringify([rmenu, rbtn]));
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
    await p.waitForFunction(() => { const J = window.JEKcad; return !J.app.busy && (J.sk.mlabels || []).length === 2; }, null, { timeout: 8000 }).catch(() => {});
    const bigDbg = await p.evaluate(() => { const J = window.JEKcad; return { picked: J.app.picked, n: (J.sk.mlabels || []).length, feats: J.app.doc.features.map(f => f.id).join(), asm: !!J.app.asm }; });
    const big = await p.evaluate(() => { const J = window.JEKcad, f = J.app.doc.features[0], b = J.sk.mlabels.find(x => f.dims.find(d => d.id === x.dim).x === '80'); return b && [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; });
    if (big) { await p.mouse.dblclick(ob.x + big[0], ob.y + big[1]); await p.waitForSelector('#dimInput', { timeout: 3000 }).catch(() => {}); if (await p.$('#dimInput')) { await p.fill('#dimInput', '400'); await p.keyboard.press('Enter'); await p.waitForFunction(() => { const J = window.JEKcad; return !J.app.busy && J.app.result && Math.abs(J.app.result.parts.reduce((t, x) => t + x.volume, 0) - 160000) < 1; }, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(400); } }
    const inView = await p.evaluate(() => { const J = window.JEKcad; return { n: J.sk.mlabels.length, in: J.sk.mlabels.every(b => b.x0 > 0 && b.x1 < J.view.w && b.y0 > 0 && b.y1 < J.view.h) }; });
    { const vBig = await vol(); ok('A dimension typed on the model that grows the part past the view’s edge: the view fits it again', inView.n === 2 && inView.in && near(vBig, 400 * 40 * 10, 1e-3), JSON.stringify(inView) + ' volume ' + vBig + ' ' + JSON.stringify(bigDbg)); }
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
    await p.click('[data-skgroup="rect"]'); await p.click('[data-skpick="slot"]'); await clickUV([8, 0.2]); await clickUV([30, 0.2]); await clickUV([30, 8]);
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
    // ---- the further sketch tools: an ellipse, a spline closed on its start, a pattern by its panel; extruded ----
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    await p.dblclick('.cad-frow-p[data-plane="top"] .nm');
    await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(200);
    const pickTool = async (g, t) => { await p.click('[data-skgroup="' + g + '"]'); await p.click('[data-skpick="' + t + '"]'); };
    const groups = await p.evaluate(() => [...document.querySelectorAll('.cad-toolgroup .cad-caret')].map(b => b.dataset.skgroup).join());
    await pickTool('circle', 'ellipse'); await clickUV([-30, 25]); await clickUV([-18, 25.2]); await clickUV([-28, 31]);
    await pickTool('spline', 'spline'); for (const q of [[10, 20], [22, 30], [30, 18], [10.3, 20.2]]) await clickUV(q);
    await p.keyboard.press('c'); await clickUV([-30, -20]); await moveUV([-27, -19]); await p.keyboard.type('6'); await p.keyboard.press('Enter');
    await p.keyboard.press('s'); await p.keyboard.press('Escape');
    await pickTool('mirror', 'lpat'); await p.waitForSelector('#skPanel', { timeout: 3000 }).catch(() => {});
    await clickUV([-27, -20]); await p.fill('#sk-dx', '12'); await p.fill('#sk-dy', '0'); await p.fill('#sk-count', '4'); await p.click('#mirrorOk'); await p.waitForTimeout(150);
    sk = await p.evaluate(() => { const f = window.JEKcad.app.sketch.f; return { kinds: f.ents.map(e => e.t + (e.closed ? '!' : '')).join(), xs: f.ents.filter(e => e.t === 'circle').map(e => +e.c[0].toFixed(3)).join(), el: Math.abs(f.ents[0].rx - 12) < 0.01 && Math.abs(f.ents[0].rot) < 2, dias: f.dims.filter(d => d.t === 'dia').length }; });
    await p.click('#sketchOk'); await regen();
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.fill('#fd-depth', '2'); await p.waitForTimeout(400); await p.click('#featureOk'); await regen();
    const made = await p.evaluate(() => window.JEKcad.app.result.parts.map(x => +x.volume.toFixed(1)).sort((x, y) => x - y));
    ok('More sketch tools, from the arrows by their groups: an ellipse, a spline closed on its first point, a circle patterned four in a row by its panel; all extruded', /line,rect,circle,arc3,polygon,spline,point,use,trim,fillet,mirror/.test(groups) && sk.kinds === 'ellipse,spline!,circle,circle,circle,circle' && sk.xs === '-30,-18,-6,6' && sk.el && sk.dias === 4 && made.length === 6 && made.slice(0, 4).every(x => near(x, Math.PI * 9 * 2, 0.2)) && made.some(x => near(x, Math.PI * 12 * 5.97 * 2, 2)), JSON.stringify([groups, sk, made]));
    // a feature's dialog does not bring hidden sketches back into the view: only the one it uses shows
    await p.evaluate(() => window.JEKcad.load({ format: 'jekcad', features: [] })); await regen();
    for (const d of ['10', '20']) { await p.dblclick('.cad-frow-p[data-plane="top"] .nm'); await p.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(150); await p.keyboard.press('c'); await clickUV([0, 0]); await moveUV([3, 1]); await p.keyboard.type(d); await p.keyboard.press('Enter'); await p.click('#sketchOk'); await regen(); await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.waitForTimeout(300); await p.click('#featureOk'); await regen(); }
    await p.click('[data-feature="extrude"]'); await p.waitForSelector('#fd-depth'); await p.waitForTimeout(300);
    const fresh3 = await p.evaluate(() => ({ sketch: window.JEKcad.app.editing.f.sketch, n: window.JEKcad.app.editing.f.regions.length }));
    const shownNow = await p.evaluate(() => { const J = window.JEKcad, pts = [[2, 0, 0], [7, 0, 0]]; return pts.map(w => { const q = J.project(w); const k = J.overlayPick(q[0], q[1], 'regions'); return k ? k.sketch : null; }); });
    const sketchIds = await p.evaluate(() => window.JEKcad.app.doc.features.filter(f => f.type === 'sketch').map(f => f.id + ':' + !!f.hide));
    await p.click('#featureCancel'); await regen();
    ok('A new Extrude does not take up the sketch and regions of the one before (both sketches here are used), and its dialog brings no hidden sketch back into the view', sketchIds.every(x => /:true$/.test(x)) && new Set(shownNow.filter(Boolean)).size <= 1 && fresh3.sketch === null && fresh3.n === 0, JSON.stringify([shownNow, sketchIds, fresh3]));
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
      await q.waitForFunction(a => a === 'jekcad' ? window.JEKcad && window.JEKcad.app.doc && window.JEKcad.app.file.name === 'Routed studio' : window.__opened.length > 0, app, { timeout: 30000 }).catch(() => {});
      const res = await q.evaluate(a => ({ opened: window.__opened, name: a === 'jekcad' && window.JEKcad ? window.JEKcad.app.file.name : null }), app);
      await q.close();
      return res;
    };
    // Extrude straight from a face of the model: a face clicked with the dialog open, and a face chosen beforehand
    {
      const q = await b.newPage({ viewport: { width: 1200, height: 800 } });
      await q.goto(base + '/jek/tools/jekcad.html?test');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      const d = newDoc(), sk = rectSketch(d, 40, 20);
      d.features.push(sk, newFeature(d, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '10' }));
      await q.evaluate(t => window.JEKcad.load(JSON.parse(t)), JSON.stringify(d));
      const done = () => q.evaluate(() => Promise.race([window.JEKcad.regenDone(), new Promise(r => setTimeout(() => r('timeout'), 20000))]));
      const volq = () => q.evaluate(() => window.JEKcad.app.result.parts.reduce((s2, x) => s2 + x.volume, 0));
      const at = async w => { const r = await q.evaluate(w2 => window.JEKcad.project(w2), w); const box = await q.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };
      await done(); await q.evaluate(() => { window.JEKcad.viewFrom('iso'); window.JEKcad.fit(); }); await q.waitForTimeout(400);
      await q.click('[data-feature="extrude"]'); await q.waitForSelector('#fd-depth');
      const empty = await q.evaluate(() => { const f = window.JEKcad.app.editing.f; return !f.sketch && !f.faces.length; });
      const t1 = await at([20, 10, 10]); await q.mouse.move(t1[0], t1[1], { steps: 3 }); await q.mouse.click(t1[0], t1[1]); await q.waitForTimeout(300);
      const picked = await q.evaluate(() => { const f = window.JEKcad.app.editing.f; return { n: f.faces.length, sketch: f.sketch, text: document.querySelector('.cad-dialog, #featureDialog, body').textContent.includes('1 face of the model') }; });
      await q.fill('#fd-depth', '5'); await q.waitForTimeout(300); await q.click('#featureOk'); await done();
      await q.waitForFunction(() => Math.abs(window.JEKcad.app.result.parts.reduce((s2, x) => s2 + x.volume, 0) - 12000) < 1e-3, null, { timeout: 8000 }).catch(() => {});
      const v1 = await volq(), n1 = await q.evaluate(() => window.JEKcad.app.result.parts.length);
      // the side at x = 40 chosen first, then Extrude: it starts with that face
      const t2 = await at([40, 10, 7]); await q.mouse.move(t2[0], t2[1], { steps: 3 }); await q.mouse.click(t2[0], t2[1]); await q.waitForTimeout(200);
      await q.click('[data-feature="extrude"]'); await q.waitForSelector('#fd-depth');
      await q.waitForFunction(() => window.JEKcad.app.editing && window.JEKcad.app.editing.f.faces.length === 1, null, { timeout: 5000 }).catch(() => {});
      await q.fill('#fd-depth', '4'); await q.waitForTimeout(300); await q.click('#featureOk'); await done();
      await q.waitForFunction(() => Math.abs(window.JEKcad.app.result.parts.reduce((s2, x) => s2 + x.volume, 0) - 13200) < 1e-3, null, { timeout: 8000 }).catch(() => {});
      const v2 = await volq();
      // a feature clicked in the list tints the faces it made (the second extrude: the end at x = 44 and its four sides)
      const tinted = () => q.evaluate(() => { const o = [...window.JEKcad.view.parts.values()][0], c = o.userData.mesh.geometry.getAttribute('color').array, p0 = o.userData.p, b0 = o.userData.base; let n = 0; for (let i = 0; i < p0.faceGroups.length / 2; i++) { const v = p0.idx[p0.faceGroups[2 * i]] * 3; if (Math.abs(c[v] - b0.r) + Math.abs(c[v + 1] - b0.g) + Math.abs(c[v + 2] - b0.b) > 0.02) n++; } return n; });
      const t0 = await tinted();
      await q.locator('.cad-frow-f').nth(2).click(); await q.waitForTimeout(200);
      const tA = await tinted();
      await q.keyboard.press('Escape'); await q.waitForTimeout(150);
      const tB = await tinted();
      await q.close();
      ok('Extrude from a face of the model: the top clicked in the dialog goes up 5; a side chosen first goes out 4', empty && picked.n === 1 && !picked.sketch && picked.text && near(v1, 12000, 1e-3) && n1 === 1 && near(v2, 13200, 1e-3), JSON.stringify([empty, picked, v1, n1, v2]));
      ok('A feature clicked in the list tints the faces it made in the view; Esc clears it', t0 === 0 && tA >= 1 && tA <= 5 && tB === 0, JSON.stringify([t0, tA, tB]));
    }
    // Text, a conic and its rho, a spline's end made tangent to a line; then a silhouette and a pierce point from a cylinder
    {
      const q = await b.newPage({ viewport: { width: 1400, height: 880 } }), qe = [];
      q.on('pageerror', e => qe.push(e.message));
      await q.goto(base + '/jek/tools/jekcad.html?test');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      const done = () => q.evaluate(() => Promise.race([window.JEKcad.regenDone(), new Promise(r => setTimeout(() => r('timeout'), 20000))]));
      const uvq = async uv => { const r = await q.evaluate(u => window.JEKcad.toScreen(u), uv); const box = await q.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };
      const cl = async (uv, o) => { const a2 = await uvq(uv); await q.mouse.move(a2[0], a2[1], { steps: 3 }); await q.waitForTimeout(40); await q.mouse.click(a2[0], a2[1], o); };
      const grp = async (g, t) => { await q.click('[data-skgroup="' + g + '"]'); await q.click('[data-skpick="' + t + '"]'); };
      await q.click('[data-feature="sketch"]'); await q.click('.cad-frow-p[data-plane="top"]');
      await q.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
      await q.waitForTimeout(200);
      await grp('point', 'text'); await cl([-30, 10]);
      await q.waitForSelector('#skEdit', { timeout: 4000 }).catch(() => {});
      await q.fill('#ske-s', 'JEK 8'); await q.fill('#ske-h', '8'); await q.click('#skEditOk'); await q.waitForTimeout(200);
      const txt = await q.evaluate(() => window.JEKcad.app.sketch.f.ents.filter(e => e.t === 'text').map(e => e.s + '/' + e.h).join());
      await grp('spline', 'conic'); await cl([-30, -20]); await cl([10, -20]); await cl([-10, -2]);
      await q.click('[data-sktool="line"]').catch(() => grp('line', 'line')); await cl([-30, -20]); await cl([10, -20]); await q.mouse.click(1300, 800, { button: 'right' });
      // the conic double-clicked: its rho typed as 0.7
      await q.keyboard.press('s');
      const onC = await q.evaluate(() => { const e = window.JEKcad.app.sketch.f.ents.find(x => x.cn); return e && [0.25 * e.pts[0][0] + 0.5 * e.pts[1][0] + 0.25 * e.pts[2][0], 0.25 * e.pts[0][1] + 0.5 * e.pts[1][1] + 0.25 * e.pts[2][1]]; });
      const cs = await uvq(onC); await q.mouse.dblclick(cs[0], cs[1]);
      await q.waitForSelector('#ske-cn', { timeout: 4000 }).catch(() => {});
      if (await q.$('#ske-cn')) { await q.fill('#ske-cn', '0.7'); await q.keyboard.press('Enter'); }
      await q.waitForTimeout(200);
      const rho = await q.evaluate(() => (window.JEKcad.app.sketch.f.ents.find(x => x.cn) || {}).cn);
      await q.click('#sketchOk'); await done();
      await q.click('[data-feature="extrude"]'); await q.waitForSelector('#fd-depth'); await q.fill('#fd-depth', '3'); await q.waitForTimeout(300); await q.click('#featureOk'); await done();
      await q.waitForFunction(() => window.JEKcad.app.result.parts.length === 5, null, { timeout: 8000 }).catch(() => {});
      const made = await q.evaluate(() => ({ parts: window.JEKcad.app.result.parts.length, err: window.JEKcad.app.result.features.filter(f => f.ok === false).map(f => f.error) }));
      ok('Sketch text typed in its panel, and a conic with its rho set by a double-click: extruded, each letter and the conic a solid', txt === 'JEK 8/8' && rho === 0.7 && made.parts === 5 && !made.err.length && !qe.length, JSON.stringify([txt, rho, made, qe]));
      // a cylinder, and a sketch on Front: the round face's silhouette is two lines; its top edge pierces the plane twice
      const d = newDoc(), ck = newFeature(d, 'sketch', { plane: { std: 'top' }, ents: [{ id: 'c1', t: 'circle', c: [0, 0], r: 10 }], cons: [], dims: [] });
      d.features.push(ck, newFeature(d, 'extrude', { sketch: ck.id, regions: [[0, 0]], depth: '20' }));
      await q.evaluate(t => window.JEKcad.load(JSON.parse(t)), JSON.stringify(d)); await done();
      await q.click('[data-feature="sketch"]'); await q.click('.cad-frow-p[data-plane="front"]');
      await q.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
      await q.waitForTimeout(400);
      await grp('use', 'silh'); await cl([3, 10]); await q.waitForTimeout(300);
      const sil = await q.evaluate(() => window.JEKcad.app.sketch.f.ents.filter(e => e.ref && e.t === 'line').map(e => [+e.a[0].toFixed(2), +Math.abs(e.a[1] - e.b[1]).toFixed(2)]));
      // (the view turned a little, so the top edge is seen as a curve to click, not end on)
      await q.evaluate(() => { window.JEKcad.turnStep('up'); window.JEKcad.turnStep('up'); }); await q.waitForTimeout(300);
      await grp('use', 'pierce');
      const ep = await q.evaluate(() => { const r = window.JEKcad.project([0, -10, 20]); return r; }); const ob = await q.locator('#over').boundingBox();
      await q.mouse.move(ob.x + ep[0], ob.y + ep[1], { steps: 3 }); await q.waitForTimeout(80); await q.mouse.click(ob.x + ep[0], ob.y + ep[1]); await q.waitForTimeout(500);
      const pr = await q.evaluate(() => window.JEKcad.app.sketch.f.ents.filter(e => e.ref && e.t === 'point').map(e => [+e.c[0].toFixed(3), +e.c[1].toFixed(3), !!e.src]));
      await q.close();
      ok('Silhouette: a cylinder’s side seen from the front comes in as two lines at its radius, 20 tall; Pierce: its top edge goes through the plane at (±10, 20), points that keep the edge', sil.length === 2 && sil.every(l => near(Math.abs(l[0]), 10, 0.01) && near(l[1], 20, 0.01)) && pr.length === 2 && pr.every(x => near(Math.abs(x[0]), 10, 1e-3) && near(x[1], 20, 1e-3) && x[2]) && !qe.length, JSON.stringify([sil, pr, qe]));
    }
    // a picture to trace over, a Bézier curve made to run into a line (Curvature), a text in another font mirrored,
    // and a line made tangent to a spline part-way along it
    {
      const q = await b.newPage({ viewport: { width: 1400, height: 880 } }), qe = [];
      q.on('pageerror', e => qe.push(e.message));
      await q.goto(base + '/jek/tools/jekcad.html?test');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      const uvq = async uv => { const r = await q.evaluate(u => window.JEKcad.toScreen(u), uv); const box = await q.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };
      const cl = async (uv, o) => { const a2 = await uvq(uv); await q.mouse.move(a2[0], a2[1], { steps: 3 }); await q.waitForTimeout(40); await q.mouse.click(a2[0], a2[1], o); };
      const grp = async (g, t) => { await q.click('[data-skgroup="' + g + '"]'); await q.click('[data-skpick="' + t + '"]'); };
      const rc = () => q.mouse.click(1300, 800, { button: 'right' });
      const sel = ids => q.evaluate(i => { window.JEKcad.sk.sel = i.map(id => ({ t: 'ent', id })); }, ids);
      const entsOf = () => q.evaluate(() => window.JEKcad.app.sketch.f.ents.map(e => ({ id: e.id, t: e.t, cv: !!e.cv, font: e.font, my: !!e.my, w: e.w, k: !!e.k, n: e.pts ? e.pts.length : 0, pts: e.pts, a: e.a, b: e.b })));
      await q.click('[data-feature="sketch"]'); await q.click('.cad-frow-p[data-plane="top"]');
      await q.waitForFunction(() => window.JEKcad.sketchOn() && window.JEKcad.app.sketch.F, null, { timeout: 15000 }).catch(() => {});
      await q.waitForTimeout(200);
      // a 2 × 1 PNG, made here
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8z8Dwn4GBgYEJADEFAgHrdT0oAAAAAElFTkSuQmCC', 'base64');
      const [fc] = await Promise.all([q.waitForEvent('filechooser'), grp('use', 'image')]);
      await fc.setFiles({ name: 'plan.png', mimeType: 'image/png', buffer: png });
      await q.waitForSelector('#ske-w', { timeout: 5000 }).catch(() => {});
      if (await q.$('#ske-w')) { await q.fill('#ske-w', '60'); await q.click('#skEditOk'); }
      await q.waitForTimeout(200);
      const pic = (await entsOf()).filter(e => e.t === 'image');
      await grp('spline', 'bezier'); for (const u of [[-40, -10], [-30, -25], [-15, -28], [0, -20]]) await cl(u); await rc();
      await q.click('[data-sktool="line"]').catch(() => grp('line', 'line')); await cl([0, -20]); await cl([25, -20]); await rc();
      await q.keyboard.press('s');
      let E = await entsOf();
      await sel(E.filter(e => e.cv || e.t === 'line').map(e => e.id));
      await q.click('[data-con="curvature"]'); await q.waitForTimeout(300);
      const cons1 = await q.evaluate(() => window.JEKcad.app.sketch.f.cons.map(c => c.t));
      E = await entsOf(); const bz = E.find(e => e.cv), ln = E.find(e => e.t === 'line');
      const flat = bz && ln && bz.pts.slice(1).every(pt => Math.abs(pt[1] - ln.a[1]) < 1e-5);
      // a text in the serif font, mirrored in a construction line
      await grp('point', 'text'); await cl([10, 20]);
      await q.waitForSelector('#ske-font', { timeout: 4000 }).catch(() => {});
      await q.fill('#ske-s', 'R4'); await q.selectOption('#ske-font', 'serif'); await q.fill('#ske-h', '6'); await q.click('#skEditOk'); await q.waitForTimeout(200);
      await grp('line', 'cline'); await cl([40, 10]); await cl([40, 40]); await rc();
      await q.keyboard.press('s');
      E = await entsOf(); const tx = E.find(e => e.t === 'text'), ml = E.filter(e => e.t === 'line' && e.k).pop();
      await sel([tx.id]);
      await grp('mirror', 'mirror').catch(() => q.click('[data-sktool="mirror"]'));
      await q.click('[data-mirror="line"]'); const mm = await uvq([40, 25]); await q.mouse.click(mm[0], mm[1]); await q.waitForTimeout(100);
      await q.click('#mirrorOk'); await q.waitForTimeout(200);
      const texts = (await entsOf()).filter(e => e.t === 'text');
      ok('A picture put in to trace over (60 wide, construction); Curvature on a Bézier curve and a line it runs into flattens the curve’s end onto the line; a serif text mirrored is a second text, flipped', pic.length === 1 && pic[0].w === 60 && pic[0].k && cons1.includes('curvature') && cons1.includes('tangent') && flat && texts.length === 2 && texts[0].font === 'serif' && texts.some(t2 => t2.my) && !!ml && !qe.length, JSON.stringify([pic.map(x => [x.w, x.k]), cons1, flat, texts.map(t2 => [t2.font, t2.my]), qe]));
    }
    // a short link: with an account, the API keeps the Part Studio and the link is /c/ and ten capitals; opened at #s=
    {
      const q = await b.newPage({ viewport: { width: 1200, height: 800 } }), posts = [];
      let kept = null;
      await q.route('http://localhost:8787/**', async r => {
        const req = r.request(), path = new URL(req.url()).pathname, cors = { 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' };
        if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
        let body = {};
        if (path === '/v1/me') body = me;
        else if (path === '/v1/links' && req.method() === 'POST') { kept = JSON.parse(req.postData()); posts.push(kept.name); body = { id: 'ABCDE23456', name: kept.name }; }
        else if (path === '/v1/links/ABCDE23456') body = { id: 'ABCDE23456', name: kept.name, data: kept.data };
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
      });
      await q.goto(base + '/jek/tools/jekcad.html');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      await q.waitForTimeout(1500);
      const d = newDoc(); d.name = 'Short one'; const sk = rectSketch(d, 30, 20); d.features.push(sk, newFeature(d, 'extrude', { sketch: sk.id, regions: [[1, 1]], depth: '5' }));
      await q.evaluate(t => window.JEKcad.load(JSON.parse(t)), JSON.stringify(d));
      await q.evaluate(() => window.JEKcad.share()); await q.waitForTimeout(500);
      const url = await q.evaluate(() => document.getElementById('shareUrl').value);
      await q.evaluate(() => document.getElementById('shareDialog').close());
      await q.evaluate(() => { window.JEKcad.load({ name: 'Other' }); });
      await q.evaluate(() => { location.hash = '#s=ABCDE23456'; });
      await q.waitForFunction(() => window.JEKcad.app.file.name === 'Short one', null, { timeout: 10000 }).catch(() => {});
      const back = await q.evaluate(() => ({ name: window.JEKcad.app.file.name, n: window.JEKcad.app.doc.features.length, hash: location.hash }));
      await q.close();
      ok('Share with an account: a short link, /c/ and ten capitals, kept by the API; opened at #s= it brings the Part Studio back', /\/c\/ABCDE23456$/.test(url) && posts.join() === 'Short one' && /^c[A-Za-z0-9_-]+$/.test(kept.data) && back.name === 'Short one' && back.n === 2 && !back.hash, JSON.stringify([url, posts, back]));
    }
    // tabs and an assembly: a second tab made from the + at the bottom; two parts inserted; one dragged; a Fastened mate
    // sets it on the other; the Part Studio changed, the mate follows; the file keeps its tabs and reads back
    {
      const q = await b.newPage({ viewport: { width: 1400, height: 880 } }), qe = [];
      q.on('pageerror', e => qe.push(e.message));
      await q.goto(base + '/jek/tools/jekcad.html?test');
      await q.waitForFunction(() => window.JEKcad && window.JEKcad.view.ready && window.JEKcad.app.regenCount > 0, null, { timeout: 60000 }).catch(() => {});
      const settle = async () => { await q.waitForTimeout(250); await q.waitForFunction(() => !window.JEKcad.app.busy, null, { timeout: 20000 }).catch(() => {}); await q.waitForTimeout(150); };
      const at = async w => { const r = await q.evaluate(w2 => window.JEKcad.project(w2), w); const box = await q.locator('#over').boundingBox(); return [box.x + r[0], box.y + r[1]]; };
      const boxes = () => q.evaluate(() => window.JEKcad.app.result.parts.map(x => x.bbox.map(v => v.map(z => +z.toFixed(3)))));
      const d = newDoc(); d.name = 'Stack'; const s1 = rectSketch(d, 40, 20), s2 = rectSketch(d, 10, 10, null, [60, 0]);
      d.features.push(s1, newFeature(d, 'extrude', { sketch: s1.id, regions: [[1, 1]], depth: '10', op: 'new' }), s2, newFeature(d, 'extrude', { sketch: s2.id, regions: [[61, 1]], depth: '15', op: 'new' }));
      await q.evaluate(t => window.JEKcad.load(JSON.parse(t)), JSON.stringify(d)); await settle();
      const oneTab = await q.evaluate(() => ({ tabs: document.querySelectorAll('#tabBar [data-tab]').length, file: JSON.parse(window.JEKcad.text()).tabs === undefined }));
      await q.click('#tabAdd'); await q.click('.cad-tabmenu button:nth-child(2)'); await settle();
      const inAsm = await q.evaluate(() => ({ kinds: window.JEKcad.app.file.tabs.map(t => t.kind).join(), bar: !document.getElementById('asmBar').hidden && document.getElementById('featureBar').hidden, side: !document.getElementById('asmSide').hidden && document.getElementById('studioSide').hidden }));
      await q.click('[data-asm="insert"]'); await q.waitForSelector('.cad-insrow', { timeout: 15000 }).catch(() => {});
      const rows = await q.$$('.cad-insrow');
      if (rows.length === 2) { await rows[0].click(); await settle(); await rows[1].click(); await settle(); }
      await q.click('#asmInsertClose'); await settle();
      await q.evaluate(() => { window.JEKcad.viewFrom('iso'); window.JEKcad.fit(); }); await q.waitForTimeout(400);
      const b0 = await boxes(), inst0 = await q.evaluate(() => window.JEKcad.app.asm.instances.map(I => !!I.fixed));
      // the second part dragged by its top face: it moves, the first (fixed) does not
      const g = await at([(b0[1][0][0] + b0[1][1][0]) / 2, (b0[1][0][1] + b0[1][1][1]) / 2, b0[1][1][2]]);
      await q.mouse.move(g[0], g[1]); await q.mouse.down(); await q.mouse.move(g[0] + 60, g[1] - 20, { steps: 6 }); await q.mouse.up(); await settle();
      const b1 = await boxes();
      const dragged = Math.hypot(b1[1][0][0] - b0[1][0][0], b1[1][0][1] - b0[1][0][1], b1[1][0][2] - b0[1][0][2]) > 1 && JSON.stringify(b1[0]) === JSON.stringify(b0[0]);
      // Fastened: the small part's top face onto the big part's top (it turns over and sits on it)
      await q.click('[data-asm="fastened"]'); await q.waitForSelector('#matePanel');
      const c1 = await at([(b1[1][0][0] + b1[1][1][0]) / 2, (b1[1][0][1] + b1[1][1][1]) / 2, b1[1][1][2]]); await q.mouse.click(c1[0], c1[1]); await q.waitForTimeout(150);
      const c2 = await at([8, 14, 10]); await q.mouse.click(c2[0], c2[1]); await q.waitForTimeout(150);
      await q.click('#mateOk'); await settle();
      const b2 = await boxes(), mates = await q.evaluate(() => window.JEKcad.app.asm.mates.map(m => m.t).join());
      const sat = near(b2[1][0][2], 10, 1e-3) && near(b2[1][1][2], 25, 1e-3) && near((b2[1][0][0] + b2[1][1][0]) / 2, 20, 1e-3) && near((b2[1][0][1] + b2[1][1][1]) / 2, 10, 1e-3);
      // back in the Part Studio the plate is made 14 thick; in the assembly the small part sits on its new top
      await q.locator('#tabBar [data-kind="studio"]').first().click(); await settle();
      const inStudio = await q.evaluate(() => ({ parts: window.JEKcad.app.result.parts.length, bar: !document.getElementById('featureBar').hidden && document.getElementById('asmBar').hidden }));
      await q.evaluate(() => { const A = window.JEKcad; A.checkpoint(); A.app.doc.features[1].depth = '14'; A.changed(); }); await settle();
      await q.locator('#tabBar [data-kind="assembly"]').first().click(); await settle();
      const b3 = await boxes();
      const followed = near(b3[0][1][2], 14, 1e-3) && near(b3[1][0][2], 14, 1e-3) && near(b3[1][1][2], 29, 1e-3);
      // the file: version 2 with its tabs; read back, the assembly is as it was
      const text = await q.evaluate(() => window.JEKcad.text()), file = JSON.parse(text);
      await q.evaluate(t => window.JEKcad.load(JSON.parse(t)), text); await settle();
      const back = await q.evaluate(() => ({ name: window.JEKcad.app.file.name, tabs: window.JEKcad.app.file.tabs.map(t => t.kind).join(), asm: !!window.JEKcad.app.asm, n: window.JEKcad.app.result.parts.length }));
      const b4 = await boxes();
      await q.close();
      ok('One Part Studio is one tab and a file as before; + adds an Assembly, which has its own bar and list', oneTab.tabs === 1 && oneTab.file && inAsm.kinds === 'studio,assembly' && inAsm.bar && inAsm.side && !qe.length, JSON.stringify([oneTab, inAsm, qe]));
      ok('Insert puts two parts in (the first fixed); the other is dragged in the view; a Fastened mate sets it on the first', rows.length === 2 && inst0.join() === 'true,false' && dragged && mates === 'fastened' && sat, JSON.stringify([rows.length, inst0, dragged, mates, b0, b1, b2]));
      ok('The Part Studio changed (the plate 14 thick): its tab shows its features again, and back in the assembly the mate has followed; the file keeps its tabs and opens the same', inStudio.parts === 2 && inStudio.bar && followed && file.version === 2 && file.tabs.length === 2 && back.name === 'Stack' && back.tabs === 'studio,assembly' && back.asm && back.n === 2 && JSON.stringify(b4) === JSON.stringify(b3) && !qe.length, JSON.stringify([inStudio, followed, b3, file.version, back, qe]));
    }
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
