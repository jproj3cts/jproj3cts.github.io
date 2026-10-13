import { EMBED, STORE_KEY, TEST_MODE, cloud } from '../core/constants.js';
import { serialize } from '../state/elements.js';
import { h } from '../ui/panel.js';
import { toast } from '../ui/actions.js';
import { menuIcons } from './packs.js';
import { cloudLink, cloudMenuShown, cloudPush } from './cloud.js';
import { saveTimer } from './autosave.js';

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
  if (!res.ok) { const e = new Error((body && body.error && body.error.message) || 'The service is unavailable.'); e.status = res.status; e.code = body && body.error && body.error.code; e.version = body && body.error && body.error.version; throw e; }
  return body;
}
const PROVIDER_NAMES = { google: 'Google', microsoft: 'Microsoft', orcid: 'ORCID' };
export const AUTH_OUTCOMES = {
  signed_in: ['Signed in'], linked: ['Sign-in linked to your account'], cancelled: ['Sign-in cancelled'],
  expired: ['That sign-in took too long or was opened in another browser. Please try again.', true],
  failed: ['Sign-in did not work. Please try again.', true], taken: ['That sign-in already belongs to another JEKray2D account.', true],
  signed_out: ['Please sign in first.', true],
  unavailable: ['That way of signing in is not available yet. Please use another.', true],
  orcid_closed: ['Signing in with ORCID has ended. Sign in with Google or Microsoft; if your account could only sign in with ORCID, email support@jeksys.net and we will move it for you.', true],
  consented: ['Thank you: JEKray2D is approved for your organisation, and everyone there can now sign in with Microsoft.'],
  consent_failed: ['JEKray2D was not approved for your organisation. Nothing has changed.', true],
};
function signIn(provider, link) {
  const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekauth');
  if (!EMBED) try { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ }
  location.href = API_BASE + '/auth/' + provider + '/start?' + new URLSearchParams(Object.assign({ return: ret.toString() }, link ? { link: '1' } : {}));
}
const initials = name => (name || '?').split(/\s+/).filter(w => /^\p{L}/u.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase() || (name || '?')[0];
/* ---------- JEKrayPro subscription ----------
   Stripe Checkout takes the payment and Stripe's portal manages it; the plan itself only ever
   changes through Stripe's webhook to the API, so after paying the app waits for it to land. */
const shortDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function planText(w) {
  if (w.kind === 'institution') return 'you look after its JEKrayPro licence';
  const p = w.plan, lic = w.kind === 'personal' && account && account.licence;
  // a university's licence, unless they pay for their own as well
  if (lic && !(p && p.billing && w.active && p.status !== 'past_due')) return 'JEKrayPro through ' + lic.name;
  // their university has a licence, but every place in its tier is taken
  const full = w.kind === 'personal' && !w.active && account && account.licence_full;
  if (full) return full.name + '\u2019s licence is full: ask whoever looks after it for a larger tier';
  if (!p) return 'No subscription yet';
  const name = p.plan === 'academic' ? 'JEKrayPro (academic)' : 'JEKrayPro';
  if (!p.billing) return w.active ? name : 'Plan ended';
  if (p.status === 'past_due') return w.active ? name + ': payment failed, please update your card in Billing' : 'Paused: payment failed';
  if (!w.active) return 'Subscription ' + (p.status === 'canceled' ? 'ended' : p.status.replace(/_/g, ' '));
  const how = p.interval === 'year' ? 'yearly' : 'monthly';
  return name + ', ' + how + (p.cancel_at ? ', ends ' + shortDate(p.cancel_at) : p.period_end ? ', renews ' + shortDate(p.period_end) : '');
}
const money = (pence, cur) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: (cur || 'gbp').toUpperCase(), minimumFractionDigits: pence % 100 ? 2 : 0 }).format(pence / 100);
let subInterval = 'month';
const acCheck = { email: '', sent: false };   // a university address being confirmed by a code
export async function showSubscribe() {
  const dlg = document.getElementById('subDialog'), box = document.getElementById('subPlans');
  if (!dlg.open) dlg.showModal();
  box.replaceChildren(h('p', null, 'Loading prices…'));
  let prices;
  try { prices = await api('/v1/billing/prices'); }
  catch (err) { box.replaceChildren(h('p', null, 'Could not load prices: ' + err.message)); return; }
  const mine = account && account.workspaces.find(w => w.kind === 'personal');
  const tabs = h('div', { class: 'rt-subtabs', role: 'radiogroup', 'aria-label': 'Billing period' },
    ...[['month', 'Monthly'], ['year', 'Yearly']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': subInterval === v ? 'true' : 'false', class: 'rt-btn', onclick: () => { subInterval = v; showSubscribe(); } }, label)));
  const card = (tier, title, blurb, extra) => {
    const p = prices[tier + (subInterval === 'year' ? '_yearly' : '_monthly')];
    if (!p) return null;
    const month = prices[tier + '_monthly'];
    const saving = subInterval === 'year' && month ? Math.round(100 * (1 - p.amount / (12 * month.amount))) : 0;
    const go = h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startCheckout(mine.id, tier, go) }, 'Continue to payment');
    if (extra && extra.locked) go.disabled = true;
    return h('div', { class: 'rt-subcard' }, h('h3', null, title), h('p', { class: 'rt-subprice' }, h('b', null, money(p.amount, p.currency)), ' a ' + (subInterval === 'year' ? 'year' : 'month'), saving > 0 ? h('small', null, ' · save ' + saving + '%') : null),
      h('p', null, blurb), extra ? extra.node : null, go);
  };
  const ac = account && account.academic;
  const check = h('button', { type: 'button', class: 'rt-link', onclick: async () => {
    check.disabled = true; check.textContent = 'Checking…';
    try { const r = await api('/v1/me/academic', { method: 'POST' }); account.academic = r; toast('Academic price confirmed'); }
    catch (err) { toast(err.message, true); }
    showSubscribe();
  } }, 'Check my sign-in');
  // or a university address, proved by a 6-digit code emailed to it (which a university's licence counts too)
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const acForm = () => {
    const email = h('input', { type: 'email', class: 'rt-subinput', placeholder: 'you@university.ac.uk', 'aria-label': 'Your university email address', autocomplete: 'email', value: acCheck.email || '' });
    const err = h('p', { class: 'rt-error', hidden: '' });
    const fail = e => { err.textContent = e.message; err.hidden = false; };
    if (!acCheck.sent) {
      const go = h('button', { type: 'submit', class: 'rt-btn' }, 'Send a code');
      return h('form', { class: 'rt-subform', onsubmit: async e => {
        e.preventDefault(); go.disabled = true; go.textContent = 'Sending…'; err.hidden = true;
        try { const r = await post('/v1/me/academic/email', { email: email.value }); Object.assign(acCheck, { email: r.email, sent: true }); showSubscribe(); }
        catch (e2) { fail(e2); go.disabled = false; go.textContent = 'Send a code'; }
      } }, h('label', null, 'Or confirm your university email address:'), h('span', { class: 'rt-subrow' }, email, go), err);
    }
    const code = h('input', { type: 'text', class: 'rt-subinput rt-subcode', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '7', placeholder: '123456', 'aria-label': 'The 6-digit code' });
    const go = h('button', { type: 'submit', class: 'rt-btn primary' }, 'Confirm');
    setTimeout(() => code.focus(), 0);
    return h('form', { class: 'rt-subform', onsubmit: async e => {
      e.preventDefault(); go.disabled = true; go.textContent = 'Checking…'; err.hidden = true;
      try {
        const r = await post('/v1/me/academic/code', { code: code.value });
        Object.assign(acCheck, { email: '', sent: false });
        await loadAccount();
        if (account.licence) { dlg.close(); toast('Confirmed: you have JEKrayPro through ' + account.licence.name); return; }
        account.academic = account.academic || r; toast('Academic price confirmed'); showSubscribe();
      } catch (e2) {
        if (/expired|too_many_tries|no_code/.test(e2.code || '')) acCheck.sent = false;
        fail(e2); go.disabled = false; go.textContent = 'Confirm';
        if (!acCheck.sent) setTimeout(showSubscribe, 1800);
      }
    } }, h('label', null, 'We have emailed a 6-digit code to ', h('b', null, acCheck.email), '. Type it here (it lasts 15 minutes):'),
      h('span', { class: 'rt-subrow' }, code, go),
      h('span', { class: 'rt-subsmall' }, 'Not there? Look in junk mail, or ', h('button', { type: 'button', class: 'rt-link', onclick: () => { acCheck.sent = false; showSubscribe(); } }, 'use another address or send again'), '.'), err);
  };
  const acNote = ac ? h('p', { class: 'rt-subok' }, '✓ Confirmed (' + (ac.email || ac.via) + ')') : h('div', { class: 'rt-subcheck' },
    h('p', null, 'For current students and staff of a university or similar. ', check, ' to use the university address you sign in with.'),
    acForm(),
    h('p', { class: 'rt-subsmall' }, 'No university address? Email support@jeksys.net and we will check by hand.'));
  const uni = h('button', { type: 'button', class: 'rt-link', onclick: async () => {
    uni.disabled = true; uni.textContent = 'Checking…';
    try { await api('/v1/me/institution', { method: 'POST' }); await loadAccount(); dlg.close(); toast('You have JEKrayPro through ' + account.licence.name); return; }
    catch (err) { toast(err.message, true); }
    uni.disabled = false; uni.textContent = 'Check for a university licence';
  } }, 'Check for a university licence');
  const uniNote = h('p', { class: 'rt-subcheck' }, 'Does your university have JEKrayPro for everyone? ', uni,
    ': with your university Google or Microsoft account it shows on its own; or confirm your university email address under Academic below, or ask your university\u2019s licence administrator to invite you.');
  box.replaceChildren(uniNote, tabs, h('div', { class: 'rt-subcards' },
    card('pro', 'JEKrayPro', 'For anyone: your benches in the cloud, their history, on every device.'),
    card('academic', 'Academic', 'The same, at half the price.', { node: acNote, locked: !ac })));
}
async function startCheckout(ws, tier, btn) {
  btn.disabled = true; btn.textContent = 'Opening secure payment…';
  try {
    const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekbilling'); ret.searchParams.delete('jekauth');
    if (!EMBED) try { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ }
    const { url } = await api('/v1/workspaces/' + ws + '/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: tier, interval: subInterval, return: ret.toString() }) });
    location.href = url;
  } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Continue to payment'; }
}
async function openPortal(ws) {
  try {
    const ret = new URL(location.href); ret.hash = '';
    const { url } = await api('/v1/workspaces/' + ws + '/billing/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ return: ret.toString() }) });
    location.href = url;
  } catch (err) { toast(err.message, true); }
}
async function switchInterval(ws, interval) {
  if (!confirm(interval === 'year' ? 'Switch to yearly billing? You are charged for the year now, less what is left of this month.' : 'Switch to monthly billing? What is left of your year is credited against the coming months.')) return;
  try { await api('/v1/workspaces/' + ws + '/billing/interval', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interval }) }); toast('Billing switched to ' + (interval === 'year' ? 'yearly' : 'monthly')); loadAccount(); }
  catch (err) { toast(err.message, true); }
}
// back from Stripe Checkout: the webhook may take a moment to arrive
export async function awaitPlan(tries = 12) {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, i ? 2000 : 500));
    try { account = await api('/v1/me'); } catch (err) { continue; }
    const mine = account.workspaces.find(w => w.kind === 'personal');
    if (mine && mine.active) { fillAccount(); toast('Welcome to JEKrayPro. Thank you!'); if (cloud && cloud.dirty) cloudPush({ quiet: true }); return; }
  }
  fillAccount(); toast('Payment received. Your plan will show here in a minute or two; reload if it does not.');
}
export function fillAccount() {
  const btn = document.getElementById('btnAcct'), menu = document.getElementById('acctMenu');
  const item = (icon, label, fn) => h('button', { type: 'button', role: 'menuitem', 'data-icon': icon, onclick: fn }, label);
  const legal = h('span', { class: 'rt-menunote' }, h('a', { href: '/jek/privacy.html', target: '_blank' }, 'Privacy'), ' · ', h('a', { href: '/jek/terms.html', target: '_blank' }, 'Terms'), ' · ', h('a', { href: '/jek/accessibility.html', target: '_blank' }, 'Accessibility'));
  if (!account) {
    btn.classList.remove('in'); btn.textContent = 'Sign in'; btn.removeAttribute('title'); btn.setAttribute('aria-label', 'Sign in');
    menu.replaceChildren(item('signin', 'Sign in with Google', () => signIn('google')), item('signin', 'Sign in with Microsoft (university or work)', () => signIn('microsoft')),
      h('div', { class: 'sep' }), h('span', { class: 'rt-menunote' }, 'JEKrayPro, cloud saving for JEKray2D (open beta): your benches saved to the cloud as you work, with their history, on any computer. Sign in, then Subscribe.'), legal);
  } else {
    const u = account.user, ids = account.identities || [], ws = account.workspaces || [];
    btn.classList.add('in'); btn.textContent = initials(u.name); btn.title = u.name; btn.setAttribute('aria-label', 'Account: ' + u.name);
    const orcid = ids.find(i => i.provider === 'orcid');
    const rows = [h('div', { class: 'rt-accthead' }, h('b', null, u.name), u.email ? h('span', null, u.email) : null, orcid ? h('span', null, 'ORCID ' + orcid.subject) : null),
      ...ws.map(w => h('span', { class: 'rt-menunote' }, (w.kind === 'personal' ? 'Personal' : w.name) + ': ' + planText(w))),
      // ORCID sign-in is ending: someone with no other way in is asked to link one
      account.orcid_ends && !ids.some(i => i.provider !== 'orcid') ? h('span', { class: 'rt-menunote rt-warn' }, 'Signing in with ORCID ends on ' + shortDate(account.orcid_ends) + '. Link Google or Microsoft below to keep your account.') : null,
      h('div', { class: 'sep' })].filter(Boolean);
    // a university's licence, for those who look after it there
    for (const w of ws) if (w.kind === 'institution' && (w.role === 'admin' || w.role === 'owner')) rows.push(item('user', w.name + ' licence\u2026', () => showUniAdmin(w.id)));
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
    if (rows[rows.length - 1].className !== 'sep') rows.push(h('div', { class: 'sep' }));
    for (const p of ['google', 'microsoft']) if (!ids.some(i => i.provider === p)) rows.push(item('signin', 'Link ' + PROVIDER_NAMES[p] + ' sign-in', () => signIn(p, true)));
    rows.push(item('signout', 'Sign out', async () => {
      try { await api('/auth/signout', { method: 'POST' }); account = null; fillAccount(); toast('Signed out'); }
      catch (err) { toast(err.message, true); }
    }), item('trash', 'Delete account…', showDeleteAccount), h('div', { class: 'sep' }), legal);
    menu.replaceChildren(...rows);
  }
  menuIcons(menu);
  cloudMenuShown();
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
    try { await post('/invites', { email: invEmail.value }); toast('Invited ' + invEmail.value.trim()); showUniAdmin(id); } catch (err) { toast(err.message, true); }
  });
  const invites = d.invites.length ? h('ul', { class: 'uni-list' }, ...d.invites.map(i => h('li', null, h('span', null, i.email),
    h('button', { type: 'button', class: 'rt-link', onclick: async () => { try { await api('/v1/institutions/' + id + '/invites/' + encodeURIComponent(i.email), { method: 'DELETE' }); showUniAdmin(id); } catch (err) { toast(err.message, true); } } }, 'Remove'))))
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
    d.tenants.length ? h('p', null, 'If people see \u201cNeed admin approval\u201d when signing in with Microsoft, your IT team approves JEKray2D once, for everyone. Send them ',
      d.microsoft_approval ? h('a', { href: d.microsoft_approval, target: '_blank', rel: 'noopener' }, 'this approval link') : 'the approval link from support@jeksys.net',
      d.microsoft_approval ? h('button', { type: 'button', class: 'rt-link', onclick: () => { try { navigator.clipboard.writeText(d.microsoft_approval); toast('Approval link copied'); } catch (err) { toast('Copy the link from its right-click menu', true); } } }, ' (copy)') : null,
      ': an administrator of your Microsoft organisation opens it, signs in and accepts. JEKray2D asks only to sign people in.') : null,
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
  try { account = await api('/v1/me'); }
  catch (err) {
    account = null;
    // said only to someone whose bench here saves to the cloud; anyone else just sees Sign in
    if (err.status !== 401 && cloud) toast('Could not reach your JEKray2D account: ' + err.message, true);
  }
  // someone who signs in with ORCID alone is told, once a session, that it is ending
  if (account && account.orcid_ends && !(account.identities || []).some(i => i.provider !== 'orcid') && !orcidWarned) {
    orcidWarned = true;
    setTimeout(() => toast('Signing in with ORCID ends on ' + shortDate(account.orcid_ends) + ': link Google or Microsoft from the account menu, top right, to keep your account.', true), 1200);
  }
  fillAccount();
  if (account && cloud && cloud.dirty) cloudPush({ quiet: true });   // edits made offline, or before a reload
}
// accounts are part of the tool (open beta); not in an embed, nor in test mode
export const accountsOn = () => !TEST_MODE && !EMBED;
export let accountLoaded = null, orcidWarned = false;       // the first look at the account, for what waits on it (#pro)
/* #pro, from the product page's JEKrayPro buttons: the subscription box when signed in,
   the sign-in choices when not, and a word when Pro is already theirs */
export async function proLink() {
  await accountLoaded;
  const mine = account && account.workspaces.find(w => w.kind === 'personal');
  if (mine && mine.active) { toast(account.licence ? 'You have JEKrayPro through ' + account.licence.name : 'You already have JEKrayPro'); return; }
  if (account) { showSubscribe(); return; }
  const btn = document.getElementById('btnAcct');
  if (btn && document.getElementById('acctMenu').hidden) btn.click();
  toast('Sign in to subscribe to JEKrayPro');
}
export function accountShown() {
  const on = accountsOn();
  document.getElementById('acct').hidden = !on;
  cloudMenuShown();
  if (on && account === undefined && !TEST_MODE) { account = null; fillAccount(); accountLoaded = loadAccount(); }
}

/* the page's wiring for this module: done once, from boot.js, after every module is loaded */
export function wireAccount() {
  document.getElementById('uniClose').addEventListener('click', () => document.getElementById('uniDialog').close());

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
        if (cloud) cloudLink(null);                      // the bench here stays, in this browser only
        fillAccount(); toast('Your account has been deleted');
      } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; }
      go.textContent = 'Delete my account';
    });
  }

}
