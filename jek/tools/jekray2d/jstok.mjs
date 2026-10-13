/* Blank out comments, strings, template strings and regex literals in JavaScript source,
   keeping every newline and the string/regex delimiters, so that brackets and identifiers
   can be counted on what is left. A '/' starts a regex when the previous significant token
   cannot end an expression. */
const KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
export function blank(src) {
  const out = []; let i = 0, prev = '', prevWord = '';
  const n = src.length, tplStack = [];
  const keepNl = s => s.replace(/[^\n]/g, ' ');
  const exprEnd = () => { if (prevWord) return !KW.has(prevWord); return /[)\]}\w$]/.test(prev) || prev === "'" || prev === '"' || prev === '`' || prev === '/'; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const k = j < 0 ? n : j; out.push(keepNl(src.slice(i, k))); i = k; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const k = j < 0 ? n : j + 2; out.push(keepNl(src.slice(i, k))); i = k; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; } out.push(c + keepNl(src.slice(i + 1, j)) + c); i = src[j] === '\n' ? j : j + 1; prev = c; prevWord = ''; continue; }
    if (c === '`') { let j = i + 1, s = i + 1; const parts = ['`']; while (j < n && src[j] !== '`') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') { parts.push(keepNl(src.slice(s, j)) + '${'); j += 2; let depth = 1, k = j; /* the expression: recurse */ while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; else if (src[k] === '`' || src[k] === "'" || src[k] === '"') { const q = src[k]; k++; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } } k++; } parts.push(blank(src.slice(j, k - 1)) + '}'); j = k; s = k; continue; } j++; } parts.push(keepNl(src.slice(s, j)) + '`'); out.push(parts.join('')); i = j + 1; prev = '`'; prevWord = ''; continue; }
    if (c === '/' && !exprEnd()) { let j = i + 1, cls = false; while (j < n) { const e = src[j]; if (e === '\\') { j += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; else if (e === '\n') break; j++; } out.push('/' + keepNl(src.slice(i + 1, j)) + '/'); i = src[j] === '\n' ? j : j + 1; while (i < n && /[a-z]/.test(src[i])) i++; prev = '/'; prevWord = ''; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; const w = src.slice(i, j); out.push(w); prevWord = w; prev = w[w.length - 1]; i = j; continue; }
    out.push(c); if (!/\s/.test(c)) { prev = c; prevWord = ''; } i++;
  }
  return out.join('');
}
