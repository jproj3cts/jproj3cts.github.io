/* A stand-in for the JEK API at http://localhost:8787 (the page's API on localhost), for JEKfilm's browser check: one
   person (with JEKrayPro, a free account, or signed out), their workspace with a folder, a coating and a JEKray bench.
   route(page, { signedIn, pro }) installs it on a Playwright page; what the page asked for is kept in calls. */
export const WS = 'w_me';
export const COATING = { format: 'jekfilm', version: 1, name: 'V-coat 1064', spec: { target: 'ar', sub: { glass: 'Fused silica' }, lo: 1000, hi: 1120, design: 1064 }, layers: [{ n: 1.38, d: 192.75 }, { n: 1.7, d: 156.47 }] };
export async function route(page, opts = {}) {
  const calls = [], bodies = [], links = Object.assign({}, opts.links || {});
  const me = { user: { id: 'u1', name: 'Jo Kelly', email: 'jo@example.ac.uk' }, identities: [{ provider: 'google', subject: 'x' }],
    workspaces: [{ id: WS, kind: 'personal', name: 'Jo', role: 'owner', active: !!opts.pro, plan: opts.pro ? { plan: 'individual', billing: true, status: 'active', interval: 'month' } : null }] };
  const benches = { c2: { id: 'c2', name: 'HR 1064', tool: 'jekfilm', workspace_id: WS, folder_id: 'f1', version: 2, content: JSON.stringify(Object.assign({}, COATING, { name: 'HR 1064' })), editing: opts.othersEditing ? { id: 'u2', name: 'Sam Reid' } : null },
    c1: { id: 'c1', name: 'V-coat 1064', tool: 'jekfilm', workspace_id: WS, folder_id: 'f1', version: 3, content: JSON.stringify(COATING) },
    b1: { id: 'b1', name: 'Michelson', tool: 'jekray', workspace_id: WS, folder_id: null, version: 2, content: '{"format":"jekray"}' } };
  const cors = req => ({ 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE' });
  await page.route('http://localhost:8787/**', async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname, c = cors(req);
    const j = (o, s = 200) => r.fulfill({ status: s, contentType: 'application/json', headers: c, body: JSON.stringify(o) });
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: c });
    calls.push(m + ' ' + p);
    if (p === '/v1/events') return j({ ok: true });
    if (p === '/v1/me') return opts.signedIn ? j(me) : j({ error: { code: 'signed_out', message: 'Sign in' } }, 401);
    if (p === '/v1/billing/prices') return j({});
    if (p === `/v1/workspaces/${WS}/folders`) return j({ folders: [{ id: 'f1', name: 'Nd:YAG laser', parent_id: null }, { id: 'f2', name: 'Cavity', parent_id: 'f1' }] });
    if (p === `/v1/workspaces/${WS}/benches` && m === 'POST') { const b = JSON.parse(req.postData()); bodies.push(b); if (opts.pro) benches.cnew = { id: 'cnew', name: b.name, tool: 'jekfilm', workspace_id: WS, folder_id: b.folder_id, version: 1, content: b.content, editing: null };
      return opts.pro ? j({ id: 'cnew', name: b.name, workspace_id: WS, folder_id: b.folder_id, version: 1, tool: 'jekfilm' }) : j({ error: { message: 'Needs JEKrayPro' } }, 402); }
    if (p === '/v1/links' && m === 'POST') { const b = JSON.parse(req.postData()); bodies.push(b); links.ABCDEFGHJK = b.data; return opts.pro ? j({ id: 'ABCDEFGHJK' }) : j({ error: { message: 'Needs JEKrayPro' } }, 402); }
    let mm = p.match(/^\/v1\/links\/(\w+)$/);
    if (mm) return links[mm[1]] ? j({ id: mm[1], data: links[mm[1]] }) : j({ error: { message: 'No such link.' } }, 404);
    mm = p.match(/^\/v1\/benches\/(\w+)\/lease$/);
    if (mm) {
      const b = benches[mm[1]], take = m === 'POST' && JSON.parse(req.postData() || '{}').take;
      if (m === 'DELETE') { if (!b.editing || b.editing.id === 'u1') b.editing = null; return j({ ok: true }); }
      if (b.editing && b.editing.id !== 'u1' && !take) return j({ held: false, editing: b.editing, version: b.version });
      b.editing = { id: 'u1', name: 'Jo Kelly' }; return j({ held: true, editing: b.editing, version: b.version });
    }
    mm = p.match(/^\/v1\/benches\/(\w+)\/thumb$/);
    if (mm) return j({ thumb: '/t' });
    mm = p.match(/^\/v1\/benches\/(\w+)$/);
    if (mm && m === 'PUT') {
      const b = benches[mm[1]], v = Number((req.headers()['if-match'] || '').replace(/"/g, ''));
      bodies.push(JSON.parse(req.postData()));
      if (!opts.pro) return j({ error: { message: 'Needs JEKrayPro' } }, 402);
      if (b.editing && b.editing.id !== 'u1') return j({ error: { code: 'locked', message: 'editing', editing: b.editing } }, 423);
      if (v !== b.version) return j({ error: { code: 'conflict', message: 'newer', version: b.version } }, 409);
      b.version++; return j({ id: b.id, name: b.name, version: b.version });
    }
    if (mm) { const b = benches[mm[1]]; return b ? j(b) : j({ error: { message: 'not found' } }, 404); }
    return j({ ok: true });
  });
  await page.addInitScript(() => { window.__opened = []; window.open = (url, name) => { window.__opened.push([url, name]); return { focus() {} }; }; });
  return { calls, bodies, benches, links };
}
