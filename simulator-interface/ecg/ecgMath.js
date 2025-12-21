// Reusable math helpers for ECG synthesis
export const T = Array.from({ length: 101 }, (_, i) => i / 100);

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) res = (res * (n - i + 1)) / i;
  return res;
}

// Rational Bézier curve evaluator
export function bPolynomial(tArray, P) {
  const n = P.length - 1;
  const B_x = [];
  const B_y = [];

  for (let j = 0; j < tArray.length; j++) {
    const t = tArray[j];
    let numX = 0;
    let numY = 0;
    let denom = 0;

    for (let i = 0; i <= n; i++) {
      const [w, x, y] = P[i];
      const comb = binomial(n, i);
      const B_i = comb * Math.pow(t, i) * Math.pow(1 - t, n - i);
      numX += B_i * w * x;
      numY += B_i * w * y;
      denom += B_i * w;
    }

    B_x.push(numX / denom);
    B_y.push(numY / denom);
  }

  return { x: B_x, y: B_y };
}

export function maxArray(arr) {
  return Math.max(...arr);
}

export function minArray(arr) {
  return Math.min(...arr);
}

// Keep beats longer at brady, shorter at tachy.
// At 200 bpm RR = 0.30 s, so beat duration must be <= ~0.30 (or allow overlap).
export function beatDurationSecForHR(hr) {
  const MIN_HR = 30;
  const MAX_HR = 200;
  const minBeat = 0.28; // supports 200 bpm with minimal overlap
  const maxBeat = 0.9; // looks nice at 30 bpm

  if (!Number.isFinite(hr) || hr <= 0) return 0.8;

  const t = clamp((hr - MIN_HR) / (MAX_HR - MIN_HR), 0, 1);
  return maxBeat + (minBeat - maxBeat) * t;
}
