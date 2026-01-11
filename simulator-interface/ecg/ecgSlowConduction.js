import { getECGWave } from "./ecgMorphology.js";

// ---------- helpers ----------
function arrayMax(arr) { let m = -Infinity; for (let i=0;i<arr.length;i++) if (arr[i] > m) m = arr[i]; return m; }
function arrayMin(arr) { let m =  Infinity; for (let i=0;i<arr.length;i++) if (arr[i] < m) m = arr[i]; return m; }
function maxAbs(arr)   { let m = 0; for (let i=0;i<arr.length;i++){ const a=Math.abs(arr[i]); if (a>m) m=a; } return m; }
function firstIndexAbsGE(arr, thr){ for (let i=0;i<arr.length;i++) if (Math.abs(arr[i]) >= thr) return i; return -1; }
function scaleInPlace(arr, s){ for (let i=0;i<arr.length;i++) arr[i] *= s; }
function shiftInPlace(arr, dx){ for (let i=0;i<arr.length;i++) arr[i] += dx; }
function concat(a, b){ const out=new Array(a.length+b.length); for(let i=0;i<a.length;i++) out[i]=a[i]; for(let j=0;j<b.length;j++) out[a.length+j]=b[j]; return out; }

function rand(){ return Math.random(); }

// Python overlap snippet used when inserting regenerated paced beats:
// if min(x_temp) < max(x): cut previous at first x>=min(x_temp), then concat
function concatWithOverlapCut(x, y, xTemp, yTemp) {
  if (x.length > 0 && arrayMin(xTemp) < arrayMax(x)) {
    const start = arrayMin(xTemp);
    let cutIdx = -1;
    for (let i = 0; i < x.length; i++) {
      if (x[i] >= start) { cutIdx = i; break; }
    }
    if (cutIdx !== -1) {
      x = x.slice(0, cutIdx);
      y = y.slice(0, cutIdx);
    }
  }
  return { x: concat(x, xTemp), y: concat(y, yTemp) };
}

/**
 * Port of:
 * def slow_conduction(ecg_func, patient_HR, sensitivity, rate, output, asynchronous, iterations=20)
 *
 * Returns {x, y, beatList, events:{pace,sense}}
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

  // ---- SAFETY for rate<=0 (Pacemaker OFF) ----
  const pacingEnabled = Number.isFinite(rate) && rate > 0;
  const max_time_since_sensed = pacingEnabled ? (60 / rate) : Infinity;
  const asyncMode = pacingEnabled ? !!asynchronous : false;

  // Python variables
  const beatList = ["Slow conduction"];
  let offset = 0;
  let time_since_sensed = 0;
  let time_prev_sensed = 0;
  let time_sensed = 0;

  const capture_threshold = 1.5 + 0.2 * rand() - 0.1; // 1.4..1.6
  const gap = 60 / patientHR;

  const SENSE_ALIGNMENT = 0.183315;

  let x = [];
  let y = [];

  // Kept for compatibility (your UI expects events sometimes)
  const paceEvents = [];
  const senseEvents = [];

  const recordPace = (xArr) => {
    // Python uses time_prev_sensed = min(x_temp)+0.183315 for paced beats,
    // so we treat that as the pacing marker time.
    paceEvents.push(arrayMin(xArr) + SENSE_ALIGNMENT);
  };
  const recordSense = (t) => { if (Number.isFinite(t)) senseEvents.push(t); };

  for (let i = 0; i < iterations; i++) {
    // x_temp, y_temp = ecg_func(beat_list[i])
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);
    let x_temp = xTemp0.slice();
    let y_temp = yTemp0.slice();

    // scaling_factor_y = (1+(rand*0.6-0.3))/(max(y_temp)-min(y_temp))
    const scaling_factor_y =
      (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

    const scaling_factor_x = 0.03333;

    if (i === 0) {
      // Apply scaling factors
      scaleInPlace(x_temp, scaling_factor_x);
      scaleInPlace(y_temp, scaling_factor_y);

      if (asyncMode) {
        if (output >= capture_threshold) {
          // overwrite morphology with pacing
          beatList[i] = "Ventricular pacing";

          ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
          x_temp = xTemp0.slice();
          y_temp = yTemp0.slice();

          const scaling_factor_y2 =
            (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

          scaleInPlace(x_temp, scaling_factor_x);
          scaleInPlace(y_temp, scaling_factor_y2);

          x = x_temp;
          y = y_temp;

          beatList.push("Ventricular pacing");
          offset = max_time_since_sensed + arrayMin(x_temp);

          recordPace(x_temp);
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);
        }
      } else if (maxAbs(y_temp) >= sensitivity) {
        const idx = firstIndexAbsGE(y_temp, sensitivity);
        time_sensed = x_temp[idx];

        if (time_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            x_temp = xTemp0.slice();
            y_temp = yTemp0.slice();

            const scaling_factor_y2 =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

            scaleInPlace(x_temp, scaling_factor_x);
            scaleInPlace(y_temp, scaling_factor_y2);

            x = x_temp;
            y = y_temp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = arrayMin(x_temp) + SENSE_ALIGNMENT;
            time_since_sensed = 0;

            recordPace(x_temp);
          } else {
            x = x_temp;
            y = y_temp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = time_sensed;
            time_since_sensed = 0;

            recordSense(time_sensed);
          }
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);

          time_prev_sensed = time_sensed;
          time_since_sensed = 0;

          recordSense(time_sensed);
        }
      } else {
        // not sensed
        time_since_sensed += arrayMax(x_temp);

        if (time_since_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            x_temp = xTemp0.slice();
            y_temp = yTemp0.slice();

            const scaling_factor_y2 =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

            scaleInPlace(x_temp, scaling_factor_x);
            scaleInPlace(y_temp, scaling_factor_y2);

            x = x_temp;
            y = y_temp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = arrayMin(x_temp) + SENSE_ALIGNMENT;
            time_since_sensed = 0;

            recordPace(x_temp);
          } else {
            x = x_temp;
            y = y_temp;

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);
          }
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);
        }
      }
    } else {
      // 2nd beat onwards: apply scaling factors and shift by offset
      scaleInPlace(x_temp, scaling_factor_x);
      scaleInPlace(y_temp, scaling_factor_y);
      shiftInPlace(x_temp, offset);

      if (asyncMode) {
        if (output >= capture_threshold) {
          // Python DOES NOT regenerate paced morphology here — it just concatenates current beat.
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push("Ventricular pacing");
          offset = max_time_since_sensed + arrayMin(x_temp);

          // best-effort marker
          recordPace(x_temp);
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);
        }
      } else if (maxAbs(y_temp) >= sensitivity) {
        const idx = firstIndexAbsGE(y_temp, sensitivity);
        time_sensed = x_temp[idx];
        time_since_sensed = time_sensed - time_prev_sensed;

        if (time_since_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            beatList[i] = "Ventricular pacing";

            // regenerate paced beat (like python)
            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            x_temp = xTemp0.slice();
            y_temp = yTemp0.slice();

            const scaling_factor_y2 =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

            scaleInPlace(x_temp, scaling_factor_x);
            scaleInPlace(y_temp, scaling_factor_y2);

            if (beatList[i - 1] === "Slow conduction") {
              offset = max_time_since_sensed + time_prev_sensed - SENSE_ALIGNMENT;
            } else {
              offset = offset - gap + max_time_since_sensed;
            }

            shiftInPlace(x_temp, offset);

            ({ x, y } = concatWithOverlapCut(x, y, x_temp, y_temp));

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = arrayMin(x_temp) + SENSE_ALIGNMENT;
            time_since_sensed = 0;

            recordPace(x_temp);
          } else {
            x = concat(x, x_temp);
            y = concat(y, y_temp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = time_sensed;
            time_since_sensed = 0;

            recordSense(time_sensed);
          }
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);

          time_prev_sensed = time_sensed;
          time_since_sensed = 0;

          recordSense(time_sensed);
        }
      } else {
        // not sensed
        time_since_sensed += arrayMax(x_temp) - time_prev_sensed;

        if (time_since_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            beatList[i] = "Ventricular pacing";

            ({ x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]));
            x_temp = xTemp0.slice();
            y_temp = yTemp0.slice();

            const scaling_factor_y2 =
              (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

            scaleInPlace(x_temp, scaling_factor_x);
            scaleInPlace(y_temp, scaling_factor_y2);

            if (beatList[i - 1] === "Slow conduction") {
              offset = max_time_since_sensed + time_prev_sensed - SENSE_ALIGNMENT;
            } else {
              offset += max_time_since_sensed - gap;
            }

            shiftInPlace(x_temp, offset);

            ({ x, y } = concatWithOverlapCut(x, y, x_temp, y_temp));

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);

            time_prev_sensed = arrayMin(x_temp) + SENSE_ALIGNMENT;
            time_since_sensed = 0;

            recordPace(x_temp);
          } else {
            x = concat(x, x_temp);
            y = concat(y, y_temp);

            beatList.push("Slow conduction");
            offset = gap + arrayMin(x_temp);
          }
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push("Slow conduction");
          offset = gap + arrayMin(x_temp);
        }
      }
    }
  }

  return { x, y, beatList, events: { pace: paceEvents, sense: senseEvents } };
}
