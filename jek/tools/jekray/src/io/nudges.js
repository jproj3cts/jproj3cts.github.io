import { EMBED, STORE_KEY, cloud } from '../core/constants.js';
import { serialize } from '../state/elements.js';
import { phoneSheet } from '../ui/panel.js';
import { h } from '../ui/dom.js';
import { saveFile, toast } from '../ui/actions.js';
import { cloudLink, cloudMenuShown, cloudPush, newCloudBench, personalWs, proWhy } from './cloud.js';
import { menuIcons } from './packs.js';
import { saveTimer } from './autosave.js';
import { goal, track } from './usage.js';
import { WORK_EDITS, WORK_MS, nudgeCapOk, returnDue, workDue } from '../core/nudge.js';
import { project } from '../state/project.js';
import { hooks } from '../core/hooks.js';
import { drag } from '../ui/pointer.js';
import { FREE_GIVES, UNI_LINE, account, accountKnown, accountsOn, showEmailSignIn, showSubscribe, signIn, signInRow } from './account.js';

/* ==========================================================================
   JEKray's own sign-in prompts, on the bench; the account itself is io/account.js, shared with JEKion and JEKsuite,
   whose hooks JEKray installs here (wireNudges): its work kept before the page leaves to sign in or pay, its cloud
   bench sent up once the account or a plan is there, the account menu put in the bar's menu.
   ========================================================================== */
/* ---------- Sign-in, offered where it helps ----------
   Signed out, at the moments an account would have helped. Each says first what a free account gives, then
   JEKrayPro, then the university line. Share asks in a dialog, as a short link is JEKrayPro's and it cannot go on
   without one; so does an export (ui/pro.js accountGate), as exporting needs an account. Save has already saved the
   file, so it only offers, in a note. A bench restored on a later visit, and a shared bench kept, offer the file and
   an account. One cap for the notes and the share dialog: once a week (core/nudge.js), which the export dialog
   counts against but is not held back by. Each is counted as 'prompt' <where>.<answer>: shown, the way in chosen, file, no. */
const NUDGE_KEY = 'jek-nudge-save';
const nudgeAllowed = () => { try { return nudgeCapOk(localStorage.getItem(NUDGE_KEY), Date.now()); } catch (err) { return false; } };
const nudgeTaken = () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch (err) { /* may show again: fine */ } };
const freeLead = (lead, more) => h('p', null, h('b', null, lead), ' ' + FREE_GIVES + (more ? ' ' + more : ''));
const uniNote = () => h('p', { class: 'note rt-uni' }, UNI_LINE);
function promptDialog(id) {
  let dlg = document.getElementById(id);
  if (!dlg) { dlg = h('dialog', { class: 'rt-dialog', id, 'aria-labelledby': id + 'Title' }); document.body.append(dlg); }
  return dlg;
}
export function shareSignIn(saveInstead) {
  track('prompt', 'share.shown');
  nudgeTaken();
  const dlg = promptDialog('shareSignIn'), close = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'shareSignInTitle' }, 'Share this bench as a link'),
    h('p', null, 'A short link opens this bench as it is now, for anyone, with your panels open and its sweeps ready to play.'),
    freeLead('Create a free account or sign in.', 'Short links come with JEKrayPro, along with saving to the cloud as you work. Your bench stays here while you sign in.'),
    uniNote(),
    h('div', { class: 'rt-actions rt-signrow' }, ...signInRow('share', close)),
    h('p', { class: 'note' }, 'Or send it as a file: ', h('button', { class: 'rt-link', type: 'button', onclick: () => { track('prompt', 'share.file'); close(); saveInstead(); } }, 'save it as a .jekray file'), ' and attach that.'),
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', 'share.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
/* an export, or the .jekray file, asked for signed out: what is needed and the ways in */
export function exportSignIn(what) {
  track('prompt', 'export.shown');
  nudgeTaken();
  const dlg = promptDialog('exportSignIn'), close = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'exportSignInTitle' }, /^save the bench/.test(what) ? 'Saving the file needs a free account' : 'Exporting needs a free account'),
    h('p', null, 'Sign in to ' + what + '. The bench is kept in this browser meanwhile.'),
    freeLead('Create a free account or sign in.', 'Your bench stays here while you sign in.'),
    uniNote(),
    h('div', { class: 'rt-actions rt-signrow' }, ...signInRow('export', close)),
    h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', 'export.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
/* something that needs more than being signed out, asked for signed out: a JEKrayPro feature (the optimiser, scripts,
   the cloud, My parts…) or the experimental features (a free account is enough). In place of a toast and the account
   menu, what it needs and the ways in, as for an export; counted as 'prompt' pro.<answer>, acct.<answer> (an account is enough: My benches) or exp.<answer>. */
export function gateSignIn(kind, what) {
  if (!accountsOn()) { toast('Accounts are not available here', true); return; }
  const exp = kind === 'exp', acct = kind === 'acct', where = exp ? 'exp' : acct ? 'acct' : 'pro';
  track('prompt', where + '.shown');
  nudgeTaken();
  const dlg = promptDialog('gateSignIn'), close = () => dlg.close();
  dlg.replaceChildren(h('h2', { id: 'gateSignInTitle' }, exp ? 'Experimental features need a free account' : 'Sign in first'),
    h('p', null, exp ? 'Sign in to try the experimental features: a free account is enough.'
      : acct ? 'Sign in to ' + (what || 'use that') + ': a free account is enough.'
      : (what ? 'To ' + what + ', JEKrayPro is needed' : 'That is part of JEKrayPro') + '. Choose a plan and pay: your account is made from the address you pay with. Or sign in, if you already have one through a team or your university.'),
    freeLead('Create a free account or sign in.', 'Your bench stays here while you sign in.'),
    uniNote(),
    h('div', { class: 'rt-actions rt-signrow' }, ...signInRow(where, close)),
    h('div', { class: 'rt-actions' },
      exp || acct ? null : h('button', { class: 'rt-btn primary', type: 'button', onclick: () => { track('prompt', 'pro.plans'); close(); showSubscribe(); } }, 'See plans and prices'),
      h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', where + '.no'); close(); } }, 'Not now')));
  dlg.showModal();
}
/* a note on the bench, in the welcome note's style, with its × in the corner (counted as Not now) */
function nudgeCard(id, where, title, body, acts) {
  const card = h('div', { class: 'rt-welcome rt-nudge', id, role: 'status' });
  const close = () => card.remove(), no = () => { track('prompt', where + '.no'); close(); };
  card.append(h('button', { class: 'rt-wx', type: 'button', title: 'Close', 'aria-label': 'Close this note', onclick: no }, '\u00d7'),
    h('h3', null, title), ...body,
    h('div', { class: 'rt-actions' }, ...signInRow(where, close), ...acts(close),
      h('button', { class: 'rt-btn', type: 'button', onclick: no }, 'Not now')));
  track('prompt', where + '.shown');
  document.getElementById('stage').append(card);
}
const nudgeUp = () => ['saveNudge', 'returnNudge', 'workNudge', 'welcome', 'coach'].some(id => document.getElementById(id));
export function saveNudge() {
  if (!accountsOn() || account !== null || !accountKnown || nudgeUp() || !nudgeAllowed()) return;     // signed out, once that is known
  nudgeTaken();
  nudgeCard('saveNudge', 'save', 'Saved to your downloads', [h('p', null, 'That file keeps the bench on this computer.'),
    freeLead('Create a free account or sign in.', 'With JEKrayPro your benches also save to the cloud as you work, with their history, and open on any computer.'), uniNote()], () => []);
}
/* a bench restored from this browser on a later visit, signed out: kept here alone, so a file or an account.
   again: this session had the page open before (a reload); arrived: the address the visit came by */
export function returnNudge(again, arrived) {
  let last = 0, invite = false;
  try { last = localStorage.getItem(NUDGE_KEY); invite = !!sessionStorage.getItem('jekinvite'); } catch (err) { return; }
  if (!returnDue({ on: accountsOn(), restored: true, again, signedOut: account === null && accountKnown, parts: project ? project.elements.length : 0,
    busy: invite || nudgeUp() || !!document.querySelector('dialog[open]'), arrived, last, now: Date.now() })) return;
  nudgeTaken();
  nudgeCard('returnNudge', 'return', 'Restored from this browser only', [
    h('p', null, 'This bench is kept in this browser alone: clearing its data loses it, and your other devices do not have it.'),
    freeLead('Create a free account to save it as a file.', 'With JEKrayPro, or a university licence, your benches save to the cloud and open anywhere.'), uniNote()],
  () => []);
}
/* ---------- A free account offered in a note ----------
   The first-visit welcome note (where 'welcome') offers a free account, one click each way, to anyone signed out: a
   first visit may only look, and never edit enough to be asked after its work. Counted as 'prompt' <where>.<answer>. */
export function accountOffer(where) {
  if (!accountsOn() || account) return null;
  track('prompt', where + '.shown');
  return h('div', { class: 'rt-landacct' },
    h('p', null, h('b', null, 'Free account, one click:'), ' export images and data, part packs and the experimental features. Your bench stays as it is.'),
    h('div', { class: 'rt-actions' }, ...signInRow(where, () => {})));
}
/* ---------- A bench worked on, signed out ----------
   Once a signed-out visitor has made a bench their own (a few edits, or a minute since the first), one note offers
   a free account for what it gives (exports, part packs, the experimental features), once a session and never
   mid-drag, and the bench is kept across the sign-in. Back signed in, it goes to the cloud when their plan saves
   there (Save to cloud's dialog, named already); on the free plan it stays here, and they are told what is theirs. Counted as 'prompt' work.<answer>, and against where the visit came from: the first edit
   ('goal' edit), the note shown (ask) and a way in chosen (ask-yes). */
const WORK_KEY = 'jek-work-ask';             // in this tab's store: 'shown' once asked, 'signin' while signing in from it
const WORK_QUIET = 2000;                     // still this long after an edit before it is looked at
const work = { n: 0, t0: 0, timer: 0 };
const workState = () => { try { return sessionStorage.getItem(WORK_KEY) || ''; } catch (err) { return 'shown'; } };
const setWork = v => { try { if (v) sessionStorage.setItem(WORK_KEY, v); else sessionStorage.removeItem(WORK_KEY); } catch (err) { /* asked again next visit: fine */ } };
// on a phone, the settings sheet over the bench's lower half, where the note would go: it waits for the sheet to close
const sheetUp = () => phoneSheet() && document.getElementById('panel').style.display !== 'none';
/* an edit of the bench (tabs.js checkpoint): counted, and the note looked at once the bench has been still a moment */
export function benchEdited() {
  if (!work.n++) { work.t0 = Date.now(); goal('edit'); }
  if (!accountsOn() || account || workState()) return;
  clearTimeout(work.timer);
  work.timer = setTimeout(workNudge, WORK_QUIET);
}
export function workNudge() {
  work.timer = 0;
  const since = Date.now() - work.t0, notes = ['welcome'].map(id => document.getElementById(id)).filter(Boolean);
  // not mid-drag, nor over a dialog, a tour or another prompt: looked at again shortly (the welcome note gives way)
  const due = workDue({ on: accountsOn(), signedOut: account === null && accountKnown, asked: !!workState(), parts: project ? project.elements.length : 0, edits: work.n, since,
    busy: !!drag || ['saveNudge', 'returnNudge', 'coach'].some(id => document.getElementById(id)) || !!document.querySelector('dialog[open]') || sheetUp() });
  if (due === 'later') { work.timer = setTimeout(workNudge, work.n < WORK_EDITS && since < WORK_MS ? WORK_MS - since : 5000); return; }
  if (due !== 'now') return;
  for (const n of notes) n.remove();
  setWork('shown'); nudgeTaken(); goal('ask');
  const card = h('div', { class: 'rt-welcome rt-nudge', id: 'workNudge', role: 'status' });
  const close = () => card.remove(), no = () => { track('prompt', 'work.no'); close(); };
  // a way in: the bench comes back as it is, and is saved for them when it can be
  const yes = (p, fn) => () => { track('prompt', 'work.' + p); goal('ask-yes'); setWork('signin'); close(); fn(); };
  card.append(h('button', { class: 'rt-wx', type: 'button', title: 'Close', 'aria-label': 'Close this note', onclick: no }, '\u00d7'),
    h('h3', null, 'Export this bench\u2019s images and data? Free account, one click'),
    freeLead('One click with Google, Microsoft or your email.', 'Your bench stays as it is while you sign in.'),
    uniNote(),
    h('div', { class: 'rt-actions' },
      h('button', { class: 'rt-btn primary', type: 'button', onclick: yes('google', () => signIn('google')) }, 'Continue with Google'),
      h('button', { class: 'rt-btn', type: 'button', onclick: yes('microsoft', () => signIn('microsoft')) }, 'Microsoft'),
      h('button', { class: 'rt-btn', type: 'button', onclick: yes('email', () => showEmailSignIn(false)) }, 'Email'),
      h('button', { class: 'rt-btn', type: 'button', onclick: no }, 'Not now')));
  track('prompt', 'work.shown');
  document.getElementById('stage').append(card);
}
/* back from a sign-in begun at that note: the bench into the cloud where the plan allows, else said where it is */
function workSignedIn() {
  if (workState() !== 'signin' || !accountKnown) return;
  setWork('shown');
  if (!account) return;                               // cancelled, or it failed: nothing more
  if (cloud) return;                                  // already a cloud bench, saving as it goes
  if (!proWhy()) { const ws = personalWs(); if (ws) newCloudBench(ws.id, null, true); return; }
  setTimeout(() => toast('Signed in: saving the file, exports, part packs and the experimental features are yours. Your bench is here as you left it.'), 900);
}
/* Save a copy, from a shared bench's bar, without a plan to save it to the cloud: signed out, an account and the
   file; signed in on the free plan, the file, and where cloud saving comes from */
export function sharedCopyPrompt() {
  track('prompt', 'shared.shown');
  const dlg = promptDialog('sharedCopy'), close = () => dlg.close();
  const file = (primary) => h('button', { class: 'rt-btn' + (primary ? ' primary' : ''), type: 'button', onclick: () => { track('prompt', 'shared.file'); close(); saveFile(); } }, 'Save as a file');
  const no = h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', 'shared.no'); close(); } }, 'Not now');
  const cloudLine = 'Saving to the cloud comes with JEKrayPro or a university licence: the copy is then yours in My benches, on any computer.';
  dlg.replaceChildren(h('h2', { id: 'sharedCopyTitle' }, 'Save a copy of this bench'), ...(account
    ? [h('p', null, cloudLine + ' For now, save it as a .jekray file.'),
      h('div', { class: 'rt-actions' }, h('button', { class: 'rt-btn', type: 'button', onclick: () => { track('prompt', 'shared.pro'); close(); showSubscribe(); } }, 'JEKrayPro and licences\u2026'), no, file(true))]
    : [freeLead('Create a free account or sign in.', cloudLine), uniNote(),
      h('div', { class: 'rt-actions rt-signrow' }, ...signInRow('shared', close)),
      h('p', { class: 'note' }, 'A free account also saves it on this computer as a .jekray file.'),
      h('div', { class: 'rt-actions' }, no)]));
  dlg.showModal();
}

/* JEKray's part in the shared account (io/account.js): its hooks, installed before the account is first looked at */
export function wireNudges() {
  Object.assign(hooks, {
    appName: 'JEKray',
    // the bench kept in the autosave before the page leaves to sign in or pay
    keepWork: () => { if (!EMBED) try { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); } catch (err) { /* the last autosave stands */ } },
    // a cloud bench with unsaved edits goes up once a plan, or the account, is there (edits made offline, or before a reload)
    planActive: () => { if (cloud && cloud.dirty) cloudPush({ quiet: true }); },
    accountLoadedHere: () => { if (account && cloud && cloud.dirty) cloudPush({ quiet: true }); workSignedIn(); },
    accountChanged: () => cloudMenuShown(),
    // the menu in the bar (#acctMenu), its icons drawn; signed out, a line on what JEKrayPro gives
    accountMenu: rows => { const menu = document.getElementById('acctMenu'); if (!menu) return; menu.replaceChildren(...rows); menuIcons(menu); },
    accountMenuExtra: signedIn => (signedIn ? [] : [h('span', { class: 'rt-menunote' }, 'JEKrayPro, cloud saving for JEKray (open beta): your benches saved to the cloud as you work, with their history, on any computer. Sign in, then Subscribe.')]),
    openAccountMenu: () => { const btn = document.getElementById('btnAcct'), m = document.getElementById('acctMenu'); if (btn && m && m.hidden) btn.click(); },
    // said only to someone whose bench here saves to the cloud; anyone else just sees Sign in
    sayUnreachable: () => !!cloud,
    accountDeleted: () => { if (cloud) cloudLink(null); },           // the bench here stays, in this browser only
    exportSignIn,
  });
}
