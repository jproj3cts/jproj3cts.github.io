import { installHooks } from '../../../jekray/src/core/hooks.js';
import { usageStart, wireUsage } from '../../../jekray/src/io/usage.js';
import { themeApply } from './dom.js';
import { account, accountKnown, accountLoaded, accountShown, wireAccount } from '../io/account.js';
import { fillHome, wireHome } from './home.js';

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
installHooks({ accountChanged: () => { if (account || accountKnown) fillHome(); } });
wireAccount();
wireHome();
wireUsage();
usageStart('space');
accountShown();
if (accountLoaded) accountLoaded.then(() => fillHome());
