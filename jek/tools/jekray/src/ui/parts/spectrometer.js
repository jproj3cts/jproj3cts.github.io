import { frame, toWorld } from '../../core/mask.js';
import { lastTrace } from '../../engines/trace.js';
import { SPEC_L, SPEC_PRESETS, SPEC_SENSORS, SPEC_W, specPresetOf } from '../../parts/spectrometer.js';
import { specDispersion, specReading, specTrace } from '../../engines/spectrometer.js';
import { bodyFill, ctx, pathLocal, selInk, sx, sy } from '../render.js';
import { bindSync, h, helpLine, panel, param, renderPanel, selectField, vs } from '../panel.js';
import { drawAxes, plotArea, plotCsv, plotSaveRow } from '../plots.js';

/* Spectrometer on the page: drawn on the bench, picked by the pointer, edited in its panel. What it is: parts/spectrometer.js; its
   reading: engines/spectrometer.js */

function drawSpectrometer(el, sel) {
  const f = frame(el), w = SPEC_W / 2;
  // the body behind its face, and a grating's lines inside it to say what it is
  pathLocal(f, [[0, -w], [-SPEC_L, -w], [-SPEC_L, w], [0, w]], true);
  ctx.fillStyle = bodyFill('#2b3338'); ctx.fill();
  ctx.strokeStyle = sel ? selInk() : '#9aa4ab'; ctx.lineWidth = sel ? 2.2 : 1.3; ctx.stroke();
  for (let i = -3; i <= 3; i++) { pathLocal(f, [[-SPEC_L * 0.72 + i * 1.6, -w * 0.45], [-SPEC_L * 0.72 + i * 1.6 + 3, -w * 0.15]]); ctx.strokeStyle = 'rgba(180,200,220,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
  // its face, and the entrance: a slit or a fibre's core, drawn at least a millimetre long so it shows
  pathLocal(f, [[0, -w], [0, w]]);
  ctx.strokeStyle = '#6b7a83'; ctx.lineWidth = 2.5; ctx.stroke();
  const e = Math.max(0.6, (el.entrance === 'fibre' ? el.core / 2000 : el.slit / 2000));
  pathLocal(f, [[0, -e], [0, e]]);
  ctx.strokeStyle = '#7ee0a1'; ctx.lineWidth = 3.5; ctx.stroke();
  const hits = lastTrace.screens[el.id] || [];
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const t of hits) { if (t.chief) continue; const [x1, y1] = toWorld(f, 0, t.y); ctx.fillRect(sx(x1) - 1.5, sy(y1) - 1.5, 3, 3); }
}
const hitSpectrometer = (el, lx, ly, tol) => lx <= tol && lx >= -SPEC_L - tol && Math.abs(ly) <= SPEC_W / 2 + tol;

const specFmtNm = v => (v >= 100 ? v.toFixed(2) : v.toPrecision(4)) + ' nm';
// power through the entrance, mW down to fW, three figures
const specFmtMw = v => { if (!(v > 0)) return '0 mW'; for (const [k, u] of [[1, 'mW'], [1e-3, '\u00b5W'], [1e-6, 'nW'], [1e-9, 'pW']]) if (v >= k) return +(v / k).toPrecision(3) + ' ' + u; return +(v * 1e12).toPrecision(3) + ' fW'; };
const specFmtE = v => v >= 1e4 ? v.toExponential(2) : String(Math.round(v));

/* the Spectrum tab: counts against wavelength, the readings beside it */
function specSpectrumSection(el) {
  const st = vs(el), cv = h('canvas', { height: '210', style: 'width:100%;display:block' });
  if (!st.specView) st.specView = { log: false, lo: 0, hi: 0 };
  const V = st.specView;
  const log = h('input', { type: 'checkbox' }); log.checked = V.log;
  log.addEventListener('change', () => { V.log = log.checked; draw(); });
  const rows = h('div', { class: 'rt-readout' });
  panel.append(cv, plotSaveRow(cv), h('label', { class: 'rt-check' }, log, ' Log scale (counts)'), rows);
  const draw = () => {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, hgt = 210, c = cv.getContext('2d');
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hgt);
    const T = specTrace(el), n = T.nm.length, top = el.well;
    const yv = v => V.log ? Math.log10(Math.max(1, v)) : v, yr = V.log ? [0, Math.log10(top)] : [0, Math.max(1, Math.min(top, Math.max(...T.e) * 1.1))];
    const sY = { kind: 'plain', title: V.log ? 'log₁₀ counts' : 'counts (e⁻)' }, sX = { kind: 'plain', title: 'wavelength, nm' };
    const A = plotArea(c, w, hgt, yr, sY), xr = [el.wmin, el.wmax];
    const X = x => A.l + (x - xr[0]) / (xr[1] - xr[0]) * A.w, Y = v => A.t + A.h - (Math.min(yr[1], Math.max(yr[0], yv(v))) - yr[0]) / (yr[1] - yr[0]) * A.h;
    c.save(); c.beginPath(); c.rect(A.l, A.t, A.w, A.h); c.clip();
    c.strokeStyle = '#db3550'; c.lineWidth = 1.3; c.beginPath();
    // at most one point a screen pixel: each the most of the pixels it stands for, so a narrow line still shows
    const step = Math.max(1, Math.floor(n / (A.w * 2)));
    for (let i = 0, j = 0; i < n; i += step, j++) { let m = 0; for (let k = i; k < Math.min(n, i + step); k++) m = Math.max(m, T.e[k]); const px = X(T.nm[i]), py = Y(m); j ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    if (T.sat) { c.strokeStyle = 'rgba(219,53,80,0.5)'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(A.l, Y(top)); c.lineTo(A.l + A.w, Y(top)); c.stroke(); c.setLineDash([]); }
    c.restore();
    drawAxes(c, A, xr, yr, sX, sY);
    plotCsv(cv, el.name + ' spectrum', ['wavelength_nm', 'counts_e', 'noise_e', 'power_mW'], () => Array.from(T.nm, (x, i) => [x, T.e[i], T.sd[i], T.mw[i]]));
  };
  let sig = '';
  bindSync(cv, () => {
    const R = specReading(el);
    const r = [['Resolution', (+R.R.toPrecision(3)) + ' nm (' + (+specDispersion(el).toPrecision(3)) + ' nm per µm of array)']];
    if (!(R.face > 0)) r.push(['Light', 'None reaches its face']);
    else {
      r.push(['Through the entrance', specFmtMw(R.mw) + (R.share !== null ? ', ' + (100 * R.share).toFixed(R.share < 0.1 ? 2 : 1) + '% of what reaches its face' : '')]);
      if (R.peak !== null) {
        r.push(['Peak', specFmtNm(R.peak) + ', ' + specFmtE(R.counts) + ' counts' + (R.sat ? ' (saturated: shorten the integration time)' : '')]);
        r.push(['Width (FWHM)', specFmtNm(R.fwhm) + (R.fwhm < 1.5 * R.R ? ', set by the resolution' : '')]);
        r.push(['Signal-to-noise at the peak', R.snr === null ? 'none while saturated' : String(+R.snr.toPrecision(3))]);
      } else if (R.mw > 0) r.push(['Peak', 'Outside its range, ' + el.wmin + ' to ' + el.wmax + ' nm']);
      if (R.lines.length > 1) r.push(['Lines through the entrance', R.lines.length + ': ' + R.lines.slice(0, 6).map(L => specFmtNm(L.nm)).join(', ') + (R.lines.length > 6 ? '…' : '')]);
    }
    const s2 = JSON.stringify(r);
    if (s2 !== sig) { sig = s2; rows.replaceChildren(h('dl', null, ...r.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]))); }
    draw();
  });
}

function spectrometerPanel(el) {
  const st = vs(el);
  const tabs = h('div', { class: 'rt-tabs' });
  for (const [k, label] of [['params', 'Spectrometer'], ['spectrum', 'Spectrum']]) {
    tabs.append(h('button', { class: 'rt-tab' + ((st.specTab || 'spectrum') === k ? ' on' : ''), type: 'button', onclick: () => { st.specTab = k; renderPanel(); } }, label));
  }
  panel.append(tabs);
  if ((st.specTab || 'spectrum') === 'spectrum') { specSpectrumSection(el); return; }
  el.preset = specPresetOf(el);
  panel.append(h('div', { class: 'rt-rows' }, selectField('Kind', [...Object.entries(SPEC_PRESETS).map(([k, P]) => [k, P.name]), ['custom', 'Custom']], () => el.preset, v => {
    if (SPEC_PRESETS[v]) { const P = Object.assign({}, SPEC_PRESETS[v]); delete P.name; Object.assign(el, P); }
    el.preset = v;
  }, { wide: true })));
  panel.append(h('h3', null, 'Entrance'));
  const ent = h('div', { class: 'rt-rows' }, selectField('Entrance', [['slit', 'Slit'], ['fibre', 'Fibre']], () => el.entrance, v => { el.entrance = v; }));
  if (el.entrance === 'fibre') ent.append(param('Core (µm)', el, 'core'));
  else ent.append(param('Slit width (µm)', el, 'slit'), param('Slit height (mm)', el, 'slitH'));
  ent.append(param('NA it takes in', el, 'na'));
  panel.append(ent);
  panel.append(h('h3', null, 'Array'));
  panel.append(h('div', { class: 'rt-rows' }, param('From (nm)', el, 'wmin'), param('To (nm)', el, 'wmax'), param('Pixels', el, 'pixels'), param('Pitch (µm)', el, 'pitch'),
    selectField('Sensor', Object.entries(SPEC_SENSORS).map(([k, S]) => [k, S.name]), () => el.sensor, v => { el.sensor = v; }, { wide: true }),
    param('Integration (ms)', el, 'tint'), param('Full well (e⁻)', el, 'well'), param('Read noise (e⁻)', el, 'read'), param('Dark (e⁻/s)', el, 'dark')));
  panel.append(helpLine('What it reads, and how.', ['Only the light through its entrance counts: the part of each beam or ray on the slit (or a fibre entrance’s core), arriving within its NA; the rest of its face blocks the light. The array spans its range evenly, so the dispersion is the range over the array’s length, and the resolution is the entrance’s width and two pixels together, times the dispersion: a narrower slit sharpens the lines and lets less light in. Each source arrives as a line as wide as its own (its coherence length’s, or a pulse’s bandwidth). Counts are the photoelectrons in the integration time, by the sensor’s quantum efficiency at each wavelength, up to the full well; the noise is shot, dark and read noise. The kinds set every value to a typical instrument of that kind.'], 'note', 'margin-top:0.6rem'));
}

export const SPECTROMETER_UI = {
  draw: drawSpectrometer, hit: hitSpectrometer, panel: spectrometerPanel, rank: 1,
};
