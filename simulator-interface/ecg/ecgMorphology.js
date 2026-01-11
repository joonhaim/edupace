function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n / 2) k = n - k;
  let res = 1;
  for (let i = 1; i <= k; i++) res = (res * (n - i + 1)) / i;
  return res;
}

function linspace(start, stop, num) {
  const step = (stop - start) / (num - 1);
  return Array.from({ length: num }, (_, i) => start + step * i);
}

// Rational Bézier polynomial (matches Python b_polynomial math)
function b_polynomial(tArray, P) {
  const n = P.length - 1;
  const lenT = tArray.length;

  const Bx = new Array(lenT).fill(0);
  const By = new Array(lenT).fill(0);
  const Bd = new Array(lenT).fill(0);

  for (let i = 0; i <= n; i++) {
    const [w, x, y] = P[i];
    const comb = combinations(n, i);

    for (let j = 0; j < lenT; j++) {
      const t = tArray[j];
      const Bi = comb * Math.pow(t, i) * Math.pow(1 - t, n - i);
      Bx[j] += Bi * w * x;
      By[j] += Bi * w * y;
      Bd[j] += Bi * w;
    }
  }

  const xOut = new Array(lenT);
  const yOut = new Array(lenT);
  for (let j = 0; j < lenT; j++) {
    xOut[j] = Bx[j] / Bd[j];
    yOut[j] = By[j] / Bd[j];
  }
  return { x: xOut, y: yOut };
}

export function getECGWave(signalType) {
  const t = linspace(0, 1, 101);

  const x = [];
  const y = [];

  const appendSeg = (seg) => {
    for (let i = 0; i < seg.x.length; i++) x.push(seg.x[i]);
    for (let i = 0; i < seg.y.length; i++) y.push(seg.y[i]);
  };

  if (signalType === "Normal") {
    const points_P = [[1,0.0,0],[1.5,0.132366,0.03],[1,0.264732,0.12],[1,0.397099,0.3],[1.5,1.058929,0.9],[3,1.72076,1.3],[1,2.382591,0.8],[1,2.58114,0.5],[1,2.77969,0.16],[1.5,2.912056,0.04],[1,3.044422,0]];
    const points_preQRS = [[1,3.21088,0],[1,3.37634,0],[1,3.54180,0],[1,3.70725,0],[1,3.87271,0],[1,4.03817,0],[1,4.36909,0]];
    const points_QRS = [[10,4.36909,0],[10,4.56909,0],[100,4.66909,-0.05],[1,4.74909,-0.2],[1,4.96909,-0.65],[700,5.46909,-1.5],[10,5.61909,0],[1,5.76909,2.5],[10,5.96909,5.5],[1000,6.36909,11],[10,6.71909,5.5],[1,6.86909,2.5],[1,7.01909,0],[700,7.21909,-3.3],[1,7.71909,-1.5],[10,8.06909,-0.1],[100,8.16909,-0.03],[10,8.26909,0]];
    const points_preT = [[1,8.36909,0],[1,8.86909,0],[1,9.11909,0],[1,9.36909,0],[1,9.86909,0],[1,10.36909,0],[1,10.86909,0]];
    const points_T = [[1,11.26909,0],[5,11.36909,0],[2,11.41909,0.04],[1,11.56909,0.1],[1,12.36909,1],[2,13.36909,1.9],[10,13.96909,2.1],[2,15.36909,0.55],[1,15.56909,0.15],[5,15.66909,0.05],[1,15.78909,0]];

    appendSeg(b_polynomial(t, points_P));
    appendSeg(b_polynomial(t, points_preQRS));
    appendSeg(b_polynomial(t, points_QRS));
    appendSeg(b_polynomial(t, points_preT));
    appendSeg(b_polynomial(t, points_T));
  }

  else if (signalType === "Ventricular pacing") {
    const points_P = [[1,0.0,0.0],[1.5,0.132366,0.045],[1,0.264732,0.18],[1,0.397099,0.45],[1.5,1.058929,1.35],[3,1.72076,1.95],[1,2.382591,1.2],[1,2.58114,0.75],[1,2.77969,0.24],[1.5,2.912056,0.06],[1,3.044422,0.0]];
    const points_prePacemaker = [[1,4.344422,0]];
    const points_Pacemaker = [[1,4.286229,0],[10,4.380709,14],[1,4.475189,0]];
    const points_QRS = [[2,4.931608,-0.8],[1,5.395389,-3.1],[5,5.763607,-7.1],[5,6.046174,-7.6],[1,6.315471,-11.5],[10,6.827175,-16.8],[1,7.243828,-14.6],[1,7.703432,-10.5],[1,8.162635,-6.4],[1,8.621839,-3],[10,9.179848,0]];
    const points_T = [[10,9.189848,0],[1,9.379848,0.4],[1,9.579848,0.75],[1,10.079848,1.8],[1,10.579848,2.75],[1,11.079848,3.6],[1,11.579848,4.15],[5,12.079848,4.75],[5,12.579848,5.4],[15,13.029848,5.7],[5,13.579848,5.3],[5,14.079848,4.4],[1,14.579848,3],[1,15.079848,1.6],[1,15.579848,0.5],[1,15.979848,0]];

    appendSeg(b_polynomial(t, points_P));
    appendSeg(b_polynomial(t, points_prePacemaker));
    appendSeg(b_polynomial(t, points_Pacemaker));
    appendSeg(b_polynomial(t, points_QRS));
    appendSeg(b_polynomial(t, points_T));
  }

  else if (signalType === "Mobitz type II - no conduction") {
    const points_P = [[1,0,0],[1.5,0.2,0.03],[1,0.4,0.12],[1,0.6,0.3],[1.5,1.6,0.9],[3,2.6,1.3],[1,3.6,0.8],[1,3.9,0.5],[1,4.2,0.16],[1.5,4.4,0.04],[1,4.6,0]];
    appendSeg(b_polynomial(t, points_P));
  }

  else if (signalType === "Slow conduction") {
    // EXACT Python points (the ones in your Python block)
    const points_P = [[1,0.0,0],[1.5,0.132366,0.03],[1,0.264732,0.12],[1,0.397099,0.3],[1.5,1.058929,0.9],[3,1.72076,1.3],[1,2.382591,0.8],[1,2.58114,0.5],[1,2.77969,0.16],[1.5,2.912056,0.04],[1,3.044422,0]];
    const points_preQRS = [[1,3.21088,0],[1,3.37634,0],[1,3.54180,0],[1,3.70725,0],[1,3.87271,0],[1,4.03817,0],[1,4.36909,0]];
    const points_QRS = [[10,7.5,0],[10,7.7,0],[100,7.8,-0.05],[1,7.88,-0.2],[1,8.1,-0.65],[700,8.6,-1.5],[10,8.75,0],[1,8.9,2.5],[10,9.1,5.5],[1000,9.5,11],[10,9.85,5.5],[1,10.0,2.5],[1,10.15,0],[700,10.35,-3.3],[1,10.85,-1.5],[10,11.2,-0.1],[100,11.3,-0.03],[10,11.4,0]];
    const points_preT = [[1,11.5,0],[1,12.0,0],[1,12.25,0],[1,12.5,0],[1,13.0,0],[1,13.5,0],[1,14.0,0]];
    const points_T = [[1,14.4,0],[5,14.5,0],[2,14.55,0.04],[1,14.7,0.1],[1,15.5,1],[2,16.5,1.9],[10,17.1,2.1],[2,18.5,0.55],[1,18.7,0.15],[5,18.8,0.05],[1,18.92,0]];

    appendSeg(b_polynomial(t, points_P));
    appendSeg(b_polynomial(t, points_preQRS));
    appendSeg(b_polynomial(t, points_QRS));
    appendSeg(b_polynomial(t, points_preT));
    appendSeg(b_polynomial(t, points_T));
  }

  else if (signalType === "3rd degree heart block P wave") {
    const points_P = [[1,0,0],[2,0.07,0.02],[1,0.15,0.12],[1,0.25,0.44],[2,0.35,0.65],[3,0.465,0.74],[2,0.6,0.63],[1,0.65,0.52],[1,0.75,0.16],[1,0.8,0.05],[2,0.85,0.01],[1,0.9,0]];
    appendSeg(b_polynomial(t, points_P));
  }

  else if (signalType === "3rd degree heart block R wave") {
    const points_R_first = [[1,0,0],[2,0.05,0.05],[1,0.1,0.15],[1,0.15,0.8],[5,0.225,1.2],[1,0.28,0.8],[1,0.3,0.4],[2,0.32,0]];
    const points_R_second = [[2,0.32,0],[1,0.35,-1.2],[1,0.4,-2.6],[1,0.45,-3.6],[5,0.55,-4.4],[2,0.65,-4],[1,0.7,-3.8],[1,0.75,-3.6],[1,0.8,-3.2],[1,0.9,-3],[2,1,-2.6],[1,1.05,-2.2],[1,1.1,-1.2],[1,1.15,-0.6],[1,1.2,-0.2],[1,1.25,-0.1],[2,1.27,-0.05],[1,1.3,0]];
    const points_R_third = [[1,1.3,0],[1,1.35,0.15],[1,1.4,0.25],[1,1.45,0.35],[1,1.5,0.44],[1,1.6,0.58],[1,1.7,0.77],[1,1.8,0.95],[1,1.9,1.15],[1,2,1.34],[2,2.1,1.58],[3,2.23,1.8],[2,2.3,1.75],[1,2.4,1.6],[1,2.5,1.3],[1,2.6,1],[1,2.7,0.6],[1,1.8,0.36],[1,2.9,0.15],[1,2.95,0.1],[2,3,0.03],[1,3.05,0]];

    appendSeg(b_polynomial(t, points_R_first));
    appendSeg(b_polynomial(t, points_R_second));
    appendSeg(b_polynomial(t, points_R_third));
  }

  else if (signalType === "3rd degree heart block ventricular pacing") {
    const points_Pacemaker = [[1,0,0],[10,0.032,14],[1,0.064,0]];
    const points_QRS = [[2,0.224,-0.8],[1,0.384,-3.1],[5,0.512,-7.1],[5,0.608,-7.6],[1,0.704,-11.5],[10,0.88,-16.8],[1,1.024,-14.6],[1,1.184,-10.5],[1,1.344,-6.4],[1,1.504,-3],[10,1.696,0]];
    const points_T = [[10,1.6992,0],[1,1.76,0.4],[1,1.824,0.75],[1,1.984,1.8],[1,2.144,2.75],[1,2.304,3.6],[1,2.464,4.15],[5,2.624,4.75],[5,2.784,5.4],[15,2.928,5.7],[5,3.104,5.3],[5,3.264,4.4],[1,3.424,3],[1,3.584,1.6],[1,3.744,0.5],[1,3.872,0]];

    appendSeg(b_polynomial(t, points_Pacemaker));
    appendSeg(b_polynomial(t, points_QRS));
    appendSeg(b_polynomial(t, points_T));
  }

  else {
    throw new Error(`Unknown signalType: ${signalType}`);
  }

  return { x, y };
}
