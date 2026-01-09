// ecgEngine.js
// Live ECG engine: calls ecgLogic.nextBeat(), resamples into a fixed fs stream,
// pushes into a ring buffer, draws a scrolling canvas with ECG grid.

import { createStitchBeatsState, nextBeat_stitchBeats, setParams } from "./ecgLogic.js";

function lerp(a, b, t) { return a + (b - a) * t; }

function resampleBeatToFs(beatX, beatY, fs) {
  // beatX is in seconds, monotonic increasing within beat
  const n = beatX.length;
  const x0 = beatX[0];
  const x1 = beatX[n - 1];
  const dt = 1 / fs;

  const outLen = Math.max(2, Math.floor((x1 - x0) / dt) + 1);
  const out = new Float32Array(outLen);

  let j = 0;
  for (let i = 0; i < outLen; i++) {
    const t = x0 + i * dt;
    while (j < n - 2 && beatX[j + 1] < t) j++;

    const xa = beatX[j], xb = beatX[j + 1];
    const ya = beatY[j], yb = beatY[j + 1];
    const u = (t - xa) / (xb - xa + 1e-12);
    out[i] = lerp(ya, yb, u);
  }
  return out;
}

export class LiveECGEngine {
  constructor({
    canvas,
    secondsOnScreen = 6,
    fs = 500,
    yMin = -1.2,
    yMax = 1.2,
    gain = 1.0,
    showGrid = true,
    showSensitivity = true,
    params = {},
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.secondsOnScreen = secondsOnScreen;
    this.fs = fs;
    this.N = Math.floor(secondsOnScreen * fs);
    this.buf = new Float32Array(this.N);
    this.writeIdx = 0;

    this.yMin = yMin;
    this.yMax = yMax;
    this.gain = gain;

    this.showGrid = showGrid;
    this.showSensitivity = showSensitivity;

    this.state = createStitchBeatsState(params);
    this.pending = new Float32Array(0);

    this._raf = null;
    this._lastTs = null;
  }

  updateParams(patch) {
    setParams(this.state, patch);
  }

  _appendPending(samples) {
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);
    this.pending = merged;
  }

  _ensurePending(minSamples) {
    while (this.pending.length < minSamples) {
      const beat = nextBeat_stitchBeats(this.state);
      const samples = resampleBeatToFs(beat.x, beat.y, this.fs);
      this._appendPending(samples);
    }
  }

  _pushSamples(count) {
    this._ensurePending(count);
    for (let i = 0; i < count; i++) {
      const v = this.pending[i] * this.gain;
      this.buf[this.writeIdx] = v;
      this.writeIdx = (this.writeIdx + 1) % this.N;
    }
    this.pending = this.pending.slice(count);
  }

  _drawGrid() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Grid spacing like your matplotlib: vertical big=0.2s small=0.04s
    const secToPx = w / this.secondsOnScreen;

    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0.3)";
    ctx.lineWidth = 1;

    for (let s = 0; s <= this.secondsOnScreen + 1e-6; s += 0.04) {
      const x = s * secToPx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,0,0,0.7)";
    ctx.lineWidth = 1.5;

    for (let s = 0; s <= this.secondsOnScreen + 1e-6; s += 0.2) {
      const x = s * secToPx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal: big=1.0 small=0.1 in your y units
    const ySpan = this.yMax - this.yMin;
    const yToPx = h / ySpan;

    ctx.strokeStyle = "rgba(255,0,0,0.3)";
    ctx.lineWidth = 1;
    for (let y = Math.ceil(this.yMin / 0.1) * 0.1; y <= this.yMax + 1e-6; y += 0.1) {
      const py = h - (y - this.yMin) * yToPx;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,0,0,0.7)";
    ctx.lineWidth = 1.5;
    for (let y = Math.ceil(this.yMin / 1.0) * 1.0; y <= this.yMax + 1e-6; y += 1.0) {
      const py = h - (y - this.yMin) * yToPx;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawSensitivity() {
    if (!this.showSensitivity) return;

    const s = this.state.params.sensitivity ?? 0.5;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    const ySpan = this.yMax - this.yMin;
    const yToPx = h / ySpan;
    const py = h - (s - this.yMin) * yToPx;

    ctx.save();
    ctx.strokeStyle = "rgba(0,0,255,1.0)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
    ctx.restore();
  }

  _drawWaveform() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    const ySpan = this.yMax - this.yMin;
    const yToPx = h / ySpan;

    ctx.save();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this.N; i++) {
      const idx = (this.writeIdx + i) % this.N;
      const x = (i / (this.N - 1)) * w;
      const yVal = this.buf[idx];
      const y = h - (yVal - this.yMin) * yToPx;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
    ctx.restore();
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.showGrid) this._drawGrid();
    this._drawSensitivity();
    this._drawWaveform();
  }

  start() {
    if (this._raf) return;

    const step = (ts) => {
      if (this._lastTs == null) this._lastTs = ts;
      const dtMs = ts - this._lastTs;
      this._lastTs = ts;

      const samplesToPush = Math.max(1, Math.floor((dtMs / 1000) * this.fs));
      this._pushSamples(samplesToPush);
      this._draw();

      this._raf = requestAnimationFrame(step);
    };

    this._raf = requestAnimationFrame(step);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._lastTs = null;
  }
}
