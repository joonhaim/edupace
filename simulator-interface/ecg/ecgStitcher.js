// egStitcher.js
import { getECGWave } from "./ecgMorphology.js";

/**
 * Optional: deterministic RNG (so sims are repeatable).
 * If you don't care, just use Math.random() directly.
 */
export function makeMulberry32(seed = 1) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

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
  // Faster than repeated .concat in tight loops:
  const out = new Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i];
  for (let j = 0; j < b.length; j++) out[a.length + j] = b[j];
  return out;
}

/**
 * JS port of Python stitch_beats.
 *
 * @param {Object} cfg
 * @param {number} cfg.patientHR bpm
 * @param {"Regular"|"Irregular"} cfg.regularity
 * @param {number} cfg.sensitivity mV threshold for sensing
 * @param {number} cfg.rate bpm pacer programmed rate
 * @param {number} cfg.output mA output
 * @param {boolean} cfg.asynchronous async pacing mode (ignore sensing)
 * @param {number} [cfg.iterations=20]
 * @param {number} [cfg.seed] optional for reproducibility
 *
 * @returns {{x:number[], y:number[], beatList:string[]}}
 */
export function stitchBeats(cfg) {
  const {
    patientHR,
    regularity: regularityIn,
    sensitivity,
    rate,
    output,
    asynchronous,
    iterations = 20,
    seed = null,
  } = cfg;

  const rng = seed == null ? Math.random : makeMulberry32(seed);

  // Python variables
  let beatList = ["Normal"];
  let offset = 0;
  let timeSinceSensed = 0;
  let timePrevSensed = 0;
  let timeSensed = 0;

  const maxTimeSinceSensed = 60 / rate;      // escape interval
  const gap = 60 / patientHR;                // intrinsic cycle length

  // capture threshold between 1.4 and 1.6
  const captureThreshold = 1.5 + 0.2 * rng() - 0.1;

  // async overrides regularity in python
  const regularity = asynchronous ? "Regular" : regularityIn;

  // This magic constant appears in your python. Keep it to match behavior.
  // It's a calibration for "time of sensed point within the waveform".
  const SENSE_ALIGNMENT = 0.183315;

  let x = [];
  let y = [];

  for (let i = 0; i < iterations; i++) {
    // 1) choose beat type
    const beatType = beatList[i] ?? "Normal";
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatType);

    // Make copies so we can mutate in-place without affecting morphology cache
    let xTemp = xTemp0.slice();
    let yTemp = yTemp0.slice();

    // 2) scaling (match python)
    const yRange = arrayMax(yTemp) - arrayMin(yTemp);
    let scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yRange === 0 ? 1 : yRange);

    let scalingFactorX;
    if (regularity === "Irregular") {
      scalingFactorX = (0.8 + (rng() * 0.6 - 0.3)) / 24;
    } else {
      scalingFactorX = 0.03333;
    }

    // Apply scaling
    scaleInPlace(xTemp, scalingFactorX);
    scaleInPlace(yTemp, scalingFactorY);

    if (i === 0) {
      // FIRST beat initializes (x,y)
      if (asynchronous) {
        if (output >= captureThreshold) {
          // overwrite morphology to paced beat
          beatList[i] = "Ventricular pacing";
          ({ x: xTemp, y: yTemp } = getECGWave("Ventricular pacing"));
          xTemp = xTemp.slice();
          yTemp = yTemp.slice();

          // rescale Y for the new morphology, keep X scale same as python
          const yr = arrayMax(yTemp) - arrayMin(yTemp);
          scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yr === 0 ? 1 : yr);

          scaleInPlace(xTemp, scalingFactorX);
          scaleInPlace(yTemp, scalingFactorY);

          x = xTemp;
          y = yTemp;

          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          x = xTemp;
          y = yTemp;

          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      } else {
        // demand mode (sensing active)
        if (maxAbs(yTemp) >= sensitivity) {
          const idx = firstIndexAbsGE(yTemp, sensitivity);
          timeSensed = xTemp[idx];

          if (timeSensed > maxTimeSinceSensed) {
            // should pace
            if (output >= captureThreshold) {
              beatList[i] = "Ventricular pacing";
              ({ x: xTemp, y: yTemp } = getECGWave("Ventricular pacing"));
              xTemp = xTemp.slice();
              yTemp = yTemp.slice();

              const yr = arrayMax(yTemp) - arrayMin(yTemp);
              scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yr === 0 ? 1 : yr);

              scaleInPlace(xTemp, scalingFactorX);
              scaleInPlace(yTemp, scalingFactorY);

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

              timePrevSensed = timeSensed;
              timeSinceSensed = 0;
            }
          } else {
            // sensed in time -> inhibit
            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);

            timePrevSensed = timeSensed;
            timeSinceSensed = 0;
          }
        } else {
          // not sensed
          timeSinceSensed += arrayMax(xTemp);
          if (timeSinceSensed > maxTimeSinceSensed) {
            // should pace
            if (output >= captureThreshold) {
              beatList[i] = "Ventricular pacing";
              ({ x: xTemp, y: yTemp } = getECGWave("Ventricular pacing"));
              xTemp = xTemp.slice();
              yTemp = yTemp.slice();

              const yr = arrayMax(yTemp) - arrayMin(yTemp);
              scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yr === 0 ? 1 : yr);

              scaleInPlace(xTemp, scalingFactorX);
              scaleInPlace(yTemp, scalingFactorY);

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
            // still waiting
            x = xTemp;
            y = yTemp;

            beatList.push("Normal");
            offset = gap + arrayMin(xTemp);
          }
        }
      }
    } else {
      // SECOND beat onwards: shift by offset first (like python does)
      shiftInPlace(xTemp, offset);

      if (asynchronous) {
        // async ignores sensing; paces at rate if capture possible
        x = concat(x, xTemp);
        y = concat(y, yTemp);

        if (output >= captureThreshold) {
          beatList.push("Ventricular pacing");
          offset = maxTimeSinceSensed + arrayMin(xTemp);
        } else {
          beatList.push("Normal");
          offset = gap + arrayMin(xTemp);
        }
      } else if (maxAbs(yTemp) >= sensitivity) {
        const idx = firstIndexAbsGE(yTemp, sensitivity);
        timeSensed = xTemp[idx];
        timeSinceSensed = timeSensed - timePrevSensed;

        if (timeSinceSensed > maxTimeSinceSensed) {
          // should pace
          if (output >= captureThreshold) {
            beatList[i] = "Ventricular pacing";

            // regenerate paced beat (like python does)
            ({ x: xTemp, y: yTemp } = getECGWave("Ventricular pacing"));
            xTemp = xTemp.slice();
            yTemp = yTemp.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yr === 0 ? 1 : yr);

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            // compute offset adjustment like python
            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset = offset - gap + maxTimeSinceSensed;
            }

            shiftInPlace(xTemp, offset);

            x = concat(x, xTemp);
            y = concat(y, yTemp);

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
          }
        } else {
          // sensed in time
          x = concat(x, xTemp);
          y = concat(y, yTemp);

          beatList.push("Normal");
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

            ({ x: xTemp, y: yTemp } = getECGWave("Ventricular pacing"));
            xTemp = xTemp.slice();
            yTemp = yTemp.slice();

            const yr = arrayMax(yTemp) - arrayMin(yTemp);
            scalingFactorY = (1.0 + (rng() * 0.6 - 0.3)) / (yr === 0 ? 1 : yr);

            scaleInPlace(xTemp, scalingFactorX);
            scaleInPlace(yTemp, scalingFactorY);

            if (beatList[i - 1] === "Normal") {
              offset = maxTimeSinceSensed + timePrevSensed - SENSE_ALIGNMENT;
            } else {
              offset += maxTimeSinceSensed - gap;
            }

            shiftInPlace(xTemp, offset);

            x = concat(x, xTemp);
            y = concat(y, yTemp);

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

  return { x, y, beatList };
}
