import { installHooks } from '../../../jekray/src/core/hooks.js';
import { usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { closeMenu, themeApply, toast } from './dom.js';
import { account, accountKnown, accountLoaded, accountShown, authOutcome, wireAccount } from '../../../jekray/src/io/account.js';
import { fillHome, openAccountMenu, spaceAccountExtra, wireHome } from './home.js';

/* ==========================================================================
   JEKspace's start: the theme (JEKray's, so the hub and the apps look alike), the account and the home wired, the
   visit counted, and the account looked up; the benches come once it is known. This tab is the hub's: the apps'
   My benches open here (window 'jekspace') rather than a new tab each time.
   ========================================================================== */
themeApply();
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeApply);
window.addEventListener('storage', e => { if (e.key === 'jekray-theme') themeApply(); });
if (!window.name) window.name = 'jekspace';
// the benches, once the account is known (signed in, or signed out for sure)
// the shared account's hooks: the hub's name and toasts, its pop-up account menu (made as it opens) with the theme in it
installHooks({
  appName: 'JEKspace', toast,
  accountChanged: () => { if (account || accountKnown) fillHome(); },
  accountMenuExtra: spaceAccountExtra, accountMenuDone: closeMenu, openAccountMenu,
});
wireAccount();
document.getElementById('btnAcct').addEventListener('click', openAccountMenu);
authOutcome();
wireHome();
wireUsage();
usageStart('space');
accountShown();
if (accountLoaded) accountLoaded.then(() => fillHome());
