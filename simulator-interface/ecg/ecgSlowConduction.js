// ecgSlowConduction.js
import { getECGWave } from "./ecgMorphology.js";

// -------------------------
// helpers (match your style)
// -------------------------
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

// Python-like random
function rand() {
  return Math.random();
}

/**
 * JS port of your Python slow_conduction()
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
export function slowConduction(cfg) {
  const {
    patientHR,
    sensitivity,
    rate,
    output,
    asynchronous,
    iterations = 20,
  } = cfg;

  // Python variables
  let beatList = ["Slow conduction"];
  let offset = 0;
  let timeSinceSensed = 0;
  let timePrevSensed = 0;
  let timeSensed = 0;

  const maxTimeSinceSensed = 60 / rate;
  const captureThreshold = 1.5 + 0.2 * rand() - 0.1; // 1.4..1.6
  const gap = 60 / patientHR;

  const SENSE_ALIGNMENT = 0.183315;

  let x = [];
  let y = [];

  for (let i = 0; i < iterations; i++) {
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);

    let xTemp = xTemp0.slice();
    let yTemp = yTemp0.slice();

    // scaling factors (exact python)
    const yRange = arrayMax(yTemp) - arrayMin(yTemp);
    const scalingFactorY = (1.0 + (rand() * 0.6 - 0.3)) / yRange;
    const scalingFactorX = 0.03333;

    if (i === 0) {
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

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Slow conduction");
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

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Slow conduction");
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
        }
      } else {
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
            scaleInPlace(yTemp, scalingFactorY2);

            x = xTemp;
            y = yTemp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Slow conduction");
          offset = gap + arrayMin(xTemp);
        }
      }
    } else {
      // second beat onwards
      scaleInPlace(xTemp, scalingFactorX);
      scaleInPlace(yTemp, scalingFactorY);
      shiftInPlace(xTemp, offset);

      if (asynchronous) {
        if (output >= captureThreshold) {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Slow conduction");
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
            scaleInPlace(yTemp, scalingFactorY2);

            if (beatList[i - 1] === "Slow conduction") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset = offset - gap + maxTimeSinceSensed;
            }

            shiftInPlace(xTemp, offset);
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Slow conduction");
          offset = gap + arrayMin(xTemp);
          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
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

            if (beatList[i - 1] === "Slow conduction") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset += maxTimeSinceSensed - gap;
            }

            shiftInPlace(xTemp, offset);
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
            timePrevSensed = arrayMin(xTemp) + SENSE_ALIGNMENT;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(xTemp);
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Slow conduction");
          offset = gap + arrayMin(xTemp);
        }
      }
    }
  }

  return { x, y, beatList };
}
