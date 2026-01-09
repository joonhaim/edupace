import { stitchBeats } from "./ecgStitcher.js";

const DEFAULT_PARAMS = {
  patientHR: 90,
  regularity: "Regular",
  sensitivity: 0.5,
  rate: 70,
  output: 1.8,
  asynchronous: false,
};

const DEFAULT_SETTINGS = {
  sweepWindow: 6,
  sweepSpeed: 25,
  traceColor: "green",
  traceThickness: "normal",
};

const TRACE_COLORS = {
  green: "#33ff66",
  blue: "#1d4ed8",
  amber: "#f59e0b",
};

const TRACE_WIDTHS = {
  thin: 1,
  normal: 2,
  thick: 3,
};

function toRgba(hex, alpha) {
  if (!hex || hex[0] !== "#" || (hex.length !== 7 && hex.length !== 4)) {
    return `rgba(51,255,102,${alpha})`;
  }
  const value =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex.slice(1);
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r},${g},${b},${alpha})`;
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

class LiveECGEngine {
  constructor({
    canvas,
    secondsOnScreen = 6,
    yMin = -1,
    yMax = 1,
    params = {},
    settings = {},
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.yMin = yMin;
    this.yMax = yMax;
    this.secondsOnScreen = secondsOnScreen;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.traceColor = TRACE_COLORS[this.settings.traceColor] || TRACE_COLORS.green;
    this.traceWidth = TRACE_WIDTHS[this.settings.traceThickness] || TRACE_WIDTHS.normal;

    this.monitorY = [];
    this.monitorWritten = [];
    this.monitorGen = [];
    this.currentGen = 1;
    this.sweepX = 0;
    this.lastTs = null;
    this.playing = false;
    this.frameId = null;
    this.stripLive = null;

    this.handleResize();
    this.refreshStrip();
    this.resetMonitorBuffer(false);
    this.renderMonitor();
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (!width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const newW = this.canvas.clientWidth;
    if (this.monitorY.length && this.monitorY.length !== newW) {
      const oldY = this.monitorY;
      const oldWritten = this.monitorWritten;
      const oldGen = this.monitorGen;
      const oldW = oldY.length;

      this.monitorY = new Array(newW).fill(NaN);
      this.monitorWritten = new Array(newW).fill(false);
      this.monitorGen = new Array(newW).fill(0);

      for (let col = 0; col < newW; col++) {
        const u = col / Math.max(1, newW - 1);
        const oldCol = Math.round(u * (oldW - 1));
        this.monitorY[col] = oldY[oldCol];
        this.monitorWritten[col] = oldWritten[oldCol];
        this.monitorGen[col] = oldGen[oldCol];
      }
      this.sweepX = Math.min(this.sweepX, newW - 1);
    } else if (!this.monitorY.length) {
      this.resetMonitorBuffer(false);
    }
  }

  updateParams(nextParams = {}) {
    this.params = { ...this.params, ...nextParams };
    this.refreshStrip();
  }

  updateSettings(nextSettings = {}) {
    this.settings = { ...this.settings, ...nextSettings };
    this.secondsOnScreen = Number(this.settings.sweepWindow) || this.secondsOnScreen;
    this.traceColor = TRACE_COLORS[this.settings.traceColor] || this.traceColor;
    this.traceWidth = TRACE_WIDTHS[this.settings.traceThickness] || this.traceWidth;
    this.renderMonitor();
  }

  refreshStrip() {
    this.currentGen += 1;
    this.stripLive = stitchBeats({
      ...this.params,
      iterations: 70,
    });
    this.updateVitals();
  }

  updateVitals() {
    const hrEl = document.getElementById("hrValue");
    if (hrEl) {
      hrEl.textContent = Math.round(this.params.patientHR).toString();
    }
  }

  resetMonitorBuffer(keepExisting = false) {
    const w = this.canvas.clientWidth;
    if (!keepExisting || this.monitorY.length !== w) {
      this.monitorY = new Array(w).fill(NaN);
      this.monitorWritten = new Array(w).fill(false);
      this.monitorGen = new Array(w).fill(0);
    }
    this.sweepX = Math.min(this.sweepX, Math.max(0, w - 1));
  }

  drawMonitorBackground() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.globalAlpha = 0.12;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, h / 2);
    this.ctx.lineTo(w, h / 2);
    this.ctx.stroke();
    this.ctx.globalAlpha = 1;
  }

  yToMonitorPx(yVal) {
    const h = this.canvas.clientHeight;
    return h - ((yVal - this.yMin) / (this.yMax - this.yMin)) * h;
  }

  ensureLiveStripLongEnough() {
    if (!this.stripLive) return;
    const tEnd = this.stripLive.x[this.stripLive.x.length - 1];
    if (tEnd >= this.secondsOnScreen * 8) return;
    this.stripLive = stitchBeats({
      ...this.params,
      iterations: 90,
    });
  }

  writeSamplesUnderSweep(dtSec) {
    if (!this.stripLive) return;
    this.ensureLiveStripLongEnough();

    const w = this.canvas.clientWidth;
    const sweepScale = (Number(this.settings.sweepSpeed) || 25) / 25;
    const pxPerSec = (w / this.secondsOnScreen) * sweepScale;
    const advance = pxPerSec * dtSec;

    const oldX = this.sweepX;
    let newX = this.sweepX + advance;

    const wrapped = newX >= w;
    if (wrapped) newX = newX % w;

    const segments = [];
    if (!wrapped) segments.push([oldX, newX]);
    else {
      segments.push([oldX, w]);
      segments.push([0, newX]);
    }

    for (const [a, b] of segments) {
      const startCol = Math.max(0, Math.floor(a));
      const endCol = Math.min(w, Math.ceil(b));

      for (let col = startCol; col < endCol; col++) {
        const tScreen = (col / Math.max(1, w - 1)) * this.secondsOnScreen;
        const tEnd = this.stripLive.x[this.stripLive.x.length - 1];
        const tSample = tEnd > 0 ? tScreen % tEnd : tScreen;
        const yVal = sampleStripLinear(this.stripLive, tSample);
        this.monitorY[col] = yVal;
        this.monitorWritten[col] = true;
        this.monitorGen[col] = this.currentGen;
      }
    }

    this.sweepX = newX;
  }

  renderMonitor() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;

    this.drawMonitorBackground();

    this.ctx.strokeStyle = this.traceColor;
    this.ctx.lineWidth = this.traceWidth;
    this.ctx.beginPath();

    for (let col = 0; col < w; col++) {
      if (!this.monitorWritten[col] || !Number.isFinite(this.monitorY[col])) continue;

      const prevOk =
        col > 0 &&
        this.monitorWritten[col - 1] &&
        Number.isFinite(this.monitorY[col - 1]) &&
        this.monitorGen[col - 1] === this.monitorGen[col];

      const xPx = col + 0.5;
      const yPx = this.yToMonitorPx(this.monitorY[col]);

      if (!prevOk) this.ctx.moveTo(xPx, yPx);
      else this.ctx.lineTo(xPx, yPx);
    }
    this.ctx.stroke();

    this.ctx.strokeStyle = toRgba(this.traceColor, 0.95);
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.sweepX, 0);
    this.ctx.lineTo(this.sweepX, h);
    this.ctx.stroke();

    this.ctx.strokeStyle = toRgba(this.traceColor, 0.18);
    this.ctx.lineWidth = 10;
    this.ctx.beginPath();
    this.ctx.moveTo(this.sweepX, 0);
    this.ctx.lineTo(this.sweepX, h);
    this.ctx.stroke();
  }

  animate = (ts) => {
    if (!this.playing) return;
    if (this.lastTs == null) this.lastTs = ts;
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;

    this.writeSamplesUnderSweep(dt);
    this.renderMonitor();

    this.frameId = requestAnimationFrame(this.animate);
  };

  start() {
    if (this.playing) return;
    this.playing = true;
    this.lastTs = null;
    this.frameId = requestAnimationFrame(this.animate);
  }

  stop() {
    this.playing = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }
}

let engineInstance = null;

function startIfVisible(engine) {
  const training = document.querySelector('[data-view="training"]');
  const isActive = training && !training.hasAttribute("hidden");
  if (isActive) {
    engine.handleResize();
    engine.renderMonitor();
    engine.start();
  } else {
    engine.stop();
  }
}

function initEcgEngine() {
  if (engineInstance) return engineInstance;
  const canvas = document.getElementById("ecgCanvas");
  if (!canvas) return null;

  const engine = new LiveECGEngine({
    canvas,
    secondsOnScreen: DEFAULT_SETTINGS.sweepWindow,
    yMin: -1,
    yMax: 1,
    params: DEFAULT_PARAMS,
  });
  engineInstance = engine;

  const training = document.querySelector('[data-view="training"]');
  if (training) {
    const obs = new MutationObserver(() => startIfVisible(engine));
    obs.observe(training, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  window.addEventListener("visibilitychange", () => startIfVisible(engine));
  window.addEventListener("resize", () => {
    engine.handleResize();
    engine.renderMonitor();
  });

  window.addEventListener("edupace-ecg-settings", (event) => {
    if (!event.detail) return;
    engine.updateSettings(event.detail);
  });

  startIfVisible(engine);
  return engine;
}

export { LiveECGEngine, initEcgEngine };
