/* ==========================================================================
   Stand-ins for the page in a worker, set up before the app's code runs: whatever it reaches for
   while setting itself up gets a harmless object that accepts anything.
   ========================================================================== */

/* Stand-ins for the page, set up in the worker before the script runs: whatever the script
   reaches for while setting itself up gets a harmless object that accepts anything */
export function workerShim() {
  const stub = new Proxy(function () {}, {
    get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : stub,
    set: () => true, apply: () => stub, construct: () => stub, has: () => false, deleteProperty: () => true,
  });
  Object.assign(self, {
    window: self, document: stub,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, alert() {}, confirm: () => false,
    HTMLElement: class {}, Element: class {}, Node: class {},
  });
}
