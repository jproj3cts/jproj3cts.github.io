/* The designers' work as JEKrayPro's, and exports as an account's (ui/pro.js): the reasons given, and the gates read
   from the modules' syntax trees. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from '../../vendor/acorn.mjs';
import * as walk from '../../vendor/acorn-walk.mjs';

// the sources read: jekray's src/, or a copy of it named by JEKRAY_SRC (to try the checks on an edited copy)
const srcUrl = p => process.env.JEKRAY_SRC ? pathToFileURL(join(process.env.JEKRAY_SRC, p)) : new URL('../../src/' + p, import.meta.url);
const readSrc = p => readFileSync(srcUrl(p), 'utf8');

// designWhyOf is a pure function: read it from the module's source, without the page it needs to load
const src = readSrc('ui/pro.js');
const body = src.slice(src.indexOf('export function designWhyOf'), src.indexOf('export const designWhy ='));
const designWhyOf = new Function(body.replace('export ', '') + '\nreturn designWhyOf;')();
const acctBody = src.slice(src.indexOf('export function acctWhyOf'), src.indexOf('export const acctWhy ='));
const acctWhyOf = new Function(acctBody.replace('export ', '') + '\nreturn acctWhyOf;')();

test('the designers’ work is open with a plan, and says how to get one without', () => {
  assert.equal(designWhyOf('', 'optimise a design'), '');
  assert.equal(designWhyOf('Sign in, top right, to use the cloud', 'optimise a design'), 'Sign in with JEKrayPro, top right, to optimise a design');
  assert.equal(designWhyOf('Needs JEKrayPro: subscribe from the account menu, or join a team with a plan', 'save drawings'),
    'JEKrayPro is needed to save drawings: subscribe from the account menu, or join a team with a plan');
});

test('an export needs an account only from someone signed out for sure: not while it is not known, nor with the API out of reach', () => {
  const what = 'export the layout', why = 'Needs a free account: sign in, top right, to export the layout';
  assert.equal(acctWhyOf(true, false, true, what), why, 'signed out, the API has said so');
  assert.equal(acctWhyOf(true, true, true, what), '', 'signed in (a free account or JEKrayPro)');
  assert.equal(acctWhyOf(true, false, false, what), '', 'not known yet, or the API out of reach');
  assert.equal(acctWhyOf(false, false, true, what), '', 'no accounts here: the tests, an embed');
});

/* ---- the gates, read from the modules' syntax trees rather than their text ---- */
const ASTS = new Map();
const astOf = p => { if (!ASTS.has(p)) ASTS.set(p, acorn.parse(readSrc(p), { ecmaVersion: 2024, sourceType: 'module' })); return ASTS.get(p); };
const GATES = ['designPro', 'designWhy'], ACCT = ['accountGate'];
/* a call of a gate (JEKrayPro's designPro / designWhy, or names given: the account's accountGate), with the reason given if one is asked for */
const isGate = (n, reason, names = GATES) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && names.includes(n.callee.name)
  && (reason === undefined || (n.arguments[0] && n.arguments[0].type === 'Literal' && n.arguments[0].value === reason));
const has = (node, pred) => { let found = false; walk.full(node, n => { if (pred(n)) found = true; }); return found; };
const hasGate = (node, reason, names) => has(node, n => isGate(n, reason, names));
/* the function named, however it is declared: function, export function, const arrow / function expression, method */
function fnOf(file, name) {
  let fn = null;
  walk.full(astOf(file), n => {
    if (fn) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) fn = n;
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && n.init && /Function/.test(n.init.type)) fn = n.init;
    else if ((n.type === 'MethodDefinition' || n.type === 'Property') && !n.computed && n.key && (n.key.name || n.key.value) === name && /Function/.test(n.value.type)) fn = n.value;
  });
  assert.ok(fn, file + ': ' + name + ' is found');
  return fn;
}
const exits = s => s && (s.type === 'ReturnStatement' || s.type === 'ThrowStatement' || (s.type === 'BlockStatement' && exits(s.body[s.body.length - 1])));
/* The gate, among the guards a body opens with: before any other side effect, the body is a run of
   guards (an `if (…) return / throw` with no else, e.g. `if (!WS) return false;`), plain `const`s worked
   out without waiting (`const why = designWhy(…)`, then `if (why) throw …`), and, for a gate that holds
   only in one case, an `if (…) { …guards… }` whose block opens with the gate. Returns the guard that holds
   the gate and the guards before it, or null if the gate is not there or comes only after something done. */
function gateIn(stmts, reason, names) {
  const before = [], held = new Set();
  for (const s of stmts) {
    if (s.type === 'IfStatement' && !s.alternate) {
      if (exits(s.consequent) && (hasGate(s.test, reason, names) || (s.test.type === 'Identifier' && held.has(s.test.name)))) return { guard: s, before };
      if (s.consequent.type === 'BlockStatement' && hasGate(s.consequent, undefined, names)) {
        // the gate holds in this case only: the block must open with it
        const inner = gateIn(s.consequent.body, reason, names);
        return inner && { guard: inner.guard, before: before.concat(s, inner.before) };
      }
      if (exits(s.consequent)) { before.push(s); continue; }
      return null;
    }
    if (s.type === 'VariableDeclaration' && s.kind === 'const' && !has(s, n => n.type === 'AwaitExpression' || n.type === 'AssignmentExpression' || n.type === 'UpdateExpression')) {
      for (const d of s.declarations) if (d.id.type === 'Identifier' && isGate(d.init, reason, names)) held.add(d.id.name);
      before.push(s); continue;
    }
    return null;
  }
  return null;
}
function assertGated(file, name, reason, names) {
  const fn = fnOf(file, name);
  const g = fn.body.type === 'BlockStatement' ? gateIn(fn.body.body, reason, names) : null;
  assert.ok(g, file + ': ' + name + ' asks for ' + (names === ACCT ? 'an account' : 'JEKrayPro') + (reason ? " ('" + reason + "')" : '') + ' before it does anything');
  return g;
}
/* each call of `callee` in the file is done only when the gate says yes: inside an `if (gate(…))`'s consequent */
function assertCallsGated(file, callee, reason) {
  let calls = 0;
  walk.fullAncestor(astOf(file), (n, st, anc) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== callee) return;
    calls++;
    const ok = anc.some((a, i) => a.type === 'IfStatement' && isGate(a.test, reason) && a.consequent === anc[i + 1]);
    assert.ok(ok, file + ': ' + callee + "() is called only after designPro('" + reason + "')");
  });
  assert.ok(calls > 0, file + ': ' + callee + '() is called');
}

test('each piece of the designers’ work asks for JEKrayPro before it is done, and the open parts do not', () => {
  assertGated('ui/lens-workspace.js', 'optStart');
  assertCallsGated('ui/lens-workspace.js', 'saveReport', 'save a design report');
  assertGated('ui/lens-tolerance.js', 'tolStart', 'tolerance a design');
  assertGated('ui/lens-drawing.js', 'saveDrawingSvg', 'save drawings');
  assertGated('ui/lens-drawing.js', 'saveDrawingsPdf', 'save drawings');
  assertGated('ui/rf-workspace.js', 'rwOptGo', 'optimise a design');
  assertGated('ui/rf-workspace.js', 'rwMcGo', 'tolerance a design');
  assertCallsGated('ui/rf-workspace.js', 'saveRfReport', 'save a design report');
  // a design (an assembly's parts) is JEKrayPro's to export; a lens or a mirror of the bench's own is anyone's
  const zx = assertGated('io/zmx-export.js', 'exportZmx', 'export a design');
  assert.ok(has(zx.guard.test, n => n.type === 'CallExpression' && n.callee.name === 'asmOfSelection'), 'exportZmx gates only a design (asmOfSelection)');
  // the RF designer's way to a lens that can be made and quoted, and the coating designer, are open to all
  for (const fn of ['rwSynthCard', 'rwMakeCard', 'rwApplySynth']) assert.ok(!hasGate(fnOf('ui/rf-workspace.js', fn)), fn + ' is not gated');
  assert.ok(!astOf('ui/coat-workspace.js').body.some(s => s.type === 'ImportDeclaration' && /(^|\/)pro\.js$/.test(s.source.value)), 'the coating designer is not gated');
});

test('share links are JEKrayPro’s: made through the API with a plan, the QR code a short link, old links still opened, /s/ forwarded', () => {
  const read = p => p.startsWith('src/') ? readSrc(p.slice(4)) : readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  const boot = read('src/ui/boot.js'), nf = read('../../../404.html');
  // signed out, Share asks for a sign-in first (or offers a file); signed in without a plan, it says JEKrayPro is needed
  const sl = assertGated('io/share.js', 'shareLink', 'share a link');
  assert.ok(sl.before.some(s => s.type === 'IfStatement' && has(s.test, n => n.type === 'BinaryExpression' && n.operator === '===' && n.left.name === 'account' && n.right.type === 'Literal' && n.right.value === null)
    && has(s.consequent, n => n.type === 'CallExpression' && n.callee.name === 'shareSignIn')), 'shareLink asks a signed-out person to sign in before the plan is asked for');
  assert.ok(has(sl.guard.test, n => n.type === 'Identifier' && n.name === 'short'), 'shareLink asks for JEKrayPro only for a short link (accounts on)');
  assert.ok(has(fnOf('io/share.js', 'shortLink'), n => n.type === 'CallExpression' && n.callee.name === 'api' && n.arguments[0] && n.arguments[0].value === '/v1/links'
    && n.arguments[1] && n.arguments[1].type === 'ObjectExpression' && n.arguments[1].properties.some(p => p.key.name === 'method' && p.value.value === 'POST')), "share links are made by POST /v1/links");
  const qr = assertGated('io/share.js', 'qrLink', 'make a QR code of the bench');
  assert.ok(qr.guard.consequent.type === 'ThrowStatement' || exits(qr.guard.consequent), 'qrLink throws the reason');
  assert.ok(qr.before.some(s => s.type === 'IfStatement' && has(s.test, n => n.type === 'CallExpression' && n.callee.name === 'accountsOn')), 'qrLink asks for JEKrayPro only with accounts on');
  // links opened: the short ones fetched, the long ones and the QR codes' /R/ read as before
  assert.match(boot, /#s=\(\[A-Za-z2-7\]\{10\}\)\$/);
  assert.match(boot, /#p=\(\[zjq\]\[A-Za-z0-9_-\]\+\)/);
  const m = /var short = (\/.*\/)\.exec\(path\);/.exec(nf);
  assert.ok(m, 'the 404 page forwards /s/');
  const re = eval(m[1]);
  assert.ok(re.test('/s/ABCDEFGHJK') && re.test('/S/abcdefghjk/') && !re.test('/s/ABC') && !re.test('/s/ABCDEFGHJ1'));
  assert.match(nf, /\/jek\/tools\/jekray\.html#s=" \+ short\[1\]\.toUpperCase\(\)/);
  assert.match(nf, /var bench = \/\^\\\/R\\\//);
  // My links in the cloud window: the person's links, opened, copied and deleted there, with their personal workspace only
  const cl = read('src/io/cloud.js');
  assert.match(cl, /P\.view === 'links' \? api\('\/v1\/me\/links'\)/);
  assert.match(cl, /wsInfo && wsInfo\.kind === 'personal' \? railBtn\('My links', 'link'/);
  assert.match(cl, /api\('\/v1\/links\/' \+ l\.id, \{ method: 'DELETE' \}\)/);
});

test('a script, in JavaScript or Python, runs from the Scripts window only with JEKrayPro', () => {
  // the window's Run (and Ctrl+Enter) asks scriptsWhy first; scriptsWhy is JEKrayPro's reason, outside the tests and without accounts
  assertGated('ui/scripts.js', 'run', undefined, ['scriptsWhy']);
  const ids = new Set();
  walk.full(fnOf('ui/scripts.js', 'scriptsWhy'), n => { if (n.type === 'Identifier') ids.add(n.name); else if (n.type === 'MemberExpression' && !n.computed) ids.add(n.property.name); });
  assert.ok(ids.has('proWhy'), 'scriptsWhy asks for JEKrayPro');
  // the window runs a script, in either language, only through that run: runScript is called nowhere else in it
  let calls = 0;
  walk.fullAncestor(astOf('ui/scripts.js'), (n, st, anc) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !['runScript', 'execScript', 'pyRun'].includes(n.callee.name)) return;
    const fns = anc.filter(a => /Function/.test(a.type));
    const inRun = anc.some((a, i) => a.type === 'VariableDeclarator' && a.id.name === 'run'), inRunScript = fns.some(f => f.id && ['runScript', 'execScript'].includes(f.id.name));
    assert.ok(inRun || inRunScript, 'ui/scripts.js: ' + n.callee.name + '() is called only from the window’s gated run, or from runScript itself');
    calls++;
  });
  assert.ok(calls >= 3, 'runScript, execScript and pyRun are called');
  // in the background: the script worker is sent a script to run only by runInWorker, which only runScript calls,
  // and it runs only what it is sent (execScript in its message handler); Stop and the warm-up run nothing
  const posts = [];
  for (const f of srcFiles(fileURLToPath(srcUrl('')))) {
    if (f === 'main.js' || f === 'worker-main.js') continue;
    walk.fullAncestor(astOf(f), (n, st, anc) => {
      if (n.type !== 'ObjectExpression' || !n.properties.some(p => p.key && (p.key.name || p.key.value) === 't' && p.value.type === 'Literal' && p.value.value === 'run')) return;
      const call = anc[anc.length - 2];
      if (!call || call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || call.callee.property.name !== 'postMessage') return;
      posts.push(f + ' ' + (anc.filter(a => a.type === 'FunctionDeclaration').map(a => a.id.name).pop() || '?'));
    });
  }
  assert.deepEqual(posts, ['ui/scripts.js runInWorker'], 'a run is posted to the script worker from runInWorker alone');
  const callers = [];
  walk.fullAncestor(astOf('ui/scripts.js'), (n, st, anc) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'runInWorker') callers.push(anc.filter(a => a.type === 'FunctionDeclaration').map(a => a.id.name).pop()); });
  assert.deepEqual(callers, ['runScript'], 'runInWorker is called from runScript alone');
  const inWorker = [];
  walk.fullAncestor(astOf('page/script-worker.js'), (n, st, anc) => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && ['execScript', 'pyRun', 'runScript'].includes(n.callee.name)) inWorker.push(n.callee.name + ' in ' + anc.filter(a => a.type === 'FunctionDeclaration').map(a => a.id.name).pop()); });
  assert.deepEqual(inWorker, ['execScript in scriptWorkerMain'], 'the worker runs a script only as its run message asks');
  for (const fn of ['stopScript', 'scriptWarm']) assert.ok(!has(fnOf('ui/scripts.js', fn), n => n.type === 'CallExpression' && n.callee.type === 'Identifier' && ['runScript', 'execScript', 'runInWorker', 'pyRun'].includes(n.callee.name)), fn + ' runs no script');
});

test('experimental features need only a signed-in account, not a plan', () => {
  // the gate wireCloud gives ui/experimental.js: it reads the account, and nothing of JEKrayPro's
  const set = [];
  walk.full(fnOf('io/cloud.js', 'wireCloud'), n => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'setExpGate') set.push(n); });
  assert.equal(set.length, 1, 'io/cloud.js: wireCloud sets the experimental gate once');
  const gate = set[0].arguments[0], ids = new Set();
  walk.full(gate, n => { if (n.type === 'Identifier') ids.add(n.name); });
  assert.ok(ids.has('account'), 'the experimental gate asks whether someone is signed in');
  for (const pro of ['proWhy', 'designPro', 'designWhy', 'newPlaces']) assert.ok(!ids.has(pro), 'the experimental gate does not ask for JEKrayPro (' + pro + ')');
});

/* ---- exports: an account's (a free one is enough); the bench's own .jekray file anyone's ---- */
const EXPORTS = [['io/layout.js', 'exportLayout', 'export the layout'], ['io/layout.js', 'exportScreen', 'export a screen\u2019s data'],
  ['io/cad-export.js', 'exportCad', 'export for CAD'], ['io/zmx-export.js', 'exportZmx', 'export an element'],
  ['ui/plots.js', 'savePlot', 'save plots'], ['ui/view3d.js', 'png', 'save a picture of the 3D view'], ['io/packs.js', 'makePack', 'make a part pack'],
  ['io/packs.js', 'packSave', 'make a part pack'], ['io/packs.js', 'packSignFile', 'make a part pack']];
// downloads that are not exports of images or data: the bench's .jekray file, and the scripts window's (JEKrayPro's already: a script's own code, a run's table);
// the designers' reports, whose every call is behind designPro (checked above)
const NOT_EXPORTS = new Set(['ui/actions.js saveFile', 'ui/scripts.js onclick', 'ui/lens-report.js saveReport', 'ui/rf-report.js saveRfReport']);
const srcFiles = (d, at = '') => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? srcFiles(join(d, f), at + f + '/') : f.endsWith('.js') ? [at + f] : []);

test('each export asks for an account before it does anything, and saving the bench as a .jekray file does not', () => {
  for (const [file, name, reason] of EXPORTS) assertGated(file, name, reason, ACCT);
  // a design's .zmx is still JEKrayPro's: after the account, the plan
  const zx = assertGated('io/zmx-export.js', 'exportZmx', 'export a design');
  assert.ok(zx.before.some(s => hasGate(s, 'export an element', ACCT)), 'exportZmx asks for an account first');
  // the .jekray file (Save, Save as a file, the prompts' file) and the download itself are gated by neither
  for (const [file, name] of [['ui/actions.js', 'saveFile'], ['ui/actions.js', 'downloadFile']])
    assert.ok(!hasGate(fnOf(file, name), undefined, [...GATES, ...ACCT, 'acctWhy']), file + ': ' + name + ' is not gated');
  // the gate is the account's alone: it asks nothing of JEKrayPro's
  const ids = new Set();
  walk.full(fnOf('ui/pro.js', 'accountGate'), n => { if (n.type === 'Identifier') ids.add(n.name); });
  for (const pro of ['proWhy', 'designPro', 'designWhy']) assert.ok(!ids.has(pro), 'accountGate does not ask for JEKrayPro (' + pro + ')');
});

test('every download in the tool is an export behind a gate, or one of the few that are not exports', () => {
  const root = fileURLToPath(srcUrl('.')), named = (fn, parent) => fn.id ? fn.id.name : parent && parent.type === 'VariableDeclarator' ? parent.id.name
    : parent && (parent.type === 'Property' || parent.type === 'MethodDefinition') ? parent.key.name || parent.key.value : '(anonymous)';
  let n = 0;
  for (const file of srcFiles(root)) {
    if (/^(main|worker-main)\.js$|^worker\//.test(file)) continue;
    const text = readSrc(file);
    if (!/downloadFile\(|download:/.test(text)) continue;
    walk.fullAncestor(astOf(file), (node, st, anc) => {
      const dl = (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'downloadFile')
        || (node.type === 'Property' && !node.computed && node.key.name === 'download');
      if (!dl || (file === 'ui/actions.js' && anc.some(a => a.type === 'FunctionDeclaration' && a.id.name === 'downloadFile'))) return;
      n++;
      const fns = anc.map((a, i) => /Function/.test(a.type) ? { fn: a, name: named(a, anc[i - 1]) } : null).filter(Boolean);
      const gated = fns.some(({ fn }) => fn.body.type === 'BlockStatement' && (gateIn(fn.body.body, undefined, ACCT) || gateIn(fn.body.body, undefined, GATES)));
      assert.ok(gated || fns.some(f => NOT_EXPORTS.has(file + ' ' + f.name)), file + ': a download in ' + (fns.map(f => f.name).reverse().join(' < ') || 'the module') + ' is behind no gate');
    });
  }
  assert.ok(n >= 12, 'the downloads are found (' + n + ')');
});
