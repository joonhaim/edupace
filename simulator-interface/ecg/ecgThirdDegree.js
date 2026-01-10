import { getECGWave } from "./ecgMorphology.js";

// helpers
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
function lowerBound(arr, val) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Port of:
 * def third_deg_heart_block(ecg_func,iterations,sensitivity,output,rate,patient_HR,asynchronous=False)
 *
 * Returns {x,y,beatList} where beatList is for the ventricular decision each cycle ("Normal" vs "Ventricular pacing")
 */
export function thirdDegHeartBlock(cfg) {
  const {
    iterations,
    sensitivity,
    output,
    rate,
    patientHR,
    asynchronous = false,
  } = cfg;

  const RR_interval = 60 / patientHR;
  const PP_interval = RR_interval * 0.7;

  // Python constants
  const max_time_since_sensed = 60 / rate;
  const capture_threshold = 1.5 + 0.4 * Math.random() - 0.2; // 1.3..1.7
  const ALIGN = 0.003305785; // from python: 0.003305785

  // "storage" and "max_vals" equivalents
  // We store each wave by its wave_num index.
  const storage = new Array(iterations * 2); // each entry: { x:[], y:[], maxX, minX, maxY }
  const maxVals = new Array(iterations * 2); // each entry: { idx, maxX }

  let wave_num = 0;

  let time_since_sensed = 0;
  let time_prev_sensed = 0;

  // beat_list in python stores ONLY the ventricular decisions (R or paced) per cycle
  const beatList = [];
  const paceEvents = [];
  const senseEvents = [];

  const recordPace = (xArr, yArr) => {
    const time = peakTime(xArr, yArr);
    if (time !== null) paceEvents.push(time);
  };

  const recordSense = (time) => {
    if (Number.isFinite(time)) senseEvents.push(time);
  };

  // output arrays
  let x = [];
  let y = [];

  // offsets (assigned during run)
  let offset_P = 0;
  let offset_R = 0;
  let offset_async_capture = 0;

  // helper to store one wave at a given wave_num
  function storeWave(idx, xArr, yArr) {
    const maxX = arrayMax(xArr);
    const minX = arrayMin(xArr);
    const maxY = arrayMax(yArr);
    storage[idx] = { x: xArr, y: yArr, maxX, minX, maxY };
    maxVals[idx] = { idx, maxX };
  }

  // helper: previous ventricular decision ("Normal" or "Ventricular pacing")
  function prevVentricularType() {
    // python uses beat_list[(wave_num-1)//2-1]; which is effectively "previous ventricular"
    return beatList.length ? beatList[beatList.length - 1] : "Normal";
  }

  while (wave_num < iterations * 2) {
    // Generate morphology (fresh each loop like python)
    let { x: Px0, y: Py0 } = getECGWave("3rd degree heart block P wave");
    let { x: Rx0, y: Ry0 } = getECGWave("3rd degree heart block R wave");
    let { x: paced_x0, y: paced_y0 } = getECGWave("3rd degree heart block ventricular pacing");

    // Copy so we can mutate
    let Px = Px0.slice(), Py = Py0.slice();
    let Rx = Rx0.slice(), Ry = Ry0.slice();
    let paced_x = paced_x0.slice(), paced_y = paced_y0.slice();

    // Scaling factors (exact Python)
    const scaling_factor_x_R = 0.28 / 3.05;
    const scaling_factor_x_P = 0.06 / 0.9;
    const scaling_factor_x_paced = 0.4 / 3.872;

    const scaling_factor_y_R = 0.295 + 0.06 * Math.random() - 0.03;
    const scaling_factor_y_P = 0.1477 + 0.06 * Math.random() - 0.03;
    const scaling_factor_y_paced = 1.333 * (0.05 + 0.006 * Math.random() - 0.003);

    // Apply scaling
    scaleInPlace(Px, scaling_factor_x_P);
    scaleInPlace(Py, scaling_factor_y_P);

    scaleInPlace(Rx, scaling_factor_x_R);
    scaleInPlace(Ry, scaling_factor_y_R);

    scaleInPlace(paced_x, scaling_factor_x_paced);
    scaleInPlace(paced_y, scaling_factor_y_paced);

    if (wave_num === 0) {
      // First beat
      const PR_dist = PP_interval - (0.1 * Math.random() + 0.1);
      shiftInPlace(Rx, PR_dist); // Rx += PR_dist

      // store P
      storeWave(wave_num, Px, Py);
      offset_P = arrayMin(Px) + PP_interval;
      wave_num += 1;

      // Decide ventricular (R or paced)
      if (asynchronous) {
        if (output >= capture_threshold) {
          shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
          recordPace(paced_x, paced_y);
          storeWave(wave_num, paced_x, paced_y);
          wave_num += 1;

          offset_async_capture = arrayMin(paced_x) + max_time_since_sensed;
          beatList.push("Ventricular pacing");
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          beatList.push("Normal");
        }
      } else if (maxAbs(Ry) > sensitivity) {
        const idx = firstIndexAbsGE(Ry, sensitivity);
        const time_sensed = Rx[idx];

        if (time_sensed > max_time_since_sensed) {
          if (output >= capture_threshold) {
            shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
            recordPace(paced_x, paced_y);
            storeWave(wave_num, paced_x, paced_y);
            wave_num += 1;

            offset_R = arrayMin(paced_x) + RR_interval;
            time_prev_sensed = arrayMin(paced_x) + ALIGN;
            beatList.push("Ventricular pacing");
          } else {
            storeWave(wave_num, Rx, Ry);
            wave_num += 1;
            recordSense(time_sensed);

            offset_R = arrayMin(Rx) + RR_interval;
            time_prev_sensed = time_sensed;
            beatList.push("Normal");
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;
          recordSense(time_sensed);

          offset_R = arrayMin(Rx) + RR_interval;
          time_prev_sensed = time_sensed;
          beatList.push("Normal");
        }
      } else {
        // not sensed
        time_since_sensed += arrayMax(Rx);
        if (time_since_sensed > max_time_since_sensed) {
          if (output >= capture_threshold) {
            shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
            recordPace(paced_x, paced_y);
            storeWave(wave_num, paced_x, paced_y);
            wave_num += 1;

            offset_R = arrayMin(paced_x) + RR_interval;
            time_prev_sensed = arrayMin(paced_x) + ALIGN;
            time_since_sensed = 0;
            beatList.push("Ventricular pacing");
          } else {
            storeWave(wave_num, Rx, Ry);
            wave_num += 1;

            offset_R = arrayMin(Rx) + RR_interval;
            beatList.push("Normal");
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          beatList.push("Normal");
        }
      }
    } else {
      // 2nd beat onwards
      shiftInPlace(Px, offset_P);
      if (!asynchronous) shiftInPlace(Rx, offset_R);

      // store P
      storeWave(wave_num, Px, Py);
      offset_P = arrayMin(Px) + PP_interval;
      wave_num += 1;

      // Decide ventricular (R or paced)
      if (asynchronous) {
        if (output >= capture_threshold) {
          shiftInPlace(paced_x, offset_async_capture);
          recordPace(paced_x, paced_y);
          storeWave(wave_num, paced_x, paced_y);
          wave_num += 1;

          offset_async_capture = arrayMin(paced_x) + max_time_since_sensed;
          beatList.push("Ventricular pacing");
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          beatList.push("Normal");
        }
      } else if (maxAbs(Ry) > sensitivity) {
        const idx = firstIndexAbsGE(Ry, sensitivity);
        const time_sensed = Rx[idx];
        time_since_sensed = time_sensed - time_prev_sensed;

        if (time_since_sensed > max_time_since_sensed) {
          if (output >= capture_threshold) {
            let offset_paced;
            if (prevVentricularType() === "Normal") {
              offset_paced = max_time_since_sensed + time_prev_sensed - ALIGN;
            } else {
              offset_paced = offset_R - RR_interval + max_time_since_sensed;
            }

            shiftInPlace(paced_x, offset_paced);
            recordPace(paced_x, paced_y);
            storeWave(wave_num, paced_x, paced_y);
            wave_num += 1;

            offset_R = arrayMin(paced_x) + RR_interval;
            time_prev_sensed = arrayMin(paced_x) + ALIGN;
            beatList.push("Ventricular pacing");
            time_since_sensed = 0;
          } else {
            storeWave(wave_num, Rx, Ry);
            wave_num += 1;
            recordSense(time_sensed);

            offset_R = arrayMin(Rx) + RR_interval;
            time_prev_sensed = time_sensed;
            beatList.push("Normal");
            time_since_sensed = 0;
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;
          recordSense(time_sensed);

          offset_R = arrayMin(Rx) + RR_interval;
          time_prev_sensed = time_sensed;
          time_since_sensed = 0;
          beatList.push("Normal");
        }
      } else {
        // not sensed
        time_since_sensed += arrayMax(Rx);

        if (time_since_sensed > max_time_since_sensed) {
          if (output >= capture_threshold) {
            let offset_paced;
            if (prevVentricularType() === "Normal") {
              offset_paced = max_time_since_sensed + time_prev_sensed - ALIGN;
            } else {
              offset_paced = offset_R - RR_interval + max_time_since_sensed;
            }

            shiftInPlace(paced_x, offset_paced);
            recordPace(paced_x, paced_y);
            storeWave(wave_num, paced_x, paced_y);
            wave_num += 1;

            offset_R = arrayMin(paced_x) + RR_interval;
            time_prev_sensed = arrayMin(paced_x) + ALIGN;
            beatList.push("Ventricular pacing");
            time_since_sensed = 0;
          } else {
            storeWave(wave_num, Rx, Ry);
            wave_num += 1;

            offset_R = arrayMin(Rx) + RR_interval;
            beatList.push("Normal");
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          beatList.push("Normal");
        }
      }
    }
  }

  // --- Ordering + overlap resolution (ports your post-processing) ---
  const maxValsSorted = maxVals
    .slice(0, wave_num)
    .sort((a, b) => a.maxX - b.maxX);

  for (let i = 0; i < wave_num; i++) {
    const idx = maxValsSorted[i].idx;
    const wave = storage[idx];
    const xTemp = wave.x;
    const yTemp = wave.y;

    if (i === 0) {
      x = concat(x, xTemp);
      y = concat(y, yTemp);
      continue;
    }

    // overlap check
    if (arrayMin(xTemp) < arrayMax(x)) {
      // python: if np.max(y_temp) >= np.max(storage[2,idx-1]) then treat as R wave and replace overlap
      const prevIdx = idx - 1;
      const prevMaxY = storage[prevIdx] ? storage[prevIdx].maxY : -Infinity;

      if (arrayMax(yTemp) >= prevMaxY) {
        // find overlap start index in existing x
        const overlapStart = lowerBound(x, arrayMin(xTemp));
        x = x.slice(0, overlapStart);
        y = y.slice(0, overlapStart);

        x = concat(x, xTemp);
        y = concat(y, yTemp);
      } else {
        // P wave: do nothing
      }
    } else {
      x = concat(x, xTemp);
      y = concat(y, yTemp);
    }
  }

  return { x, y, beatList, events: { pace: paceEvents, sense: senseEvents } };
}
