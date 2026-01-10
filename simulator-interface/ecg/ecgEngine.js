import { stitchBeats } from './ecgStitcher.js';
import { thirdDegHeartBlock } from './ecgThirdDegree.js';
import { createHeartRateEngine } from '../js/heartRateEngine.js';
import { defaultSettings } from '../js/settingsPanel.js';

const ASYNC_SENSITIVITY_THRESHOLD = 20;
const DEFAULT_PARAMS = {
    rate: 70,
    output: 1.5,
    sensitivity: 2.0
};

const SMALL_T = 0.04;
const BIG_T = 0.2;
const SMALL_A = 0.1;
const BIG_A = 1.0;
const VIEW_SEC = 6;
const Y_MIN = -1;
const Y_MAX = 1;
const PX_PER_SMALL_BOX = 8;
const SWEEP_TIME_SCALE = 1.0;

const TRACE_COLORS = {
    green: '#33ff66',
    blue: '#3b82f6',
    amber: '#f59e0b',
    white: '#0b0b0b'
};

function initEcgEngine() {
    const canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;

    const frame = canvas.closest('.ecg-frame');
    const overlay = frame?.querySelector('.ecg-overlay');
    const hrValue = document.getElementById('hrValue');
    const paceMode = document.getElementById('paceMode');
    const calibrationInline = frame?.querySelector('.calibration-inline');
    const calibrationValue = calibrationInline?.querySelector('.calibration-value');
    const calibrationToggle = frame?.querySelector('.calibration-toggle');
    const audioToggle = frame?.querySelector('.ecg-audio-toggle');
    const ctx = canvas.getContext('2d');

    const hrEngine = createHeartRateEngine(hrValue);

    const state = {
        settings: { ...defaultSettings },
        params: { ...DEFAULT_PARAMS },
        scenarioId: 'NSR',
        stripPaper: null,
        stripLive: null,
        sweepX: 0,
        monitorY: [],
        monitorWritten: [],
        lastTimestamp: null,
        playbackTime: 0,
        lastCanvasSize: { width: 0, height: 0 },
        muted: false,
        needsRegenerate: true
    };

    const getAsyncMode = () => state.params.sensitivity > ASYNC_SENSITIVITY_THRESHOLD;

    const applyOverlaySettings = () => {
        if (overlay) {
            overlay.dataset.labelSize = state.settings.labelSize ?? 'large';
        }

        const hrBlock = hrValue?.closest('.vital-block');
        if (hrBlock) {
            hrBlock.hidden = !state.settings.hrDisplay;
        }

        if (paceMode) {
            paceMode.textContent = getAsyncMode() ? 'ASYNC' : 'VVI';
        }

        if (calibrationValue) {
            calibrationValue.textContent = `${VIEW_SEC} s window · 10 mm/mV · 25 mm/s`;
        }

        hrEngine.setBeepMode(state.settings.qrsBeep ?? 'classic');
    };

    const setAudioMuted = (muted) => {
        state.muted = Boolean(muted);
        hrEngine.setBeepMuted(state.muted);
        if (audioToggle) {
            audioToggle.classList.toggle('is-muted', state.muted);
            audioToggle.setAttribute('aria-pressed', String(state.muted));
            audioToggle.setAttribute('aria-label', state.muted ? 'Unmute QRS beep' : 'Mute QRS beep');
        }
    };

    const paperCssSize = () => {
        const widthCss = (VIEW_SEC / SMALL_T) * PX_PER_SMALL_BOX;
        const heightCss = ((Y_MAX - Y_MIN) / SMALL_A) * PX_PER_SMALL_BOX;
        return { widthCss, heightCss };
    };

    const resizeCanvas = () => {
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (width === state.lastCanvasSize.width && height === state.lastCanvasSize.height) {
            return;
        }
        state.lastCanvasSize = { width, height };
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        resizeMonitorBuffers();
    };

    const resizeMonitorBuffers = () => {
        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        if (!state.monitorY.length || state.monitorY.length !== width) {
            const oldY = state.monitorY;
            const oldWritten = state.monitorWritten;
            const oldWidth = oldY.length;
            state.monitorY = new Array(width).fill(Number.NaN);
            state.monitorWritten = new Array(width).fill(false);
            if (oldWidth) {
                for (let col = 0; col < width; col++) {
                    const u = col / Math.max(1, width - 1);
                    const oldCol = Math.round(u * (oldWidth - 1));
                    state.monitorY[col] = oldY[oldCol];
                    state.monitorWritten[col] = oldWritten[oldCol];
                }
            }
            state.sweepX = Math.min(state.sweepX, Math.max(0, width - 1));
        }
    };

    const lowerBound = (arr, val) => {
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < val) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    };

    const sampleStripLinear = (strip, t) => {
        const x = strip.x;
        const y = strip.y;
        const n = x.length;
        if (!n) return 0;
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
    };

    const sampleStripPeakHold = (strip, t0, t1) => {
        const x = strip.x;
        const y = strip.y;
        const n = x.length;
        if (!n) return 0;

        if (t1 <= t0) return sampleStripLinear(strip, t0);
        const tMin = Math.max(t0, x[0]);
        const tMax = Math.min(t1, x[n - 1]);
        if (tMax <= tMin) return sampleStripLinear(strip, t0);

        const i0 = Math.max(0, lowerBound(x, tMin) - 1);
        const i1 = Math.min(n - 1, lowerBound(x, tMax) + 1);
        let best = sampleStripLinear(strip, tMin);
        let bestAbs = Math.abs(best);

        for (let i = i0; i <= i1; i += 1) {
            const v = y[i];
            const av = Math.abs(v);
            if (av > bestAbs) {
                bestAbs = av;
                best = v;
            }
        }

        const vEnd = sampleStripLinear(strip, tMax);
        if (Math.abs(vEnd) > bestAbs) {
            best = vEnd;
        }
        return best;
    };

    const generateStripFromParams = (iterations) => {
        const intrinsicRate = Number(state.settings.intrinsicRate ?? 60);
        const regularity = state.settings.intrinsicRegularity ?? 'regular';
        const jitter = regularity === 'irregular' ? (0.85 + Math.random() * 0.3) : 1;
        const patientHR = Math.max(20, intrinsicRate * jitter);
        const asynchronous = getAsyncMode();

        if (state.scenarioId === 'AV3') {
            return thirdDegHeartBlock({
                iterations,
                sensitivity: state.params.sensitivity,
                output: state.params.output,
                rate: state.params.rate,
                patientHR,
                asynchronous
            });
        }

        return stitchBeats({
            patientHR,
            sensitivity: state.params.sensitivity,
            rate: state.params.rate,
            output: state.params.output,
            asynchronous,
            iterations
        });
    };

    const refreshStrips = () => {
        state.stripPaper = generateStripFromParams(60);
        state.stripLive = generateStripFromParams(80);
        state.needsRegenerate = false;
    };

    const drawPaperGrid = (sensitivity) => {
        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const height = canvas.clientHeight || state.lastCanvasSize.height || 1;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const X = (t) => (t / VIEW_SEC) * width;
        const Y = (v) => height - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * height;

        for (let t = 0; t <= VIEW_SEC + 1e-9; t += SMALL_T) {
            const isBig = Math.abs((t / BIG_T) - Math.round(t / BIG_T)) < 1e-6;
            ctx.beginPath();
            ctx.strokeStyle = isBig ? 'rgba(255, 0, 0, 0.70)' : 'rgba(255, 0, 0, 0.30)';
            ctx.lineWidth = isBig ? 1.5 : 1.0;
            ctx.moveTo(X(t), 0);
            ctx.lineTo(X(t), height);
            ctx.stroke();
        }

        for (let v = -1.5; v <= 1.5 + 1e-9; v += SMALL_A) {
            const isBig = Math.abs((v / BIG_A) - Math.round(v / BIG_A)) < 1e-6;
            ctx.beginPath();
            ctx.strokeStyle = isBig ? 'rgba(255, 0, 0, 0.70)' : 'rgba(255, 0, 0, 0.30)';
            ctx.lineWidth = isBig ? 1.5 : 1.0;
            ctx.moveTo(0, Y(v));
            ctx.lineTo(width, Y(v));
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 255, 1)';
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, Y(sensitivity));
        ctx.lineTo(width, Y(sensitivity));
        ctx.stroke();
    };

    const yToCanvasPx = (value) => {
        const height = canvas.clientHeight || state.lastCanvasSize.height || 1;
        return height - ((value - Y_MIN) / (Y_MAX - Y_MIN)) * height;
    };

    const ensureLiveStripLongEnough = () => {
        if (!state.stripLive || !state.stripLive.x.length) return;
        const tEnd = state.stripLive.x[state.stripLive.x.length - 1];
        if (tEnd >= VIEW_SEC * 8) return;
        state.stripLive = generateStripFromParams(120);
    };

    const writeSamplesUnderSweep = (dtSec) => {
        if (!state.stripLive || !state.stripLive.x.length) return;
        ensureLiveStripLongEnough();

        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const pxPerSec = (width / VIEW_SEC) * SWEEP_TIME_SCALE;
        const advance = pxPerSec * dtSec;
        const oldX = state.sweepX;
        let newX = state.sweepX + advance;
        const wrapped = newX >= width;
        if (wrapped) newX = newX % width;

        const segments = [];
        if (!wrapped) {
            segments.push([oldX, newX]);
        } else {
            segments.push([oldX, width]);
            segments.push([0, newX]);
        }

        for (const [start, end] of segments) {
            const startCol = Math.max(0, Math.floor(start));
            const endCol = Math.min(width, Math.ceil(end));
            for (let col = startCol; col < endCol; col += 1) {
                const tEnd = state.stripLive.x[state.stripLive.x.length - 1] || VIEW_SEC;
                const t0 = (col / Math.max(1, width - 1)) * VIEW_SEC;
                const t1 = ((col + 1) / Math.max(1, width - 1)) * VIEW_SEC;
                const a = ((t0 % tEnd) + tEnd) % tEnd;
                const b = ((t1 % tEnd) + tEnd) % tEnd;

                let yVal;
                if (b >= a) {
                    yVal = sampleStripPeakHold(state.stripLive, a, b);
                } else {
                    const v1 = sampleStripPeakHold(state.stripLive, a, tEnd);
                    const v2 = sampleStripPeakHold(state.stripLive, 0, b);
                    yVal = Math.abs(v1) >= Math.abs(v2) ? v1 : v2;
                }

                state.monitorY[col] = yVal;
                state.monitorWritten[col] = true;
                const timeSeconds = state.playbackTime - ((end - col) / pxPerSec);
                hrEngine.processSample(timeSeconds, yVal);
            }
        }

        state.sweepX = newX;
    };

    const renderMonitor = () => {
        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const height = canvas.clientHeight || state.lastCanvasSize.height || 1;

        drawPaperGrid(state.params.sensitivity);

        const traceColor = TRACE_COLORS[state.settings.traceColor] ?? TRACE_COLORS.green;
        ctx.strokeStyle = traceColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        let started = false;
        for (let col = 0; col < width; col += 1) {
            if (!state.monitorWritten[col] || !Number.isFinite(state.monitorY[col])) {
                started = false;
                continue;
            }
            const xPx = col + 0.5;
            const yPx = yToCanvasPx(state.monitorY[col]);
            if (!started) {
                ctx.moveTo(xPx, yPx);
                started = true;
            } else {
                ctx.lineTo(xPx, yPx);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(51, 255, 102, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.sweepX, 0);
        ctx.lineTo(state.sweepX, height);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(51, 255, 102, 0.18)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(state.sweepX, 0);
        ctx.lineTo(state.sweepX, height);
        ctx.stroke();
    };

    const render = (timestamp) => {
        resizeCanvas();
        if (state.needsRegenerate) {
            refreshStrips();
        }

        if (state.lastTimestamp === null) {
            state.lastTimestamp = timestamp;
        }

        const dt = (timestamp - state.lastTimestamp) / 1000;
        state.lastTimestamp = timestamp;
        state.playbackTime += dt;
        writeSamplesUnderSweep(dt);
        renderMonitor();
        requestAnimationFrame(render);
    };

    const updateCanvasAspect = () => {
        if (!frame) return;
        const { widthCss, heightCss } = paperCssSize();
        frame.style.aspectRatio = `${widthCss} / ${heightCss}`;
    };

    applyOverlaySettings();
    setAudioMuted(false);
    updateCanvasAspect();
    resizeCanvas();
    refreshStrips();
    requestAnimationFrame(render);

    window.addEventListener('resize', () => {
        updateCanvasAspect();
        resizeCanvas();
    });

    window.addEventListener('edupace-ecg-settings', (event) => {
        state.settings = { ...state.settings, ...(event.detail ?? {}) };
        applyOverlaySettings();
        state.needsRegenerate = true;
    });

    window.addEventListener('edupace-parameters', (event) => {
        const detail = event.detail ?? {};
        if (Number.isFinite(detail.rate)) state.params.rate = detail.rate;
        if (Number.isFinite(detail.output)) state.params.output = detail.output;
        if (Number.isFinite(detail.sensitivity)) state.params.sensitivity = detail.sensitivity;
        if (paceMode) {
            paceMode.textContent = getAsyncMode() ? 'ASYNC' : 'VVI';
        }
        state.needsRegenerate = true;
    });

    window.addEventListener('edupace-scenario-change', (event) => {
        state.scenarioId = event.detail?.id ?? 'NSR';
        state.needsRegenerate = true;
    });

    calibrationToggle?.addEventListener('click', () => {
        if (!calibrationInline) return;
        const isHidden = calibrationInline.hasAttribute('hidden');
        calibrationInline.toggleAttribute('hidden', !isHidden);
    });

    audioToggle?.addEventListener('click', () => {
        setAudioMuted(!state.muted);
    });
}

export { initEcgEngine };
