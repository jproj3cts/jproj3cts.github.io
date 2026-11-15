import { generate } from './gen/pipeline.js';
import { findRim } from './gen/rim.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'rim') {
    let circle = null;
    try { circle = findRim(msg.grey, msg.w, msg.h); } catch (err) { console.error(err); }
    self.postMessage({ type: 'rim', id: msg.id, circle });
    return;
  }
  const { id, rgba, N, params } = msg;
  try {
    const t0 = performance.now();
    const result = generate(rgba, N, params);
    result.stats.totalMs = Math.round(performance.now() - t0);
    const transfer = [result.H.buffer, result.M.buffer, result.T.buffer, result.shade.buffer, result.land.buffer, result.lake.buffer];
    for (const r of result.rivers) transfer.push(r.buffer);
    for (const r of result.roads) transfer.push(r.buffer);
    for (const r of result.seaRoutes) transfer.push(r.buffer);
    self.postMessage({ type: 'map', id, result }, transfer);
  } catch (err) {
    self.postMessage({ type: 'map', id, error: String((err && err.stack) || err) });
  }
};
