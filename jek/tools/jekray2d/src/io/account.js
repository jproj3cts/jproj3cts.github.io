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
  if (!res.ok) {
    const e = new Error((body && body.error && body.error.message) || 'The service is unavailable.'); e.status = res.status;
    for (const k of ['code', 'version', 'editing', 'updated_by', 'updated_at']) e[k] = body && body.error ? body.error[k] : undefined;
    throw e;
  }
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
  const card = (tier, title, blurb, extra = {}) => {
    const p = prices[tier + (subInterval === 'year' ? '_yearly' : '_monthly')];
    if (!p) return null;
    const month = prices[tier + '_monthly'];
    const saving = subInterval === 'year' && month ? Math.round(100 * (1 - p.amount / (12 * month.amount))) : 0;
    const go = extra.go || h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startCheckout(mine.id, tier, go) }, 'Continue to payment');
    if (extra.locked) go.disabled = true;
    return h('div', { class: 'rt-subcard' }, h('h3', null, title), h('p', { class: 'rt-subprice' }, h('b', null, money(p.amount, p.currency)), (extra.seat ? ' a seat' : '') + ' a ' + (subInterval === 'year' ? 'year' : 'month'), saving > 0 ? h('small', null, ' · save ' + saving + '%') : null),
      h('p', null, blurb), extra.node || null, go);
  };
  // the team card: a team of theirs without a plan is subscribed for; else one is made first
  const unpaid = (account ? account.workspaces : []).find(w => w.kind === 'team' && w.role === 'owner' && !w.active);
  const teamGo = unpaid
    ? h('button', { type: 'button', class: 'rt-btn primary', onclick: () => startCheckout(unpaid.id, 'team', teamGo) }, 'Subscribe for ' + unpaid.name)
    : h('button', { type: 'button', class: 'rt-btn primary', onclick: () => { dlg.close(); createTeam(); } }, 'Create a team…');
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
    card('academic', 'Academic', 'The same, at half the price.', { node: acNote, locked: !ac }),
    card('team', 'Team', 'For a lab, group or company: one workspace everyone works in, with roles, invitations by email and an activity record. A seat each for the owner, admins and editors, at least three; viewers are free. Each seat has JEKrayPro on their own benches too.', { seat: true, go: teamGo })));
}
async function startCheckout(ws, tier, btn) {
  const was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Opening secure payment…';
  try {
    try { sessionStorage.setItem('jekcheckout', ws); } catch (err) { /* the personal workspace is assumed on return */ }
    const ret = new URL(location.href); ret.hash = ''; ret.searchParams.delete('jekbilling'); ret.searchParams.delete('jekauth');
    if (!EMBED) try { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ }
    const { url } = await api('/v1/workspaces/' + ws + '/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: tier, interval: subInterval, return: ret.toString() }) });
    location.href = url;
  } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = was; }
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
  let wsId = null;
  try { wsId = sessionStorage.getItem('jekcheckout'); sessionStorage.removeItem('jekcheckout'); } catch (err) { /* the personal workspace, then */ }
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, i ? 2000 : 500));
    try { account = await api('/v1/me'); } catch (err) { continue; }
    const mine = account.workspaces.find(w => w.id === wsId) || account.workspaces.find(w => w.kind === 'personal');
    if (mine && mine.active) {
      fillAccount();
      if (mine.kind === 'team') { toast('Your team plan is active. Thank you!'); showTeam(mine.id); } else toast('Welcome to JEKrayPro. Thank you!');
      if (cloud && cloud.dirty) cloudPush({ quiet: true }); return;
    }
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
    btn.classList.add('in'); btn.title = u.name; btn.setAttribute('aria-label', 'Account: ' + u.name);
    if (u.avatar) btn.replaceChildren(h('img', { src: API_BASE + u.avatar, alt: '' })); else btn.textContent = initials(u.name);
    const orcid = ids.find(i => i.provider === 'orcid');
    const rows = [h('div', { class: 'rt-accthead' }, avatarNode(u), h('b', null, u.name), u.email ? h('span', null, u.email) : null, orcid ? h('span', null, 'ORCID ' + orcid.subject) : null),
      ...ws.map(w => h('span', { class: 'rt-menunote' }, (w.kind === 'personal' ? 'Personal' : w.name) + ': ' + planText(w))),
      // ORCID sign-in is ending: someone with no other way in is asked to link one
      account.orcid_ends && !ids.some(i => i.provider !== 'orcid') ? h('span', { class: 'rt-menunote rt-warn' }, 'Signing in with ORCID ends on ' + shortDate(account.orcid_ends) + '. Link Google or Microsoft below to keep your account.') : null,
      h('div', { class: 'sep' })].filter(Boolean);
    // a university's licence, for those who look after it there
    for (const w of ws) if (w.kind === 'institution' && (w.role === 'admin' || w.role === 'owner')) rows.push(item('user', w.name + ' licence\u2026', () => showUniAdmin(w.id)));
    rows.push(item('user', 'Your account\u2026', showAccount));
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
    try { await api('/v1/me/avatar', { method: 'DELETE' }); account.user.avatar = null; fillAccount(); showAccount(); toast('Picture removed'); } catch (err) { toast(err.message, true); }
  } }, 'Remove') : null;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    choose.disabled = true; choose.textContent = 'Sending\u2026';
    try {
      const blob = await shrinkImage(f);
      const r = await api('/v1/me/avatar', { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
      account.user.avatar = r.avatar; fillAccount(); showAccount(); toast('Picture saved');
    } catch (err) { toast(err.message, true); choose.disabled = false; choose.textContent = 'Add a picture\u2026'; }
  });
  const name = h('input', { type: 'text', id: 'acctName', value: u.name, maxlength: '80', autocomplete: 'name' });
  const save = h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
    const v = name.value.trim();
    if (!v || v === u.name) return;
    try { account = await api('/v1/me', jsonReq('PATCH', { name: v })); fillAccount(); showAccount(); toast('Name changed'); } catch (err) { toast(err.message, true); }
  } }, 'Save');
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
  const ids = (account.identities || []).map(i => PROVIDER_NAMES[i.provider] + (i.provider === 'orcid' ? ' ' + i.subject : ''));
  body.replaceChildren(
    h('div', { class: 'rt-acctpic' }, pic, h('div', null, h('p', null, 'Your picture is shown beside your name to the people you share a team with: on their benches, and while you are editing one.'), h('div', { class: 'rt-row' }, choose, remove, file))),
    h('label', { for: 'acctName' }, 'Your name, as others see it'), h('div', { class: 'rt-row' }, name, save),
    h('p', null, u.email ? 'Email: ' + u.email + ' (from your sign-in; it is where invitations and receipts go).' : 'Your sign-in gave no email address.'),
    h('p', null, 'Signed in with ' + (ids.join(' and ') || 'nothing yet') + '. Link another, or delete the account, from the account menu.'));
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
  if (!account) { toast('Sign in first (account menu, top right)', true); return; }
  const name = (prompt('Name the team: your lab, group or company', '') || '').trim();
  if (!name) return;
  try {
    const t = await api('/v1/teams', jsonReq('POST', { name }));
    await loadAccount();
    toast('Team created. Invite people, then subscribe for its seats.');
    showTeam(t.id);
  } catch (err) { toast(err.message, true); }
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
  const act = (fn, done) => async () => { try { await fn(); if (done) toast(done); await loadAccount(); again(); } catch (err) { if (!err.quiet) toast(err.message, true); } };
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
        if (r.invited.sent) { toast('Invitation emailed to ' + r.invited.email); again(); }
        else {
          // no email went: the link is theirs to pass on
          const url = h('input', { type: 'text', readonly: true, value: r.invited.link, 'aria-label': 'Invitation link' });
          said.replaceChildren(h('p', null, 'We could not email ' + r.invited.email + '. Send them this link yourself; it works for 14 days, once:'),
            h('div', { class: 'team-link' }, url, h('button', { type: 'button', class: 'rt-btn', onclick: () => { url.select(); try { navigator.clipboard.writeText(r.invited.link); toast('Link copied'); } catch (err) { toast('Copy the link from the box', true); } } }, 'Copy')));
          email.value = '';
        }
      } catch (err) { toast(err.message, true); }
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
        try { await api('/v1/teams/' + id, { method: 'DELETE' }); dlg.close(); await loadAccount(); toast('Team deleted'); } catch (err) { toast(err.message, true); }
      } }, 'Delete the team…'));
  } else {
    ends.push(h('p', null, 'Benches you saved here stay with the team.'), h('button', { type: 'button', class: 'rt-btn', onclick: async () => {
      if (!confirm('Leave ' + t.name + '?')) return;
      try { await api('/v1/teams/' + id + '/leave', { method: 'POST' }); dlg.close(); await loadAccount(); toast('You have left ' + t.name); } catch (err) { toast(err.message, true); }
    } }, 'Leave the team'));
  }
  // the activity record
  const log = manages && t.activity ? [h('h3', null, 'Activity'), t.activity.length ? h('div', { class: 'team-log' }, h('table', null, h('tbody', null, ...t.activity.map(a => h('tr', null, h('td', { class: 'team-muted' }, when(a.at)), h('td', null, a.who || 'Someone'), h('td', null, a.action.replace('.', ' ').replace(/_/g, ' ') + (a.target ? ': ' + a.target : ''))))))) : h('p', null, 'Nothing yet.')] : [];
  body.replaceChildren(...[
    h('p', null, 'You are ' + (t.role === 'owner' ? 'the owner' : 'an ' + ROLE_NAMES[t.role].toLowerCase()) + ' of this team. ', rename),
    h('h3', null, 'Plan'), ...plan,
    h('h3', null, 'Members'), members,
    ...invites, ...ends, ...log].filter(Boolean));
}
/* an invitation link (?jekinvite=<token>) taken from the address and kept across the sign-in it
   may need; once signed in, what it is for is shown and, on a yes, accepted */
export function takeInvite() {
  const q = new URLSearchParams(location.search), token = q.get('jekinvite');
  if (!token) return;
  q.delete('jekinvite');
  window.history.replaceState(window.history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  try { sessionStorage.setItem('jekinvite', token); } catch (err) { toast('This browser cannot keep the invitation: open the link again once signed in', true); }
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
      toast('You have been invited to a team: sign in to join it');
      return;
    }
    let inv;
    try { inv = await api('/v1/invitations/' + encodeURIComponent(token)); }
    catch (err) { drop(); toast(err.message, true); return; }
    if (!confirm(inv.inviter + ' has invited you to join the team “' + inv.team + '” as ' + (inv.role === 'admin' ? 'an admin' : 'a ' + inv.role) + '. Join it?')) { drop(); return; }
    const r = await api('/v1/invitations/accept', jsonReq('POST', { token }));
    drop();
    await loadAccount();
    toast('You are in ' + r.team.name);
    showTeam(r.team.id);
  } catch (err) { toast(err.message, true); }
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
  handleInvite();
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
  document.getElementById('teamClose').addEventListener('click', () => document.getElementById('teamDialog').close());
  document.getElementById('acctClose').addEventListener('click', () => document.getElementById('acctDialog').close());
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
        if (cloud) cloudLink(null);                      // the bench here stays, in this browser only
        fillAccount(); toast('Your account has been deleted');
      } catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; }
      go.textContent = 'Delete my account';
    });
  }

}
