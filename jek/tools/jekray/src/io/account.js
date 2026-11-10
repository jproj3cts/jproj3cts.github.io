import { EMBED, TEST_MODE } from '../core/constants.js';
import { hooks } from '../core/hooks.js';
import { goal, setUsageOff, track, usageBrowserSaysNo, usageFlush, usageOff } from './usage.js';
import { h } from '../ui/dom.js';

/* ==========================================================================
   The account, shared as it is by JEKray, JEKion and JEKsuite (each lists this module in its order.json): the same
   API, the same cookie on its host, so signing in to one signs in to all. Sign-in (Google, Microsoft, an email link,
   code or password), the account menu, JEKrayPro's plans and billing, the account's own page, teams (members,
   invitations, roles, billing, signing packs as the team), a university's licence for those who look after it, and
   deleting the account. What each app does around it goes through core/hooks.js: keeping its work before the page
   leaves to sign in or pay (keepWork), where its account menu goes (accountMenu, accountMenuExtra, accountMenuDone,
   openAccountMenu), what follows a plan or a sign-in (planActive, accountLoadedHere, accountChanged), its name
   (appName) and its toasts. JEKray's own sign-in prompts on the bench are in io/nudges.js.
   ========================================================================== */
const acctSay = (msg, bad) => hooks.toast(msg, bad);
/* ---------- JEKrayPro account ----------
   Sign-in is handled by the API at api.jeksys.net: the button sends the person there, the
   provider sends them back here with ?jekauth=<outcome>, and the session lives in a cookie
   on the API's host that this page never sees. The bench survives the trip in the autosave. */
export const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://api.jeksys.net';
export let account;                                   // undefined: not asked yet; null: signed out; else /v1/me
export function setAccount(v) { return (account = v); }
export async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, Object.assign({ credentials: 'include', headers: { Accept: 'application/json' } }, opts));
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error((body && body.error && body.error.message) || 'The service is unavailable.'); e.status = res.status;
    for (const k of ['code', 'version', 'editing', 'updated_by', 'updated_at']) e[k] = body && body.error ? body.error[k] : undefined;
    throw e;
  }
  return body;
}
const PROVIDER_NAMES = { google: 'Google', microsoft: 'Microsoft', orcid: 'ORCID', email: 'Email' };
export const AUTH_OUTCOMES = {
  signed_in: ['Signed in'], linked: ['Sign-in linked to your account'], cancelled: ['Sign-in cancelled'],
  expired: ['That sign-in took too long or was opened in another browser. Please try again.', true],
  failed: ['Sign-in did not work. Please try again.', true], taken: ['That sign-in already belongs to another JEKray account.', true],
  signed_out: ['Please sign in first.', true],
  unavailable: ['That way of signing in is not available yet. Please use another.', true],
  orcid_closed: ['Signing in with ORCID has ended. Sign in with Google or Microsoft; if your account could only sign in with ORCID, email support@jeksys.net and we will move it for you.', true],
  consented: ['Thank you: JEKray is approved for your organisation, and everyone there can now sign in with Microsoft.'],
  consent_failed: ['JEKray was not approved for your organisation. Nothing has changed.', true],
  link_expired: ['That sign-in link has been used or has run out. Ask for a new one from Sign in.', true],
};
export function signIn(provider, link) {
  track('signin', provider); goal('signin'); usageFlush();
  const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekauth');
  hooks.keepWork();
  location.href = API_BASE + '/auth/' + provider + '/start?' + new URLSearchParams(Object.assign({ return: ret.toString() }, link ? { link: '1' } : {}));
}
const initials = name => (name || '?').split(/\s+/).filter(w => /^\p{L}/u.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || (name || '?')[0];
/* a person as a round picture, or their initials when they have none: {name, avatar} */
export function avatarNode(p, size) {
  const n = h('span', { class: 'rt-avatar' + (size ? ' ' + size : ''), title: p && p.name || '' , 'aria-hidden': 'true' });
  if (p && p.avatar) n.append(h('img', { src: API_BASE + p.avatar, alt: '', decoding: 'async' })); else n.textContent = initials(p && p.name);
  return n;
}
/* ---------- JEKrayPro subscription ----------
   Stripe Checkout takes the payment and Stripe's portal manages it; the plan itself only ever
   changes through Stripe's webhook to the API, so after paying the app waits for it to land. */
const shortDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function planText(w) {
  if (w.kind === 'institution') return 'you look after its JEKrayPro licence';
  const p = w.plan, lic = w.kind === 'personal' && account && account.licence;
  // a paid seat in a team, unless they pay for their own as well
  if (w.kind === 'personal' && account && account.team_seat && !(p && p.billing && w.active && p.status !== 'past_due')) return 'JEKrayPro through your team';
  // a university's licence, unless they pay for their own as well
  if (lic && !(p && p.billing && w.active && p.status !== 'past_due')) return 'JEKrayPro through ' + lic.name;
  // their university has a licence, but every place in its tier is taken
  const full = w.kind === 'personal' && !w.active && account && account.licence_full;
  if (full) return full.name + '\u2019s licence is full: ask whoever looks after it for a larger tier';
  if (!p) return w.kind === 'team' ? (w.role === 'owner' ? 'team, no subscription yet' : 'team, ' + ROLE_NAMES[w.role].toLowerCase()) : 'No subscription yet';
  const name = p.plan === 'team' ? 'Team plan, ' + p.seats + ' seat' + (p.seats === 1 ? '' : 's') : p.plan === 'academic' ? 'JEKrayPro (academic)' : 'JEKrayPro';
  if (!p.billing) return w.active ? name : 'Plan ended';
  if (p.status === 'past_due') return w.active ? name + ': payment failed, please update your card in Billing' : 'Paused: payment failed';
  if (!w.active) return 'Subscription ' + (p.status === 'canceled' ? 'ended' : p.status.replace(/_/g, ' '));
  const how = p.interval === 'year' ? 'yearly' : 'monthly';
  return name + ', ' + how + (p.cancel_at ? ', ends ' + shortDate(p.cancel_at) : p.period_end ? ', renews ' + shortDate(p.period_end) : '');
}
const money = (pence, cur) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: (cur || 'gbp').toUpperCase(), minimumFractionDigits: pence % 100 ? 2 : 0 }).format(pence / 100);
let subInterval = 'month';
export async function showSubscribe() {
  track('subscribe', account ? '' : 'out'); goal('subscribe');
  const dlg = document.getElementById('subDialog'), box = document.getElementById('subPlans');
  if (!dlg.open) dlg.showModal();
  box.replaceChildren(h('p', null, 'Loading prices…'));
  let prices;
  try { prices = await api('/v1/billing/prices'); }
  catch (err) { box.replaceChildren(h('p', null, 'Could not load prices: ' + err.message)); return; }
  const tabs = h('div', { class: 'rt-subtabs', role: 'radiogroup', 'aria-label': 'Billing period' },
    ...[['month', 'Monthly'], ['year', 'Yearly']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': subInterval === v ? 'true' : 'false', class: 'rt-btn', onclick: () => { subInterval = v; showSubscribe(); } }, label)));
  const card = (tier, title, blurb, extra = {}) => {
    const p = prices[tier + (subInterval === 'year' ? '_yearly' : '_monthly')];
    if (!p) return null;
    const month = prices[tier + '_monthly'];
    const saving = subInterval === 'year' && month ? Math.round(100 * (1 - p.amount / (12 * month.amount))) : 0;
    const go = extra.go || h('button', { type: 'button', class: 'rt-btn primary', onclick: () => buyNow(tier, extra.email ? extra.email.value : '', go, extra.err) }, 'Continue to payment');
    return h('div', { class: 'rt-subcard' }, h('h3', null, title), h('p', { class: 'rt-subprice' }, h('b', null, money(p.amount, p.currency)), (extra.seat ? ' a seat' : '') + ' a ' + (subInterval === 'year' ? 'year' : 'month'), saving > 0 ? h('small', null, ' · save ' + saving + '%') : null),
      h('p', null, blurb), extra.node || null, go, extra.err || null);
  };
  // the academic price: a university address, typed here (or the one they sign in with), which Stripe then uses
  const ac = account && account.academic;
  const acMail = h('input', { type: 'email', class: 'rt-subinput', placeholder: 'you@university.ac.uk', 'aria-label': 'Your university email address', autocomplete: 'email',
    value: (account && account.user && /\.(ac|edu)(\.[a-z]{2})?$/i.test((account.user.email || '').split('@')[1] || '') && account.user.email) || '' });
  const acErr = h('p', { class: 'rt-error', hidden: '' });
  const acNode = ac ? h('p', { class: 'rt-subok' }, '\u2713 Academic price confirmed (' + (ac.email || ac.via) + ')')
    : h('label', { class: 'rt-subform' }, 'Your university email address (students and staff):', acMail);
  // the team card: a team of theirs without a plan is subscribed for; else one is made first (signed in)
  const unpaid = (account ? account.workspaces : []).find(w => w.kind === 'team' && w.role === 'owner' && !w.active);
  const teamGo = !account
    ? h('button', { type: 'button', class: 'rt-btn', onclick: () => { dlg.close(); proSignIn(); } }, 'Sign in to make a team')
    : unpaid
      ? h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startCheckout(unpaid.id, 'team', teamGo) }, 'Subscribe for ' + unpaid.name)
      : h('button', { type: 'button', class: 'rt-btn primary', onclick: () => { dlg.close(); createTeam(); } }, 'Create a team…');
  // a university licence: looked for (signed in); none is not an error, the academic price is the way then
  const licNote = h('p', { class: 'rt-subcheck' });
  const uni = h('button', { type: 'button', class: 'rt-link', onclick: async () => {
    uni.disabled = true; uni.textContent = 'Checking…';
    try { await api('/v1/me/institution', { method: 'POST' }); await loadAccount(); dlg.close(); acctSay('You have JEKrayPro through ' + account.licence.name); return; }
    catch (err) {
      licNote.replaceChildren(err.code === 'no_licence' || err.status === 404
        ? 'Your university has no JEKray licence yet. The academic price below is for you; and if your university would like one, ask it to email sales@jeksys.net.'
        : 'We could not check just now (' + err.message + '). The academic price below works either way.');
    }
  } }, 'See if your university has a licence');
  if (account) licNote.append('Does your university pay for JEKrayPro for everyone? ', uni, '.');
  else licNote.append('Pay now and your account is made from the address you pay with; you are signed in when you come back. Already have an account? ',
    h('button', { type: 'button', class: 'rt-link', onclick: () => { dlg.close(); proSignIn(); } }, 'Sign in'), ' first.');
  box.replaceChildren(licNote, tabs, h('div', { class: 'rt-subcards' },
    card('pro', 'JEKrayPro', 'For anyone: your benches in the cloud, their history, on every device; the optimiser, tolerancing, reports, scripts and share links.'),
    card('academic', 'Academic', 'The same, at half the price, for students and staff at a university.', { node: acNode, email: ac ? null : acMail, err: acErr }),
    card('team', 'Team', 'For a lab, group or company: one workspace everyone works in, with roles, invitations by email and an activity record. A seat each for the owner, admins and editors, at least three; viewers are free. Each seat has JEKrayPro on their own benches too.', { seat: true, go: teamGo })));
}
// Continue to payment: straight to Stripe, signed in or not (POST /v1/billing/checkout); an API from before it, signed in,
// takes the account's own checkout instead
async function buyNow(tier, email, btn, errBox) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening secure payment…';
  if (errBox) errBox.hidden = true;
  const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekbilling'); ret.searchParams.delete('jekauth');
  hooks.keepWork();
  try {
    const mine = account && account.workspaces.find(w => w.kind === 'personal');
    try { if (mine) sessionStorage.setItem('jekcheckout', mine.id); } catch (err) { /* the personal workspace is assumed on return */ }
    track('subscribe', 'go.' + tier + (account ? '' : '.out'));
    const { url } = await api('/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: tier, interval: subInterval, email: String(email || '').trim(), return: ret.toString() }) });
    location.href = url;
  } catch (err) {
    const mine = account && account.workspaces.find(w => w.kind === 'personal');
    if (err.status === 404 && mine && tier === 'pro') { btn.disabled = false; btn.textContent = was; startCheckout(mine.id, tier, btn); return; }
    if (errBox) { errBox.textContent = err.message; errBox.hidden = false; } else acctSay(err.message, true);
    btn.disabled = false; btn.textContent = was;
  }
}
async function startCheckout(ws, tier, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening secure payment…';
  try {
    try { sessionStorage.setItem('jekcheckout', ws); } catch (err) { /* the personal workspace is assumed on return */ }
    const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekbilling'); ret.searchParams.delete('jekauth');
    hooks.keepWork();
    const { url } = await api('/v1/workspaces/' + ws + '/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: tier, interval: subInterval, return: ret.toString() }) });
    location.href = url;
  } catch (err) { acctSay(err.message, true); btn.disabled = false; btn.textContent = was; }
}
async function openPortal(ws) {
  try {
    const ret = new URL(location.href); ret.hash = '';
    const { url } = await api('/v1/workspaces/' + ws + '/billing/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ return: ret.toString() }) });
    location.href = url;
  } catch (err) { acctSay(err.message, true); }
}
async function switchInterval(ws, interval) {
  if (!confirm(interval === 'year' ? 'Switch to yearly billing? You are charged for the year now, less what is left of this month.' : 'Switch to monthly billing? What is left of your year is credited against the coming months.')) return;
  try { await api('/v1/workspaces/' + ws + '/billing/interval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval }) }); acctSay('Billing switched to ' + (interval === 'year' ? 'yearly' : 'monthly')); loadAccount(); }
  catch (err) { acctSay(err.message, true); }
}
// back from Stripe Checkout: the webhook may take a moment to arrive
export async function awaitPlan(tries = 12) {
  let wsId = null;
  try { wsId = sessionStorage.getItem('jekcheckout'); sessionStorage.removeItem('jekcheckout'); } catch (err) { /* the personal workspace, then */ }
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, i ? 2000 : 500));
    try { account = await api('/v1/me'); } catch (err) { continue; }
    const mine = account.workspaces.find(w => w.id === wsId) || account.workspaces.find(w => w.kind === 'personal');
    if (mine && mine.active) {
      fillAccount();
      if (mine.kind === 'team') {
        const own = account.workspaces.find(w => w.kind === 'personal');
        acctSay(own && own.plan && own.plan.billing && own.active && !own.plan.cancel_at ? 'Your team plan is active. Thank you! Your own subscription is no longer needed: stop it from the team panel.' : 'Your team plan is active. Thank you!');
        showTeam(mine.id);
      } else acctSay('Welcome to JEKrayPro. Thank you!');
      goal('pro');
      hooks.planActive(); return;
    }
  }
  fillAccount(); acctSay('Payment received. Your plan will show here in a minute or two; reload if it does not.');
}
export function fillAccount() {
  const btn = document.getElementById('btnAcct');
  // Get Pro in the bar: for anyone without JEKrayPro (signed out, or signed in with no plan, licence or team seat)
  const gp = document.getElementById('btnGetPro');
  if (gp) { const own = account && account.workspaces.find(w => w.kind === 'personal'); gp.hidden = EMBED || !accountsOn() || account === undefined || !!(own && own.active) || !!(account && (account.licence || account.team_seat)); }
  if (btn) {
    if (!account) { btn.classList.remove('in'); btn.textContent = 'Sign in'; btn.removeAttribute('title'); btn.setAttribute('aria-label', 'Sign in'); }
    else {
      const u = account.user;
      btn.classList.add('in'); btn.title = u.name; btn.setAttribute('aria-label', 'Account: ' + u.name);
      if (u.avatar) btn.replaceChildren(h('img', { src: API_BASE + u.avatar, alt: '' })); else btn.textContent = initials(u.name);
    }
  }
  hooks.accountMenu(accountMenuRows());
  hooks.accountChanged();
}
/* the account menu's rows (each item with its icon named as data-icon, for the app to draw): signed out, what a free
   account gives and the ways in (each counted as the menu's), the university line; signed in, the plans of each
   workspace, the account, its teams, the plan's billing, linking more sign-ins, signing out. The app's own rows
   (hooks.accountMenuExtra) come before the usage line and the legal links */
export function accountMenuRows() {
  const item = (icon, label, fn) => h('button', { type: 'button', role: 'menuitem', 'data-icon': icon, onclick: () => { hooks.accountMenuDone(); fn(); } }, label);
  const legal = h('span', { class: 'rt-menunote' }, h('a', { href: '/jek/privacy.html', target: '_blank' }, 'Privacy'), ' · ', h('a', { href: '/jek/terms.html', target: '_blank' }, 'Terms'), ' · ', h('a', { href: '/jek/accessibility.html', target: '_blank' }, 'Accessibility'));
  // usage counts: on unless turned off here (or by the browser's Do Not Track or Global Privacy Control)
  const dnt = usageBrowserSaysNo(), usage = h('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(!dnt && !usageOff()), 'data-icon': 'check', disabled: dnt ? '' : null,
    title: dnt ? 'Your browser asks sites not to track it, so none are sent' : 'Counts of what is used in ' + hooks.appName + ', with nothing that says who: see the privacy policy',
    onclick: () => { hooks.accountMenuDone(); const off = !usageOff(); setUsageOff(off); fillAccount(); acctSay(off ? 'Usage counts off in this browser' : 'Usage counts on. Thank you!'); } }, 'Share anonymous usage counts');
  const sep = () => h('div', { class: 'sep' });
  const extra = hooks.accountMenuExtra(!!account) || [];
  if (!account) {
    const via = (p, fn) => () => { track('prompt', 'menu.' + p); fn(); };
    return [h('span', { class: 'rt-menunote' }, h('b', null, 'Create a free account or sign in.'), ' ' + FREE_GIVES),
      item('signin', 'Continue with Google', via('google', () => signIn('google'))), item('signin', 'Continue with Microsoft (university or work)', via('microsoft', () => signIn('microsoft'))), item('signin', 'Continue with email', via('email', () => showEmailSignIn(false))),
      sep(), h('span', { class: 'rt-menunote' }, UNI_LINE), ...extra, sep(), usage, legal];
  }
  const u = account.user, ids = account.identities || [], ws = account.workspaces || [];
  const orcid = ids.find(i => i.provider === 'orcid');
  const rows = [h('div', { class: 'rt-accthead' }, avatarNode(u), h('b', null, u.name), u.email ? h('span', null, u.email) : null, orcid ? h('span', null, 'ORCID ' + orcid.subject) : null),
    ...ws.map(w => h('span', { class: 'rt-menunote' }, (w.kind === 'personal' ? 'Personal' : w.name) + ': ' + planText(w))),
    // ORCID sign-in is ending: someone with no other way in is asked to link one
    account.orcid_ends && !ids.some(i => i.provider !== 'orcid') ? h('span', { class: 'rt-menunote rt-warn' }, 'Signing in with ORCID ends on ' + shortDate(account.orcid_ends) + '. Link Google or Microsoft below to keep your account.') : null,
    sep()].filter(Boolean);
  // a university's licence, for those who look after it there
  for (const w of ws) if (w.kind === 'institution' && (w.role === 'admin' || w.role === 'owner')) rows.push(item('user', w.name + ' licence\u2026', () => showUniAdmin(w.id)));
  rows.push(item('user', 'Your account\u2026', showAccount));
  rows.push(h('a', { role: 'menuitem', href: '/jek/account.html', target: '_blank', rel: 'noopener', 'data-icon': 'home' }, 'Your account on the JEK Systems site'));
  // their teams, and a new one
  for (const w of ws) if (w.kind === 'team') rows.push(item('users', w.name + '…', () => showTeam(w.id)));
  rows.push(item('users', 'Create a team…', createTeam));
  // the personal workspace's plan: subscribe, or manage it
  const mine = ws.find(w => w.kind === 'personal');
  if (mine && !mine.active) rows.push(item('star', 'Subscribe to JEKrayPro…', () => showSubscribe()));
  if (mine && mine.active && mine.plan && mine.plan.billing) {
    rows.push(item('card', 'Billing and invoices…', () => openPortal(mine.id)));
    if (!mine.plan.cancel_at && mine.plan.interval) {
      const other = mine.plan.interval === 'month' ? 'year' : 'month';
      rows.push(item('sync', other === 'year' ? 'Switch to yearly billing' : 'Switch to monthly billing', () => switchInterval(mine.id, other)));
    }
  }
  if (rows[rows.length - 1].className !== 'sep') rows.push(sep());
  for (const p of ['google', 'microsoft']) if (!ids.some(i => i.provider === p)) rows.push(item('signin', 'Link ' + PROVIDER_NAMES[p] + ' sign-in', () => signIn(p, true)));
  if (!ids.some(i => i.provider === 'email')) rows.push(item('signin', 'Link an email address', () => showEmailSignIn(true)));
  rows.push(item('signout', 'Sign out', async () => {
    try { await api('/auth/signout', { method: 'POST' }); account = null; fillAccount(); acctSay('Signed out'); }
    catch (err) { acctSay(err.message, true); }
  }), item('trash', 'Delete account…', showDeleteAccount), ...(extra.length ? [sep(), ...extra] : []), sep(), usage, legal);
  return rows;
}
/* ---------- Sign-in with an email address ----------
   An account of JEKray's own: the address, with a password, or with the 6-digit code the API emails to it (which is
   also how a forgotten password is replaced: sign in by code, choose a new one). The session arrives as the cookie on
   the reply (the API and the app are one site), so no page leaves. link: the signed-in account adds the address. */
export function showEmailSignIn(link) {
  if (!link) { track('signin', 'email'); goal('signin'); }
  let dlg = document.getElementById('emailDialog');
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id: 'emailDialog', 'aria-labelledby': 'emailTitle' }); document.body.append(dlg); }
  let mode = link ? 'code' : 'password';                    // 'password' | 'code'
  const title = h('h2', { id: 'emailTitle' }, link ? 'Link an email address' : 'Continue with email');
  const email = h('input', { type: 'email', id: 'emailAddr', autocomplete: 'username', placeholder: 'you@university.ac.uk', spellcheck: 'false', required: '' });
  const pw = h('input', { type: 'password', id: 'emailPw', autocomplete: 'current-password', placeholder: 'Your password' });
  const codeIn = h('input', { type: 'text', id: 'emailCode', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9 ]*', placeholder: '6 digits', spellcheck: 'false' });
  const newPw = h('input', { type: 'password', id: 'emailNewPw', autocomplete: 'new-password', placeholder: 'At least 10 characters, or leave empty' });
  const err = h('p', { class: 'rt-error', hidden: '' });
  const fail = m => { err.textContent = m; err.hidden = false; };
  const note = h('p', { class: 'note' });
  const pwRow = h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'emailPw' }, 'Password'), pw));
  const codeRow = h('div', { class: 'rt-rows', hidden: '' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'emailCode' }, 'The code from the email'), codeIn),
    link ? null : h('div', { class: 'rt-f wide' }, h('label', { for: 'emailNewPw' }, 'Choose a password (optional)'), newPw));
  const sendBtn = h('button', { class: 'rt-btn primary', type: 'button' }, 'Email me a code');
  const okBtn = h('button', { class: 'rt-btn primary', type: 'button' }, 'Sign in');
  const other = h('button', { class: 'rt-link', type: 'button' });
  const cancel = h('button', { class: 'rt-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel');
  const show = () => {
    err.hidden = true;
    const code = mode === 'code';
    pwRow.hidden = code; sendBtn.hidden = !code; okBtn.hidden = !code ? false : codeRow.hidden;
    if (!code) codeRow.hidden = true;
    okBtn.textContent = link ? 'Link it' : 'Sign in';
    other.hidden = !!link; other.textContent = code ? 'I have a password' : 'New here, or forgotten your password? Email me a code instead';
    note.textContent = link ? 'The address is added to this account as a way to sign in, and becomes its verified email. We send a 6-digit code to it; type the code here.'
      : code ? 'We email you a link: click it and you are signed in (or type the 6-digit code in it here). New here? That makes your account, and you may choose a password for next time. Forgotten a password? Sign in this way and choose a new one.'
      : 'Your JEKray account: the address and the password you chose. If you have signed in with Google or Microsoft before, use those, or link the address from the account menu so your benches stay in one account.';
  };
  const finish = async r => {
    dlg.close();
    await loadAccount(); fillAccount();
    acctSay(r.linked ? 'Email address linked to your account' : r.password_set ? 'Signed in, and your password is set' : 'Signed in');
    if (!r.linked && typeof accountShown === 'function') accountShown();
  };
  sendBtn.addEventListener('click', async () => {
    err.hidden = true; const v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { fail('That does not look like an email address.'); email.focus(); return; }
    sendBtn.disabled = true;
    try {
      await api('/auth/email/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ email: v, return: (() => { const u = new URL(location.href); u.hash = ''; u.searchParams.delete('jekauth'); return u.toString(); })() }, link ? { link: true } : {})) });
      codeRow.hidden = false; okBtn.hidden = false; sendBtn.textContent = 'Send another'; codeIn.focus();
      acctSay('Sent to ' + v.toLowerCase() + ': click the link in it, or type its code here. It lasts 15 minutes; check your spam folder if it is slow.');
    } catch (e) { fail(e.message); }
    sendBtn.disabled = false;
  });
  okBtn.addEventListener('click', async () => {
    err.hidden = true; okBtn.disabled = true;
    try {
      const v = email.value.trim();
      if (mode === 'password') {
        if (!pw.value) { fail('Give the password, or ask for a code.'); okBtn.disabled = false; pw.focus(); return; }
        await finish(await api('/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, password: pw.value }) }));
      } else {
        const body = { email: v, code: codeIn.value };
        if (!link && newPw.value) body.password = newPw.value;
        await finish(await api('/auth/email/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
      }
    } catch (e) { fail(e.message); okBtn.disabled = false; (mode === 'password' ? pw : codeIn).focus(); }
  });
  other.addEventListener('click', () => { mode = mode === 'code' ? 'password' : 'code'; show(); (mode === 'code' ? email : pw).focus(); });
  for (const inp of [pw, codeIn, newPw]) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); } });
  email.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (mode === 'code' && codeRow.hidden ? sendBtn : okBtn).click(); } });
  dlg.replaceChildren(title, note, h('div', { class: 'rt-rows' }, h('div', { class: 'rt-f wide' }, h('label', { for: 'emailAddr' }, 'Email address'), email)), pwRow, codeRow, err,
    h('div', { class: 'rt-actions', style: 'justify-content:space-between;flex-wrap:wrap;gap:0.5rem' }, other, h('span', { style: 'display:flex;gap:0.5rem' }, cancel, sendBtn, okBtn)));
  show();
  dlg.showModal(); email.focus();
}
/* the account page's password section: set, change or remove the password that goes with the email sign-in */
function passwordSection() {
  const hasEmail = (account.identities || []).some(i => i.provider === 'email'), has = !!account.has_password;
  const box = h('div', { class: 'rt-acctpw' }, h('h3', null, 'Password'));
  if (!hasEmail) { box.append(h('p', null, 'A password goes with an email address. Link one from the account menu, and you can set a password here.')); return box; }
  const cur = h('input', { type: 'password', id: 'pwCur', autocomplete: 'current-password', placeholder: 'Current password' });
  const nw = h('input', { type: 'password', id: 'pwNew', autocomplete: 'new-password', placeholder: 'New password, at least 10 characters' });
  const err = h('p', { class: 'rt-error', hidden: '' });
  const save = h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    err.hidden = true;
    try { await api('/v1/me/password', jsonReq('PUT', Object.assign({ password: nw.value }, has ? { current: cur.value } : {}))); await loadAccount(); fillAccount(); showAccount(); acctSay(has ? 'Password changed' : 'Password set'); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  } }, has ? 'Change' : 'Set a password');
  const drop = has ? h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    if (!confirm('Remove your password? You will sign in with a code sent to your address, or with Google or Microsoft.')) return;
    try { await api('/v1/me/password', { method: 'DELETE' }); await loadAccount(); fillAccount(); showAccount(); acctSay('Password removed'); } catch (e) { acctSay(e.message, true); }
  } }, 'Remove') : null;
  box.append(h('p', null, has ? 'You sign in with your address and this password, or with a code sent to the address.' : 'No password yet: you sign in with a code sent to your address. Set one to sign in without waiting for an email.'),
    h('div', { class: 'rt-rows' }, has ? h('div', { class: 'rt-f wide' }, h('label', { for: 'pwCur' }, 'Current'), cur) : null, h('div', { class: 'rt-f wide' }, h('label', { for: 'pwNew' }, has ? 'New' : 'Password'), nw)),
    err, h('div', { class: 'rt-row' }, save, drop));
  return box;
}
/* ---------- The account page ----------
   The picture others see beside the name (resized here to 128 px and sent as WebP, so a photo of
   any size will do), the name itself, the email the sign-in gave, and the sign-ins. */
const AVATAR_PX = 128;
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = AVATAR_PX;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bmp.close();
  for (const [type, q] of [['image/webp', 0.85], ['image/webp', 0.6], ['image/jpeg', 0.7]]) {
    const blob = await new Promise(r => c.toBlob(r, type, q));
    if (blob && blob.size <= 60 * 1024) return blob;
  }
  throw new Error('That picture could not be made small enough.');
}
export function showAccount() {
  if (!account) return;
  const dlg = document.getElementById('acctDialog'), body = document.getElementById('acctBody'), u = account.user;
  const pic = avatarNode(u, 'big');
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const choose = h('button', { type: 'button', class: 'rt-btn', onclick: () => file.click() }, u.avatar ? 'Change picture\u2026' : 'Add a picture\u2026');
  const remove = u.avatar ? h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    try { await api('/v1/me/avatar', { method: 'DELETE' }); account.user.avatar = null; fillAccount(); showAccount(); acctSay('Picture removed'); } catch (err) { acctSay(err.message, true); }
  } }, 'Remove') : null;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    choose.disabled = true; choose.textContent = 'Sending\u2026';
    try {
      const blob = await shrinkImage(f);
      const r = await api('/v1/me/avatar', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
      account.user.avatar = r.avatar; fillAccount(); showAccount(); acctSay('Picture saved');
    } catch (err) { acctSay(err.message, true); choose.disabled = false; choose.textContent = 'Add a picture\u2026'; }
  });
  const name = h('input', { type: 'text', id: 'acctName', value: u.name, maxlength: '80', autocomplete: 'name' });
  const save = h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    const v = name.value.trim();
    if (!v || v === u.name) return;
    try { account = await api('/v1/me', jsonReq('PATCH', { name: v })); fillAccount(); showAccount(); acctSay('Name changed'); } catch (err) { acctSay(err.message, true); }
  } }, 'Save');
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
  const ids = (account.identities || []).map(i => PROVIDER_NAMES[i.provider] + (i.provider === 'orcid' || i.provider === 'email' ? ' ' + i.subject : ''));
  body.replaceChildren(
    h('div', { class: 'rt-acctpic' }, pic, h('div', null, h('p', null, 'Your picture is shown beside your name to the people you share a team with: on their benches, and while you are editing one.'), h('div', { class: 'rt-row' }, choose, remove, file))),
    h('label', { for: 'acctName' }, 'Your name, as others see it'), h('div', { class: 'rt-row' }, name, save),
    h('p', null, u.email ? 'Email: ' + u.email + ' (from your sign-in; it is where invitations and receipts go).' : 'Your sign-in gave no email address.'),
    h('p', null, 'Signed in with ' + (ids.join(' and ') || 'nothing yet') + '. Link another, or delete the account, from the account menu.'),
    passwordSection());
  if (!dlg.open) dlg.showModal();
}
/* ---------- Teams ----------
   A team is a workspace several people share, paid for by its owner with a seat for each
   owner, admin and editor (viewers are free, at least three seats). Owners and admins invite
   by email (a link that works for 14 days), set roles and remove people, and see the team's
   activity record; the owner hands the team on or deletes it. The seats follow the members:
   the API brings the subscription's quantity to the paid members on every change. */
const ROLE_NAMES = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const ROLE_NOTES = { admin: 'invites, removes and sets roles; takes a seat', editor: 'saves benches; takes a seat', viewer: 'opens and exports benches; free' };
const jsonReq = (method, obj) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const when = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export async function createTeam() {
  if (!account) { acctSay('Sign in first (account menu, top right)', true); return; }
  const name = (prompt('Name the team: your lab, group or company', '') || '').trim();
  if (!name) return;
  try {
    const t = await api('/v1/teams', jsonReq('POST', { name }));
    await loadAccount();
    acctSay('Team created. Invite people, then subscribe for its seats.');
    showTeam(t.id);
  } catch (err) { acctSay(err.message, true); }
}
let teamPrices = null;
export async function showTeam(id) {
  const dlg = document.getElementById('teamDialog'), body = document.getElementById('teamBody');
  if (!dlg.open) dlg.showModal();
  body.replaceChildren(h('p', null, 'Loading…'));
  let t;
  try { t = await api('/v1/teams/' + id); }
  catch (err) { body.replaceChildren(h('p', { class: 'rt-error' }, err.message)); return; }
  if (!teamPrices) try { teamPrices = await api('/v1/billing/prices'); } catch (err) { teamPrices = {}; }
  const again = () => showTeam(id);
  const act = (fn, done) => async () => { try { await fn(); if (done) acctSay(done); await loadAccount(); again(); } catch (err) { if (!err.quiet) acctSay(err.message, true); } };
  const manages = t.role === 'owner' || t.role === 'admin', owner = t.role === 'owner';
  const me = account && account.user, owning = t.members.find(m => m.role === 'owner');
  document.getElementById('teamTitle').textContent = t.name;
  // the name
  const rename = manages ? h('button', { type: 'button', class: 'rt-link', onclick: act(async () => { const name = (prompt('Rename the team', t.name) || '').trim(); if (!name || name === t.name) throw Object.assign(new Error(''), { quiet: true }); await api('/v1/teams/' + id, jsonReq('PATCH', { name })); }) }, 'Rename') : null;
  // the plan and its seats
  const p = t.plan, pm = teamPrices.team_monthly, py = teamPrices.team_yearly;
  const seatsLine = t.seats.paid + ' paid seat' + (t.seats.paid === 1 ? '' : 's') + ' (owner, admins and editors; at least ' + t.seats.min + ' are billed)' + (t.seats.billed ? ', ' + t.seats.billed + ' billed' : '');
  const plan = [];
  if (t.active && p) {
    plan.push(h('p', null, h('b', null, 'Team plan'), ', ' + (p.interval === 'year' ? 'yearly' : 'monthly') + (p.status === 'past_due' ? ', payment failed: update the card in Billing' : p.cancel_at ? ', ends ' + shortDate(p.cancel_at) : p.period_end ? ', renews ' + shortDate(p.period_end) : '') + '. ' + seatsLine + '.'));
    // a personal subscription made redundant by a paid seat here
    const mine = account && (account.workspaces || []).find(w => w.kind === 'personal');
    if (t.role !== 'viewer' && mine && mine.plan && mine.plan.billing && mine.active && !mine.plan.cancel_at && p.status !== 'past_due') {
      plan.push(h('p', null, 'Your seat here gives you JEKrayPro, so your own subscription' + (mine.plan.period_end ? ', which renews ' + shortDate(mine.plan.period_end) + ',' : '') + ' is no longer needed. ',
        h('button', { type: 'button', class: 'rt-link', onclick: act(async () => {
          const r = await api('/v1/workspaces/' + mine.id + '/billing/cancel', jsonReq('POST', {}));
          acctSay('Your own subscription ends ' + (r.cancel_at ? shortDate(r.cancel_at) : 'at the end of its period') + '; your personal benches stay yours and keep saving through the team’s seat.');
        }) }, 'Stop it at the end of its period'),
        '. Nothing is lost: your personal workspace and its benches stay, and the seat covers saving to them.'));
    }
    if (owner && p.billing) {
      const other = p.interval === 'month' ? 'year' : 'month';
      plan.push(h('div', { class: 'uni-row' }, h('button', { type: 'button', class: 'rt-btn', onclick: () => openPortal(id) }, 'Billing and invoices…'),
        !p.cancel_at && p.interval ? h('button', { type: 'button', class: 'rt-btn', onclick: () => switchInterval(id, other) }, other === 'year' ? 'Switch to yearly billing' : 'Switch to monthly billing') : null));
    }
  } else {
    plan.push(h('p', null, h('b', null, p ? 'The team’s subscription has ' + (p.status === 'past_due' ? 'paused: a payment failed' : 'ended') : 'No subscription yet'), '. Until the team is subscribed its members can open and export its benches but not save to it. ' + seatsLine + '.'));
    if (owner) {
      const tabs = h('div', { class: 'rt-subtabs', role: 'radiogroup', 'aria-label': 'Billing period' },
        ...[['month', 'Monthly'], ['year', 'Yearly']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': subInterval === v ? 'true' : 'false', class: 'rt-btn', onclick: () => { subInterval = v; again(); } }, label)));
      const price = subInterval === 'year' ? py : pm;
      const n = Math.max(t.seats.min, t.seats.paid);
      const go = h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startCheckout(id, 'team', go) }, 'Subscribe for ' + n + ' seats');
      plan.push(h('div', { class: 'uni-row' }, tabs, price ? h('span', null, h('b', null, money(price.amount, price.currency)), ' a seat a ' + (subInterval === 'year' ? 'year' : 'month') + ': ', h('b', null, money(price.amount * n, price.currency)), ' now') : h('span', { class: 'team-muted' }, 'Prices are not available just now.'), go),
        h('p', { class: 'rt-subsmall' }, 'Seats added later are charged for the rest of the period; seats freed come off at the next renewal. Prices include VAT where it applies; payment by Stripe. By subscribing you agree to the ', h('a', { href: '/jek/terms.html', target: '_blank' }, 'JEKrayPro Terms'), '.'));
    } else plan.push(h('p', null, 'Only the owner, ' + (owning ? owning.name : 'the owner') + ', can subscribe for the team.'));
  }
  // the members
  const canSet = m => m.role !== 'owner' && (owner || (m.role !== 'admin' || m.user_id === me.id));
  const roleCell = m => {
    if (!manages || !canSet(m)) return h('td', null, ROLE_NAMES[m.role] + (m.seat ? '' : ' (free)'));
    const sel = h('select', { 'aria-label': 'Role of ' + m.name }, ...['admin', 'editor', 'viewer'].filter(r => owner || r !== 'admin' || r === m.role).map(r => h('option', { value: r, selected: r === m.role }, ROLE_NAMES[r])));
    sel.addEventListener('change', act(() => api('/v1/teams/' + id + '/members/' + m.user_id, jsonReq('PATCH', { role: sel.value })), 'Role changed'));
    return h('td', null, sel);
  };
  const members = h('table', null, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Name'), manages ? h('th', { scope: 'col' }, 'Email') : null, h('th', { scope: 'col' }, 'Role'), h('th', { scope: 'col' }, 'Since'), h('th', { scope: 'col' }))),
    h('tbody', null, ...t.members.map(m => h('tr', null, h('td', null, h('span', { class: 'rt-name' }, avatarNode({ name: m.name, avatar: m.avatar }), m.name + (me && m.user_id === me.id ? ' (you)' : ''))), manages ? h('td', { class: 'team-muted' }, m.email || '') : null, roleCell(m), h('td', { class: 'team-muted' }, shortDate(m.joined_at)),
      h('td', { class: 'team-act' }, manages && canSet(m) && !(me && m.user_id === me.id) ? h('button', { type: 'button', class: 'rt-link', onclick: act(async () => { if (!confirm('Remove ' + m.name + ' from the team? Their benches here stay with the team.')) throw Object.assign(new Error(''), { quiet: true }); await api('/v1/teams/' + id + '/members/' + m.user_id, { method: 'DELETE' }); }, 'Removed') }, 'Remove') : null)))));
  // invitations
  const invites = [];
  if (manages) {
    const email = h('input', { type: 'email', 'aria-label': 'Email address to invite', placeholder: 'colleague@example.com', autocomplete: 'off' });
    const role = h('select', { 'aria-label': 'Role' }, ...(owner ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']).map(r => h('option', { value: r, selected: r === 'editor' }, ROLE_NAMES[r] + ': ' + ROLE_NOTES[r])));
    const said = h('div', null);
    const go = h('button', { type: 'button', class: 'rt-btn' }, 'Invite');
    const doInvite = async () => {
      go.disabled = true;
      try {
        const r = await api('/v1/teams/' + id + '/invites', jsonReq('POST', { email: email.value, role: role.value }));
        if (r.invited.sent) { acctSay('Invitation emailed to ' + r.invited.email); again(); }
        else {
          // no email went: the link is theirs to pass on
          const url = h('input', { type: 'text', readonly: true, value: r.invited.link, 'aria-label': 'Invitation link' });
          said.replaceChildren(h('p', null, 'We could not email ' + r.invited.email + '. Send them this link yourself; it works for 14 days, once:'),
            h('div', { class: 'team-link' }, url, h('button', { type: 'button', class: 'rt-btn', onclick: () => { url.select(); try { navigator.clipboard.writeText(r.invited.link); acctSay('Link copied'); } catch (err) { acctSay('Copy the link from the box', true); } } }, 'Copy')));
          email.value = '';
        }
      } catch (err) { acctSay(err.message, true); }
      go.disabled = false;
    };
    go.addEventListener('click', doInvite);
    email.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doInvite(); } });
    invites.push(h('h3', null, 'Invite someone'),
      h('p', null, 'They get an email with a link; they sign in with Google or Microsoft and are in. A new editor or admin adds a seat' + (t.active && t.seats.paid >= t.seats.min ? ', charged for the rest of the period' : '') + '; a viewer is free.'),
      h('div', { class: 'uni-row' }, email, role, go), said);
    if (t.invites && t.invites.length) invites.push(h('h3', null, 'Invited, not yet joined'), h('ul', { class: 'uni-list' }, ...t.invites.map(i => h('li', null, h('span', null, i.email + ' as ' + ROLE_NAMES[i.role].toLowerCase()), h('span', { class: 'team-muted' }, 'until ' + shortDate(i.expires_at)),
      h('button', { type: 'button', class: 'rt-link', onclick: act(() => api('/v1/teams/' + id + '/invites/' + i.id, { method: 'DELETE' }), 'Invitation withdrawn') }, 'Withdraw')))));
  }
  // leaving, handing on, deleting
  const ends = [h('h3', null, owner ? 'The team' : 'Leaving')];
  if (owner) {
    const others = t.members.filter(m => m.user_id !== me.id);
    if (others.length) {
      const sel = h('select', { 'aria-label': 'New owner' }, ...others.map(m => h('option', { value: m.user_id }, m.name)));
      ends.push(h('p', null, 'Hand the team on: the new owner takes over its subscription and billing, and you stay as an admin.'),
        h('div', { class: 'uni-row' }, sel, h('button', { type: 'button', class: 'rt-btn', onclick: act(async () => { const m = others.find(o => o.user_id === sel.value); if (!confirm('Make ' + m.name + ' the owner of ' + t.name + '? They take over its billing.')) throw Object.assign(new Error(''), { quiet: true }); await api('/v1/teams/' + id + '/transfer', jsonReq('POST', { user_id: sel.value })); }, 'The team has a new owner') }, 'Hand on')));
    }
    ends.push(h('p', null, 'Deleting the team cancels its subscription now and takes every bench in it, with its history, for everyone. It cannot be undone.'),
      h('button', { type: 'button', class: 'rt-btn danger', onclick: async () => {
        if ((prompt('To delete the team and all its benches, type its name: ' + t.name) || '').trim() !== t.name) return;
        try { await api('/v1/teams/' + id, { method: 'DELETE' }); dlg.close(); await loadAccount(); acctSay('Team deleted'); } catch (err) { acctSay(err.message, true); }
      } }, 'Delete the team…'));
  } else {
    ends.push(h('p', null, 'Benches you saved here stay with the team.'), h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
      if (!confirm('Leave ' + t.name + '?')) return;
      try { await api('/v1/teams/' + id + '/leave', { method: 'POST' }); dlg.close(); await loadAccount(); acctSay('You have left ' + t.name); } catch (err) { acctSay(err.message, true); }
    } }, 'Leave the team'));
  }
  // the activity record
  const log = manages && t.activity ? [h('h3', null, 'Activity'), t.activity.length ? h('div', { class: 'team-log' }, h('table', null, h('tbody', null, ...t.activity.map(a => h('tr', null, h('td', { class: 'team-muted' }, when(a.at)), h('td', null, a.who || 'Someone'), h('td', null, a.action.replace('.', ' ').replace(/_/g, ' ') + (a.target ? ': ' + a.target : ''))))))) : h('p', null, 'Nothing yet.')] : [];
  body.replaceChildren(...[
    h('p', null, 'You are ' + (t.role === 'owner' ? 'the owner' : 'an ' + ROLE_NAMES[t.role].toLowerCase()) + ' of this team. ', rename),
    h('h3', null, 'Plan'), ...plan,
    h('h3', null, 'Members'), members,
    ...invites, ...(manages ? teamSigningSection(t, id, again) : []), ...ends, ...log].filter(Boolean));
}
/* Signing part packs as the team: its web domain, verified by the team itself with a DNS record. Its owner
   and admins give the domain, add the TXT record JEKray answers with, and ask JEKray to look it up; once
   found, packs they sign as the team read ✓ Verified: team (domain). Needs the team on an active plan. */
function teamSigningSection(t, id, again) {
  const S = t.signing || { domain: null, pending: null }, D = S.domain, P = S.pending;
  const head = h('h3', { class: t.active ? '' : 'rt-proneed', title: t.active ? null : 'Needs the team on JEKrayPro' }, 'Signing packs as the team');
  const out = [head, h('p', null, 'Part packs signed as the team show as ', h('b', null, '\u2713 Verified: ' + t.name + ' (' + (D ? D.domain : 'your domain') + ')'),
    ', not as one person’s account, once the team has shown that its web domain is its own by adding a DNS record. Its owner and admins sign as the team when they make or sign a pack.')];
  const remove = label => h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    if (!confirm(D ? 'Take ' + D.domain + ' off? Packs already signed as the team stay as they are; signing as the team stops until a domain is verified again.' : 'Stop verifying ' + P.domain + '?')) return;
    try { await api('/v1/teams/' + id + '/domain', { method: 'DELETE' }); acctSay(D ? 'Domain taken off' : 'Stopped'); again(); } catch (err) { acctSay(err.message, true); }
  } }, label);
  if (D) {
    out.push(h('p', { class: 'team-domain' }, h('span', { class: 'rt-trust ok' }, '\u2713 Verified'), ' ', h('b', null, D.domain),
      h('span', { class: 'team-muted' }, D.method === 'dns' ? ', by its DNS record, last found ' + shortDate(D.checked_at || D.verified_at) + '.' : ', checked by JEK Systems.')),
      D.method === 'dns' ? h('p', { class: 'rt-hint' }, 'Keep the record in place: JEKray looks it up again when the team signs a pack, every 30 days. If it has gone, signing as the team stops until the domain is verified again.') : '',
      t.active ? '' : h('p', { class: 'note warn' }, 'The team’s plan is not active, so it cannot sign as itself just now.'),
      h('div', { class: 'uni-row' }, remove('Take the domain off…')));
    return out;
  }
  if (!t.active) {
    out.push(h('p', { class: 'team-muted' }, t.role === 'owner' ? 'Subscribe the team (above) to verify a domain.' : 'Once the team is subscribed, verify a domain here.'));
    return out;
  }
  // give the domain: the record to add comes back
  const start = (value, btn) => async () => {
    btn.disabled = true;
    try { await api('/v1/teams/' + id + '/domain', jsonReq('POST', { domain: value() })); again(); }
    catch (err) { acctSay(err.message, true); btn.disabled = false; }
  };
  if (!P || P.expired) {
    const dom = h('input', { type: 'text', id: 'teamDomainIn', placeholder: 'acme.com', autocomplete: 'off', spellcheck: 'false', value: P ? P.domain : '' });
    const go = h('button', { type: 'button', class: 'rt-btn primary' }, 'Get the record to add');
    go.addEventListener('click', start(() => dom.value, go));
    dom.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    if (P) out.push(h('p', { class: 'note warn' }, 'The record for ' + P.domain + ' was good for 7 days and has expired. Ask again for a new one.'));
    out.push(h('label', { class: 'team-domain', for: 'teamDomainIn' }, 'Verify a domain for signing packs: the organisation’s own web domain, as in its email addresses'), h('div', { class: 'uni-row' }, dom, go));
    return out;
  }
  // the record, to copy into the domain's DNS settings, then Check now
  const copyRow = (label, value) => {
    const box = h('input', { type: 'text', readonly: true, value, 'aria-label': label });
    return h('div', { class: 'team-record' }, h('span', null, label), h('div', { class: 'team-link' }, box,
      h('button', { type: 'button', class: 'rt-btn', onclick: () => { box.select(); try { navigator.clipboard.writeText(value); acctSay(label + ' copied'); } catch (err) { acctSay('Copy it from the box', true); } } }, 'Copy')));
  };
  const said = h('p', { class: 'note', hidden: true, role: 'status' });
  const check = h('button', { type: 'button', class: 'rt-btn primary' }, 'Check now');
  check.addEventListener('click', async () => {
    check.disabled = true; said.hidden = false; said.className = 'note'; said.textContent = 'Looking the record up…';
    try {
      const r = await api('/v1/teams/' + id + '/domain/verify', jsonReq('POST', {}));
      acctSay('Verified ' + (r.domain ? r.domain.domain : P.domain) + ': the team can sign packs as itself');
      again();
    } catch (err) { said.className = 'note warn'; said.textContent = err.message; check.disabled = false; }
  });
  out.push(h('p', null, 'Add this record to ', h('b', null, P.domain), ' where its DNS is managed (the domain’s registrar or host: a new ', h('b', null, 'TXT'), ' record), then choose ', h('b', null, 'Check now'), '. A new record can take a while to show; it is good until ' + shortDate(P.expires_at) + '.'),
    copyRow('Type', P.record.type), copyRow('Name', P.record.name), copyRow('Value', P.record.value),
    h('p', { class: 'rt-hint' }, 'Some DNS hosts want the name without the domain: ' + P.record.name.slice(0, -(P.domain.length + 1)) + '.'),
    h('div', { class: 'uni-row' }, check, remove('Cancel')), said);
  return out;
}
/* an invitation link (?jekinvite=<token>) taken from the address and kept across the sign-in it
   may need; once signed in, what it is for is shown and, on a yes, accepted */
export function takeInvite() {
  const q = new URLSearchParams(location.search), token = q.get('jekinvite');
  if (!token) return;
  q.delete('jekinvite');
  window.history.replaceState(window.history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  try { sessionStorage.setItem('jekinvite', token); } catch (err) { acctSay('This browser cannot keep the invitation: open the link again once signed in', true); }
}
let inviteBusy = false;
async function handleInvite() {
  let token = null;
  try { token = sessionStorage.getItem('jekinvite'); } catch (err) { return; }
  if (!token || inviteBusy) return;
  inviteBusy = true;
  const drop = () => { try { sessionStorage.removeItem('jekinvite'); } catch (err) { /* it will be asked about again */ } };
  try {
    if (!account) {
      const btn = document.getElementById('btnAcct');
      if (btn && document.getElementById('acctMenu').hidden) btn.click();
      acctSay('You have been invited to a team: sign in to join it');
      return;
    }
    let inv;
    try { inv = await api('/v1/invitations/' + encodeURIComponent(token)); }
    catch (err) { drop(); acctSay(err.message, true); return; }
    if (!confirm(inv.inviter + ' has invited you to join the team “' + inv.team + '” as ' + (inv.role === 'admin' ? 'an admin' : 'a ' + inv.role) + '. Join it?')) { drop(); return; }
    const r = await api('/v1/invitations/accept', jsonReq('POST', { token }));
    drop();
    await loadAccount();
    acctSay('You are in ' + r.team.name);
    showTeam(r.team.id);
  } catch (err) { acctSay(err.message, true); }
  finally { inviteBusy = false; }
}
/* A university's licence, for the people who look after it there: its state, its tier and
   how many use it each month, what it covers, invitations for people without a university
   address, and taking someone off by email. Who uses it is never shown. */
async function showUniAdmin(id) {
  const dlg = document.getElementById('uniDialog'), body = document.getElementById('uniBody');
  if (!dlg.open) dlg.showModal();
  body.replaceChildren(h('p', null, 'Loading\u2026'));
  let d;
  try { d = await api('/v1/institutions/' + id); }
  catch (err) { body.replaceChildren(h('p', { class: 'rt-error' }, err.message)); return; }
  document.getElementById('uniTitle').textContent = d.name;
  const l = d.licence, post = (path, obj) => api('/v1/institutions/' + id + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  const status = !l ? 'There is no licence yet.' : l.active ? 'JEKrayPro licence, active' + (l.until ? ' until ' + shortDate(l.until) : '') + (l.invoiced ? ', invoiced yearly.' : '.') : 'The licence has ended. People keep their accounts and can open and export their benches.';
  const tier = l ? (l.max_users ? 'Tier: ' + l.max_users + ' people in any 12 months. ' : 'Tier: no limit on people. ') + d.users_12_months + (d.users_12_months === 1 ? ' person has' : ' people have') + ' used it in the last 12 months.' : '';
  const full = l && l.max_users && d.users_12_months >= l.max_users ? h('p', null, h('b', null, 'The tier is full: '), 'someone new can join once a place frees, when a person has not used it for 12 months or you take someone off below. For a larger tier, email ', h('a', { href: 'mailto:sales@jeksys.net' }, 'sales@jeksys.net'), '.') : null;
  const months = d.months.length ? h('table', null, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Month'), h('th', { scope: 'col' }, 'People who used it'))),
    h('tbody', null, ...d.months.map(m => h('tr', null, h('td', null, new Date(m.month + '-01T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })), h('td', null, String(m.users))))))
    : h('p', null, 'No one has used it yet.');
  const covers = [...d.domains.map(x => 'an email address at ' + x), ...(d.tenants.length ? ['a Microsoft account from your university'] : []), ...d.orgs.map(o => 'a current affiliation on ORCID (' + o.scheme + ' ' + o.value + ')')];
  // invitations
  const invEmail = h('input', { type: 'email', 'aria-label': 'Email address to invite', placeholder: 'visitor@example.com', autocomplete: 'off' });
  const invite = h('button', { type: 'button', class: 'rt-btn' }, 'Invite');
  invite.addEventListener('click', async () => {
    try { await post('/invites', { email: invEmail.value }); acctSay('Invited ' + invEmail.value.trim()); showUniAdmin(id); } catch (err) { acctSay(err.message, true); }
  });
  const invites = d.invites.length ? h('ul', { class: 'uni-list' }, ...d.invites.map(i => h('li', null, h('span', null, i.email),
    h('button', { type: 'button', class: 'rt-link', onclick: async () => { try { await api('/v1/institutions/' + id + '/invites/' + encodeURIComponent(i.email), { method: 'DELETE' }); showUniAdmin(id); } catch (err) { acctSay(err.message, true); } } }, 'Remove'))))
    : h('p', null, 'No one invited.');
  // taking someone off, and back
  const offEmail = h('input', { type: 'email', 'aria-label': 'Email address of the person', placeholder: 'name@' + (d.domains[0] || 'university.ac.uk'), autocomplete: 'off' });
  const said = h('p', { role: 'status' });
  const act = (path, msg) => async () => {
    const e = offEmail.value.trim();
    try { await post(path, { email: e }); said.textContent = msg(e); } catch (err) { said.textContent = err.message; }
  };
  body.replaceChildren(...[
    h('p', null, status), tier ? h('p', null, tier) : null, full,
    h('h3', null, 'People who used it, by month'), months,
    h('p', null, 'You see how many people use the licence, never who they are.'),
    h('h3', null, 'Who it covers'),
    h('p', null, covers.length ? 'Anyone who signs in with ' + covers.join(', or ') + ', and the people you invite below. To change this, email ' : 'The people you invite below. To add your university\u2019s addresses, email ', h('a', { href: 'mailto:support@jeksys.net' }, 'support@jeksys.net'), '.'),
    d.tenants.length ? h('p', null, 'If people see \u201cNeed admin approval\u201d when signing in with Microsoft, your IT team approves JEKray once, for everyone. Send them ',
      d.microsoft_approval ? h('a', { href: d.microsoft_approval, target: '_blank', rel: 'noopener' }, 'this approval link') : 'the approval link from support@jeksys.net',
      d.microsoft_approval ? h('button', { type: 'button', class: 'rt-link', onclick: () => { try { navigator.clipboard.writeText(d.microsoft_approval); acctSay('Approval link copied'); } catch (err) { acctSay('Copy the link from its right-click menu', true); } } }, ' (copy)') : null,
      ': an administrator of your Microsoft organisation opens it, signs in and accepts. JEKray asks only to sign people in.') : null,
    h('h3', null, 'Invite people without a university address'),
    h('p', null, 'They are covered when they sign in with Google or Microsoft using this address.'),
    h('div', { class: 'uni-row' }, invEmail, invite), invites,
    h('h3', null, 'Take someone off'),
    h('p', null, 'By their email address. Their place frees at once; their benches stay theirs.'),
    h('div', { class: 'uni-row' }, offEmail,
      h('button', { type: 'button', class: 'rt-btn', onclick: act('/remove', e => 'If ' + e + ' was using the licence, they no longer can, and their place is free.') }, 'Take off'),
      h('button', { type: 'button', class: 'rt-btn', onclick: act('/restore', e => 'If ' + e + ' was taken off, they can use the licence again.') }, 'Restore')),
    said].filter(Boolean));
}
/* Deleting the account: what goes and what stays said plainly, the export offered first, and
   the words typed out, as the API asks for them */
const DELETE_WORDS = 'delete my account';
function showDeleteAccount() {
  if (!account) return;
  const dlg = document.getElementById('deleteDialog'), input = document.getElementById('deleteConfirm'), go = document.getElementById('deleteGo'), err = document.getElementById('deleteError');
  const ws = account.workspaces || [], mine = ws.find(w => w.kind === 'personal');
  const teams = ws.filter(w => w.kind !== 'personal'), owned = teams.filter(w => w.role === 'owner');
  const paying = ws.filter(w => w.role === 'owner' && w.plan && w.plan.billing && w.active && !w.plan.cancel_at);
  document.getElementById('deleteBody').replaceChildren(
    h('p', null, 'This deletes, at once and for good:'),
    h('ul', null,
      h('li', null, 'every bench in your personal workspace, with its history, its folders and anything in the bin;'),
      h('li', null, 'your name, email address, sign-ins (' + (account.identities || []).map(i => PROVIDER_NAMES[i.provider]).join(' and ') + ') and every session, on every device.'),
      paying.length ? h('li', null, h('b', null, 'Your JEKrayPro subscription is cancelled now'), ', not at the end of the period, and the rest of the period is not refunded. If you subscribed in the last 14 days, email ', h('a', { href: 'mailto:support@jeksys.net' }, 'support@jeksys.net'), ' for your refund.') : null,
      mine && mine.plan && mine.plan.billing ? h('li', null, 'Stripe keeps your invoices for six years, as UK tax law requires.') : null),
    teams.length ? h('p', null, 'Benches you saved in ' + teams.map(w => '\u201c' + w.name + '\u201d').join(', ') + ' stay there, marked as by a deleted user.' + (owned.length ? ' A team with other people in it needs a new owner first.' : '')) : null,
    h('p', null, 'This cannot be undone. Your benches in this browser are kept. ', h('a', { href: API_BASE + '/v1/me/export', class: 'rt-link' }, 'Download all your cloud benches (.zip)'), ' first if you want a copy.'));
  input.value = ''; go.disabled = true; err.hidden = true;
  dlg.showModal(); input.focus();
}
async function loadAccount() {
  try { account = await api('/v1/me'); accountKnown = true; }
  catch (err) {
    account = null;
    if (err.status === 401) accountKnown = true;          // signed out for sure; the API out of reach says nothing
    // said only to someone whose bench here saves to the cloud; anyone else just sees Sign in
    if (err.status !== 401 && hooks.sayUnreachable()) acctSay('Could not reach your account: ' + err.message, true);
  }
  // someone who signs in with ORCID alone is told, once a session, that it is ending
  if (account && account.orcid_ends && !(account.identities || []).some(i => i.provider !== 'orcid') && !orcidWarned) {
    orcidWarned = true;
    setTimeout(() => acctSay('Signing in with ORCID ends on ' + shortDate(account.orcid_ends) + ': link Google or Microsoft from the account menu, top right, to keep your account.', true), 1200);
  }
  // an account made in the last half hour: counted once, against where the visit came from
  try {
    if (account && Date.now() - account.user.created_at < 30 * 60e3 && !localStorage.getItem('jek-goal-account')) { localStorage.setItem('jek-goal-account', '1'); goal('account'); }
  } catch (err) { /* not counted */ }
  fillAccount();
  hooks.accountLoadedHere();
  handleInvite();
}
export const FREE_GIVES = 'A free account lets you export images and data, make part packs and use the experimental features, and join a team when invited.';
export const UNI_LINE = 'University email? If your university has a JEKray licence, signing in with it gives you JEKrayPro; if not, it gets you the academic price.';
// set when the account is known (signed in, or the API said signed out): the notes wait for it
export let accountKnown = false;
export function signInRow(where, close) {
  const go = (p, fn) => () => { track('prompt', where + '.' + p); close(); fn(); };
  return [h('button', { class: 'rt-btn primary', type: 'button', onclick: go('google', () => signIn('google')) }, 'Continue with Google'),
    h('button', { class: 'rt-btn', type: 'button', onclick: go('microsoft', () => signIn('microsoft')) }, 'Microsoft'),
    h('button', { class: 'rt-btn', type: 'button', onclick: go('email', () => showEmailSignIn(false)) }, 'Email')];
}
// accounts are part of the tool (open beta); not in an embed, nor in test mode
export const accountsOn = () => !TEST_MODE && !EMBED;
export let accountLoaded = null, orcidWarned = false;       // the first look at the account, for what waits on it (#pro)
/* #pro, from the product page's JEKrayPro buttons: the subscription box when signed in,
   the sign-in choices when not, and a word when Pro is already theirs */
export async function proLink() {
  await accountLoaded;
  const mine = account && account.workspaces.find(w => w.kind === 'personal');
  if (mine && mine.active) { acctSay(account.licence ? 'You have JEKrayPro through ' + account.licence.name : 'You already have JEKrayPro'); return; }
  showSubscribe();
}
// sign in from the plans (an existing account, or to make a team)
function proSignIn() { hooks.openAccountMenu(); }
export function accountShown() {
  const on = accountsOn();
  const box = document.getElementById('acct'); if (box) box.hidden = !on;
  hooks.accountChanged();
  if (on && account === undefined && !TEST_MODE) { account = null; fillAccount(); accountLoaded = loadAccount(); }
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireAccount() {
  const gp = document.getElementById('btnGetPro');
  if (gp) gp.addEventListener('click', () => { track('prompt', 'getpro.plans'); showSubscribe(); });
  hooks.account = () => ({ on: accountsOn(), signedIn: !!account, known: accountKnown });
  hooks.apiBase = () => API_BASE; hooks.usageTier = () => (!account ? 'anon' : (account.workspaces || []).some(w => w.active && w.kind !== 'institution') ? 'pro' : 'free');
  for (const [d, c] of [['uniDialog', 'uniClose'], ['teamDialog', 'teamClose'], ['acctDialog', 'acctClose'], ['subDialog', 'subClose']]) {
    const b = document.getElementById(c); if (b) b.addEventListener('click', () => document.getElementById(d).close());
  }
  // the signed-out menu is a prompt too: counted as it opens (after the app has opened it)
  const ab = document.getElementById('btnAcct');
  if (ab) ab.addEventListener('click', () => { const m = document.getElementById('acctMenu'); if (account === null && (!m || !m.hidden)) track('prompt', 'menu.shown'); });
  takeInvite();

  {
    const dlg = document.getElementById('deleteDialog'), input = document.getElementById('deleteConfirm'), go = document.getElementById('deleteGo'), err = document.getElementById('deleteError');
    input.addEventListener('input', () => { go.disabled = input.value.trim().toLowerCase() !== DELETE_WORDS; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !go.disabled) go.click(); });
    document.getElementById('deleteCancel').addEventListener('click', () => dlg.close());
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = 'Deleting…'; err.hidden = true;
      try {
        await api('/v1/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: DELETE_WORDS }) });
        dlg.close(); account = null;
        hooks.accountDeleted();
        fillAccount(); acctSay('Your account has been deleted');
      } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; }
      go.textContent = 'Delete my account';
    });
  }

}

/* the outcome of a sign-in or a payment, back from the API or Stripe: said once, and taken out of the address (JEKion
   and JEKsuite; JEKray reads it in io/cloud.js, with what its cloud bench does then) */
export function authOutcome() {
  const q = new URLSearchParams(location.search), outcome = q.get('jekauth'), code = q.get('jekauthcode'), billing = q.get('jekbilling');
  if (outcome || billing) {
    q.delete('jekauth'); q.delete('jekauthcode'); q.delete('jekbilling');
    window.history.replaceState(window.history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
  const m = outcome && AUTH_OUTCOMES[outcome];
  if (m) setTimeout(() => acctSay(m[0] + (code && /^[\w-]{1,40}$/.test(code) ? ' (Microsoft: ' + code + ')' : ''), m[1]), 600);
  if (billing === 'cancelled') setTimeout(() => acctSay('Payment cancelled: nothing was charged'), 600);
  if (billing === 'success' && accountsOn()) setTimeout(() => awaitPlan(), 300);
}
