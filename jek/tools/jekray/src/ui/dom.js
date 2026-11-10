/* ==========================================================================
   The page's elements, made: h(tag, attrs, ...kids). Shared as it is by JEKray, JEKion and JEKsuite (each lists it
   in its order.json), so the account (io/account.js), which all three share, makes its menus and dialogs the same
   way in each. attrs: class, on<event> handlers, and attributes (true for a bare one; null, undefined and false are
   left out); kids: nodes or text, with null, undefined and false left out.
   ========================================================================== */
export function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) n.append(k);
  return n;
}
