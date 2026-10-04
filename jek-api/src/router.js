// A tiny router: patterns like '/v1/benches/:b' match one path segment per
// parameter; the handler gets (req, env, ctx, params).

export class Router {
  constructor() {
    this.routes = [];
  }

  on(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
    );
    this.routes.push({ method, re, keys, handler, opts });
    return this;
  }

  // { route, params } for a match, { allow } when only the method is wrong,
  // or null.
  match(method, path) {
    const allow = [];
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      if (r.method !== method) {
        allow.push(r.method);
        continue;
      }
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return allow.length ? { allow } : null;
  }
}
