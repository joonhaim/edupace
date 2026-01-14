import { stitchBeats } from './ecgStitcher.js';
import { thirdDegHeartBlock } from './ecgThirdDegree.js';
import { mobitzTypeII } from './ecgMobitz2.js';
import { slowConduction } from './ecgSlowConduction.js';
import { createHeartRateEngine } from '../js/heartRateEngine.js';
import { defaultSettings } from '../js/settingsPanel.js';

const ASYNC_SENSITIVITY_THRESHOLD = 20;
const DEFAULT_PARAMS = {
    rate: 70,
    output: 1.5,
    sensitivity: 2.0,
    power: true,
    asynchronous: false
};

const SMALL_T = 0.04;
const BIG_T = 0.2;
const SMALL_A = 0.1;
const BIG_A = 1.0;
const VIEW_SEC = 6;
const Y_MIN = -1;
const Y_MAX = 1;

// Keep your existing sizing constants (these influence the “paper-style” scaling)
const VERTICAL_SCALE = 3;
const PX_PER_SMALL_BOX = 6;

// 1 screen (6s) per 6 real seconds
const SWEEP_TIME_SCALE = 1.0;

const R_Y_MIN = Y_MIN * VERTICAL_SCALE;
const R_Y_MAX = Y_MAX * VERTICAL_SCALE;

const TRACE_COLORS = {
    black: '#0b0b0b',
    green: '#33ff66',
    blue: '#3b82f6',
    amber: '#f59e0b',
    white: '#f5f7fa'
};

function initEcgEngine() {
    const canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;

    const frame = canvas.closest('.ecg-frame');
    const overlay = frame?.querySelector('.ecg-overlay');
    const leadLabel = frame?.querySelector('.ecg-label');
    const hrValue = document.getElementById('hrValue');
    const paceLed = document.getElementById('paceLed');
    const senseLed = document.getElementById('senseLed');
    const shell = frame?.closest('.ecg-shell');
    const calibrationInline = frame?.querySelector('.calibration-inline');
    const calibrationValue = calibrationInline?.querySelector('.calibration-value');
    const caliperReadout = frame?.querySelector('.caliper-readout');
    const caliperValue = caliperReadout?.querySelector('.caliper-value');
    const pausedBadge = frame?.querySelector('.ecg-paused-badge');
    const calibrationToggle = frame?.querySelector('.calibration-toggle');
    const audioToggle = frame?.querySelector('.ecg-audio-toggle');
    const pauseToggle = frame?.querySelector('.pause-toggle');
    const caliperUnitToggle = frame?.querySelector('.caliper-unit-toggle');
    const fullscreenToggle = frame?.querySelector('.fullscreen-toggle');
    const ctx = canvas.getContext('2d');
    let suppressClick = false;

    const hrEngine = createHeartRateEngine(hrValue);

    // -------------------------
    // Offscreen monitor canvases (test.html style)
    // -------------------------
    const monitorBuffer = document.createElement('canvas');
    const monitorBufferCtx = monitorBuffer.getContext('2d');

    const monitorScreen = document.createElement('canvas');
    const monitorScreenCtx = monitorScreen.getContext('2d');

    const dpr = () => window.devicePixelRatio || 1;

    const setCanvasSize = (targetCanvas, cssW, cssH) => {
        const D = dpr();
        targetCanvas.style.width = `${cssW}px`;
        targetCanvas.style.height = `${cssH}px`;
        targetCanvas.width = Math.floor(cssW * D);
        targetCanvas.height = Math.floor(cssH * D);
        const tctx = targetCanvas.getContext('2d');
        tctx.setTransform(D, 0, 0, D, 0, 0);
        return { w: cssW, h: cssH, dpr: D };
    };

    const state = {
        settings: { ...defaultSettings },
        params: { ...DEFAULT_PARAMS },
        scenarioId: 'NSR',
        stripPaper: null,
        stripLive: null,

        // sweep state
        sweepX: 0,
        prevSweepX: 0,
        lastTimestamp: null,
        playbackTime: 0,

        // led event schedule (unchanged)
        eventSchedule: [],

        lastCanvasSize: { width: 0, height: 0 },
        muted: false,
        paused: false,

        // calipers
        calipers: {
            active: false,
            dragging: false,
            startX: 0,
            endX: 0,
            dragMoved: false,
            unit: 'ms'
        },

        needsRegenerate: true,

        // monitor init/visual refresh flags
        monitorInitialized: false,
        monitorNeedsVisualRefresh: true, // build background/buffer at least once
        lastVisualKey: ''
    };

    const getAsyncMode = () => {
        if (typeof state.params.asynchronous === 'boolean') {
            return state.params.asynchronous;
        }
        return state.params.sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
    };

    const applyOverlaySettings = () => {
        if (overlay) {
            overlay.dataset.labelSize = state.settings.labelSize ?? 'large';
            overlay.dataset.background = state.settings.ecgBackground ?? 'monitor';
        }
        if (shell) {
            shell.dataset.background = state.settings.ecgBackground ?? 'monitor';
        }

        const hrCard = hrValue?.closest('.ecg-hr-card');
        if (hrCard) {
            hrCard.hidden = !state.settings.hrDisplay;
        }

        if (leadLabel) {
            leadLabel.hidden = !state.settings.leadLabel;
        }

        if (calibrationValue) {
            calibrationValue.textContent = `${VIEW_SEC} s window · 10 mm/mV · 25 mm/s`;
        }

        const hrColor = TRACE_COLORS[state.settings.hrColor] ?? TRACE_COLORS.green;
        const leadLabelColor = TRACE_COLORS[state.settings.leadLabelColor] ?? TRACE_COLORS.green;
        const colorHost = shell ?? frame ?? overlay;
        if (colorHost) {
            colorHost.style.setProperty('--hr-color', hrColor);
            colorHost.style.setProperty('--lead-label-color', leadLabelColor);
        }

        hrEngine.setBeepMode(state.settings.qrsBeep ?? 'on');
        hrEngine.setBeepVolume(state.settings.soundVolume ?? 70);

        // Any visual setting change should rebuild buffer/screen *preserving* sweep progress.
        // We'll detect actual changes using a key.
        const nextVisualKey = JSON.stringify({
            bg: state.settings.ecgBackground,
            grid: state.settings.gridlines,
            dens: state.settings.gridDensity,
            inten: state.settings.gridIntensity,
            sensGuide: state.settings.sensitivityGuide,
            traceColor: state.settings.traceColor,
            traceThickness: state.settings.traceThickness
        });
        if (nextVisualKey !== state.lastVisualKey) {
            state.lastVisualKey = nextVisualKey;
            state.monitorNeedsVisualRefresh = true;
        }
    };

    const setPaused = (paused) => {
        state.paused = Boolean(paused);
        if (pausedBadge) {
            pausedBadge.toggleAttribute('hidden', !state.paused);
        }
        if (pauseToggle) {
            pauseToggle.classList.toggle('is-active', state.paused);
            pauseToggle.setAttribute('aria-pressed', String(state.paused));
            pauseToggle.setAttribute('aria-label', state.paused ? 'Resume ECG sweep' : 'Pause ECG sweep');
            pauseToggle.setAttribute('title', state.paused ? 'Resume ECG sweep' : 'Pause ECG sweep');
            pauseToggle.textContent = state.paused ? '▶' : '⏸';
        }
        if (!state.paused) {
            state.calipers.active = false;
            state.calipers.dragging = false;
            state.calipers.dragMoved = false;
            if (caliperReadout) {
                caliperReadout.setAttribute('hidden', '');
            }
        }
        window.dispatchEvent(
            new CustomEvent('edupace-telemetry-pause', {
                detail: { paused: state.paused }
            })
        );
    };

    const updateCaliperReadout = () => {
        if (!caliperReadout || !caliperValue) return;
        if (!state.paused || !state.calipers.active || !state.settings.intervalRulers) {
            caliperReadout.setAttribute('hidden', '');
            return;
        }
        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const deltaPx = Math.abs(state.calipers.endX - state.calipers.startX);
        const deltaSec = (deltaPx / Math.max(1, width)) * VIEW_SEC;
        if (state.calipers.unit === 's') {
            const bpm = deltaSec > 0 ? Math.round(60 / deltaSec) : 0;
            caliperValue.textContent = `${deltaSec.toFixed(2)} s · ${bpm} bpm`;
        } else {
            const deltaMs = Math.round(deltaSec * 1000);
            const ppm = deltaSec > 0 ? Math.round(60 / deltaSec) : 0;
            caliperValue.textContent = `${deltaMs} ms · ${ppm} ppm`;
        }
        caliperReadout.removeAttribute('hidden');
    };

    const updateCaliperUnitToggle = () => {
        if (!caliperUnitToggle) return;
        const isSeconds = state.calipers.unit === 's';
        caliperUnitToggle.textContent = isSeconds ? 's' : 'ms';
        caliperUnitToggle.setAttribute('aria-label', isSeconds ? 'Show calipers in milliseconds' : 'Show calipers in seconds');
        caliperUnitToggle.setAttribute('title', isSeconds ? 'Show calipers in milliseconds' : 'Show calipers in seconds');
    };

    const setCalibrationVisible = (visible) => {
        if (calibrationInline) {
            calibrationInline.toggleAttribute('hidden', !visible);
        }
        if (calibrationToggle) {
            calibrationToggle.classList.toggle('is-active', visible);
            calibrationToggle.setAttribute('aria-pressed', String(visible));
            calibrationToggle.setAttribute('aria-label', visible ? 'Hide calibration details' : 'Show calibration details');
        }
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
        const heightCss = ((Y_MAX - Y_MIN) / SMALL_A) * PX_PER_SMALL_BOX * VERTICAL_SCALE;
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
        const D = dpr();
        canvas.width = Math.floor(width * D);
        canvas.height = Math.floor(height * D);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(D, 0, 0, D, 0, 0);

        resizeMonitorOffscreenPreserveReveal();
    };

    // -------------------------
    // Sampling + draw helpers (same logic as test.html)
    // -------------------------
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
        if (Math.abs(vEnd) > bestAbs) best = vEnd;
        return best;
    };

    const drawWaveWindowToSize = (drawCtx, w, h, strip, tLeft, tRight, strokeStyle, lineWidth) => {
        const X = (t) => ((t - tLeft) / (tRight - tLeft)) * w;
        const Y = (v) => h - ((v - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * h;

        const i0 = lowerBound(strip.x, tLeft);
        const i1 = lowerBound(strip.x, tRight);
        if (i1 - i0 < 2) return;

        drawCtx.beginPath();
        drawCtx.strokeStyle = strokeStyle;
        drawCtx.lineWidth = lineWidth;
        drawCtx.lineJoin = 'round';
        drawCtx.lineCap = 'round';

        drawCtx.moveTo(X(strip.x[i0]), Y(strip.y[i0]));
        for (let i = i0 + 1; i < i1; i += 1) {
            drawCtx.lineTo(X(strip.x[i]), Y(strip.y[i]));
        }
        drawCtx.stroke();
    };

    // -------------------------
    // Background draw (to arbitrary ctx) — so buffer/screen match main
    // -------------------------
    const drawPaperGridTo = (drawCtx, width, height, sensitivity) => {
        drawCtx.clearRect(0, 0, width, height);
        drawCtx.fillStyle = '#ffffff';
        drawCtx.fillRect(0, 0, width, height);

        const X = (t) => (t / VIEW_SEC) * width;
        const Y = (v) => height - ((v - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * height;

        for (let t = 0; t <= VIEW_SEC + 1e-9; t += SMALL_T) {
            const isBig = Math.abs((t / BIG_T) - Math.round(t / BIG_T)) < 1e-6;
            drawCtx.beginPath();
            drawCtx.strokeStyle = isBig ? 'rgba(255, 0, 0, 0.70)' : 'rgba(255, 0, 0, 0.30)';
            drawCtx.lineWidth = isBig ? 1.5 : 1.0;
            drawCtx.moveTo(X(t), 0);
            drawCtx.lineTo(X(t), height);
            drawCtx.stroke();
        }

        for (let v = R_Y_MIN; v <= R_Y_MAX + 1e-9; v += SMALL_A) {
            const isBig = Math.abs((v / BIG_A) - Math.round(v / BIG_A)) < 1e-6;
            drawCtx.beginPath();
            drawCtx.strokeStyle = isBig ? 'rgba(255, 0, 0, 0.70)' : 'rgba(255, 0, 0, 0.30)';
            drawCtx.lineWidth = isBig ? 1.5 : 1.0;
            drawCtx.moveTo(0, Y(v));
            drawCtx.lineTo(width, Y(v));
            drawCtx.stroke();
        }

        drawCtx.beginPath();
        drawCtx.strokeStyle = 'rgba(0, 0, 255, 1)';
        drawCtx.lineWidth = 1.5;
        drawCtx.moveTo(0, Y(sensitivity));
        drawCtx.lineTo(width, Y(sensitivity));
        drawCtx.stroke();
    };

    const drawMonitorGridTo = (drawCtx, width, height, sensitivity) => {
        const density = state.settings.gridDensity ?? '2mm';
        const intensity = Math.max(0, Math.min(1, (state.settings.gridIntensity ?? 55) / 100));
        const smallT = density === '1mm' ? SMALL_T : SMALL_T * 2;
        const bigT = smallT * 5;
        const smallA = density === '1mm' ? SMALL_A : SMALL_A * 2;
        const bigA = smallA * 5;

        drawCtx.clearRect(0, 0, width, height);
        drawCtx.fillStyle = '#050505';
        drawCtx.fillRect(0, 0, width, height);

        const X = (t) => (t / VIEW_SEC) * width;
        const Y = (v) => height - ((v - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * height;

        if (state.settings.gridlines) {
            const smallAlpha = 0.12 * intensity;
            const bigAlpha = 0.32 * intensity;

            for (let t = 0; t <= VIEW_SEC + 1e-9; t += smallT) {
                const isBig = Math.abs((t / bigT) - Math.round(t / bigT)) < 1e-6;
                drawCtx.beginPath();
                drawCtx.strokeStyle = isBig
                    ? `rgba(56, 189, 248, ${bigAlpha})`
                    : `rgba(56, 189, 248, ${smallAlpha})`;
                drawCtx.lineWidth = isBig ? 1.2 : 1.0;
                drawCtx.moveTo(X(t), 0);
                drawCtx.lineTo(X(t), height);
                drawCtx.stroke();
            }

            for (let v = R_Y_MIN; v <= R_Y_MAX + 1e-9; v += smallA) {
                const isBig = Math.abs((v / bigA) - Math.round(v / bigA)) < 1e-6;
                drawCtx.beginPath();
                drawCtx.strokeStyle = isBig
                    ? `rgba(56, 189, 248, ${bigAlpha})`
                    : `rgba(56, 189, 248, ${smallAlpha})`;
                drawCtx.lineWidth = isBig ? 1.2 : 1.0;
                drawCtx.moveTo(0, Y(v));
                drawCtx.lineTo(width, Y(v));
                drawCtx.stroke();
            }
        }

        if (state.settings.sensitivityGuide) {
            drawCtx.beginPath();
            drawCtx.strokeStyle = `rgba(125, 211, 252, ${0.6 * intensity + 0.2})`;
            drawCtx.lineWidth = 1.2;
            drawCtx.moveTo(0, Y(sensitivity));
            drawCtx.lineTo(width, Y(sensitivity));
            drawCtx.stroke();
        }
    };

    const yToCanvasPx = (value) => {
        const height = canvas.clientHeight || state.lastCanvasSize.height || 1;
        return height - ((value - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * height;
    };

    // -------------------------
    // Scenario generation (kept as you wrote it)
    // -------------------------
    const generateStripFromParams = (iterations) => {
        const intrinsicRate = Number(state.settings.intrinsicRate ?? 60);
        const regularity = state.settings.intrinsicRegularity ?? 'regular';
        const jitter = regularity === 'irregular' ? (0.85 + Math.random() * 0.3) : 1;
        const patientHR = Math.max(20, intrinsicRate * jitter);

        // Pacemaker power OFF => no pacing (force rate=0)
        const pacingEnabled = state.params.power !== false;
        const effectiveRate = pacingEnabled ? state.params.rate : 0;

        // If pacing is off, async should not matter
        const asynchronous = pacingEnabled ? getAsyncMode() : false;

        if (state.scenarioId === 'AV3') {
            return thirdDegHeartBlock({
                iterations,
                sensitivity: state.params.sensitivity,
                output: state.params.output,
                rate: effectiveRate,
                patientHR,
                asynchronous
            });
        }

        if (state.scenarioId === 'Mobitz2') {
            return mobitzTypeII({
                iterations,
                sensitivity: state.params.sensitivity,
                output: state.params.output,
                rate: effectiveRate,
                patientHR,
                asynchronous
            });
        }

        if (state.scenarioId === 'SlowConduction') {
            return slowConduction({
                iterations,
                sensitivity: state.params.sensitivity,
                output: state.params.output,
                rate: effectiveRate,
                patientHR,
                asynchronous
            });
        }

        return stitchBeats({
            patientHR,
            sensitivity: state.params.sensitivity,
            rate: effectiveRate,
            output: state.params.output,
            asynchronous,
            iterations
        });
    };

    // -------------------------
    // LED / event schedule (unchanged)
    // -------------------------
    const buildEventSchedule = (strip) => {
        const schedule = [];
        const events = strip?.events;
        if (!events) return schedule;

        (events.pace ?? []).forEach((time) => {
            if (Number.isFinite(time)) schedule.push({ time, kind: 'pace' });
        });
        (events.sense ?? []).forEach((time) => {
            if (Number.isFinite(time)) schedule.push({ time, kind: 'sense' });
        });

        schedule.sort((a, b) => a.time - b.time);
        return schedule;
    };

    const flashLed = (kind) => {
        if (state.params.power === false) return;
        const led = kind === 'pace' ? paceLed : senseLed;
        if (!led) return;
        led.classList.add('led-on');
        setTimeout(() => {
            led.classList.remove('led-on');
        }, 180);

        window.dispatchEvent(
            new CustomEvent('edupace-led-flash', {
                detail: {
                    kind,
                    source: 'simulation',
                    at: new Date().toISOString()
                }
            })
        );
    };

    const dispatchLedEvents = (startTime, endTime) => {
        if (!state.eventSchedule.length || !state.stripLive?.x?.length) return;
        const tEnd = state.stripLive.x[state.stripLive.x.length - 1];
        if (!Number.isFinite(tEnd) || tEnd <= 0) return;
        if (startTime === endTime) return;

        const mod = (value) => ((value % tEnd) + tEnd) % tEnd;
        const start = mod(startTime);
        const end = mod(endTime);
        const wrapped = end < start;
        const startCycle = startTime - start;
        const endCycle = endTime - end;

        state.eventSchedule.forEach((event) => {
            if (!Number.isFinite(event.time)) return;
            let eventTime = null;
            if (wrapped) {
                if (event.time > start) {
                    eventTime = startCycle + event.time;
                } else if (event.time <= end) {
                    eventTime = endCycle + event.time;
                }
            } else if (event.time > start && event.time <= end) {
                eventTime = startCycle + event.time;
            }

            if (eventTime !== null) {
                if (event.kind === 'pace' && typeof hrEngine.recordBeat === 'function') {
                    hrEngine.recordBeat(eventTime);
                }
                flashLed(event.kind);
            }
        });
    };

    const ensureLiveStripLongEnough = () => {
        if (!state.stripLive || !state.stripLive.x.length) return;
        const tEnd = state.stripLive.x[state.stripLive.x.length - 1];
        if (tEnd >= VIEW_SEC * 8) return;
        state.stripLive = generateStripFromParams(120);
        state.eventSchedule = buildEventSchedule(state.stripLive);
    };

    // -------------------------
    // Monitor buffer/screen (test.html behavior)
    // -------------------------
    const getTraceStyle = () => {
        const traceColor = TRACE_COLORS[state.settings.traceColor] ?? TRACE_COLORS.green;
        const traceWeight =
            state.settings.traceThickness === 'thin' ? 1.5 :
                state.settings.traceThickness === 'thick' ? 2.8 :
                    2;
        return { traceColor, traceWeight };
    };

    const drawBackgroundTo = (drawCtx, w, h) => {
        if (state.settings.ecgBackground === 'paper') {
            drawPaperGridTo(drawCtx, w, h, state.params.sensitivity);
        } else {
            drawMonitorGridTo(drawCtx, w, h, state.params.sensitivity);
        }
    };

    const rebuildMonitorBuffer = () => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;
        if (!state.stripLive || !state.stripLive.x.length) return;

        setCanvasSize(monitorBuffer, w, h);
        drawBackgroundTo(monitorBufferCtx, w, h);

        const { traceColor, traceWeight } = getTraceStyle();
        drawWaveWindowToSize(monitorBufferCtx, w, h, state.stripLive, 0, VIEW_SEC, traceColor, traceWeight);
    };

    const initMonitorScreenBlank = () => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;

        setCanvasSize(monitorScreen, w, h);
        drawBackgroundTo(monitorScreenCtx, w, h);
    };

    const overwriteSliceOnScreen = (x0, x1) => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;
        if (x1 <= x0) return;

        const D = dpr();
        const sx = Math.floor(x0 * D);
        const sw = Math.ceil((x1 - x0) * D);
        const sy = 0;
        const sh = Math.ceil(h * D);

        monitorScreenCtx.drawImage(
            monitorBuffer,
            sx, sy, sw, sh,
            x0, 0, (x1 - x0), h
        );
    };

    const resetSweepAndBlankScreen = () => {
        state.sweepX = 0;
        state.prevSweepX = 0;
        state.lastTimestamp = null;
        initMonitorScreenBlank();
        state.monitorInitialized = true;
    };

    const resizeMonitorOffscreenPreserveReveal = () => {
        // Called on visible canvas resize
        if (!state.stripLive || !state.stripLive.x.length) {
            // still make screen blank so we don't show garbage
            initMonitorScreenBlank();
            state.monitorInitialized = true;
            return;
        }

        rebuildMonitorBuffer();

        // preserve already-revealed look: blank + reveal up to current sweepX
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        state.sweepX = Math.min(state.sweepX, w);
        state.prevSweepX = 0;

        initMonitorScreenBlank();
        overwriteSliceOnScreen(0, state.sweepX);

        state.monitorInitialized = true;
    };

    // This is the sweep movement + overwrite (test.html logic), plus HR sampling + LED dispatch.
    const stepSweepAndProcess = (dtSec, previousPlaybackTime) => {
        if (!state.stripLive || !state.stripLive.x.length) return;

        ensureLiveStripLongEnough();

        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const sweepLimit = w;
        const pxPerSec = (sweepLimit / VIEW_SEC) * SWEEP_TIME_SCALE;

        state.prevSweepX = state.sweepX;
        let nextX = state.sweepX + pxPerSec * dtSec;

        const wrapped = nextX >= sweepLimit;
        if (wrapped) nextX = nextX % sweepLimit;

        // Visual overwrite (exactly like test.html)
        if (nextX >= state.prevSweepX) {
            overwriteSliceOnScreen(state.prevSweepX, nextX);
        } else {
            overwriteSliceOnScreen(state.prevSweepX, sweepLimit);
            overwriteSliceOnScreen(0, nextX);
        }

        // HR + LED sampling (keep your existing behavior)
        // We sample per crossed column using peak-hold to preserve spikes.
        const segments = [];
        if (!wrapped) {
            segments.push({ startPx: state.prevSweepX, endPx: nextX, startTime: previousPlaybackTime });
        } else {
            const dur1 = (sweepLimit - state.prevSweepX) / pxPerSec;
            segments.push({ startPx: state.prevSweepX, endPx: sweepLimit, startTime: previousPlaybackTime });
            segments.push({ startPx: 0, endPx: nextX, startTime: previousPlaybackTime + dur1 });
        }

        const tEnd = state.stripLive.x[state.stripLive.x.length - 1] || VIEW_SEC;

        for (const seg of segments) {
            const { startPx, endPx, startTime } = seg;

            const startCol = Math.max(0, Math.floor(startPx));
            const endCol = Math.min(sweepLimit, Math.ceil(endPx));

            for (let col = startCol; col < endCol; col += 1) {
                const t0 = (col / Math.max(1, sweepLimit - 1)) * VIEW_SEC;
                const t1 = ((col + 1) / Math.max(1, sweepLimit - 1)) * VIEW_SEC;

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

                const timeSeconds = startTime + (col + 0.5 - startPx) / pxPerSec;
                hrEngine.processSample(timeSeconds, yVal);
            }
        }

        dispatchLedEvents(previousPlaybackTime, state.playbackTime);

        state.sweepX = nextX;
    };

    // -------------------------
    // Strips refresh
    // -------------------------
    const refreshStrips = () => {
        state.stripPaper = generateStripFromParams(60);
        state.stripLive = generateStripFromParams(80);
        state.eventSchedule = buildEventSchedule(state.stripLive);
        state.needsRegenerate = false;

        // Always rebuild source buffer when the underlying strip changes.
        rebuildMonitorBuffer();

        // First time: start blank (no trace before the first sweep).
        if (!state.monitorInitialized) {
            resetSweepAndBlankScreen();
        }
        // Do NOT blank the screen on parameter changes — just like test.html.
        // New content will appear only as the sweep overwrites those regions.
    };

    // If only visual settings changed (background/grid/trace style), refresh screen *preserving* progress.
    const refreshMonitorVisualsPreserveSweep = () => {
        if (!state.stripLive || !state.stripLive.x.length) {
            initMonitorScreenBlank();
            state.monitorInitialized = true;
            return;
        }
        rebuildMonitorBuffer();

        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        state.sweepX = Math.min(state.sweepX, w);

        initMonitorScreenBlank();
        overwriteSliceOnScreen(0, state.sweepX);

        state.monitorInitialized = true;
    };

    // -------------------------
    // Render monitor (now: screen image + sweep bar + calipers)
    // -------------------------
    const renderMonitor = () => {
        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const height = canvas.clientHeight || state.lastCanvasSize.height || 1;

        if (!state.monitorInitialized) {
            initMonitorScreenBlank();
            state.monitorInitialized = true;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(monitorScreen, 0, 0, width, height);

        if (!state.paused) {
            // sweep bar (keep your existing color/glow)
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
        }

        // Calipers overlay (unchanged)
        if (state.paused && state.settings.intervalRulers && state.calipers.active) {
            const caliperColor =
                state.settings.ecgBackground === 'paper'
                    ? 'rgba(15, 23, 42, 0.65)'
                    : 'rgba(248, 250, 252, 0.7)';

            const startX = Math.max(0, Math.min(width, state.calipers.startX));
            const endX = Math.max(0, Math.min(width, state.calipers.endX));
            ctx.strokeStyle = caliperColor;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX, height);
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, height);
            ctx.stroke();
        }
    };

    // -------------------------
    // Main animation loop
    // -------------------------
    const render = (timestamp) => {
        resizeCanvas();

        if (state.needsRegenerate) {
            refreshStrips();
        }

        if (state.monitorNeedsVisualRefresh) {
            // Visual settings changed (grid/background/trace style): refresh immediately
            refreshMonitorVisualsPreserveSweep();
            state.monitorNeedsVisualRefresh = false;
        }

        if (state.lastTimestamp === null) {
            state.lastTimestamp = timestamp;
        }

        const dt = state.paused ? 0 : (timestamp - state.lastTimestamp) / 1000;
        state.lastTimestamp = timestamp;

        const previousPlaybackTime = state.playbackTime;
        state.playbackTime += dt;

        if (!state.paused) {
            stepSweepAndProcess(dt, previousPlaybackTime);
        }

        renderMonitor();
        requestAnimationFrame(render);
    };

    // -------------------------
    // Layout sizing helpers (unchanged)
    // -------------------------
    const fixFrameSize = () => {
        if (!frame) return;
        if (frame.classList.contains('is-fullscreen')) {
            frame.style.removeProperty('--ecg-base-width');
            frame.style.removeProperty('--ecg-base-height');
            frame.style.removeProperty('--ecg-aspect-ratio');
            return;
        }
        const { widthCss, heightCss } = paperCssSize();
        const aspectRatio = widthCss / heightCss;
        frame.style.setProperty('--ecg-base-width', `${widthCss}px`);
        frame.style.setProperty('--ecg-base-height', `${heightCss}px`);
        frame.style.setProperty('--ecg-aspect-ratio', aspectRatio.toFixed(4));
        if (shell) {
            shell.style.setProperty('--ecg-width', `${widthCss}px`);
            shell.style.setProperty('--ecg-height', `${heightCss}px`);
        }
    };

    // -------------------------
    // Init + event wiring (mostly unchanged)
    // -------------------------
    applyOverlaySettings();
    setAudioMuted(false);
    setCalibrationVisible(false);
    updateCaliperUnitToggle();
    fixFrameSize();
    resizeCanvas();
    refreshStrips();
    requestAnimationFrame(render);

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    canvas.addEventListener('click', () => {
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        setPaused(!state.paused);
    });

    pauseToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        setPaused(!state.paused);
    });

    caliperUnitToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        state.calipers.unit = state.calipers.unit === 'ms' ? 's' : 'ms';
        updateCaliperUnitToggle();
        updateCaliperReadout();
    });

    canvas.addEventListener('pointerdown', (event) => {
        if (!state.paused || !state.settings.intervalRulers) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        state.calipers.active = false;
        state.calipers.dragMoved = false;
        state.calipers.dragging = true;
        state.calipers.startX = x;
        state.calipers.endX = x;
        updateCaliperReadout();
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!state.calipers.dragging) return;
        const rect = canvas.getBoundingClientRect();
        const nextX = event.clientX - rect.left;
        if (Math.abs(nextX - state.calipers.startX) > 2) {
            state.calipers.dragMoved = true;
            state.calipers.active = true;
        }
        state.calipers.endX = nextX;
        updateCaliperReadout();
    });

    canvas.addEventListener('pointerup', (event) => {
        if (!state.calipers.dragging) return;
        state.calipers.dragging = false;
        suppressClick = state.calipers.dragMoved;
        if (!state.calipers.dragMoved) {
            state.calipers.active = false;
        }
        updateCaliperReadout();
        canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointercancel', (event) => {
        if (!state.calipers.dragging) return;
        state.calipers.dragging = false;
        state.calipers.active = false;
        state.calipers.dragMoved = false;
        updateCaliperReadout();
        canvas.releasePointerCapture(event.pointerId);
    });

    window.addEventListener('edupace-ecg-settings', (event) => {
        state.settings = { ...state.settings, ...(event.detail ?? {}) };
        applyOverlaySettings();
        if (!state.settings.intervalRulers) {
            state.calipers.active = false;
        }
        updateCaliperReadout();
        state.needsRegenerate = true;
        // visuals will be refreshed via key in applyOverlaySettings
    });

    window.addEventListener('edupace-parameters', (event) => {
        const detail = event.detail ?? {};
        if (Number.isFinite(detail.rate)) state.params.rate = detail.rate;
        if (Number.isFinite(detail.output)) state.params.output = detail.output;
        if (Number.isFinite(detail.sensitivity)) state.params.sensitivity = detail.sensitivity;
        if (typeof detail.power === 'boolean') state.params.power = detail.power;
        if (typeof detail.asynchronous === 'boolean') state.params.asynchronous = detail.asynchronous;
        state.needsRegenerate = true;
    });

    window.addEventListener('edupace-scenario-change', (event) => {
        state.scenarioId = event.detail?.id ?? 'NSR';
        state.needsRegenerate = true;
    });

    calibrationToggle?.addEventListener('click', () => {
        if (!calibrationInline) return;
        const isHidden = calibrationInline.hasAttribute('hidden');
        setCalibrationVisible(isHidden);
    });

    audioToggle?.addEventListener('click', () => {
        setAudioMuted(!state.muted);
    });

    let isFullscreen = false;
    const setFullscreen = (nextValue) => {
        isFullscreen = Boolean(nextValue);
        if (frame) {
            frame.classList.toggle('is-fullscreen', isFullscreen);
        }
        document.body.classList.toggle('ecg-fullscreen-active', isFullscreen);
        if (fullscreenToggle) {
            fullscreenToggle.classList.toggle('is-active', isFullscreen);
            fullscreenToggle.setAttribute('aria-pressed', String(isFullscreen));
            fullscreenToggle.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Enter full screen');
        }
        fixFrameSize();
        resizeCanvas();
    };

    fullscreenToggle?.addEventListener('click', () => {
        setFullscreen(!isFullscreen);
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isFullscreen) {
            setFullscreen(false);
        }
    });
}

export { initEcgEngine };
