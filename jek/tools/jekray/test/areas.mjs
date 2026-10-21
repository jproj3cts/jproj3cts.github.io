/* Which tests cover which part of the code, so a change of limited scope can run a smaller batch (test/run.mjs).
   An area names source files by prefix or exact path, the Node test files that exercise them, and the groups of
   the browser suite (jekray-tests.html) that do. A source file may be in several areas; one in none, or in
   "shared", means everything is run. The browser groups are named exactly as the suite's `{ group }` rows. */
export const AREAS = {
  build: {
    what: 'the build, the module rules and the committed page',
    src: ['build.mjs', 'src/main.js', 'src/worker-main.js', 'src/worker/', 'src/page/', '../jekray.html', '../jekray-dev.html', 'package.json', 'docs.mjs'],
    node: ['build.test.mjs'],
    browser: [],
  },
  bench: {
    what: 'the bench tracer and what every part does to a ray: geometry, coatings, glasses, parts and their panels',
    src: ['src/engines/trace.js', 'src/engines/beam-tree.js', 'src/engines/screen-stats.js', 'src/engines/detector.js', 'src/engines/polarisation.js', 'src/engines/phase-screen.js',
      'src/core/geometry.js', 'src/core/sag.js', 'src/core/coatings.js', 'src/core/coatdesign.js', 'src/core/face-pol.js', 'src/core/glass.js', 'src/core/glass-catalog.js', 'src/core/glass-thermal.js',
      'src/core/maths.js', 'src/core/numeric.js', 'src/core/special.js', 'src/core/format.js', 'src/core/colour.js', 'src/core/freeform.js', 'src/core/diffractive.js', 'src/core/gradient.js', 'src/core/mask.js', 'src/core/traps.js',
      'src/parts/', 'src/ui/parts/', 'src/ui/render.js', 'src/ui/panel.js', 'src/ui/panels.js', 'src/ui/pointer.js', 'src/ui/picker.js', 'src/ui/rail.js', 'src/ui/actions.js', 'src/ui/readouts.js',
      'src/ui/plots.js', 'src/ui/sweeps.js', 'src/ui/instruments.js', 'src/ui/optimise.js', 'src/ui/heavy.js', 'src/ui/tours.js', 'src/ui/news.js', 'src/ui/experimental.js', 'src/ui/coat-workspace.js'],
    node: ['engines.test.mjs', 'demos.test.mjs', 'parts.test.mjs', 'numeric.test.mjs', 'face-pol.test.mjs', 'coatdesign.test.mjs', 'zoned.test.mjs', 'grin.test.mjs'],
    demos: true,
    browser: ['Materials and dispersion', 'Paraxial optics', 'Geometric tracing', 'Fresnel, coatings and polarisation', 'Thin-film coatings', 'Optical path and interference', 'Gaussian beams',
      'Stops and masks on the field', 'Measurements and the ray fan', 'Off-axis apertures, near and far', 'Tolerancing', 'System, absorption and screens', 'A beam across an element’s edge',
      'Working with several elements', 'Tracing', 'Aberrations', 'Masks as ideal lenses', 'Optimising several parameters', 'Heights', 'Surfaces: holes, stacks and mirror coatings'],
  },
  field: {
    what: 'the diffracted field: propagation, the close-up, vector focusing, coherence and the 3D field volume',
    src: ['src/engines/field.js', 'src/engines/field2d.js', 'src/engines/diffraction.js', 'src/engines/closeup.js', 'src/engines/vector-focus.js', 'src/engines/volume.js', 'src/engines/phase-screen.js',
      'src/core/beams-hom.js', 'src/core/coherence.js', 'src/ui/closeup.js'],
    node: ['demos.test.mjs'],
    browser: ['Physical optics propagation', 'Aberrations and the 2D field', 'Diffraction and MTF', 'The field on a screen', 'Interference', 'Close-up: standing waves',
      'Double slits, slit combs and hard-edged masks', 'Polarisation across the field', 'Vector focusing at high NA', 'Coherence and beam quality', 'Higher-order beams and phase masks',
      'The close-up', 'Dipole traps', 'The field in 3D', 'Off-axis apertures, near and far', 'Stops and masks on the field'],
  },
  cavity: {
    what: 'cavities: finding them, their modes, the field they build, lasers that settle',
    src: ['src/engines/cavity.js', 'src/engines/pd-cavity.js', 'src/ui/panel-cavity.js', 'src/parts/gain.js', 'src/ui/parts/gain.js'],
    node: ['ghost-cavity.test.mjs', 'demos.test.mjs'],
    browser: ['Cavities: finding them and their Gaussian mode', 'Cavities: the field they build up', 'Cavities: their own modes (Fox and Li)', 'Lasers that settle', 'Optical path and interference'],
  },
  fibre: {
    what: 'fibre networks and their parts, electronics, modulators, pulses, vapour cells and nonlinear crystals',
    src: ['src/engines/fibre.js', 'src/engines/fibre-face.js', 'src/engines/elec.js', 'src/engines/pulse.js', 'src/engines/pic.js', 'src/core/cells.js', 'src/core/crystals.js', 'src/core/nlc.js',
      'src/core/zeeman.js', 'src/core/modulators.js', 'src/core/pulses.js', 'src/ui/elec.js', 'src/ui/pic.js',
      'src/parts/fibre.js', 'src/parts/fcomp.js', 'src/parts/link.js', 'src/parts/elec.js', 'src/parts/aom.js', 'src/parts/eom.js', 'src/parts/cell.js', 'src/parts/crystal.js', 'src/parts/nlc.js', 'src/parts/pic.js', 'src/parts/detector.js', 'src/parts/gain.js',
      'src/ui/parts/fibre.js', 'src/ui/parts/fcomp.js', 'src/ui/parts/link.js', 'src/ui/parts/elec.js', 'src/ui/parts/aom.js', 'src/ui/parts/eom.js', 'src/ui/parts/cell.js', 'src/ui/parts/crystal.js', 'src/ui/parts/nlc.js', 'src/ui/parts/pic.js', 'src/ui/parts/detector.js'],
    node: ['demos.test.mjs'],
    browser: ['Gratings, fibres, detectors, crystals, filters and gain', 'Fibre networks', 'Fibre extras', 'Modulators and beat notes', 'Sources split from one laser', 'Short pulses',
      'Atomic vapour cells', 'Nonlinear crystals', 'Lasers that settle'],
  },
  io: {
    what: 'files and links: opening, saving, sharing, lens files, CAD, merging, packs and modules, the AI guide',
    src: ['src/io/', 'headless.mjs', 'cli.mjs', 'src/engines/mods.js', 'src/state/packs.js', 'src/state/drawings.js', 'src/ui/myparts.js', 'src/ui/tabs.js', 'src/ui/drawings.js'],
    node: ['headless.test.mjs', 'merge.test.mjs', 'zmx-cb.test.mjs', 'cad-export.test.mjs', 'lens-stock.test.mjs'],
    browser: ['Import, files and tools', 'Projects written elsewhere, and the AI guide', 'Share links', 'Tabs and link planes', 'Part packs', 'Modules'],
  },
  view3d: {
    what: 'the 3D view, STL objects and the field drawn in 3D',
    src: ['src/ui/view3d.js', 'src/ui/rf-lens3d.js', 'src/core/stl.js', 'src/parts/stl.js', 'src/ui/parts/stl.js'],
    node: ['zoned.test.mjs'],
    browser: ['The 3D view', 'STL objects', 'The field in 3D'],   // The 3D view is two groups of that name
  },
  'lens-design': {
    what: 'the Optical designer: assemblies, the sequential engine, analyses, optimiser, tolerancing, drawings, report',
    src: ['src/engines/lens-', 'src/core/assembly.js', 'src/ui/lens-', 'src/ui/assembly.js', 'src/ui/pro.js'],
    node: ['lens-', 'assembly.test.mjs', 'cad-export.test.mjs', 'zmx-cb.test.mjs', 'pro-gate.test.mjs'],
    browser: ['Surfaces: holes, stacks and mirror coatings', 'Import, files and tools', 'The Optical designer', 'The Optical designer and the workspaces'],
  },
  rf: {
    what: 'RF: horns, antennas, metal and dielectric parts, graded and zoned lenses, the RF designer',
    src: ['src/core/rf.js', 'src/core/antenna.js', 'src/core/horns.js', 'src/core/grin.js', 'src/engines/rf-design.js', 'src/engines/rf-sweep.js', 'src/engines/antenna-field.js',
      'src/ui/rf-workspace.js', 'src/ui/rf-report.js', 'src/ui/rf-lens3d.js', 'src/parts/rf.js'],
    node: ['rf-antenna.test.mjs', 'rf-design.test.mjs', 'rf-parts.test.mjs', 'rf-print.test.mjs', 'antenna.test.mjs', 'grin.test.mjs', 'zoned.test.mjs'],
    browser: ['RF: millimetre-wave quasi-optics', 'RF parts on the bench', 'The RF designer'],
  },
  scripts: {
    what: 'scripts run against the bench',
    src: ['src/ui/scripts.js'],
    node: [],
    browser: ['Scripts'],
  },
  site: {
    what: 'the documentation pages and the data they are built from',
    src: ['../../docs/', '../../../_data/', '../jekray-ai-guide.md', '../../../_includes/', '../../../_layouts/', '../../../jek/', '../../../index.html', '../../../assets/'],
    node: ['site-pages.test.mjs'],
    browser: ['Projects written elsewhere, and the AI guide'],
  },
  // files everything rests on: a change here runs the whole suite
  shared: {
    what: 'shared foundations: the data model, the project, the page boot, the registry, constants and hooks',
    src: ['src/state/elements.js', 'src/state/project.js', 'src/state/params.js', 'src/state/tabs.js', 'src/parts/registry.js', 'src/ui/parts/registry.js', 'src/ui/boot.js',
      'src/core/constants.js', 'src/core/hooks.js', 'style.css', '../jekray-tests.html', 'test/areas.mjs', 'test/run.mjs'],
    node: ['*'],
    browser: ['*'],
  },
};

/* files that need no test of their own: notes, ignore rules, pictures, the test runner's own records */
const QUIET = /(^|\/)(\.gitignore|README\.md|\.runs\.json|[^/]*\.(png|jpg|svg|mp4|pdf|ico))$/;
/* the areas a list of changed files (paths relative to jek/tools/jekray) falls in: { areas, node } with the areas (null
   for "everything") and any Node test files changed themselves (run as they are) */
export function areasOf(files) {
  const out = new Set(), node = new Set();
  for (const f of files) {
    if (QUIET.test(f)) continue;
    if (/^test\/node\/[^/]+\.test\.mjs$/.test(f)) { node.add(f.slice('test/node/'.length)); continue; }
    if (f.startsWith('../demos/')) { out.add('bench'); out.add('io'); continue; }       // the example benches: traced by the demos test, opened by the import tests
    const hit = Object.entries(AREAS).filter(([, a]) => a.src.some(p => f === p || f.startsWith(p)));
    if (!hit.length || hit.some(([k]) => k === 'shared')) return { areas: null, node: [...node], unclaimed: hit.length ? null : f };
    for (const [k] of hit) out.add(k);
  }
  return { areas: [...out], node: [...node] };
}
/* the Node test files and browser groups for a set of areas (all of them for null), plus test files named outright */
export function planFor(areas, nodeFiles, extraNode) {
  if (!areas) return { node: nodeFiles.slice(), browser: null, full: true };
  const node = new Set(['build.test.mjs', ...(extraNode || [])]), browser = new Set();
  for (const k of areas) {
    const a = AREAS[k]; if (!a) throw new Error('no test area called ' + k + '; the areas are ' + Object.keys(AREAS).join(', '));
    for (const n of a.node) { if (n === '*') return { node: nodeFiles.slice(), browser: null, full: true }; for (const f of nodeFiles) if (f === n || (n.endsWith('-') && f.startsWith(n))) node.add(f); }
    for (const g of a.browser) { if (g === '*') return { node: nodeFiles.slice(), browser: null, full: true }; browser.add(g); }
  }
  return { node: [...node].sort(), browser: [...browser], full: false };
}
