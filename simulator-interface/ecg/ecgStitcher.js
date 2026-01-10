
import { getECGWave } from "./ecgMorphology.js";

function arrayMax(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}
function arrayMin(arr) {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}
function maxAbs(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > m) m = a;
  }
  return m;
}
function indexOfMaxAbs(arr) {
  let m = -Infinity;
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.abs(arr[i]);
    if (a > m) {
      m = a;
      idx = i;
    }
  }
  return idx;
}
function peakTime(xArr, yArr) {
  const idx = indexOfMaxAbs(yArr);
  if (idx < 0) return null;
  return xArr[idx];
}
function firstIndexAbsGE(arr, thr) {
  for (let i = 0; i < arr.length; i++) if (Math.abs(arr[i]) >= thr) return i;
  return -1;
}
function scaleInPlace(arr, s) {
  for (let i = 0; i < arr.length; i++) arr[i] *= s;
}
function shiftInPlace(arr, dx) {
  for (let i = 0; i < arr.length; i++) arr[i] += dx;
}
function concat(a, b) {
  const out = new Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i];
  for (let j = 0; j < b.length; j++) out[a.length + j] = b[j];
  return out;
}

function firstIndexGE(arr, val) {
  for (let i = 0; i < arr.length; i++) if (arr[i] >= val) return i;
  return -1;
}

/**
 * Matches Python overlap logic:
 * if np.min(x_temp) < np.max(x):
 *   overlap_start_idx = np.where(x >= np.min(x_temp))[0][0]
 *   x = x[:overlap_start_idx]; y = y[:overlap_start_idx]
 * then concatenate
 */
function concatWithOverlapCut(x, y, xTemp, yTemp) {
  if (x.length > 0 && arrayMin(xTemp) < arrayMax(x)) {
    const cutIdx = firstIndexGE(x, arrayMin(xTemp));
    if (cutIdx !== -1) {
      x = x.slice(0, cutIdx);
      y = y.slice(0, cutIdx);
    }
  }
  return { x: concat(x, xTemp), y: concat(y, yTemp) };
}


// Python-like random: use Math.random() exactly (non-deterministic) to match np.random.random()
function rand() {
  return Math.random();
}

/**
 * Exact JS port of the provided Python stitch_beats (signature adapted).
 *
 * @param {Object} cfg
 * @param {number} cfg.patientHR
 * @param {number} cfg.sensitivity
 * @param {number} cfg.rate
 * @param {number} cfg.output
 * @param {boolean} cfg.asynchronous
 * @param {number} [cfg.iterations=20]
 * @returns {{x:number[], y:number[], beatList:string[]}}
 */
export function stitchBeats(cfg) {
  const {
    patientHR,
    sensitivity,
    rate,
    output,
    asynchronous,
    iterations = 20,
  } = cfg;

  let beatList = ["Normal"];
  let offset = 0;
  let timeSinceSensed = 0;
  let timePrevSensed = 0;
  let timeSensed = 0;

  const maxTimeSinceSensed = 60 / rate;
  const captureThreshold = 1.5 + 0.2 * rand() - 0.1;
  const gap = 60 / patientHR;

  const SENSE_ALIGNMENT = 0.183315;

  let x = [];
  let y = [];
  const paceEvents = [];
  const senseEvents = [];

  for (let i = 0; i < iterations; i++) {
    // x_temp, y_temp = ecg_func(beat_list[i])
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);

    // copies so we can mutate like numpy arrays
    let xTemp = xTemp0.slice();
    let yTemp = yTemp0.slice();

    // scaling factors (exact Python)
    const yRange = arrayMax(yTemp) - arrayMin(yTemp);
    const scalingFactorY = (1.0 + (rand() * 0.6 - 0.3)) / yRange;
    const scalingFactorX = 0.03333;

    if (i === 0) {
      // Apply scaling: x_temp *= scaling_factor_x ; y_temp *= scaling_factor_y
      scaleInPlace(xTemp, scalingFactorX);
      scaleInPlace(yTemp, scalingFactorY);

      if (asynchronous) {
        if (output >= captureThreshold) {
          beatList[i] = "Ventricular pacing";
          ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
          xTemp = xTemp0.slice();
          yTemp = yTemp0.slice();

          const yr = arrayMax(yTemp) - arrayMin(yTemp);
          const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

          scaleInPlace(xTemp, scalingFactorX);
          scaleInPlace(yTemp, scalingFactorY2);

          x = xTemp;
          y = yTemp;
          const paceTime = peakTime(xTemp, yTemp);
          if (paceTime !== null) paceEvents.push(paceTime);

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = xTemp;
          y = yTemp;
          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      } else if (maxAbs(yTemp) >= sensitivity) {
        const idx = firstIndexAbsGE(yTemp, sensitivity);
        timeSensed = xTemp[idx];

        if (timeSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY2);

            x = xTemp;
            y = yTemp;
            const paceTime = peakTime(xTemp, yTemp);
            if (paceTime !== null) paceEvents.push(paceTime);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
            if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
          if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);
        }
      } else {
        timeSinceSensed += arrayMax(xTemp); // matches python (note: uses x_temp BEFORE scaling in python, but here xTemp already scaled like python does in i==0)
        if (timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY2);

            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      }
    } else {
      // Second beat onwards:
      // x_temp = x_temp*scaling_factor_x; y_temp = y_temp*scaling_factor_y; x_temp += offset
      scaleInPlace(xTemp, scalingFactorX);
      scaleInPlace(yTemp, scalingFactorY);
      shiftInPlace(xTemp, offset);

      if (asynchronous) {
        if (output >= captureThreshold) {
          const paceTime = peakTime(xTemp, yTemp);
          if (paceTime !== null) paceEvents.push(paceTime);
          ({ x, y } = concatWithOverlapCut(x, y, xTemp, yTemp));
          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);
          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      } else if (maxAbs(yTemp) >= sensitivity) {
        const idx = firstIndexAbsGE(yTemp, sensitivity);
        timeSensed = xTemp[idx];
        timeSinceSensed = timeSensed - timePrevSensed;

        if (timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            // regenerate paced beat
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY2);

            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset = offset - gap + maxTimeSinceSensed;
            }

            shiftInPlace(xTemp, offset);
            const paceTime = peakTime(xTemp, yTemp);
            if (paceTime !== null) paceEvents.push(paceTime);
            ({ x, y } = concatWithOverlapCut(x, y, xTemp, yTemp));


            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
            if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
          if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);
        }
      } else {
        timeSinceSensed += arrayMax(xTemp) - timePrevSensed;

        if (timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY2);

            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset += maxTimeSinceSensed - gap;
            }

            shiftInPlace(xTemp, offset);
            const paceTime = peakTime(xTemp, yTemp);
            if (paceTime !== null) paceEvents.push(paceTime);
            ({ x, y } = concatWithOverlapCut(x, y, xTemp, yTemp));


            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      }
    }
  }

  return { x, y, beatList, events: { pace: paceEvents, sense: senseEvents } };
}
