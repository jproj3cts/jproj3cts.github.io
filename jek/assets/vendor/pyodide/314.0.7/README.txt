Pyodide 314.0.7 (MPL-2.0), CPython 3.14.2 built for WebAssembly, with NumPy 2.4.6 built for it. Used by JEKray
to run scripts written in Python in File > Scripts... (jek/tools/jekray/src/ui/python.js).

Source: https://github.com/pyodide/pyodide (tag 314.0.7)
npm:    https://www.npmjs.com/package/pyodide (version 314.0.7): https://registry.npmjs.org/pyodide/-/pyodide-314.0.7.tgz
Release: https://github.com/pyodide/pyodide/releases/download/314.0.7/pyodide-314.0.7.tar.bz2
        (sha256 192b5864e6e6d30ab074861af800cb8b4acb0998ef0f9342c3367448aeb86645), the full distribution, from
        which only the NumPy wheel was taken; the other files are the same, byte for byte, in the npm package.
CPython: https://github.com/python/cpython (tag v3.14.2)    NumPy: https://github.com/numpy/numpy (tag v2.4.6)

Files, as published, unmodified:
  pyodide.mjs                  the loader (sha256 6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109)
  pyodide.asm.mjs              the Emscripten module (sha256 f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635)
  pyodide.asm.wasm             CPython and Pyodide's core, compiled (sha256 cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6)
  python_stdlib.zip            Python's standard library (sha256 fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a)
  pyodide-lock.json            the distribution's package list (sha256 5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010);
                               of the packages it lists, only NumPy is here
  numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl
                               NumPy, from the release above (sha256 a292c1f5d7d8a2208cd5e94fc467604c131cabcd2fc14fed6eefde121e7fabdf,
                               as pyodide-lock.json gives it; it depends on no other package)
  license.pyodide.txt          Pyodide's licence: Mozilla Public License 2.0, from the repository at the tag above
  license.cpython.txt          CPython's licence: the Python Software Foundation License (and the history of Python's
                               licences), from the repository at the tag above
  license.numpy.txt            NumPy's licence: BSD 3-clause, from the wheel (numpy-2.4.6.dist-info/licenses/LICENSE.txt);
                               the licences of the code NumPy includes are in the wheel beside it, in the same folder

The library is loaded at run time as separate, replaceable files, only when a Python script is first run (and NumPy
only when a script first imports it), on the page's own thread, from this site alone (packageBaseUrl and
lockFileURL are set to this folder, so nothing is asked of Pyodide's CDN). JEKray uses only Pyodide's documented
interface (loadPyodide, registerJsModule, runPython, globals, loadPackage), so it can be replaced by another build
of the same version's interface, for example one you have built yourself from the sources above: put it in a
folder beside this one and point PY_DIR in jek/tools/jekray/src/ui/python.js at it.
