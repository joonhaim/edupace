import { stitchBeats } from "../ecg/ecgStitcher.js";
import { thirdDegHeartBlock } from "../ecg/ecgThirdDegree.js";

const VIEW_SEC = 6;
const Y_MIN = -1;
const Y_MAX = 1;
const SWEEP_TIME_SCALE = 1.0;

const SCENARIOS = {
  NSR: {
    label: "NSR",
    patientHR: 80,
    rate: 70,
    sensitivity: 0.5,
    output: 2.0,
    asynchronous: false,
  },
  "3rdDegHB": {
    label: "3rd-degree AV block",
    patientHR: 40,
    rate: 70,
    sensitivity: 0.5,
    output: 2.0,
    asynchronous: false,
  },
};

let canvas = null;
let ctx = null;
let hrValue = null;

function normalizeScenario(raw) {
  if (!raw) return "NSR";
  const cleaned = raw.trim();
  if (/3rd|third/i.test(cleaned)) return "3rdDegHB";
  if (/nsr/i.test(cleaned)) return "NSR";
  return SCENARIOS[cleaned] ? cleaned : "NSR";
}

function getScenario() {
  const raw = canvas.dataset.ecgScenario || document.body.dataset.ecgScenario;
  return normalizeScenario(raw || "NSR");
}

function setCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { w: 0, h: 0 };
  }
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height };
}

function lowerBound(arr, val) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function sampleStripLinear(strip, t) {
  const x = strip.x;
  const y = strip.y;
  const n = x.length;
  if (n === 0) return 0;
  if (t <= x[0]) return y[0];
  if (t >= x[n - 1]) return y[n - 1];

  const i = lowerBound(x, t);
  if (i <= 0) return y[0];
  const x0 = x[i - 1];
  const x1 = x[i];
  const y0 = y[i - 1];
  const y1 = y[i];
  const a = (t - x0) / (x1 - x0 || 1e-9);
  return y0 + a * (y1 - y0);
}

function sampleStripPeakHold(strip, t0, t1) {
  const x = strip.x;
  const y = strip.y;
  const n = x.length;
  if (!n) return 0;

  if (t1 <= t0) return sampleStripLinear(strip, t0);
  let start = Math.max(t0, x[0]);
  let end = Math.min(t1, x[n - 1]);
  if (end <= start) return sampleStripLinear(strip, start);

  const i0 = Math.max(0, lowerBound(x, start) - 1);
  const i1 = Math.min(n - 1, lowerBound(x, end) + 1);

  let best = sampleStripLinear(strip, start);
  let bestAbs = Math.abs(best);

  for (let i = i0; i <= i1; i++) {
    const v = y[i];
    const av = Math.abs(v);
    if (av > bestAbs) {
      bestAbs = av;
      best = v;
    }
  }

  const vEnd = sampleStripLinear(strip, end);
  if (Math.abs(vEnd) > bestAbs) best = vEnd;

  return best;
}

function generateStrip(iterations) {
  const scenario = getScenario();
  const config = SCENARIOS[scenario];
  if (!config) return null;

  if (scenario === "NSR") {
    return stitchBeats({
      patientHR: config.patientHR,
      sensitivity: config.sensitivity,
      rate: config.rate,
      output: config.output,
      asynchronous: config.asynchronous,
      iterations,
    });
  }

  return thirdDegHeartBlock({
    iterations,
    sensitivity: config.sensitivity,
    output: config.output,
    rate: config.rate,
    patientHR: config.patientHR,
    asynchronous: config.asynchronous,
  });
}

let stripLive = null;
let monitorY = [];
let monitorWritten = [];
let sweepX = 0;
let lastTs = null;
let animationFrameId = null;
let resizeObserver = null;

function resetMonitorBuffer(keepExisting = false) {
  const w = canvas.clientWidth;
  if (!w) return;
  if (!keepExisting || monitorY.length !== w) {
    monitorY = new Array(w).fill(NaN);
    monitorWritten = new Array(w).fill(false);
  }
  sweepX = Math.min(sweepX, Math.max(0, w - 1));
}

function drawMonitorBackground() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function yToPx(yVal) {
  const h = canvas.clientHeight;
  return h - ((yVal - Y_MIN) / (Y_MAX - Y_MIN)) * h;
}

function ensureLiveStripLongEnough() {
  if (!stripLive || !stripLive.x.length) return;
  const tEnd = stripLive.x[stripLive.x.length - 1];
  if (tEnd >= VIEW_SEC * 8) return;
  stripLive = generateStrip(120);
}

function writeSamplesUnderSweep(dtSec) {
  if (!stripLive || !stripLive.x.length) return;
  ensureLiveStripLongEnough();

  const w = canvas.clientWidth;
  const pxPerSec = (w / VIEW_SEC) * SWEEP_TIME_SCALE;
  const advance = pxPerSec * dtSec;

  const oldX = sweepX;
  let newX = sweepX + advance;

  const wrapped = newX >= w;
  if (wrapped) newX = newX % w;

  const segments = [];
  if (!wrapped) {
    segments.push([oldX, newX]);
  } else {
    segments.push([oldX, w]);
    segments.push([0, newX]);
  }

  const tEnd = stripLive.x[stripLive.x.length - 1] || VIEW_SEC;

  for (const [a, b] of segments) {
    const startCol = Math.max(0, Math.floor(a));
    const endCol = Math.min(w, Math.ceil(b));

    for (let col = startCol; col < endCol; col++) {
      const t0 = (col / Math.max(1, w - 1)) * VIEW_SEC;
      const t1 = ((col + 1) / Math.max(1, w - 1)) * VIEW_SEC;

      const wrappedStart = ((t0 % tEnd) + tEnd) % tEnd;
      const wrappedEnd = ((t1 % tEnd) + tEnd) % tEnd;

      let yVal;
      if (wrappedEnd >= wrappedStart) {
        yVal = sampleStripPeakHold(stripLive, wrappedStart, wrappedEnd);
      } else {
        const v1 = sampleStripPeakHold(stripLive, wrappedStart, tEnd);
        const v2 = sampleStripPeakHold(stripLive, 0, wrappedEnd);
        yVal = Math.abs(v1) >= Math.abs(v2) ? v1 : v2;
      }

      monitorY[col] = yVal;
      monitorWritten[col] = true;
    }
  }

  sweepX = newX;
}

function renderMonitor() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  drawMonitorBackground();

  ctx.strokeStyle = "#33ff66";
  ctx.lineWidth = 2;
  ctx.beginPath();

  let started = false;
  for (let col = 0; col < w; col++) {
    if (!monitorWritten[col] || !Number.isFinite(monitorY[col])) {
      started = false;
      continue;
    }

    const xPx = col + 0.5;
    const yPx = yToPx(monitorY[col]);

    if (!started) {
      ctx.moveTo(xPx, yPx);
      started = true;
    } else {
      ctx.lineTo(xPx, yPx);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(51,255,102,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sweepX, 0);
  ctx.lineTo(sweepX, h);
  ctx.stroke();

  ctx.strokeStyle = "rgba(51,255,102,0.18)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(sweepX, 0);
  ctx.lineTo(sweepX, h);
  ctx.stroke();
}

function updateVitals() {
  const scenario = getScenario();
  const config = SCENARIOS[scenario];
  if (!config || !hrValue) return;
  hrValue.textContent = Math.round(config.patientHR).toString();
}

function refresh() {
  stripLive = generateStrip(100);
  updateVitals();
  renderMonitor();
}

function animate(ts) {
  if (lastTs == null) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;

  writeSamplesUnderSweep(dt);
  renderMonitor();
}

function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function startAnimation() {
  if (animationFrameId !== null) return;
  lastTs = null;
  animationFrameId = requestAnimationFrame(function tick(ts) {
    animate(ts);
    animationFrameId = requestAnimationFrame(tick);
  });
}

function ensureCanvasReady() {
  const size = setCanvasSize();
  if (!size.w || !size.h) return false;
  resetMonitorBuffer(true);
  renderMonitor();
  return true;
}

function handleViewChange(event) {
  if (event?.detail?.view !== "training") {
    stopAnimation();
    return;
  }
  const ready = ensureCanvasReady();
  if (!ready) {
    requestAnimationFrame(() => {
      if (ensureCanvasReady()) {
        refresh();
        startAnimation();
      }
    });
    return;
  }
  refresh();
  startAnimation();
}

function init() {
  canvas = document.getElementById("ecgCanvas");
  if (!canvas) {
    return;
  }
  ctx = canvas.getContext("2d");
  hrValue = document.getElementById("hrValue");

  resizeObserver = new ResizeObserver(() => {
    if (!ensureCanvasReady()) return;
  });
  resizeObserver.observe(canvas);

  ensureCanvasReady();
  refresh();

  if (document.body.classList.contains("page-training")) {
    startAnimation();
  }

  document.addEventListener("edupace:view-change", handleViewChange);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
