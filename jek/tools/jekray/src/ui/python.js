/* ---------- Python for Scripts: Pyodide, fetched the first time a Python script runs ----------
   Pyodide 314.0.7 (MPL-2.0: CPython 3.14 built for WebAssembly), vendored as it was published under
   jek/assets/vendor/pyodide/, with NumPy's wheel beside it: separate files, replaceable, from this site and
   nowhere else. It runs in the script worker beside its own copy of the bench (page/script-worker.js), so the
   bench's calls are synchronous from Python there with no SharedArrayBuffer (which needs headers GitHub Pages
   does not send), and Stop ends it by ending the worker; or, run on the page, on the page's own thread.
   Everything crossing between the two languages crosses as JSON text, so no proxy is left behind by a run:
   the Python J sends its calls to pyBridge as text and gets text back. */

export const PY_DIR = '../assets/vendor/pyodide/314.0.7/';
// what comes down the first time (the loader, the interpreter, its standard library, the package list), and NumPy's wheel
export const PY_BYTES = 17931 + 1250344 + 9598218 + 2545637 + 119077;
const PY_FETCHED = 9598218 + 2545637 + 119077;      // the part of it fetched (the scripts are imported), followed as it comes
export const NUMPY_WHEEL = 'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl', NUMPY_BYTES = 2960568;

/* the Python side, run once as Python starts: J, log(), and _jekray_run(code) → the run as JSON text */
const PY_GLUE = String.raw`
import ast, contextlib, inspect, io, json, linecache, math, traceback
import _jekray

class BenchError(Exception):
    """A bench call that failed: no part of that name, a parameter it does not have."""

def _plain(v):
    # what JSON can carry: NumPy arrays and numbers as lists and numbers, tuples and sets as lists
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set, frozenset, range)):
        return [_plain(x) for x in v]
    tolist = getattr(v, 'tolist', None)
    if callable(tolist):
        return _plain(tolist())
    return str(v)

def _dumps(v):
    return json.dumps(_plain(v), allow_nan=True)

def _answer(text):
    d = json.loads(text)
    if 'error' in d:
        raise BenchError(d['error'])
    return d.get('value')

def _call(name, *args):
    out = _jekray.call(name, _dumps(list(args)))
    if isinstance(out, str):
        return _answer(out)
    async def later():
        return _answer(await out)
    return later()

def _cell(v):
    # as JavaScript's log() writes a value: numbers to six figures, lists and dicts as JSON
    v = _plain(v)
    if isinstance(v, bool) or v is None:
        return repr(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return f'{v:.6g}' if math.isfinite(v) else repr(v)
    if isinstance(v, str):
        return v
    return json.dumps(v)

class _Bench:
    """The bench, as JavaScript's J is: the same calls, taking parts by name, giving dicts and lists."""
    def __init__(self, calls):
        self._calls = frozenset(calls)
    def __getattr__(self, name):
        if name.startswith('_') or name not in self._calls:
            raise AttributeError(f'J has no call {name!r}')
        return lambda *args: _call(name, *args)
    def __dir__(self):
        return sorted(self._calls | {'elements', 'element', 'get', 'set', 'range', 'sweep', 'csv'})
    def elements(self):
        return _call('elements')
    def element(self, name):
        return _call('element', name)
    def get(self, name, path):
        return _call('get', name, path)
    def set(self, name, path, value):
        _call('set', name, path, value)
        return self
    def range(self, a, b, n):
        n = max(2, math.floor(n + 0.5))
        return [a + (b - a) * i / (n - 1) for i in range(n)]
    def sweep(self, name, path, values, read):
        # each value set, read(value) called, and the parameter put back: rows of {path: value, ...what was read}
        was, rows = self.get(name, path), []
        try:
            for v in values:
                v = _plain(v)
                self.set(name, path, v)
                r = _plain(read(v))
                row = {path: v}
                row.update(r if isinstance(r, dict) else {'value': r})
                rows.append(row)
        finally:
            self.set(name, path, was)
        return rows
    def csv(self, rows):
        return _call('csv', rows)

def _shown(v):
    # what a run shows: a dict of equal-length lists becomes rows, as a table
    v = _plain(v)
    if isinstance(v, dict) and v and all(isinstance(c, list) for c in v.values()):
        n = {len(c) for c in v.values()}
        if len(n) == 1 and n != {0}:
            keys = list(v)
            return [{k: v[k][i] for k in keys} for i in range(n.pop())]
    return v

def _imports(code):
    # the top-level packages a script imports, as JSON (none when it does not parse: the run says why)
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return '[]'
    names = {a.name.split('.')[0] for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    names |= {n.module.split('.')[0] for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module and not n.level}
    return json.dumps(sorted(names))

class _Out(io.StringIO):
    # what log() and print() write, kept; each line also handed on as it is finished (the script worker streams it)
    def __init__(self):
        super().__init__()
        self._part = ''
    def write(self, s):
        n = super().write(s)
        self._part += s
        if '\n' in self._part:
            *done, self._part = self._part.split('\n')
            for line in done:
                _jekray.line(line)
        return n

async def _jekray_run(code, calls):
    out, shown, err, tb = _Out(), None, None, None
    def log(*args):
        out.write(' '.join(_cell(a) for a in args) + '\n')
    ns = {'__name__': '__main__', 'J': _Bench(json.loads(calls)), 'log': log, 'BenchError': BenchError}
    linecache.cache['<script>'] = (len(code), None, code.splitlines(True), '<script>')
    try:
        tree = ast.parse(code, '<script>')
        last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        flags, value = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, None
        with contextlib.redirect_stdout(out):
            body = compile(tree, '<script>', 'exec', flags=flags)
            r = eval(body, ns)
            if body.co_flags & inspect.CO_COROUTINE:
                await r
            if last is not None:
                tail = compile(ast.Expression(last.value), '<script>', 'eval', flags=flags)
                value = eval(tail, ns)
                if tail.co_flags & inspect.CO_COROUTINE or inspect.iscoroutine(value):
                    value = await value
        # what to show: result, if the script set it; else the last line's value, as a notebook's cell shows it
        shown = _shown(ns['result'] if 'result' in ns else value)
    except (Exception, SystemExit) as e:
        if isinstance(e, ModuleNotFoundError) and (e.name or '').split('.')[0] != 'numpy':
            e2 = ModuleNotFoundError(f'No module named {e.name!r}: only the standard library and NumPy are available on the bench', name=e.name)
            e2.__traceback__ = e.__traceback__
            e = e2
        te = traceback.TracebackException.from_exception(e)
        te.stack = traceback.StackSummary.from_list([f for f in te.stack if f.filename == '<script>'])
        err = ''.join(te.format_exception_only()).strip().splitlines()[-1]
        if isinstance(e, SyntaxError) and "'return' outside function" in str(e):
            err += ' (in Python, set result to what to show, or end with it)'
        tb = ''.join(te.format()).rstrip()
    finally:
        linecache.cache.pop('<script>', None)
    return json.dumps({'result': shown, 'logs': out.getvalue().splitlines(), 'error': err, 'traceback': tb}, allow_nan=True, default=str)
`;

/* JSON as Python reads it: NaN and the infinities as its words for them, typed arrays as lists */
export function pyJson(v) {
  const s = JSON.stringify(v === undefined ? null : v, (k, x) => (typeof x === 'number' && !isFinite(x) ? '\u0000' + x
    : ArrayBuffer.isView(x) && !(x instanceof DataView) ? Array.from(x) : typeof x === 'bigint' ? String(x) : x));
  return s.replace(/"\\u0000(NaN|-?Infinity)"/g, '$1');
}
/* JSON as Python writes it (NaN, Infinity, -Infinity among its numbers), as JavaScript's values */
export function pyParse(text) {
  const marked = text.replace(/"(?:[^"\\]|\\.)*"|(-?Infinity|NaN)/g, (m, t) => (t ? '"\\u0000' + t + '"' : m));
  return JSON.parse(marked, (k, v) => (typeof v === 'string' && /^\u0000(NaN|-?Infinity)$/.test(v) ? Number(v.slice(1)) : v));
}

let pyodide = null, pyBase = '', pyLoading = null, pyRunFn = null, pyImportsFn = null, pyJ = null, numpyIn = false, pyOnLine = null;
/* the Python J's calls, as JSON text in and out: { value } or { error }; a promise's answer comes later */
function pyBridge(name, text) {
  const fail = err => pyJson({ error: (err && err.message) || String(err) });
  try {
    if (!pyJ || typeof pyJ[name] !== 'function') throw new Error('J has no call ' + name);
    const v = pyJ[name](...pyParse(text));
    if (v && typeof v.then === 'function') return v.then(x => pyJson({ value: x === pyJ ? null : x }), fail);
    return pyJson({ value: v === pyJ ? null : v });
  } catch (err) { return fail(err); }
}

/* the bytes fetched from dir as they come (Pyodide fetches its own files): until the returned function is called */
function pyWatch(dir, onBytes) {
  const was = globalThis.fetch;
  if (typeof was !== 'function' || !/^https?:/.test(dir)) return () => {};
  const watched = async (input, init) => {
    const res = await was(input, init), u = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!res.ok || !res.body || !new URL(u, location.href).href.startsWith(dir)) return res;
    const rd = res.body.getReader();
    const body = new ReadableStream({
      async pull(c) { const r = await rd.read(); if (r.done) c.close(); else { onBytes(r.value.length); c.enqueue(r.value); } },
      cancel(why) { return rd.cancel(why); },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  globalThis.fetch = watched;
  return () => { if (globalThis.fetch === watched) globalThis.fetch = was; };
}

/* Python, started once: its folder (a URL on the page; a path in Node) and say(text), told how it goes */
export function pyReady(say, dir) {
  if (pyodide) return Promise.resolve(pyodide);
  if (!pyLoading) {
    say = say || (() => {});
    const base = dir || new URL(PY_DIR, location.href).href, mb = (PY_BYTES / 1e6).toFixed(1);
    pyLoading = (async () => {
      let got = 0, last = 0;
      say('Fetching Python (' + mb + ' MB, once)…');
      const unwatch = pyWatch(base, n => {
        got += n;
        if (got >= PY_FETCHED) say('Starting Python…');
        else if (got - last > 262144) { last = got; say('Fetching Python: ' + Math.round(100 * got / PY_FETCHED) + '% of ' + mb + ' MB (once)…'); }
      });
      try {
        const { loadPyodide } = await import(base + 'pyodide.mjs');
        const py = await loadPyodide({ indexURL: base, packageBaseUrl: base, lockFileURL: base + 'pyodide-lock.json', stdin: () => null });
        say('Starting Python…');
        py.registerJsModule('_jekray', { call: pyBridge, line: text => { if (pyOnLine) pyOnLine(String(text)); } });
        py.runPython(PY_GLUE);
        pyRunFn = py.globals.get('_jekray_run'); pyImportsFn = py.globals.get('_imports');
        pyodide = py; pyBase = base;
        return py;
      } finally { unwatch(); }
    })();
    pyLoading.catch(() => { pyLoading = null; });
  }
  return pyLoading;
}

/* NumPy's wheel, loaded the first time a script imports it */
async function pyNumpy(py, base, say) {
  if (numpyIn) return;
  say('Fetching NumPy (' + (NUMPY_BYTES / 1e6).toFixed(1) + ' MB, once)…');
  let got = 0, last = 0;
  const unwatch = pyWatch(base, n => { got += n; if (got - last > 262144) { last = got; say('Fetching NumPy: ' + Math.min(100, Math.round(100 * got / NUMPY_BYTES)) + '% of ' + (NUMPY_BYTES / 1e6).toFixed(1) + ' MB (once)…'); } });
  let bad = '';
  try { await py.loadPackage('numpy', { checkIntegrity: true, messageCallback: () => {}, errorCallback: m => { bad = bad || m; } }); } finally { unwatch(); }
  if (!py.runPython('import importlib.util\nimportlib.util.find_spec("numpy") is not None')) throw new Error('NumPy could not be loaded' + (bad ? ' (' + bad + ')' : ''));
  numpyIn = true;
}

/* a Python script's text run against J: { result, logs, error, traceback }; Python is loaded first if it is not yet.
   onLine(text), if given, is told each line log() or print() finishes, as it is written */
export async function pyRun(code, J, say, dir, onLine) {
  say = say || (() => {});
  const py = await pyReady(say, dir);
  if (JSON.parse(pyImportsFn(String(code))).includes('numpy')) await pyNumpy(py, pyBase, say);
  pyJ = J; pyOnLine = onLine || null;
  try { return pyParse(await pyRunFn(String(code), JSON.stringify(Object.keys(J).filter(k => typeof J[k] === 'function')))); } finally { pyJ = null; pyOnLine = null; }
}

/* what Python holds, for the tests (a run should leave nothing behind): its objects, and the WebAssembly memory's size */
export const pyHeld = () => (pyodide ? { objects: pyodide.runPython('import gc\ngc.collect()\nlen(gc.get_objects())'), bytes: pyodide._module.HEAP8.length } : null);
