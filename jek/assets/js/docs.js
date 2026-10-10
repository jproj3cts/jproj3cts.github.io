/* JEKray2D documentation: equations (KaTeX), the "On this page" list, the search, and the
   contents button on a phone. The pages are plain HTML from Markdown; all of this is extra. */
(function () {
  'use strict';
  const body = document.querySelector('.dx-body');

  /* equations: kramdown writes $$ ... $$ as \( \) inline and \[ \] on their own line */
  function maths() {
    if (!window.renderMathInElement || !body) return;
    window.renderMathInElement(body, {
      delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false,
    });
  }
  if (document.readyState === 'complete') maths(); else window.addEventListener('load', maths);

  /* headings: a link to each, and the list of them down the right */
  const toc = document.getElementById('dxToc');
  const heads = body ? [...body.querySelectorAll('h2[id], h3[id]')] : [];
  for (const hd of heads) {
    const a = document.createElement('a');
    a.className = 'dx-anchor'; a.href = '#' + hd.id; a.textContent = '#'; a.setAttribute('aria-label', 'Link to this section');
    hd.append(a);
    if (toc) {
      const li = document.createElement('li'), l = document.createElement('a');
      li.className = hd.tagName.toLowerCase(); l.href = '#' + hd.id; l.textContent = hd.firstChild.textContent.trim();
      li.append(l); toc.append(li);
    }
  }
  if (toc && !heads.length) toc.parentElement.classList.add('empty');
  // the section being read is marked in the list
  if (toc && heads.length && 'IntersectionObserver' in window) {
    const items = new Map(heads.map((hd, i) => [hd, toc.children[i]]));
    let current = null;
    const mark = hd => { if (current) current.classList.remove('on'); current = items.get(hd); if (current) current.classList.add('on'); };
    const seen = new Set();
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target);
      const top = heads.find(hd => seen.has(hd));
      if (top) mark(top);
    }, { rootMargin: '0px 0px -70% 0px' });
    heads.forEach(hd => io.observe(hd));
  }

  /* the contents, folded away on a phone */
  const btn = document.querySelector('.dx-navbtn'), nav = document.getElementById('dxNav');
  if (btn && nav) btn.addEventListener('click', () => { const on = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); });

  /* search: every page's title, headings and text, from search.json, ranked by where the words are */
  const input = document.getElementById('dxSearch'), out = document.getElementById('dxResults');
  if (!input || !out) return;
  let index = null, loading = null, sel = -1;
  const load = () => loading || (loading = fetch('/jek/docs/jekray2d/search.json').then(r => r.json()).then(d => { index = d; }).catch(() => { index = []; }));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const snippet = (text, words) => {
    const low = text.toLowerCase();
    let at = -1;
    for (const w of words) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return esc(text.slice(0, 120)) + (text.length > 120 ? '…' : '');
    const s = Math.max(0, at - 50), e = Math.min(text.length, at + 90);
    let t = esc(text.slice(s, e));
    for (const w of words) t = t.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    return (s ? '…' : '') + t + (e < text.length ? '…' : '');
  };
  function show() {
    const q = input.value.trim().toLowerCase();
    sel = -1;
    if (!q) { out.hidden = true; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const hits = (index || []).map(p => {
      const t = p.title.toLowerCase(), hs = p.heads.toLowerCase(), x = p.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (!(t.includes(w) || hs.includes(w) || x.includes(w))) return null;
        score += (t.includes(w) ? 10 : 0) + (hs.includes(w) ? 4 : 0) + Math.min(5, x.split(w).length - 1);
      }
      return { p, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
    out.innerHTML = hits.length ? hits.map(({ p }) => '<a href="' + p.url + '"><b>' + esc(p.title) + '</b><small>' + snippet(p.text, words) + '</small></a>').join('')
      : '<p>Nothing matches “' + esc(input.value.trim()) + '”.</p>';
    out.hidden = false;
  }
  input.addEventListener('focus', load);
  input.addEventListener('input', () => { load().then(show); });
  input.addEventListener('keydown', e => {
    const links = [...out.querySelectorAll('a')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!links.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((l, i) => l.classList.toggle('sel', i === sel));
    } else if (e.key === 'Enter') {
      const l = links[sel >= 0 ? sel : 0];
      if (l) location.href = l.href;
    } else if (e.key === 'Escape') { input.value = ''; out.hidden = true; }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.dx-search')) out.hidden = true; });
})();
