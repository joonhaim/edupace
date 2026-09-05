import { getSensitivityGuideAmplitude } from './ecgWaveformLibrary.js';
import { createEcgSimulation } from './ecgSimulation.js';
import { getTimelineSliceGeometry } from './ecgRenderGeometry.js';
import { createHeartRateEngine } from '../js/heartRateEngine.js';
import { applySettingsPatch, defaultSettings } from '../js/settingsPanel.js';

const ASYNC_SENSITIVITY_THRESHOLD = 20;
const DEFAULT_PARAMS = {
    rate: 70,
    output: 1.5,
    sensitivity: 2.0,
    power: false,
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
    const pausedBadge = frame?.querySelector('.ecg-paused-badge');
    const caliperReadout = frame?.querySelector('#caliperReadout');
    const calibrationToggle = frame?.querySelector('.calibration-toggle');
    const sensitivityGuideToggle = frame?.querySelector('.sensitivity-guide-toggle');
    const audioToggle = frame?.querySelector('.ecg-audio-toggle');
    const pauseToggle = frame?.querySelector('.pause-toggle');
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
        // sweep state
        sweepX: 0,
        prevSweepX: 0,
        lastTimestamp: null,
        playbackTime: 0,

        lastCanvasSize: { width: 0, height: 0 },
        muted: false,
        paused: false,

        // calipers
        calipers: {
            active: false,
            dragging: false,
            startX: 0,
            endX: 0,
            dragMoved: false
        },

        // monitor init/visual refresh flags
        monitorInitialized: false,
        monitorNeedsVisualRefresh: true, // build background/buffer at least once
        lastVisualKey: '',
        sessionActive: false
    };

    const getAsyncMode = () => {
        if (typeof state.params.asynchronous === 'boolean') {
            return state.params.asynchronous;
        }
        return state.params.sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
    };

    const getSimulationConfig = () => {
        const scenarioRates = state.settings.scenarioIntrinsicRates ?? {};
        const fallbackRate = Number(state.settings.intrinsicRate ?? 60);
        const scenarioRate = Number(scenarioRates[state.scenarioId]);
        const intrinsicRate = Number.isFinite(scenarioRate) ? scenarioRate : fallbackRate;

        return {
            scenarioId: state.scenarioId,
            intrinsicRate: Math.min(120, Math.max(30, intrinsicRate)),
            intrinsicRegularity: state.settings.intrinsicRegularity ?? 'regular',
            pacingRate: state.params.rate,
            output: state.params.output,
            sensitivity: state.params.sensitivity,
            power: state.params.power !== false,
            asynchronous: state.params.power !== false && getAsyncMode()
        };
    };

    const simulation = createEcgSimulation(getSimulationConfig());

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

        if (sensitivityGuideToggle) {
            const guideVisible = Boolean(state.settings.sensitivityGuide);
            sensitivityGuideToggle.classList.toggle('is-active', guideVisible);
            sensitivityGuideToggle.setAttribute('aria-pressed', String(guideVisible));
            sensitivityGuideToggle.setAttribute(
                'aria-label',
                guideVisible ? 'Hide sensitivity guide' : 'Show sensitivity guide'
            );
            sensitivityGuideToggle.setAttribute(
                'title',
                guideVisible ? 'Hide sensitivity guide' : 'Show sensitivity guide'
            );
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

    const setPaused = (paused, options = {}) => {
        state.paused = Boolean(paused);
        if (pausedBadge) {
            pausedBadge.toggleAttribute('hidden', !state.paused || !state.sessionActive);
        }
        if (caliperReadout) {
            caliperReadout.toggleAttribute('hidden', true);
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
        }
        if (!options.silent) {
            window.dispatchEvent(
                new CustomEvent('edupace-telemetry-pause', {
                    detail: { paused: state.paused }
                })
            );
        }
    };

    const setSessionActive = (active) => {
        state.sessionActive = Boolean(active);
        if (frame) {
            frame.classList.toggle('is-idle', !state.sessionActive);
        }
        if (!state.sessionActive) {
            setPaused(true, { silent: true });
            hrEngine.reset();
            hrEngine.setSuspended(true);
            state.playbackTime = 0;
            state.lastTimestamp = null;
            simulation.reset(getSimulationConfig());
            resetSweepAndBlankScreen();
        } else {
            hrEngine.setSuspended(false);
            setPaused(false, { silent: true });
            state.lastTimestamp = null;
        }

        if (pauseToggle) {
            pauseToggle.toggleAttribute('disabled', !state.sessionActive);
            pauseToggle.setAttribute('aria-disabled', String(!state.sessionActive));
        }
    };

    const setCalibrationVisible = (visible) => {
        if (calibrationInline) {
            calibrationInline.toggleAttribute('hidden', !visible);
            calibrationInline.classList.toggle('is-visible', visible);
        }
        if (calibrationToggle) {
            calibrationToggle.classList.toggle('is-active', visible);
            calibrationToggle.setAttribute('aria-pressed', String(visible));
            calibrationToggle.setAttribute('aria-label', visible ? 'Hide calibration details' : 'Show calibration details');
            calibrationToggle.setAttribute('title', visible ? 'Hide calibration details' : 'Show calibration details');
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

    const updateCaliperReadout = (forceHidden = false) => {
        if (!caliperReadout) return;
        if (forceHidden || !state.calipers.active || !state.settings.intervalRulers) {
            caliperReadout.toggleAttribute('hidden', true);
            return;
        }

        const width = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const deltaPx = Math.abs(state.calipers.endX - state.calipers.startX);
        const intervalSeconds = (deltaPx / width) * VIEW_SEC;
        const intervalMs = Math.max(0, Math.round(intervalSeconds * 1000));
        const ppmValue = intervalSeconds > 0 ? Math.round(60 / intervalSeconds) : 0;
        const ppmDisplay = intervalSeconds > 0 ? `${ppmValue}` : '--';
        caliperReadout.textContent = `${intervalMs} ms · ${ppmDisplay} ppm`;
        caliperReadout.toggleAttribute('hidden', false);
    };

    const paperCssSize = () => {
        const widthCss = (VIEW_SEC / SMALL_T) * PX_PER_SMALL_BOX;
        const heightCss = ((Y_MAX - Y_MIN) / SMALL_A) * PX_PER_SMALL_BOX * VERTICAL_SCALE;
        return { widthCss, heightCss };
    };

    const resizeCanvas = () => {
        if (!frame) return;
        // The canvas is absolutely positioned, so its bitmap follows the frame
        // without contributing its own dimensions back into the frame's layout.
        const width = Math.max(1, Math.floor(frame.clientWidth));
        const height = Math.max(1, Math.floor(frame.clientHeight));
        if (width === state.lastCanvasSize.width && height === state.lastCanvasSize.height) {
            return;
        }
        state.lastCanvasSize = { width, height };
        const D = dpr();
        canvas.width = Math.floor(width * D);
        canvas.height = Math.floor(height * D);
        ctx.setTransform(D, 0, 0, D, 0, 0);

        resizeMonitorOffscreenPreserveReveal();
    };

    // -------------------------
    // Background draw
    // -------------------------
    const drawPaperGridTo = (drawCtx, width, height) => {
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

    };

    const drawMonitorGridTo = (drawCtx, width, height) => {
        const density = state.settings.gridDensity ?? '2mm';
        const intensity = Math.max(0, Math.min(1, (state.settings.gridIntensity ?? 80) / 100));
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

    };

    const shouldRenderSensitivityGuide = () =>
        state.settings.sensitivityGuide && state.params.power !== false && Number.isFinite(state.params.sensitivity);

    const drawSensitivityGuideLine = (drawCtx, width, height) => {
        if (!shouldRenderSensitivityGuide()) return;
        const { rWaveAmplitudeMv } = simulation.getState();
        const guideAmplitude = getSensitivityGuideAmplitude(
            state.params.sensitivity, rWaveAmplitudeMv, state.scenarioId
        );
        const y = height - ((guideAmplitude - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * height;
        if (!Number.isFinite(y)) return;

        drawCtx.beginPath();
        if (state.settings.ecgBackground === 'paper') {
            drawCtx.strokeStyle = 'rgba(0, 0, 255, 1)';
            drawCtx.lineWidth = 1.5;
        } else {
            const intensity = Math.max(0, Math.min(1, (state.settings.gridIntensity ?? 80) / 100));
            drawCtx.strokeStyle = `rgba(125, 211, 252, ${0.6 * intensity + 0.2})`;
            drawCtx.lineWidth = 1.2;
        }
        drawCtx.moveTo(0, y);
        drawCtx.lineTo(width, y);
        drawCtx.stroke();
    };

    const flashLed = (kind) => {
        if (state.params.power === false) return;
        const led = kind === 'pace' ? paceLed : senseLed;
        if (!led) return;
        led.classList.add('led-on');
        setTimeout(() => {
            led.classList.remove('led-on');
        }, 180);

        const hardware = window.edupaceHardware;
        if (hardware?.sendLedCommand) {
            hardware.sendLedCommand(kind === 'pace' ? 'PACE' : 'SENSE');
        }

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

    // -------------------------
    // Rolling monitor screen
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
            drawPaperGridTo(drawCtx, w, h);
        } else {
            drawMonitorGridTo(drawCtx, w, h);
        }
    };

    const rebuildMonitorBuffer = () => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;
        setCanvasSize(monitorBuffer, w, h);
        drawBackgroundTo(monitorBufferCtx, w, h);
    };

    const initMonitorScreenBlank = () => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;

        setCanvasSize(monitorScreen, w, h);
        drawBackgroundTo(monitorScreenCtx, w, h);
    };

    const copyBackgroundSlice = (x0, x1) => {
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

    const drawTimelineSlice = (x0, x1, startTime, endTime, joinFromPrevious = false) => {
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        const h = canvas.clientHeight || state.lastCanvasSize.height || 1;
        const geometry = getTimelineSliceGeometry({
            x0,
            x1,
            startTime,
            endTime,
            width: w,
            joinFromPrevious
        });
        if (!geometry) return;

        const {
            paintX0,
            paintStartTime,
            secondsPerPixel,
            startCol,
            endCol,
            anchorCol
        } = geometry;
        copyBackgroundSlice(startCol, endCol);

        const { traceColor, traceWeight } = getTraceStyle();
        const timeAtX = (x) => paintStartTime + (x - paintX0) * secondsPerPixel;

        monitorScreenCtx.save();
        monitorScreenCtx.beginPath();
        monitorScreenCtx.rect(startCol, 0, Math.max(1, endCol - startCol), h);
        monitorScreenCtx.clip();
        monitorScreenCtx.beginPath();
        monitorScreenCtx.strokeStyle = traceColor;
        monitorScreenCtx.lineWidth = traceWeight;
        monitorScreenCtx.lineJoin = 'round';
        monitorScreenCtx.lineCap = 'round';

        let started = false;
        if (anchorCol !== null) {
            const anchorStart = timeAtX(anchorCol);
            const anchorEnd = timeAtX(anchorCol + 1);
            const anchorValue = simulation.sampleRange(anchorStart, anchorEnd);
            const anchorY = h - ((anchorValue - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * h;
            monitorScreenCtx.moveTo(anchorCol, anchorY);
            started = true;
        }
        for (let col = startCol; col <= endCol; col += 1) {
            const sampleStart = timeAtX(Math.max(paintX0, col));
            const sampleEnd = timeAtX(Math.min(x1, col + 1));
            const value = simulation.sampleRange(sampleStart, Math.max(sampleStart, sampleEnd));
            const y = h - ((value - R_Y_MIN) / (R_Y_MAX - R_Y_MIN)) * h;
            if (!started) {
                monitorScreenCtx.moveTo(col, y);
                started = true;
            } else {
                monitorScreenCtx.lineTo(col, y);
            }
        }
        monitorScreenCtx.stroke();
        monitorScreenCtx.restore();
    };

    const resetSweepAndBlankScreen = () => {
        state.sweepX = 0;
        state.prevSweepX = 0;
        state.lastTimestamp = null;
        initMonitorScreenBlank();
        state.monitorInitialized = true;
    };

    const redrawMonitorScreen = () => {
        rebuildMonitorBuffer();
        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        initMonitorScreenBlank();

        const cycleStart = Math.floor(state.playbackTime / VIEW_SEC) * VIEW_SEC;
        const cycleOffset = state.playbackTime - cycleStart;
        state.sweepX = (cycleOffset / VIEW_SEC) * w;

        if (cycleStart >= VIEW_SEC) {
            drawTimelineSlice(
                state.sweepX,
                w,
                state.playbackTime - VIEW_SEC,
                cycleStart
            );
        }
        if (cycleOffset > 0) {
            drawTimelineSlice(0, state.sweepX, cycleStart, state.playbackTime);
        }

        state.monitorInitialized = true;
    };

    const resizeMonitorOffscreenPreserveReveal = () => {
        redrawMonitorScreen();
    };

    const stepSweepAndProcess = (previousPlaybackTime) => {
        const emittedEvents = simulation.advanceTo(state.playbackTime);
        emittedEvents.forEach((event) => {
            if (event.kind === 'pace' || event.kind === 'sense') flashLed(event.kind);
            if (event.kind === 'ventricular') hrEngine.recordVentricularEvent(event.time);
        });
        hrEngine.advanceTime(state.playbackTime);

        const w = canvas.clientWidth || state.lastCanvasSize.width || 1;
        state.prevSweepX = state.sweepX;

        if (state.playbackTime - previousPlaybackTime >= VIEW_SEC) {
            redrawMonitorScreen();
            return;
        }

        let cursor = previousPlaybackTime;
        while (cursor < state.playbackTime - 1e-9) {
            const nextBoundary = (Math.floor(cursor / VIEW_SEC) + 1) * VIEW_SEC;
            const segmentEnd = Math.min(state.playbackTime, nextBoundary);
            const x0 = ((cursor % VIEW_SEC) / VIEW_SEC) * w;
            const x1 = segmentEnd === nextBoundary
                ? w
                : ((segmentEnd % VIEW_SEC) / VIEW_SEC) * w;
            drawTimelineSlice(x0, x1, cursor, segmentEnd, x0 > 0);
            cursor = segmentEnd;
        }

        state.sweepX = ((state.playbackTime % VIEW_SEC) / VIEW_SEC) * w;
    };

    const refreshMonitorVisualsPreserveSweep = () => {
        redrawMonitorScreen();
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

        drawSensitivityGuideLine(ctx, width, height);

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
            if (state.calipers.active || state.calipers.dragging || state.calipers.dragMoved) {
                state.calipers.active = false;
                state.calipers.dragging = false;
                state.calipers.dragMoved = false;
                updateCaliperReadout(true);
            }
            stepSweepAndProcess(previousPlaybackTime);
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
    fixFrameSize();
    resizeCanvas();
    setSessionActive(false);
    requestAnimationFrame(render);

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    canvas.addEventListener('click', () => {
        if (!state.sessionActive) return;
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        setPaused(!state.paused);
    });

    pauseToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!state.sessionActive) return;
        setPaused(!state.paused);
    });

    canvas.addEventListener('pointerdown', (event) => {
        if (!state.sessionActive || !state.paused || !state.settings.intervalRulers) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        state.calipers.active = false;
        state.calipers.dragMoved = false;
        state.calipers.dragging = true;
        state.calipers.startX = x;
        state.calipers.endX = x;
        updateCaliperReadout(true);
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!state.sessionActive || !state.calipers.dragging) return;
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
        if (!state.sessionActive || !state.calipers.dragging) return;
        state.calipers.dragging = false;
        suppressClick = state.calipers.dragMoved;
        if (!state.calipers.dragMoved) {
            state.calipers.active = false;
        }
        updateCaliperReadout();
        canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointercancel', (event) => {
        if (!state.sessionActive || !state.calipers.dragging) return;
        state.calipers.dragging = false;
        state.calipers.active = false;
        state.calipers.dragMoved = false;
        updateCaliperReadout(true);
        canvas.releasePointerCapture(event.pointerId);
    });

    window.addEventListener('edupace-ecg-settings', (event) => {
        state.settings = { ...state.settings, ...(event.detail ?? {}) };
        applyOverlaySettings();
        if (!state.settings.intervalRulers) {
            state.calipers.active = false;
            updateCaliperReadout(true);
        }
        simulation.updateConfig(getSimulationConfig(), state.playbackTime);
        // visuals will be refreshed via key in applyOverlaySettings
    });

    window.addEventListener('edupace-parameters', (event) => {
        const detail = event.detail ?? {};
        if (Number.isFinite(detail.rate)) state.params.rate = detail.rate;
        if (Number.isFinite(detail.output)) state.params.output = detail.output;
        if (Number.isFinite(detail.sensitivity)) state.params.sensitivity = detail.sensitivity;
        if (typeof detail.power === 'boolean') state.params.power = detail.power;
        if (typeof detail.asynchronous === 'boolean') state.params.asynchronous = detail.asynchronous;
        simulation.updateConfig(getSimulationConfig(), state.playbackTime);
    });

    window.addEventListener('edupace-scenario-change', (event) => {
        state.scenarioId = event.detail?.id ?? 'NSR';
        simulation.updateConfig(getSimulationConfig(), state.playbackTime);
    });

    window.addEventListener('edupace-session-status', (event) => {
        const status = event.detail?.status ?? 'idle';
        if (status === 'running') {
            setSessionActive(true);
            return;
        }
        if (status === 'paused') {
            setSessionActive(true);
            setPaused(true, { silent: true });
            return;
        }
        setSessionActive(false);
    });

    calibrationToggle?.addEventListener('click', () => {
        if (!calibrationInline) return;
        setCalibrationVisible(!calibrationInline.classList.contains('is-visible'));
    });

    sensitivityGuideToggle?.addEventListener('click', () => {
        applySettingsPatch({ sensitivityGuide: !state.settings.sensitivityGuide });
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
