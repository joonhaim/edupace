import { stitchBeats } from '../ecg/ecgStitcher.js';

const SMALL_T = 0.04;
const BIG_T = 0.2;
const SMALL_A = 0.1;
const BIG_A = 1.0;

const VIEW_SEC = 6;
const Y_MIN = -1;
const Y_MAX = 1;
const PX_PER_SMALL_BOX = 8;

const SWEEP_TIME_SCALE = 1.0;

const DEFAULT_CONFIG = {
    patientHR: 90,
    rate: 70,
    sensitivity: 0.5,
    output: 1.8,
    asynchronous: false
};

const PAPER_BASE_WIDTH = (VIEW_SEC / SMALL_T) * PX_PER_SMALL_BOX;
const PAPER_BASE_HEIGHT = ((Y_MAX - Y_MIN) / SMALL_A) * PX_PER_SMALL_BOX;

let paperCanvas;
let paperCtx;
let monitorCanvas;
let monitorCtx;
let stripPaper = null;
let stripLive = null;
let monitorY = [];
let monitorWritten = [];
let sweepX = 0;
let lastTs = null;
let isActive = false;

function sanitizeDraftIds() {
    const draftView = document.querySelector('[data-view="training-draft"]');
    if (!draftView) return;

    draftView.querySelectorAll('[id]').forEach((element) => {
        if (element.id === 'ecgPaperDraft' || element.id === 'ecgMonitorDraft') {
            return;
        }
        element.dataset.draftId = element.id;
        element.removeAttribute('id');
    });
}

function setCanvasSize(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getScaledSize() {
    const container = paperCanvas.closest('.ecg-paper-panel');
    const containerWidth = container ? container.clientWidth : PAPER_BASE_WIDTH;
    const available = Math.max(320, containerWidth - 32);
    const width = Math.min(PAPER_BASE_WIDTH, available);
    const scale = width / PAPER_BASE_WIDTH;
    const height = Math.round(PAPER_BASE_HEIGHT * scale);
    return { width, height };
}

function sizeCanvases() {
    const { width, height } = getScaledSize();
    setCanvasSize(paperCanvas, width, height);
    setCanvasSize(monitorCanvas, width, height);
}

function drawPaperGrid(sensitivity) {
    const w = paperCanvas.clientWidth;
    const h = paperCanvas.clientHeight;

    paperCtx.clearRect(0, 0, w, h);
    paperCtx.fillStyle = '#ffffff';
    paperCtx.fillRect(0, 0, w, h);

    const X = (t) => (t / VIEW_SEC) * w;
    const Y = (v) => h - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * h;

    for (let t = 0; t <= VIEW_SEC + 1e-9; t += SMALL_T) {
        const isBig = Math.abs((t / BIG_T) - Math.round(t / BIG_T)) < 1e-6;
        paperCtx.beginPath();
        paperCtx.strokeStyle = isBig ? 'rgba(255,0,0,0.70)' : 'rgba(255,0,0,0.30)';
        paperCtx.lineWidth = isBig ? 1.5 : 1.0;
        paperCtx.moveTo(X(t), 0);
        paperCtx.lineTo(X(t), h);
        paperCtx.stroke();
    }

    for (let v = -1.5; v <= 1.5 + 1e-9; v += SMALL_A) {
        const isBig = Math.abs((v / BIG_A) - Math.round(v / BIG_A)) < 1e-6;
        paperCtx.beginPath();
        paperCtx.strokeStyle = isBig ? 'rgba(255,0,0,0.70)' : 'rgba(255,0,0,0.30)';
        paperCtx.lineWidth = isBig ? 1.5 : 1.0;
        paperCtx.moveTo(0, Y(v));
        paperCtx.lineTo(w, Y(v));
        paperCtx.stroke();
    }

    paperCtx.beginPath();
    paperCtx.strokeStyle = 'rgba(0,0,255,1)';
    paperCtx.lineWidth = 1.5;
    paperCtx.moveTo(0, Y(sensitivity));
    paperCtx.lineTo(w, Y(sensitivity));
    paperCtx.stroke();
}

function lowerBound(arr, val) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < val) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

function sampleStripLinear(strip, t) {
    const { x, y } = strip;
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
    const { x, y } = strip;
    const n = x.length;
    if (!n) return 0;

    if (t1 <= t0) return sampleStripLinear(strip, t0);
    const tStart = Math.max(t0, x[0]);
    const tEnd = Math.min(t1, x[n - 1]);
    if (tEnd <= tStart) return sampleStripLinear(strip, tStart);

    const i0 = Math.max(0, lowerBound(x, tStart) - 1);
    const i1 = Math.min(n - 1, lowerBound(x, tEnd) + 1);

    let best = sampleStripLinear(strip, tStart);
    let bestAbs = Math.abs(best);

    for (let i = i0; i <= i1; i += 1) {
        const value = y[i];
        const absValue = Math.abs(value);
        if (absValue > bestAbs) {
            bestAbs = absValue;
            best = value;
        }
    }

    const endValue = sampleStripLinear(strip, tEnd);
    if (Math.abs(endValue) > bestAbs) {
        best = endValue;
    }

    return best;
}

function drawWaveWindow(ctx, canvas, strip, tLeft, tRight, strokeStyle, lineWidth) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const X = (t) => ((t - tLeft) / (tRight - tLeft)) * w;
    const Y = (v) => h - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * h;

    const i0 = lowerBound(strip.x, tLeft);
    const i1 = lowerBound(strip.x, tRight);
    if (i1 - i0 < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.moveTo(X(strip.x[i0]), Y(strip.y[i0]));
    for (let i = i0 + 1; i < i1; i += 1) {
        ctx.lineTo(X(strip.x[i]), Y(strip.y[i]));
    }
    ctx.stroke();
}

function generateStrip(iterations) {
    return stitchBeats({
        patientHR: DEFAULT_CONFIG.patientHR,
        sensitivity: DEFAULT_CONFIG.sensitivity,
        rate: DEFAULT_CONFIG.rate,
        output: DEFAULT_CONFIG.output,
        asynchronous: DEFAULT_CONFIG.asynchronous,
        iterations
    });
}

function resetMonitorBuffer(keepExisting = false) {
    const w = monitorCanvas.clientWidth;
    if (!keepExisting || monitorY.length !== w) {
        monitorY = new Array(w).fill(NaN);
        monitorWritten = new Array(w).fill(false);
    }
    sweepX = Math.min(sweepX, w - 1);
}

function drawMonitorBackground() {
    const w = monitorCanvas.clientWidth;
    const h = monitorCanvas.clientHeight;

    monitorCtx.clearRect(0, 0, w, h);
    monitorCtx.fillStyle = '#000000';
    monitorCtx.fillRect(0, 0, w, h);

    monitorCtx.globalAlpha = 0.12;
    monitorCtx.strokeStyle = '#ffffff';
    monitorCtx.lineWidth = 1;
    monitorCtx.beginPath();
    monitorCtx.moveTo(0, h / 2);
    monitorCtx.lineTo(w, h / 2);
    monitorCtx.stroke();
    monitorCtx.globalAlpha = 1;
}

function yToMonitorPx(yVal) {
    const h = monitorCanvas.clientHeight;
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

    const w = monitorCanvas.clientWidth;
    const pxPerSec = (w / VIEW_SEC) * SWEEP_TIME_SCALE;
    const advance = pxPerSec * dtSec;

    const oldX = sweepX;
    let newX = sweepX + advance;
    const wrapped = newX >= w;
    if (wrapped) newX %= w;

    const segments = wrapped ? [[oldX, w], [0, newX]] : [[oldX, newX]];

    for (const [a, b] of segments) {
        const startCol = Math.max(0, Math.floor(a));
        const endCol = Math.min(w, Math.ceil(b));

        for (let col = startCol; col < endCol; col += 1) {
            const tEnd = stripLive.x[stripLive.x.length - 1] || VIEW_SEC;
            const t0 = (col / Math.max(1, w - 1)) * VIEW_SEC;
            const t1 = ((col + 1) / Math.max(1, w - 1)) * VIEW_SEC;

            const aTime = ((t0 % tEnd) + tEnd) % tEnd;
            const bTime = ((t1 % tEnd) + tEnd) % tEnd;

            let yVal;
            if (bTime >= aTime) {
                yVal = sampleStripPeakHold(stripLive, aTime, bTime);
            } else {
                const v1 = sampleStripPeakHold(stripLive, aTime, tEnd);
                const v2 = sampleStripPeakHold(stripLive, 0, bTime);
                yVal = Math.abs(v1) >= Math.abs(v2) ? v1 : v2;
            }

            monitorY[col] = yVal;
            monitorWritten[col] = true;
        }
    }

    sweepX = newX;
}

function renderMonitor() {
    const w = monitorCanvas.clientWidth;
    const h = monitorCanvas.clientHeight;

    drawMonitorBackground();

    monitorCtx.strokeStyle = '#33ff66';
    monitorCtx.lineWidth = 2;
    monitorCtx.beginPath();

    let started = false;
    for (let col = 0; col < w; col += 1) {
        if (!monitorWritten[col] || !Number.isFinite(monitorY[col])) {
            started = false;
            continue;
        }

        const xPx = col + 0.5;
        const yPx = yToMonitorPx(monitorY[col]);

        if (!started) {
            monitorCtx.moveTo(xPx, yPx);
            started = true;
        } else {
            monitorCtx.lineTo(xPx, yPx);
        }
    }
    monitorCtx.stroke();

    monitorCtx.strokeStyle = 'rgba(51,255,102,0.95)';
    monitorCtx.lineWidth = 2;
    monitorCtx.beginPath();
    monitorCtx.moveTo(sweepX, 0);
    monitorCtx.lineTo(sweepX, h);
    monitorCtx.stroke();

    monitorCtx.strokeStyle = 'rgba(51,255,102,0.18)';
    monitorCtx.lineWidth = 10;
    monitorCtx.beginPath();
    monitorCtx.moveTo(sweepX, 0);
    monitorCtx.lineTo(sweepX, h);
    monitorCtx.stroke();
}

function renderPaper() {
    if (!stripPaper) return;
    drawPaperGrid(DEFAULT_CONFIG.sensitivity);
    drawWaveWindow(paperCtx, paperCanvas, stripPaper, 0, VIEW_SEC, '#000000', 2);
}

function animate(ts) {
    if (!isActive) return;
    if (lastTs == null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    writeSamplesUnderSweep(dt);
    renderMonitor();

    requestAnimationFrame(animate);
}

function handleResize() {
    sizeCanvases();
    const newW = monitorCanvas.clientWidth;
    if (monitorY.length && monitorY.length !== newW) {
        const oldY = monitorY;
        const oldW = oldY.length;
        const oldWritten = monitorWritten;

        monitorY = new Array(newW).fill(NaN);
        monitorWritten = new Array(newW).fill(false);

        for (let col = 0; col < newW; col += 1) {
            const u = col / Math.max(1, newW - 1);
            const oldCol = Math.round(u * (oldW - 1));
            monitorY[col] = oldY[oldCol];
            monitorWritten[col] = oldWritten[oldCol];
        }
        sweepX = Math.min(sweepX, newW - 1);
    } else if (!monitorY.length) {
        resetMonitorBuffer(false);
    }

    renderPaper();
    renderMonitor();
}

function handleViewChange(event) {
    isActive = event?.detail?.view === 'training-draft';
    if (isActive) {
        lastTs = null;
        requestAnimationFrame(animate);
    }
}

function initTrainingDraftEcg() {
    sanitizeDraftIds();
    paperCanvas = document.getElementById('ecgPaperDraft');
    monitorCanvas = document.getElementById('ecgMonitorDraft');
    if (!paperCanvas || !monitorCanvas) return;

    paperCtx = paperCanvas.getContext('2d');
    monitorCtx = monitorCanvas.getContext('2d');

    sizeCanvases();

    stripPaper = generateStrip(60);
    stripLive = generateStrip(80);

    renderPaper();

    resetMonitorBuffer(false);
    renderMonitor();

    window.addEventListener('resize', handleResize);
    document.addEventListener('edupace:view-change', handleViewChange);

    isActive = document.body.classList.contains('page-training-draft');
    if (isActive) {
        requestAnimationFrame(animate);
    }
}

initTrainingDraftEcg();
