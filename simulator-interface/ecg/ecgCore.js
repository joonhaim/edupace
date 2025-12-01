// ecgCore.js
//
// Responsibilities:
//  - Define parametric ECG beat templates using rational Bézier curves
//  - Convert heart rate (bpm) to inter-beat gaps (seconds)
//  - Stitch beats into a continuous ECG strip with simple pacemaker logic
//
// Used by:
//  - ecgEngine.js (imports { ecgWave, heartRate, stitchBeatsNew })

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
    // Sinus beat with clear P, narrow QRS, and T
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
      [10, 3.5, 0],
      [1, 4, 0.3],
      [2, 5, 0.9],
      [20, 6, 1.3],
      [2, 7, 0.8],
      [1.5, 7.3, 0.5],
      [10, 8, 0]
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
      [10, 10.3, 0],
      [500, 11.1, -1.5],
      [10, 11.25, 0],
      [1000, 12, 11],
      [10, 12.65, 0],
      [500, 12.85, -3.3],
      [10, 13.7, 0]
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
      [10, 17, 0],
      [1, 18, 1],
      [2, 19, 1.9],
      [20, 19.6, 2.1],
      [2, 21, 0.55],
      [10, 21.4, 0]
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

    x = [
      ...preP.x,
      ...P.x,
      ...preQRS.x,
      ...QRS.x,
      ...preT.x,
      ...Tseg.x,
      ...postT.x
    ];
    y = [
      ...preP.y,
      ...P.y,
      ...preQRS.y,
      ...QRS.y,
      ...preT.y,
      ...Tseg.y,
      ...postT.y
    ];
  } else if (signalType === "Ventricular pacing") {
    // Sinus P followed by pacing spike and wide paced QRS
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

    x = [
      ...preP.x,
      ...P.x,
      ...prePacemaker.x,
      ...Pacemaker.x,
      ...QRS.x,
      ...Tseg.x,
      ...postT.x
    ];
    y = [
      ...preP.y,
      ...P.y,
      ...prePacemaker.y,
      ...Pacemaker.y,
      ...QRS.y,
      ...Tseg.y,
      ...postT.y
    ];
  } else if (signalType === "PVC") {
    // Premature wide, bizarre ventricular complex without a P wave
    const points_prePVC = [
      [1, 0, 0],
      [1, 1.5, 0],
      [1, 3, 0],
      [1, 4, 0]
    ];
    const points_PVC = [
      [5, 4.5, 0],
      [10, 5.5, -2.0],
      [10, 6.5, -4.0],
      [5, 7.5, -5.0],
      [5, 8.5, -4.0],
      [5, 9.5, -2.0],
      [5, 10.5, 0.5],
      [5, 11.5, 2.5],
      [5, 12.5, 4.0],
      [5, 13.5, 3.0],
      [5, 14.5, 1.0],
      [10, 15.5, 0]
    ];
    const points_postPVC = [
      [1, 16, 0],
      [1, 17.5, 0],
      [1, 19, 0],
      [1, 21, 0]
    ];

    const prePVC = bPolynomial(T, points_prePVC);
    const PVC = bPolynomial(T, points_PVC);
    const postPVC = bPolynomial(T, points_postPVC);

    x = [...prePVC.x, ...PVC.x, ...postPVC.x];
    y = [...prePVC.y, ...PVC.y, ...postPVC.y];
  } else if (signalType === "SpikeOnly") {
    // Pacing spike without subsequent QRS (non-capture)
    const points_preSpike = [
      [1, 0, 0],
      [1, 2, 0],
      [1, 4, 0],
      [1, 6, 0]
    ];
    const points_Spike = [
      [1, 7.8, 0],
      [10, 8.0, 14],
      [1, 8.2, 0]
    ];
    const points_postSpike = [
      [1, 8.5, 0],
      [1, 10, 0],
      [1, 12, 0],
      [1, 14, 0]
    ];

    const preSpike = bPolynomial(T, points_preSpike);
    const Spike = bPolynomial(T, points_Spike);
    const postSpike = bPolynomial(T, points_postSpike);

    x = [...preSpike.x, ...Spike.x, ...postSpike.x];
    y = [...preSpike.y, ...Spike.y, ...postSpike.y];
  } else if (signalType === "BradyNarrow") {
    // Slow narrow intrinsic beat (e.g. junctional/escape-like)
    const points_pre = [
      [1, 0, 0],
      [1, 1.5, 0],
      [1, 3, 0],
      [1, 4.5, 0]
    ];
    // small or absent P; modest QRS; modest T
    const points_QRS = [
      [5, 5.0, 0],
      [10, 5.8, -0.8],
      [10, 6.2, 0.3],
      [15, 6.6, 2.5],
      [10, 7.0, 0.4],
      [10, 7.4, -0.6],
      [5, 7.8, 0]
    ];
    const points_T = [
      [5, 8.0, 0],
      [5, 8.5, 0.5],
      [5, 9.0, 1.0],
      [5, 9.5, 0.7],
      [10, 10.0, 0]
    ];
    const points_post = [
      [1, 10.5, 0],
      [1, 12.0, 0],
      [1, 14.0, 0],
      [1, 16.0, 0]
    ];

    const pre = bPolynomial(T, points_pre);
    const QRS = bPolynomial(T, points_QRS);
    const Tseg = bPolynomial(T, points_T);
    const post = bPolynomial(T, points_post);

    x = [...pre.x, ...QRS.x, ...Tseg.x, ...post.x];
    y = [...pre.y, ...QRS.y, ...Tseg.y, ...post.y];
  } else {
    throw new Error(`Unknown signal_type: ${signalType}`);
  }

  return { x, y };
}

// -----------------------------------------------------------------------------
// HR → inter-beat gap
// -----------------------------------------------------------------------------

/**
 * Convert patient HR (bpm) into a gap (seconds) BETWEEN beats, assuming that
 * each beat morphology occupies BEAT_DURATION_SEC seconds.
 *
 * This mirrors your original Python formulation:
 *   gap = RR_interval - BEAT_DURATION_SEC
 *   RR_interval = 60 / HR
 */
export function heartRate(patientHR) {
  if (!Number.isFinite(patientHR) || patientHR <= 0) {
    return 0.4; // fallback: 0.4 s gap
  }
  const rr = 60 / patientHR; // seconds per beat
  const gap = rr - BEAT_DURATION_SEC;
  return gap > 0 ? gap : 0;
}

// -----------------------------------------------------------------------------
// Stitch beats with pacemaker logic
// -----------------------------------------------------------------------------

/**
 * Build a single ECG strip with pacing/sensing logic.
 *
 * ecgFunc:     function(signalType) -> { x, y } (template in arbitrary units)
 * gap:        base gap between beats (seconds)
 * regularity: 'Regular' or 'Irregular'
 * sensitivity:mV (used to decide if intrinsic beats are sensed)
 * rate:       pacemaker rate in ppm
 * output:     pacemaker output in mA
 * asynchronous: boolean (true => async mode)
 * options:    { waveformId?: string, durationSec?: number }
 */
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

  // Beat sequence: we dynamically push beat types based on pacing logic.
  let beatList = ["Normal"];

  let offset = 0; // absolute time of last sample in strip
  let timeSinceSensed = 0; // seconds since last sensed beat
  const maxTimeSinceSensed = rate > 0 ? (1500 * 0.04) / rate : Infinity;
  const captureThreshold = 1.5; // mA threshold for capture (simplified)

  // Async mode removes "Irregular" scheduling effect
  if (asynchronous) {
    regularity = "Regular";
  }

  let x = [];
  let y = [];
  let R_location = 0;
  const events = [];

  const isPacedType = (beatType) =>
    beatType === "Ventricular pacing" || beatType === "SpikeOnly";

  const choosePacedBeatType = () => {
    // Default paced morphology
    let beatType = "Ventricular pacing";

    if (scenarioWaveform === "loss-of-capture") {
      // UC-05 complete LOC: spikes without QRS
      return "SpikeOnly";
    }

    if (scenarioWaveform === "intermittent-capture") {
      // UC-05 intermittent: output range defines behaviour
      if (output < 5) {
        return "SpikeOnly"; // mostly non-capture
      }
      if (output >= 7) {
        return "Ventricular pacing"; // stable capture
      }
      // between 5–7 mA -> intermittent capture
      return Math.random() < 0.5 ? "Ventricular pacing" : "SpikeOnly";
    }

    return beatType;
  };

  const maybeInjectPVC = (baseType) => {
    // PVCs are intrinsic ectopy, not paced
    if (baseType !== "Normal") return baseType;

    if (
      scenarioWaveform === "paced-with-ectopy" ||
      scenarioWaveform === "mixed-wide-narrow"
    ) {
      // 15–20% chance for a PVC when conditions are otherwise normal
      if (Math.random() < 0.2) {
        return "PVC";
      }
    }
    return baseType;
  };

  const recordEvent = (beatType, beatX, beatY) => {
    if (!beatX.length || beatX.length !== beatY.length) return;

    const paced = isPacedType(beatType);
    const index = argMax(beatY);
    const time = beatX[index];

    if (typeof time === "number" && Number.isFinite(time)) {
      events.push({ time, type: paced ? "pace" : "sense", beatType });
    }
  };

  let i = 0;

  while (
    offset < maxDurationSec &&
    i < beatList.length &&
    i < MAX_BEATS_PER_STRIP
  ) {
    const beatType = beatList[i];
    const { x: xTempRaw, y: yTempRaw } = ecgFunc(beatType);
    let x_temp = xTempRaw.slice();
    let y_temp = yTempRaw.slice();

    // --------------------------
    // Normalize & jitter morphology
    // --------------------------
    const spanX = maxArray(x_temp) - minArray(x_temp) || 1;
    const spanY = maxArray(y_temp) - minArray(y_temp) || 1;

    // Scale in time so that each beat occupies BEAT_DURATION_SEC
    const scaling_factor_x = BEAT_DURATION_SEC / spanX;

    // Mild amplitude jitter ±15% around base
    const ampJitterFrac = 0.15;
    const ampJitter = 1 + (Math.random() * 2 - 1) * ampJitterFrac;
    const scaling_factor_y = (1.0 * ampJitter) / spanY;

    x_temp = x_temp.map((v) => v * scaling_factor_x);
    y_temp = y_temp.map((v) => v * scaling_factor_y);

    if (offset === 0 && i === 0) {
      // --------------------------
      // First beat: no preceding gap
      // --------------------------
      x = x_temp.slice();
      y = y_temp.slice();

      recordEvent(beatType, x_temp, y_temp);

      const sensed = maxArray(y_temp) >= sensitivity;

      if (sensed) {
        // Intrinsic sense / paced sense
        const paced = isPacedType(beatType);
        if (paced) {
          const idxMin = argMin(y_temp);
          R_location = x_temp[idxMin];
        } else {
          const idxMax = argMax(y_temp);
          R_location = x_temp[idxMax];
        }

        timeSinceSensed = 0;

        if (asynchronous) {
          beatList.push(choosePacedBeatType());
        } else {
          beatList.push(maybeInjectPVC("Normal"));
        }
      } else {
        // Not sensed
        timeSinceSensed += maxArray(x_temp);

        if (timeSinceSensed >= maxTimeSinceSensed) {
          if (output >= captureThreshold || asynchronous) {
            beatList.push(choosePacedBeatType());
          } else {
            beatList.push(maybeInjectPVC("Normal"));
          }
          timeSinceSensed = 0;
        } else if (asynchronous) {
          beatList.push(choosePacedBeatType());
        } else {
          beatList.push(maybeInjectPVC("Normal"));
        }
      }

      offset = maxArray(x_temp);
    } else {
      // --------------------------
      // Second beat onwards
      // --------------------------

      // Per-beat gap jitter for "Irregular" without drifting the base gap
      let gapThisBeat = gap;
      if (regularity === "Irregular" && gap > 0) {
        const frac = 0.06; // ±6% of gap
        const delta = (Math.random() * 2 - 1) * frac * gap;
        gapThisBeat = Math.max(0, gap + delta);
      }

      const x_temp_shifted = x_temp.map((v) => v + offset + gapThisBeat);

      x = x.concat(x_temp_shifted);
      y = y.concat(y_temp);

      recordEvent(beatType, x_temp_shifted, y_temp);

      offset = maxArray(x_temp_shifted);

      const sensed = maxArray(y_temp) >= sensitivity;

      if (!sensed) {
        // ----------------------
        // Beat not sensed
        // ----------------------
        timeSinceSensed += maxArray(x_temp) + gapThisBeat;

        if (timeSinceSensed >= maxTimeSinceSensed) {
          if (output >= captureThreshold || asynchronous) {
            beatList.push(choosePacedBeatType());
          } else {
            beatList.push(maybeInjectPVC("Normal"));
          }
          timeSinceSensed = 0;
        } else if (asynchronous) {
          beatList.push(choosePacedBeatType());
        } else {
          beatList.push(maybeInjectPVC("Normal"));
        }
      } else {
        // ----------------------
        // Beat sensed
        // ----------------------
        const paced = isPacedType(beatType);

        if (paced) {
          const idxMin = argMin(y_temp);
          R_location = x_temp_shifted[idxMin];
        } else {
          const idxMax = argMax(y_temp);
          R_location = x_temp_shifted[idxMax];
        }

        const idxMaxY = argMax(y_temp);
        const RR_dist = x_temp_shifted[idxMaxY] - R_location || BEAT_DURATION_SEC;
        const measured_rate = (1500 * 0.04) / RR_dist; // 60 / RR_dist

        timeSinceSensed = 0;

        if (measured_rate < rate) {
          // Intrinsic rate slower than pacer setting => schedule pacing
          if (output >= captureThreshold || asynchronous) {
            beatList.push(choosePacedBeatType());
          } else {
            beatList.push(maybeInjectPVC("Normal"));
          }

          if (!asynchronous) {
            // After pacing, expect further intrinsic beats
            beatList.push(maybeInjectPVC("Normal"));
          }
        } else if (asynchronous) {
          // Async pacing continues regardless of intrinsic rate
          beatList.push(choosePacedBeatType());
        } else {
          // Demand mode: intrinsic rate adequate
          beatList.push(maybeInjectPVC("Normal"));
        }
      }
    }

    i += 1;
  }

  return { x, y, events };
}
