/* A stand-in for the JEK API at http://localhost:8787 (the page's API on localhost), for the browser check and its
   screenshots: one person, their workspace and a team, two folders, benches of every app (a JEKfilm coating and a JEKcad part studio among them), a bench's history, prices.
   route(page, { signedIn }) installs it on a Playwright page; what the page asked for is kept in calls. */
const T0 = Date.UTC(2026, 10, 8, 12);
export const WS = 'w_me', TEAM = 'w_lab';
export function fakeData() {
  return {
    me: { user: { id: 'u1', name: 'Jo Kelly', email: 'jo@example.ac.uk', created_at: T0 - 9e9 }, identities: [{ provider: 'google', subject: 'x' }],
      workspaces: [{ id: WS, kind: 'personal', name: 'Jo', role: 'owner', active: true, plan: { plan: 'individual', billing: true, status: 'active', interval: 'month', period_end: T0 + 2e9 } },
        { id: TEAM, kind: 'team', name: 'Levitation lab', role: 'owner', active: true, plan: { plan: 'team', billing: true, status: 'active', interval: 'year', seats: 3 } }] },
    folders: { [WS]: [{ id: 'f1', name: 'Levisense', parent_id: null }, { id: 'f2', name: 'Absorption', parent_id: null }, { id: 'f3', name: 'Old runs', parent_id: 'f2' }], [TEAM]: [] },
    benches: {
      [WS]: [
        { id: 'b1', name: 'Spectrophotometer', tool: 'jekray', folder_id: null, workspace_id: WS, updated_at: T0 - 3600e3, size_bytes: 18400, version: 7 },
        { id: 'b2', name: 'Quadrupole trap', tool: 'jekion', folder_id: null, workspace_id: WS, updated_at: T0 - 7200e3, size_bytes: 9100, version: 3 },
        { id: 'b3', name: 'Michelson, 1064 nm', tool: 'jekray', folder_id: 'f1', workspace_id: WS, updated_at: T0 - 86400e3, size_bytes: 12000, version: 2 },
        { id: 'b5', name: 'BBAR 450–650', tool: 'jekfilm', folder_id: 'f2', workspace_id: WS, updated_at: T0 - 5400e3, size_bytes: 600, version: 4 },
        // a part studio an API from before JEKcad marked JEKray's: its content says what it is
        { id: 'b8', name: 'Alignment cap', tool: 'jekray', folder_id: 'f2', workspace_id: WS, updated_at: T0 - 6500e3, size_bytes: 5600, version: 1, content: JSON.stringify({ format: 'jekcad', version: 1, name: 'Alignment cap', features: [] }) },
        { id: 'b6', name: 'Lens mount', tool: 'jekcad', folder_id: 'f1', workspace_id: WS, updated_at: T0 - 6400e3, size_bytes: 5200, version: 2 },
        { id: 'b7', name: 'First absorption run', tool: 'jekray', folder_id: 'f3', workspace_id: WS, updated_at: T0 - 9e6, size_bytes: 8000, version: 1 },
      ],
      [TEAM]: [{ id: 'b4', name: 'Shared trap', tool: 'jekion', folder_id: null, workspace_id: TEAM, updated_at: T0 - 4000e3, size_bytes: 4000, version: 1, updated_by: { name: 'Sam' } }],
    },
  };
}
export async function route(page, opts = {}) {
  const D = fakeData(), calls = [];
  const corsOf = req => ({ 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' });
  await page.route('http://localhost:8787/**', async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname, cors = corsOf(req);
    const j = (o, s = 200) => r.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    calls.push(m + ' ' + p + u.search);
    if (p === '/v1/events') return j({ ok: true });
    if (p === '/v1/me') return opts.signedIn ? j(D.me) : j({ error: { code: 'signed_out', message: 'Sign in' } }, 401);
    if (p === '/v1/billing/prices') return j({ pro_monthly: { amount: 999, currency: 'gbp', interval: 'month' }, pro_yearly: { amount: 9900, currency: 'gbp', interval: 'year' }, academic_monthly: { amount: 499, currency: 'gbp', interval: 'month' }, academic_yearly: { amount: 4900, currency: 'gbp', interval: 'year' }, team_monthly: { amount: 999, currency: 'gbp', interval: 'month' }, team_yearly: { amount: 9999, currency: 'gbp', interval: 'year' } });
    let mm = p.match(/^\/v1\/workspaces\/(\w+)\/folders$/);
    if (mm && m === 'POST') { const f = Object.assign({ id: 'fnew' + (D.folders[mm[1]] || []).length, parent_id: null }, JSON.parse(req.postData())); (D.folders[mm[1]] = D.folders[mm[1]] || []).push(f); return j(f); }
    if (mm) return j({ folders: D.folders[mm[1]] || [] });
    mm = p.match(/^\/v1\/workspaces\/(\w+)\/benches$/);
    if (mm && m === 'GET') {
      const all = D.benches[mm[1]] || [], q = u.searchParams.get('q'), folder = u.searchParams.get('folder');
      const list = q ? all.filter(b => b.name.toLowerCase().includes(q.toLowerCase())) : u.searchParams.has('folder') ? all.filter(b => (b.folder_id || '') === folder) : all;
      return j({ benches: list, role: mm[1] === TEAM ? 'owner' : 'owner', active: true, usage: { bytes: 43500, quota: 1073741824 } });
    }
    if (mm && m === 'POST') { const b = JSON.parse(req.postData()); return j({ id: 'bnew', name: b.name, workspace_id: mm[1], version: 1, tool: JSON.parse(b.content).format }); }
    mm = p.match(/^\/v1\/benches\/(\w+)\/versions$/);
    if (mm) { const b = Object.values(D.benches).flat().find(x => x.id === mm[1]); return j({ bench: b, versions: [{ version: b.version, created_at: b.updated_at, size_bytes: b.size_bytes }, { version: b.version - 1, created_at: b.updated_at - 6e5, size_bytes: b.size_bytes }], forks: [], forked_from: null }); }
    // what the file system changes: a bench moved, renamed or binned, a folder made, renamed or moved
    mm = p.match(/^\/v1\/benches\/(\w+)$/);
    if (mm && (m === 'PATCH' || m === 'DELETE')) {
      for (const list of Object.values(D.benches)) { const i = list.findIndex(x => x.id === mm[1]); if (i < 0) continue; if (m === 'DELETE') list.splice(i, 1); else Object.assign(list[i], JSON.parse(req.postData())); }
      return j({ ok: true });
    }
    mm = p.match(/^\/v1\/workspaces\/(\w+)\/folders\/(\w+)$/);
    if (mm && m === 'PATCH') { const f = (D.folders[mm[1]] || []).find(x => x.id === mm[2]); if (f) Object.assign(f, JSON.parse(req.postData())); return j(f || {}); }
    mm = p.match(/^\/v1\/benches\/(\w+)$/);
    if (mm) { const b = Object.values(D.benches).flat().find(x => x.id === mm[1]); return b ? j(b) : j({ error: { message: 'not found' } }, 404); }
    if (p === '/v1/teams' && m === 'POST') return j({ id: 'w_new' });
    if (p.startsWith('/v1/teams/')) return j({ id: TEAM, name: 'Levitation lab', role: 'owner', active: true, plan: D.me.workspaces[1].plan, seats: { paid: 3, min: 3, billed: 3 }, members: [{ user_id: 'u1', name: 'Jo Kelly', role: 'owner', seat: true, joined_at: T0 - 9e9 }], invites: [], activity: [] });
    return j({ ok: true });
  });
  // the apps the hub opens: kept, not opened
  await page.addInitScript(() => { window.__opened = []; window.open = (url, name) => { window.__opened.push([url, name]); return { focus() {} }; }; });
  return calls;
}
