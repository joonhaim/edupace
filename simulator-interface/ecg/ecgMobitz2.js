import { getECGWave } from "./ecgMorphology.js";

// ---------- helpers ----------
function arrayMax(arr) { let m = -Infinity; for (let i=0;i<arr.length;i++) if (arr[i]>m) m=arr[i]; return m; }
function arrayMin(arr) { let m =  Infinity; for (let i=0;i<arr.length;i++) if (arr[i]<m) m=arr[i]; return m; }
function maxAbs(arr)   { let m = 0; for (let i=0;i<arr.length;i++){ const a=Math.abs(arr[i]); if (a>m) m=a; } return m; }
function firstIndexAbsGE(arr, thr){ for (let i=0;i<arr.length;i++) if (Math.abs(arr[i]) >= thr) return i; return -1; }
function scaleInPlace(arr, s){ for (let i=0;i<arr.length;i++) arr[i] *= s; }
function shiftInPlace(arr, dx){ for (let i=0;i<arr.length;i++) arr[i] += dx; }
function concat(a,b){ const out=new Array(a.length+b.length); for(let i=0;i<a.length;i++) out[i]=a[i]; for(let j=0;j<b.length;j++) out[a.length+j]=b[j]; return out; }

// Python overlap snippet used in a few branches:
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

function rand() { return Math.random(); } // np.random.random()

// ---------- Mobitz Type II ----------
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

  // ---- SAFETY for rate<=0 (Pacemaker OFF) ----
  const pacingEnabled = Number.isFinite(rate) && rate > 0;
  const max_time_since_sensed = pacingEnabled ? (60 / rate) : Infinity;
  const asyncMode = pacingEnabled ? !!asynchronous : false;

  let offset = 0;
  let time_since_sensed = 0;
  let time_prev_sensed = 0;
  let time_sensed = 0;

  // Python: capture_threshold = 1.5 + 0.2*rand - 0.1  (=> 1.4..1.6)
  const capture_threshold = 1.5 + 0.2 * rand() - 0.1;

  const gap = 60 / patientHR;

  // Initial beat_list selection
  let beatList;
  let rand_num = rand();
  if (rand_num < probConduction) beatList = ["Normal"];
  else beatList = ["Mobitz type II - no conduction"];

  let x = [];
  let y = [];

  // Optional events (kept for compatibility; Python doesn’t explicitly return them here)
  const paceEvents = [];
  const senseEvents = [];

  const recordPace = (xArr, pacemaker_spike) => {
    // Python treats "sensed" time for pacing as min(x_temp)+pacemaker_spike
    paceEvents.push(arrayMin(xArr) + pacemaker_spike);
  };
  const recordSense = (t) => { if (Number.isFinite(t)) senseEvents.push(t); };

  for (let i = 0; i < iterations; i++) {
    // x_temp, y_temp = ecg_func(beat_list[i])
    let { x: xTemp0, y: yTemp0 } = getECGWave(beatList[i]);
    let x_temp = xTemp0.slice();
    let y_temp = yTemp0.slice();

    // Python draws a new rand_num each iteration (used to pick NEXT beat)
    rand_num = rand();

    // scaling factors (exact Python)
    const scaling_factor_y =
      (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));
    const scaling_factor_x = 0.03333;

    const scaling_factor_y_heartblock = scaling_factor_y * 0.08;
    const scaling_factor_x_heartblock = scaling_factor_x;

    const pacemaker_spike = scaling_factor_x * 4.380709;
    // const R_wave_pos = scaling_factor_x * 6.36909; // computed in Python but unused

    const pickNextBeat = () =>
      (rand_num > probConduction) ? "Mobitz type II - no conduction" : "Normal";

    if (i === 0) {
      // Apply scaling factors for the first beat
      if (beatList[i] === "Normal") {
        scaleInPlace(x_temp, scaling_factor_x);
        scaleInPlace(y_temp, scaling_factor_y);
      } else if (beatList[i] === "Mobitz type II - no conduction") {
        scaleInPlace(x_temp, scaling_factor_x_heartblock);
        scaleInPlace(y_temp, scaling_factor_y_heartblock);
      }

      if (asyncMode) {
        if (output >= capture_threshold) {
          // overwrite beat to pacing
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
          recordPace(x_temp, pacemaker_spike);
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push(pickNextBeat());
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

            beatList.push(pickNextBeat());
            time_prev_sensed = arrayMin(x_temp) + pacemaker_spike;
            offset = gap + arrayMin(x_temp);
            time_since_sensed = 0;

            recordPace(x_temp, pacemaker_spike);
          } else {
            x = x_temp;
            y = y_temp;

            beatList.push(pickNextBeat());
            offset = gap + arrayMin(x_temp);
            time_prev_sensed = time_sensed;
            time_since_sensed = 0;

            recordSense(time_sensed);
          }
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push(pickNextBeat());
          offset = gap + arrayMin(x_temp);
          time_prev_sensed = time_sensed;
          time_since_sensed = 0;

          recordSense(time_sensed);
        }
      } else {
        // Sensitivity threshold isn't crossed
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

            beatList.push(pickNextBeat());
            time_prev_sensed = arrayMin(x_temp) + pacemaker_spike;
            offset = gap + arrayMin(x_temp);
            time_since_sensed = 0;

            recordPace(x_temp, pacemaker_spike);
          } else {
            x = x_temp;
            y = y_temp;

            beatList.push(pickNextBeat());
            offset = gap + arrayMin(x_temp);
          }
        } else {
          x = x_temp;
          y = y_temp;

          beatList.push(pickNextBeat());
          offset = gap + arrayMin(x_temp);
        }
      }
    } else {
      // Second beat onwards: apply scaling + shift by offset (per current beat type)
      if (beatList[i] === "Normal") {
        scaleInPlace(x_temp, scaling_factor_x);
        scaleInPlace(y_temp, scaling_factor_y);
        shiftInPlace(x_temp, offset);
      } else if (beatList[i] === "Mobitz type II - no conduction") {
        scaleInPlace(x_temp, scaling_factor_x_heartblock);
        scaleInPlace(y_temp, scaling_factor_y_heartblock);
        shiftInPlace(x_temp, offset);
      }

      if (asyncMode) {
        if (output >= capture_threshold) {
          // NOTE: Python does this *again* (double scale + add offset again). We mirror it exactly.
          const scaling_factor_y2 =
            (1.0 + (rand() * 0.6 - 0.3)) / (arrayMax(y_temp) - arrayMin(y_temp));

          scaleInPlace(x_temp, scaling_factor_x);
          scaleInPlace(y_temp, scaling_factor_y2);
          shiftInPlace(x_temp, offset);

          ({ x, y } = concatWithOverlapCut(x, y, x_temp, y_temp));

          beatList.push("Ventricular pacing");
          offset = max_time_since_sensed + arrayMin(x_temp);

          recordPace(x_temp, pacemaker_spike);
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push(pickNextBeat());
          offset = gap + arrayMin(x_temp);
        }
      } else if (maxAbs(y_temp) >= sensitivity) {
        const idx = firstIndexAbsGE(y_temp, sensitivity);
        time_sensed = x_temp[idx];
        time_since_sensed = time_sensed - time_prev_sensed;

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

            if (
              beatList[i - 1] === "Normal" ||
              beatList[i - 1] === "Mobitz type II - no conduction"
            ) {
              offset = max_time_since_sensed + time_prev_sensed - pacemaker_spike;
            } else {
              offset = offset - gap + max_time_since_sensed;
            }

            shiftInPlace(x_temp, offset);
            ({ x, y } = concatWithOverlapCut(x, y, x_temp, y_temp));

            beatList.push(pickNextBeat());
            time_prev_sensed = arrayMin(x_temp) + pacemaker_spike;
            offset = gap + arrayMin(x_temp);
            time_since_sensed = 0;

            recordPace(x_temp, pacemaker_spike);
          } else {
            x = concat(x, x_temp);
            y = concat(y, y_temp);

            beatList.push(pickNextBeat());
            offset = gap + arrayMin(x_temp);
            time_prev_sensed = time_sensed;
            time_since_sensed = 0;

            recordSense(time_sensed);
          }
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push(pickNextBeat());
          offset = gap + arrayMin(x_temp);
          time_prev_sensed = time_sensed;
          time_since_sensed = 0;

          recordSense(time_sensed);
        }
      } else {
        // sensitivity threshold isn't crossed
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

            if (
              beatList[i - 1] === "Normal" ||
              beatList[i - 1] === "Mobitz type II - no conduction"
            ) {
              offset = max_time_since_sensed + time_prev_sensed - pacemaker_spike;
            } else {
              offset = offset + max_time_since_sensed - gap;
            }

            shiftInPlace(x_temp, offset);
            ({ x, y } = concatWithOverlapCut(x, y, x_temp, y_temp));

            beatList.push(pickNextBeat());
            time_prev_sensed = arrayMin(x_temp) + pacemaker_spike;
            offset = gap + arrayMin(x_temp);
            time_since_sensed = 0;

            recordPace(x_temp, pacemaker_spike);
          } else {
            x = concat(x, x_temp);
            y = concat(y, y_temp);

            beatList.push(pickNextBeat());
            offset = gap + arrayMin(x_temp);
          }
        } else {
          x = concat(x, x_temp);
          y = concat(y, y_temp);

          beatList.push(pickNextBeat());
          offset = gap + arrayMin(x_temp);
        }
      }
    }
  }

  return { x, y, beatList, events: { pace: paceEvents, sense: senseEvents } };
}
