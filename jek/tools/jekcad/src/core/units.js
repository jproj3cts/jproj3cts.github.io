/* ==========================================================================
   Numbers as people type them: units and expressions. Every length is kept in millimetres and every angle in
   degrees; a field may hold a plain number ("12"), a number with a unit ("0.5 in", "30 deg"), an expression
   ("#width / 2 + 1 mm", "sqrt(2) * 10") and the Variables table's names (#name). A plain number in a length
   field is millimetres, in an angle field degrees. The grammar is the usual one: + - * / ^, brackets, unary minus,
   the functions below and pi. Errors are thrown as Error with a short reason the field shows.
   ========================================================================== */
export const LEN_UNITS = { mm: 1, cm: 10, m: 1000, um: 0.001, 'µm': 0.001, in: 25.4, inch: 25.4, '"': 25.4, ft: 304.8, thou: 0.0254, mil: 0.0254 };
export const ANG_UNITS = { deg: 1, '°': 1, rad: 180 / Math.PI };
const EXPR_FNS = {
  sin: a => Math.sin(a * Math.PI / 180), cos: a => Math.cos(a * Math.PI / 180), tan: a => Math.tan(a * Math.PI / 180),
  asin: a => Math.asin(a) * 180 / Math.PI, acos: a => Math.acos(a) * 180 / Math.PI, atan: a => Math.atan(a) * 180 / Math.PI,
  atan2: (y, x) => Math.atan2(y, x) * 180 / Math.PI, sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max,
  round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp, ln: Math.log, log: Math.log10,
};
/* the tokens of an expression */
function exprTokens(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^#?[A-Za-z_µ°"][A-Za-z0-9_]*/.exec(s.slice(i)) || (c === '°' || c === '"' ? [c] : null);
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('“' + c + '” is not understood');
  }
  return out;
}
/* an expression's value: kind 'len' (mm), 'ang' (degrees) or 'num'; vars maps a variable's name (no #) to its value */
export function evalExpr(text, vars, kind) {
  if (typeof text === 'number') { if (!Number.isFinite(text)) throw new Error('not a number'); return text; }
  const src = String(text == null ? '' : text).trim();
  if (!src) throw new Error('empty');
  const tk = exprTokens(src.replace(/,(?=\d{3}\b)/g, ''));
  let p = 0;
  const peek = () => tk[p], eat = t => { if (tk[p] && tk[p].t === t) { p++; return true; } return false; };
  const unitOf = () => {
    const n = peek();
    if (!n || n.t !== 'id' || n.v[0] === '#') return 1;
    const u = n.v.toLowerCase();
    if (u in LEN_UNITS && kind !== 'ang') { p++; return LEN_UNITS[u]; }
    if (u in ANG_UNITS) { p++; return ANG_UNITS[u]; }
    return 1;
  };
  function primary() {
    const n = peek();
    if (!n) throw new Error('unfinished');
    if (n.t === 'n') { p++; return n.v * unitOf(); }
    if (n.t === '(') { p++; const v = sum(); if (!eat(')')) throw new Error('a bracket is not closed'); return v * unitOf(); }
    if (n.t === 'id') {
      p++;
      if (n.v[0] === '#') { const k = n.v.slice(1); if (!vars || !(k in vars)) throw new Error('no variable ' + n.v); return vars[k]; }
      const k = n.v.toLowerCase();
      if (k === 'pi') return Math.PI;
      if (EXPR_FNS[k]) {
        if (!eat('(')) throw new Error(k + ' needs brackets');
        const args = [sum()];
        while (eat(',')) args.push(sum());
        if (!eat(')')) throw new Error('a bracket is not closed');
        return EXPR_FNS[k](...args);
      }
      if (vars && k in vars) return vars[k];
      throw new Error('“' + n.v + '” is not a unit, function or #variable');
    }
    throw new Error('“' + n.t + '” is out of place');
  }
  function power() { const b = primary(); if (eat('^')) return Math.pow(b, unary()); return b; }
  function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
  function product() { let v = unary(); for (;;) { if (eat('*')) v *= unary(); else if (eat('/')) { const d = unary(); v /= d; } else return v; } }
  function sum() { let v = product(); for (;;) { if (eat('+')) v += product(); else if (eat('-')) v -= product(); else return v; } }
  const v = sum();
  if (p < tk.length) throw new Error('“' + (tk[p].v !== undefined ? tk[p].v : tk[p].t) + '” is out of place');
  if (!Number.isFinite(v)) throw new Error('not a finite number');
  return v;
}
/* the Variables table, in order (a variable may use those above it): { values: {name: value}, errors: {name: why} } */
export const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
export function evalVars(list) {
  const values = {}, errors = {};
  for (const v of list || []) {
    if (!v || !VAR_NAME.test(v.name || '')) continue;
    try { values[v.name] = evalExpr(v.expr, values, v.kind === 'ang' ? 'ang' : v.kind === 'num' ? 'num' : 'len'); }
    catch (err) { errors[v.name] = err.message; }
  }
  return { values, errors };
}
/* a number shown: up to 4 decimals, no trailing zeros */
export const fmtNum = (v, dp = 4) => (Number.isFinite(v) ? String(+v.toFixed(dp)) : '—');
export const fmtLen = v => fmtNum(v) + ' mm';
export const fmtAng = v => fmtNum(v, 3) + '°';
/* an expression as it is stored: what was typed, or a number as text */
export const exprText = v => (typeof v === 'number' ? fmtNum(v, 6) : String(v == null ? '' : v));
/* does it name a variable, or calculate: worth showing its value beside it */
export const exprIsFormula = v => typeof v === 'string' && /[#()*/^+]|[a-z]{2,}\(/.test(v.replace(/^\s*-/, '').replace(/\d(e[+-]?)\d/gi, ''));
