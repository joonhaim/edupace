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

// Non-deterministic like Python np.random.random() unless you swap in a seeded RNG.
function rand() {
  return Math.random();
}

export function stitchBeats(cfg) {
  const {
    patientHR,
    sensitivity,
    rate,
    output,
    asynchronous,
    iterations = 20,
  } = cfg;

  // ---- SAFETY: Pacemaker OFF (rate <= 0) ----
  // In your HTML, Pacemaker OFF forces rate=0. We treat that as:
  // - no pacing ever
  // - maxTimeSinceSensed = +Infinity
  // - asynchronous mode effectively irrelevant
  const pacingEnabled = Number.isFinite(rate) && rate > 0;
  const maxTimeSinceSensed = pacingEnabled ? (60 / rate) : Infinity;
  const asyncMode = pacingEnabled ? !!asynchronous : false;

  // Python constants
  const scalingFactorX = 0.03333;
  const pacemakerSpike = scalingFactorX * 4.380709;

  // Python: capture_threshold = 1.5 + 0.2*rand - 0.1
  // (Even if pacing is disabled, computing it is harmless; it just won't be used.)
  const captureThreshold = 1.5 + 0.2 * rand() - 0.1;

  const gap = 60 / patientHR;

  let beatList = ["Normal"];
  let offset = 0;
  let timeSinceSensed = 0;
  let timePrevSensed = 0;
  let timeSensed = 0;

  let x = [];
  let y = [];

  // Keep these so other modules / UI won’t break if they expect it.
  const paceEvents = [];
  const senseEvents = [];
  const recordPaceEvent = (xArr) => {
    const time = arrayMin(xArr) + pacemakerSpike;
    if (Number.isFinite(time)) paceEvents.push(time);
  };

  for (let i = 0; i < iterations; i++) {
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);

    let xTemp = xTemp0.slice();
    let yTemp = yTemp0.slice();

    // Python scaling_factor_y
    const yRange = arrayMax(yTemp) - arrayMin(yTemp);
    let scalingFactorY = (1.0 + (rand() * 0.6 - 0.3)) / yRange;

    if (i === 0) {
      // Apply scaling factors
      scaleInPlace(xTemp, scalingFactorX);
      scaleInPlace(yTemp, scalingFactorY);

      if (asyncMode) {
        if (output >= captureThreshold) {
          beatList[i] = "Ventricular pacing";

          ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
          xTemp = xTemp0.slice();
          yTemp = yTemp0.slice();

          scalingFactorY =
            (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(yTemp) - arrayMin(yTemp));

          scaleInPlace(xTemp, scalingFactorX);
          scaleInPlace(yTemp, scalingFactorY);

          x = xTemp;
          y = yTemp;
          recordPaceEvent(xTemp);

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
        if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);

        if (pacingEnabled && timeSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            scalingFactorY =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(yTemp) - arrayMin(yTemp));

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            x = xTemp;
            y = yTemp;
            recordPaceEvent(xTemp);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = arrayMin(xTemp) + pacemakerSpike;
            timeSinceSensed = 0;
          } else {
            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);

          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
        }
      } else {
        timeSinceSensed += arrayMax(xTemp);

        if (pacingEnabled && timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            scalingFactorY =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(yTemp) - arrayMin(yTemp));

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            x = xTemp;
            y = yTemp;
            recordPaceEvent(xTemp);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = arrayMin(xTemp) + pacemakerSpike;
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
      // Second beat onwards
      scaleInPlace(xTemp, scalingFactorX);
      scaleInPlace(yTemp, scalingFactorY);
      shiftInPlace(xTemp, offset);

      if (asyncMode) {
        if (output >= captureThreshold) {
          recordPaceEvent(xTemp);
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
        if (Number.isFinite(timeSensed)) senseEvents.push(timeSensed);

        timeSinceSensed = timeSensed - timePrevSensed;

        if (pacingEnabled && timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            scalingFactorY =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(yTemp) - arrayMin(yTemp));

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - pacemakerSpike;
            } else {
              offset = offset - gap + maxTimeSinceSensed;
            }

            shiftInPlace(xTemp, offset);
            recordPaceEvent(xTemp);
            ({ x, y } = concatWithOverlapCut(x, y, xTemp, yTemp));

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = arrayMin(xTemp) + pacemakerSpike;
            timeSinceSensed = 0;
          } else {
            x = concat(x, xTemp);
            y = concat(y, yTemp);

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);

          timePrevSensed = timeSensed;
          timeSinceSensed = 0;
        }
      } else {
        timeSinceSensed += arrayMax(xTemp) - timePrevSensed;

        if (pacingEnabled && timeSinceSensed > maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            xTemp = xTemp0.slice();
            yTemp = yTemp0.slice();

            scalingFactorY =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(yTemp) - arrayMin(yTemp));

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - pacemakerSpike;
            } else {
              offset += maxTimeSinceSensed - gap;
            }

            shiftInPlace(xTemp, offset);
            recordPaceEvent(xTemp);
            ({ x, y } = concatWithOverlapCut(x, y, xTemp, yTemp));

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = arrayMin(xTemp) + pacemakerSpike;
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

  return {
    x,
    y,
    beatList,
    events: {
      pace: paceEvents,
      sense: senseEvents,
    },
  };
}
