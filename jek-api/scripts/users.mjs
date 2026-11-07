#!/usr/bin/env node
// The people with accounts (src/opsusers.js), from your own computer.
//
//   export JEK_OPS_TOKEN=...            (the same value as the OPS_TOKEN secret)
//   node scripts/users.mjs                         a summary and everyone, newest first, in the terminal
//   node scripts/users.mjs --sort active           by last active (or: joined, benches, plan, name)
//   node scripts/users.mjs --html users.html       the same as a page: figures, sign-ups and active people week
//                                                  by week, and a table you can sort and search
//   node scripts/users.mjs --csv users.csv         a spreadsheet of everyone
//   node scripts/users.mjs --json                  what the API answers, as it is
//   scripts\users-report.cmd                        on Windows: double-click, and the page opens
//
// Account records only: the anonymous usage counts (scripts/usage.mjs) are not linked to anyone.
// JEK_API overrides https://api.jeksys.net.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const API = process.env.JEK_API || 'https://api.jeksys.net';
const TOKEN = process.env.JEK_OPS_TOKEN;

async function get() {
  if (!TOKEN) throw new Error('Set JEK_OPS_TOKEN first (the value you gave `npx wrangler secret put OPS_TOKEN`).');
  const res = await fetch(`${API}/ops/users`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const out = await res.json().catch(() => ({}));
  // the API answers 404 to a wrong token, as it does to anyone guessing at /ops
  if (res.status === 404) throw new Error(`${API} did not accept JEK_OPS_TOKEN: it is not the value of the OPS_TOKEN secret, or the API with /ops/users is not deployed yet.`);
  if (!res.ok) throw new Error((out.error && out.error.message) || `HTTP ${res.status}`);
  return out;
}

const DAY = 86400000;
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
export const ago = (ms, t) => {
  if (!ms) return 'never';
  const d = Math.floor((t - ms) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
};
const size = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} kB` : b ? `${b} B` : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const SORTS = {
  joined: (a, b) => b.joined - a.joined,
  active: (a, b) => (b.last_active || 0) - (a.last_active || 0),
  benches: (a, b) => b.benches - a.benches || (b.last_active || 0) - (a.last_active || 0),
  plan: (a, b) => a.plan.localeCompare(b.plan) || b.joined - a.joined,
  name: (a, b) => a.name.localeCompare(b.name),
};

export function text(r, sort = 'joined') {
  const s = r.summary, t = r.at, out = [];
  out.push(`${s.people} people with accounts · ${s.joined_7d} joined this week, ${s.joined_30d} in 30 days · active ${s.active_7d} this week, ${s.active_30d} in 30 days · ${s.paying} on a paid plan · ${s.with_benches} with saved benches`);
  out.push(`Plans: ${Object.entries(s.plans).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  out.push(`Sign in with: ${Object.entries(s.sign_in).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (r.truncated) out.push('(the newest 5000 only)');
  const rows = [...r.users].sort(SORTS[sort] || SORTS.joined).map((u) => [u.name, u.email || '', day(u.joined), u.signs_in_with.join(','), u.plan,
    ago(u.last_active, t), String(u.benches || ''), String(u.share_links || ''), String(u.exercises || '')]);
  const head = ['Name', 'Email', 'Joined', 'Signs in with', 'Plan', 'Last active', 'Benches', 'Links', 'Exercises'];
  const w = head.map((h, i) => Math.min(32, Math.max(h.length, ...rows.map((x) => x[i].length))));
  const line = (x) => x.map((c, i) => (c.length > w[i] ? c.slice(0, w[i] - 1) + '…' : c).padEnd(w[i])).join('  ').trimEnd();
  out.push('', line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line));
  return out.join('\n');
}

export function csv(r) {
  const cols = ['name', 'email', 'joined', 'signs_in_with', 'plan', 'billing', 'academic', 'last_active', 'last_signed_in', 'live_sessions',
    'benches', 'bench_bytes', 'last_saved', 'parts', 'share_links', 'link_opens', 'exercises', 'tasters_this_month'];
  const dates = new Set(['joined', 'last_active', 'last_signed_in', 'last_saved']);
  const cell = (v) => { const s = Array.isArray(v) ? v.join(' ') : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [cols.join(','), ...r.users.map((u) => cols.map((c) => cell(dates.has(c) ? day(u[c]) : u[c])).join(','))].join('\r\n') + '\r\n';
}

// sign-ups and active people week by week: two bars a week
function weekBars(weeks) {
  const W = 920, H = 180, pad = 26, max = Math.max(1, ...weeks.map((w) => Math.max(w.joined, w.active)));
  const bw = (W - pad) / weeks.length, y = (n) => H - 18 - ((H - 30) * n) / max;
  const bars = weeks.map((w, i) => {
    const x = pad + i * bw;
    return `<rect class="t-active" x="${x + 2}" y="${y(w.active)}" width="${bw / 2 - 2}" height="${H - 18 - y(w.active)}"><title>${w.week}: ${w.active} active</title></rect>`
      + `<rect class="t-joined" x="${x + bw / 2}" y="${y(w.joined)}" width="${bw / 2 - 2}" height="${H - 18 - y(w.joined)}"><title>${w.week}: ${w.joined} joined</title></rect>`
      + (i % 4 === 0 ? `<text x="${x + 2}" y="${H - 4}">${w.week.slice(5)}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sign-ups and active people a week"><line class="grid" x1="${pad}" x2="${W}" y1="${H - 18}" y2="${H - 18}"/><text x="0" y="${y(max) + 4}">${max}</text>${bars}</svg>`;
}

export function html(r) {
  const s = r.summary, t = r.at;
  const tile = (n, what) => `<div><b>${n}</b>${esc(what)}</div>`;
  const tally = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td>${n}</td><td><span class="bar" style="width:${Math.max(2, Math.round((120 * n) / Math.max(1, s.people)))}px"></span></td></tr>`).join('');
  const rows = r.users.map((u) => `<tr>
<td data-v="${esc(u.name.toLowerCase())}">${esc(u.name)}</td><td>${esc(u.email || '')}</td>
<td data-v="${u.joined}">${day(u.joined)}</td><td>${esc(u.signs_in_with.join(', '))}</td>
<td data-v="${esc(u.plan)}"><span class="plan p-${esc(u.plan.split(' ')[0])}">${esc(u.plan)}</span>${u.billing ? ` <small>${esc(u.billing)}</small>` : ''}${u.academic ? ` <small>academic (${esc(u.academic)})</small>` : ''}</td>
<td data-v="${u.last_active || 0}" title="${day(u.last_active)}">${ago(u.last_active, t)}</td>
<td data-v="${u.benches}">${u.benches || ''}${u.bench_bytes ? ` <small>${size(u.bench_bytes)}</small>` : ''}</td>
<td data-v="${u.last_saved || 0}">${u.last_saved ? ago(u.last_saved, t) : ''}</td>
<td data-v="${u.parts}">${u.parts || ''}</td><td data-v="${u.share_links}">${u.share_links || ''}${u.link_opens ? ` <small>${u.link_opens} opens</small>` : ''}</td>
<td data-v="${u.exercises}">${u.exercises || ''}</td><td data-v="${u.tasters_this_month}">${u.tasters_this_month || ''}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JEKray accounts</title><style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e4e4e8;--active:#2f7fd1;--joined:#e07b1a;--chip:#f1f1f4}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececf0;--muted:#9a9aa2;--line:#2c2c31;--active:#4d9be6;--joined:#f0913a;--chip:#232328}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h3{font-size:15px;margin:24px 0 6px}.sub,small{color:var(--muted)}
.hero{display:flex;gap:32px;flex-wrap:wrap;margin:20px 0}.hero b{display:block;font-size:30px;font-variant-numeric:tabular-nums}
svg{width:100%;height:auto}svg text{fill:var(--muted);font-size:11px}.grid{stroke:var(--line)}.t-active{fill:var(--active)}.t-joined{fill:var(--joined)}
.key{display:flex;gap:16px;color:var(--muted);font-size:13px}.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500}#people th{cursor:pointer;white-space:nowrap;user-select:none}#people th[aria-sort]::after{content:" ▾"}#people th[aria-sort=ascending]::after{content:" ▴"}
#people td{font-variant-numeric:tabular-nums}.bar{display:inline-block;height:8px;background:var(--active);border-radius:2px}
.plan{display:inline-block;padding:0 6px;border-radius:3px;background:var(--chip)}.p-individual,.p-team,.p-institution{background:var(--joined);color:#fff}
input{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg);width:min(320px,100%)}
.wrap{overflow-x:auto}</style></head><body><main>
<h1>JEKray accounts</h1><p class="sub">As of ${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC. Account records only; the anonymous usage counts are in the usage report. “Last active” is the latest of a signed-in session's last use (to the day), a bench saved and an exercise solved.${r.truncated ? ' The newest 5000 only.' : ''}</p>
<div class="hero">${tile(s.people, 'people with accounts')}${tile(s.joined_7d, `joined this week (${s.joined_30d} in 30 days)`)}${tile(s.active_7d, `active this week (${s.active_30d} in 30 days)`)}${tile(s.paying, 'on a paid plan')}${tile(s.with_benches, 'with saved benches')}</div>
<h3>Week by week, the last 26</h3><div class="key"><span><i class="t-active" style="background:var(--active)"></i>active</span><span><i style="background:var(--joined)"></i>joined</span></div>${weekBars(r.weeks)}
<div class="cols"><section><h3>Plans</h3><table>${tally(s.plans)}</table></section><section><h3>Sign in with</h3><table>${tally(s.sign_in)}</table></section></div>
<h3>Everyone</h3><p><input id="q" type="search" placeholder="Search names, emails, plans…" aria-label="Search the table"></p>
<div class="wrap"><table id="people"><thead><tr><th>Name</th><th>Email</th><th aria-sort="descending">Joined</th><th>Signs in with</th><th>Plan</th><th>Last active</th><th>Benches</th><th>Last saved</th><th>Parts</th><th>Share links</th><th>Exercises</th><th>Pro tries this month</th></tr></thead><tbody>${rows}</tbody></table></div>
<script>
const tb=document.querySelector('#people tbody'),hs=[...document.querySelectorAll('#people th')];
hs.forEach((h,i)=>h.addEventListener('click',()=>{const asc=h.getAttribute('aria-sort')==='descending';hs.forEach(x=>x.removeAttribute('aria-sort'));h.setAttribute('aria-sort',asc?'ascending':'descending');
const v=(r)=>{const c=r.children[i];return c.dataset.v!==undefined?c.dataset.v:c.textContent.toLowerCase()};
[...tb.rows].sort((a,b)=>{const x=v(a),y=v(b),n=!isNaN(x)&&!isNaN(y)&&x!==''&&y!=='';const d=n?x-y:x.localeCompare(y);return asc?d:-d}).forEach(r=>tb.appendChild(r))}));
document.getElementById('q').addEventListener('input',(e)=>{const q=e.target.value.toLowerCase();[...tb.rows].forEach(r=>{r.hidden=q&&!r.textContent.toLowerCase().includes(q)})});
</script></main></body></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: o } = parseArgs({ strict: false, options: { html: { type: 'string' }, csv: { type: 'string' }, json: { type: 'boolean' }, sort: { type: 'string' } } });
  try {
    const r = await get();
    if (o.json) console.log(JSON.stringify(r, null, 2));
    else console.log(text(r, o.sort));
    if (o.html) { writeFileSync(o.html, html(r)); console.log(`\nWrote ${o.html}: open it in your browser.`); }
    if (o.csv) { writeFileSync(o.csv, csv(r)); console.log(`\nWrote ${o.csv}: open it in Excel or any spreadsheet.`); }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
