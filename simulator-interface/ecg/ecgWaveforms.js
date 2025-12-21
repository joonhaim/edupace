import { T, bPolynomial } from "./ecgMath.js";
const CACHE = new Map();

/**
 * Compile a waveform (by name) into raw {x, y} arrays.
 * Cached so we don't recompute every beat.
 */
export function compileWaveform(signalType) {
  if (CACHE.has(signalType)) return CACHE.get(signalType);

  let x, y;

  if (signalType === "Normal") {
    const points_preP = [
      [1, 0, 0],[1, 0.5, 0],[1, 1, 0],[1, 1.5, 0],[1, 2, 0],[1, 2.5, 0],[1, 3, 0],
    ];
    const points_P = [
      [1, 3.4, 0],[1.5, 3.6, 0.03],[1, 3.8, 0.12],[1, 4, 0.3],[1.5, 5, 0.9],
      [3, 6, 1.3],[1, 7, 0.8],[1, 7.3, 0.5],[1, 7.6, 0.16],[1.5, 7.8, 0.04],[1, 8, 0],
    ];
    const points_preQRS = [
      [1, 8.25, 0],[1, 8.5, 0],[1, 8.75, 0],[1, 9, 0],[1, 9.25, 0],[1, 9.5, 0],[1, 10, 0],
    ];
    const points_QRS = [
      [10, 10, 0],[10, 10.2, 0],[100, 10.3, -0.05],[1, 10.38, -0.2],[1, 10.6, -0.65],
      [700, 11.1, -1.5],[10, 11.25, 0],[1, 11.4, 2.5],[10, 11.6, 5.5],[1000, 12, 11],
      [10, 12.35, 5.5],[1, 12.5, 2.5],[1, 12.65, 0],[700, 12.85, -3.3],[1, 13.35, -1.5],
      [10, 13.7, -0.1],[100, 13.8, -0.03],[10, 13.9, 0],
    ];
    const points_preT = [
      [1, 14, 0],[1, 14.5, 0],[1, 14.75, 0],[1, 15, 0],[1, 15.5, 0],[1, 16, 0],[1, 16.5, 0],
    ];
    const points_T = [
      [1, 16.9, 0],[2, 17.05, 0.04],[1, 17.2, 0.1],[5, 17, 0],[1, 18, 1],[2, 19, 1.9],
      [10, 19.6, 2.1],[2, 21, 0.55],[1, 21.2, 0.15],[5, 21.3, 0.05],[1, 21.42, 0],
    ];
    const points_postT = [
      [1, 21.5, 0],[1, 22, 0],[1, 22.5, 0],[1, 23, 0],[1, 23.5, 0],[1, 24, 0],
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const preQRS = bPolynomial(T, points_preQRS);
    const QRS = bPolynomial(T, points_QRS);
    const preT = bPolynomial(T, points_preT);
    const Tseg = bPolynomial(T, points_T);
    const postT = bPolynomial(T, points_postT);

    x = [...preP.x, ...P.x, ...preQRS.x, ...QRS.x, ...preT.x, ...Tseg.x, ...postT.x];
    y = [...preP.y, ...P.y, ...preQRS.y, ...QRS.y, ...preT.y, ...Tseg.y, ...postT.y];

  } else if (signalType === "Ventricular pacing") {
    const points_preP = [[1, 0, 0],[1, 1, 0],[1, 2, 0],[1, 2.5, 0]];
    const points_P = [
      [10, 2.9, 0],[5, 3.6, 0.7],[15, 4.15, 0.9],[15, 4.25, 0.9],[5, 4.7, 0.7],[10, 5.4, 0],
    ];
    const points_prePacemaker = [[1, 5.5, 0],[1, 6, 0],[1, 7, 0],[1, 8, 0]];
    const points_Pacemaker = [[1, 8.3, 0],[10, 8.4, 14],[1, 8.5, 0]];
    const points_QRS = [
      [2, 9, -0.8],[1, 9.5, -3.1],[5, 9.9, -7.1],[5, 10.2, -7.6],[1, 10.5, -11.5],
      [10, 11.05, -16.8],[1, 11.5, -14.6],[1, 12, -10.5],[1, 12.5, -6.4],[1, 13, -3],
      [10, 13.6, 0],
    ];
    const points_T = [
      [10, 13.61, 0],[1, 13.8, 0.4],[1, 14, 0.75],[1, 14.5, 1.8],[1, 15, 2.75],
      [1, 15.5, 3.6],[1, 16, 4.15],[5, 16.5, 4.75],[5, 17, 5.4],[15, 17.45, 5.7],
      [5, 18, 5.3],[5, 18.5, 4.4],[1, 19, 3],[1, 19.5, 1.6],[1, 20, 0.5],[1, 20.4, 0],
    ];
    const points_postT = [[1, 21, 0],[1, 22, 0],[1, 23, 0],[1, 24, 0],[1, 25, 0]];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const prePacemaker = bPolynomial(T, points_prePacemaker);
    const Pacemaker = bPolynomial(T, points_Pacemaker);
    const QRS = bPolynomial(T, points_QRS);
    const Tseg = bPolynomial(T, points_T);
    const postT = bPolynomial(T, points_postT);

    x = [...preP.x, ...P.x, ...prePacemaker.x, ...Pacemaker.x, ...QRS.x, ...Tseg.x, ...postT.x];
    y = [...preP.y, ...P.y, ...prePacemaker.y, ...Pacemaker.y, ...QRS.y, ...Tseg.y, ...postT.y];

  } else if (signalType === "Mobitz type II - no conduction") {
    const points_preP = [
      [1, 0, 0],[1, 0.5, 0],[1, 1, 0],[1, 1.5, 0],[1, 2, 0],[1, 2.5, 0],[1, 3, 0],
    ];
    const points_P = [
      [1, 3.4, 0],[1.5, 3.6, 0.03],[1, 3.8, 0.12],[1, 4, 0.3],[1.5, 5, 0.9],
      [3, 6, 1.3],[1, 7, 0.8],[1, 7.3, 0.5],[1, 7.6, 0.16],[1.5, 7.8, 0.04],[1, 8, 0],
    ];
    const points_post = [
      [1, 21.5, 0],[1, 22, 0],[1, 22.5, 0],[1, 23, 0],[1, 23.5, 0],[1, 24, 0],
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const post = bPolynomial(T, points_post);

    x = [...preP.x, ...P.x, ...post.x];
    y = [...preP.y, ...P.y, ...post.y];

  } else if (signalType === "Slow conduction") {
    const points_preP = [
      [1, 0, 0],[1, 0.5, 0],[1, 1, 0],[1, 1.5, 0],[1, 2, 0],[1, 2.5, 0],[1, 3, 0],
    ];
    const points_P = [
      [1, 3.4, 0],[1.5, 3.6, 0.03],[1, 3.8, 0.12],[1, 4, 0.3],[1.5, 5, 0.9],
      [3, 6, 1.3],[1, 7, 0.8],[1, 7.3, 0.5],[1, 7.6, 0.16],[1.5, 7.8, 0.04],[1, 8, 0],
    ];
    const points_preQRS = [
      [1, 8.25, 0],[1, 8.5, 0],[1, 8.75, 0],[1, 9, 0],[1, 9.25, 0],[1, 9.5, 0],[1, 10, 0],
    ];
    const points_QRS = [
      [10, 17, 0],[10, 17.2, 0],[100, 17.3, -0.05],[1, 17.38, -0.2],[1, 17.6, -0.65],
      [700, 18.1, -1.5],[10, 18.25, 0],[1, 18.4, 2.5],[10, 18.6, 5.5],[1000, 19, 11],
      [10, 19.35, 5.5],[1, 19.5, 2.5],[1, 19.65, 0],[700, 19.85, -3.3],[1, 20.35, -1.5],
      [10, 20.7, -0.1],[100, 20.8, -0.03],[10, 20.9, 0],
    ];
    const points_preT = [
      [1, 21, 0],[1, 21.5, 0],[1, 21.75, 0],[1, 22, 0],[1, 22.5, 0],[1, 23, 0],[1, 23.5, 0],
    ];
    const points_T = [
      [1, 23.9, 0],[2, 24.05, 0.04],[1, 24.2, 0.1],[5, 24, 0],[1, 25, 1],[2, 26, 1.9],
      [10, 26.6, 2.1],[2, 28, 0.55],[1, 28.2, 0.15],[5, 28.3, 0.05],[1, 28.42, 0],
    ];
    const points_postT = [
      [1, 28.5, 0],[1, 29, 0],[1, 29.5, 0],[1, 30, 0],[1, 30.5, 0],[1, 31, 0],
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const preQRS = bPolynomial(T, points_preQRS);
    const QRS = bPolynomial(T, points_QRS);
    const preT = bPolynomial(T, points_preT);
    const Tseg = bPolynomial(T, points_T);
    const postT = bPolynomial(T, points_postT);

    x = [...preP.x, ...P.x, ...preQRS.x, ...QRS.x, ...preT.x, ...Tseg.x, ...postT.x];
    y = [...preP.y, ...P.y, ...preQRS.y, ...QRS.y, ...preT.y, ...Tseg.y, ...postT.y];

  }  else {
    throw new Error(`Unknown signalType: ${signalType}`);
  }

  const compiled = { x, y };
  CACHE.set(signalType, compiled);
  return compiled;
}

export function templatePeakAbsY(signalType) {
  const { y } = compileWaveform(signalType);
  let peak = 0;
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]));
  return peak || 1;
}