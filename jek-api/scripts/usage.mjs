#!/usr/bin/env node
// How JEKray is used: the usage counts (src/usage.js), from your own computer.
//
//   export JEK_OPS_TOKEN=...            (the same value as the OPS_TOKEN secret)
//   node scripts/usage.mjs                          the last 30 days, in the terminal
//   node scripts/usage.mjs --days 90                any number of days up to 760
//   node scripts/usage.mjs --html report.html       the same as a page, with a chart of visits a day
//   node scripts/usage.mjs --json                   the counts as they come, and the sign-in prompts' table
//   scripts\usage-report.cmd                         on Windows: double-click, or a desktop shortcut to it, and the page opens
//
// Counts, not people: a visit is one opening of the app, so one person opening it
// on three days is three visits. JEK_API overrides https://api.jeksys.net.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const API = process.env.JEK_API || 'https://api.jeksys.net';
const TOKEN = process.env.JEK_OPS_TOKEN;

// what each event counts, and what its token is
export const LABELS = {
  open: ['Visits', 'how it began'], leave: ['Visits ended', 'time spent'], screen: ['Screens', 'size'], browser: ['Browsers', 'family'],
  part: ['Parts added', 'type'], example: ['Examples opened', 'example'], import: ['Files opened', 'kind'], export: ['Exports', 'format'],
  save: ['Saves', 'where'], share: ['Shares', 'how'], view: ['View switched', 'view'], beam: ['Beam display', 'mode'],
  sweep: ['Sweeps played', ''], field: ['Diffracted field shown', 'where'], designer: ['Designers opened', 'designer'],
  optimise: ['Optimiser runs', 'designer'], analysis: ['Analyses viewed', 'analysis'], tolerance: ['Tolerance runs', 'designer'],
  report: ['Reports made', 'designer'], search: ['Parts searched', ''], tour: ['Tours started', 'tour'], help: ['Help opened', 'page'],
  news: ['What’s new opened', ''], signin: ['Sign-ins started', 'way'], subscribe: ['Subscribe opened', ''], quote: ['Quotes requested', 'from'],
  mod: ['Mods', 'action'], experimental: ['Experimental features', 'switched'], cloud: ['Cloud', 'action'],
  from: ['Where visits came from', 'post tag or site'], goal: ['What visits led to', 'source.step'],
  prompt: ['Sign-in prompts', 'where.answer'], remind: ['Links emailed from a phone', ''],
};
// what a visit can lead to, in the order it usually goes (the app's goal() calls)
export const STEPS = ['save', 'share', 'remind', 'signin', 'account', 'subscribe', 'pro'];
const TIERS = ['anon', 'free', 'pro'], TIER_NAMES = { anon: 'signed out', free: 'free', pro: 'JEKrayPro' };

async function get(days) {
  if (!TOKEN) throw new Error('Set JEK_OPS_TOKEN first (the value you gave `npx wrangler secret put OPS_TOKEN`).');
  const res = await fetch(`${API}/ops/usage?days=${Number(days) || 30}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const out = await res.json().catch(() => ({}));
  // the API answers 404 to a wrong token, as it does to anyone guessing at /ops
  if (res.status === 404) throw new Error(`${API} did not accept JEK_OPS_TOKEN: it is not the value of the OPS_TOKEN secret, or the API with usage counts is not deployed yet.`);
  if (!res.ok) throw new Error((out.error && out.error.message) || `HTTP ${res.status}`);
  return out;
}

// the report's figures: totals by event and tier, each event's tokens, visits a day
export function summarise(r) {
  const ev = {};
  for (const e of r.events) {
    const x = (ev[e.event] ||= { total: 0, tiers: {}, props: {} });
    x.total += e.n;
    x.tiers[e.tier] = (x.tiers[e.tier] || 0) + e.n;
    if (e.prop) x.props[e.prop] = (x.props[e.prop] || 0) + e.n;
  }
  const days = [];
  for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  const visits = Object.fromEntries(days.map((d) => [d, Object.fromEntries(TIERS.map((t) => [t, 0]))]));
  for (const d of r.daily) if (d.event === 'open' && visits[d.day]) visits[d.day][d.tier] += d.n;
  return { ev, days, visits };
}

// a row for each source: visits that came by its link (first), those back within 30 days, and each step
export function funnel(r) {
  const rows = {};
  const row = (src) => (rows[src] ||= { src, visits: 0, again: 0, steps: Object.fromEntries(STEPS.map((k) => [k, 0])) });
  for (const e of r.events) {
    if (e.event === 'from' && e.prop) { const again = e.prop.endsWith('.again'); const x = row(again ? e.prop.slice(0, -6) : e.prop); x[again ? 'again' : 'visits'] += e.n; }
    if (e.event === 'goal' && e.prop) { const i = e.prop.lastIndexOf('.'), x = row(e.prop.slice(0, i)), k = e.prop.slice(i + 1); if (k in x.steps) x.steps[k] += e.n; }
  }
  return Object.values(rows).sort((a, b) => (a.src === 'none') - (b.src === 'none') || b.visits + b.again - a.visits - a.again);
}

// the sign-in prompts (the app's track('prompt', '<where>.<answer>')): a row for each, with how often it was shown,
// each answer, the sign-in clicks among them (a way in chosen: Google, Microsoft or email) and those as a share of shown
export const WAYS_IN = ['google', 'microsoft', 'email'];
export const PROMPT_NAMES = { share: 'Share, signed out', save: 'After a file save', return: 'Restored on a later visit', shared: 'A shared bench, Save a copy', tour: 'The tour\u2019s end', menu: 'Account menu, signed out', export: 'An export, signed out' };
export function prompts(r) {
  const rows = {};
  for (const e of r.events) {
    if (e.event !== 'prompt' || !e.prop) continue;
    const i = e.prop.indexOf('.');
    if (i < 1) continue;
    const where = e.prop.slice(0, i), answer = e.prop.slice(i + 1) || '?';
    const x = (rows[where] ||= { where, shown: 0, signins: 0, answers: {} });
    if (answer === 'shown') x.shown += e.n;
    else { x.answers[answer] = (x.answers[answer] || 0) + e.n; if (WAYS_IN.includes(answer)) x.signins += e.n; }
  }
  const order = Object.keys(PROMPT_NAMES);
  return Object.values(rows).map((x) => Object.assign(x, { rate: x.shown ? x.signins / x.shown : null }))
    .sort((a, b) => ((order.indexOf(a.where) + 1 || 99) - (order.indexOf(b.where) + 1 || 99)) || b.shown - a.shown);
}
// the answers as columns: the ways in first, then the rest by how often they came
export function promptAnswers(rows) {
  const n = {};
  for (const x of rows) for (const [k, v] of Object.entries(x.answers)) n[k] = (n[k] || 0) + v;
  return [...WAYS_IN, ...Object.keys(n).filter((k) => !WAYS_IN.includes(k)).sort((a, b) => n[b] - n[a] || (a < b ? -1 : 1))];
}

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const top = (props, n = 8) => Object.entries(props).sort((a, b) => b[1] - a[1]).slice(0, n);

export function text(r) {
  const { ev, days, visits } = summarise(r);
  const v = ev.open || { total: 0, tiers: {} };
  console.log(`JEKray usage, ${r.from} to ${r.to} (${r.days} ${r.days === 1 ? "day" : "days"})\n`);
  console.log(`Visits  ${v.total}   ${TIERS.map((t) => `${TIER_NAMES[t]} ${v.tiers[t] || 0} (${pct(v.tiers[t] || 0, v.total)})`).join(', ')}`);
  const max = Math.max(1, ...days.map((d) => TIERS.reduce((a, t) => a + visits[d][t], 0)));
  for (const d of days.slice(-14)) {
    const n = TIERS.reduce((a, t) => a + visits[d][t], 0);
    console.log(`  ${d}  ${String(n).padStart(6)}  ${'#'.repeat(Math.round((40 * n) / max))}`);
  }
  console.log('');
  for (const [k, [label, what]] of Object.entries(LABELS)) {
    if (k === 'open' || !ev[k]) continue;
    const x = ev[k];
    console.log(`${label.padEnd(26)} ${String(x.total).padStart(7)}${v.total ? `   ${(x.total / v.total).toFixed(2)} a visit` : ''}`);
    if (what) for (const [p, n] of top(x.props)) console.log(`    ${p.padEnd(30)} ${String(n).padStart(7)}  ${pct(n, x.total)}`);
  }
  if (ev.open && Object.keys(ev.open.props).length) {
    console.log('\nHow visits began');
    for (const [p, n] of top(ev.open.props)) console.log(`    ${p.padEnd(30)} ${String(n).padStart(7)}  ${pct(n, v.total)}`);
  }
  const f = funnel(r);
  if (f.length) {
    console.log('\nBy source (none: no tag and no social site)');
    console.log(`    ${'source'.padEnd(24)} ${'visits'.padStart(7)} ${'back'.padStart(6)} ${STEPS.map((k) => k.padStart(9)).join(' ')}`);
    for (const x of f) console.log(`    ${x.src.padEnd(24)} ${String(x.visits).padStart(7)} ${String(x.again).padStart(6)} ${STEPS.map((k) => String(x.steps[k]).padStart(9)).join(' ')}`);
  }
  const p = prompts(r);
  if (p.length) {
    const cols = promptAnswers(p);
    console.log('\nSign-in prompts (shown, each answer, sign-in clicks and their share of shown)');
    console.log(`    ${'where'.padEnd(10)} ${'shown'.padStart(7)} ${cols.map((k) => k.padStart(9)).join(' ')} ${'sign-ins'.padStart(9)} ${'click-thru'.padStart(10)}`);
    for (const x of p) console.log(`    ${x.where.padEnd(10)} ${String(x.shown).padStart(7)} ${cols.map((k) => String(x.answers[k] || 0).padStart(9)).join(' ')} ${String(x.signins).padStart(9)} ${pct(x.signins, x.shown).padStart(10)}`);
  }
  console.log(`\nErrors (${r.errors.length} ${r.errors.length === 1 ? 'kind' : 'kinds'})`);
  for (const e of r.errors.slice(0, 20)) console.log(`  ${String(e.n).padStart(6)}  ${e.msg}\n          ${e.src}, ${e.first} to ${e.last}`);
}

function funnelTable(r) {
  const f = funnel(r);
  if (!f.length) return '';
  const cell = (n, of) => `<td>${n}${of && n ? ` <small>${pct(n, of)}</small>` : ''}</td>`;
  return `<h3 style="margin-top:24px">By source <span>a post's tag (?src=) or the site a visit came through; none: neither</span></h3><div style="overflow-x:auto"><table><tr><th>source</th><th>visits</th><th>back</th>${STEPS.map((k) => `<th>${k}</th>`).join('')}</tr>${f.map((x) => `<tr><td>${esc(x.src)}</td><td>${x.visits}</td><td>${x.again}</td>${STEPS.map((k) => cell(x.steps[k], x.visits + x.again)).join('')}</tr>`).join('')}</table></div>`;
}
function promptTable(r) {
  const p = prompts(r);
  if (!p.length) return '';
  const cols = promptAnswers(p);
  return `<h3 style="margin-top:24px">Sign-in prompts <span>where an account is offered: shown, each answer, and the sign-in clicks (${WAYS_IN.join(', ')}) as a share of shown</span></h3><div style="overflow-x:auto"><table><tr><th>where</th><th>shown</th>${cols.map((k) => `<th>${esc(k)}</th>`).join('')}<th>sign-ins</th><th>click-through</th></tr>${p.map((x) => `<tr><td title="${esc(PROMPT_NAMES[x.where] || '')}">${esc(x.where)}</td><td>${x.shown}</td>${cols.map((k) => `<td>${x.answers[k] || 0}</td>`).join('')}<td>${x.signins}</td><td>${pct(x.signins, x.shown)}</td></tr>`).join('')}</table></div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function html(r) {
  const { ev, days, visits } = summarise(r);
  const v = ev.open || { total: 0, tiers: {} };
  // visits a day, stacked by tier: one bar a day, a gap of 2 px between bars and between segments
  const W = 900, H = 220, P = 36, bw = (W - P - 8) / days.length;
  const max = Math.max(1, ...days.map((d) => TIERS.reduce((a, t) => a + visits[d][t], 0)));
  const nice = Math.pow(10, Math.floor(Math.log10(max))), step = max / nice > 5 ? nice * 2 : max / nice > 2 ? nice : nice / 2;
  const topY = Math.ceil(max / step) * step, ticks = [];
  for (let y = 0; y <= topY; y += step) ticks.push(y);
  const yOf = (n) => H - 24 - ((H - 40) * n) / topY;
  let bars = '';
  days.forEach((d, i) => {
    let y0 = H - 24, tip = `${d}: ${TIERS.map((t) => `${TIER_NAMES[t]} ${visits[d][t]}`).join(', ')}`;
    for (const t of TIERS) {
      const n = visits[d][t];
      if (!n) continue;
      const y1 = yOf(TIERS.slice(0, TIERS.indexOf(t) + 1).reduce((a, k) => a + visits[d][k], 0));
      bars += `<rect class="t-${t}" x="${(P + i * bw + 1).toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0, y0 - y1 - 2).toFixed(1)}" rx="2"><title>${esc(tip)}</title></rect>`;
      y0 = y1;
    }
  });
  const grid = ticks.map((t) => `<line x1="${P}" x2="${W - 8}" y1="${yOf(t)}" y2="${yOf(t)}" class="grid"/><text x="${P - 6}" y="${yOf(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const labels = days.map((d, i) => (i % Math.ceil(days.length / 8) === 0 ? `<text x="${P + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${d.slice(5)}</text>` : '')).join('');
  const section = (k) => {
    const x = ev[k], [label, what] = LABELS[k];
    const rows = what ? top(x.props, 12).map(([p, n]) => `<tr><td>${esc(p)}</td><td>${n}</td><td><span class="bar" style="width:${Math.max(2, Math.round((60 * n) / x.total))}px"></span> ${pct(n, x.total)}</td></tr>`).join('') : '';
    return `<section><h3>${esc(label)} <span>${x.total}${v.total && k !== 'open' ? ` · ${(x.total / v.total).toFixed(2)} a visit` : ''}</span></h3><p class="tiers">${TIERS.map((t) => `${TIER_NAMES[t]} ${x.tiers[t] || 0}`).join(' · ')}</p>${rows ? `<table><tr><th>${esc(what)}</th><th>count</th><th>share</th></tr>${rows}</table>` : ''}</section>`;
  };
  const errs = r.errors.map((e) => `<tr><td>${e.n}</td><td><code>${esc(e.msg)}</code><br><small>${esc(e.src)} · ${e.first} to ${e.last}</small></td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JEKray usage</title><style>
:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e4e4e8;--anon:#9aa7b8;--free:#2f7fd1;--pro:#e07b1a}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececf0;--muted:#9a9aa2;--line:#2c2c31;--anon:#5d6878;--free:#4d9be6;--pro:#f0913a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}main{max-width:960px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h3{font-size:15px;margin:0 0 2px}h3 span{color:var(--muted);font-weight:400}.sub,.tiers,small{color:var(--muted)}
.hero{display:flex;gap:32px;flex-wrap:wrap;margin:20px 0}.hero b{display:block;font-size:30px}svg{width:100%;height:auto}svg text{fill:var(--muted);font-size:11px}
.grid{stroke:var(--line)}.t-anon{fill:var(--anon)}.t-free{fill:var(--free)}.t-pro{fill:var(--pro)}.key{display:flex;gap:16px;color:var(--muted);font-size:13px}
.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-top:24px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{white-space:nowrap;text-align:left;padding:3px 6px 3px 0;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:500}
.bar{display:inline-block;height:8px;background:var(--free);border-radius:2px;vertical-align:middle}code{font-size:12px;word-break:break-word;white-space:normal}td:last-child{white-space:normal}td:nth-child(3){white-space:nowrap}</style></head><body><main>
<h1>JEKray usage</h1><p class="sub">${r.from} to ${r.to}, ${r.days} ${r.days === 1 ? "day" : "days"}. Counts, not people: a visit is one opening of the app.</p>
<div class="hero"><div><b>${v.total}</b>visits</div>${TIERS.map((t) => `<div><b>${v.tiers[t] || 0}</b>${TIER_NAMES[t]} (${pct(v.tiers[t] || 0, v.total)})</div>`).join('')}</div>
<h3>Visits a day</h3><div class="key">${TIERS.map((t) => `<span><i class="t-${t}" style="background:var(--${t})"></i>${TIER_NAMES[t]}</span>`).join('')}</div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visits a day">${grid}${bars}${labels}</svg>
${funnelTable(r)}
${promptTable(r)}
<div class="cols">${Object.keys(LABELS).filter((k) => ev[k]).map(section).join('')}</div>
<h3 style="margin-top:28px">Errors <span>${r.errors.length} ${r.errors.length === 1 ? 'kind' : 'kinds'}</span></h3>${errs ? `<table><tr><th>count</th><th>message</th></tr>${errs}</table>` : '<p class="sub">None.</p>'}
</main></body></html>`;
}

// run, not imported (as a URL, so Windows paths compare too)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: o } = parseArgs({ strict: false, options: { days: { type: 'string' }, html: { type: 'string' }, json: { type: 'boolean' } } });
  try {
    const r = await get(o.days);
    if (o.json) console.log(JSON.stringify(Object.assign({}, r, { prompts: prompts(r) }), null, 2));
    else text(r);
    if (o.html) { writeFileSync(o.html, html(r)); console.log(`\nWrote ${o.html}: open it in your browser.`); }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
