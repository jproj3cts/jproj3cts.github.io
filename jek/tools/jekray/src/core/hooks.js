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
  // an exercise on the bench (ui/challenge.js): drawn, read after each render, a part's panel limited, a change counted
  exerciseDraw() {}, exerciseTick() {}, exercisePanel() {}, exerciseStep() {},
  // the line under a part's name in its panel: what it reads now (ui/optimise.js partHeadline)
  partHeadline: () => '',
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
  proWhy: () => '', proFix(what, kind) {},
  // a free account's tasters of that work (io/tasters.js): how many are left, spend one, and the card once spent
  tasterLeft: () => null, tasterUse: () => false, tasterOut: () => false, tasterRefresh() {},
  // the account as an export asks after it (ui/pro.js): accounts here, signed in, known (the API has said); and its sign-in prompt
  account: () => ({ on: false, signedIn: false, known: false }), exportSignIn() {},
  // the usage counts (io/usage.js, shared with JEKion): the API's address, and the plan tier the counts are filed under
  apiBase: () => '', usageTier: () => 'anon',
  // the account (io/account.js, shared by JEKray, JEKion and JEKsuite): what each app adds to it or does around it
  appName: 'JEKray',                    // the app, in words ('usage counts of what is used in …')
  keepWork() {},                        // the app's work kept (its autosave) before the page leaves to sign in or to pay
  planActive() {},                      // a plan has just become active, back from paying
  accountLoadedHere() {},               // the account has just been looked at (signed in or not)
  accountChanged() {},                  // signed in or out, or the plan changed: the app's own menus and badges
  accountMenu(rows) {},                 // the account menu's rows, put where the app's menu is
  accountMenuExtra: () => [],           // the app's own rows in that menu (signed in or not), before the usage line
  accountMenuDone() {},                 // an item in it chosen: a pop-up menu closes
  openAccountMenu() {},                 // open that menu (to sign in from the plans)
  sayUnreachable: () => true,           // say so when the API cannot be reached
  accountDeleted() {},                  // the account deleted: what the app keeps of it goes
  // vector pages (io/pdf.js): whether the field's glow layer is drawn light, without the screen blend (ui/render.js lightLayer)
  vecLightLayer: () => false,
  // the bench linked to a cloud bench, or unlinked (io/cloud.js cloudLink): what goes with it (io/film-coats.js)
  cloudLinked() {},
  // mods run in their sandbox on the page
  modAsk: () => Promise.reject(new Error('no modules here')),
};
export function installHooks(h) { return Object.assign(hooks, h); }
