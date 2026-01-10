// ecgMobitz.js
// Port of your Python Mobitz_type_II(...) logic.
// Depends on getECGWave(signalType) from ./ecgMorphology.js
//
// Usage:
//   import { mobitzTypeII } from "./ecgMobitz.js";
//   const { x, y, beatList } = mobitzTypeII({
//     patientHR: 85,
//     sensitivity: 0.5,
//     rate: 60,
//     output: 1.7,
//     asynchronous: false,
//     iterations: 20,
//     probConduction: 0.8, // optional
//   });

import { getECGWave } from "./ecgMorphology.js";

// ---------------- helpers ----------------
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
function rand() {
  return Math.random(); // matches np.random.random() semantics (uniform [0,1))
}

// ---------------- Mobitz Type II ----------------

/**
 * JS port of:
 * def Mobitz_type_II(ecg_func, patient_HR, sensitivity,rate, output, asynchronous,iterations=20)
 *
 * IMPORTANT: This assumes your ecgMorphology.js supports:
 * - "Normal"
 * - "Ventricular pacing"
 * - "Mobitz type II - no conduction"
 *
 * Returns {x, y, beatList}
 */
export function mobitzTypeII(cfg) {
  const {
    patientHR,
    sensitivity,
    rate,
    output,
    asynchronous,
    iterations = 20,
    probConduction = 0.8, // python: prob_conduction = 0.8
  } = cfg;

  let offset = 0;
  let timeSinceSensed = 0;
  let timePrevSensed = 0;
  let timeSensed = 0;

  const maxTimeSinceSensed = 60 / rate;
  const captureThreshold = 1.5 + 0.2 * rand() - 0.1; // 1.4..1.6
  const gap = 60 / patientHR;

  // Python magic constants from your Mobitz function
  const SENSE_ALIGN = 0.183129856;
  const OFFSET_CORR = 0.2863485;

  // initial rhythm choice
  let beatList;
  let randNum = rand();
  if (randNum < probConduction) beatList = ["Normal"];
  else beatList = ["Mobitz type II - no conduction"];

  let x = [];
  let y = [];

  for (let i = 0; i < iterations; i++) {
    // Per-beat morphology
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);
    let xTemp = xTemp0.slice();
    let yTemp = yTemp0.slice();

    // Re-sample conduction decision for "next beat" (python does rand_num each loop)
    randNum = rand();

    // Scaling factors (match python)
    const yRange = arrayMax(yTemp) - arrayMin(yTemp);
    const scalingFactorY = (1.0 + (rand() * 0.6 - 0.3)) / yRange;
    const scalingFactorX = 0.6 / 18.02;

    const scalingFactorYHeartblock = scalingFactorY * 0.08;
    const scalingFactorXHeartblock = scalingFactorX;

    // Helpers to choose next beat type (python: if rand_num > prob_conduction -> no conduction)
    const pickNextBeatType = () =>
      randNum > probConduction ? "Mobitz type II - no conduction" : "Normal";

    // apply scaling for current beat based on its type
    function scaleCurrentBeatInPlace() {
      if (beatList[i] === "Normal") {
        scaleInPlace(xTemp, scalingFactorX);
        scaleInPlace(yTemp, scalingFactorY);
      } else if (beatList[i] === "Mobitz type II - no conduction") {
        scaleInPlace(xTemp, scalingFactorXHeartblock);
        scaleInPlace(yTemp, scalingFactorYHeartblock);
      } else if (beatList[i] === "Ventricular pacing") {
        // pacing beats are regenerated below; if somehow present, treat as "Normal" scaling
        scaleInPlace(xTemp, scalingFactorX);
        scaleInPlace(yTemp, scalingFactorY);
      }
    }

    if (i === 0) {
      // i==0: scale first, then decide pacing/sensing logic
      scaleCurrentBeatInPlace();

      if (asynchronous) {
        if (output >= captureThreshold) {
          beatList[i] = "Ventricular pacing";
          ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
          xTemp = xTemp0.slice();
          yTemp = yTemp0.slice();

          const yr = arrayMax(yTemp) - arrayMin(yTemp);
          const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

          scaleInPlace(xTemp, scalingFactorX);
          // python: x_temp *= 18.02/18.3
          scaleInPlace(xTemp, 18.02 / 18.3);
          scaleInPlace(yTemp, scalingFactorY2);

          x = xTemp;
          y = yTemp;

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push(pickNextBeatType());
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
            scaleInPlace(xTemp, 18.02 / 18.3);
            scaleInPlace(yTemp, scalingFactorY2);

            x = xTemp;
            y = yTemp;

            beatList.push(pickNextBeatType());
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGN;
            offset = gap + timePrevSensed - OFFSET_CORR;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push(pickNextBeatType());
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push(pickNextBeatType());
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
        }
      } else {
        // not sensed
        timeSinceSensed += arrayMax(xTemp);
        if (timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(xTemp, 18.02 / 18.3);
            scaleInPlace(yTemp, scalingFactorY2);

            x = xTemp;
            y = yTemp;

            beatList.push(pickNextBeatType());
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGN;
            offset = gap + timePrevSensed - OFFSET_CORR;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push(pickNextBeatType());
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push(pickNextBeatType());
          offset = gap + arrayMin(xTemp);
        }
      }
    } else {
      // i>0: scale & shift based on current beat, then run pacing/sensing logic
      if (beatList[i] === "Normal") {
        scaleInPlace(xTemp, scalingFactorX);
        scaleInPlace(yTemp, scalingFactorY);
        shiftInPlace(xTemp, offset);
      } else if (beatList[i] === "Mobitz type II - no conduction") {
        scaleInPlace(xTemp, scalingFactorXHeartblock);
        scaleInPlace(yTemp, scalingFactorYHeartblock);
        shiftInPlace(xTemp, offset);
      } else {
        // If something unexpected, fall back to normal scaling
        scaleInPlace(xTemp, scalingFactorX);
        scaleInPlace(yTemp, scalingFactorY);
        shiftInPlace(xTemp, offset);
      }

      if (asynchronous) {
        if (output >= captureThreshold) {
          // NOTE: Your python branch here is a bit inconsistent (it rescales x_temp/y_temp again).
          // We mirror it as closely as possible, including the extra rescale.
          const yr = arrayMax(yTemp) - arrayMin(yTemp);
          const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

          scaleInPlace(xTemp, scalingFactorX);
          scaleInPlace(xTemp, 18.02 / 18.3);
          scaleInPlace(yTemp, scalingFactorY2);
          shiftInPlace(xTemp, offset);

          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push(pickNextBeatType());
          offset = gap + arrayMin(xTemp);
        }
      } else if (maxAbs(yTemp) >= sensitivity) {
        const idx = firstIndexAbsGE(yTemp, sensitivity);
        timeSensed = xTemp[idx];
        timeSinceSensed = timeSensed - timePrevSensed;

        if (timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            const scalingFactorY2 = (1.0 + (rand() * 0.6 - 0.3)) / yr;

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(xTemp, 18.02 / 18.3);
            scaleInPlace(yTemp, scalingFactorY2);

            if (
              beatList[i - 1] === "Normal" ||
              beatList[i - 1] === "Mobitz type II - no conduction"
            ) {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGN;
            } else {
              offset = offset - gap + maxTimeSinceSensed;
            }

            shiftInPlace(xTemp, offset);
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push(pickNextBeatType());
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGN;
            offset = gap + timePrevSensed - OFFSET_CORR;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push(pickNextBeatType());
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push(pickNextBeatType());
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
        }
      } else {
        // not sensed
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
            scaleInPlace(xTemp, 18.02 / 18.3);
            scaleInPlace(yTemp, scalingFactorY2);

            if (
              beatList[i - 1] === "Normal" ||
              beatList[i - 1] === "Mobitz type II - no conduction"
            ) {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGN;
            } else {
              offset += maxTimeSinceSensed - gap;
            }

            shiftInPlace(xTemp, offset);
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push(pickNextBeatType());
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGN;
            offset = gap + timePrevSensed - OFFSET_CORR;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push(pickNextBeatType());
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push(pickNextBeatType());
          offset = gap + arrayMin(xTemp);
        }
      }
    }
  }

  return { x, y, beatList };
}
