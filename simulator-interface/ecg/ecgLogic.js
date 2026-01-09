// ecgLogic.js
// Live beat-by-beat port of your Python stitch_beats() logic.
// Depends on morphology only (ECG_wave). No rendering here.

import { ECG_wave } from "./ecgMorphology.js";

function minMax(a) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { min: mn, max: mx };
}

function maxAbs(a) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > m) m = v;
  }
  return m;
}

function firstIndexAbsGE(a, thr) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]) >= thr) return i;
  }
  return -1;
}

function copyFloat64(a) {
  return new Float64Array(a); // copies
}

export function createStitchBeatsState({
  patientHR = 90,
  regularity = "Regular",     // 'Regular' | 'Irregular'
  sensitivity = 0.5,          // mV threshold
  rate = 70,                  // pacemaker rate bpm
  output = 1.8,               // mA
  asynchronous = false,
} = {}) {
  return {
    i: 0,
    beatList: ["Normal"],
    offset: 0,
    timeSinceSensed: 0,
    timePrevSensed: 0,
    timeSensed: 0,
    captureThreshold: 1.5 + 0.2 * Math.random() - 0.1, // 1.4..1.6 (Python)
    params: { patientHR, regularity, sensitivity, rate, output, asynchronous },
  };
}

export function setParams(state, patch) {
  state.params = { ...state.params, ...patch };
  // NOTE: Python computes capture_threshold once per run. We keep it stable.
  // If you want reset-on-change behavior, uncomment:
  // if ("output" in patch || "rate" in patch || "asynchronous" in patch) {
  //   state.captureThreshold = 1.5 + 0.2 * Math.random() - 0.1;
  // }
}

export function nextBeat_stitchBeats(state) {
  // Returns one beat segment already scaled + shifted in time:
  // { x: Float64Array (seconds), y: Float64Array }
  const p = state.params;
  const patientHR = p.patientHR;
  let regularity = p.regularity;
  const sensitivity = p.sensitivity;
  const rate = p.rate;
  const output = p.output;
  const asynchronous = !!p.asynchronous;

  const maxTimeSinceSensed = 60 / rate;
  const gap = 60 / patientHR;

  if (asynchronous) regularity = "Regular";

  const type = state.beatList[state.i] ?? "Normal";
  const tpl = ECG_wave(type);

  // Copy (never mutate cached morphology)
  let xTemp = copyFloat64(tpl.x);
  let yTemp = copyFloat64(tpl.y);

  // scaling_factor_y = (1.0+(rand*0.6-0.3)) / (max(y)-min(y))
  const yMM = minMax(yTemp);
  let scalingY = (1.0 + (Math.random() * 0.6 - 0.3)) / (yMM.max - yMM.min);

  // scaling_factor_x: in your Python for Normal it’s 0.03333 when Regular
  let scalingX;
  if (regularity === "Irregular") {
    scalingX = (0.8 + (Math.random() * 0.6 - 0.3)) / 24;
  } else {
    scalingX = 0.03333;
  }

  // apply scaling
  for (let k = 0; k < xTemp.length; k++) {
    xTemp[k] *= scalingX;
    yTemp[k] *= scalingY;
  }

  const overwriteWithPaced = () => {
    const paced = ECG_wave("Ventricular pacing");
    xTemp = copyFloat64(paced.x);
    yTemp = copyFloat64(paced.y);

    const mm = minMax(yTemp);
    scalingY = (1.0 + (Math.random() * 0.6 - 0.3)) / (mm.max - mm.min);

    for (let k = 0; k < xTemp.length; k++) {
      xTemp[k] *= scalingX;
      yTemp[k] *= scalingY;
    }
  };

  const xMM = () => minMax(xTemp);

  // ---- i == 0 (first beat) ----
  if (state.i === 0) {
    if (asynchronous) {
      if (output >= state.captureThreshold) {
        state.beatList[state.i] = "Ventricular pacing";
        overwriteWithPaced();
        state.beatList.push("Ventricular pacing");
        state.offset = maxTimeSinceSensed + xMM().min;
      } else {
        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
      }
      state.i += 1;
      return { x: xTemp, y: yTemp };
    }

    // sensing
    if (maxAbs(yTemp) >= sensitivity) {
      const idx = firstIndexAbsGE(yTemp, sensitivity);
      state.timeSensed = xTemp[idx];

      if (state.timeSensed > maxTimeSinceSensed) {
        if (output >= state.captureThreshold) {
          state.beatList[state.i] = "Ventricular pacing";
          overwriteWithPaced();
          state.beatList.push("Normal");
          state.offset = gap + xMM().min;
          state.timePrevSensed = xMM().min + 0.183315;
          state.timeSinceSensed = 0;
        } else {
          state.beatList.push("Normal");
          state.offset = gap + xMM().min;
          state.timePrevSensed = state.timeSensed;
          state.timeSinceSensed = 0;
        }
      } else {
        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
        state.timePrevSensed = state.timeSensed;
        state.timeSinceSensed = 0;
      }
    } else {
      // not sensed
      state.timeSinceSensed += xMM().max;
      if (state.timeSinceSensed > maxTimeSinceSensed) {
        if (output >= state.captureThreshold) {
          state.beatList[state.i] = "Ventricular pacing";
          overwriteWithPaced();
          state.beatList.push("Normal");
          state.offset = gap + xMM().min;
          state.timePrevSensed = xMM().min + 0.183315;
          state.timeSinceSensed = 0;
        } else {
          state.beatList.push("Normal");
          state.offset = gap + xMM().min;
        }
      } else {
        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
      }
    }

    state.i += 1;
    return { x: xTemp, y: yTemp };
  }

  // ---- i > 0 (subsequent beats) ----
  // Python: x_temp += offset first
  for (let k = 0; k < xTemp.length; k++) xTemp[k] += state.offset;

  if (asynchronous) {
    // append as-is, decide next beat and new offset
    if (output >= state.captureThreshold) {
      state.beatList.push("Ventricular pacing");
      state.offset = maxTimeSinceSensed + xMM().min;
    } else {
      state.beatList.push("Normal");
      state.offset = gap + xMM().min;
    }
    state.i += 1;
    return { x: xTemp, y: yTemp };
  }

  if (maxAbs(yTemp) >= sensitivity) {
    const idx = firstIndexAbsGE(yTemp, sensitivity);
    state.timeSensed = xstate_timeSensed = xTemp[idx];
    state.timeSinceSensed = state.timeSensed - state.timePrevSensed;

    if (state.timeSinceSensed > maxTimeSinceSensed) {
      if (output >= state.captureThreshold) {
        // overwrite beat to paced
        state.beatList[state.i] = "Ventricular pacing";
        overwriteWithPaced();

        // offset calculation depends on previous beat
        if (state.beatList[state.i - 1] === "Normal") {
          state.offset = maxTimeSinceSensed + state.timePrevSensed - 0.183315;
        } else {
          state.offset = state.offset - gap + maxTimeSinceSensed;
        }

        // shift paced beat by this offset
        for (let k = 0; k < xTemp.length; k++) xTemp[k] += state.offset;

        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
        state.timePrevSensed = xMM().min + 0.183315;
        state.timeSinceSensed = 0;
      } else {
        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
        state.timePrevSensed = state.timeSensed;
        state.timeSinceSensed = 0;
      }
    } else {
      state.beatList.push("Normal");
      state.offset = gap + xMM().min;
      state.timePrevSensed = state.timeSensed;
      state.timeSinceSensed = 0;
    }
  } else {
    // not sensed
    state.timeSinceSensed += xMM().max - state.timePrevSensed;

    if (state.timeSinceSensed > maxTimeSinceSensed) {
      if (output >= state.captureThreshold) {
        state.beatList[state.i] = "Ventricular pacing";
        overwriteWithPaced();

        if (state.beatList[state.i - 1] === "Normal") {
          state.offset = maxTimeSinceSensed + state.timePrevSensed - 0.183315;
        } else {
          state.offset += maxTimeSinceSensed - gap;
        }

        for (let k = 0; k < xTemp.length; k++) xTemp[k] += state.offset;

        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
        state.timePrevSensed = xMM().min + 0.183315;
        state.timeSinceSensed = 0;
      } else {
        state.beatList.push("Normal");
        state.offset = gap + xMM().min;
      }
    } else {
      state.beatList.push("Normal");
      state.offset = gap + xMM().min;
    }
  }

  state.i += 1;
  return { x: xTemp, y: yTemp };
}
