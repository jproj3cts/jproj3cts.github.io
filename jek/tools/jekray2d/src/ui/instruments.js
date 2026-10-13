import { cdotc } from '../core/maths.js';
import { fmtHz, fmtMw, fmtTime } from '../core/format.js';
import { C_MM } from '../core/modulators.js';
import { pdResp, responsivity } from '../core/rf.js';
import { cohGamma, splitRoot } from '../core/coherence.js';
import { deg } from '../state/project.js';
import { benchNms } from '../state/elements.js';
import { lastTrace, loadGen } from '../engines/trace.js';
import { arrivalField, arrivalWindow, detectorReading, deviceMemo, faceArrivals } from '../engines/fibre-face.js';
import { netPower } from '../engines/fibre.js';
import { ELEC } from '../engines/elec.js';
import { bindSync, fid, h, panel, param, setFid, vs } from './panel.js';
import { axisFont, drawAxes, plotArea, plotCsv, plotSaveRow } from './plots.js';
import { detectorFieldResult, viaCavity } from '../engines/pd-cavity.js';

/* ==========================================================================
   Instruments: one oscilloscope and one spectrum analyser view, drawn the same wherever a
   signal is looked at (the electronics' scope and analyser, a photodetector's own Signal
   section). A signal is a DC level, tones (each a frequency and complex amplitude c, the
   signal Re(c e^{i 2 pi f t}); a tone marked incoh, two lasers beating, has no steady phase)
   and a noise density on ELEC's frequency grid, in volts or amps.
   The scope: Normal rebuilds the steady-state waveform from the tones over the time span, a
   tone too fast for the span filling a band as on a real scope, with +-1 sigma of noise round
   it; Roll draws the level recorded as the sweeps play over the last span of the sweep clock,
   flat with the same bands when nothing changes. Time: auto (three periods of the slowest
   tone) or a span; each channel's vertical scale auto or volts a division and an offset (the
   level at the centre line), on eight divisions. The analyser: each tone at its rms level
   over the noise in the resolution bandwidth, in dB of a volt (or an amp), on a log or linear
   frequency axis, both axes auto or set.
   ========================================================================== */
export const INST = (() => {
  const fmtSig = (v, u) => ELEC.fmtSig(v, u);
  const CH = ['#db3550', '#0092b2'];   // Jek red, Jek blue
  const BW = 1e8;                      // the scope's own bandwidth, for its noise band
  const DIV_X = 10, DIV_Y = 8;
  /* Roll runs on the real clock: the level each channel had, recorded at every redraw while a
     Roll view is showing ([seconds, dc]), the tones laid on it at the moment each sample stands
     for, so a 1 kHz wave rolls past as it would on a bench scope */
  const wallT = () => performance.now() / 1000;
  const hist = new Map();
  let histGen = -1;
  function record(key, dc) {
    if (histGen !== loadGen) { hist.clear(); histGen = loadGen; }   // a bench loaded: its scopes start afresh
    let H = hist.get(key);
    if (!H) hist.set(key, H = []);
    const t = wallT();
    if (H.length && H[H.length - 1][1] === dc) { H[H.length - 1][2] = t; return; }       // unchanged: the last entry lasts longer
    H.push([t, dc, t]);
    while (H.length > 20000 || (H.length && H[0][2] < t - 3600)) H.shift();
  }
  // the level a channel had at time t: the last recorded at or before it (the first, before any)
  function levelAt(H, t, now) {
    if (!H || !H.length) return now;
    let lo = 0, hi = H.length - 1;
    if (t < H[0][0]) return H[0][1];
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (H[m][0] <= t) lo = m; else hi = m - 1; }
    return H[lo][1];
  }
  /* the views in Roll, redrawn every frame while they are on the page */
  const rolling = new Map();
  let rollRaf = 0;
  function rollTick() {
    rollRaf = -1;                                   // drawing: the views asking again are already in hand
    for (const [cv, fn] of [...rolling]) { if (!cv.isConnected) { rolling.delete(cv); continue; } fn(); }
    rollRaf = rolling.size ? requestAnimationFrame(rollTick) : 0;
  }
  const autoSpan = S => { const f = S && S.tones.filter(t => !t.incoh && t.f > 0).map(t => t.f); return f && f.length ? 3 / Math.min(...f) : 1e-3; };
  /* one channel over a span: the trace, the band of tones too fast to draw, the noise */
  function trace(S, span, N) {
    const dt = span / (N - 1), slow = [], fast = [];
    for (const q of S.tones) (q.incoh || q.f * dt >= 0.25 ? fast : slow).push(q);
    // a long series (a square's harmonics) smoothed by Lanczos's sigma factors, so its truncation does not ring
    const lz = slow.length >= 10 ? Math.min(...slow.map(q => q.f)) + Math.max(...slow.map(q => q.f)) : 0;
    const sg = slow.map(q => { const u = lz ? Math.PI * q.f / lz : 0; return u ? Math.sin(u) / u : 1; });
    const v = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const t = k * dt; let x = S.dc;
      slow.forEach((q, j) => { const a = 2 * Math.PI * q.f * t; x += sg[j] * (q.re * Math.cos(a) - q.im * Math.sin(a)); });
      v[k] = x;
    }
    // a fast tone that is a low harmonic of one drawn (a square's or a comparator's edges) is the sharpness of an edge the trace
    // already draws as steep as a pixel allows, not a band: only the rest (a fast carrier, light beating) is drawn as one
    const f1 = slow.length ? Math.min(...slow.filter(q => !q.incoh).map(q => q.f)) : 0;
    const edge = q => !q.incoh && f1 > 0 && q.f / f1 <= 200 && Math.abs(q.f / f1 - Math.round(q.f / f1)) < 1e-6;
    const band = fast.filter(q => !edge(q)).reduce((a, q) => a + Math.hypot(q.re, q.im), 0);
    return { v, band, sd: S.psd ? ELEC.noiseRms(S, 1 / span, BW) : 0, unit: S.unit === 'A' ? 'A' : 'V' };
  }
  /* the scope. chans: [{ S, key, name }] (S null for an open input); st: { mode, span, ch: [{ vdiv, off }] }.
     Returns, per channel, { v, band, sd, unit } as drawn (Normal), or the recorded rows (Roll). */
  function scope(cv, chans, st, title, redraw) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 170, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const roll = st.mode === 'roll', N = 1200, first = chans.find(q => q.S);
    // auto: three cycles of the slowest tone; in Roll with no tones, the last ten seconds
    const toned = first && first.S.tones.some(t => !t.incoh && t.f > 0);
    const span = st.span > 0 ? st.span : roll && !toned ? 10 : autoSpan(first && first.S);
    // each channel as drawn: Normal from its tones over the span from t = 0; Roll over the last span of
    // the real clock, its level as recorded and its tones at each sample's own moment
    if (roll && redraw) { rolling.set(cv, redraw); if (!rollRaf) rollRaf = requestAnimationFrame(rollTick); } else rolling.delete(cv);
    const t1 = wallT();
    const tr = chans.map(q => {
      if (!q.S) return null;
      const T = trace(q.S, span, N);
      if (!roll) return T;
      record(q.key, q.S.dc);
      const H = hist.get(q.key), dt = span / (N - 1), slow = q.S.tones.filter(x => !x.incoh && x.f * dt < 0.25);
      const lz = slow.length >= 10 ? Math.min(...slow.map(x => x.f)) + Math.max(...slow.map(x => x.f)) : 0;
      const sg = slow.map(x => { const u = lz ? Math.PI * x.f / lz : 0; return u ? Math.sin(u) / u : 1; });
      const rows = Array.from({ length: N }, (_, k) => {
        const t = t1 - (N - 1 - k) * dt;   // the last sample is now
        let v = levelAt(H, t, q.S.dc);
        slow.forEach((x, j) => { const a = 2 * Math.PI * x.f * t; v += sg[j] * (x.re * Math.cos(a) - x.im * Math.sin(a)); });
        return [k * dt, v, T.band, T.sd];
      });
      return { rows, unit: T.unit, band: T.band, sd: T.sd };
    });
    // each channel's vertical range: set (offset +- 4 divisions) or fitted to its own trace and bands
    const range = (T, set) => {
      if (set && set.vdiv > 0) return [set.off - DIV_Y / 2 * set.vdiv, set.off + DIV_Y / 2 * set.vdiv];
      const vals = roll ? T.rows.flatMap(r => [r[1] - r[2] - r[3], r[1] + r[2] + r[3]]) : [Math.min(...T.v) - T.band - T.sd, Math.max(...T.v) + T.band + T.sd];
      let lo = Math.min(...vals), hi = Math.max(...vals);
      // a trace with no swing at all (a steady level, no noise) sits mid-screen with a tenth of its level either side
      const flat = !(hi - lo > 1e-12 * Math.max(1e-12, Math.abs(lo), Math.abs(hi)));
      // and a ripple under a percent of the level is not blown up to fill the screen: drawn flat at the level, as a bench scope's
      // eight bits would show it
      const mid = (lo + hi) / 2, half = Math.max((hi - lo) / 2, flat ? Math.max(0.1 * Math.abs(mid), 1e-3) : 0.01 * Math.abs(mid), 1e-9 * Math.max(1, Math.abs(mid)));
      const r = half > (hi - lo) / 2 ? [mid - half, mid + half] : [lo - 0.08 * (hi - lo), hi + 0.08 * (hi - lo)];
      r.swing = hi - lo; r.mid = mid;
      return r;
    };
    const rg = tr.map((T, i) => T ? range(T, st.ch && st.ch[i]) : null), fi = tr.findIndex(Boolean);
    // two channels in one unit, both on auto, on comparable scales (two lock-in outputs, say): one scale for both, so each sits
    // at its own height rather than both filling the screen; a channel whose swing would shrink to a sliver keeps its own
    const autoCh = i => !(st.ch && st.ch[i] && st.ch[i].vdiv > 0);
    let shared = false;
    if (tr[0] && tr[1] && tr[0].unit === tr[1].unit && autoCh(0) && autoCh(1)) {
      const lo = Math.min(rg[0][0], rg[1][0]), hi = Math.max(rg[0][1], rg[1][1]);
      // each either flat at this scale (its swing under a percent of its level) or still filling a third of the screen
      if (rg.every(r => r.swing <= 0.01 * Math.abs(r.mid) || r.swing >= (hi - lo) / 3)) { const m = 0.08 * (hi - lo); rg[0] = rg[1] = [lo - m, hi + m]; shared = true; }
    }
    tr.forEach((T, i) => { if (T) T.range = rg[i]; });
    // a small swing on a large level, auto-scaled, is read as an offset and the swing about it
    const off = rg.map((r, i) => r && !(st.ch && st.ch[i] && st.ch[i].vdiv > 0) && Math.abs(r[0] + r[1]) / 2 > 500 * (r[1] - r[0]) ? (r[0] + r[1]) / 2 : 0);
    const u0 = fi >= 0 ? tr[fi].unit : 'V', two = tr.filter(Boolean).length > 1, set0 = fi >= 0 && st.ch && st.ch[fi] && st.ch[fi].vdiv > 0;
    const [lo, hi] = fi >= 0 ? rg[fi].map(v => v - off[fi]) : [-1, 1];
    const sy = { kind: 'plain', title: (two ? (shared ? 'ch1, ch2 ' : 'ch' + (fi + 1) + ' ') : '') + (set0 ? fmtSig(st.ch[fi].vdiv, u0) + '/div' : u0) + (off[fi] ? ', swing about the level' : ''),
      fmt: v => Math.abs(v) < 1e-9 * Math.max(1e-15, Math.abs(hi - lo)) ? fmtSig(off[fi] || 0, u0) : (off[fi] && v > 0 ? '+' : off[fi] ? '\u2212' : v < 0 ? '-' : '') + fmtSig(Math.abs(v), u0) };
    const sx = { kind: 's', title: roll ? 'time, last ' + fmtTime(span) + ' (rolling)' : 'time' };
    const A = plotArea(c, w, hgt, [lo, hi], sy);
    const X = t => A.l + t / span * A.w;
    // the graticule: ten divisions across, eight up
    c.strokeStyle = 'rgba(0,0,0,0.07)'; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i < DIV_X; i++) { const x = Math.round(A.l + A.w * i / DIV_X) + 0.5; c.moveTo(x, A.t); c.lineTo(x, A.t + A.h); }
    for (let i = 1; i < DIV_Y; i++) { const y = Math.round(A.t + A.h * i / DIV_Y) + 0.5; c.moveTo(A.l, y); c.lineTo(A.l + A.w, y); }
    c.stroke();
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    tr.forEach((T, i) => {
      if (!T) return;
      const [a, b] = rg[i], Y = v => A.t + A.h - (v - a) / (b - a) * A.h, col = CH[i] || CH[0];
      const pts = roll ? T.rows.map(r => [X(r[0]), r[1], r[2], r[3]]) : Array.from(T.v, (v, k) => [X(span * k / (N - 1)), v, T.band, T.sd]);
      const fill = (w0, alpha) => { c.fillStyle = col + alpha; c.beginPath(); pts.forEach(([x, v, bd, sd]) => c.lineTo(x, Y(v + w0(bd, sd)))); for (let k = pts.length - 1; k >= 0; k--) { const [x, v, bd, sd] = pts[k]; c.lineTo(x, Y(v - w0(bd, sd))); } c.fill(); };
      if (pts.some(p => p[2] > 0)) fill((bd, sd) => bd + sd, '26');        // tones too fast to draw, and the noise round them
      if (pts.some(p => p[3] > 0)) fill((bd, sd) => sd, '40');            // the noise, +-1 sigma
      c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath();
      pts.forEach(([x, v], k) => k ? c.lineTo(x, Y(v)) : c.moveTo(x, Y(v))); c.stroke();
    });
    c.restore();
    drawAxes(c, A, [0, span], [lo, hi], sx, sy, { noGrid: true });
    // a second channel's scale down the right-hand edge, in its colour
    const other = two && !shared ? 1 - fi : -1;
    if (other >= 0) {
      const [a, b] = rg[other], u = tr[other].unit, o = off[other], set = st.ch && st.ch[other] && st.ch[other].vdiv > 0;
      const sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtSig(Math.abs(v), u);
      c.save(); c.fillStyle = CH[other]; c.font = axisFont(); c.textAlign = 'right';
      for (const q of [0, 0.5, 1]) {
        c.textBaseline = q === 1 ? 'top' : q === 0 ? 'bottom' : 'middle';
        const v = a + (b - a) * q;
        c.fillText(q === 1 && set ? fmtSig(st.ch[other].vdiv, u) + '/div' : o ? (q === 0.5 ? fmtSig(o, u) : sg(v - o)) : fmtSig(v, u), A.l + A.w - 3, A.t + A.h - q * A.h);
      }
      c.restore();
    }
    // the numbers behind it
    if (roll) plotCsv(cv, title + ' (roll)', ['time_s', ...chans.flatMap((q, i) => tr[i] ? [q.name + '_' + tr[i].unit, q.name + '_band', q.name + '_noise_sd'] : [])],
      () => (tr[fi] ? tr[fi].rows : []).map((r, k) => [r[0], ...tr.flatMap(T => T ? (T.rows[k] || T.rows[T.rows.length - 1]).slice(1) : [])]));
    else {
      const one = chans.length === 1, T0 = tr[0];
      const cols = one ? ['time_s', 'output_' + u0, ...(T0 && T0.band > 0 ? ['band_low_' + u0, 'band_high_' + u0] : []), ...(T0 && T0.sd > 0 ? ['noise_sd_' + u0] : [])]
        : ['time_s', ...chans.map((q, i) => q.name + (tr[i] ? '_' + tr[i].unit : ''))];
      plotCsv(cv, title + ' traces', cols, () => Array.from({ length: N }, (_, k) => {
        const t = span * k / (N - 1);
        if (!one) return [t, ...tr.map(T => T ? T.v[k] : '')];
        if (!T0) return [t, ''];
        return [t, T0.v[k], ...(T0.band > 0 ? [T0.v[k] - T0.band, T0.v[k] + T0.band] : []), ...(T0.sd > 0 ? [T0.sd] : [])];
      }));
    }
    return tr;
  }
  /* the analyser: one signal; st: { scale: 'log' | 'linear', fmin, fmax (0: auto), rbw, ref, dbdiv (0: auto) } */
  function spectrum(cv, S, st, title) {
    rolling.delete(cv);
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 170, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const log = st.scale !== 'linear', rbw = Math.max(1e-3, st.rbw || 1000), dB = v => 10 * Math.log10(Math.max(v, 1e-30)), u = S && S.unit === 'A' ? 'A' : 'V';
    const fs = S ? S.tones.filter(t => t.f > 0).map(t => t.f) : [];
    // the frequency span: set, or round the tones (a decade either side on log, from 0 on linear)
    let f1 = st.fmin > 0 ? st.fmin : log ? (fs.length ? Math.min(...fs) / 10 : 10) : 0;
    let f2 = st.fmax > 0 ? st.fmax : fs.length ? Math.max(...fs) * (log ? 10 : 1.15) : 1e6;
    if (log) { f1 = Math.max(1e-2, Math.min(f1, f2 / 10)); f2 = Math.min(1e10, Math.max(f2, f1 * 10)); } else if (!(f2 > f1)) f2 = f1 + 1;
    const xOf = f => log ? Math.log10(f) : f, x1 = xOf(Math.max(f1, log ? 1e-2 : 0)), x2 = xOf(f2), N = 400;
    const fAt = k => log ? Math.pow(10, x1 + (x2 - x1) * k / (N - 1)) : f1 + (f2 - f1) * k / (N - 1);
    const floor = S && S.psd ? Array.from({ length: N }, (_, k) => dB(ELEC.psdAt(S, Math.max(fAt(k), 1e-2)) * rbw)) : [];
    const tones = S ? S.tones.filter(t => t.f >= f1 && t.f <= f2).map(t => ({ f: t.f, db: dB((t.re * t.re + t.im * t.im) / 2), incoh: t.incoh })) : [];
    // the level span: set (the top and dB a division, ten down), or fitted
    let lo, hi;
    if (st.dbdiv > 0) { hi = st.ref; lo = st.ref - 10 * st.dbdiv; }
    else {
      hi = Math.ceil((Math.max(-200, ...floor, ...tones.map(t => t.db)) + 6) / 10) * 10;
      lo = Math.max(hi - 140, Math.floor((Math.min(...floor, ...tones.map(t => t.db), hi - 20) - 6) / 10) * 10);
      if (!isFinite(hi)) { hi = 0; lo = -140; }
    }
    const sy = { kind: 'plain', title: 'dB' + u + (st.dbdiv > 0 ? ', ' + st.dbdiv + ' dB/div' : '') };
    const sx = log ? { kind: 'plain', title: 'frequency', fmt: v => Math.abs(v - Math.round(v)) < 1e-9 ? fmtHz(Math.pow(10, Math.round(v))) : '' } : { kind: 'hz', title: 'frequency' };
    const A = plotArea(c, w, hgt, [lo, hi], sy);
    const X = f => A.l + (xOf(f) - x1) / (x2 - x1) * A.w, Y = v => A.t + A.h - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * A.h;
    plotCsv(cv, title + ' spectrum', ['frequency_Hz', 'level_dB' + u, 'kind'], () => [...floor.map((v, k) => [fAt(k), v, 'noise in RBW']), ...tones.map(t => [t.f, t.db, t.incoh ? 'tone, two lasers' : 'tone'])]);
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    c.strokeStyle = CH[0]; c.lineWidth = 1.4; c.beginPath();
    floor.forEach((v, k) => { const x = A.l + k / (N - 1) * A.w; k ? c.lineTo(x, Y(v)) : c.moveTo(x, Y(v)); }); c.stroke();
    c.lineWidth = 1.8;
    for (const t of tones) {
      const x = X(t.f), base = S.psd ? dB(ELEC.psdAt(S, t.f) * rbw) : lo;
      c.strokeStyle = t.incoh ? CH[1] + '80' : CH[1];
      c.beginPath(); c.moveTo(x, Y(Math.max(base, lo))); c.lineTo(x, Y(t.db)); c.stroke();
    }
    c.restore();
    drawAxes(c, A, [x1, x2], [lo, hi], sx, sy);
    return { tones, rbw, floor, f1, f2 };
  }
  /* the settings rows for a view, from a settings object kept wherever the caller keeps it */
  // a view's own number: changing it is not an edit of the bench (no undo step); blank is auto (0)
  function viewNum(id, get, set, auto) {
    const inp = h('input', { id, type: 'text', inputmode: 'decimal', spellcheck: 'false', placeholder: auto ? 'auto' : '' });
    const show = () => { const v = get(); inp.value = auto && !v ? '' : String(+(+v || 0).toPrecision(6)); };
    show();
    inp.addEventListener('change', () => { const r = inp.value.trim(), v = r === '' ? 0 : Number(r); if (isFinite(v)) set(v); show(); });
    return inp;
  }
  const blankNum = (id, get, set) => viewNum(id, get, set, true);
  const plainNum = (id, get, set) => viewNum(id, get, set, false);
  function field(label, inp) { const id = inp.id; return h('div', { class: 'rt-f' }, h('label', { for: id }, label), inp); }
  function scopeControls(st, nCh, redraw) {
    const sel = h('select', { id: 'rtf' + (setFid(fid + 1)) }, h('option', { value: 'normal' }, 'Normal'), h('option', { value: 'roll' }, 'Roll'));
    sel.value = st.mode === 'roll' ? 'roll' : 'normal';
    sel.addEventListener('change', () => { st.mode = sel.value; redraw(true); });
    const rows = h('div', { class: 'rt-rows' }, field('Mode', sel),
      field('Time span (s)', blankNum('rtf' + (setFid(fid + 1)), () => st.span, v => { st.span = Math.max(0, v); redraw(); })));
    st.ch = st.ch || [];
    for (let i = 0; i < nCh; i++) {
      const c = st.ch[i] || (st.ch[i] = { vdiv: 0, off: 0 }), nm = nCh > 1 ? 'Ch' + (i + 1) + ' ' : '';
      rows.append(field(nm + 'Per division', blankNum('rtf' + (setFid(fid + 1)), () => c.vdiv, v => { c.vdiv = Math.max(0, v); redraw(); })),
        field(nm + 'Offset', plainNum('rtf' + (setFid(fid + 1)), () => c.off, v => { c.off = v; redraw(); })));
    }
    return rows;
  }
  function spectrumControls(st, redraw) {
    const sel = h('select', { id: 'rtf' + (setFid(fid + 1)) }, h('option', { value: 'linear' }, 'Linear'), h('option', { value: 'log' }, 'Log'));
    sel.value = st.scale === 'log' ? 'log' : 'linear';
    sel.addEventListener('change', () => { st.scale = sel.value; redraw(true); });
    return h('div', { class: 'rt-rows' }, field('Frequency axis', sel),
      field('Resolution bandwidth (Hz)', plainNum('rtf' + (setFid(fid + 1)), () => st.rbw, v => { if (v > 0) { st.rbw = v; redraw(); } })),
      field('From (Hz)', blankNum('rtf' + (setFid(fid + 1)), () => st.fmin, v => { st.fmin = Math.max(0, v); redraw(); })),
      field('To (Hz)', blankNum('rtf' + (setFid(fid + 1)), () => st.fmax, v => { st.fmax = Math.max(0, v); redraw(); })),
      field('dB per division', blankNum('rtf' + (setFid(fid + 1)), () => st.dbdiv, v => { st.dbdiv = Math.max(0, v); redraw(); })),
      field('Top (dB)', plainNum('rtf' + (setFid(fid + 1)), () => st.ref, v => { st.ref = v; redraw(); })));
  }
  return { CH, scope, spectrum, record, trace, scopeControls, spectrumControls, autoSpan };
})();

/* tones from pairs [{fo, dl, E, root, key, nm}]: same launch pairs at different offsets, and different lasers */
function beatTones(parts) {
  const tones = new Map(), add = (f, re, im, incoh) => {
    const k = (incoh ? 'x' : '') + Math.round(f);
    const t = tones.get(k) || { f, re: 0, im: 0, incoh }; t.re += re; t.im += im; tones.set(k, t);
  };
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    let a = parts[i], b = parts[j];
    if (a.key === b.key) {
      if (a.fo === b.fo) continue;
      if (a.fo > b.fo) [a, b] = [b, a];
      // the fields go as e^{i w t}: the power holds 2 Re[conj(E_a) E_b e^{i (w_b - w_a) t}], so
      // the beat's phase is that of conj(E_a) E_b (cdotc gives E_a conj(E_b))
      const g = cohGamma(a.root), c = cdotc(a.E, b.E), w = 2 * (g ? g(a.dl - b.dl) : 1) * (a.root.power || 0);
      add(b.fo - a.fo, w * c[0], -w * c[1], false);
    } else if (a.root !== b.root) {
      // two lasers: their difference in frequency, with the offsets
      let df = C_MM / (b.nm * 1e-6) + b.fo - (C_MM / (a.nm * 1e-6) + a.fo);
      if (df < 0) { [a, b] = [b, a]; df = -df; }
      if (df > 1e12) continue;
      const c = cdotc(a.E, b.E), w = 2 * Math.sqrt((a.root.power || 0) * (b.root.power || 0));
      add(df, w * Math.hypot(c[0], c[1]), 0, true);
    }
  }
  return [...tones.values()].map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re), incoh: t.incoh })).filter(t => t.amp > 1e-12).sort((x, y) => x.f - y.f);
}
/* a fibre photodiode's light, as parts */
/* the light on a fibre photodetector, mW: a balanced one's second input taken from its first */
export function pdNetMw(el) {
  const net = lastTrace.net;
  if (!net) return 0;
  const p = netPower(net.pd.get(el.id), net.keys);
  return el.balanced ? p - netPower(net.pd.get(el.id + '~'), net.keys) : p;
}
function fibrePdParts(el, minus) {
  const net = lastTrace.net, out = [];
  if (!net) return out;
  const byG = net.pd.get(el.id + (minus ? '~' : ''));
  if (!byG) return out;
  // broadband light (an amplifier's ASE, an LED's slices) makes no beat notes: its noise is counted apart
  for (const K of net.keys) if (!K.root.ase && !K.root.slice) for (const w of byG.get(K.gk) || []) out.push({ fo: w.fo || 0, dl: w.dl, E: w.E, root: K.root, key: K.gk, nm: K.nm });
  return out;
}
/* a free-space photodiode's light: each arriving beam's field summed over the diode against
   each other's, a pair at a time. Its parts' E are then the pair integrals' square roots, so
   they are handled here directly */
function freePdTones(el, coarse) {
  const arr = faceArrivals(el);
  if (arr.length < 2) return [];
  const a = el.length / 2, [u0, u1, v0, v1] = arrivalWindow(arr, a);
  if (!(u1 > u0) || !(v1 > v0)) return [];
  const N = coarse ? 32 : 64, du = (u1 - u0) / N, dv = (v1 - v0) / N, pts = [];   // (coarse: meanwhile, the cavity's field on its way)
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const u = u0 + (i + 0.5) * du, v = v0 + (j + 0.5) * dv; if (u * u + v * v <= a * a) pts.push([u, v]); }
  const key = A => A.coh.replace(/@[^#]*/, ''), root = A => splitRoot(A.src), dA = du * dv;
  // beams of one fully coherent laser at one offset do not beat with each other, and every pair
  // of them across two offsets is weighted alike: their fields are summed first and the sums
  // paired (a cavity's dozens of round trips become one beam a sideband). A laser of finite
  // coherence weighs each pair by its delay, so its beams stay apart; so do pairs across lasers,
  // each adding its own magnitude
  const groups = new Map();
  arr.forEach((A, i) => {
    const k = cohGamma(root(A)) ? 'i' + i : key(A) + '|' + A.fo;
    const g = groups.get(k);
    if (g) { g.mem.push(i); return; }
    groups.set(k, { A, mem: [i] });
  });
  const Fi = arr.map(A => pts.map(([u, v]) => arrivalField(A, u, v)));
  const G = [...groups.values()];
  const F = G.map(g => g.mem.length === 1 ? Fi[g.mem[0]] : Fi[g.mem[0]].map((_, k) => { const t = [0, 0, 0, 0]; for (const m of g.mem) for (let c = 0; c < 4; c++) t[c] += Fi[m][k][c]; return t; }));
  const pairInt = (FA, FB) => { let re = 0, im = 0; for (let k = 0; k < pts.length; k++) { const c = cdotc(FA[k], FB[k]); re += c[0]; im += c[1]; } return [re * dA, im * dA]; };
  const tones = new Map(), add = (f, re, im, incoh) => {
    const k = (incoh ? 'x' : '') + Math.round(f), t = tones.get(k) || { f, re: 0, im: 0, incoh }; t.re += re; t.im += im; tones.set(k, t);
  };
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
    let A = G[i].A, B = G[j].A;
    const same = key(A) === key(B);
    if (same && A.fo === B.fo) continue;
    if (!same && root(A) === root(B)) continue;
    let re, im;
    if (same) {
      [re, im] = pairInt(F[i], F[j]);
      if (A.fo > B.fo) { [A, B] = [B, A]; im = -im; }
      // re + i im is now <E_A conj(E_B)>, A the lower: the beat's phase is its conjugate's
      const g = cohGamma(root(A)), w = 2 * (g ? g(A.gpl + A.lag - B.gpl - B.lag) : 1) * (root(A).power || 0);
      add(B.fo - A.fo, w * re, -w * im, false);
    } else {
      let df = C_MM / (B.nm * 1e-6) + B.fo - (C_MM / (A.nm * 1e-6) + A.fo);
      if (Math.abs(df) > 1e12) continue;
      // two lasers: each pair of their beams on its own, as before
      let m = 0;
      for (const p of G[i].mem) for (const q of G[j].mem) { const [r2, i2] = pairInt(Fi[p], Fi[q]); m += Math.hypot(r2, i2); }
      add(Math.abs(df), 2 * Math.sqrt((root(A).power || 0) * (root(B).power || 0)) * m, 0, true);
    }
  }
  return [...tones.values()].map(t => ({ f: t.f, amp: Math.hypot(t.re, t.im), ph: Math.atan2(t.im, t.re), incoh: t.incoh })).filter(t => t.amp > 1e-12).sort((x, y) => x.f - y.f);
}
/* An optical spectrum analyser's view: each launch reaching it as a line at its wavelength, as
   wide as its own line (lambda^2 / coherence length: a laser's narrow, an LED's or a slice of
   ASE broad), seen through the analyser's resolution: a Gaussian of width sqrt(line^2 + rbw^2)
   holding the line's power, so a line narrower than the resolution peaks at its power and a
   broad one at its power in a resolution bandwidth. */
export function osaLines(el) {
  const net = lastTrace.net, out = [];
  if (!net) return out;
  const byG = net.pd.get(el.id);
  for (const K of net.keys) {
    const m = netPower(byG, [K]);
    if (!(m > 1e-15)) continue;
    const w = K.root.coh > 0 ? K.nm * K.nm * 1e-6 / K.root.coh : 0, k = K.nm.toFixed(5) + '|' + w.toPrecision(4);
    const q = out.find(x => x.k === k);
    if (q) q.mw += m; else out.push({ k, nm: K.nm, mw: m, w, name: K.root.name || '' });
  }
  return out.sort((a, b) => a.nm - b.nm);
}
export function osaTrace(el, lines, lo, hi, n) {
  const rbw = Math.max(1e-6, el.rbw), xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const x = lo + (hi - lo) * i / (n - 1);
    let p = 0;
    for (const L of lines) { const W = Math.hypot(L.w, rbw); p += L.mw * rbw / W * Math.exp(-4 * Math.LN2 * ((x - L.nm) / W) ** 2); }
    xs.push(x); ys.push(p);
  }
  return { xs, ys };
}
/* its span: as set, or every line with three of its widths either side (at least 40 resolutions) */
export function osaSpan(el, lines) {
  const rbw = Math.max(1e-6, el.rbw);
  let lo = el.wmin, hi = el.wmax;
  if (lo > 0 && hi > lo) return [lo, hi];
  if (lines.length) { lo = Math.min(...lines.map(L => L.nm - 3 * Math.hypot(L.w, rbw))); hi = Math.max(...lines.map(L => L.nm + 3 * Math.hypot(L.w, rbw))); }
  else { lo = 1500; hi = 1600; }
  const mid = (lo + hi) / 2, half = Math.max((hi - lo) / 2, 20 * rbw);
  return [mid - half, mid + half];
}
export function osaSection(el) {
  panel.append(h('h3', null, 'Spectrum'));
  const cv = h('canvas', { height: '190', style: 'width:100%;display:block' });
  panel.append(cv, plotSaveRow(cv));
  bindSync(cv, () => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 190, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const lines = osaLines(el), [lo, hi] = osaSpan(el, lines);
    const top = el.ref, bot = el.ref - 10 * Math.max(0.1, el.dbdiv), T = osaTrace(el, lines, lo, hi, 600);
    const dbm = p => p > 0 ? 10 * Math.log10(p) : -1e9;
    const sy = { kind: 'plain', title: 'dBm' }, sx = { kind: 'plain', title: 'wavelength, nm' };
    const A = plotArea(c, w, hgt, [bot, top], sy), X = x => A.l + (x - lo) / (hi - lo) * A.w, Y = v => A.t + A.h - (Math.max(bot, Math.min(top, v)) - bot) / (top - bot) * A.h;
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    c.strokeStyle = '#db3550'; c.lineWidth = 1.5; c.beginPath();
    T.xs.forEach((x, i) => { const y = Y(dbm(T.ys[i])); i ? c.lineTo(X(x), y) : c.moveTo(X(x), y); }); c.stroke(); c.restore();
    drawAxes(c, A, [lo, hi], [bot, top], sx, sy);
    plotCsv(cv, el.name + ' spectrum', ['wavelength_nm', 'power_dBm'], () => T.xs.map((x, i) => [x, T.ys[i] > 0 ? 10 * Math.log10(T.ys[i]) : '']));
  });
}
/* a balanced detector's tones: the first input's less the second's, as fields at each
   frequency (a beat between unrelated lasers, with no phase to it, adds in power) */
function balancedTones(A, B) {
  const m = new Map();
  for (const [L, sg] of [[A, 1], [B, -1]]) for (const t of L) {
    const k = (t.incoh ? 'x' : '') + Math.round(t.f), q = m.get(k) || { f: t.f, re: 0, im: 0, p: 0, incoh: t.incoh };
    if (t.incoh) q.p += t.amp * t.amp; else { q.re += sg * t.amp * Math.cos(t.ph); q.im += sg * t.amp * Math.sin(t.ph); }
    m.set(k, q);
  }
  return [...m.values()].map(q => q.incoh ? { f: q.f, amp: Math.sqrt(q.p), ph: 0, incoh: true } : { f: q.f, amp: Math.hypot(q.re, q.im), ph: Math.atan2(q.im, q.re) }).filter(t => t.amp > 1e-15).sort((a, b) => a.f - b.f);
}
/* the signal: DC (mW), tones (mW of optical power swing, and V out), the mixer */
export function pdSignal(el) {
  const fibre = el.type === 'fcomp' || el.type === 'pic';                                     // PIC hook: an on-chip photodiode reads as a fibre one
  const dc = fibre ? (el.type === 'fcomp' ? pdNetMw(el) : lastTrace.net ? netPower(lastTrace.net.pd.get(el.id), lastTrace.net.keys) : 0) : detectorReading(el).mw;
  const Ff = !fibre && viaCavity(el) ? detectorFieldResult(el) : null;
  const tones = fibre ? (el.balanced ? balancedTones(beatTones(fibrePdParts(el)), beatTones(fibrePdParts(el, true))) : beatTones(fibrePdParts(el))) : Ff ? Ff.tones.map(t => Object.assign({}, t)) : deviceMemo(Object.assign({}, el, { id: el.id + (!fibre && viaCavity(el) ? '#tones~' : '#tones') }), () => freePdTones(el, !fibre && viaCavity(el)));
  // a free-space diode's responsivity is that of the light arriving (each wavelength at its own)
  const rd = fibre ? null : detectorReading(el);
  const R = fibre ? pdResp(el) : rd.mw > 0 ? rd.mA / rd.mw : responsivity(el, benchNms()[0]), G = el.diode ? 1 : el.gain, B = el.bandwidth;
  const V = mw => mw * 1e-3 * R * G;
  for (const t of tones) { const Hm = 1 / Math.sqrt(1 + (t.f / B) ** 2); t.V = V(t.amp) * Hm; t.phV = t.ph - Math.atan(t.f / B); }
  const out = { dc, Vdc: V(dc), tones, vmax: el.vmax, B };
  if (fibre && lastTrace.net) {
    // noise: shot noise on all the light, the gain resistor's Johnson noise, and where an
    // amplifier's ASE arrives, the signal beating with the ASE of its own polarisation and
    // the ASE with itself (over the ASE's optical band Bo)
    // each input on its own (a balanced detector has two): its broadband light (an amplifier's
    // ASE, an LED, any source set incoherent), slice by slice with both polarisations together,
    // which beats with itself and with the signal, and the rest, the signal, and its wavelength
    const side = byG => {
      const sl = new Map();
      let ase = 0, tot = 0, sigNm = null, sigMw = 0;
      for (const K of lastTrace.net.keys) {
        const m = netPower(byG, [K]);
        tot += m;
        if (K.root.ase || (K.root.cmode === 'broad' && !(K.root.tau > 0) && K.root.coh > 0)) { ase += m; const k = K.nm.toFixed(6), s = sl.get(k) || { nm: K.nm, mw: 0, B: K.root.nb || C_MM / K.root.coh }; s.mw += m; sl.set(k, s); }
        else if (m > sigMw) { sigMw = m; sigNm = K.nm; }
      }
      const Ps = Math.max(0, tot - ase) * 1e-3, Pa = ase * 1e-3;
      // the signal beats with the ASE of its own polarisation at its own wavelength (spectral density there)
      let dens = 0;
      if (sigNm !== null && sl.size) { let best = null; for (const s of sl.values()) if (!best || Math.abs(s.nm - sigNm) < Math.abs(best.nm - sigNm)) best = s; dens = best.mw * 1e-3 / best.B; }
      let aa = 0; for (const s of sl.values()) aa += (s.mw * 1e-3) ** 2 / s.B;
      return { ase, Ps, Pa, sigAse: 2 * R * R * Ps * dens * B, aseAse: R * R * aa * B };
    };
    const sides = [side(lastTrace.net.pd.get(el.id))];
    if (el.balanced) sides.push(side(lastTrace.net.pd.get(el.id + '~')));
    // shot noise on all the light either side; the excess (beat) noise, a balanced detector cancels to its common-mode rejection
    const cm = el.balanced ? Math.pow(10, -(el.cmrr || 0) / 10) : 1, sum = k => sides.reduce((a, x) => a + x[k], 0);
    const q = 1.602176634e-19, kT = 1.380649e-23 * 295, amp = !el.diode && el.type === 'fcomp';
    const parts = { shot: 2 * q * (R * (sum('Ps') + sum('Pa')) + (el.dark || 0) * 1e-9) * B, thermal: !el.diode && G > 0 ? 4 * kT * B / G : 0,
      sigAse: cm * sum('sigAse'), aseAse: cm * sum('aseAse'), amp: amp ? ((el.ampNoise || 0) * 1e-12) ** 2 * B : 0 };
    const i2 = parts.shot + parts.thermal + parts.sigAse + parts.aseAse + parts.amp, ase = sum('ase');
    const Is = R * Math.abs(sides[0].Ps - (sides[1] ? sides[1].Ps : 0));
    out.noise = { ase, parts, i2, V: Math.sqrt(i2) * G, snr: Is > 0 && i2 > 0 ? 10 * Math.log10(Is * Is / i2) : null };
  }
  if (el.demodF > 0) {
    const fd = el.demodF * 1e6, pd = el.demodPhase * deg;
    let I = 0; for (const t of tones) if (!t.incoh && Math.abs(t.f - fd) < 1) I += 0.5 * t.V * Math.cos(t.phV - pd);
    out.mixer = I;
  }
  return out;
}
/* the signal with what drives the light on the bench in it (a chopper, a modulated laser, an
   AOM or EOM on a drive: ELEC hook), when anything does; else just its beat notes. Tones as
   pdSignal's: V the output's amplitude, amp the light's swing in mW. */
function pdSignalAll(el) {
  const S = pdSignal(el), E = ELEC.detSignal(el);
  if (!E) return S;
  const fibre = el.type === 'fcomp' || el.type === 'pic', rd = fibre ? null : detectorReading(el);           // PIC hook: an on-chip photodiode reads as a fibre one
  const R = fibre ? pdResp(el) : rd.mw > 0 ? rd.mA / rd.mw : responsivity(el, benchNms()[0]), k = R * 1e-3 * (el.diode ? 1 : el.gain);   // output per mW
  const tones = E.tones.map(t => { const V = Math.hypot(t.re, t.im); return { f: t.f, V, phV: Math.atan2(t.im, t.re), amp: k > 0 ? V / k : 0, incoh: false }; })
    .concat(S.tones.filter(t => t.incoh)).sort((a, b) => a.f - b.f);
  return Object.assign({}, S, { Vdc: E.dc, dc: k > 0 ? E.dc / k : S.dc, tones, unit: E.unit, driven: true, vmax: el.diode ? Infinity : S.vmax });
}
/* the signal section of a photodiode's panel */
/* what a photodiode's Signal views show: the signal its electrical output carries (beat notes,
   the bench's drives, its noise), with beats between different lasers as tones of no fixed phase */
export function pdInstSignal(el) {
  const S = ELEC.detSignalFull(el), inc = pdSignal(el).tones.filter(t => t.incoh);
  return inc.length ? Object.assign({}, S, { tones: S.tones.concat(inc.map(t => ({ f: t.f, re: t.V, im: 0, incoh: true }))) }) : S;
}
export function signalSection(el) {
  panel.append(h('h3', null, 'Signal'));
  if (el.type !== 'pic') panel.append(h('div', { class: 'rt-rows' }, param('Demod. at (MHz)', el, 'demodF'), param('Demod. phase (\u00b0)', el, 'demodPhase')));
  // the same scope and analyser as the electronics', on this photodiode's output; their settings are the view's
  const vsEl = vs(el);
  vsEl.sigView = vsEl.sigView || 'rf';
  const sc = vsEl.scope || (vsEl.scope = { mode: 'normal', span: 0, ch: [{ vdiv: 0, off: 0 }] });
  const spc = vsEl.spec || (vsEl.spec = { scale: 'linear', rbw: 1000, fmin: 0, fmax: 0, dbdiv: 0, ref: 0 });
  const tabs = h('div', { class: 'rt-tabs', style: 'margin-top:0.4rem' }), ctl = h('div', { style: 'margin-top:0.3rem' });
  const cv = h('canvas', { height: '170', style: 'width:100%;display:block' });
  const draw = () => {
    const S = pdInstSignal(el);
    if (vsEl.sigView === 'time') INST.scope(cv, [{ S, key: el.id, name: 'output' }], sc, el.name, draw); else INST.spectrum(cv, S, spc, el.name);
  };
  const showCtl = () => ctl.replaceChildren(vsEl.sigView === 'time' ? INST.scopeControls(sc, 1, draw) : INST.spectrumControls(spc, draw));
  for (const [k, label] of [['rf', 'Spectrum'], ['time', 'Oscilloscope']]) {
    const b = h('button', { class: 'rt-tab' + (vsEl.sigView === k ? ' on' : ''), type: 'button', onclick: () => { vsEl.sigView = k; [...tabs.children].forEach(x => x.classList.toggle('on', x === b)); showCtl(); draw(); } }, label);
    tabs.append(b);
  }
  showCtl();
  panel.append(tabs, ctl, h('div', { style: 'margin-top:0.3rem' }, cv), plotSaveRow(cv));
  const rows = h('div', { class: 'rt-readout' });
  panel.append(rows);
  let sig = '';
  bindSync(cv, () => {
    const S = pdSignalAll(el), f = v => Math.abs(v) >= 0.01 || v === 0 ? String(+v.toPrecision(4)) : v.toExponential(3), u = S.unit === 'A' ? ' A' : ' V';
    const r = [['DC', fmtMw(S.dc) + ', ' + f(S.Vdc) + u]];
    if (S.driven) r.push(['Modulated', 'by what drives the light on the bench (the tones below)']);
    // the strongest, in order of frequency
    const top = S.tones.slice().sort((a, b) => b.V - a.V).slice(0, 8).sort((a, b) => a.f - b.f);
    for (const t of top) r.push([(t.incoh || !S.driven ? 'Beat at ' : 'At ') + fmtHz(t.f), fmtMw(t.amp) + ' swing, ' + f(t.V) + u + (t.incoh ? ' (two lasers: phase wanders, line of both)' : ', phase ' + (t.phV / deg).toFixed(1) + '\u00b0')]);
    if (S.tones.length > 8) r.push(['', (S.tones.length - 8) + ' more']);
    if (S.mixer !== undefined) r.push(['Mixer output', f(S.mixer) + ' V']);
    if (S.noise) {
      const N = S.noise, big = Object.entries(N.parts).sort((a, b) => b[1] - a[1])[0];
      if (N.ase > 0) r.push(['Broadband light (ASE, LEDs) reaching it', fmtMw(N.ase) + ' (in the DC)']);
      r.push(['Noise', f(N.V) + ' V rms over ' + fmtHz(S.B) + ', mostly ' + { shot: 'shot noise', thermal: 'the gain resistor\u2019s', sigAse: 'signal\u2013ASE beat', aseAse: 'ASE\u2013ASE beat', amp: 'the amplifier\u2019s' }[big[0]]]);
      if (N.snr !== null) r.push(['Signal to noise', N.snr.toFixed(1) + ' dB (electrical, DC signal)']);
    }
    const s2 = JSON.stringify(r);
    if (s2 !== sig) { sig = s2; rows.replaceChildren(h('dl', null, ...r.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    draw();
  });
  panel.append(h('p', { class: 'note', style: 'margin-top:0.4rem' }, 'Light of one laser at two frequencies (shifted by an AOM, or an EOM\u2019s sidebands) beats at their difference; the amplifier passes each beat through its bandwidth. The mixer multiplies the output by a cosine at the demodulation frequency and phase and keeps what averages out steady: with an EOM\u2019s drive frequency, off a cavity\u2019s reflection, that is the Pound\u2013Drever\u2013Hall error signal. The spectrum and oscilloscope are the electronics\u2019 own, on this output: the spectrum each tone at its rms level over the noise in the resolution bandwidth; the oscilloscope in Normal a few periods of the slowest tone by itself (or the span set), tones too fast for it filling a band, with \u00b11\u03c3 of noise; in Roll the output as the sweeps play, so slow changes (a mirror scanning, a wavelength tuning) show as they happen. Leave a setting blank for auto.'));
}

