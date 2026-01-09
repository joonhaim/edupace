// ecgMorphology.js
// Mirrors your Python ECG_wave() + b_polynomial() exactly (morphology only).
// - Contains: linspace, comb, bPolynomial (rational Bézier), ECG_wave(signalType)
// - Does NOT contain pacing/stitching logic.
//
// Usage:
//   import { ECG_wave } from "./ecgMorphology.js";
//   const { x, y } = ECG_wave("Normal");

export function linspace(a, b, n) {
  const out = new Float64Array(n);
  const step = (b - a) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = a + step * i;
  return out;
}

function comb(n, k) {
  // Safe for your small n (~<= 20)
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let num = 1;
  let den = 1;
  for (let i = 1; i <= k; i++) {
    num *= (n - (k - i));
    den *= i;
  }
  return num / den;
}

function concatFloat64(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Float64Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// Python-equivalent rational Bézier:
// def b_polynomial(t, P): ... return Bx/Bdenom, By/Bdenom
export function bPolynomial(tArr, P) {
  const n = P.length - 1;
  const m = tArr.length;

  const Bx = new Float64Array(m);
  const By = new Float64Array(m);
  const Bd = new Float64Array(m);

  for (let i = 0; i <= n; i++) {
    const w = P[i][0];
    const x = P[i][1];
    const y = P[i][2];
    const c = comb(n, i);

    for (let j = 0; j < m; j++) {
      const t = tArr[j];
      const Bi = c * Math.pow(t, i) * Math.pow(1 - t, n - i);
      const wb = Bi * w;
      Bx[j] += wb * x;
      By[j] += wb * y;
      Bd[j] += wb;
    }
  }

  const outX = new Float64Array(m);
  const outY = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    outX[j] = Bx[j] / Bd[j];
    outY[j] = By[j] / Bd[j];
  }
  return { x: outX, y: outY };
}

// Optional: cache so you don't recompute Béziers every frame.
// We return the cached template arrays; callers should COPY before scaling/mutating.
const _cache = new Map();

export function ECG_wave(signal_type) {
  if (_cache.has(signal_type)) return _cache.get(signal_type);

  const t = linspace(0, 1, 101);

  let x, y;

  // ---- Normal ----
  if (signal_type === "Normal") {
    const points_P = [[1,0,0],[1.5,0.2,0.03],[1,0.4,0.12],[1,0.6,0.3],[1.5,1.6,0.9],[3,2.6,1.3],[1,3.6,0.8],[1,3.9,0.5],[1,4.2,0.16],[1.5,4.4,0.04],[1,4.6,0]];
    const points_preQRS = [[1,4.85,0],[1,5.1,0],[1,5.35,0],[1,5.6,0],[1,5.85,0],[1,6.1,0],[1,6.6,0]];
    const points_QRS = [[10,6.6,0],[10,6.8,0],[100,6.9,-0.05],[1,6.98,-0.2],[1,7.2,-0.65],[700,7.7,-1.5],[10,7.85,0],[1,8,2.5],[10,8.2,5.5],[1000,8.6,11],[10,8.95,5.5],[1,9.1,2.5],[1,9.25,0],[700,9.45,-3.3],[1,9.95,-1.5],[10,10.3,-0.1],[100,10.4,-0.03],[10,10.5,0]];
    const points_preT = [[1,10.6,0],[1,11.1,0],[1,11.35,0],[1,11.6,0],[1,12.1,0],[1,12.6,0],[1,13.1,0]];
    const points_T = [[1,13.5,0],[5,13.6,0],[2,13.65,0.04],[1,13.8,0.1],[1,14.6,1],[2,15.6,1.9],[10,16.2,2.1],[2,17.6,0.55],[1,17.8,0.15],[5,17.9,0.05],[1,18.02,0]];

    const P = bPolynomial(t, points_P);
    const preQRS = bPolynomial(t, points_preQRS);
    const QRS = bPolynomial(t, points_QRS);
    const preT = bPolynomial(t, points_preT);
    const Tseg = bPolynomial(t, points_T);

    x = concatFloat64([P.x, preQRS.x, QRS.x, preT.x, Tseg.x]);
    y = concatFloat64([P.y, preQRS.y, QRS.y, preT.y, Tseg.y]);
  }

  // ---- Ventricular pacing ----
  else if (signal_type === "Ventricular pacing") {
    const points_P = [[10,0,0],[5,0.7,0.7],[15,1.25,0.9],[15,1.35,0.9],[5,1.8,0.7],[10,2.5,0]];
    const points_prePacemaker = [[1,2.6,0],[1,3.1,0],[1,4.1,0],[1,5.1,0]];
    const points_Pacemaker = [[1,5.4,0],[10,5.5,14],[1,5.6,0]];
    const points_QRS = [[2,6.1,-0.8],[1,6.6,-3.1],[5,7,-7.1],[5,7.3,-7.6],[1,7.6,-11.5],[10,8.15,-16.8],[1,8.6,-14.6],[1,9.1,-10.5],[1,9.6,-6.4],[1,10.1,-3],[10,10.7,0]];
    const points_T = [[10,10.71,0],[1,10.9,0.4],[1,11.1,0.75],[1,11.6,1.8],[1,12.1,2.75],[1,12.6,3.6],[1,13.1,4.15],[5,13.6,4.75],[5,14.1,5.4],[15,14.55,5.7],[5,15.1,5.3],[5,15.6,4.4],[1,16.1,3],[1,16.6,1.6],[1,17.1,0.5],[1,17.5,0]];

    const P = bPolynomial(t, points_P);
    const prePm = bPolynomial(t, points_prePacemaker);
    const pm = bPolynomial(t, points_Pacemaker);
    const QRS = bPolynomial(t, points_QRS);
    const Tseg = bPolynomial(t, points_T);

    x = concatFloat64([P.x, prePm.x, pm.x, QRS.x, Tseg.x]);
    y = concatFloat64([P.y, prePm.y, pm.y, QRS.y, Tseg.y]);
  }

  // ---- Mobitz type II - no conduction (P only) ----
  else if (signal_type === "Mobitz type II - no conduction") {
    const points_P = [[1,0,0],[1.5,0.2,0.03],[1,0.4,0.12],[1,0.6,0.3],[1.5,1.6,0.9],[3,2.6,1.3],[1,3.6,0.8],[1,3.9,0.5],[1,4.2,0.16],[1.5,4.4,0.04],[1,4.6,0]];
    const P = bPolynomial(t, points_P);
    x = P.x;
    y = P.y;
  }

  // ---- Slow conduction ----
  else if (signal_type === "Slow conduction") {
    const points_P = [[1,0,0],[1.5,0.2,0.03],[1,0.4,0.12],[1,0.6,0.3],[1.5,1.6,0.9],[3,2.6,1.3],[1,3.6,0.8],[1,3.9,0.5],[1,4.2,0.16],[1.5,4.4,0.04],[1,4.6,0]];
    const points_preQRS = [[1,4.85,0],[1,5.1,0],[1,5.35,0],[1,5.6,0],[1,5.85,0],[1,6.1,0],[1,6.6,0]];
    const points_QRS = [[10,6.6,0],[10,6.8,0],[100,6.9,-0.05],[1,6.98,-0.2],[1,7.2,-0.65],[700,7.7,-1.5],[10,7.85,0],[1,8,2.5],[10,8.2,5.5],[1000,8.6,11],[10,8.95,5.5],[1,9.1,2.5],[1,9.25,0],[700,9.45,-3.3],[1,9.95,-1.5],[10,10.3,-0.1],[100,10.4,-0.03],[10,10.5,0]];
    const points_preT = [[1,17.6,0],[1,18.1,0],[1,18.35,0],[1,18.6,0],[1,19.1,0],[1,19.6,0],[1,20.1,0]];
    const points_T = [[1,20.5,0],[5,20.6,0],[2,20.65,0.04],[1,20.8,0.1],[1,21.6,1],[2,22.6,1.9],[10,23.2,2.1],[2,24.6,0.55],[1,24.8,0.15],[5,24.9,0.05],[1,25.02,0]];

    const P = bPolynomial(t, points_P);
    const preQRS = bPolynomial(t, points_preQRS);
    const QRS = bPolynomial(t, points_QRS);
    const preT = bPolynomial(t, points_preT);
    const Tseg = bPolynomial(t, points_T);

    x = concatFloat64([P.x, preQRS.x, QRS.x, preT.x, Tseg.x]);
    y = concatFloat64([P.y, preQRS.y, QRS.y, preT.y, Tseg.y]);
  }

  // ---- 3rd degree heart block P wave ----
  else if (signal_type === "3rd degree heart block P wave") {
    const points_P = [[1,0,0],[2,0.07,0.02],[1,0.15,0.12],[1,0.25,0.44],[2,0.35,0.65],[3,0.465,0.74],[2,0.6,0.63],[1,0.65,0.52],[1,0.75,0.16],[1,0.8,0.05],[2,0.85,0.01],[1,0.9,0]];
    const P = bPolynomial(t, points_P);
    x = P.x;
    y = P.y;
  }

  // ---- 3rd degree heart block R wave ----
  else if (signal_type === "3rd degree heart block R wave") {
    const points_R_first = [[1,0,0],[2,0.05,0.05],[1,0.1,0.15],[1,0.15,0.8],[5,0.225,1.2],[1,0.28,0.8],[1,0.3,0.4],[2,0.32,0]];
    const points_R_second = [[2,0.32,0],[1,0.35,-1.2],[1,0.4,-2.6],[1,0.45,-3.6],[5,0.55,-4.4],[2,0.65,-4],[1,0.7,-3.8],[1,0.75,-3.6],[1,0.8,-3.2],[1,0.9,-3],[2,1,-2.6],[1,1.05,-2.2],[1,1.1,-1.2],[1,1.15,-0.6],[1,1.2,-0.2],[1,1.25,-0.1],[2,1.27,-0.05],[1,1.3,0]];
    const points_R_third = [[1,1.3,0],[1,1.35,0.15],[1,1.4,0.25],[1,1.45,0.35],[1,1.5,0.44],[1,1.6,0.58],[1,1.7,0.77],[1,1.8,0.95],[1,1.9,1.15],[1,2,1.34],[2,2.1,1.58],[3,2.23,1.8],[2,2.3,1.75],[1,2.4,1.6],[1,2.5,1.3],[1,2.6,1],[1,2.7,0.6],[1,1.8,0.36],[1,2.9,0.15],[1,2.95,0.1],[2,3,0.03],[1,3.05,0]];

    const A = bPolynomial(t, points_R_first);
    const B = bPolynomial(t, points_R_second);
    const C = bPolynomial(t, points_R_third);

    x = concatFloat64([A.x, B.x, C.x]);
    y = concatFloat64([A.y, B.y, C.y]);
  }

  // ---- 3rd degree heart block ventricular pacing ----
  else if (signal_type === "3rd degree heart block ventricular pacing") {
    const points_Pacemaker = [[1,0,0],[10,0.032,14],[1,0.064,0]];
    const points_QRS = [[2,0.224,-0.8],[1,0.384,-3.1],[5,0.512,-7.1],[5,0.608,-7.6],[1,0.704,-11.5],[10,0.88,-16.8],[1,1.024,-14.6],[1,1.184,-10.5],[1,1.344,-6.4],[1,1.504,-3],[10,1.696,0]];
    const points_T = [[10,1.6992,0],[1,1.76,0.4],[1,1.824,0.75],[1,1.984,1.8],[1,2.144,2.75],[1,2.304,3.6],[1,2.464,4.15],[5,2.624,4.75],[5,2.784,5.4],[15,2.928,5.7],[5,3.104,5.3],[5,3.264,4.4],[1,3.424,3],[1,3.584,1.6],[1,3.744,0.5],[1,3.872,0]];

    const pm = bPolynomial(t, points_Pacemaker);
    const qrs = bPolynomial(t, points_QRS);
    const tt = bPolynomial(t, points_T);

    x = concatFloat64([pm.x, qrs.x, tt.x]);
    y = concatFloat64([pm.y, qrs.y, tt.y]);
  }

  else {
    throw new Error(`ECG_wave(): unknown signal_type "${signal_type}"`);
  }

  const out = { x, y };
  _cache.set(signal_type, out);
  return out;
}
