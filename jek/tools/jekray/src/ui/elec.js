import { clamp } from '../core/constants.js';
import { V, deg, nextName, project } from '../state/project.js';
import { getEl, normElement } from '../state/elements.js';
import { benchName } from '../state/tabs.js';
import { frame } from '../core/mask.js';
import { bodyFill, ctx, getCss, keepOffLabel, pathLocal, portFill, portsInUse, removeFibre, selInk, sx, sy } from './render.js';
import { snapVal } from './pointer.js';
import { pkey, portName, portWorld, portsOf, portsOfOptic } from '../engines/fibre.js';
import {
  CHOP_HUB, DARK, ELEC_KINDS, ELEC_YELLOW, INK, NODE_PORT, NODE_R, PITCH, boxH, circ, elecExtra,
  elecNoiseRms, elecPsdAt, inputOf, isDet, isLaser, line, partner, portList, signalOf, solve
} from '../engines/elec.js';
import { INST } from './instruments.js';
import { helpLine, bindSync, h, panel, param, selectField, textField } from './panel.js';
import { readoutBox } from './panels.js';
import { plotSaveRow } from './plots.js';
import { changed } from './actions.js';
import { addBench, checkpoint, selectEl } from './tabs.js';

/* ==========================================================================
   Electronics on the page: the blocks' symbols, their panels and instruments (the scope, the
   spectrum view, the lock-in's readout). The signals themselves: engines/elec.js.
   ========================================================================== */

// a mod's block: a box as tall as its ports need, its tag in it
const modSym = K => { const hh = boxH(K) / 2 - 0.5;
  return { L: () => 4.2, R: () => 4.2, draw(c) { c.beginPath(); c.rect(-4.2, -hh, 8.4, 2 * hh); c.fillStyle = bodyFill('#2b2a22'); c.fill(); c.stroke();
    c.save(); c.fillStyle = c.strokeStyle; c.font = '2.2px ' + getCss('--jek-mono'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(K.tag || 'MODULE').slice(0, 8), 0, 0); c.restore(); } }; };
/* ---------- the parts as schematic symbols ----------
   Drawn in the part's own frame, in mm, y down (u across, v down the page at angle 0).
   Each symbol says how far it reaches at a height v on its left and right, so the leads
   from the ports run in to meet it. */
const SYM = {
  dc: { L: () => 2.6, R: () => 2.6, draw(c) {
    for (const [u, h, w] of [[-2.4, 2.6, 1], [-0.8, 1.4, 2.2], [0.8, 2.6, 1], [2.4, 1.4, 2.2]]) { c.lineWidth *= w; line(c, u, -h, u, h); c.lineWidth /= w; }
    line(c, -3.4, -3.3, -2.2, -3.3); line(c, -2.8, -3.9, -2.8, -2.7);
  } },
  sig: { L: v => circ(3.6, v), R: v => circ(3.6, v), draw(c, el) {
    c.beginPath(); c.arc(0, 0, 3.6, 0, 2 * Math.PI); c.stroke();
    inner(c, () => {
    const w = el.wave, f = t => w === 'square' ? (t < 0.5 ? -1 : 1) : w === 'triangle' ? (t < 0.25 ? -4 * t : t < 0.75 ? 4 * t - 2 : 4 - 4 * t) : w === 'pulse' ? (t > 0.15 && t < 0.4 ? -1 : 1) : -Math.sin(2 * Math.PI * t);
    c.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40; i ? c.lineTo(-2.4 + 4.8 * t, 1.4 * f(t)) : c.moveTo(-2.4, 1.4 * f(0)); } c.stroke();
    });
  } },
  noise: { L: v => circ(3.6, v), R: v => circ(3.6, v), draw(c) {
    c.beginPath(); c.arc(0, 0, 3.6, 0, 2 * Math.PI); c.stroke();
    inner(c, () => { const z = [0, -1.3, 1.1, -0.9, 1.5, -1.6, 0.8, -0.4, 1.2, 0]; c.beginPath(); z.forEach((y, i) => { const u = -2.5 + 5 * i / (z.length - 1); i ? c.lineTo(u, y) : c.moveTo(u, y); }); c.stroke(); });
  } },
  amp: { L: () => 3.4, R: v => Math.max(0, 3.8 - 7.2 * Math.abs(v) / 4), draw(c) { poly(c, [[-3.4, -4], [3.8, 0], [-3.4, 4]]); } },
  tia: { L: () => 3, R: v => Math.max(0, 3.4 - 6.4 * Math.abs(v) / 3.2), draw(c) {
    poly(c, [[-3, -3.2], [3.4, 0], [-3, 3.2]]);
    // its feedback resistor, from input to output over the top
    c.beginPath(); c.moveTo(-5, 0); c.lineTo(-5, -5); c.lineTo(-2.2, -5);
    for (let i = 0; i < 6; i++) c.lineTo(-1.8 + i * 0.8, i % 2 ? -4.3 : -5.7);
    c.lineTo(2.6, -5); c.lineTo(5, -5); c.lineTo(5, 0); c.stroke();
    line(c, -5, 0, -3, 0); line(c, 3.4, 0, 5, 0);
  } },
  lpf: { L: () => 3.6, R: () => 3.6, draw(c) { filterBox(c, f => f < 0.45 ? 0 : -Math.min(1.8, (f - 0.45) * 5)); } },
  hpf: { L: () => 3.6, R: () => 3.6, draw(c) { filterBox(c, f => f > 0.55 ? 0 : -Math.min(1.8, (0.55 - f) * 5)); } },
  bpf: { L: () => 3.6, R: () => 3.6, draw(c) { filterBox(c, f => -Math.min(1.8, Math.abs(f - 0.5) * 6)); } },
  mixer: { L: v => circ(3.2, v), R: v => circ(3.2, v), draw(c) {
    c.beginPath(); c.arc(0, 0, 3.2, 0, 2 * Math.PI); c.stroke(); const d = 3.2 * Math.SQRT1_2; line(c, -d, -d, d, d); line(c, -d, d, d, -d);
  } },
  // a resistor in a box
  att: { L: () => 3.6, R: () => 3.6, draw(c) {
    rect(c, 3.6, 3.6);
    inner(c, () => { c.beginPath(); c.moveTo(-3.6, 0); c.lineTo(-2.4, 0); for (let i = 0; i < 6; i++) c.lineTo(-2 + i * 0.8, i % 2 ? 1.1 : -1.1); c.lineTo(2.4, 0); c.lineTo(3.6, 0); c.stroke(); });
  } },
  // the RF through a capacitor, the DC through an inductor, meeting at the output
  biastee: { L: () => 3.4, R: () => 1.6, draw(c) {
    const a = -PITCH / 2, b = PITCH / 2;
    line(c, -3.4, a, -1, a); line(c, -1, a - 1.2, -1, a + 1.2); line(c, -0.3, a - 1.2, -0.3, a + 1.2); line(c, -0.3, a, 1.6, a);
    c.beginPath(); c.moveTo(-3.4, b); for (let i = 0; i < 4; i++) c.arc(-2.6 + i * 0.9, b, 0.45, Math.PI, 0); c.lineTo(1.6, b); c.stroke();
    line(c, 1.6, a, 1.6, b); c.beginPath(); c.arc(1.6, 0, 0.45, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill();
  } },
  // an amplifier's triangle with a step in it
  comp: { L: () => 3.4, R: v => Math.max(0, 3.8 - 7.2 * Math.abs(v) / 4), draw(c) {
    poly(c, [[-3.4, -4], [3.8, 0], [-3.4, 4]]);
    // (a step turned half round is the same step, low then high, so it needs no turning back)
    c.beginPath(); c.moveTo(-2.6, 1); c.lineTo(-1.2, 1); c.lineTo(-1.2, -1); c.lineTo(0.4, -1); c.stroke();
  } },
  sum: { L: v => circ(3.2, v), R: v => circ(3.2, v), draw(c) {
    c.beginPath(); c.arc(0, 0, 3.2, 0, 2 * Math.PI); c.stroke(); line(c, -1.8, 0, 1.8, 0); line(c, 0, -1.8, 0, 1.8);
  } },
  scope: { L: () => 4.6, R: () => 4.6, draw(c) {
    rect(c, 4.6, 3.6); inner(c, () => { c.beginPath(); for (let i = 0; i <= 40; i++) { const u = -3.6 + 7.2 * i / 40; i ? c.lineTo(u, -1.5 * Math.sin(3 * Math.PI * i / 40)) : c.moveTo(u, 0); } c.stroke(); });
  } },
  spec: { L: () => 4.6, R: () => 4.6, draw(c) {
    rect(c, 4.6, 3.6); inner(c, () => { c.beginPath(); c.moveTo(-3.6, 2.4); for (const [u, h] of [[-2, 4], [-0.2, 2.6], [1.6, 1.4]]) { c.lineTo(u, 2.4); c.lineTo(u, 2.4 - h); c.lineTo(u, 2.4); } c.lineTo(3.6, 2.4); c.stroke(); });
  } },
  // samples of a wave, as stems
  // a bulkhead plate with a coaxial connector through it
  thru: { L: () => 3, R: () => 3, draw(c) {
    c.lineWidth *= 2.2; line(c, 0, -4.2, 0, 4.2); c.lineWidth /= 2.2;
    c.beginPath(); c.arc(0, 0, 2.4, 0, 2 * Math.PI); c.fillStyle = bodyFill(DARK); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.7, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill();
  } },
  daq: { L: () => 4.6, R: () => 4.6, draw(c) {
    rect(c, 4.6, 3.6);
    inner(c, () => { line(c, -3.6, 0, 3.6, 0);
      for (let i = 0; i < 6; i++) { const u = -3 + i * 1.2, v = -2.2 * Math.sin(2 * Math.PI * (i + 0.5) / 6); line(c, u, 0, u, v); c.beginPath(); c.arc(u, v, 0.35, 0, 2 * Math.PI); c.fillStyle = c.strokeStyle; c.fill(); } });
  } },
  lockin: { L: () => 5.2, R: () => 5.2, draw(c) {
    rect(c, 5.2, 4.2);
    inner(c, () => {
      c.beginPath(); c.arc(-2, 0, 1.8, 0, 2 * Math.PI); c.stroke(); const d = 1.8 * Math.SQRT1_2; line(c, -2 - d, -d, -2 + d, d); line(c, -2 - d, d, -2 + d, -d);
      c.beginPath(); c.moveTo(0.8, -1); c.lineTo(2.6, -1); c.quadraticCurveTo(3.6, -1, 4, 1.2); c.stroke();
    });
  } },
};
const poly = (c, P) => { c.beginPath(); P.forEach(([u, v], i) => i ? c.lineTo(u, v) : c.moveTo(u, v)); c.closePath(); c.fillStyle = bodyFill(DARK); c.fill(); c.stroke(); };
const rect = (c, a, b) => { c.beginPath(); c.rect(-a, -b, 2 * a, 2 * b); c.fillStyle = bodyFill(DARK); c.fill(); c.stroke(); };
/* a filter: its box, and a sketch of its response, gain (up) against frequency (across) */
function filterBox(c, g) {
  rect(c, 3.6, 3.6);
  inner(c, () => {
    const w = c.lineWidth; c.lineWidth = w * 0.6; line(c, -2.6, 2.4, 2.6, 2.4); line(c, -2.6, 2.4, -2.6, -2.6); c.lineWidth = w;
    c.beginPath(); for (let i = 0; i <= 30; i++) { const f = i / 30, u = -2.4 + 4.8 * f, v = -1.2 - g(f); i ? c.lineTo(u, v) : c.moveTo(u, v); } c.stroke();
  });
}
function elecDraw(el, sel) {
  if (el.kind === 'node') return drawNode(el, sel);
  const K = ELEC_KINDS[el.kind], G = SYM[el.kind] || modSym(K), s = V().scale, ports = portList(el);   // a mod's block: a box with its tag
  const c = ctx;
  c.save();
  c.translate(sx(el.x), sy(el.y)); c.rotate(-el.angle * deg); c.scale(s, s);
  c.strokeStyle = sel ? selInk() : ELEC_YELLOW; c.lineWidth = (sel ? 2.2 : 1.5) / s; c.lineJoin = 'round'; c.lineCap = 'round';
  // the leads, from each port in to the symbol
  for (const P of ports) { const v = -P.y; line(c, P.x, v, P.x < 0 ? -G.L(v) : G.R(v), v); }
  FLIP = Math.cos(el.angle * deg) < -1e-6;
  G.draw(c, el);
  FLIP = false;
  c.restore();
  const used = portsInUse(), r = clamp(1.0 * s, 3, 6), names = [...K.ins, ...K.outs];
  // which ports are named on the bench: any on a side with more than one, and any not plainly "in" or "out"
  const named = (P, i) => (P.elec === 'in' ? K.ins.length : K.outs.length) > 1 || !['in', 'out'].includes(names[i]);
  const fs = clamp(1.7 * s, 8, 11);
  ports.forEach((P, i) => {
    const Q = portWorld(el, i), X = sx(Q.x), Y = sy(Q.y), on = used.has(pkey(el.id, i));
    c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI);
    c.fillStyle = on || P.elec === 'out' ? ELEC_YELLOW : portFill(); c.fill(); c.strokeStyle = ELEC_YELLOW; c.lineWidth = 1.4; c.stroke();
    if (named(P, i) && s > 2.2) {
      // the name just outside the port, away from the part, upright whatever the part's angle
      c.save(); c.font = fs + 'px ' + getCss('--jek-mono'); c.fillStyle = INK;
      const ox = Q.dx, oy = -Q.dy, out = r + 3;
      c.textAlign = Math.abs(ox) < 0.3 ? 'center' : ox > 0 ? 'left' : 'right'; c.textBaseline = 'bottom';
      c.fillText(names[i], X + ox * out, Y + oy * out - 3); c.restore();
    }
  });
}
/* a node: a yellow dot on the wiring, its input and output either side; it hands on what it is given */
function drawNode(el, sel) {
  const s = V().scale, X = sx(el.x), Y = sy(el.y), r = clamp(NODE_R * s, 7, 12);
  ctx.beginPath(); ctx.arc(X, Y, r, 0, 2 * Math.PI);
  ctx.fillStyle = bodyFill(DARK); ctx.fill(); ctx.strokeStyle = sel ? selInk() : ELEC_YELLOW; ctx.lineWidth = sel ? 2.4 : 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(X, Y, NODE_PORT, 0, 2 * Math.PI); ctx.fillStyle = ELEC_YELLOW; ctx.fill();
}
/* ---------- panels ---------- */
function elecPanelFor(el) {
  const K = ELEC_KINDS[el.kind];
  panel.append(h('h3', null, K.label));
  const box = h('div', { class: 'rt-rows' });
  for (const [k, label, , opts] of K.params) {
    if (opts) box.append(selectField(label, opts.map(([v, t]) => [String(v), t]), () => String(el[k]), v => { const o = opts.find(([x]) => String(x) === v); el[k] = o ? o[0] : el[k]; }));
    else box.append(param(label, el, k));
  }
  panel.append(box);
  if (el.kind === 'thru') thruSection(el);
  const io = el.kind === 'node' ? [] : [...K.ins.map(n => n + ' (in)'), ...K.outs.map(n => n + ' (out)')];
  if (io.length) panel.append(h('p', { class: 'note', style: 'margin-top:0.5rem' }, 'Ports: ' + io.join(', ') + '.'));
  panel.append(h('p', null,
    'Drag from an output to an input to wire them; an output can feed several inputs, an input takes one wire.' +
    (el.kind === 'node' ? ' A node is one point on the wiring: wire an output into it, then draw as many wires out of it as you like (drag from its centre dot; drag its ring to move it). It hands on what reaches it unchanged. Its name shows only when it is selected.' : '')));
  instrumentSection(el);
  panel.append(readoutBox('elec'));
}
/* a feedthrough's pair: its name, its partner, and a partner made on another tab */
function thruSection(el) {
  panel.append(h('div', { class: 'rt-rows' }, textField('Pair name', () => el.pair, v => { el.pair = v.trim().slice(0, 60) || el.pair; }, { wide: true })));
  const st = h('p', { class: 'note', style: 'margin-top:0.5rem' }), acts = h('div', { class: 'rt-rows', style: 'margin-top:0.4rem' });
  panel.append(st, acts);
  let sig = null;
  bindSync(st, () => {
    const P = partner(el);
    st.textContent = P ? 'Joined to ' + P.name + ' on ' + benchName(P.bench) + ': what goes into one\u2019s input comes out of the other\u2019s output, both ways, unchanged.'
      : 'No partner yet: give an electrical feedthrough on another tab the same pair name, or make one below.';
    const s2 = (P ? P.id : '') + '|' + project.benches.map(b => b.id + b.name).join();
    if (s2 === sig) return;
    sig = s2; acts.replaceChildren();
    if (P) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => selectEl(P) }, 'Go to ' + P.name + ' on ' + benchName(P.bench)));
    else {
      const mk = bId => { if (!bId) { addBench(); bId = project.tab; } checkpoint(); const b = project.benches.find(b2 => b2.id === bId);
        const c = normElement({ type: 'elec', kind: 'thru', name: nextName('Electrical feedthrough'), x: snapVal(b.view.cx), y: snapVal(b.view.cy), angle: 0, pair: el.pair, bench: bId });
        project.elements.push(c); selectEl(c); changed(true); };
      for (const b of project.benches) if (b.id !== el.bench) acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => mk(b.id) }, 'Make its partner on ' + b.name));
      acts.append(h('button', { class: 'rt-btn wide', type: 'button', onclick: () => mk(null) }, 'Make its partner on a new tab'));
    }
  });
}
/* a wire, selected */
function elecWirePanel(F) {
  const A = getEl(F.a[0]), B = getEl(F.b[0]);
  const end = (E, p) => E ? E.name + ' ' + portName(E, p) : '?';
  panel.append(h('h2', null, h('span', null, 'Wire'), h('span', { class: 'kind' }, end(A, F.a[1]) + ' → ' + end(B, F.b[1]))));
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'An electrical connection from an output to an input. Drag its input end to another input to move it, or off its port to take it away.'));
  panel.append(h('div', { class: 'rt-rows', style: 'margin-top:0.5rem' }, h('button', { class: 'rt-btn danger wide', type: 'button', onclick: () => removeFibre(F) }, 'Delete wire')));
}
/* the scope and the analyser: the shared instrument views (INST), fed what reaches their inputs */
function drawScope(cv, el) {
  const chans = [0, 1].map(i => ({ S: inputOf(el, i), key: el.id + ':' + i, name: 'ch' + (i + 1) }));
  return INST.scope(cv, chans, { mode: el.mode, span: el.span, ch: [{ vdiv: el.v1div, off: el.v1off }, { vdiv: el.v2div, off: el.v2off }] }, el.name, () => drawScope(cv, el));
}
export function drawSpectrum(cv, el) {
  return INST.spectrum(cv, inputOf(el, 0), { scale: el.scale, fmin: el.fmin, fmax: el.fmax, rbw: el.rbw, dbdiv: el.dbdiv, ref: el.ref }, el.name);
}
function instrumentSection(el) {
  if (el.kind !== 'scope' && el.kind !== 'spec') return;
  const cv = h('canvas', { height: '170', style: 'width:100%;display:block;margin-top:0.5rem' });
  panel.append(h('h3', null, el.kind === 'scope' ? 'Traces' : 'Spectrum'), cv, plotSaveRow(cv));
  bindSync(cv, () => { if (el.kind === 'scope') drawScope(cv, el); else drawSpectrum(cv, el); });
  panel.append(helpLine(el.kind === 'scope' ? 'Channel 1 red, channel 2 blue, each on its own scale.' : 'Each tone a peak at its rms level, over the noise.', [el.kind === 'scope'
    ? 'Channel 1 red, channel 2 blue, each on its own scale (channel 1’s on the left, channel 2’s down the right), set as so much a division about an offset (the level at the centre line) or 0 for auto; a band of ±1σ for its noise up to 100 MHz, and a lighter band where a tone is too fast for the span. Normal shows the steady waveform, time starting where the generators’ cycles start; Roll shows the level as the sweeps play, over the last span of their clock (10 s on auto), flat with its bands when nothing changes.'
    : 'Each tone a peak at its rms level, over the noise in the resolution bandwidth (the noise density times it), in dB of a volt; both axes auto (0) or set.'], 'note', 'margin-top:0.35rem'));
}
/* ---------- the optical parts' electrical side, on the bench and in their panels ---------- */
function elecDrawExtras(el) {
  const X = elecExtra(el);
  if (!X.length) return;
  const base = portsOf(el).length - X.length, used = portsInUse(), r = clamp(1.0 * V().scale, 3, 6);
  X.forEach((P, k) => {
    const Q = portWorld(el, base + k), on = used.has(pkey(el.id, base + k));
    ctx.beginPath(); ctx.arc(sx(Q.x), sy(Q.y), r, 0, 2 * Math.PI);
    ctx.fillStyle = on || P.elec === 'out' ? ELEC_YELLOW : portFill(); ctx.fill(); ctx.strokeStyle = ELEC_YELLOW; ctx.lineWidth = 1.4; ctx.stroke();
    keepOffLabel({ x: sx(Q.x) - r - 1, y: sy(Q.y) - r - 1, w: 2 * r + 2, h: 2 * r + 2 });                      // the part's name keeps off the port
    // its name beside it, outside the part, upright
    if (V().scale > 2.2) {
      ctx.save(); ctx.font = clamp(1.7 * V().scale, 8, 11) + 'px ' + getCss('--jek-mono'); ctx.fillStyle = INK;
      const side = Math.abs(Q.dx) > 0.3, X = sx(Q.x), Y = sy(Q.y);
      ctx.textAlign = side ? (Q.dx > 0 ? 'left' : 'right') : 'left'; ctx.textBaseline = side ? 'bottom' : 'middle';
      const tx = side ? X + Q.dx * (r + 3) : X + r + 3, ty = side ? Y - 3 : Y - Q.dy * (r + 4), tw = ctx.measureText(P.name).width, fs = parseFloat(ctx.font);
      ctx.fillText(P.name, tx, ty);
      keepOffLabel({ x: ctx.textAlign === 'right' ? tx - tw : tx, y: side ? ty - fs : ty - fs / 2, w: tw, h: fs + 1 });   // the part's name steps out of its way
      ctx.restore();
    }
  });
}
/* the chopper: its blade across the beam (filled grey where it blocks, open where the slots let light by,
   a slot over the beam as on the bench, the slots its duty of each period) and its motor */
function elecDrawChopper(el, sel) {
  const f = frame(el), L = el.length / 2, k = 1 / V().scale, t = 3 * k;
  const P = 12 * k, open = clamp((el.duty || 50) / 100, 0.05, 0.95) * P;
  ctx.fillStyle = 'rgba(200,205,210,0.55)';
  for (let y = -Math.ceil(L / P) * P + open / 2; y < L; y += P) {
    const a = Math.max(-L, y), b = Math.min(L, y + P - open);
    if (b > a) { pathLocal(f, [[-t, a], [t, a], [t, b], [-t, b]], true); ctx.fill(); }
  }
  pathLocal(f, [[-t, -L], [t, -L], [t, L], [-t, L]], true);
  ctx.strokeStyle = sel ? selInk() : '#c8cdd2'; ctx.lineWidth = sel ? 2.2 : 1.4; ctx.stroke();
  pathLocal(f, [[-2.5, -L - CHOP_HUB], [2.5, -L - CHOP_HUB], [2.5, -L - 0.6], [-2.5, -L - 0.6]], true);
  ctx.fillStyle = bodyFill('#2b3338'); ctx.fill(); ctx.strokeStyle = sel ? selInk() : '#c8cdd2'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
}
function elecChopperPanel(el) {
  panel.append(h('h3', null, 'Optical chopper'));
  panel.append(h('div', { class: 'rt-rows' }, param('Frequency (Hz)', el, 'f'), param('Open (% of cycle)', el, 'duty'),
    param('Phase (°)', el, 'phase'), param('Aperture (mm)', el, 'length')));
  panel.append(readoutBox('chopper'));
  panel.append(h('p', { style: 'margin-top:0.6rem' }, 'A slotted wheel across the beam: open for the first part of each cycle, shut for the rest, with sharp edges. The bench shows it open; photodetectors behind it see the chopped light in their Signal views. Its phase is when in the cycle it opens, against the start of the generators\u2019 cycles (t = 0): 0\u00b0 opens at t = 0, 90\u00b0 a quarter of a cycle later. It matters only against something else on the same clock (another chopper, a generator\u2019s drive); a lock-in referenced to this chopper\u2019s own ref output sees no change, its reference shifting with it.' +
    ' Its ref output is 0 to 5 V, rising as it opens: wire it to a lock-in\u2019s reference.'));
}
/* an optical part's electrical settings and ports, in its panel */
function elecOpticPanel(el) {
  const X = elecExtra(el);
  if (el.type === 'chopper' || (!X.length && !isLaser(el))) return;
  if (!isLaser(el)) panel.append(h('h3', null, 'Electronics'));   // a laser's has its tickbox first
  const rows = h('div', { class: 'rt-rows' });
  let what = '';
  if (isDet(el)) {
    rows.append(selectField('Output', [['tia', 'Photodetector: a voltage, through its amplifier'], ['diode', 'Photodiode: its current, no amplifier']],
      () => el.diode ? 'diode' : 'tia', v => { if (v === 'diode') el.diode = true; else delete el.diode; }, { wide: true }));
    if (el.type === 'detector') rows.append(selectField('Read the light from', [['rays', 'The trace (fast)'], ['field', 'The diffracted field (slow)']],
      () => el.fieldSample ? 'field' : 'rays', v => { if (v === 'field') el.fieldSample = true; else delete el.fieldSample; }, { wide: true }));
    what = 'Its out port carries what it reads to the electronics: ' + (el.diode ? 'the photocurrent (amps), for a TIA or a scope; ' : 'the amplifier’s output (volts); ') +
      'drives on the bench (a chopper, a laser’s modulation, an AOM or EOM) move it as the light follows them.';
 } else if (isLaser(el) && !(el.mmw && el.mmw.tx === 'up')) {
    const tick = h('input', { type: 'checkbox' });
    tick.checked = !!el.ext;
    tick.addEventListener('change', () => {
      checkpoint();
      if (tick.checked) el.ext = true;
      else {
        // its inputs go, and the wires to them
        const n = portsOfOptic(el).length;
        project.fibres = (project.fibres || []).filter(F => !(F.wire && F.b[0] === el.id && F.b[1] >= n));
        delete el.ext;
      }
      changed(true);
    });
    panel.append(h('h3', null, 'Electronics'));
    panel.append(h('label', { class: 'rt-check' }, tick, 'External control: modulation inputs for its power and frequency'));
    if (!el.ext) return;
    if (el.modk === undefined) el.modk = 100;
    if (el.fmk === undefined) el.fmk = 1;
    rows.append(param('Power modulation (% per V)', el, 'modk'), param('Frequency tuning (GHz per V)', el, 'fmk'));
    what = 'Its mod input sets the power: P = P₀ (1 + m v), never below zero. Its fm input tunes its frequency: Δν = k v (its wavelength shortens as the frequency rises), so a cell’s line, a cavity or an etalon turns it into a change in power.';
  } else {
    const key = isLaser(el) ? 'modk' : el.kind === 'aom' || el.type === 'aom' ? 'vsat' : 'vpi', d = { modk: 100, vsat: 1, vpi: 5 }[key];
    if (el[key] === undefined) el[key] = d;
    rows.append(param({ modk: 'Modulation (% per V)', vsat: 'RF in for full efficiency (V)', vpi: 'Vπ (V)' }[key], el, key, { wide: true }));
    what = { modk: 'Its mod input sets the power: P = P₀ (1 + m v), never below zero.',
      vsat: 'Its rf input sets the RF level: the diffracted share is the efficiency set times sin²(π v / 2 V_full), so 0 V diffracts nothing.',
      vpi: el.emode === 'amplitude' ? 'Its mod input adds to the bias: v = Vπ moves it 180°.' : 'Its ' + ((X.find(P => P.elec === 'in') || {}).name || 'mod') + ' input adds a phase of π v / Vπ to the light through it (seen where it interferes).' }[key];
  }
  panel.append(rows);
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, what + ' Slow drives are worked out quasi-statically: the bench is traced again across the drive’s swing.'));
}

export const ELEC_UI = {
  draw: elecDraw,
  panelFor: elecPanelFor,
  wirePanel: elecWirePanel,
  drawExtras: elecDrawExtras,
  drawChopper: elecDrawChopper,
  chopperPanel: elecChopperPanel,
  opticPanel: elecOpticPanel,
  api: {
  signal(name, j) {
    const el = project.elements.find(e => e.name === name);
    let S = null;
    if (el && el.type === 'elec') S = signalOf(el, j || 0);
    else if (el) {                                         // an optical part's j-th electrical output
      const X = elecExtra(el), o = X.map((P, k) => [P, k]).filter(([P]) => P.elec === 'out')[j || 0];
      S = o ? solve().out.get(pkey(el.id, portsOf(el).length - X.length + o[1])) || null : null;
    }
    return S && { dc: S.dc, unit: S.unit, tones: S.tones.map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re) })), psd: f => elecPsdAt(S, f), rms: (f1, f2) => elecNoiseRms(S, f1, f2) };
  },
  notes(name) { const el = project.elements.find(e => e.name === name); return el ? solve().warn.get(el.id) || [] : null; },
  lockin(name) { const el = project.elements.find(e => e.name === name); const L = el && solve().lock.get(el.id); return L ? Object.assign({}, L, { outX: undefined, outY: undefined }) : null; },
  scope(name) { const el = project.elements.find(e => e.name === name), cv = document.createElement('canvas'); document.body.append(cv); const T = drawScope(cv, el); cv.remove(); return T.map(t => t && { v: t.v ? Array.from(t.v) : null, rows: t.rows || null, sd: t.sd, band: t.band, range: t.range }); },
  spectrum(name) { const el = project.elements.find(e => e.name === name), cv = document.createElement('canvas'); document.body.append(cv); const R = drawSpectrum(cv, el); cv.remove(); return R.tones; },
},
};

/* what is drawn inside a box or circle, turned half round when the part is (its angle past
   90 degrees either way), so it never reads upside down; the outline and leads turn with the part */
export let FLIP = false;

const inner = (c, fn) => { if (!FLIP) return fn(); c.save(); c.rotate(Math.PI); fn(); c.restore(); };
