// ecg/waveformAdapter.js
import { ecgWave } from "./ecgCore.js";

/**
 * We cache each beat as (phase[], y[]) where phase is 0..1.
 * Then the engine can resample it to any beat duration without altering the shape.
 */
const CACHE = new Map();

function toPhaseTemplate(x, y) {
  if (!x?.length || x.length !== y.length) {
    throw new Error("ecgWave() must return x[] and y[] arrays of same length.");
  }
  const x0 = x[0];
  const x1 = x[x.length - 1];
  const span = (x1 - x0) || 1;

  const phase = new Float32Array(x.length);
  const yy = new Float32Array(y.length);
  for (let i = 0; i < x.length; i++) {
    phase[i] = (x[i] - x0) / span;
    yy[i] = y[i];
  }
  return { phase, y: yy };
}

function sampleLinear(phase, y, p) {
  // phase is increasing 0..1
  if (p <= phase[0]) return y[0];
  if (p >= phase[phase.length - 1]) return y[y.length - 1];

  // binary search
  let lo = 0, hi = phase.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (phase[mid] <= p) lo = mid;
    else hi = mid;
  }
  const t = (p - phase[lo]) / (phase[hi] - phase[lo] || 1);
  return y[lo] + t * (y[hi] - y[lo]);
}

export function getBeatTemplate(signalType) {
  if (CACHE.has(signalType)) return CACHE.get(signalType);

  // Expected: ecgWave returns { x, y } OR [x, y]
  const w = ecgWave(signalType);
  let x, y;
  if (Array.isArray(w) && w.length === 2) {
    [x, y] = w;
  } else if (w && w.x && w.y) {
    ({ x, y } = w);
  } else {
    throw new Error("ecgWave(signalType) must return {x, y} or [x, y].");
  }

  const tpl = toPhaseTemplate(x, y);

  // Precompute peak for sensing logic
  let peak = -Infinity;
  for (let i = 0; i < tpl.y.length; i++) peak = Math.max(peak, tpl.y[i]);

  const out = { ...tpl, peak };
  CACHE.set(signalType, out);
  return out;
}

export function renderBeatSamples(signalType, sampleRate, durationSec) {
  const tpl = getBeatTemplate(signalType);
  const n = Math.max(4, Math.round(sampleRate * durationSec));
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i / (n - 1); // 0..1
    out[i] = sampleLinear(tpl.phase, tpl.y, p);
  }
  return out;
}
