occt-import-js 0.0.23 (LGPL-2.1), a WebAssembly build of Open CASCADE Technology 7.6.1 that reads STEP, IGES
and BREP files into triangle meshes. Used by JEKray to import .step/.stp files as STL objects.

Source: https://github.com/kovacsv/occt-import-js (tag 0.0.23, which builds OCCT at commit
d2abb6d844231cb8f29be6894440874a4700e4a5 of https://github.com/Open-Cascade-SAS/OCCT, version 7.6.1)
npm:    https://www.npmjs.com/package/occt-import-js (version 0.0.23, published 2024-12-03)

Files, as published in the npm package's dist/ folder, unmodified:
  occt-import-js.js            the Emscripten loader (sha256 3fb44ce11d00611f9b3f3c5775d520ebab48930c1f08279b7b1316f05f0d3379)
  occt-import-js.wasm          the compiled library (sha256 33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952)
  license.occt-import-js.txt   occt-import-js's licence: GNU LGPL 2.1
  license.occt.txt             Open CASCADE Technology's licence: GNU LGPL 2.1
  OCCT_LGPL_EXCEPTION.txt      Open CASCADE exception (version 1.0) to the LGPL 2.1, from the OCCT repository at the
                               commit above (not in the npm package)

The library is loaded at run time as a separate file, only when a STEP file is first imported, in a worker of
its own (jek/tools/jekray/src/io/step.js on the page; headless.mjs in Node). JEKray uses only its documented
interface (occtimportjs(), ReadStepFile), so it can be replaced by another build of the same interface, for
example one you have built yourself from the sources above: put it in a folder beside this one and point
OCCT_DIR in src/io/step.js (and the path in headless.mjs) at it.
