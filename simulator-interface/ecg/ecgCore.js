// -----------------------------------------------------------------------------
// Global parameter grid for Bézier evaluation
// -----------------------------------------------------------------------------

/**
 * Parameter grid for Bézier evaluation in [0, 1].
 * 101 points => 0.00, 0.01, ..., 1.00
 */
export const T = Array.from({ length: 101 }, (_, i) => i / 100);

// Nominal duration (in seconds) that we scale each beat to occupy.
const BEAT_DURATION_SEC = 0.8;

// Maximum strip duration to synthesize (seconds)
const DEFAULT_STRIP_DURATION_SEC = 10;

// Safety limit to avoid infinite loops in pathological conditions
const MAX_BEATS_PER_STRIP = 40;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

function maxArray(arr) {
  return Math.max(...arr);
}

function minArray(arr) {
  return Math.min(...arr);
}

function argMax(arr) {
  let idx = 0;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
      idx = i;
    }
  }
  return idx;
}

function argMin(arr) {
  let idx = 0;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
      idx = i;
    }
  }
  return idx;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// -----------------------------------------------------------------------------
// Rational Bézier curve evaluator
// -----------------------------------------------------------------------------

/**
 * Evaluate a rational Bézier curve defined by control points P over tArray.
 *
 * P is an array of [w, x, y] control points.
 * Returns { x: number[], y: number[] } evaluated at each t in tArray.
 */
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

// -----------------------------------------------------------------------------
// ECG wave shapes (templates)
// -----------------------------------------------------------------------------

/**
 * Returns a parametric beat template for a given signal type.
 * The returned {x, y} are in an arbitrary normalized time axis that we will
 * rescale to BEAT_DURATION_SEC later in stitchBeatsNew().
 */
export function ecgWave(signalType) {
  let x, y;

  if (signalType === "Normal") {
    const points_preP = [
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
      [1, 1.5, 0],
      [1, 2, 0],
      [1, 2.5, 0],
      [1, 3, 0]
    ];

    const points_P = [
      [1, 3.4, 0],
      [1.5, 3.6, 0.03],
      [1, 3.8, 0.12],
      [1, 4, 0.3],
      [1.5, 5, 0.9],
      [3, 6, 1.3],
      [1, 7, 0.8],
      [1, 7.3, 0.5],
      [1, 7.6, 0.16],
      [1.5, 7.8, 0.04],
      [1, 8, 0]
    ];

    const points_preQRS = [
      [1, 8.25, 0],
      [1, 8.5, 0],
      [1, 8.75, 0],
      [1, 9, 0],
      [1, 9.25, 0],
      [1, 9.5, 0],
      [1, 10, 0]
    ];

    const points_QRS = [
      [10, 10, 0],
      [10, 10.2, 0],
      [100, 10.3, -0.05],
      [1, 10.38, -0.2],
      [1, 10.6, -0.65],
      [700, 11.1, -1.5],
      [10, 11.25, 0],
      [1, 11.4, 2.5],
      [10, 11.6, 5.5],
      [1000, 12, 11],
      [10, 12.35, 5.5],
      [1, 12.5, 2.5],
      [1, 12.65, 0],
      [700, 12.85, -3.3],
      [1, 13.35, -1.5],
      [10, 13.7, -0.1],
      [100, 13.8, -0.03],
      [10, 13.9, 0]
    ];

    const points_preT = [
      [1, 14, 0],
      [1, 14.5, 0],
      [1, 14.75, 0],
      [1, 15, 0],
      [1, 15.5, 0],
      [1, 16, 0],
      [1, 16.5, 0]
    ];

    const points_T = [
      [1, 16.9, 0],
      [2, 17.05, 0.04],
      [1, 17.2, 0.1],
      [5, 17, 0],
      [1, 18, 1],
      [2, 19, 1.9],
      [10, 19.6, 2.1],
      [2, 21, 0.55],
      [1, 21.2, 0.15],
      [5, 21.3, 0.05],
      [1, 21.42, 0]
    ];

    const points_postT = [
      [1, 21.5, 0],
      [1, 22, 0],
      [1, 22.5, 0],
      [1, 23, 0],
      [1, 23.5, 0],
      [1, 24, 0]
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
    const points_preP = [
      [1, 0, 0],
      [1, 1, 0],
      [1, 2, 0],
      [1, 2.5, 0]
    ];

    const points_P = [
      [10, 2.9, 0],
      [5, 3.6, 0.7],
      [15, 4.15, 0.9],
      [15, 4.25, 0.9],
      [5, 4.7, 0.7],
      [10, 5.4, 0]
    ];

    const points_prePacemaker = [
      [1, 5.5, 0],
      [1, 6, 0],
      [1, 7, 0],
      [1, 8, 0]
    ];

    const points_Pacemaker = [
      [1, 8.3, 0],
      [10, 8.4, 14],
      [1, 8.5, 0]
    ];

    const points_QRS = [
      [2, 9, -0.8],
      [1, 9.5, -3.1],
      [5, 9.9, -7.1],
      [5, 10.2, -7.6],
      [1, 10.5, -11.5],
      [10, 11.05, -16.8],
      [1, 11.5, -14.6],
      [1, 12, -10.5],
      [1, 12.5, -6.4],
      [1, 13, -3],
      [10, 13.6, 0]
    ];

    const points_T = [
      [10, 13.61, 0],
      [1, 13.8, 0.4],
      [1, 14, 0.75],
      [1, 14.5, 1.8],
      [1, 15, 2.75],
      [1, 15.5, 3.6],
      [1, 16, 4.15],
      [5, 16.5, 4.75],
      [5, 17, 5.4],
      [15, 17.45, 5.7],
      [5, 18, 5.3],
      [5, 18.5, 4.4],
      [1, 19, 3],
      [1, 19.5, 1.6],
      [1, 20, 0.5],
      [1, 20.4, 0]
    ];

    const points_postT = [
      [1, 21, 0],
      [1, 22, 0],
      [1, 23, 0],
      [1, 24, 0],
      [1, 25, 0]
    ];

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
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
      [1, 1.5, 0],
      [1, 2, 0],
      [1, 2.5, 0],
      [1, 3, 0]
    ];

    const points_P = [
      [1, 3.4, 0],
      [1.5, 3.6, 0.03],
      [1, 3.8, 0.12],
      [1, 4, 0.3],
      [1.5, 5, 0.9],
      [3, 6, 1.3],
      [1, 7, 0.8],
      [1, 7.3, 0.5],
      [1, 7.6, 0.16],
      [1.5, 7.8, 0.04],
      [1, 8, 0]
    ];

    const points_post = [
      [1, 21.5, 0],
      [1, 22, 0],
      [1, 22.5, 0],
      [1, 23, 0],
      [1, 23.5, 0],
      [1, 24, 0]
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const post = bPolynomial(T, points_post);

    x = [...preP.x, ...P.x, ...post.x];
    y = [...preP.y, ...P.y, ...post.y];
  } else if (signalType === "Slow conduction") {
    const points_preP = [
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
      [1, 1.5, 0],
      [1, 2, 0],
      [1, 2.5, 0],
      [1, 3, 0]
    ];

    const points_P = [
      [1, 3.4, 0],
      [1.5, 3.6, 0.03],
      [1, 3.8, 0.12],
      [1, 4, 0.3],
      [1.5, 5, 0.9],
      [3, 6, 1.3],
      [1, 7, 0.8],
      [1, 7.3, 0.5],
      [1, 7.6, 0.16],
      [1.5, 7.8, 0.04],
      [1, 8, 0]
    ];

    const points_preQRS = [
      [1, 8.25, 0],
      [1, 8.5, 0],
      [1, 8.75, 0],
      [1, 9, 0],
      [1, 9.25, 0],
      [1, 9.5, 0],
      [1, 10, 0]
    ];

    const points_QRS = [
      [10, 17, 0],
      [10, 17.2, 0],
      [100, 17.3, -0.05],
      [1, 17.38, -0.2],
      [1, 17.6, -0.65],
      [700, 18.1, -1.5],
      [10, 18.25, 0],
      [1, 18.4, 2.5],
      [10, 18.6, 5.5],
      [1000, 19, 11],
      [10, 19.35, 5.5],
      [1, 19.5, 2.5],
      [1, 19.65, 0],
      [700, 19.85, -3.3],
      [1, 20.35, -1.5],
      [10, 20.7, -0.1],
      [100, 20.8, -0.03],
      [10, 20.9, 0]
    ];

    const points_preT = [
      [1, 21, 0],
      [1, 21.5, 0],
      [1, 21.75, 0],
      [1, 22, 0],
      [1, 22.5, 0],
      [1, 23, 0],
      [1, 23.5, 0]
    ];

    const points_T = [
      [1, 23.9, 0],
      [2, 24.05, 0.04],
      [1, 24.2, 0.1],
      [5, 24, 0],
      [1, 25, 1],
      [2, 26, 1.9],
      [10, 26.6, 2.1],
      [2, 28, 0.55],
      [1, 28.2, 0.15],
      [5, 28.3, 0.05],
      [1, 28.42, 0]
    ];

    const points_postT = [
      [1, 28.5, 0],
      [1, 29, 0],
      [1, 29.5, 0],
      [1, 30, 0],
      [1, 30.5, 0],
      [1, 31, 0]
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
  } else {
    throw new Error(`Unknown signalType: ${signalType}`);
  }

  return { x, y };
}

// -----------------------------------------------------------------------------
// Specialised strips
// -----------------------------------------------------------------------------

function mergeTraces(x, y, xTemp, yTemp) {
  return { x: x.concat(xTemp), y: y.concat(yTemp) };
}

function completeAvBlock(iterations = 5) {
  const PP_interval = 4 + Math.random();
  const RR_interval = 5 + Math.random();

  const start = [[1, 0, 0]];
  const points_P = [
    [1, 2.45, 0],
    [2, 2.53, 0.02],
    [1, 2.6, 0.12],
    [1, 2.7, 0.44],
    [2, 2.8, 0.65],
    [3, 2.915, 0.74],
    [2, 3.05, 0.63],
    [1, 3.1, 0.52],
    [1, 3.2, 0.16],
    [1, 3.25, 0.05],
    [2, 3.3, 0.01],
    [1, 3.35, 0]
  ];

  const points_R_first = [
    [1, 4.4, 0],
    [2, 4.45, 0.05],
    [1, 4.5, 0.15],
    [1, 4.55, 0.8],
    [5, 4.625, 1.2],
    [1, 4.68, 0.8],
    [1, 4.7, 0.4],
    [2, 4.72, 0]
  ];

  const points_R_second = [
    [2, 4.72, 0],
    [1, 4.75, -1.2],
    [1, 4.8, -2.6],
    [1, 4.85, -3.6],
    [5, 4.95, -4.4],
    [2, 5.05, -4],
    [1, 5.1, -3.8],
    [1, 5.15, -3.6],
    [1, 5.2, -3.2],
    [1, 5.3, -3],
    [2, 5.4, -2.6],
    [1, 5.45, -2.2],
    [1, 5.5, -1.2],
    [1, 5.55, -0.6],
    [1, 5.6, -0.2],
    [1, 5.65, -0.1],
    [2, 5.67, -0.05],
    [1, 5.7, 0]
  ];

  const points_R_third = [
    [1, 5.7, 0],
    [1, 5.75, 0.15],
    [1, 5.8, 0.25],
    [1, 5.85, 0.35],
    [1, 5.9, 0.44],
    [1, 6, 0.58],
    [1, 6.1, 0.77],
    [1, 6.2, 0.95],
    [1, 6.3, 1.15],
    [1, 6.4, 1.34],
    [2, 6.5, 1.58],
    [3, 6.63, 1.8],
    [2, 6.7, 1.75],
    [1, 6.8, 1.6],
    [1, 6.9, 1.3],
    [1, 7, 1],
    [1, 7.1, 0.6],
    [1, 7.2, 0.36],
    [1, 7.3, 0.15],
    [1, 7.35, 0.1],
    [2, 7.4, 0.03],
    [1, 7.45, 0]
  ];

  const storage = [];
  const maxVals = [];

  const { x: startX, y: startY } = bPolynomial(T, start);
  let waveNum = 0;
  let offsetP = 0;
  let offsetR = 0;

  for (let i = 0; i < iterations; i++) {
    const { x: PxRaw, y: Py } = bPolynomial(T, points_P);
    const { x: R1Raw, y: R1y } = bPolynomial(T, points_R_first);
    const { x: R2Raw, y: R2y } = bPolynomial(T, points_R_second);
    const { x: R3Raw, y: R3y } = bPolynomial(T, points_R_third);

    let Px = PxRaw.slice();
    let R1x = R1Raw.slice();
    let R2x = R2Raw.slice();
    let R3x = R3Raw.slice();

    if (i === 0) {
      const PR_dist = Math.random() * 4 + 1;
      R1x = R1x.map((v) => v + PR_dist);
      R2x = R2x.map((v) => v + PR_dist);
      R3x = R3x.map((v) => v + PR_dist);
      offsetP = Math.max(...Px) + PP_interval;
      offsetR = Math.max(...R3x) + RR_interval;
    } else {
      Px = Px.map((v) => v + offsetP);
      R1x = R1x.map((v) => v + offsetR);
      R2x = R2x.map((v) => v + offsetR);
      R3x = R3x.map((v) => v + offsetR);
      offsetP = Math.max(...Px) + PP_interval;
      offsetR = Math.max(...R3x) + RR_interval;
    }

    const RWaveX = [...R1x, ...R2x, ...R3x];
    const RWaveY = [...R1y, ...R2y, ...R3y];

    storage.push({ x: Px, y: Py });
    maxVals.push({ idx: waveNum, maxX: Math.max(...Px) });
    waveNum += 1;

    storage.push({ x: RWaveX, y: RWaveY });
    maxVals.push({ idx: waveNum, maxX: Math.max(...RWaveX) });
    waveNum += 1;
  }

  const sorted = maxVals
    .slice()
    .sort((a, b) => a.maxX - b.maxX)
    .map((entry) => entry.idx);

  let x = startX.slice();
  let y = startY.slice();
  let scalingFactorX = 1;

  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];
    const xTemp = storage[idx].x;
    const yTemp = storage[idx].y;

    if (i === 1) scalingFactorX = 0.8 / Math.max(...xTemp);

    if (i === 0) {
      ({ x, y } = mergeTraces(x, y, xTemp, yTemp));
      continue;
    }

    const overlaps = Math.min(...xTemp) < Math.max(...x);
    if (overlaps) {
      const previousIdx = sorted[i - 1];
      const previousY = storage[previousIdx].y;
      const newIsDominant = Math.max(...yTemp) >= Math.max(...previousY);
      if (newIsDominant) {
        const cutoff = storage[previousIdx].x.length;
        x = x.slice(0, -cutoff);
        y = y.slice(0, -cutoff);
        ({ x, y } = mergeTraces(x, y, xTemp, yTemp));
      }
    } else {
      ({ x, y } = mergeTraces(x, y, xTemp, yTemp));
    }
  }

  const spanY = Math.max(...y) - Math.min(...y) || 1;
  const scalingFactorY = (1.0 + (Math.random() * 0.6 - 0.3)) / spanY;

  x = x.map((v) => v * scalingFactorX);
  y = y.map((v) => v * scalingFactorY);

  return { x, y };
}

function buildCompleteAvBlockStrip(durationSec) {
  const iterations = Math.max(3, Math.ceil(durationSec / 1.5));
  const { x, y } = completeAvBlock(iterations);
  const spanX = maxArray(x) - minArray(x) || 1;
  const scaleToDuration = durationSec > 0 ? durationSec / spanX : 1;
  return { x: x.map((v) => v * scaleToDuration), y };
}

function detectCompleteBlockEvents(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return [];

  const maxAmplitude = Math.max(...y.map((v) => Math.abs(v)), 0);
  const threshold = maxAmplitude * 0.6;
  const events = [];

  for (let i = 1; i < y.length - 1; i++) {
    const peak = y[i];
    if (
      peak > threshold &&
      peak >= y[i - 1] &&
      peak >= y[i + 1] &&
      Number.isFinite(x[i])
    ) {
      events.push({ time: x[i], type: "sense", beatType: "CompleteHeartBlock" });
    }
  }
  return events;
}

// -----------------------------------------------------------------------------
// HR → inter-beat gap
// -----------------------------------------------------------------------------

export function heartRate(patientHR) {
  if (!Number.isFinite(patientHR) || patientHR <= 0) return 0.4;
  const rr = 60 / patientHR;
  const g = rr - BEAT_DURATION_SEC;
  return g > 0 ? g : 0;
}

// -----------------------------------------------------------------------------
// Stitch beats with pacemaker logic
// -----------------------------------------------------------------------------

export function stitchBeatsNew(
  ecgFunc,
  gap,
  regularity,
  sensitivity,
  rate,
  output,
  asynchronous,
  options = {}
) {
  const scenarioWaveform = options.waveformId || null;
  const maxDurationSec =
    typeof options.durationSec === "number" && options.durationSec > 0
      ? options.durationSec
      : DEFAULT_STRIP_DURATION_SEC;

  if (scenarioWaveform === "brady-escape") {
    const { x: stripX, y: stripY } = buildCompleteAvBlockStrip(maxDurationSec);
    const events = detectCompleteBlockEvents(stripX, stripY);
    return { x: stripX, y: stripY, events };
  }

  // Python-style constants
  const captureThreshold = 1.5; // mA
  const maxTimeSinceSensed = Number.isFinite(rate) && rate > 0 ? 60 / rate : Infinity;

  if (asynchronous) regularity = "Regular";

  const mobitzProbConduction =
    typeof options.mobitzProbConduction === "number"
      ? clamp(options.mobitzProbConduction, 0, 1)
      : 0.8;

  const isPacedType = (beatType) => beatType === "Ventricular pacing";

  // Choose intrinsic beat type given scenario
  const chooseIntrinsic = () => {
    if (scenarioWaveform === "slow-conduction") return "Slow conduction";
    if (scenarioWaveform === "mobitz-ii" || scenarioWaveform === "mobitz-type-ii") {
      return Math.random() <= mobitzProbConduction
        ? "Normal"
        : "Mobitz type II - no conduction";
    }
    return "Normal";
  };

  const choosePaced = () => "Ventricular pacing";

  // Event marker helper
  const recordEvent = (beatType, beatX, beatY, sensedOrCaptured) => {
    if (!beatX.length || beatX.length !== beatY.length) return;

    let time;
    if (beatType === "Ventricular pacing") {
      time = beatX[argMin(beatY)];
    } else {
      // intrinsic -> use max
      time = beatX[argMax(beatY)];
    }

    if (!Number.isFinite(time)) return;

    if (beatType === "Ventricular pacing") {
      events.push({ time, type: "pace", beatType, captured: output >= captureThreshold });
    } else if (sensedOrCaptured) {
      events.push({ time, type: "sense", beatType });
    }
  };

  // Scale + jitter morphology similarly to your JS approach, with a special rule for Mobitz dropped beat
  const buildScaledBeat = (beatType) => {
    const { x: xr, y: yr } = ecgFunc(beatType);
    let xb = xr.slice();
    let yb = yr.slice();

    const spanX = maxArray(xb) - minArray(xb) || 1;
    const spanY = maxArray(yb) - minArray(yb) || 1;

    // Default: every beat occupies BEAT_DURATION_SEC
    const sx = BEAT_DURATION_SEC / spanX;

    // Mild amplitude jitter
    const ampJitter = 1 + (Math.random() * 2 - 1) * 0.15;
    let sy = (1.0 * ampJitter) / spanY;

    if (beatType === "Mobitz type II - no conduction") sy *= 0.08;

    xb = xb.map((v) => v * sx);
    yb = yb.map((v) => v * sy);

    return { x: xb, y: yb };
  };

  const events = [];
  let x = [];
  let y = [];

  let offset = 0; // absolute time of last sample
  let timeSinceSensed = 0;

  // RR tracking (fix: compute RR using previous R before updating)
  let prevR = null;

  // Generate beats sequentially
  let nextBeat = chooseIntrinsic();
  let beatsGenerated = 0;

  while (offset < maxDurationSec && beatsGenerated < MAX_BEATS_PER_STRIP) {
    const beatType = nextBeat;

    const { x: xTemp, y: yTemp } = buildScaledBeat(beatType);

    // Gap jitter WITHOUT drifting base gap
    let gapThisBeat = gap;
    if (regularity === "Irregular" && gap > 0) {
      const frac = 0.06;
      gapThisBeat = Math.max(0, gap + (Math.random() * 2 - 1) * frac * gap);
    }

    const startTime = beatsGenerated === 0 ? 0 : offset + gapThisBeat;
    const xShifted = xTemp.map((v) => v + startTime);

    x = x.concat(xShifted);
    y = y.concat(yTemp);

    // Sensing/capture logic
    const captured = beatType === "Ventricular pacing" && output >= captureThreshold;
    const sensed = beatType !== "Ventricular pacing" && maxArray(yTemp) >= sensitivity;
    const sensedOrCaptured = sensed || captured;

    recordEvent(beatType, xShifted, yTemp, sensedOrCaptured);

    offset = maxArray(xShifted);

    // R time (for RR)
    let currentR = null;
    if (sensedOrCaptured) {
      currentR =
        beatType === "Ventricular pacing"
          ? xShifted[argMin(yTemp)]
          : xShifted[argMax(yTemp)];
    }

    // Update timeSinceSensed (Python-style)
    if (sensedOrCaptured) {
      timeSinceSensed = 0;
    } else {
      // Not sensed: accumulate elapsed time (beat span + leading gap if not first)
      const beatSpan = maxArray(xTemp) - minArray(xTemp);
      timeSinceSensed += beatsGenerated === 0 ? beatSpan : beatSpan + gapThisBeat;
    }

    // Compute measured rate using prevR BEFORE updating it
    let measuredRate = null;
    if (Number.isFinite(prevR) && Number.isFinite(currentR) && currentR > prevR) {
      measuredRate = 60 / (currentR - prevR);
    }
    if (Number.isFinite(currentR)) prevR = currentR;

    // Decide next beat
    if (asynchronous) {
      nextBeat = choosePaced();
    } else if (!sensedOrCaptured) {
      // Not sensed: pace if exceeds escape interval
      if (timeSinceSensed >= maxTimeSinceSensed) {
        nextBeat = choosePaced();
        timeSinceSensed = 0;
      } else {
        nextBeat = chooseIntrinsic();
      }
    } else {
      // Sensed/captured: demand pacing if intrinsic slower than pacer rate
      if (measuredRate !== null && Number.isFinite(measuredRate) && measuredRate < rate) {
        if (output >= captureThreshold) {
          nextBeat = choosePaced();
          // After a paced beat, schedule intrinsic (like Python appending "Normal")
          stitchBeatsNew._afterBeatLatch = chooseIntrinsic();
        } else {
          nextBeat = chooseIntrinsic();
        }
      } else {
        nextBeat = chooseIntrinsic();
      }
    }

    if (beatType === "Ventricular pacing" && stitchBeatsNew._afterBeatLatch) {
      nextBeat = stitchBeatsNew._afterBeatLatch;
      stitchBeatsNew._afterBeatLatch = null;
    }

    beatsGenerated += 1;

    if (offset >= maxDurationSec) break;
  }

  stitchBeatsNew._afterBeatLatch = null;

  return { x, y, events };
}
