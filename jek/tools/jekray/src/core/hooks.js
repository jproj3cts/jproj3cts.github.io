/* ==========================================================================
   Hooks: what the engines tell the page, and what they ask of it. The page installs its own at
   boot (ui/boot.js); without a page (the field worker, the Node tests) these do nothing, so
   core/, state/ and engines/ never reach for the DOM themselves. The build checks that they
   import nothing from ui/, io/ or page/.
   ========================================================================== */
export const hooks = {
  // the page redraws, or rebuilds a panel, after something the engines worked out
  requestRender() {}, renderPanel() {}, syncPanel() {}, showActivityNow() {}, cavityLater() {},
  toast() {}, benchStyleShown() {}, view3dReset() {},
  // what the page is doing meanwhile
  playing: () => false,                 // a sweep is playing
  sweepJob: () => null,                 // a sweep's field is being rendered
  fieldHeld: () => false,               // a sweep plays without the field
  frames: () => null,                   // the sweep's rendered frames: { bench, screens, closeup } Maps
  // the field worker, when the page has one
  fieldWorker: () => null, fwRequest: () => Promise.reject(new Error('no field worker')), fwMismatch() {},
  // the account's parts library, when the page has one: keep a selection as a part (ui/myparts.js saveToMine)
  saveParts: null,
  // the cloud: why a saving, forking or keeping action is not possible now ('' when it is), and the way to make it so (sign in, or subscribe)
  proWhy: () => '', proFix() {},
  // mods run in their sandbox on the page
  modAsk: () => Promise.reject(new Error('no modules here')),
};
export function installHooks(h) { return Object.assign(hooks, h); }
