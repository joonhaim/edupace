// ----- GLOBAL t -----
export const T = Array.from({ length: 101 }, (_, i) => i / 100);

// ----- Helpers -----
function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

function maxArray(arr) {
  return Math.max(...arr);
}

function minArray(arr) {
  return Math.min(...arr);
}

function argMax(arr) {
  let idx = 0;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
      idx = i;
    }
  }
  return idx;
}

function argMin(arr) {
  let idx = 0;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
      idx = i;
    }
  }
  return idx;
}

// ----- Rational Bezier -----
export function bPolynomial(tArray, P) {
  const n = P.length - 1;
  const B_x = [];
  const B_y = [];

  for (let j = 0; j < tArray.length; j++) {
    const t = tArray[j];
    let numX = 0;
    let numY = 0;
    let denom = 0;

    for (let i = 0; i <= n; i++) {
      const [w, x, y] = P[i];
      const comb = binomial(n, i);
      const B_i = comb * Math.pow(t, i) * Math.pow(1 - t, n - i);
      numX += B_i * w * x;
      numY += B_i * w * y;
      denom += B_i * w;
    }

    B_x.push(numX / denom);
    B_y.push(numY / denom);
  }

  return { x: B_x, y: B_y };
}

// ----- ECG wave shapes -----
export function ecgWave(signalType) {
  let x, y;

  if (signalType === "Normal") {
    const points_preP = [
      [1, 0, 0],
      [1, 0.5, 0],
      [1, 1, 0],
      [1, 1.5, 0],
      [1, 2, 0],
      [1, 2.5, 0],
      [1, 3, 0],
    ];
    const points_P = [
      [10, 3.5, 0],
      [1, 4, 0.3],
      [2, 5, 0.9],
      [20, 6, 1.3],
      [2, 7, 0.8],
      [1.5, 7.3, 0.5],
      [10, 8, 0],
    ];
    const points_preQRS = [
      [1, 8.25, 0],
      [1, 8.5, 0],
      [1, 8.75, 0],
      [1, 9, 0],
      [1, 9.25, 0],
      [1, 9.5, 0],
      [1, 10, 0],
    ];
    const points_QRS = [
      [10, 10.3, 0],
      [500, 11.1, -1.5],
      [10, 11.25, 0],
      [1000, 12, 11],
      [10, 12.65, 0],
      [500, 12.85, -3.3],
      [10, 13.7, 0],
    ];
    const points_preT = [
      [1, 14, 0],
      [1, 14.5, 0],
      [1, 14.75, 0],
      [1, 15, 0],
      [1, 15.5, 0],
      [1, 16, 0],
      [1, 16.5, 0],
    ];
    const points_T = [
      [10, 17, 0],
      [1, 18, 1],
      [2, 19, 1.9],
      [20, 19.6, 2.1],
      [2, 21, 0.55],
      [10, 21.4, 0],
    ];
    const points_postT = [
      [1, 21.5, 0],
      [1, 22, 0],
      [1, 22.5, 0],
      [1, 23, 0],
      [1, 23.5, 0],
      [1, 24, 0],
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const preQRS = bPolynomial(T, points_preQRS);
    const QRS = bPolynomial(T, points_QRS);
    const preT = bPolynomial(T, points_preT);
    const Tseg = bPolynomial(T, points_T);
    const postT = bPolynomial(T, points_postT);

    x = [
      ...preP.x,
      ...P.x,
      ...preQRS.x,
      ...QRS.x,
      ...preT.x,
      ...Tseg.x,
      ...postT.x,
    ];
    y = [
      ...preP.y,
      ...P.y,
      ...preQRS.y,
      ...QRS.y,
      ...preT.y,
      ...Tseg.y,
      ...postT.y,
    ];
  } else if (signalType === "Ventricular pacing") {
    const points_preP = [
      [1, 0, 0],
      [1, 1, 0],
      [1, 2, 0],
      [1, 2.5, 0],
    ];
    const points_P = [
      [10, 2.9, 0],
      [5, 3.6, 0.7],
      [15, 4.15, 0.9],
      [15, 4.25, 0.9],
      [5, 4.7, 0.7],
      [10, 5.4, 0],
    ];
    const points_prePacemaker = [
      [1, 5.5, 0],
      [1, 6, 0],
      [1, 7, 0],
      [1, 8, 0],
    ];
    const points_Pacemaker = [
      [1, 8.3, 0],
      [10, 8.4, 14],
      [1, 8.5, 0],
    ];
    const points_QRS = [
      [2, 9, -0.8],
      [1, 9.5, -3.1],
      [5, 9.9, -7.1],
      [5, 10.2, -7.6],
      [1, 10.5, -11.5],
      [10, 11.05, -16.8],
      [1, 11.5, -14.6],
      [1, 12, -10.5],
      [1, 12.5, -6.4],
      [1, 13, -3],
      [10, 13.6, 0],
    ];
    const points_T = [
      [10, 13.61, 0],
      [1, 13.8, 0.4],
      [1, 14, 0.75],
      [1, 14.5, 1.8],
      [1, 15, 2.75],
      [1, 15.5, 3.6],
      [1, 16, 4.15],
      [5, 16.5, 4.75],
      [5, 17, 5.4],
      [15, 17.45, 5.7],
      [5, 18, 5.3],
      [5, 18.5, 4.4],
      [1, 19, 3],
      [1, 19.5, 1.6],
      [1, 20, 0.5],
      [1, 20.4, 0],
    ];
    const points_postT = [
      [1, 21, 0],
      [1, 22, 0],
      [1, 23, 0],
      [1, 24, 0],
      [1, 25, 0],
    ];

    const preP = bPolynomial(T, points_preP);
    const P = bPolynomial(T, points_P);
    const prePacemaker = bPolynomial(T, points_prePacemaker);
    const Pacemaker = bPolynomial(T, points_Pacemaker);
    const QRS = bPolynomial(T, points_QRS);
    const Tseg = bPolynomial(T, points_T);
    const postT = bPolynomial(T, points_postT);

    x = [
      ...preP.x,
      ...P.x,
      ...prePacemaker.x,
      ...Pacemaker.x,
      ...QRS.x,
      ...Tseg.x,
      ...postT.x,
    ];
    y = [
      ...preP.y,
      ...P.y,
      ...prePacemaker.y,
      ...Pacemaker.y,
      ...QRS.y,
      ...Tseg.y,
      ...postT.y,
    ];
  } else {
    throw new Error(`Unknown signal_type: ${signalType}`);
  }

  return { x, y };
}

// ----- HR → gap -----
export function heartRate(patientHR) {
  // same formula as Python heart_rate()
  const gap =
    (1500 * 0.04) / patientHR -
    0.4007574025940901 -
    0.39924259740590995;
  return gap;
}

// ----- Stitch beats with pacemaker logic -----
export function stitchBeatsNew(
  ecgFunc,      // function(signalType) -> { x, y }
  gap,          // base gap between beats
  regularity,   // 'Regular' or 'Irregular'
  sensitivity,  // mV
  rate,         // bpm
  output,       // mA
  asynchronous  // boolean
) {
  let beatList = ["Normal"];
  let offset = 0;
  let timeSinceSensed = 0;
  const maxTimeSinceSensed = (1500 * 0.04) / rate;
  const captureThreshold = 1.5;

  if (asynchronous) {
    regularity = "Regular"; // override if async
  }

  let x = [];
  let y = [];
  let R_location = 0;

  for (let i = 0; i < 10; i++) {
    // ecg_func(beat_list[i])
    const { x: xTempRaw, y: yTempRaw } = ecgFunc(beatList[i]);
    let x_temp = xTempRaw.slice();
    let y_temp = yTempRaw.slice();

    // Scaling factors
    let scaling_factor_x;
    if (regularity === "Irregular") {
      scaling_factor_x =
        (0.8 + (Math.random() * 0.6 - 0.3)) /
        (maxArray(x_temp) - minArray(x_temp));
    } else {
      scaling_factor_x =
        0.8 / (maxArray(x_temp) - minArray(x_temp));
    }
    const scaling_factor_y =
      (1.0 + (Math.random() * 0.6 - 0.3)) /
      (maxArray(y_temp) - minArray(y_temp));

    // Apply scaling
    x_temp = x_temp.map((v) => v * scaling_factor_x);
    y_temp = y_temp.map((v) => v * scaling_factor_y);

    if (offset === 0) {
      // First beat in beat_list
      R_location = 0;

      x = x_temp.slice();
      y = y_temp.slice();

      if (maxArray(y_temp) < sensitivity) {
        // beat not sensed
        timeSinceSensed += maxArray(x_temp);

        if (timeSinceSensed >= maxTimeSinceSensed) {
          if (output >= captureThreshold || asynchronous) {
            beatList.push("Ventricular pacing");
          } else {
            beatList.push("Normal");
          }
          timeSinceSensed = 0;
        } else if (asynchronous) {
          beatList.push("Ventricular pacing");
        } else {
          beatList.push("Normal");
        }
      } else {
        // beat sensed
        const idxR = argMax(y_temp);
        R_location = x_temp[idxR];

        if (asynchronous) {
          beatList.push("Ventricular pacing");
        } else {
          beatList.push("Normal");
        }
        timeSinceSensed = 0;
      }

      offset = maxArray(x_temp);
    } else {
      // Second beat onwards

      // gap variation
      if (regularity === "Irregular") {
        gap += Math.random() * gap;
      }
      const x_temp_shifted = x_temp.map((v) => v + offset + gap);

      x = x.concat(x_temp_shifted);
      y = y.concat(y_temp);

      offset = maxArray(x_temp_shifted);

      if (maxArray(y_temp) < sensitivity) {
        // beat not sensed
        timeSinceSensed += maxArray(x_temp) + gap;

        if (timeSinceSensed >= maxTimeSinceSensed) {
          if (output >= captureThreshold) {
            beatList.push("Ventricular pacing");
          } else {
            beatList.push("Normal");
          }
          timeSinceSensed = 0;
        } else if (asynchronous) {
          beatList.push("Ventricular pacing");
        } else {
          beatList.push("Normal");
        }
      } else {
        // beat sensed
        const idxMaxY = argMax(y_temp);
        const RR_dist = x_temp_shifted[idxMaxY] - R_location;
        const measured_rate = (1500 * 0.04) / RR_dist;

        // Update R_location
        if (beatList[i] === "Ventricular pacing") {
          const idxMinY = argMin(y_temp);
          R_location = x_temp_shifted[idxMinY];
        } else {
          const idxMaxY2 = argMax(y_temp);
          R_location = x_temp_shifted[idxMaxY2];
        }

        if (measured_rate < rate) {
          if (output >= captureThreshold || asynchronous) {
            beatList.push("Ventricular pacing");
          } else {
            beatList.push("Normal");
          }
          if (!asynchronous) {
            beatList.push("Normal");
          }
        } else if (asynchronous) {
          beatList.push("Ventricular pacing");
        } else {
          beatList.push("Normal");
        }
      }
    }
  }

  return { x, y };
}
