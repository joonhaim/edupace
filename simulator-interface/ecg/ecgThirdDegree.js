import { getECGWave } from "./ecgMorphology.js";

// helpers
function arrayMax(arr) { let m = -Infinity; for (let i=0;i<arr.length;i++) if (arr[i]>m) m=arr[i]; return m; }
function arrayMin(arr) { let m =  Infinity; for (let i=0;i<arr.length;i++) if (arr[i]<m) m=arr[i]; return m; }
function maxAbs(arr)   { let m = 0; for (let i=0;i<arr.length;i++) { const a=Math.abs(arr[i]); if (a>m) m=a; } return m; }
function firstIndexAbsGE(arr, thr) { for (let i=0;i<arr.length;i++) if (Math.abs(arr[i]) >= thr) return i; return -1; }
function scaleInPlace(arr, s) { for (let i=0;i<arr.length;i++) arr[i] *= s; }
function shiftInPlace(arr, dx){ for (let i=0;i<arr.length;i++) arr[i] += dx; }
function concat(a,b){ const out=new Array(a.length+b.length); for(let i=0;i<a.length;i++) out[i]=a[i]; for(let j=0;j<b.length;j++) out[a.length+j]=b[j]; return out; }
function lowerBound(arr, val){
  let lo=0, hi=arr.length;
  while(lo<hi){ const mid=(lo+hi)>>1; if(arr[mid]<val) lo=mid+1; else hi=mid; }
  return lo;
}

export function thirdDegHeartBlock(cfg) {
  const {
    iterations = 20,
    sensitivity = 0.4,
    output = 1.8,
    rate = 80,
    patientHR = 60,
    asynchronous = false,
  } = cfg;

  const RR_interval = 60 / patientHR;
  const PP_interval = RR_interval * 0.7;

  // --- SAFETY for rate<=0 (Pacemaker OFF) ---
  const pacingEnabled = Number.isFinite(rate) && rate > 0;
  const max_time_since_sensed = pacingEnabled ? (60 / rate) : Infinity;
  const asyncMode = pacingEnabled ? !!asynchronous : false;

  // Python: capture_threshold = 1.5 + 0.4*rand - 0.2  (=> 1.3..1.7)
  const capture_threshold = 1.5 + 0.4 * Math.random() - 0.2;

  const ALIGN = 0.003305785;

  // storage equivalent
  const storage = new Array(iterations * 2); // {x,y,maxX,minX,maxY}
  const maxVals = new Array(iterations * 2); // {idx,maxX}
  let wave_num = 0;

  let time_since_sensed = 0;
  let time_prev_sensed = 0;

  // beat_list in python = ventricular outcomes only
  const beatList = [];

  // optional events (kept for UI compatibility)
  const paceEvents = [];
  const senseEvents = [];
  const recordPaceAtAlign = (paced_x) => {
    // faithful: min(paced_x)+ALIGN after shifting
    paceEvents.push(arrayMin(paced_x) + ALIGN);
  };
  const recordSense = (t) => { if (Number.isFinite(t)) senseEvents.push(t); };

  // offsets
  let offset_P = 0;
  let offset_R = 0;
  let offset_async_capture = 0;

  function storeWave(idx, xArr, yArr) {
    const maxX = arrayMax(xArr), minX = arrayMin(xArr), maxY = arrayMax(yArr);
    storage[idx] = { x: xArr, y: yArr, maxX, minX, maxY };
    maxVals[idx] = { idx, maxX };
  }

  function prevVentricularType() {
    return beatList.length ? beatList[beatList.length - 1] : "Normal";
  }

  while (wave_num < iterations * 2) {
    // Calculate traces
    let { x: Px0, y: Py0 } = getECGWave("3rd degree heart block P wave");
    let { x: Rx0, y: Ry0 } = getECGWave("3rd degree heart block R wave");
    let { x: paced_x0, y: paced_y0 } = getECGWave("3rd degree heart block ventricular pacing");

    let Px = Px0.slice(), Py = Py0.slice();
    let Rx = Rx0.slice(), Ry = Ry0.slice();
    let paced_x = paced_x0.slice(), paced_y = paced_y0.slice();

    // Scaling factors (EXACT from your posted Python)
    const scaling_factor_x_R = 0.16 / 3.05;   // comment says 0.28s, but code is 0.16/3.05
    const scaling_factor_x_P = 0.06 / 0.9;
    const scaling_factor_x_paced = 0.4 / 3.872;

    const scaling_factor_y_P = 0.1477 + 0.06 * Math.random() - 0.03;
    const scaling_factor_y_paced =
      (1 + (Math.random() * 0.6 - 0.3)) / (arrayMax(paced_y) - arrayMin(paced_y));
    const scaling_factor_y_R =
      (1 + (Math.random() * 0.6 - 0.3)) / (arrayMax(Ry) - arrayMin(Ry));

    // Apply scaling factors
    scaleInPlace(Px, scaling_factor_x_P);
    scaleInPlace(Py, scaling_factor_y_P);

    scaleInPlace(Rx, scaling_factor_x_R);
    scaleInPlace(Ry, scaling_factor_y_R);

    scaleInPlace(paced_x, scaling_factor_x_paced);
    scaleInPlace(paced_y, scaling_factor_y_paced);

    if (wave_num === 0) {
      // First beat
      const PR_dist = PP_interval - (0.1 * Math.random() + 0.1);
      shiftInPlace(Rx, PR_dist);

      // store P
      storeWave(wave_num, Px, Py);
      offset_P = arrayMin(Px) + PP_interval;
      wave_num += 1;

      // Ventricular decision (async / sensed / not sensed)
      if (asyncMode) {
        if (output >= capture_threshold) {
          shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
          recordPaceAtAlign(paced_x);
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
          if (pacingEnabled && output >= capture_threshold) {
            shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
            recordPaceAtAlign(paced_x);
            storeWave(wave_num, paced_x, paced_y);
            wave_num += 1;

            offset_R = arrayMin(paced_x) + RR_interval;
            time_prev_sensed = arrayMin(paced_x) + ALIGN;
            beatList.push("Ventricular pacing");
          } else {
            storeWave(wave_num, Rx, Ry);
            wave_num += 1;

            offset_R = arrayMin(Rx) + RR_interval;
            time_prev_sensed = time_sensed;
            recordSense(time_sensed);
            beatList.push("Normal");
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          time_prev_sensed = time_sensed;
          recordSense(time_sensed);
          beatList.push("Normal");
        }
      } else {
        time_since_sensed += arrayMax(Rx);

        if (time_since_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            shiftInPlace(paced_x, max_time_since_sensed - ALIGN);
            recordPaceAtAlign(paced_x);
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
      if (!asyncMode) shiftInPlace(Rx, offset_R);

      // store P (always)
      storeWave(wave_num, Px, Py);
      offset_P = arrayMin(Px) + PP_interval;
      wave_num += 1;

      if (asyncMode) {
        if (output >= capture_threshold) {
          shiftInPlace(paced_x, offset_async_capture);
          recordPaceAtAlign(paced_x);
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
          if (pacingEnabled && output >= capture_threshold) {
            let offset_paced;
            if (prevVentricularType() === "Normal") offset_paced = max_time_since_sensed + time_prev_sensed - ALIGN;
            else offset_paced = offset_R - RR_interval + max_time_since_sensed;

            shiftInPlace(paced_x, offset_paced);
            recordPaceAtAlign(paced_x);
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
            time_prev_sensed = time_sensed;
            recordSense(time_sensed);
            beatList.push("Normal");
            time_since_sensed = 0;
          }
        } else {
          storeWave(wave_num, Rx, Ry);
          wave_num += 1;

          offset_R = arrayMin(Rx) + RR_interval;
          time_prev_sensed = time_sensed;
          recordSense(time_sensed);
          time_since_sensed = 0;
          beatList.push("Normal");
        }
      } else {
        time_since_sensed += arrayMax(Rx);

        if (time_since_sensed > max_time_since_sensed) {
          if (pacingEnabled && output >= capture_threshold) {
            let offset_paced;
            if (prevVentricularType() === "Normal") offset_paced = max_time_since_sensed + time_prev_sensed - ALIGN;
            else offset_paced = offset_R - RR_interval + max_time_since_sensed;

            shiftInPlace(paced_x, offset_paced);
            recordPaceAtAlign(paced_x);
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

  // --- Ordering + overlap prevention (matches your Python post-pass) ---
  const maxValsSorted = maxVals
    .slice(0, wave_num)
    .sort((a, b) => a.maxX - b.maxX);

  let x = [];
  let y = [];

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

    if (arrayMin(xTemp) < arrayMax(x)) {
      // Python: if max(y_temp) >= max(storage[2, idx-1]) treat as R wave and replace overlap
      const prev = storage[idx - 1];
      const prevMaxY = prev ? prev.maxY : -Infinity;

      if (arrayMax(yTemp) >= prevMaxY) {
        const overlapStart = lowerBound(x, arrayMin(xTemp));
        x = x.slice(0, overlapStart);
        y = y.slice(0, overlapStart);

        x = concat(x, xTemp);
        y = concat(y, yTemp);
      } else {
        // P wave: do nothing (exactly like your Python "do nothing")
      }
    } else {
      x = concat(x, xTemp);
      y = concat(y, yTemp);
    }
  }

  return { x, y, beatList, events: { pace: paceEvents, sense: senseEvents } };
}
