manifold-3d 3.5.4 (Apache-2.0), a WebAssembly build of Manifold, a geometry library for solid modelling: 2D
cross-sections extruded and revolved into solids, and solids added, cut and intersected robustly. Used by JEKray's
3D modelling (the Model tools in the 3D view) to rebuild a modelled part from its sketches and features.

Source: https://github.com/elalish/manifold (release v3.5.4)
npm:    https://www.npmjs.com/package/manifold-3d (version 3.5.4)

Files, as published in the npm package, unmodified:
  manifold.js     the Emscripten loader, an ES module (sha256 ca3c8a88df63bb3083013d1eb7f700bf23216594f6e98a2566e34f55d7341ce8)
  manifold.wasm   the compiled library (sha256 73e3b419ad31294f6b1cc478173944e50efc4a34bfdeeff0107bdfc12975f11c)
  LICENSE.txt     its licence: Apache License 2.0 (the package's LICENSE)

The library is loaded at run time, only when a modelled part is first rebuilt (a bench that has one loads its stored
triangles and needs nothing from here to trace): jek/tools/jekray/src/core/model.js (manifoldLib) on the page and in
Node. JEKray uses only its documented interface (CrossSection, Manifold), so it can be replaced by another build of
the same interface: put it in a folder beside this one and point MANIFOLD_DIR in src/core/model.js at it.
