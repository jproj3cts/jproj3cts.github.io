replicad-opencascadejs 1.2.1 (LGPL-2.1-only), a trimmed WebAssembly build of Open CASCADE Technology made for
replicad (https://replicad.xyz) with the opencascade.js toolchain. Used by JEKcad as its geometry kernel: sketch
profiles to faces, prisms, revolutions, fillets, chamfers, shells, booleans, sweeps and lofts, STEP read and write,
STL write, and triangulation with face and edge maps for display and picking.

Source: https://github.com/sgenoud/replicad (packages/replicad-opencascadejs, which builds the custom OCCT build
from its build-source/ configuration with ghcr.io/taucad/opencascade.js:3.1.0-single-threaded)
npm:    https://www.npmjs.com/package/replicad-opencascadejs (version 1.2.1)

Files, from the npm package's dist/ folder, unmodified:
  replicad_single.js        the Emscripten loader, an ES module (sha256 465b68c209b416396857fad30a6e33e7f5407907373cfe240c194af6d80c4a1d)
  replicad_single.wasm      the compiled library, 22.9 MB, 7.2 MB gzipped (sha256 a9335919fa64bfeaee3e241d3139ad134022682429c6688e20d8ca12093d33d9)
  LICENSE.txt               the package's licence: GNU LGPL 2.1
  OCCT_LGPL_EXCEPTION.txt   Open CASCADE exception (version 1.0) to the LGPL 2.1, from the OCCT repository (the same
                            file as in ../occt-import-js/0.0.23/)

Why this build: the full opencascade.js 1.1.1 is 66.7 MB unpacked; this one is 48.8 MB unpacked as published (both
single- and multi-threaded builds and their type declarations), of which JEKcad needs only the single-threaded
loader and wasm (23.0 MB). It has everything the Part Studio uses: BRepPrimAPI_MakePrism and MakeRevol,
BRepFilletAPI_MakeFillet and MakeChamfer, BRepOffsetAPI_MakeThickSolid, DraftAngle, MakePipeShell and
ThruSections, the BRepAlgoAPI booleans and Splitter, STEPControl_Reader and Writer, StlAPI, BRepGProp, BRepExtrema,
and ReplicadMeshExtractor / ReplicadEdgeMeshExtractor (triangles and edge polylines grouped by face and edge).

The library is loaded at run time as a separate file, the first time JEKcad builds a model, in JEKcad's kernel worker
(jek/tools/jekcad/src/worker/main.js on the page; the Node tests load it the same way). It is never fetched from a
CDN. JEKcad uses only the library's documented OCCT classes, so it can be replaced by another build of them, for
example one you have built yourself from the sources above: put it in a folder beside this one and point KERNEL_DIR
in jek/tools/jekcad/src/core/doc.js at it.
